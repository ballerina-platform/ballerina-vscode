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

import org.testng.Assert;
import org.testng.annotations.AfterMethod;
import org.testng.annotations.BeforeMethod;
import org.testng.annotations.Test;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutionException;

/**
 * Tests that {@link Main#startServer} exits the process when it stops listening to the client, including when the
 * client closes the input stream without sending the LSP {@code exit} notification (wso2/product-integrator#2854).
 * As for {@code exit}, the status is 0 only if the client sent {@code shutdown} first.
 */
public class StartServerExitTest {

    private static final String ENABLE_OUTPUT_STREAM = "enableOutputStream";

    private PrintStream originalOut;
    private String originalProperty;

    @BeforeMethod
    public void captureGlobalState() {
        originalOut = System.out;
        originalProperty = System.getProperty(ENABLE_OUTPUT_STREAM);
    }

    @AfterMethod
    public void restoreGlobalState() {
        // startServer redirects System.out to System.err and sets enableOutputStream.
        System.setOut(originalOut);
        if (originalProperty == null) {
            System.clearProperty(ENABLE_OUTPUT_STREAM);
        } else {
            System.setProperty(ENABLE_OUTPUT_STREAM, originalProperty);
        }
    }

    @Test(description = "Closing the input stream without shutdown must exit the process with status 1",
            timeOut = 60_000)
    public void testExitsWhenInputStreamCloses() throws Exception {
        List<Integer> exitCodes = new ArrayList<>();

        Main.startServer(new ByteArrayInputStream(new byte[0]), new ByteArrayOutputStream(), exitCodes::add);

        Assert.assertEquals(exitCodes, List.of(1));
    }

    @Test(description = "Closing the input stream after shutdown must exit the process with status 0",
            timeOut = 60_000)
    public void testExitsCleanlyWhenInputStreamClosesAfterShutdown() throws Exception {
        List<Integer> exitCodes = new ArrayList<>();
        String shutdown = "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"shutdown\"}";
        byte[] frame = ("Content-Length: " + shutdown.length() + "\r\n\r\n" + shutdown)
                .getBytes(StandardCharsets.UTF_8);

        Main.startServer(new ByteArrayInputStream(frame), new ByteArrayOutputStream(), exitCodes::add);

        Assert.assertEquals(exitCodes, List.of(0));
    }

    @Test(description = "An error that ends the listener must exit the process with status 1", timeOut = 60_000)
    public void testExitsWhenListenerFails() {
        List<Integer> exitCodes = new ArrayList<>();
        // lsp4j logs exceptions from the stream and ends normally, so only an Error fails the listening future
        // (ConcurrentMessageProcessor.run catches Exception). If an lsp4j upgrade also catches Error, this test fails
        // and the comment on the catch block in Main#startServer must be updated with it.
        InputStream failing = new InputStream() {
            @Override
            public int read() {
                throw new Error("Simulated listener failure");
            }
        };

        Assert.expectThrows(ExecutionException.class,
                () -> Main.startServer(failing, new ByteArrayOutputStream(), exitCodes::add));

        Assert.assertEquals(exitCodes, List.of(1));
    }
}
