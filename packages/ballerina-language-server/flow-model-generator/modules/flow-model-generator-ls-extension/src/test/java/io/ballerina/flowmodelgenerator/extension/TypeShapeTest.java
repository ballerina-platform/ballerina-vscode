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

import com.google.gson.JsonObject;
import io.ballerina.flowmodelgenerator.extension.request.TypeShapeRequest;
import io.ballerina.modelgenerator.commons.AbstractLSTest;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Tests for what a named type holds.
 *
 * @since 1.7.0
 */
public class TypeShapeTest extends AbstractLSTest {

    @Override
    @Test(dataProvider = "data-provider")
    public void test(Path config) throws IOException {
        Path configJsonPath = configDir.resolve(config);
        TestConfig testConfig = gson.fromJson(Files.newBufferedReader(configJsonPath), TestConfig.class);

        TypeShapeRequest request = new TypeShapeRequest(
                sourceDir.resolve(testConfig.source()).toAbsolutePath().toString(), testConfig.type());
        JsonObject response = getResponse(request);

        JsonObject actual = new JsonObject();
        actual.add("values", response.get("values"));
        actual.add("fields", response.get("fields"));
        if (!actual.equals(testConfig.shape())) {
            compareJsonElements(actual, testConfig.shape());
            Assert.fail(String.format("Failed test: '%s' (%s)", testConfig.description(), configJsonPath));
        }
    }

    @Override
    protected String getResourceDir() {
        return "type_shape";
    }

    @Override
    protected Class<? extends AbstractLSTest> clazz() {
        return TypeShapeTest.class;
    }

    @Override
    protected String getApiName() {
        return "typeShape";
    }

    @Override
    protected String getServiceName() {
        return "expressionEditor";
    }

    private record TestConfig(String description, String source, String type, JsonObject shape) {
    }
}
