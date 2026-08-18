/*
 * Copyright (c) 2018, WSO2 Inc. (http://wso2.com) All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package org.ballerinalang.langserver.formatting;

import com.google.gson.Gson;
import com.google.gson.internal.LinkedTreeMap;
import org.ballerinalang.langserver.util.FileUtils;
import org.ballerinalang.langserver.util.TestUtil;
import org.eclipse.lsp4j.DidChangeWatchedFilesParams;
import org.eclipse.lsp4j.DidSaveTextDocumentParams;
import org.eclipse.lsp4j.DocumentFormattingParams;
import org.eclipse.lsp4j.FileChangeType;
import org.eclipse.lsp4j.FileEvent;
import org.eclipse.lsp4j.FormattingOptions;
import org.eclipse.lsp4j.TextDocumentIdentifier;
import org.eclipse.lsp4j.jsonrpc.Endpoint;
import org.eclipse.lsp4j.jsonrpc.messages.ResponseMessage;
import org.testng.Assert;
import org.testng.annotations.AfterClass;
import org.testng.annotations.BeforeClass;
import org.testng.annotations.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

/**
 * Test suit for source code formatting.
 */
public class FormattingTest {
    private final Path formattingDirectory = FileUtils.RES_DIR.resolve("formatting");
    private Endpoint serviceEndpoint;

    @BeforeClass
    public void loadLangServer() {
        this.serviceEndpoint = TestUtil.initializeLanguageSever();
    }

    @Test(description = "test formatting functionality on functions")
    public void formatTestSuit() throws IOException {
        Path expectedFilePath = formattingDirectory.resolve("expected.bal");
        Path inputFilePath = formattingDirectory.resolve("source.bal");

        String expected = new String(Files.readAllBytes(expectedFilePath));
        expected = expected.replaceAll("\\r\\n", "\n");
        DocumentFormattingParams documentFormattingParams = new DocumentFormattingParams();

        TextDocumentIdentifier textDocumentIdentifier1 = new TextDocumentIdentifier();
        textDocumentIdentifier1.setUri(Path.of(inputFilePath.toString()).toUri().toString());

        FormattingOptions formattingOptions = new FormattingOptions();
        formattingOptions.setInsertSpaces(true);
        formattingOptions.setTabSize(4);

        documentFormattingParams.setOptions(formattingOptions);
        documentFormattingParams.setTextDocument(textDocumentIdentifier1);

        TestUtil.openDocument(this.serviceEndpoint, inputFilePath);

        String result = TestUtil.getFormattingResponse(documentFormattingParams, this.serviceEndpoint);
        Gson gson = new Gson();
        ResponseMessage responseMessage = gson.fromJson(result, ResponseMessage.class);
        String actual = (String) ((LinkedTreeMap<?, ?>) ((List<?>) responseMessage.getResult()).get(0)).get("newText");
        actual = actual.replaceAll("\\r\\n", "\n");
        TestUtil.closeDocument(this.serviceEndpoint, inputFilePath);
        Assert.assertEquals(actual, expected);
    }

    @Test(description = "test formatting functionality on functions with configurations")
    public void formatTestSuiteWithConfigurations() throws IOException {
        Path inputProject = formattingDirectory.resolve("project");
        Path expectedProject = formattingDirectory.resolve("projectExpected");
        Path expectedFilePath = expectedProject.resolve("main.bal");
        Path inputFilePath = inputProject.resolve("main.bal");

        String expected = new String(Files.readAllBytes(expectedFilePath));
        expected = expected.replaceAll("\\r\\n", "\n");
        DocumentFormattingParams documentFormattingParams = new DocumentFormattingParams();

        TextDocumentIdentifier textDocumentIdentifier1 = new TextDocumentIdentifier();
        textDocumentIdentifier1.setUri(Path.of(inputFilePath.toString()).toUri().toString());

        FormattingOptions formattingOptions = new FormattingOptions();

        documentFormattingParams.setOptions(formattingOptions);
        documentFormattingParams.setTextDocument(textDocumentIdentifier1);

        TestUtil.openDocument(this.serviceEndpoint, inputFilePath);

        String result = TestUtil.getFormattingResponse(documentFormattingParams, this.serviceEndpoint);
        Gson gson = new Gson();
        ResponseMessage responseMessage = gson.fromJson(result, ResponseMessage.class);
        String actual = (String) ((LinkedTreeMap<?, ?>) ((List<?>) responseMessage.getResult()).get(0)).get("newText");
        actual = actual.replaceAll("\\r\\n", "\n");
        TestUtil.closeDocument(this.serviceEndpoint, inputFilePath);
        Assert.assertEquals(actual, expected);
    }

