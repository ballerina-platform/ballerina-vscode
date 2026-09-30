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
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

package io.ballerina.servicemodelgenerator.extension.connector;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import io.ballerina.modelgenerator.commons.trigger.LibraryMetadataReader.MetadataStatus;
import io.ballerina.servicemodelgenerator.extension.model.response.ModelResolutionError;
import io.ballerina.servicemodelgenerator.extension.model.response.ModelResolutionIssue;
import io.ballerina.servicemodelgenerator.extension.model.response.ServiceFromSourceResponse;
import io.ballerina.servicemodelgenerator.extension.model.response.ServiceInitModelResponse;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.util.Arrays;
import java.util.Optional;

/**
 * Tests how a failed service model resolution is explained to the client: the reason chosen from an
 * inspected connector package, and how that reason travels on the service model responses.
 */
public class ModelResolutionErrorTest {

    private static final MetadataStatus UNRESOLVED = new MetadataStatus(false, false, false, false, false);
    private static final MetadataStatus NO_METADATA = new MetadataStatus(true, false, false, false, false);
    private static final MetadataStatus INVALID_METADATA = new MetadataStatus(true, true, false, false, false);
    private static final MetadataStatus VALID_METADATA = new MetadataStatus(true, true, true, false, true);

    @Test
    public void testUnresolvedPackageIsReportedBeforeAnythingElse() {
        ModelResolutionError error = resolutionError(UNRESOLVED, true).orElseThrow();

        Assert.assertEquals(error.code(), ModelResolutionError.PACKAGE_NOT_RESOLVED);
        Assert.assertEquals(error.message(), "The package ballerinax/kafka could not be resolved.");
        Assert.assertEquals(error.orgName(), "ballerinax");
        Assert.assertEquals(error.packageName(), "kafka");
        Assert.assertEquals(error.moduleName(), "kafka");
    }

    @Test
    public void testMissingTriggerMetadataIsReported() {
        Assert.assertEquals(resolutionError(NO_METADATA, true).orElseThrow().code(),
                ModelResolutionError.TRIGGER_METADATA_NOT_FOUND);
    }

    @Test
    public void testInvalidTriggerMetadataIsReported() {
        Assert.assertEquals(resolutionError(INVALID_METADATA, true).orElseThrow().code(),
                ModelResolutionError.TRIGGER_METADATA_INVALID);
    }

    @Test
    public void testValidMetadataThatBuildsNoModelIsReported() {
        Assert.assertEquals(resolutionError(VALID_METADATA, false).orElseThrow().code(),
                ModelResolutionError.SERVICE_NOT_FOUND);
    }

    @Test
    public void testValidMetadataThatBuildsAModelIsNotAnError() {
        Assert.assertTrue(resolutionError(VALID_METADATA, true).isEmpty());
    }

    @Test
    public void testModelIsNotBuiltWhenThePackageAlreadyExplainsTheFailure() {
        Optional<ModelResolutionError> error = TriggerModelReader.resolutionError(UNRESOLVED, () -> {
            throw new AssertionError("the model must not be built for an unresolved package");
        }, "ballerinax", "kafka", "kafka");

        Assert.assertTrue(error.isPresent());
    }

    @Test
    public void testDedicatedAndUnnamedModulesAreNotExplained() {
        TriggerModelReader reader = TriggerModelReader.getInstance();

        Assert.assertTrue(reader.getSchemaDrivenResolutionError("ballerina", "http", "http", null, false).isEmpty());
        Assert.assertTrue(reader.getSchemaDrivenResolutionError("ballerina", "http", null, null, false).isEmpty());
    }

    @Test
    public void testUnresolvablePackageIsExplained() {
        Optional<ModelResolutionError> error = TriggerModelReader.getInstance().getSchemaDrivenResolutionError(
                "no-such-org", "no-such-package", "no-such-package", null, false);

        Assert.assertEquals(error.orElseThrow().code(), ModelResolutionError.PACKAGE_NOT_RESOLVED);
    }

    @Test
    public void testExceptionCarriesTheError() {
        ModelResolutionError error = serviceNotFound();
        ModelResolutionException exception = new ModelResolutionException(error);

        Assert.assertSame(exception.error(), error);
        Assert.assertEquals(exception.getMessage(), error.message());
    }

    @Test
    public void testExplainedFailureReportsTheStackTraceOfItsCause() {
        IllegalStateException cause = new IllegalStateException("builder bug");
        ModelResolutionException explained = new ModelResolutionException(serviceNotFound(), cause);

        Assert.assertSame(explained.getCause(), cause);
        Assert.assertEquals(ModelResolutionException.originStackTrace(explained), cause.getStackTrace());
        Assert.assertEquals(new ServiceInitModelResponse(explained).getStackTrace(),
                Arrays.toString(cause.getStackTrace()));
        Assert.assertEquals(new ServiceFromSourceResponse(explained).stacktrace(),
                Arrays.toString(cause.getStackTrace()));
    }

    @Test
    public void testFailureWithoutACauseReportsItsOwnStackTrace() {
        ModelResolutionException unexplained = new ModelResolutionException(serviceNotFound());
        IllegalStateException plain = new IllegalStateException("boom", new RuntimeException("inner"));

        Assert.assertEquals(ModelResolutionException.originStackTrace(unexplained), unexplained.getStackTrace());
        Assert.assertEquals(ModelResolutionException.originStackTrace(plain), plain.getStackTrace());
    }

