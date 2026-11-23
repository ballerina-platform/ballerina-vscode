/*
 *  Copyright (c) 2026, WSO2 LLC. (http://www.wso2.org) All Rights Reserved.
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
import io.ballerina.flowmodelgenerator.core.expressioneditor.ExpressionEditorContext;
import io.ballerina.flowmodelgenerator.extension.request.ExpressionEditorCompletionRequest;
import io.ballerina.modelgenerator.commons.AbstractLSTest;
import org.eclipse.lsp4j.CompletionContext;
import org.eclipse.lsp4j.CompletionItem;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

/**
 * Tests for the undebounced completion, which must give the same results as the completion service.
 *
 * @since 1.0.0
 */
public class ExpressionEditorCompletionNowTest extends ExpressionEditorCompletionTest {

    @Test
    public void testConcurrentRequestsAllComplete() throws Exception {
        Path configJsonPath = configDir.resolve("config.json");
        JsonObject config = gson.fromJson(Files.newBufferedReader(configJsonPath), JsonObject.class);
        ExpressionEditorContext.Info first = gson.fromJson(config.get("context"), ExpressionEditorContext.Info.class);
        CompletionContext completionContext = gson.fromJson(config.get("completionContext"), CompletionContext.class);
        String sourcePath = getSourcePath(config.get("filePath").getAsString());
        notifyDidOpen(sourcePath);

        ExpressionEditorContext.Info context = new ExpressionEditorContext.Info(
                "self.classVar > localVar + self. +  21", first.startLine(), 32, 0, first.codedata(),
                first.property());
        List<CompletableFuture<?>> responses = new ArrayList<>();
        for (int i = 0; i < 3; i++) {
            responses.add(serviceEndpoint.request(getServiceName() + "/" + getApiName(),
                    new ExpressionEditorCompletionRequest(sourcePath, context, completionContext)));
        }
        for (CompletableFuture<?> response : responses) {
            JsonObject result = gson.toJsonTree(response.get(30, TimeUnit.SECONDS)).getAsJsonObject();
            List<CompletionItem> completions =
                    gson.fromJson(result.get("left").getAsJsonArray(), COMPLETION_RESPONSE_TYPE);
            Assert.assertEquals(completions.size(), 1, "Each lookup must complete with its own result");
            Assert.assertEquals(completions.getFirst().getLabel(), "classVar");
        }
        notifyDidClose(sourcePath);
    }

    @Override
    protected Class<? extends AbstractLSTest> clazz() {
        return ExpressionEditorCompletionNowTest.class;
    }

    @Override
    protected String getApiName() {
        return "completionNow";
    }
}