    @Test(description = "test formatting before and after extending the document via "
            + "textDocument/didChange, textDocument/didSave and workspace/didChangeWatchedFiles")
    public void formatTestSuiteAfterDidChange() throws IOException {
        Path inputProjectDir = formattingDirectory.resolve("didChangeProject");
        Path inputFilePath = inputProjectDir.resolve("main.bal");
        Path additionFilePath = inputProjectDir.resolve("addition.bal");
        Path expectedInitialFilePath = inputProjectDir.resolve("expectedInitial.bal");
        Path expectedFilePath = inputProjectDir.resolve("expectedMain.bal");

        String expectedInitial = new String(Files.readAllBytes(expectedInitialFilePath))
                .replaceAll("\\r\\n", "\n");

        // The on-disk file represents the previously formatted text. The client then sends a
        // didChange with additional content before requesting formatting. The formatting response
        // must use this latest didChange content, not the previous on-disk content.
        String additionContent = new String(Files.readAllBytes(additionFilePath));
        String changedContent = expectedInitial.replace("\n}", "\n" + additionContent + "}");
        TestUtil.didChangeDocument(this.serviceEndpoint, inputFilePath, changedContent);
        this.didSaveDocument(inputFilePath);
        this.didChangeWatchedFile(inputFilePath);

        String expected = new String(Files.readAllBytes(expectedFilePath)).replaceAll("\\r\\n", "\n");
        String actual = this.formatAndGetNewText(inputFilePath);
        TestUtil.closeDocument(this.serviceEndpoint, inputFilePath);
        Assert.assertEquals(actual, expected,
                "Formatting must reflect the in-memory content extended via textDocument/didChange.");
    }

    /**
     * Invokes textDocument/formatting on the given file and returns the resulting newText, with
     * CRLF line endings normalized to LF for stable comparisons.
     *
     * @param filePath File to format; must already be opened on the service endpoint
     * @return Formatted source as newText
     */
    private String formatAndGetNewText(Path filePath) {
        DocumentFormattingParams documentFormattingParams = new DocumentFormattingParams();
        TextDocumentIdentifier textDocumentIdentifier = new TextDocumentIdentifier();
        textDocumentIdentifier.setUri(Path.of(filePath.toString()).toUri().toString());
        documentFormattingParams.setTextDocument(textDocumentIdentifier);
        documentFormattingParams.setOptions(new FormattingOptions());

        String result = TestUtil.getFormattingResponse(documentFormattingParams, this.serviceEndpoint);
        Gson gson = new Gson();
        ResponseMessage responseMessage = gson.fromJson(result, ResponseMessage.class);
        String actual =
                (String) ((LinkedTreeMap<?, ?>) ((List<?>) responseMessage.getResult()).get(0)).get("newText");
        return actual.replaceAll("\\r\\n", "\n");
    }

    /**
     * Sends textDocument/didSave for the given file.
     *
     * @param filePath Saved file path
     */
    private void didSaveDocument(Path filePath) {
        TextDocumentIdentifier textDocumentIdentifier = new TextDocumentIdentifier();
        textDocumentIdentifier.setUri(Path.of(filePath.toString()).toUri().toString());
        DidSaveTextDocumentParams params = new DidSaveTextDocumentParams(textDocumentIdentifier);
        this.serviceEndpoint.notify("textDocument/didSave", params);
    }

    /**
     * Sends workspace/didChangeWatchedFiles with a Changed event for the given file.
     *
     * @param filePath Changed file path
     */
    private void didChangeWatchedFile(Path filePath) {
        FileEvent fileEvent = new FileEvent(filePath.toUri().toString(), FileChangeType.Changed);
        DidChangeWatchedFilesParams params = new DidChangeWatchedFilesParams(List.of(fileEvent));
        TestUtil.didChangeWatchedFiles(this.serviceEndpoint, params);
    }

    @AfterClass
    public void shutdownLanguageServer() {
        TestUtil.shutdownLanguageServer(this.serviceEndpoint);
        this.serviceEndpoint = null;
    }
}
