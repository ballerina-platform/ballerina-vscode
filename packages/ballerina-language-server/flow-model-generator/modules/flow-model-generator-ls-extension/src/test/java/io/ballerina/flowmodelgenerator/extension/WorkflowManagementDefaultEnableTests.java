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
import io.ballerina.flowmodelgenerator.extension.request.CreateFilesRequest;
import io.ballerina.modelgenerator.commons.AbstractLSTest;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Tests for the `shouldEnableWorkflowManagementByDefault` service, which reports whether workflow
 * management should be enabled automatically when ICP is enabled (ICP enabled + at least one
 * {@code @workflow:Workflow} function + management not already enabled).
 *
 * @since 1.0.0
 */
public class WorkflowManagementDefaultEnableTests extends AbstractLSTest {

    @Override
    @Test(dataProvider = "data-provider")
    public void test(Path config) throws IOException {
        Path configJsonPath = configDir.resolve(config);
        TestConfig testConfig;
        try (var reader = Files.newBufferedReader(configJsonPath)) {
            testConfig = gson.fromJson(reader, TestConfig.class);
        }

        CreateFilesRequest request =
                new CreateFilesRequest(sourceDir.resolve(testConfig.projectPath()).toAbsolutePath().toString());
        JsonElement response = getResponse(request);

        if (!response.equals(testConfig.response())) {
            Assert.fail(String.format("Failed test: '%s' (%s)", testConfig.description(), configJsonPath));
        }
    }

    @Override
    protected String getResourceDir() {
        return "workflow_management_default_enable";
    }

    @Override
    protected Class<? extends AbstractLSTest> clazz() {
        return WorkflowManagementDefaultEnableTests.class;
    }

    @Override
    protected String getApiName() {
        return "shouldEnableWorkflowManagementByDefault";
    }

    @Override
    protected String getServiceName() {
        return "workflowManagementService";
    }

    // todo: Remove after resolving BIR issue related to ballerinax/wso2.controlplane:1.0.0
    /**
     * * @see <a href="https://github.com/wso2/product-integrator/issues/1920">product-integrator#1920</a>
     */
    @Override
    protected String[] skipList() {
        return new String[]{
                "config1.json",
                "config2.json",
                "config5.json"
        };
    }

    /**
     * Represents the test configuration for the workflow management default-enable test.
     *
     * @param projectPath path of the project
     * @param description description of the test
     * @param response    the expected response
     */
    private record TestConfig(String projectPath, String description, JsonElement response) {

        public String description() {
            return description == null ? "" : description;
        }
    }
}