    @Test
    public void testServiceInitModelResponseKeepsTheResolutionError() {
        ModelResolutionError error = serviceNotFound();
        ServiceInitModelResponse response = new ServiceInitModelResponse(new ModelResolutionException(error));

        Assert.assertSame(response.resolutionError(), error);
        Assert.assertEquals(response.errorMsg(), error.message());
        Assert.assertNotNull(response.getStackTrace());
        Assert.assertNull(response.getServiceInitModel());
        Assert.assertNull(response.issue());
    }

    @Test
    public void testServiceInitModelResponseForAnUnexplainedFailure() {
        ServiceInitModelResponse response = new ServiceInitModelResponse(new IllegalStateException("boom"));

        Assert.assertEquals(response.errorMsg(), "boom");
        Assert.assertNull(response.resolutionError());
    }

    @Test
    public void testServiceInitModelResponseForAnIssue() {
        ModelResolutionIssue issue = new ModelResolutionIssue(ModelResolutionIssue.UNSUPPORTED_CONNECTOR_VERSION,
                "ballerinax", "kafka", "1.0.0", "2.0.0");
        ServiceInitModelResponse response = new ServiceInitModelResponse(issue);

        Assert.assertSame(response.issue(), issue);
        Assert.assertNull(response.errorMsg());
        Assert.assertNull(response.resolutionError());
    }

    @Test
    public void testServiceFromSourceResponseForAResolutionError() {
        ModelResolutionError error = serviceNotFound();
        ServiceFromSourceResponse response = new ServiceFromSourceResponse(error);

        Assert.assertSame(response.resolutionError(), error);
        Assert.assertNull(response.service());
        Assert.assertNull(response.errorMsg());
    }

    @Test
    public void testServiceFromSourceResponseForAThrowable() {
        ModelResolutionError error = serviceNotFound();
        ServiceFromSourceResponse explained = new ServiceFromSourceResponse(new ModelResolutionException(error));
        ServiceFromSourceResponse unexplained = new ServiceFromSourceResponse(new IllegalStateException("boom"));

        Assert.assertSame(explained.resolutionError(), error);
        Assert.assertNotNull(explained.errorMsg());
        Assert.assertNotNull(explained.stacktrace());
        Assert.assertNull(unexplained.resolutionError());
        Assert.assertEquals(unexplained.errorMsg(), "java.lang.IllegalStateException: boom");
    }

    @Test
    public void testServiceFromSourceResponseDefaults() {
        ServiceFromSourceResponse empty = new ServiceFromSourceResponse();
        Assert.assertNull(empty.service());
        Assert.assertNull(empty.errorMsg());
        Assert.assertNull(empty.resolutionError());
    }

    // ---- string-literal attach point --------------------------------------------------------

    @Test
    public void testStringLiteralAttachPointIsRetypedFromServicePath() {
        JsonObject field = stringLiteralField("STRING_LITERAL");
        field.getAsJsonArray("types").add("not-an-object");
        JsonObject other = new JsonObject();
        other.addProperty("fieldType", "EXPRESSION");
        field.getAsJsonArray("types").add(other);

        TriggerUIMetadataCompiler.normalizeStringLiteralWidget(field);

        JsonArray types = field.getAsJsonArray("types");
        Assert.assertEquals(types.get(0).getAsJsonObject().get("fieldType").getAsString(), "STRING_LITERAL");
        Assert.assertEquals(types.get(1).getAsString(), "not-an-object");
        Assert.assertEquals(types.get(2).getAsJsonObject().get("fieldType").getAsString(), "EXPRESSION");
    }

    @Test
    public void testOtherAttachPointsKeepTheirWidget() {
        JsonObject basePath = stringLiteralField("SERVICE_PATH");
        TriggerUIMetadataCompiler.normalizeStringLiteralWidget(basePath);
        Assert.assertEquals(fieldType(basePath), "SERVICE_PATH");

        JsonObject noCodedata = stringLiteralField("STRING_LITERAL");
        noCodedata.remove("codedata");
        TriggerUIMetadataCompiler.normalizeStringLiteralWidget(noCodedata);
        Assert.assertEquals(fieldType(noCodedata), "SERVICE_PATH");

        JsonObject noTypes = stringLiteralField("STRING_LITERAL");
        noTypes.remove("types");
        TriggerUIMetadataCompiler.normalizeStringLiteralWidget(noTypes);
        Assert.assertFalse(noTypes.has("types"));
    }

    private static Optional<ModelResolutionError> resolutionError(MetadataStatus status, boolean hasModel) {
        return TriggerModelReader.resolutionError(status, () -> hasModel, "ballerinax", "kafka", "kafka");
    }

    private static ModelResolutionError serviceNotFound() {
        return new ModelResolutionError(ModelResolutionError.SERVICE_NOT_FOUND,
                "No service was found at the selected source range.", "ballerinax", "kafka", "kafka");
    }

    private static JsonObject stringLiteralField(String codedataType) {
        JsonObject codedata = new JsonObject();
        codedata.addProperty("type", codedataType);
        JsonObject type = new JsonObject();
        type.addProperty("fieldType", "SERVICE_PATH");
        JsonArray types = new JsonArray();
        types.add(type);
        JsonObject field = new JsonObject();
        field.add("codedata", codedata);
        field.add("types", types);
        return field;
    }

    private static String fieldType(JsonObject field) {
        return field.getAsJsonArray("types").get(0).getAsJsonObject().get("fieldType").getAsString();
    }
}
