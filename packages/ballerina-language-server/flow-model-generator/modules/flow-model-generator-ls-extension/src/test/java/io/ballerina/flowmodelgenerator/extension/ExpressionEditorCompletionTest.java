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
import com.google.gson.JsonParser;
import com.google.gson.reflect.TypeToken;
import io.ballerina.flowmodelgenerator.core.expressioneditor.ExpressionEditorContext;
import io.ballerina.flowmodelgenerator.extension.request.ExpressionEditorCompletionRequest;
import io.ballerina.modelgenerator.commons.AbstractLSTest;
import io.ballerina.tools.text.LinePosition;
import org.eclipse.lsp4j.CompletionContext;
import org.eclipse.lsp4j.CompletionItem;
import org.eclipse.lsp4j.CompletionItemKind;
import org.eclipse.lsp4j.CompletionTriggerKind;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.io.IOException;
import java.lang.reflect.Type;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Tests for the expression editor completion service.
 *
 * @since 1.0.0
 */
public class ExpressionEditorCompletionTest extends AbstractLSTest {

    public static final Type COMPLETION_RESPONSE_TYPE = new TypeToken<List<CompletionItem>>() { }.getType();
    private static final List<String> SCOPE_VALUES =
            List.of("reply", "fixed", "payload", "apiUrl", "region", "counter", "inbound");

    @Override
    @Test(dataProvider = "data-provider")
    public void test(Path config) throws IOException {
        Path configJsonPath = configDir.resolve(config);
        TestConfig testConfig = gson.fromJson(Files.newBufferedReader(configJsonPath), TestConfig.class);
        String sourcePath = getSourcePath(testConfig.filePath());

        notifyDidOpen(sourcePath);
        ExpressionEditorCompletionRequest request = new ExpressionEditorCompletionRequest(sourcePath,
                testConfig.context(), testConfig.completionContext());
        JsonObject response = getResponse(request);
        List<CompletionItem> actualCompletions =
                gson.fromJson(response.get("left").getAsJsonArray(), COMPLETION_RESPONSE_TYPE);
        notifyDidClose(sourcePath);

        if (!assertArray("completions", actualCompletions, testConfig.completions())) {
            TestConfig updatedConfig = new TestConfig(testConfig.description(), testConfig.filePath(),
                    testConfig.context(), testConfig.completionContext(), actualCompletions);
//            updateConfig(configJsonPath, updatedConfig);
            Assert.fail(String.format("Failed test: '%s' (%s)", testConfig.description(), configJsonPath));
        }
    }

    @Test
    public void testMultipleRequests() throws IOException {
        Path configJsonPath = configDir.resolve("config.json");
        TestConfig testConfig = gson.fromJson(Files.newBufferedReader(configJsonPath), TestConfig.class);
        String sourcePath = getSourcePath(testConfig.filePath());

        notifyDidOpen(sourcePath);
        ExpressionEditorCompletionRequest request = new ExpressionEditorCompletionRequest(sourcePath,
                testConfig.context(), testConfig.completionContext());
        getResponse(request);

        ExpressionEditorContext.Info firstContext = testConfig.context();
        ExpressionEditorContext.Info info =
                new ExpressionEditorContext.Info("self.classVar > localVar + self. +  21", firstContext.startLine(),
                        32, 0, firstContext.codedata(), firstContext.property());
        ExpressionEditorCompletionRequest secondRequest = new ExpressionEditorCompletionRequest(sourcePath, info,
                testConfig.completionContext());
        JsonObject secondResponse = getResponse(secondRequest);
        List<CompletionItem> secondCompletions =
                gson.fromJson(secondResponse.get("left").getAsJsonArray(), COMPLETION_RESPONSE_TYPE);
        Assert.assertEquals(secondCompletions.size(), 1);
        Assert.assertEquals(secondCompletions.getFirst().getLabel(), "classVar");
        notifyDidClose(sourcePath);
    }

