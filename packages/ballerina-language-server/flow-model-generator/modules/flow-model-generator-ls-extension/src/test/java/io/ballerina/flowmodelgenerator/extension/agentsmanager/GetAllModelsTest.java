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

package io.ballerina.flowmodelgenerator.extension.agentsmanager;

import com.google.gson.JsonArray;
import io.ballerina.flowmodelgenerator.extension.request.GetAllModelsRequest;
import io.ballerina.modelgenerator.commons.AbstractLSTest;
import org.testng.Assert;
import org.testng.annotations.DataProvider;
import org.testng.annotations.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Stream;

/**
 * Tests for get all models.
 *
 * @since 1.0.0
 */
public class GetAllModelsTest extends AbstractLSTest {

    @DataProvider(name = "data-provider")
    @Override
    protected Object[] getConfigsList() {
        List<String> skip = Arrays.asList(skipList());
        return Stream.of(
                "get_all_models.json",
                "get_all_models_ballerina.json"
        ).filter(c -> !skip.contains(c)).map(c -> new Object[]{Path.of(c)}).toArray(Object[][]::new);
    }

    @Override
    protected String[] skipList() {
        // TODO: remove after deprecated ballerinax/ai imports are migrated
        // get_all_models.json uses agent_1 which imports ballerinax/ai
        return new String[]{
                "get_all_models.json"
        };
    }

    @Override
    @Test(dataProvider = "data-provider")
    public void test(Path config) throws IOException {
        Path configJsonPath = configDir.resolve(config);
        TestConfig testConfig = gson.fromJson(Files.newBufferedReader(configJsonPath), TestConfig.class);

        String filePath =
                testConfig.source() == null ? "" : sourceDir.resolve(testConfig.source()).toAbsolutePath().toString();
        GetAllModelsRequest request = new GetAllModelsRequest(testConfig.agent(), testConfig.orgName(), filePath);
        JsonArray models = getResponseAndCloseFile(request, testConfig.source()).getAsJsonArray("models");

        if (!models.equals(testConfig.models())) {
            TestConfig updatedConfig = new TestConfig(testConfig.source(), testConfig.description(),
                    testConfig.orgName(), testConfig.agent(), models);
//            updateConfig(configJsonPath, updatedConfig);
            Assert.fail("Test failed. Updated the expected output in " + configJsonPath);
        }
    }

    @Override
    protected String getResourceDir() {
        return "agents_manager";
    }

    @Override
    protected Class<? extends AbstractLSTest> clazz() {
        return GetAllModelsTest.class;
    }

    @Override
    protected String getApiName() {
        return "getAllModels";
    }

    @Override
    protected String getServiceName() {
        return "agentManager";
    }

    /**
     * Represents the test configuration for the flow model getNodeTemplate API.
     *
     * @param source      The source file path
     * @param description The description of the test
     * @param orgName     organization name
     * @param agent       The agent name
     * @param models      List of all available models
     */
    private record TestConfig(String source, String description, String orgName, String agent, JsonArray models) {
        public String description() {
            return description == null ? "" : description;
        }
    }
}
