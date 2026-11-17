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

import org.ballerinalang.langserver.BallerinaLanguageServer;
import org.ballerinalang.langserver.commons.client.ExtendedLanguageClient;
import org.ballerinalang.langserver.util.TestUtil;
import org.eclipse.lsp4j.PublishDiagnosticsParams;
import org.eclipse.lsp4j.jsonrpc.Endpoint;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;
import org.testng.Assert;
import org.testng.annotations.AfterClass;
import org.testng.annotations.BeforeClass;
import org.testng.annotations.Test;

import java.io.IOException;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

/**
 * Tests that expr:// document events do not suppress the diagnostics published for file:// documents.
 */
public class ExprSchemeDiagnosticsTest {

    private static final Path PROJECT_FILE =
            Path.of("src/test/resources/project/myproject2/main.bal").toAbsolutePath();
    private static final long PUBLISH_TIMEOUT_MS = 30000;
    private static final long DEBOUNCE_WAIT_MS = 3000;
    private static final String UNKNOWN_TYPE = "koko";

    private Endpoint serviceEndpoint;
    private ExtendedLanguageClient client;

    @BeforeClass
    public void init() {
        this.client = Mockito.mock(ExtendedLanguageClient.class);
        this.serviceEndpoint = TestUtil.newLanguageServer()
                .withLanguageServer(new BallerinaLanguageServer())
                .withClient(client)
                .build();
    }

    // Replays a low-code edit followed by the form opening and closing its expr:// copy.
    @Test
    public void testExprEventsDoNotSuppressFileDiagnostics() throws IOException {
        String fileUri = PROJECT_FILE.toUri().toString();
        String exprUri = toExprUri(fileUri);
        String erroneousContent = erroneousContent();

        Mockito.clearInvocations(client);
        TestUtil.openDocument(serviceEndpoint, fileUri, Files.readString(PROJECT_FILE));
        TestUtil.didChangeDocument(serviceEndpoint, URI.create(fileUri), erroneousContent);
        TestUtil.openDocument(serviceEndpoint, exprUri, erroneousContent);
        TestUtil.closeDocument(serviceEndpoint, exprUri);

        try {
            assertFileDiagnosticsPublished(fileUri);
        } finally {
            TestUtil.closeDocument(serviceEndpoint, fileUri);
        }
    }

    // The expr:// copy is edited and stays open past the debounce, so an expr publish would compile and relabel.
    @Test
    public void testOpenExprCopyDoesNotRelabelFileDiagnostics() throws IOException, InterruptedException {
        String fileUri = PROJECT_FILE.toUri().toString();
        String exprUri = toExprUri(fileUri);
        String erroneousContent = erroneousContent();

        Mockito.clearInvocations(client);
        TestUtil.openDocument(serviceEndpoint, fileUri, Files.readString(PROJECT_FILE));
        TestUtil.didChangeDocument(serviceEndpoint, URI.create(fileUri), erroneousContent);
        TestUtil.openDocument(serviceEndpoint, exprUri, erroneousContent);
        TestUtil.didChangeDocument(serviceEndpoint, URI.create(exprUri), erroneousContent + "// form edit");

        try {
            Thread.sleep(DEBOUNCE_WAIT_MS);
            TestUtil.closeDocument(serviceEndpoint, exprUri);
            assertFileDiagnosticsPublished(fileUri);
        } finally {
            TestUtil.closeDocument(serviceEndpoint, fileUri);
        }
    }

    private void assertFileDiagnosticsPublished(String fileUri) {
        Mockito.verify(client, Mockito.timeout(PUBLISH_TIMEOUT_MS).atLeastOnce())
                .publishDiagnostics(Mockito.argThat(params -> params != null &&
                        fileUri.equals(params.getUri()) && hasUnknownTypeError(params)));

        // Wait past the 1s debounce so any late publish (e.g. one clearing the file) is captured too.
        ArgumentCaptor<PublishDiagnosticsParams> captor = ArgumentCaptor.forClass(PublishDiagnosticsParams.class);
        Mockito.verify(client, Mockito.after(DEBOUNCE_WAIT_MS).atLeastOnce()).publishDiagnostics(captor.capture());
        List<PublishDiagnosticsParams> published = captor.getAllValues();

        Assert.assertTrue(published.stream().noneMatch(params -> params.getUri().startsWith("expr:")),
                "Diagnostics must not be published under the expr:// scheme");
        PublishDiagnosticsParams lastForFile = published.stream()
                .filter(params -> fileUri.equals(params.getUri()))
                .reduce((first, second) -> second)
                .orElseThrow();
        Assert.assertTrue(hasUnknownTypeError(lastForFile),
                "The last diagnostics published for the edited file must contain the unknown type error");
    }

    private static boolean hasUnknownTypeError(PublishDiagnosticsParams params) {
        return params.getDiagnostics().stream().anyMatch(diagnostic -> diagnostic.getMessage().contains(UNKNOWN_TYPE));
    }

    private static String toExprUri(String fileUri) {
        return fileUri.replace("file:///", "expr:///");
    }

    private static String erroneousContent() throws IOException {
        return Files.readString(PROJECT_FILE) + System.lineSeparator() + "function function1() returns " +
                UNKNOWN_TYPE + " {" + System.lineSeparator() + "}" + System.lineSeparator();
    }

    @AfterClass
    public void cleanupLanguageServer() {
        TestUtil.shutdownLanguageServer(this.serviceEndpoint);
        this.serviceEndpoint = null;
    }
}
