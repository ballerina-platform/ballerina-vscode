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

package io.ballerina.servicemodelgenerator.extension.validation;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import org.eclipse.lsp4j.jsonrpc.json.MessageJsonHandler;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.util.Map;

/**
 * The client compares {@code severity} against {@code "ERROR"}/{@code "WARNING"}. lsp4j's Gson writes
 * enums by ordinal unless told otherwise, which made every save-time refusal look like a success.
 */
public class ValidationResultSerializationTest {

    private static final Gson LSP_GSON = new MessageJsonHandler(Map.of()).getGson();

    @Test
    public void testSeveritySerializesByNameThroughLsp4jGson() {
        ValidationResult error = new ValidationResult("designApproach.choices.1.serviceTypeName",
                OpenApiServiceTypeNameValidator.RULE, "conflict", ValidationSeverity.ERROR);
        ValidationResult warning = new ValidationResult("name", "rule", "warn", ValidationSeverity.WARNING);

        Assert.assertEquals(LSP_GSON.toJsonTree(error).getAsJsonObject().get("severity").getAsString(), "ERROR");
        Assert.assertEquals(LSP_GSON.toJsonTree(warning).getAsJsonObject().get("severity").getAsString(),
                "WARNING");
    }

    @Test
    public void testSeverityRoundTripsThroughLsp4jGson() {
        JsonObject json = new JsonObject();
        json.addProperty("propertyPath", "name");
        json.addProperty("rule", "rule");
        json.addProperty("message", "warn");
        json.addProperty("severity", "WARNING");

        ValidationResult result = LSP_GSON.fromJson(json, ValidationResult.class);

        Assert.assertEquals(result.severity(), ValidationSeverity.WARNING);
    }
}
