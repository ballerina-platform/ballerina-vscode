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
package io.ballerina.servicemodelgenerator.extension;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import io.ballerina.modelgenerator.commons.AbstractLSTest;
import io.ballerina.servicemodelgenerator.extension.model.Codedata;
import io.ballerina.servicemodelgenerator.extension.model.request.CommonModelFromSourceRequest;
import io.ballerina.servicemodelgenerator.extension.model.request.ServiceModelRequest;
import io.ballerina.tools.text.LinePosition;
import io.ballerina.tools.text.LineRange;
import org.ballerinalang.langserver.util.TestUtil;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.io.BufferedReader;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Asserts that a service model which cannot be resolved is answered with a structured resolution error the
 * client can act on, rather than only an error message.
 *
 * @since 1.8.0
 */
public class ServiceModelResolutionErrorTest extends AbstractLSTest {

    @Override
    @Test(dataProvider = "data-provider")
    public void test(Path config) throws IOException {
        Path configJsonPath = configDir.resolve(config);
        TestConfig testConfig;
        try (BufferedReader bufferedReader = Files.newBufferedReader(configJsonPath)) {
            testConfig = gson.fromJson(bufferedReader, TestConfig.class);
        }

        String sourcePath = sourceDir.resolve(testConfig.filePath()).toAbsolutePath().toString();
        Object request = switch (testConfig.api()) {
            case "getServiceFromSource" -> new CommonModelFromSourceRequest(sourcePath, new Codedata(
                    LineRange.from(testConfig.filePath(), testConfig.start(), testConfig.end())));
            case "getServiceInitModel" -> new ServiceModelRequest(sourcePath, testConfig.orgName(),
                    testConfig.pkgName(), testConfig.moduleName());
            default -> throw new IllegalArgumentException("Unsupported API: " + testConfig.api());
        };

        // The base getResponse fails a test on any errorMsg, which these responses carry by design.
        String response = TestUtil.getResponseString(
                serviceEndpoint.request(getServiceName() + "/" + testConfig.api(), request));
        JsonObject result = JsonParser.parseString(response).getAsJsonObject().getAsJsonObject("result");
        JsonElement resolutionError = result.get("resolutionError");

        String message = String.format("Failed test: '%s' (%s)", testConfig.description(), configJsonPath);
        Assert.assertTrue(resolutionError != null && resolutionError.isJsonObject(), message + ": " + result);
        Assert.assertEquals(resolutionError.getAsJsonObject().get("code").getAsString(),
                testConfig.resolutionErrorCode(), message);
    }

    @Override
    protected String getResourceDir() {
        return "service_model_resolution_error";
    }

    @Override
    protected Class<? extends AbstractLSTest> clazz() {
        return ServiceModelResolutionErrorTest.class;
    }

    @Override
    protected String getServiceName() {
        return "serviceDesign";
    }

    @Override
    protected String getApiName() {
        return "getServiceFromSource";
    }

    /**
     * Represents the test configuration.
     *
     * @param description         description of the test
     * @param api                 the service design API to call
     * @param filePath            source file, relative to the source directory
     * @param start               start of the service's range, for {@code getServiceFromSource}
     * @param end                 end of the service's range, for {@code getServiceFromSource}
     * @param orgName             connector organization, for {@code getServiceInitModel}
     * @param pkgName             connector package, for {@code getServiceInitModel}
     * @param moduleName          connector module, for {@code getServiceInitModel}
     * @param resolutionErrorCode the expected resolution error code
     */
    private record TestConfig(String description, String api, String filePath, LinePosition start,
                              LinePosition end, String orgName, String pkgName, String moduleName,
                              String resolutionErrorCode) {

        public String description() {
            return description == null ? "" : description;
        }
    }
}
