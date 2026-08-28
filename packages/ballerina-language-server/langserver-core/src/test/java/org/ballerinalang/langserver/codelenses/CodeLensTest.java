/*
 *  Copyright (c) 2019, WSO2 Inc. (http://www.wso2.org) All Rights Reserved.
 *
 *  WSO2 Inc. licenses this file to you under the Apache License,
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
package org.ballerinalang.langserver.codelenses;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import org.ballerinalang.langserver.codelenses.providers.TryItCodeLensProvider;
import org.ballerinalang.langserver.util.FileUtils;
import org.ballerinalang.langserver.util.TestUtil;
import org.eclipse.lsp4j.CodeLens;
import org.eclipse.lsp4j.Command;
import org.eclipse.lsp4j.jsonrpc.Endpoint;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.testng.Assert;
import org.testng.annotations.AfterClass;
import org.testng.annotations.BeforeClass;
import org.testng.annotations.DataProvider;
import org.testng.annotations.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

/**
 * Test code lens feature in language server.
 */
public class CodeLensTest {

    private static final Path BASE_PATH = FileUtils.RES_DIR.resolve("codelens");
    private Endpoint serviceEndpoint;
    private static final Logger log = LoggerFactory.getLogger(CodeLensTest.class);
    private static final Gson GSON = new Gson();


    @BeforeClass
    public void loadLangServer() {
        System.setProperty(TryItCodeLensProvider.TRY_IT_TEST_KEY, "true");
        serviceEndpoint = TestUtil.initializeLanguageSever();
    }

    @Test(description = "Test Code Lenses", dataProvider = "codeLensConfigurations")
    public void codeLensTest(String configFileName) throws IOException {
        String configContent = getExpectedValue(configFileName);
        JsonObject config = JsonParser.parseString(configContent).getAsJsonObject();
        String source = config.get("source").getAsString();
        Path sourceFilePath = BASE_PATH.resolve("source").resolve(source);

        TestUtil.openDocument(serviceEndpoint, sourceFilePath);
        String response = TestUtil.getCodeLensesResponse(sourceFilePath.toString(), serviceEndpoint);
        testCodeLenses(configFileName, response);
        TestUtil.closeDocument(serviceEndpoint, sourceFilePath);
    }

    private void testCodeLenses(String expectedConfigName, String response) throws IOException {
        String expected = getExpectedValue(expectedConfigName);

        List<CodeLens> expectedItemList = getFlattenItemList(
                JsonParser.parseString(expected).getAsJsonObject().getAsJsonArray("result"));
        List<CodeLens> responseItemList = getFlattenItemList(
                JsonParser.parseString(response).getAsJsonObject().getAsJsonArray("result"));

        boolean isSameSize = expectedItemList.size() == responseItemList.size();
        boolean isSubList = getStringListForEvaluation(responseItemList).containsAll(
                getStringListForEvaluation(expectedItemList));

        if (!isSameSize || !isSubList) {
//            updateConfig(expectedConfigName, response);
            Assert.fail("Code lens test failed for: " + expectedConfigName);
        }
    }

    @AfterClass
    public void shutDownLanguageServer() {
        TestUtil.shutdownLanguageServer(this.serviceEndpoint);
        this.serviceEndpoint = null;
        System.clearProperty(TryItCodeLensProvider.TRY_IT_TEST_KEY);
    }

    @DataProvider(name = "codeLensConfigurations")
    public Object[][] getCodeLensConfigurations() {
        return new Object[][]{
                {"test.json"},
                {"main.json"},
                {"functions.json"},
                {"try_it.json"},
                {"visualize.json"},
                {"visualize_default_module.json"},
                {"visualize_submodule.json"}
        };
    }

    /**
     * Get the expected value from the expected file.
     *
     * @param expectedFile json file which contains expected content.
     * @return string content read from the json file.
     */
    private String getExpectedValue(String expectedFile) throws IOException {
        Path expectedFilePath = BASE_PATH.resolve("config").resolve(expectedFile);
        byte[] expectedByte = Files.readAllBytes(expectedFilePath);
        return new String(expectedByte);
    }

