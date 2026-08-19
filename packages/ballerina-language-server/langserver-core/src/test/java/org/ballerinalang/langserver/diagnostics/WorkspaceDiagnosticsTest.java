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

package org.ballerinalang.langserver.diagnostics;

import org.ballerinalang.langserver.LSContextOperation;
import org.ballerinalang.langserver.commons.DocumentServiceContext;
import org.ballerinalang.langserver.commons.LanguageServerContext;
import org.ballerinalang.langserver.commons.eventsync.exceptions.EventSyncException;
import org.ballerinalang.langserver.commons.workspace.WorkspaceDocumentException;
import org.ballerinalang.langserver.contexts.ContextBuilder;
import org.ballerinalang.langserver.contexts.LanguageServerContextImpl;
import org.ballerinalang.langserver.diagnostic.DiagnosticsHelper;
import org.ballerinalang.langserver.util.FileUtils;
import org.ballerinalang.langserver.util.TestUtil;
import org.ballerinalang.langserver.workspace.BallerinaWorkspaceManager;
import org.eclipse.lsp4j.Diagnostic;
import org.eclipse.lsp4j.DidChangeTextDocumentParams;
import org.eclipse.lsp4j.DidOpenTextDocumentParams;
import org.eclipse.lsp4j.TextDocumentContentChangeEvent;
import org.eclipse.lsp4j.TextDocumentItem;
import org.eclipse.lsp4j.VersionedTextDocumentIdentifier;
import org.eclipse.lsp4j.jsonrpc.Endpoint;
import org.testng.Assert;
import org.testng.annotations.AfterClass;
import org.testng.annotations.BeforeClass;
import org.testng.annotations.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

/**
 * Tests for workspace project diagnostics.
 *
 * @since 1.3.0
 */
public class WorkspaceDiagnosticsTest {

    private Endpoint serviceEndpoint;
    private final Path testRoot = FileUtils.RES_DIR.resolve("diagnostics").resolve("workspace-diag");
    private final LanguageServerContext serverContext = new LanguageServerContextImpl();
    private final BallerinaWorkspaceManager workspaceManager = new BallerinaWorkspaceManager(serverContext);

    @BeforeClass
    public void init() {
        this.serviceEndpoint = TestUtil.initializeLanguageSever();
    }

    @Test(description = "Test workspace diagnostics are collected from all packages on initialization")
    public void testWorkspaceDiagnosticsOnInitialization() throws WorkspaceDocumentException, EventSyncException {
        workspaceManager.loadProject(testRoot.toAbsolutePath());

        // Assert the diagnostics
        DocumentServiceContext serviceContext = ContextBuilder.buildDocumentServiceContext(
                testRoot.toUri().toString(),
                this.workspaceManager,
                LSContextOperation.TXT_DID_OPEN,
                this.serverContext);

        DiagnosticsHelper diagnosticsHelper = DiagnosticsHelper.getInstance(serverContext);
        Map<String, List<Diagnostic>> diagnosticsMap = diagnosticsHelper.getLatestDiagnostics(serviceContext);
        boolean hasProjADiagnostics = diagnosticsMap.keySet().stream()
                .anyMatch(key -> key.contains("projA"));
        boolean hasProjBDiagnostics = diagnosticsMap.keySet().stream()
                .anyMatch(key -> key.contains("projB"));
        Assert.assertTrue(hasProjADiagnostics, "Should have diagnostics entry for projA");
        Assert.assertTrue(hasProjBDiagnostics, "Should have diagnostics entry for projB");
    }

    @Test(description = "Test fixing error in dependency package clears cascading diagnostics in dependent")
    public void testWorkspaceDiagnosticsAfterDependentChange() throws IOException, WorkspaceDocumentException {
        Path projBFile = testRoot.resolve("projB").resolve("main.bal").toAbsolutePath();
        String projBOriginalContent = Files.readString(projBFile);

        // Open the document with an introduced error
        String projBWithError = projBOriginalContent.replace(
                "    return \"Hello\";",
                "    return \"Hello\" // Missing semicolon"
        );
        DidOpenTextDocumentParams openProjBParams = new DidOpenTextDocumentParams();
        TextDocumentItem projBItem = new TextDocumentItem();
        projBItem.setUri(projBFile.toUri().toString());
        projBItem.setText(projBWithError);
        openProjBParams.setTextDocument(projBItem);
        workspaceManager.didOpen(projBFile, openProjBParams);

        // Assert the diagnostics
        DocumentServiceContext projBContext = ContextBuilder.buildDocumentServiceContext(
                projBFile.toUri().toString(),
                this.workspaceManager,
                LSContextOperation.TXT_DID_OPEN,
                this.serverContext);

        DiagnosticsHelper diagnosticsHelper = DiagnosticsHelper.getInstance(serverContext);
        Map<String, List<Diagnostic>> diagnosticsMap = diagnosticsHelper.getLatestDiagnostics(projBContext);

        List<String> diagnostics = diagnosticsMap.values().stream()
                .flatMap(List::stream)
                .map(d -> d.getCode().getLeft())
                .toList();
        Assert.assertEquals(diagnostics.size(), 3, "There should be only 2 diagnostics");
        Assert.assertTrue(diagnostics.containsAll(List.of("BCE0600", "BCE0002", "BCE2003")));
    }

