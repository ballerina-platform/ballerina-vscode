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

package io.ballerina.flowmodelgenerator.extension.workflowmanager;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import io.ballerina.flowmodelgenerator.extension.request.GetAllDataRequest;
import io.ballerina.modelgenerator.commons.AbstractLSTest;
import org.testng.Assert;
import org.testng.annotations.DataProvider;
import org.testng.annotations.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Tests for the WorkflowManagerService getAllData API.
 *
 * @since 1.8.0
 */
public class WorkflowManagerTest extends AbstractLSTest {

    @DataProvider(name = "data-provider")
    @Override
    protected Object[] getConfigsList() {
        return new Object[][]{
                {Path.of("get_all_events1.json")},
                {Path.of("get_all_events2.json")},
                {Path.of("get_all_events3.json")},
                {Path.of("get_all_events4.json")},
                {Path.of("get_all_events5.json")}
        };
    }

    @Override
    @Test(dataProvider = "data-provider")
    public void test(Path config) throws IOException {
        Path configJsonPath = configDir.resolve(config);
        TestConfig testConfig = gson.fromJson(Files.newBufferedReader(configJsonPath), TestConfig.class);

        String filePath = sourceDir.resolve(testConfig.source()).toAbsolutePath().toString();
        GetAllDataRequest request = new GetAllDataRequest(filePath, testConfig.workflowName());
        JsonArray data = getResponseAndCloseFile(request, testConfig.source()).getAsJsonArray("data");

        JsonArray expectedData = testConfig.output().getAsJsonArray("data");

        if (!data.equals(expectedData)) {
            JsonObject output = new JsonObject();
            output.add("data", data);
            TestConfig updateConfig = new TestConfig(testConfig.source(), testConfig.description(),
                    testConfig.workflowName(), output);
//            updateConfig(configJsonPath, updateConfig);
            compareJsonElements(data, expectedData);
            Assert.fail(String.format("Failed test: '%s' (%s)", testConfig.description(), configJsonPath));
        }
    }

    @Override
    protected String getResourceDir() {
        return "workflow_manager";
    }

    @Override
    protected Class<? extends AbstractLSTest> clazz() {
        return WorkflowManagerTest.class;
    }

    @Override
    protected String getApiName() {
        return "getAllData";
    }

    @Override
    protected String getServiceName() {
        return "workflowManager";
    }

    private record TestConfig(String source, String description, String workflowName, JsonObject output) {
    }
}
