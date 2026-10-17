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

package org.ballerinalang.langserver.launchers.stdio;

import org.eclipse.lsp4j.InitializeParams;
import org.eclipse.lsp4j.InitializeResult;
import org.eclipse.lsp4j.jsonrpc.Launcher;
import org.eclipse.lsp4j.services.LanguageClient;
import org.eclipse.lsp4j.services.LanguageServer;
import org.eclipse.lsp4j.services.TextDocumentService;
import org.eclipse.lsp4j.services.WorkspaceService;
import org.testng.Assert;
import org.testng.annotations.AfterMethod;
import org.testng.annotations.BeforeMethod;
import org.testng.annotations.Test;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;

/**
 * Tests for the stdio launcher's {@link Main}: the JSON-RPC stream guard ({@link Main#protectJsonRpcStream()}) and
 * the process lifecycle ({@link Main#serve(Main.ServerRun)}, {@link Main#onExit(ProcessHandle, Runnable)}) that
 * makes the server JVM end when its client is gone instead of lingering as an orphan.
 *
 * @since 1.7.3
 */
public class MainTest {

    private static final String ENABLE_OUTPUT_STREAM = "enableOutputStream";

    private PrintStream originalOut;
    private PrintStream originalErr;
    private String originalProperty;

    @BeforeMethod
    public void captureGlobalState() {
        originalOut = System.out;
        originalErr = System.err;
        originalProperty = System.getProperty(ENABLE_OUTPUT_STREAM);
    }

    @AfterMethod
    public void restoreGlobalState() {
        System.setOut(originalOut);
        System.setErr(originalErr);
        if (originalProperty == null) {
            System.clearProperty(ENABLE_OUTPUT_STREAM);
        } else {
            System.setProperty(ENABLE_OUTPUT_STREAM, originalProperty);
        }
    }

    @Test(description = "The central client output stream should be disabled to keep stdout free of pull output")
    public void testDisablesCentralOutputStream() {
        // Simulate a code path (e.g. a CLI CompileTask) that previously enabled the central output stream.
        System.setProperty(ENABLE_OUTPUT_STREAM, "true");

        Main.protectJsonRpcStream();

        Assert.assertEquals(System.getProperty(ENABLE_OUTPUT_STREAM), "false",
                "protectJsonRpcStream() must force the central output stream property to 'false'");
    }

    @Test(description = "Stray System.out writes must be redirected to stderr, not the JSON-RPC stdout stream")
    public void testRedirectsStdoutToStderr() {
        ByteArrayOutputStream stdoutBuffer = new ByteArrayOutputStream();
        ByteArrayOutputStream stderrBuffer = new ByteArrayOutputStream();
        System.setOut(new PrintStream(stdoutBuffer, true, StandardCharsets.UTF_8));
        System.setErr(new PrintStream(stderrBuffer, true, StandardCharsets.UTF_8));

        Main.protectJsonRpcStream();

        // A stray write that a dependency (central client, compiler, etc.) might emit.
        System.out.println("googleapis.gmail pulled from central successfully");

        String protocolStream = stdoutBuffer.toString(StandardCharsets.UTF_8);
        String diagnosticStream = stderrBuffer.toString(StandardCharsets.UTF_8);

        Assert.assertTrue(protocolStream.isEmpty(),
                "Nothing must reach the original stdout (JSON-RPC) stream, but found: " + protocolStream);
        Assert.assertTrue(diagnosticStream.contains("googleapis.gmail pulled from central successfully"),
                "Stray stdout writes must be redirected to stderr, but stderr was: " + diagnosticStream);
    }

    @Test(description = "The original stdout reference (used by lsp4j) must remain writable after protection")
    public void testOriginalStdoutRemainsUsableForProtocol() {
        ByteArrayOutputStream protocolBuffer = new ByteArrayOutputStream();
        PrintStream protocolStream = new PrintStream(protocolBuffer, true, StandardCharsets.UTF_8);
        System.setOut(protocolStream);
        System.setErr(new PrintStream(new ByteArrayOutputStream(), true, StandardCharsets.UTF_8));

        // Capture the original stdout the way Main#main does before invoking startServer/protectJsonRpcStream.
        PrintStream capturedForLsp4j = System.out;

        Main.protectJsonRpcStream();

        // lsp4j writes to the captured stream, which must still point at the real protocol sink.
        capturedForLsp4j.print("{\"jsonrpc\":\"2.0\"}");

        Assert.assertEquals(protocolBuffer.toString(StandardCharsets.UTF_8), "{\"jsonrpc\":\"2.0\"}",
                "The stdout reference captured before protection must still write to the protocol stream");
    }

