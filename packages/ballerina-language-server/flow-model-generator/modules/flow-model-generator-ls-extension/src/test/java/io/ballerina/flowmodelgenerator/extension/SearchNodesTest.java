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

import com.google.gson.JsonArray;
import io.ballerina.flowmodelgenerator.extension.request.SearchNodesRequest;
import io.ballerina.modelgenerator.commons.AbstractLSTest;
import io.ballerina.tools.text.LinePosition;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Tests for the searchNodes API.
 *
 * @since 1.3.0
 */
public class SearchNodesTest extends AbstractLSTest {

    @Override
    @Test(dataProvider = "data-provider")
    public void test(Path config) throws IOException {
        Path configJsonPath = configDir.resolve(config);
        TestConfig testConfig = gson.fromJson(Files.newBufferedReader(configJsonPath), TestConfig.class);

        SearchNodesRequest request = new SearchNodesRequest(
                getSourcePath(testConfig.source()),
                testConfig.position(),
                testConfig.query()
        );

        JsonArray jsonModel = getResponseAndCloseFile(request, testConfig.source()).getAsJsonArray("output");

        if (!jsonModel.equals(testConfig.output())) {
            TestConfig updateConfig =
                    new TestConfig(testConfig.source(), testConfig.description(), testConfig.position(),
                            testConfig.query(), jsonModel);
//            updateConfig(configJsonPath, updateConfig);
            compareJsonElements(jsonModel, testConfig.output());
            Assert.fail(String.format("Failed test: '%s' (%s)", testConfig.description(), configJsonPath));
        }
    }

    @Override
    protected String[] skipList() {
        // TODO: Some nodes, such as the model provider, do not go through the default visitor flow. Therefore, this
        //  implementation is limited in certain cases. We may need to ensure that they follow the same architecture.
        return new String[]{"config10.json"};
    }

    @Override
    protected String getResourceDir() {
        return "search_nodes";
    }

    @Override
    protected Class<? extends AbstractLSTest> clazz() {
        return SearchNodesTest.class;
    }

    @Override
    protected String getApiName() {
        return "searchNodes";
    }

    /**
     * Represents the test configuration for the searchNodes API.
     *
     * @param source      The source file path
     * @param description The description of the test
     * @param position    The position in the file
     * @param query       The typed search query
     * @param output      The expected output
     */
    private record TestConfig(String source, String description, LinePosition position,
                              SearchNodesRequest.SearchQuery query, JsonArray output) {

        public String description() {
            return description == null ? "" : description;
        }
    }
}
