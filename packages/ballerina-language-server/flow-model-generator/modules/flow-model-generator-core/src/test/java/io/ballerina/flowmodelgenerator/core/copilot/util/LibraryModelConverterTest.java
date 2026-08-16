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
 * Tests for {@link LibraryModelConverter#functionDataToModel}, focused on path-parameter types.
 *
 * @since 1.7.0
 */
public class LibraryModelConverterTest {

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
