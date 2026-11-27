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

package io.ballerina.flowmodelgenerator.extension;

import com.google.gson.JsonElement;
import io.ballerina.flowmodelgenerator.extension.request.DataMapperClausePositionRequest;
import io.ballerina.modelgenerator.commons.AbstractLSTest;
import org.testng.Assert;
import org.testng.annotations.DataProvider;
import org.testng.annotations.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Tests for the getting the clause position and text edits.
 *
 * @since 1.0.0
 */
public class DataMappingClausePositionTest extends AbstractLSTest {

    @DataProvider(name = "data-provider")
    @Override
    protected Object[] getConfigsList() {
        return new Object[][]{
                {Path.of("variable1.json")},
                {Path.of("function_definition1.json")},
                {Path.of("variable2.json")},
                {Path.of("variable3.json")},
                {Path.of("variable4.json")},
                {Path.of("variable5.json")},
        };
    }

    @Override
    @Test(dataProvider = "data-provider")
    public void test(Path config) throws IOException {
        Path configJsonPath = configDir.resolve(config);
        TestConfig testConfig = gson.fromJson(Files.newBufferedReader(configJsonPath), TestConfig.class);

        DataMapperClausePositionRequest request =
                new DataMapperClausePositionRequest(sourceDir.resolve(testConfig.source()).toAbsolutePath().toString(),
                        testConfig.codedata(), testConfig.targetField(), testConfig.index());
        JsonElement position = getResponseAndCloseFile(request, testConfig.source()).getAsJsonObject("position");

        if (position == null) {
            if (testConfig.position() != null) {
                TestConfig updatedConfig = new TestConfig(testConfig.source(), testConfig.description(),
                        testConfig.codedata(), testConfig.targetField(), testConfig.index(), position);
//                updateConfig(configJsonPath, updatedConfig);
                Assert.fail(String.format("Failed test: '%s' (%s)", testConfig.description(), configJsonPath));
            }
        } else if (!position.equals(testConfig.position())) {
            TestConfig updatedConfig = new TestConfig(testConfig.source(), testConfig.description(),
                    testConfig.codedata(), testConfig.targetField(), testConfig.index(), position);
//            updateConfig(configJsonPath, updatedConfig);
            Assert.fail(String.format("Failed test: '%s' (%s)", testConfig.description(), configJsonPath));
        }
    }

    @Override
    protected String getResourceDir() {
        return "data_mapper_clause_position";
    }

    @Override
    protected Class<? extends AbstractLSTest> clazz() {
        return DataMappingTypesTest.class;
    }

    @Override
    protected String getApiName() {
        return "clausePosition";
    }

    @Override
    protected String getServiceName() {
        return "dataMapper";
    }

    /**
     * Represents the test configuration for the field position test.
     *
     * @param source      The source file name
     * @param description The description of the test
     * @param codedata    Details of the node
     * @param targetField The target field to add the element
     * @param index       The clause ID to get the position
     * @param position    The start position of the clause
     */
    private record TestConfig(String source, String description, JsonElement codedata,
                              String targetField, int index, JsonElement position) {

        public String description() {
            return description == null ? "" : description;
        }
    }
}
