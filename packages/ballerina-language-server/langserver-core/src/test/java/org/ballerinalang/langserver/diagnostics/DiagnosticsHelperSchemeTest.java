/*
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
package org.ballerinalang.langserver.diagnostics;

import org.ballerinalang.langserver.common.utils.CommonUtil;
import org.ballerinalang.langserver.commons.DocumentServiceContext;
import org.ballerinalang.langserver.commons.LanguageServerContext;
import org.ballerinalang.langserver.commons.client.ExtendedLanguageClient;
import org.ballerinalang.langserver.contexts.LanguageServerContextImpl;
import org.ballerinalang.langserver.diagnostic.DiagnosticsHelper;
import org.ballerinalang.langserver.util.FileUtils;
import org.ballerinalang.langserver.workspace.BallerinaWorkspaceManager;
import org.mockito.Mockito;
import org.testng.annotations.Test;

import java.nio.file.Path;

/**
 * Tests that {@link DiagnosticsHelper#compileAndSendDiagnostics} ignores clone-scheme contexts on its own.
 */
public class DiagnosticsHelperSchemeTest {

    // Has compile errors, so a file-scheme call always publishes diagnostics.
    private static final Path SOURCE_FILE =
            FileUtils.RES_DIR.resolve("diagnostics").resolve("sources").resolve("single_source.bal");

    @Test
    public void testFileSchemePublishesDiagnostics() throws Exception {
        ExtendedLanguageClient client = Mockito.mock(ExtendedLanguageClient.class);
        compileAndSend(client, "file");
        Mockito.verify(client, Mockito.atLeastOnce()).publishDiagnostics(Mockito.any());
    }

    @Test
    public void testExprSchemeDoesNotPublishDiagnostics() throws Exception {
        ExtendedLanguageClient client = Mockito.mock(ExtendedLanguageClient.class);
        compileAndSend(client, CommonUtil.EXPR_SCHEME);
        Mockito.verify(client, Mockito.never()).publishDiagnostics(Mockito.any());
    }

    private static void compileAndSend(ExtendedLanguageClient client, String uriScheme) throws Exception {
        LanguageServerContext serverContext = new LanguageServerContextImpl();
        BallerinaWorkspaceManager workspaceManager = Mockito.spy(new BallerinaWorkspaceManager(serverContext));
        Mockito.doReturn(uriScheme).when(workspaceManager).uriScheme();
        workspaceManager.loadProject(SOURCE_FILE);

        DocumentServiceContext context = Mockito.mock(DocumentServiceContext.class);
        Mockito.when(context.workspace()).thenReturn(workspaceManager);
        Mockito.when(context.filePath()).thenReturn(SOURCE_FILE);

        DiagnosticsHelper.getInstance(serverContext).compileAndSendDiagnostics(client, context);
    }
}
