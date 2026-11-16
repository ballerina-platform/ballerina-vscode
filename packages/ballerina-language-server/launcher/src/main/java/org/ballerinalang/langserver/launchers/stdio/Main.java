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
import java.util.function.IntConsumer;
import java.util.logging.Level;
import java.util.logging.LogManager;
import java.util.logging.Logger;

/**
 * Entry point of the stdio launcher.
 */
public final class Main {

    private Main() {
    }

    public static void main(String[] args) throws InterruptedException, ExecutionException {
        LogManager.getLogManager().reset();
        Logger globalLogger = Logger.getLogger(Logger.GLOBAL_LOGGER_NAME);
        globalLogger.setLevel(Level.OFF);
        startServer(System.in, System.out, System::exit);
    }

    /**
     * Starts the server and returns once the input stream closes. Does not exit the JVM, so an embedding host keeps
     * control of its own process.
     */
    public static void startServer(InputStream in, OutputStream out)
            throws InterruptedException, ExecutionException {
        startServer(in, out, status -> { });
    }

    /**
     * Starts the server and calls {@code exit} once the input stream closes, with status 0 if the client sent
     * {@code shutdown} first and 1 otherwise.
     * <p>
     * A client that disconnects without sending the LSP {@code exit} notification only closes the stream. Exiting
     * explicitly at that point stops a non-daemon thread from keeping the JVM running with no client
     * (wso2/product-integrator#2854).
     * <p>
     * Unlike {@link BallerinaLanguageServer#exit()}, this path does not call the extended services'
     * {@code shutdown()} and {@code exit(int)}, because the client never sent those messages. A service that must
     * clean up when the client disappears has to register a JVM shutdown hook.
     */
    static void startServer(InputStream in, OutputStream out, IntConsumer exit)
            throws InterruptedException, ExecutionException {
        protectJsonRpcStream();

        BallerinaLanguageServer server = new BallerinaLanguageServer();
        Launcher<ExtendedLanguageClient> launcher = Launcher.createLauncher(server,
                ExtendedLanguageClient.class, in, out);
        ExtendedLanguageClient client = launcher.getRemoteProxy();
        server.connect(client);
        Future<?> startListening = launcher.startListening();
        // Any way out of get() other than a normal return exits with status 1.
        int status = 1;
        try {
            startListening.get();
            // As for LSP exit: 0 only if the client sent shutdown before closing the stream.
            status = server.getExitStatus();
        } catch (ExecutionException e) {
            // lsp4j logs exceptions from the stream and completes normally; only an Error from the listener gets here.
            // Print the trace here: with System::exit, the rethrow below never reaches the default handler.
            System.err.println("Language server listener failed:");
            e.getCause().printStackTrace(System.err);
            throw e;
        } finally {
            exit.accept(status);
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
}
