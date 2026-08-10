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

package io.ballerina.copilotagent.extension;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import io.ballerina.copilotagent.extension.request.SemanticDiffRequest;
import io.ballerina.modelgenerator.commons.AbstractLSTest;
import org.eclipse.lsp4j.DidChangeTextDocumentParams;
import org.eclipse.lsp4j.DidOpenTextDocumentParams;
import org.eclipse.lsp4j.TextDocumentContentChangeEvent;
import org.eclipse.lsp4j.TextDocumentItem;
import org.eclipse.lsp4j.VersionedTextDocumentIdentifier;
import org.testng.Assert;
import org.testng.annotations.AfterMethod;
import org.testng.annotations.BeforeMethod;
import org.testng.annotations.Test;

import java.io.BufferedReader;
import java.io.IOException;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;
import java.util.Optional;
import java.util.regex.Pattern;
import java.util.stream.Stream;

/**
 * Test for comparing file schema projects and ai schema projects.
 *
 * @since 1.5.0
 */
public class SemanticDiffComputerTest extends AbstractLSTest {

    @Override
    @Test(dataProvider = "data-provider")
    public void test(Path config) throws IOException {
        // Read the test config
        Path configJsonPath = configDir.resolve(config);
        BufferedReader bufferedReader = Files.newBufferedReader(configJsonPath);
        TestConfig testConfig = gson.fromJson(bufferedReader, TestConfig.class);
        bufferedReader.close();

        // Get the path of the project
        Path originalProjectPath = sourceDir.resolve(testConfig.projectPath()).resolve("original");
        Path modifiedProjectPath = sourceDir.resolve(testConfig.projectPath()).resolve("modified");

        // ai:// holds the frozen baseline throughout; open it (and file://) with the original content
        Optional<Path> balFile = Files.walk(originalProjectPath).filter(Files::isRegularFile)
                .filter(path -> path.toString().endsWith(".bal")).findFirst();
        if (balFile.isPresent()) {
            notifyCustomDidOpen(balFile.get().toString(), "file://");
            notifyCustomDidOpen(balFile.get().toString(), "ai://");
        }

        // read all the modified files in the modified project path
        // file:// is the live/edited project, so modified content lands there

        try (Stream<Path> modifiedFiles = Files.walk(modifiedProjectPath)) {
            modifiedFiles.filter(Files::isRegularFile)
                    .filter(path -> path.toString().endsWith(".bal"))
                    .forEach(filePath -> {
                        try {
                            notifyCustomDidChange(filePath.toString());
                        } catch (IOException e) {
                            throw new RuntimeException(e);
                        }
                    });
        }

        SemanticDiffRequest request = new SemanticDiffRequest(originalProjectPath.toString());
        JsonObject jsonResponse = getResponseAndCloseFile(request, originalProjectPath.toString());
        JsonElement actualOutput = gson.toJsonTree(jsonResponse);
        String outputJsonStr = normalizeJsonPaths(actualOutput.toString(), originalProjectPath.toString());
        actualOutput = gson.fromJson(outputJsonStr, JsonElement.class);
        // assert the results
        if (!actualOutput.equals(testConfig.output())) {
            TestConfig updatedConfig = new TestConfig(testConfig.description(), 
                    testConfig.projectPath(), actualOutput.getAsJsonObject());
//            updateConfig(configJsonPath, updatedConfig);
            Assert.fail(String.format("Failed test: '%s' (%s)", testConfig.description(), configJsonPath));
        }
    }

    public String normalizeJsonPaths(String json, String basePath) {
        String normalizedBase = basePath.replace("\\", "/");

        if (normalizedBase.endsWith("/")) {
            normalizedBase = normalizedBase.substring(0, normalizedBase.length() - 1);
        }

        String pathPattern = normalizedBase.startsWith("/")
                ? normalizedBase.substring(1)
                : normalizedBase;

        String result = json.replaceAll(
                Pattern.quote("ai:///" + pathPattern + "/"),
                "ai:///"
        );

        result = result.replaceAll(
                Pattern.quote(pathPattern + "/"),
                ""
        );

        return result;
    }

    private void notifyCustomDidOpen(String sourcePath, String schema) {
        String exprUriString = getExprUriString(sourcePath, schema);
        String fileUri = URI.create(exprUriString).toString();
        TextDocumentItem textDocumentItem = getDocumentIdentifier(sourcePath, fileUri);
        sendNotification("textDocument/didOpen", new DidOpenTextDocumentParams(textDocumentItem));
    }

    private static String getExprUriString(String sourcePath, String schema) {
        URI sourceUri = Paths.get(sourcePath).toUri();
        return schema + sourceUri.getRawPath();
    }

    private void notifyCustomDidChange(String sourcePath) throws IOException {
        String exprUriString = getExprUriString(sourcePath, "file://");
        String fileUri = URI.create(exprUriString).toString().replace("modified", "original");
        String content = this.getText(sourcePath);
        VersionedTextDocumentIdentifier versionedTextDocumentIdentifier = new VersionedTextDocumentIdentifier();
        versionedTextDocumentIdentifier.setVersion(2);
        versionedTextDocumentIdentifier.setUri(fileUri);
        TextDocumentContentChangeEvent event = new TextDocumentContentChangeEvent();
        event.setText(content);
        DidChangeTextDocumentParams params = new DidChangeTextDocumentParams(versionedTextDocumentIdentifier,
                List.of(event));
        sendNotification("textDocument/didChange", params);
    }

    @Override
    protected String getResourceDir() {
        return "get_semantic_diff";
    }

    @Override
    protected Class<? extends AbstractLSTest> clazz() {
        return SemanticDiffComputerTest.class;
    }

    @Override
    protected String getServiceName() {
        return "copilotAgentService";
    }

    @Override
    protected String getApiName() {
        return "getSemanticDiff";
    }

    public record TestConfig(String description, String projectPath, JsonObject output) {
    }

    @AfterMethod
    @Override
    public void shutDownLanguageServer() {
        super.shutDownLanguageServer();
    }

    @BeforeMethod
    @Override
    public void startLanguageServer() {
        super.startLanguageServer();
    }
}