    @Test
    public void testRanksValuesByScope() throws IOException {
        List<String> order = scopeCompletions("EXPRESSION").stream()
                .filter(item -> SCOPE_VALUES.contains(item.getLabel()))
                .sorted(Comparator.comparing(CompletionItem::getSortText))
                .map(CompletionItem::getLabel)
                .toList();
        Assert.assertEquals(order.subList(0, 2).stream().sorted().toList(), List.of("fixed", "reply"),
                order.toString());
        Assert.assertEquals(order.get(2), "payload", order.toString());
        Assert.assertEquals(order.subList(3, 6).stream().sorted().toList(), List.of("apiUrl", "counter", "region"),
                order.toString());
        Assert.assertEquals(order.get(6), "inbound", order.toString());
    }

    @Test
    public void testOffersOnlyAssignableVariablesForAnAssignmentTarget() throws IOException {
        List<String> labels = scopeCompletions("LV_EXPRESSION").stream().map(CompletionItem::getLabel).toList();
        Assert.assertTrue(labels.containsAll(List.of("reply", "counter")), labels.toString());
        Assert.assertTrue(Collections.disjoint(labels, List.of("fixed", "payload", "apiUrl", "region", "inbound")),
                labels.toString());
    }

    @Test
    public void testQuotesAFieldNamedLikeAKeyword() throws IOException {
        String sourcePath = getSourcePath("keyword_field.bal");
        notifyDidOpen(sourcePath);
        JsonObject property = JsonParser.parseString(
                "{\"types\": [{\"fieldType\": \"EXPRESSION\", \"ballerinaType\": \"any\", \"selected\": true}]}")
                .getAsJsonObject();
        ExpressionEditorContext.Info info =
                new ExpressionEditorContext.Info("card.", LinePosition.from(8, 4), 5, 0, new JsonObject(), property);
        JsonObject response = getResponse(new ExpressionEditorCompletionRequest(sourcePath, info,
                new CompletionContext(CompletionTriggerKind.TriggerCharacter, ".")));
        notifyDidClose(sourcePath);
        List<CompletionItem> items = gson.fromJson(response.get("left").getAsJsonArray(), COMPLETION_RESPONSE_TYPE);
        Set<String> inserts = items.stream().filter(item -> item.getKind() == CompletionItemKind.Field)
                .map(CompletionItem::getInsertText).collect(Collectors.toSet());
        Assert.assertEquals(inserts, Set.of("'type", "'from", "number"));
    }

    @Test
    public void testRanksALocalThatSharesAModuleVariableNameAsLocal() throws IOException {
        for (String fieldType : List.of("EXPRESSION", "LV_EXPRESSION")) {
            CompletionItem count = completionsAt("shadow.bal", LinePosition.from(4, 4), fieldType).stream()
                    .filter(item -> item.getLabel().equals("count")).findFirst().orElseThrow();
            Assert.assertTrue(count.getSortText().startsWith("1"), fieldType + ": " + count.getSortText());
        }
    }

    private List<CompletionItem> scopeCompletions(String fieldType) throws IOException {
        return completionsAt("scope.bal", LinePosition.from(16, 4), fieldType);
    }

    private List<CompletionItem> completionsAt(String file, LinePosition position, String fieldType)
            throws IOException {
        String sourcePath = getSourcePath(file);
        notifyDidOpen(sourcePath);
        JsonObject property = JsonParser.parseString(
                "{\"types\": [{\"fieldType\": \"%s\", \"selected\": true}]}".formatted(fieldType)).getAsJsonObject();
        ExpressionEditorContext.Info info =
                new ExpressionEditorContext.Info("", position, 0, 0, new JsonObject(), property);
        JsonObject response = getResponse(new ExpressionEditorCompletionRequest(sourcePath, info,
                new CompletionContext(CompletionTriggerKind.Invoked)));
        notifyDidClose(sourcePath);
        return gson.fromJson(response.get("left").getAsJsonArray(), COMPLETION_RESPONSE_TYPE);
    }

    @Override
    protected String getResourceDir() {
        return "completions";
    }

    @Override
    protected Class<? extends AbstractLSTest> clazz() {
        return ExpressionEditorCompletionTest.class;
    }

    @Override
    protected String getApiName() {
        return "completion";
    }

    @Override
    protected String getServiceName() {
        return "expressionEditor";
    }

    private record TestConfig(String description, String filePath, ExpressionEditorContext.Info context,
                              CompletionContext completionContext, List<CompletionItem> completions) {
    }
}
