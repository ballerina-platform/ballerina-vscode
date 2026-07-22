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

package io.ballerina.designmodelgenerator.extension;

import com.google.gson.JsonObject;
import io.ballerina.designmodelgenerator.extension.request.ArtifactsRequest;
import io.ballerina.modelgenerator.commons.AbstractLSTest;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Objects;

/**
 * Tests for getting the artifacts for a package.
 *
 * @since 1.0.0
 */
public class ArtifactsTest extends AbstractLSTest {

    @Override
    @Test(dataProvider = "data-provider")
    public void test(Path config) throws IOException {
        Path configJsonPath = configDir.resolve(config);
        TestConfig testConfig = gson.fromJson(Files.newBufferedReader(configJsonPath), TestConfig.class);
        ArtifactsRequest request = new ArtifactsRequest(getSourcePath(testConfig.source()));
        JsonObject artifactsResponse = getResponseAndCloseFile(request, testConfig.source);
        JsonObject artifact = artifactsResponse.getAsJsonObject("artifacts");
        String packageName = getStringValue(artifactsResponse, "packageName");
        String moduleName = getStringValue(artifactsResponse, "moduleName");

        if (!isJsonPermutation(artifact, testConfig.output())
                || !Objects.equals(packageName, testConfig.packageName())
                || !Objects.equals(moduleName, testConfig.moduleName())) {
            TestConfig updatedConfig = new TestConfig(testConfig.description(), testConfig.source(), packageName,
                    moduleName, artifact);
//            updateConfig(configJsonPath, updatedConfig);
            compareJsonElements(artifact, testConfig.output());
            Assert.fail(String.format("Failed test: '%s' (%s)", testConfig.description(), configJsonPath));
        }
    }

    @Override
    protected String[] skipList() {
        return new String[]{
                // TODO: Need to replace this with the latest ai agent implementation
                "agent.json",
                // TODO: Investigate why the following test fails intermittently in Windows
                "graphql.json",
                // TODO: Include this after discussing how to integrate submodules into the artifacts tree
                "persist.json",
                // TODO: Capture expected snapshot for the custom *ai:FixedReturnAgentType fixture.
                "agent_type.json"
        };
    }

    @Override
    protected String getResourceDir() {
        return "artifacts";
    }

    @Override
    protected Class<? extends AbstractLSTest> clazz() {
        return ArtifactsTest.class;
    }

    @Override
    protected String getServiceName() {
        return "designModelService";
    }

    @Override
    protected String getApiName() {
        return "artifacts";
    }

    private static String getStringValue(JsonObject jsonObject, String key) {
        return jsonObject.get(key) != null && !jsonObject.get(key).isJsonNull() ?
                jsonObject.get(key).getAsString() : null;
    }

    public record TestConfig(String description, String source, String packageName, String moduleName,
                             JsonObject output) {

        public String description() {
            return description == null ? "" : description;
        }
    }
}
