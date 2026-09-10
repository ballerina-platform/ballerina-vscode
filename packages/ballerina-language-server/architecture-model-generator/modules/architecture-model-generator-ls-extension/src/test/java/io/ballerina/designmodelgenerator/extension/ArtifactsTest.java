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
import org.testng.annotations.DataProvider;
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

    @DataProvider(name = "trigger-kind-artifacts")
    public Object[][] triggerKindArtifacts() {
        return new Object[][] {
                {"kafka.json", "event", "Types"},
                {"http_service.json", "http", "Connections"},
        };
    }

    @Test(dataProvider = "trigger-kind-artifacts")
    public void testTriggerKindIsLimitedToServiceAndListenerArtifacts(String configFile, String expectedKind,
                                                                      String unrelatedCategory) throws IOException {
        Path configJsonPath = configDir.resolve(configFile);
        TestConfig testConfig = gson.fromJson(Files.newBufferedReader(configJsonPath), TestConfig.class);
        ArtifactsRequest request = new ArtifactsRequest(getSourcePath(testConfig.source()));
        JsonObject response = getResponseAndCloseFile(request, testConfig.source());
        JsonObject artifacts = response.getAsJsonObject("artifacts");

        assertTriggerKind(artifacts.getAsJsonObject("Entry Points"), expectedKind);
        assertTriggerKind(artifacts.getAsJsonObject("Listeners"), expectedKind);
        artifacts.getAsJsonObject(unrelatedCategory).entrySet().forEach(entry ->
                Assert.assertFalse(entry.getValue().getAsJsonObject().has("triggerKind"),
                        entry.getKey() + " must not inherit connector triggerKind"));
    }

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
                "persist.json"
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

    private static void assertTriggerKind(JsonObject category, String expectedKind) {
        Assert.assertFalse(category.isEmpty());
        category.entrySet().forEach(entry -> Assert.assertEquals(
                getStringValue(entry.getValue().getAsJsonObject(), "triggerKind"), expectedKind, entry.getKey()));
    }

    public record TestConfig(String description, String source, String packageName, String moduleName,
                             JsonObject output) {

        public String description() {
            return description == null ? "" : description;
        }
    }
}
