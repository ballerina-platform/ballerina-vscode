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

import java.io.ByteArrayOutputStream;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;

/**
 * Tests for {@link Main#protectJsonRpcStream()}, which guards the JSON-RPC (stdout) stream of the stdio launcher
 * against stray writes that would otherwise corrupt the protocol and crash the client connection.
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
}
