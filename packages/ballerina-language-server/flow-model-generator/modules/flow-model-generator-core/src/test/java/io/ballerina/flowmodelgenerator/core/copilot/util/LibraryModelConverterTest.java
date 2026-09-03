/*
 *  Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com)
 *
 *  WSO2 LLC. licenses this file to you under the Apache License,
 *  Version 2.0 (the "License"); you may not use this file except
 *  in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing,
 *  software distributed under the License is distributed on an
 *  "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 *  KIND, either express or implied.  See the License for the
 *  specific language governing permissions and limitations
 *  under the License.
 */

package io.ballerina.flowmodelgenerator.core.copilot.util;

import io.ballerina.flowmodelgenerator.core.copilot.model.LibraryFunction;
import io.ballerina.flowmodelgenerator.core.copilot.model.PathElement;
import io.ballerina.flowmodelgenerator.core.copilot.model.PathSegment;
import io.ballerina.flowmodelgenerator.core.copilot.model.StringPath;
import io.ballerina.modelgenerator.commons.FunctionData;
import io.ballerina.modelgenerator.commons.ParameterData;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Tests {@link LibraryModelConverter#simplifyTypeSignature}, which rewrites the fully-qualified type
 * references the compiler emits inside a signature into the form a Ballerina source file would use.
 * The inputs below are real signatures captured from {@code ballerinax/kafka} and {@code ballerina/sql}.
 *
 * @since 1.7.0
 */
public class LibraryModelConverterTest {

    private static final String ORG = "ballerinax";
    private static final String PKG = "kafka";

    @Test
    public void testSameLibraryReferenceRendersBare() {
        Assert.assertEquals(
                LibraryModelConverter.simplifyTypeSignature("ballerinax/kafka:4.6.5:error", ORG, PKG),
                "error");
        Assert.assertEquals(
                LibraryModelConverter.simplifyTypeSignature("ballerinax/kafka:4.6.5:TopicPartition", ORG, PKG),
                "TopicPartition");
    }

    @Test
    public void testForeignLibraryReferenceKeepsModulePrefix() {
        Assert.assertEquals(
                LibraryModelConverter.simplifyTypeSignature("ballerina/sql:1.15.0:Error", ORG, PKG),
                "sql:Error");
        // A different package in the same organization is still foreign.
        Assert.assertEquals(
                LibraryModelConverter.simplifyTypeSignature("ballerinax/rabbitmq:3.1.0:Message", ORG, PKG),
                "rabbitmq:Message");
    }

    @Test
    public void testDottedModuleUsesLastSegmentAsAlias() {
        // Ballerina's default import alias for `ballerina/lang.value` is `value`.
        Assert.assertEquals(
                LibraryModelConverter.simplifyTypeSignature("ballerina/lang.value:0.0.0:Cloneable", ORG, PKG),
                "value:Cloneable");
        Assert.assertEquals(
                LibraryModelConverter.simplifyTypeSignature(
                        "ballerinax/trigger.google.calendar:1.0.0:Event", ORG, PKG),
                "calendar:Event");
    }

    @Test
    public void testTupleSignatureRewritesEveryElement() {
        Assert.assertEquals(
                LibraryModelConverter.simplifyTypeSignature(
                        "[ballerinax/kafka:4.6.5:TopicPartition, int]", ORG, PKG),
                "[TopicPartition, int]");
        Assert.assertEquals(
                LibraryModelConverter.simplifyTypeSignature(
                        "[ballerinax/kafka:4.6.5:TopicPartition, ballerinax/kafka:4.6.5:OffsetAndTimestamp?]",
                        ORG, PKG),
                "[TopicPartition, OffsetAndTimestamp?]");
    }

    @Test
    public void testNestedErrorDetailRewritesInPlace() {
        Assert.assertEquals(
                LibraryModelConverter.simplifyTypeSignature(
                        "ballerinax/kafka:4.6.5:error<record {|ballerinax/kafka:4.6.5:TopicPartition partition; "
                                + "int offset;|}>", ORG, PKG),
                "error<record {|TopicPartition partition; int offset;|}>");
    }

    @Test
    public void testMixedSameAndForeignReferences() {
        Assert.assertEquals(
                LibraryModelConverter.simplifyTypeSignature(
                        "map<ballerinax/kafka:4.6.5:TopicPartition|ballerina/sql:1.15.0:Error>", ORG, PKG),
                "map<TopicPartition|sql:Error>");
    }

    @Test
    public void testSignatureWithoutQualifiedReferencesIsUnchanged() {
        Assert.assertEquals(LibraryModelConverter.simplifyTypeSignature("error", ORG, PKG), "error");
        Assert.assertEquals(LibraryModelConverter.simplifyTypeSignature("[string, int]", ORG, PKG),
                "[string, int]");
        Assert.assertEquals(LibraryModelConverter.simplifyTypeSignature("map<byte[]>", ORG, PKG),
                "map<byte[]>");
    }

    @Test
    public void testNullAndEmptyPassThrough() {
        Assert.assertNull(LibraryModelConverter.simplifyTypeSignature(null, ORG, PKG));
        Assert.assertEquals(LibraryModelConverter.simplifyTypeSignature("", ORG, PKG), "");
    }

    /**
     * The version segment is optional but must still start with a digit, so a non-numeric segment is
     * never swallowed as one. Here {@code alpha} is left in place while the {@code org/module}
     * prefix is still rewritten — the module reference is real either way, and only the segment that
     * cannot be a version survives.
     */
    @Test
    public void testNonNumericSegmentIsNotConsumedAsAVersion() {
        Assert.assertEquals(
                LibraryModelConverter.simplifyTypeSignature("ballerina/lang.value:alpha:Cloneable", ORG, PKG),
                "value:alpha:Cloneable");
        // The same input from the library being rendered loses only its own prefix.
        Assert.assertEquals(
                LibraryModelConverter.simplifyTypeSignature("ballerinax/kafka:alpha:Cloneable", ORG, PKG),
                "alpha:Cloneable");
    }

    /**
     * A signature carrying no module reference at all must be untouched, whatever punctuation it
     * contains — a singleton string type is the case most at risk from a looser prefix pattern.
     */
    @Test
    public void testSignaturesWithoutAModuleReferenceAreUntouched() {
        for (String signature : new String[]{
                "\"application/json\"", "\"text/csv\"", "\"https://example.com/a/b\"",
                "map<string>", "[int, string]", "stream<record {|int i;|}, error?>"}) {
            Assert.assertEquals(LibraryModelConverter.simplifyTypeSignature(signature, ORG, PKG), signature,
                    "Must not rewrite: " + signature);
        }
    }

    /**
     * Some symbol paths emit a reference with no version segment at all — notably a class's own type
     * as reported for a constructor's return. Both shapes must rewrite identically.
     */
    @Test
    public void testVersionLessReferenceIsRewritten() {
        Assert.assertEquals(
                LibraryModelConverter.simplifyTypeSignature("ballerinax/kafka:CursorOutParameter", ORG, PKG),
                "CursorOutParameter");
        Assert.assertEquals(
                LibraryModelConverter.simplifyTypeSignature("ballerina/sql:Error", ORG, PKG),
                "sql:Error");
        Assert.assertEquals(
                LibraryModelConverter.simplifyTypeSignature("ballerina/lang.value:Cloneable", ORG, PKG),
                "value:Cloneable");
    }

    @Test
    public void testVersionedAndVersionLessMixInOneSignature() {
        Assert.assertEquals(
                LibraryModelConverter.simplifyTypeSignature(
                        "map<ballerinax/kafka:4.6.5:TopicPartition|ballerina/sql:Error>", ORG, PKG),
                "map<TopicPartition|sql:Error>");
    }

    @Test
    public void testVersionLessTupleAndErrorDetail() {
        Assert.assertEquals(
                LibraryModelConverter.simplifyTypeSignature(
                        "[ballerinax/kafka:TopicPartition, ballerina/sql:Error?]", ORG, PKG),
                "[TopicPartition, sql:Error?]");
    }

    @Test
    public void testPrereleaseAndBuildVersionsAreHandled() {
        Assert.assertEquals(
                LibraryModelConverter.simplifyTypeSignature("ballerinax/kafka:4.6.5-SNAPSHOT:Error", ORG, PKG),
                "Error");
        Assert.assertEquals(
                LibraryModelConverter.simplifyTypeSignature("ballerina/sql:1.0.0+build.1:Error", ORG, PKG),
                "sql:Error");
    }

    // ---- upstream: path-parameter type recovery in functionDataToModel ----------------------

    private static FunctionData resourceFunction(String accessor, String resourcePath,
                                                 Map<String, ParameterData> params) {
        FunctionData fd = new FunctionData(
                0, accessor, "", null,
                "github", "github", "ballerinax", "1.0.0",
                resourcePath,
                FunctionData.Kind.RESOURCE,
                false, false, null);
        fd.setParameters(params);
        return fd;
    }

    private static ParameterData pathParam(String name, String type) {
        return ParameterData.from(name, type, ParameterData.Kind.PATH_PARAM, null, null, false);
    }

    private static PathSegment segmentAt(LibraryFunction fn, int index) {
        List<PathElement> paths = fn.getPaths();
        Assert.assertNotNull(paths, "paths list should be non-null");
        PathElement element = paths.get(index);
        Assert.assertTrue(element instanceof PathSegment,
                "expected PathSegment at index " + index + ", got " + element.getClass().getSimpleName());
        return (PathSegment) element;
    }

    @Test(description = "Single int path-param: type is recovered from parameters() map, not defaulted to string.")
    public void testIntPathParamTypeRecovered() {
        Map<String, ParameterData> params = new LinkedHashMap<>();
        params.put("deliveryId", pathParam("deliveryId", "int"));

        LibraryFunction fn = LibraryModelConverter.functionDataToModel(
                resourceFunction("get", "get /app/hook/deliveries/[deliveryId]", params),
                null, null);

        List<PathElement> paths = fn.getPaths();
        Assert.assertEquals(paths.size(), 4);
        PathSegment seg = segmentAt(fn, 3);
        Assert.assertEquals(seg.getName(), "deliveryId");
        Assert.assertEquals(seg.getType(), "int",
                "path-param type must come from ParameterData, not default to string");
    }

    @Test(description = "Mixed string + custom-type path-params each get their real type.")
    public void testMixedPathParamTypes() {
        Map<String, ParameterData> params = new LinkedHashMap<>();
        params.put("owner", pathParam("owner", "string"));
        params.put("repo", pathParam("repo", "string"));
        params.put("alertNumber", pathParam("alertNumber", "AlertNumber"));

        LibraryFunction fn = LibraryModelConverter.functionDataToModel(
                resourceFunction("get",
                        "get /repos/[owner]/[repo]/code-scanning/alerts/[alertNumber]", params),
                null, null);

        List<PathElement> paths = fn.getPaths();
        Assert.assertEquals(paths.size(), 6);

        Assert.assertTrue(paths.get(0) instanceof StringPath);
        PathSegment ownerSeg = segmentAt(fn, 1);
        PathSegment repoSeg = segmentAt(fn, 2);
        PathSegment alertSeg = segmentAt(fn, 5);

        Assert.assertEquals(ownerSeg.getType(), "string");
        Assert.assertEquals(repoSeg.getType(), "string");
        Assert.assertEquals(alertSeg.getType(), "AlertNumber",
                "named-type path params must round-trip, not collapse to 'string'");
    }

    @Test(description = "Union-typed path-param (e.g. enum-like literal union) survives conversion.")
    public void testUnionPathParamType() {
        String unionType = "\"npm\"|\"maven\"|\"rubygems\"|\"docker\"|\"nuget\"|\"container\"";
        Map<String, ParameterData> params = new LinkedHashMap<>();
        params.put("org", pathParam("org", "string"));
        params.put("packageType", pathParam("packageType", unionType));
        params.put("packageName", pathParam("packageName", "string"));

        LibraryFunction fn = LibraryModelConverter.functionDataToModel(
                resourceFunction("get",
                        "get /orgs/[org]/packages/[packageType]/[packageName]", params),
                null, null);

        PathSegment pkgTypeSeg = segmentAt(fn, 3);
        Assert.assertEquals(pkgTypeSeg.getName(), "packageType");
        Assert.assertEquals(pkgTypeSeg.getType(), unionType);
    }

    @Test(description = "Fallback to \"string\" when the parameters() map is null (defensive).")
    public void testFallbackWhenParametersMissing() {
        LibraryFunction fn = LibraryModelConverter.functionDataToModel(
                resourceFunction("get", "get /repos/[owner]", null),
                null, null);

        PathSegment seg = segmentAt(fn, 1);
        Assert.assertEquals(seg.getName(), "owner");
        Assert.assertEquals(seg.getType(), "string");
    }

    @Test(description = "Non-PATH_PARAM entries in parameters() must not be picked up as path-param types.")
    public void testNonPathParamEntryIgnored() {
        Map<String, ParameterData> params = new LinkedHashMap<>();
        params.put("id", ParameterData.from("id", "int", ParameterData.Kind.REQUIRED, null, null, false));

        LibraryFunction fn = LibraryModelConverter.functionDataToModel(
                resourceFunction("get", "get /items/[id]", params),
                null, null);

        PathSegment seg = segmentAt(fn, 1);
        Assert.assertEquals(seg.getType(), "string",
                "non-PATH_PARAM entries must not leak their type into PathSegment");
    }
}
