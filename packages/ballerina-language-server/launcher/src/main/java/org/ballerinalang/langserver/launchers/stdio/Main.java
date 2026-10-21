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
import java.time.Duration;
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

    /** How long the process keeps running after its client is gone before idleness is considered. */
    static final Duration EXIT_GRACE = Duration.ofSeconds(5);

    /** The longest the process keeps running after its client is gone, idle or not. */
    static final Duration EXIT_BOUND = Duration.ofSeconds(30);

    private Main() {
    }

    public static void main(String[] args) {
        LogManager.getLogManager().reset();
        Logger globalLogger = Logger.getLogger(Logger.GLOBAL_LOGGER_NAME);
        globalLogger.setLevel(Level.OFF);
        run(() -> startServer(System.in, System.out), EXIT_GRACE, EXIT_BOUND);
    }

    /**
     * Runs the server and ends the process once it stops serving, whatever the way out.
     * <p>
     * {@link #startServer(InputStream, OutputStream)} returns once the client's end of the stream is gone (lsp4j
     * stops listening on end-of-input) or the connection failed. Returning from {@code main} is not enough to end
     * the process at that point: the language server core keeps non-daemon worker threads alive, so a JVM whose
     * client was killed without a clean {@code shutdown}/{@code exit} exchange (a VS Code window reload, a killed
     * extension host) would otherwise linger forever, holding its heap. The same holds when the run ends in an
     * {@link Error}: by then the workers may already exist, so the process is ended from a {@code finally}.
     * <p>
     * The exit is not on the spot. A compilation or a cache write in flight when the client went away would be
     * cut off, and the next server to open the project pays for it; in-flight work gets {@code grace} and the
     * process ends once the worker threads have gone idle, within {@code bound}. See {@link Quiescence}.
     *
     * @param run   the server run to execute
     * @param grace the time to keep the process alive after the run before idleness is considered
     * @param bound the longest to keep the process alive after the run, idle or not
     */
    static void run(ServerRun run, Duration grace, Duration bound) {
        int status = EXIT_FAILURE;
        try {
            status = serve(run);
        } finally {
            if (!Quiescence.awaitIdle(grace, bound)) {
                // Work is being cut off after all; leave a trace of it for whoever looks into the next session.
                System.err.println("Language server still busy " + bound.toSeconds()
                        + " s after its client left; exiting");
            }
            System.exit(status);
        }
    }

    /**
     * Runs the server until it stops serving and maps the outcome to a process exit status.
     * <p>
     * Every failure is reported on stderr and mapped to {@link #EXIT_FAILURE}, an {@link Error} included: the
     * caller ends the process on the way out, before the JVM's default handler would have printed it.
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
        } catch (Throwable e) {
            // A failure while the server is being set up must still end the process: by then non-daemon
            // worker threads may already exist, and an escaped exception would leave them running.
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
        Future<?> startListening = launcher.startListening();
        try {
            startListening.get();
        } finally {
            // A client that sent shutdown/exit ended the process from exit() and never reaches here. One that
            // went away without them, or a failed connection, skipped the server's shutdown hooks: run them, so
            // a lost client and a clean exit go through the same cleanup. A hook that fails must not replace
            // the reason the connection ended.
            try {
                server.shutdown();
            } catch (RuntimeException e) {
                e.printStackTrace(System.err);
            }
        }
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
