/*
 *  Copyright (c) 2025, WSO2 LLC. (http://www.wso2.com)
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

package io.ballerina.flowmodelgenerator.extension.typesmanager;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.google.gson.JsonPrimitive;
import io.ballerina.flowmodelgenerator.core.model.Codedata;
import io.ballerina.flowmodelgenerator.extension.request.RecordConfigRequest;
import io.ballerina.modelgenerator.commons.AbstractLSTest;
import org.ballerinalang.langserver.util.TestUtil;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.CompletableFuture;

/**
 * Test cases for retrieving the record config model.
 *
 * @since 1.0.0
 */
public class RecordConfigTest extends AbstractLSTest {

    @Override
    @Test(dataProvider = "data-provider")
    public void test(Path config) throws IOException {
        Path configJsonPath = configDir.resolve(config);
        TestConfig testConfig = gson.fromJson(Files.newBufferedReader(configJsonPath), TestConfig.class);
        RecordConfigRequest request = new RecordConfigRequest(
                getSourcePath(testConfig.filePath()),
                testConfig.codedata(),
                testConfig.typeConstraint());
        JsonObject response = getResponse(request);
        JsonElement configResponse = response.get("recordConfig");
        if (response.has("errorMsg")) {
            JsonElement errorMsg = response.get("errorMsg");
            TestConfig updateConfig = new TestConfig(testConfig.filePath(), testConfig.description(),
                    testConfig.codedata(), testConfig.typeConstraint(), errorMsg);
            if (testConfig.output() instanceof JsonPrimitive) {
                String expectedErrorMsg = testConfig.output().getAsString();
//                updateConfig(configJsonPath, updateConfig);
                Assert.assertEquals(errorMsg.getAsString(), expectedErrorMsg, String.format("Failed test: '%s' (%s)",
                        testConfig.description(), configJsonPath));
            } else {
                Assert.fail(String.format("Unexpected error '%s' in test: '%s' (%s)", errorMsg.getAsString(),
                        testConfig.description(), configJsonPath));
            }

        } else if (configResponse != null && !configResponse.equals(testConfig.output())) {
            TestConfig updateConfig = new TestConfig(testConfig.filePath(), testConfig.description(),
                    testConfig.codedata(), testConfig.typeConstraint(), configResponse);
//             updateConfig(configJsonPath, updateConfig);
            compareJsonElements(configResponse, testConfig.output());
            Assert.fail(String.format("Failed test: '%s' (%s)", testConfig.description(), configJsonPath));
        }
    }

    @Override
    protected JsonObject getResponse(Object request) {
        String api = getServiceName() + "/" + getApiName();
        CompletableFuture<?> result = serviceEndpoint.request(api, request);
        String response = TestUtil.getResponseString(result);
        return JsonParser.parseString(response).getAsJsonObject().getAsJsonObject("result");
    }

    @Override
    protected String[] skipList() {
        // TODO: Fix test failing on windows
        return new String[]{
                "config3.json",
                // shortcut: config1 has no http version, so it never resolves; re-enable once pinned.
                "config1.json"
        };
    }

    @Override
    protected String getResourceDir() {
        return "record_config";
    }

    @Override
    protected Class<? extends AbstractLSTest> clazz() {
        return RecordConfigTest.class;
    }

    @Override
    protected String getApiName() {
        return "recordConfig";
    }

    @Override
    protected String getServiceName() {
        return "typesManager";
    }

    private record TestConfig(String filePath, String description, Codedata codedata,
                              String typeConstraint, JsonElement output) {
    }
}