    // ---- Process lifecycle: the JVM must end once the client is gone ----

    @Test(description = "lsp4j stops listening when the client's end of the stream closes, so startServer returns")
    public void testListeningEndsOnEndOfInput() throws Exception {
        Launcher<LanguageClient> launcher = Launcher.createLauncher(new NoOpLanguageServer(), LanguageClient.class,
                new ByteArrayInputStream(new byte[0]), new ByteArrayOutputStream());

        // A client that was killed (window reload, dead extension host) closes our stdin without ever sending
        // shutdown/exit. Main#serve relies on this returning rather than blocking forever.
        launcher.startListening().get(10, TimeUnit.SECONDS);
    }

    @Test(description = "A run that ends normally maps to a zero exit status")
    public void testServeMapsNormalCompletionToExitOk() {
        Assert.assertEquals(Main.serve(() -> { }), Main.EXIT_OK);
    }

    @Test(description = "A run that fails maps to a non-zero exit status")
    public void testServeMapsExecutionFailureToExitFailure() {
        Assert.assertEquals(Main.serve(() -> {
            throw new ExecutionException(new IOException("broken pipe"));
        }), Main.EXIT_FAILURE);
    }

    @Test(description = "An interrupted run maps to a non-zero exit status and keeps the interrupt flag")
    public void testServeMapsInterruptionToExitFailure() {
        try {
            Assert.assertEquals(Main.serve(() -> {
                throw new InterruptedException();
            }), Main.EXIT_FAILURE);
            Assert.assertTrue(Thread.currentThread().isInterrupted(),
                    "serve() must re-assert the interrupt flag it swallowed");
        } finally {
            // Clear the flag so it cannot leak into later tests.
            Assert.assertTrue(Thread.interrupted());
        }
    }

    @Test(description = "The exit action runs once the watched process has ended, and not before")
    public void testOnExitRunsActionOnlyAfterProcessEnds() throws Exception {
        String java = ProcessHandle.current().info().command()
                .orElseThrow(() -> new IllegalStateException("cannot locate the running java binary"));
        // A child that stays alive until its stdin is closed stands in for the extension host that launched us.
        Process watched = new ProcessBuilder(java, "-cp", System.getProperty("java.class.path"),
                BlockOnStdin.class.getName())
                .redirectErrorStream(true)
                .redirectOutput(ProcessBuilder.Redirect.DISCARD)
                .start();
        CountDownLatch exited = new CountDownLatch(1);
        try {
            Main.onExit(watched.toHandle(), exited::countDown);

            Assert.assertFalse(exited.await(500, TimeUnit.MILLISECONDS),
                    "the exit action must not run while the watched process is alive");

            watched.getOutputStream().close();

            Assert.assertTrue(exited.await(30, TimeUnit.SECONDS),
                    "the exit action must run after the watched process ends");
        } finally {
            watched.destroyForcibly();
        }
    }

    /**
     * Child-process entry point for {@link #testOnExitRunsActionOnlyAfterProcessEnds()}: lives until stdin closes.
     */
    public static final class BlockOnStdin {

        private BlockOnStdin() {
        }

        public static void main(String[] args) throws IOException {
            while (System.in.read() != -1) {
                // drain until end-of-input
            }
        }
    }

    /**
     * The smallest {@link LanguageServer} lsp4j accepts as a local service.
     */
    private static final class NoOpLanguageServer implements LanguageServer {

        @Override
        public CompletableFuture<InitializeResult> initialize(InitializeParams params) {
            return CompletableFuture.completedFuture(new InitializeResult());
        }

        @Override
        public CompletableFuture<Object> shutdown() {
            return CompletableFuture.completedFuture(null);
        }

        @Override
        public void exit() {
        }

        @Override
        public TextDocumentService getTextDocumentService() {
            return null;
        }

        @Override
        public WorkspaceService getWorkspaceService() {
            return null;
        }
    }
}