    @Test(description = "Test workspace diagnostics after changing function signature from string to string|error")
    public void testWorkspaceDiagnosticsAfterFunctionSignatureChange() throws IOException, WorkspaceDocumentException {
        Path projBFile = testRoot.resolve("projB").resolve("main.bal").toAbsolutePath();
        String projBOriginalContent = Files.readString(projBFile);

        // First open the document
        DidOpenTextDocumentParams openProjBParams = new DidOpenTextDocumentParams();
        TextDocumentItem projBItem = new TextDocumentItem();
        projBItem.setUri(projBFile.toUri().toString());
        projBItem.setText(projBOriginalContent);
        openProjBParams.setTextDocument(projBItem);
        workspaceManager.didOpen(projBFile, openProjBParams);

        // Check diagnostics after opening
        DocumentServiceContext projBContext = ContextBuilder.buildDocumentServiceContext(
                projBFile.toUri().toString(),
                this.workspaceManager,
                LSContextOperation.TXT_DID_OPEN,
                this.serverContext);
        DiagnosticsHelper diagnosticsHelper = DiagnosticsHelper.getInstance(serverContext);
        Map<String, List<Diagnostic>> initialDiagnosticsMap = diagnosticsHelper.getLatestDiagnostics(projBContext);

        // Assert the initial diagnostics
        List<String> actualInitialDiagnostics = initialDiagnosticsMap.values().stream()
                .flatMap(List::stream)
                .map(d -> d.getCode().getLeft())
                .toList();
        Assert.assertEquals(actualInitialDiagnostics.size(), 2, "Initially, there should be only two diagnostics");
        Assert.assertTrue(actualInitialDiagnostics.containsAll(List.of("BCE0600", "BCE2003")));

        // Now make the change to function signature from returns string to returns string|error
        String modifiedProjBContent = projBOriginalContent.replace(
                "public function getMessage() returns string {",
                "public function getMessage() returns string|error {"
        );
        DidChangeTextDocumentParams changeParams = new DidChangeTextDocumentParams();
        changeParams.setTextDocument(new VersionedTextDocumentIdentifier(projBFile.toUri().toString(), 1));
        TextDocumentContentChangeEvent contentChange = new TextDocumentContentChangeEvent(modifiedProjBContent);
        changeParams.setContentChanges(List.of(contentChange));
        workspaceManager.didChange(projBFile, changeParams);

        // Update context after the change
        DocumentServiceContext updatedProjBContext = ContextBuilder.buildDocumentServiceContext(
                projBFile.toUri().toString(),
                this.workspaceManager,
                LSContextOperation.TXT_DID_CHANGE,
                this.serverContext);

        Map<String, List<Diagnostic>> finalDiagnosticsMap = diagnosticsHelper.getLatestDiagnostics(updatedProjBContext);
        List<String> actualAfterChangeDiagnostics = finalDiagnosticsMap.values().stream()
                .flatMap(List::stream)
                .map(d -> d.getCode().getLeft())
                .toList();

        Assert.assertEquals(actualAfterChangeDiagnostics.size(), 3, "Finally, there should be 3 diagnostics");
        Assert.assertTrue(actualAfterChangeDiagnostics.containsAll(List.of("BCE0600", "BCE2003", "BCE2066")));
    }

