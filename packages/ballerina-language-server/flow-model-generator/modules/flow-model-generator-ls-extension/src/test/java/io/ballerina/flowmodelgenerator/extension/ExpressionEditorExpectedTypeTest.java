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

package io.ballerina.flowmodelgenerator.extension;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import io.ballerina.flowmodelgenerator.core.expressioneditor.ExpressionEditorContext;
import io.ballerina.flowmodelgenerator.extension.request.ExpressionEditorDiagnosticsRequest;
import io.ballerina.modelgenerator.commons.AbstractLSTest;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

/**
 * Tests for the expected type description, using the diagnostics configs whose fields have a named type.
 *
 * @since 1.0.0
 */
public class ExpressionEditorExpectedTypeTest extends AbstractLSTest {

    // Config file to the text the description must contain.
    private static final Map<String, String> EXPECTED = Map.of(
            "function_call3.json", "MyRecord record {",
            "function_call2.json", "Civil record {",
            "types8.json", "string",
            "expected_type_field_docs.json", "joinDate: Date in yyyy-MM-dd",
            "expected_type_class.json",
            "Labels class, made with new(string owner); methods: set(string key, string value)",
            "expected_type_alias.json", "Span = [int, decimal]",
            "expected_type_defaults.json", "Leave out unless asked; defaults apply: team."
    );

    @Override
    @Test(dataProvider = "data-provider")
    public void test(Path config) throws IOException {
        String expected = EXPECTED.get(config.getFileName().toString());
        if (expected == null) {
            return;
        }
        Path configJsonPath = configDir.resolve(config);
        JsonObject testConfig = gson.fromJson(Files.newBufferedReader(configJsonPath), JsonObject.class);
        ExpressionEditorContext.Info context =
                gson.fromJson(testConfig.get("context"), ExpressionEditorContext.Info.class);
        String sourcePath = getSourcePath(testConfig.get("filePath").getAsString());

        notifyDidOpen(sourcePath);
        JsonObject response = getResponse(new ExpressionEditorDiagnosticsRequest(sourcePath, context));
        notifyDidClose(sourcePath);

        JsonElement type = response.get("type");
        Assert.assertTrue(type != null && type.getAsString().contains(expected),
                String.format("Expected '%s' in the type of %s, got %s", expected, config, type));
    }

    @Override
    protected String getResourceDir() {
        return "diagnostics";
    }

    @Override
    protected Class<? extends AbstractLSTest> clazz() {
        return ExpressionEditorExpectedTypeTest.class;
    }

    @Override
    protected String getApiName() {
        return "expectedType";
    }

    @Override
    protected String getServiceName() {
        return "expressionEditor";
    }
}
