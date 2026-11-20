/*
 *  Copyright (c) 2024, WSO2 LLC. (http://www.wso2.com)
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
import io.ballerina.flowmodelgenerator.extension.request.ExpressionEditorTypesRequest;
import io.ballerina.modelgenerator.commons.AbstractLSTest;
import io.ballerina.tools.text.LinePosition;
import org.eclipse.lsp4j.CompletionItem;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

/**
 * Tests for the expression editor types service.
 *
 * @since 1.0.0
 */
public class ExpressionEditorTypesTest extends AbstractLSTest {

    @Test(dataProvider = "data-provider")
    public void test(Path config) throws IOException {
        Path configJsonPath = configDir.resolve(config);
        TestConfig testConfig = gson.fromJson(Files.newBufferedReader(configJsonPath), TestConfig.class);

        ExpressionEditorTypesRequest request =
                new ExpressionEditorTypesRequest(getSourcePath(testConfig.source()), testConfig.typeConstraint(),
                        testConfig.position(), Boolean.TRUE.equals(testConfig.typedescValue()));
        JsonObject response = getResponse(request);

        List<CompletionItem> actualCompletions = gson.fromJson(response.get("left").getAsJsonArray(),
                ExpressionEditorCompletionTest.COMPLETION_RESPONSE_TYPE);
        if (!assertArray("completions", actualCompletions, testConfig.completions())) {
            TestConfig updatedConfig = new TestConfig(testConfig.description(), testConfig.source(),
                    testConfig.typeConstraint(), testConfig.position(), testConfig.typedescValue(), actualCompletions);
//            updateConfig(configJsonPath, updatedConfig);
            Assert.fail(String.format("Failed test: '%s' (%s)", testConfig.description(), configJsonPath));
        }
    }

    /**
     * The builtin types are cached from whichever project asks for types first. A module's types are checked against
     * a constraint built from its own compilation, so a record with fields of another project still belongs to it:
     * checked against the cached symbol, which belongs to another compilation, it was left out. Runs before the
     * configs, so the cache can't have been built from this project.
     */
    @Test(priority = -1)
    public void testConstraintAfterAnotherProjectAskedFirst() throws IOException {
        String constraint = "record {|anydata...;|}";
        getResponse(new ExpressionEditorTypesRequest(getSourcePath("proj/main.bal"), constraint, null, true));

        JsonObject response = getResponse(new ExpressionEditorTypesRequest(getSourcePath("typedesc_value.bal"),
                constraint, LinePosition.from(10, 0), true));
        List<String> labels = gson.<List<CompletionItem>>fromJson(response.get("left").getAsJsonArray(),
                        ExpressionEditorCompletionTest.COMPLETION_RESPONSE_TYPE).stream()
                .map(CompletionItem::getLabel).toList();
        Assert.assertTrue(labels.containsAll(List.of("Tagged", "StrMap")),
                "A record with fields must belong to the constraint after another project asked first: " + labels);
    }

    @Override
    protected String[] skipList() {
        // TODO: Enable this once the intermittent issue in the subtype is API is fixed
        return new String[] {
                "config11.json"
        };
    }

    @Override
    protected String getResourceDir() {
        return "types";
    }

    @Override
    protected Class<? extends AbstractLSTest> clazz() {
        return ExpressionEditorTypesTest.class;
    }

    @Override
    protected String getApiName() {
        return "types";
    }

    @Override
    protected String getServiceName() {
        return "expressionEditor";
    }

    private record TestConfig(String description, String source, String typeConstraint, LinePosition position,
                              Boolean typedescValue, List<CompletionItem> completions) {
    }
}
