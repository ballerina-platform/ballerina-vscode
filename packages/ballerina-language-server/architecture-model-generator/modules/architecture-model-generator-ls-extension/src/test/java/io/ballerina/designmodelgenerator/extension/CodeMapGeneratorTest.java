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

package io.ballerina.designmodelgenerator.extension;

import com.google.gson.JsonObject;
import io.ballerina.designmodelgenerator.extension.request.CodeMapRequest;
import io.ballerina.modelgenerator.commons.AbstractLSTest;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Tests for getting the codeMap for a package.
 *
 * @since 1.6.0
 */
public class CodeMapGeneratorTest extends AbstractLSTest {

    @Override
    @Test(dataProvider = "data-provider")
    public void test(Path config) throws IOException {
        Path configJsonPath = configDir.resolve(config);
        TestConfig testConfig = gson.fromJson(Files.newBufferedReader(configJsonPath), TestConfig.class);
        CodeMapRequest request = new CodeMapRequest(getProjectPath(testConfig.source()));
        JsonObject codeMapResponse = getResponseAndCloseFile(request, testConfig.source());
        String actualContent = codeMapResponse.get("content").getAsString();

        // Save debugging files
        saveDebuggingFiles(testConfig.source(), codeMapResponse);

        if (!actualContent.equals(testConfig.output())) {
            TestConfig updatedConfig = new TestConfig(testConfig.description(), testConfig.source(), actualContent);
//            updateConfig(configJsonPath, updatedConfig);
            Assert.fail(String.format("Failed test: '%s' (%s)\nExpected: %s\nActual: %s",
                    testConfig.description(), configJsonPath, testConfig.output(), actualContent));
        }
    }

    @Override
    protected String getResourceDir() {
        return "codemap";
    }

    @Override
    protected Class<? extends AbstractLSTest> clazz() {
        return CodeMapGeneratorTest.class;
    }

    @Override
    protected String getServiceName() {
        return "designModelService";
    }

    @Override
    protected String getApiName() {
        return "codeMap";
    }

    protected String getProjectPath(String source) {
        return sourceDir.resolve(source).toAbsolutePath().toString();
    }

    private void saveDebuggingFiles(String projectName, JsonObject response) {
        try {
            Path outputDir = configDir.resolve("output");
            Files.createDirectories(outputDir);

            // Save the markdown content
            String markdownContent = response.get("content").getAsString();
            Path markdownFile = outputDir.resolve(projectName + ".md");
            Files.writeString(markdownFile, markdownContent);
        } catch (IOException e) {
            // Log but don't fail the test for debugging file issues
            log.warn("Failed to save debugging files for project: {}", projectName, e);
        }
    }


    public record TestConfig(String description, String source, String output) {

        public String description() {
            return description == null ? "" : description;
        }
    }
}