    @Test(description = "Test the cleanup of diagnostics in a workspace project", enabled = false)
    // TODO: Enable after resolving https://github.com/wso2/product-ballerina-integrator/issues/1488
    // A `didChange` sent to `projB` incorrectly reverted the changes in `projA`.
    public void testWorkspaceDiagnosticsAfterFunctionRename() throws IOException, WorkspaceDocumentException {
        Path projAFile = testRoot.resolve("projA").resolve("main.bal").toAbsolutePath();
        Path projBFile = testRoot.resolve("projB").resolve("main.bal").toAbsolutePath();
        String projAOriginalContent = Files.readString(projAFile);
        String projBOriginalContent = Files.readString(projBFile);

        // Step 1: Open projA with original content
        DidOpenTextDocumentParams openProjAParams = new DidOpenTextDocumentParams();
        TextDocumentItem projAItem = new TextDocumentItem();
        projAItem.setUri(projAFile.toUri().toString());
        projAItem.setText(projAOriginalContent);
        openProjAParams.setTextDocument(projAItem);
        workspaceManager.didOpen(projAFile, openProjAParams);
        DiagnosticsHelper diagnosticsHelper = DiagnosticsHelper.getInstance(serverContext);

        // Step 2: Modify projA to call getMsg() instead of getMessage()
        String modifiedProjAContent = projAOriginalContent.replace(
                "projB:getMessage()",
                "projB:getMsg()"
        );
        DidChangeTextDocumentParams changeProjAParams = new DidChangeTextDocumentParams();
        changeProjAParams.setTextDocument(new VersionedTextDocumentIdentifier(projAFile.toUri().toString(), 1));
        TextDocumentContentChangeEvent projAContentChange = new TextDocumentContentChangeEvent(modifiedProjAContent);
        changeProjAParams.setContentChanges(List.of(projAContentChange));
        workspaceManager.didChange(projAFile, changeProjAParams);

        // Step 3: Verify diagnostics are shown in projA (undefined function error)
        DocumentServiceContext afterProjAChangeContext = ContextBuilder.buildDocumentServiceContext(
                projAFile.toUri().toString(),
                this.workspaceManager,
                LSContextOperation.TXT_DID_CHANGE,
                this.serverContext);
        Map<String, List<Diagnostic>> afterProjAChangeDiagnosticsMap =
                diagnosticsHelper.getLatestDiagnostics(afterProjAChangeContext);
        List<String> afterProjAChangeDiagnostics = afterProjAChangeDiagnosticsMap.values().stream()
                .flatMap(List::stream)
                .map(d -> d.getCode().getLeft())
                .toList();
        Assert.assertTrue(afterProjAChangeDiagnostics.contains("BCE2003"),
                "Should have BCE2003 (undefined function) error after renaming in projA");

        // Step 4: Open projB and modify getMessage() to getMsg()
        DidOpenTextDocumentParams openProjBParams = new DidOpenTextDocumentParams();
        TextDocumentItem projBItem = new TextDocumentItem();
        projBItem.setUri(projBFile.toUri().toString());
        projBItem.setText(projBOriginalContent);
        openProjBParams.setTextDocument(projBItem);
        workspaceManager.didOpen(projBFile, openProjBParams);

        String modifiedProjBContent = projBOriginalContent.replace(
                "public function getMessage() returns string {",
                "public function getMsg() returns string {"
        );
        DidChangeTextDocumentParams changeProjBParams = new DidChangeTextDocumentParams();
        changeProjBParams.setTextDocument(new VersionedTextDocumentIdentifier(projBFile.toUri().toString(), 1));
        TextDocumentContentChangeEvent projBContentChange = new TextDocumentContentChangeEvent(modifiedProjBContent);
        changeProjBParams.setContentChanges(List.of(projBContentChange));
        workspaceManager.didChange(projBFile, changeProjBParams);

        // Step 5: Verify diagnostics are cleared in projA
        DocumentServiceContext afterProjBChangeContext = ContextBuilder.buildDocumentServiceContext(
                projBFile.toUri().toString(),
                this.workspaceManager,
                LSContextOperation.TXT_DID_CHANGE,
                this.serverContext);
        Map<String, List<Diagnostic>> finalDiagnosticsMap =
                diagnosticsHelper.getLatestDiagnostics(afterProjBChangeContext);
        List<String> finalDiagnostics = finalDiagnosticsMap.values().stream()
                .flatMap(List::stream)
                .map(d -> d.getCode().getLeft())
                .toList();
        Assert.assertFalse(finalDiagnostics.contains("BCE2003"),
                "Should not have BCE2003 (undefined function) error after fixing projB");
    }

    @AfterClass
    public void cleanupLanguageServer() {
        TestUtil.shutdownLanguageServer(this.serviceEndpoint);
        this.serviceEndpoint = null;
    }
}
