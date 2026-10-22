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

package org.ballerinalang.langserver.launchers.stdio;

import org.ballerinalang.langserver.BallerinaLanguageServer;
import org.ballerinalang.langserver.commons.client.ExtendedLanguageClient;
import org.eclipse.lsp4j.jsonrpc.Launcher;

import java.io.InputStream;
import java.io.OutputStream;
import java.io.PrintStream;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;
import java.util.logging.Level;
import java.util.logging.LogManager;
import java.util.logging.Logger;

/**
 * Entry point of the stdio launcher.
 */
public final class Main {

    /** Exit status when the client went away or the server was told to stop. */
    static final int EXIT_OK = 0;

    /** Exit status when the JSON-RPC connection failed or the server was interrupted. */
    static final int EXIT_FAILURE = 1;

    private Main() {
    }

    public static void main(String[] args) {
        LogManager.getLogManager().reset();
        Logger globalLogger = Logger.getLogger(Logger.GLOBAL_LOGGER_NAME);
        globalLogger.setLevel(Level.OFF);
        // Terminate the JVM explicitly: see {@link #serve(ServerRun)}.
        System.exit(serve(() -> startServer(System.in, System.out)));
    }

    /**
     * Runs the server until it stops serving and maps the outcome to a process exit status.
     * <p>
     * {@link #startServer(InputStream, OutputStream)} returns once the client's end of the stream is gone (lsp4j
     * stops listening on end-of-input) or the connection failed. Returning from {@code main} is not enough to end
     * the process at that point: the language server core keeps non-daemon worker threads alive, so a JVM whose
     * client was killed without a clean {@code shutdown}/{@code exit} exchange (a VS Code window reload, a killed
     * extension host) would otherwise linger forever, holding its heap. The caller must pass the returned status
     * to {@link System#exit(int)}.
     *
     * @param run the server run to execute
     * @return {@link #EXIT_OK} when the run completed, {@link #EXIT_FAILURE} when it failed or was interrupted
     */
    static int serve(ServerRun run) {
        try {
            run.run();
            return EXIT_OK;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            // stderr is the diagnostic channel; stdout carries the JSON-RPC frames.
            e.printStackTrace(System.err);
            return EXIT_FAILURE;
        } catch (ExecutionException e) {
            e.printStackTrace(System.err);
            return EXIT_FAILURE;
        }
    }

    public static void startServer(InputStream in, OutputStream out)
            throws InterruptedException, ExecutionException {
        protectJsonRpcStream();

        BallerinaLanguageServer server = new BallerinaLanguageServer();
        Launcher<ExtendedLanguageClient> launcher = Launcher.createLauncher(server,
                ExtendedLanguageClient.class, in, out);
        ExtendedLanguageClient client = launcher.getRemoteProxy();
        server.connect(client);
        exitWhenParentExits();
        Future<?> startListening = launcher.startListening();
        startListening.get();
    }

    /**
     * Ends this process as soon as the process that launched it is gone.
     * <p>
     * End-of-input on stdin already covers the common case of a client that dies. This is the second line of
     * defence for a client that exits while something else still holds the write end of our stdin open, which
     * would otherwise keep the server listening on a pipe nobody will ever write to again.
     */
    static void exitWhenParentExits() {
        ProcessHandle.current().parent().ifPresent(parent -> onExit(parent, () -> System.exit(EXIT_OK)));
    }

    /**
     * Runs {@code action} once {@code process} has exited. Extracted so the wiring can be tested without exiting
     * the test JVM.
     *
     * @param process the process to watch
     * @param action  what to do when it is gone
     */
    static void onExit(ProcessHandle process, Runnable action) {
        process.onExit().thenRun(action);
    }

    /**
     * Protects the JSON-RPC stream used by the language server.
     * <p>
     * The stdio launcher communicates with the LS client over stdout. Any stray write to stdout (e.g. Ballerina
     * central pull progress, warnings, or third-party dependency logs) corrupts the JSON-RPC frames and causes the
     * client connection to error out. This method disables the central client output stream and redirects
     * {@link System#out} to {@link System#err} so that such writes can never reach the protocol stream. lsp4j keeps
     * writing to the original stdout stream captured before this method is invoked.
     */
    static void protectJsonRpcStream() {
        System.setProperty("enableOutputStream", "false");
        System.setOut(new PrintStream(System.err, true));
    }

    /**
     * A server run that blocks until the server stops serving.
     */
    @FunctionalInterface
    interface ServerRun {
        void run() throws InterruptedException, ExecutionException;
    }
}
