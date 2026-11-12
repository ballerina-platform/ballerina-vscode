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
        String originalContent = Files.readString(PROJECT_FILE);
        String fileUri = PROJECT_FILE.toUri().toString();
        String exprUri = fileUri.replace("file:///", "expr:///");
        String erroneousContent = originalContent + System.lineSeparator() +
                "function function1() returns koko {" + System.lineSeparator() + "}" + System.lineSeparator();

        TestUtil.openDocument(serviceEndpoint, fileUri, originalContent);
        TestUtil.didChangeDocument(serviceEndpoint, URI.create(fileUri), erroneousContent);
        TestUtil.openDocument(serviceEndpoint, exprUri, erroneousContent);
        TestUtil.closeDocument(serviceEndpoint, exprUri);

        try {
            Mockito.verify(client, Mockito.timeout(PUBLISH_TIMEOUT_MS).atLeastOnce())
                    .publishDiagnostics(Mockito.argThat(params -> params != null &&
                            fileUri.equals(params.getUri()) && !params.getDiagnostics().isEmpty()));

            ArgumentCaptor<PublishDiagnosticsParams> captor = ArgumentCaptor.forClass(PublishDiagnosticsParams.class);
            Mockito.verify(client, Mockito.atLeastOnce()).publishDiagnostics(captor.capture());
            List<PublishDiagnosticsParams> published = captor.getAllValues();

            Assert.assertTrue(published.stream().noneMatch(params -> params.getUri().startsWith("expr:")),
                    "Diagnostics must not be published under the expr:// scheme");
            PublishDiagnosticsParams lastForFile = published.stream()
                    .filter(params -> fileUri.equals(params.getUri()))
                    .reduce((first, second) -> second)
                    .orElseThrow();
            Assert.assertFalse(lastForFile.getDiagnostics().isEmpty(),
                    "The last diagnostics published for the edited file must contain the unknown type error");
        } finally {
            TestUtil.closeDocument(serviceEndpoint, fileUri);
        }
    }

    @AfterClass
    public void cleanupLanguageServer() {
        TestUtil.shutdownLanguageServer(this.serviceEndpoint);
        this.serviceEndpoint = null;
    }
}
