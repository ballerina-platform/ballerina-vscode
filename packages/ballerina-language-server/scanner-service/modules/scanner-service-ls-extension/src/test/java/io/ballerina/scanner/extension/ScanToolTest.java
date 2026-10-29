/*
 *  Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com)
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

package io.ballerina.scanner.extension;

import com.google.gson.JsonObject;
import io.ballerina.scanner.extension.request.ScanRequest;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Optional;
import java.util.jar.JarOutputStream;

/**
 * Tests for {@link ScanTool} and the error responses of {@link ScannerService}.
 */
public class ScanToolTest {

    @Test(description = "A missing tool is reported with an install hint")
    void testToolNotFound() {
        ScanTool.ScanToolUnavailableException e = Assert.expectThrows(ScanTool.ScanToolUnavailableException.class,
                () -> new ScanTool(Optional::empty).get());

        Assert.assertEquals(e.code(), "TOOL_NOT_FOUND");
        Assert.assertTrue(e.getMessage().contains("bal tool pull scan"));
    }

    @Test(description = "A tool without the language server entry point is reported as incompatible")
    void testToolWithoutEntryPoint() throws IOException {
        Path jar = Files.createTempDirectory("scanner-jar").resolve("scan-command-0.10.0.jar");
        try (OutputStream out = Files.newOutputStream(jar); JarOutputStream ignored = new JarOutputStream(out)) {
            // An empty jar stands in for a tool that predates the language server entry point.
        }
        ScanTool scanTool = new ScanTool(() -> Optional.of(new ScanToolLocator.LocatedTool(jar, "0.10.0")));

        ScanTool.ScanToolUnavailableException e = Assert.expectThrows(ScanTool.ScanToolUnavailableException.class,
                scanTool::get);

        Assert.assertEquals(e.code(), "TOOL_INCOMPATIBLE");
        Assert.assertTrue(e.getMessage().contains("bal tool update scan"));
    }

    @Test(description = "A scan without a tool answers with an error instead of failing the request")
    void testScanWithoutTool() throws Exception {
        ScannerService service = new ScannerService(new ScanTool(Optional::empty));

        JsonObject response = service.scan(new ScanRequest("/tmp/project", false, false)).get();
        JsonObject handshake = service.handshake().get();
        service.shutdown();

        Assert.assertFalse(response.get("success").getAsBoolean());
        Assert.assertEquals(response.get("code").getAsString(), "TOOL_NOT_FOUND");
        Assert.assertFalse(handshake.get("available").getAsBoolean());
        Assert.assertEquals(handshake.get("supportedApiVersion").getAsInt(), ScanTool.SUPPORTED_API_VERSION);
    }
}
