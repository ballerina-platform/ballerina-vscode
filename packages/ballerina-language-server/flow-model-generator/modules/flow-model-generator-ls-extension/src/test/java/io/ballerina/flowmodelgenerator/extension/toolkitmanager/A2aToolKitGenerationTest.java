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

package io.ballerina.flowmodelgenerator.extension.toolkitmanager;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import io.ballerina.flowmodelgenerator.extension.request.FlowModelSourceGeneratorRequest;
import io.ballerina.modelgenerator.commons.AbstractLSTest;
import org.testng.Assert;
import org.testng.annotations.BeforeClass;
import org.testng.annotations.DataProvider;
import org.testng.annotations.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Test for the code generated for an A2A toolkit: one module variable in connections.bal.
 *
 * @since 1.4.0
 */
public class A2aToolKitGenerationTest extends AbstractLSTest {

    @BeforeClass
    public void requireAiWithA2aToolKit() {
        A2aAiPackage.requireAvailable();
    }

    @DataProvider(name = "data-provider")
    @Override
    protected Object[] getConfigsList() {
        return new Object[][]{
                {Path.of("a2a_toolkit_generation_plain.json")},
                {Path.of("a2a_toolkit_generation_api_key.json")},
                {Path.of("a2a_toolkit_generation_bearer.json")},
                {Path.of("a2a_toolkit_generation_approval.json")}
        };
    }

    @Override
    @Test(dataProvider = "data-provider")
    public void test(Path config) throws IOException {
        Path configJsonPath = configDir.resolve(config);
        JsonObject testConfig = gson.fromJson(Files.newBufferedReader(configJsonPath), JsonObject.class);
        String filePath = sourceDir.resolve(testConfig.get("source").getAsString()).toAbsolutePath().toString();
        JsonObject response = getResponse(new FlowModelSourceGeneratorRequest(filePath,
                testConfig.getAsJsonObject("flowNode")));

        JsonObject textEdits = response.getAsJsonObject("textEdits");
        // The statement goes to connections.bal, with the import of the ai module when the file lacks it
        List<String> edits = new ArrayList<>();
        for (Map.Entry<String, JsonElement> entry : textEdits.entrySet()) {
            Assert.assertTrue(entry.getKey().endsWith("connections.bal"), "Unexpected file: " + entry.getKey());
            for (JsonElement edit : (JsonArray) entry.getValue()) {
                edits.add(edit.getAsJsonObject().get("newText").getAsString().strip());
            }
        }
        Assert.assertTrue(edits.contains("import ballerina/ai;"), "No import of ai: " + edits);
        edits.remove("import ballerina/ai;");
        Assert.assertEquals(edits, List.of(testConfig.get("expectedCode").getAsString()));
    }

    @Override
    protected String getResourceDir() {
        return "toolkit_manager";
    }

    @Override
    protected Class<? extends AbstractLSTest> clazz() {
        return A2aToolKitGenerationTest.class;
    }

    @Override
    protected String getApiName() {
        return "getSourceCode";
    }
}