    private static List<CodeLens> getFlattenItemList(JsonArray expectedItems) {
        List<CodeLens> flattenList = new ArrayList<>();
        expectedItems.forEach(jsonElement -> {
            CodeLens codeLens = GSON.fromJson(jsonElement, CodeLens.class);
            flattenList.add(codeLens);
        });

        return flattenList;
    }

    private static String getCodeLensPropertyString(CodeLens codeLens) {
        String additionalTextEdits = "";
        if (codeLens.getRange() != null) {
            additionalTextEdits = "," + GSON.toJson(codeLens.getRange());
        }

        Command command = codeLens.getCommand();
        if (command != null) {
            additionalTextEdits = "," + command.getTitle() + ", " + command.getCommand();
        }

        return ("{" + additionalTextEdits + "}");
    }

    private static List<String> getStringListForEvaluation(List<CodeLens> codeLenses) {
        List<String> evalList = new ArrayList<>();
        codeLenses.forEach(completionItem -> evalList.add(getCodeLensPropertyString(completionItem)));
        return evalList;
    }

    /**
     * Utility function to write the configuration file with the response value. This can be used to update test
     * expectations or for debugging purposes.
     *
     * @param configFileName the name of the configuration file
     * @param response       the response string to write
     * @throws IOException if writing to file fails
     */
    private void updateConfig(String configFileName, String response) throws IOException {
        String configContent = getExpectedValue(configFileName);
        JsonObject config = JsonParser.parseString(configContent).getAsJsonObject();

        // Parse the response and add it to the config
        JsonObject responseJson = JsonParser.parseString(response).getAsJsonObject();
        JsonArray resultArray = responseJson.getAsJsonArray("result");

        // Normalize file paths in the result array
        normalizeFilePaths(resultArray);

        config.add("result", resultArray);

        // Write back to the expected file
        Path expectedFilePath = BASE_PATH.resolve("config").resolve(configFileName);
        String prettyJson = GSON.newBuilder().setPrettyPrinting().create().toJson(config);
        Files.write(expectedFilePath, prettyJson.getBytes());

        log.info("Updated configuration file: " + configFileName);
    }

    /**
     * Normalize file paths by replacing full file URIs with just filenames.
     *
     * @param jsonArray the JSON array to normalize
     */
    private void normalizeFilePaths(JsonArray jsonArray) {
        for (int i = 0; i < jsonArray.size(); i++) {
            if (jsonArray.get(i).isJsonObject()) {
                JsonObject obj = jsonArray.get(i).getAsJsonObject();
                normalizeFilePathsInObject(obj);
            } else if (jsonArray.get(i).isJsonPrimitive() && jsonArray.get(i).getAsJsonPrimitive().isString()) {
                String normalizedValue = normalizePrimitiveFilePath(jsonArray.get(i).getAsString());
                if (normalizedValue != null) {
                    jsonArray.set(i, GSON.toJsonTree(normalizedValue));
                }
            } else if (jsonArray.get(i).isJsonArray()) {
                normalizeFilePaths(jsonArray.get(i).getAsJsonArray());
            }
        }
    }

    /**
     * Recursively normalize file paths in a JSON object.
     *
     * @param obj the JSON object to normalize
     */
    private void normalizeFilePathsInObject(JsonObject obj) {
        obj.entrySet().forEach(entry -> {
            if (entry.getValue().isJsonPrimitive() && entry.getValue().getAsJsonPrimitive().isString()) {
                String normalizedValue = normalizePrimitiveFilePath(entry.getValue().getAsString());
                if (normalizedValue != null) {
                    entry.setValue(GSON.toJsonTree(normalizedValue));
                }
            } else if (entry.getValue().isJsonObject()) {
                normalizeFilePathsInObject(entry.getValue().getAsJsonObject());
            } else if (entry.getValue().isJsonArray()) {
                normalizeFilePaths(entry.getValue().getAsJsonArray());
            }
        });
    }

    /**
     * Normalize a primitive string value if it contains a file path.
     *
     * @param value the string value to normalize
     * @return the normalized filename if it was a file path, null otherwise
     */
    private String normalizePrimitiveFilePath(String value) {
        if (value.startsWith("file://") && value.contains("/")) {
            // Extract just the filename from the full path
            return value.substring(value.lastIndexOf("/") + 1);
        }
        return null;
    }
}
