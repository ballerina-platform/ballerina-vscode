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
import io.ballerina.flowmodelgenerator.core.expressioneditor.ExpressionEditorContext;
import io.ballerina.flowmodelgenerator.extension.request.ExpressionEditorDiagnosticsRequest;
import io.ballerina.modelgenerator.commons.AbstractLSTest;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

/**
 * Tests for the undebounced expression check, which must give the same results as the diagnostics service.
 *
 * @since 1.0.0
 */
public class ExpressionEditorCheckExpressionTest extends ExpressionEditorDiagnosticsTest {

    @Test
    public void testConcurrentRequestsAllComplete() throws Exception {
        Path configJsonPath = configDir.resolve("variable1.json");
        JsonObject config = gson.fromJson(Files.newBufferedReader(configJsonPath), JsonObject.class);
        ExpressionEditorContext.Info template =
                gson.fromJson(config.get("context"), ExpressionEditorContext.Info.class);
        String sourcePath = getSourcePath(config.get("filePath").getAsString());
        notifyDidOpen(sourcePath);

        List<CompletableFuture<?>> responses = new ArrayList<>();
        for (String expression : new String[]{"f", "fn(", "fn({id: 0})"}) {
            ExpressionEditorContext.Info context = new ExpressionEditorContext.Info(expression,
                    template.startLine(), template.offset(), template.lineOffset(), template.codedata(),
                    template.property());
            responses.add(serviceEndpoint.request(getServiceName() + "/" + getApiName(),
                    new ExpressionEditorDiagnosticsRequest(sourcePath, context)));
        }
        for (CompletableFuture<?> response : responses) {
            Assert.assertNotNull(response.get(30, TimeUnit.SECONDS), "Each check must complete");
        }
        notifyDidClose(sourcePath);
    }

    @Override
    protected Class<? extends AbstractLSTest> clazz() {
        return ExpressionEditorCheckExpressionTest.class;
    }

    @Override
    protected String getApiName() {
        return "checkExpression";
    }

    @Override
    protected boolean debounced() {
        return false;
    }
}
