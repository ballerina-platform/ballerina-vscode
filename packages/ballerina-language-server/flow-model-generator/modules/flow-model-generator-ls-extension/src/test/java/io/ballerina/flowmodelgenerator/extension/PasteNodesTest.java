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

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import io.ballerina.flowmodelgenerator.extension.request.FlowNodesPasteRequest;
import io.ballerina.modelgenerator.commons.AbstractLSTest;
import io.ballerina.tools.text.LinePosition;
import org.ballerinalang.langserver.util.TestUtil;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.CompletableFuture;

/**
 * Tests for pasting copied statements into a flow.
 *
 * @since 1.7.0
 */
public class PasteNodesTest extends AbstractLSTest {

    @Override
    @Test(dataProvider = "data-provider")
    public void test(Path config) throws IOException {
        Path configJsonPath = configDir.resolve(config);
        TestConfig testConfig = gson.fromJson(Files.newBufferedReader(configJsonPath), TestConfig.class);
        String sourceFile = sourceDir.resolve(testConfig.source()).toAbsolutePath().toString();

        FlowNodesPasteRequest request = new FlowNodesPasteRequest(sourceFile, testConfig.text().replace("\n",
                System.lineSeparator()), testConfig.target(), testConfig.copiedFrom() == null ? null
                : sourceDir.resolve(testConfig.copiedFrom()).toAbsolutePath().toString(), false);
        if (testConfig.output() == null) {
            CompletableFuture<?> result = serviceEndpoint.request(getServiceName() + "/" + getApiName(), request);
            JsonObject refused = JsonParser.parseString(TestUtil.getResponseString(result)).getAsJsonObject()
                    .getAsJsonObject("result");
            Assert.assertTrue(refused.has("errorMsg") && !refused.has("textEdits"),
                    "Failed test: " + testConfig.description());
            return;
        }
        JsonObject response = getResponse(request);
        JsonArray edits = response.getAsJsonObject("textEdits").getAsJsonArray(sourceFile);
        String newText = edits.get(edits.size() - 1).getAsJsonObject().get("newText").getAsString();
        Assert.assertEquals(newText.replace(System.lineSeparator(), "\n"), testConfig.output(),
                "Failed test: " + testConfig.description());
        String imports = edits.size() > 1 ? edits.get(0).getAsJsonObject().get("newText").getAsString() : null;
        Assert.assertEquals(imports == null ? null : imports.replace(System.lineSeparator(), "\n"),
                testConfig.imports(), "Failed test: " + testConfig.description());
    }

    @Override
    protected String getResourceDir() {
        return "paste_nodes";
    }

    @Override
    protected Class<? extends AbstractLSTest> clazz() {
        return PasteNodesTest.class;
    }

    @Override
    protected String getApiName() {
        return "pasteFlowNodes";
    }

    /**
     * Represents the test configuration for pasting statements.
     *
     * @param description The description of the test
     * @param source      The source file to paste into
     * @param text        The copied statements
     * @param target      Where the statements go
     * @param copiedFrom  The source file the statements were copied from, if any
     * @param imports     The expected import edit, or null when none is added
     * @param output      The expected inserted text, or null when the paste is refused
     */
    private record TestConfig(String description, String source, String text, LinePosition target,
                              String copiedFrom, String imports, String output) {

        public String description() {
            return description == null ? "" : description;
        }
    }
}
