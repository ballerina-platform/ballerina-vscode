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

import org.testng.Assert;
import org.testng.annotations.AfterMethod;
import org.testng.annotations.BeforeMethod;
import org.testng.annotations.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Optional;

/**
 * Tests for {@link ScanToolLocator}.
 */
public class ScanToolLocatorTest {

    private Path home;

    @BeforeMethod
    void createHome() throws IOException {
        home = Files.createTempDirectory("scanner-home");
        Files.createDirectories(home.resolve(".config"));
    }

    @AfterMethod
    void clearOverride() {
        System.clearProperty(ScanToolLocator.TOOL_JAR_PROPERTY);
    }

    @Test(description = "The active scan tool from the local repository is located")
    void testLocatesActiveLocalTool() throws IOException {
        writeBalTools("""
                [[tool]]
                id = "scan"
                org = "ballerina"
                name = "tool_scan"
                version = "0.11.0"
                active = false

                [[tool]]
                id = "scan"
                org = "ballerina"
                name = "tool_scan"
                version = "0.12.0"
                active = true
                repository = "local"
                """);
        Path jar = createJar("local", "0.12.0");
        createJar("central.ballerina.io", "0.11.0");

        Optional<ScanToolLocator.LocatedTool> located = ScanToolLocator.locate(home);

        Assert.assertTrue(located.isPresent());
        Assert.assertEquals(located.get().jar(), jar);
        Assert.assertEquals(located.get().version(), "0.12.0");
    }

    @Test(description = "A tool without a repository is resolved from the central cache")
    void testLocatesCentralTool() throws IOException {
        writeBalTools("""
                [[tool]]
                id = "scan"
                org = "ballerina"
                name = "tool_scan"
                version = "0.11.0"
                active = true
                """);
        Path jar = createJar("central.ballerina.io", "0.11.0");

        Assert.assertEquals(ScanToolLocator.locate(home).map(ScanToolLocator.LocatedTool::jar), Optional.of(jar));
    }

    @Test(description = "Nothing is located when no scan tool is active")
    void testNoActiveTool() throws IOException {
        writeBalTools("""
                [[tool]]
                id = "openapi"
                org = "ballerina"
                name = "tool.openapi"
                version = "2.4.2"
                active = true
                """);

        Assert.assertTrue(ScanToolLocator.locate(home).isEmpty());
    }

    @Test(description = "Nothing is located when bal-tools.toml is missing")
    void testMissingBalTools() {
        Assert.assertTrue(ScanToolLocator.locate(home).isEmpty());
    }

    @Test(description = "The jar override takes precedence over bal-tools.toml")
    void testJarOverride() throws IOException {
        Path jar = Files.createFile(home.resolve("scan-command-dev.jar"));
        System.setProperty(ScanToolLocator.TOOL_JAR_PROPERTY, jar.toString());

        Assert.assertEquals(ScanToolLocator.locate(home).map(ScanToolLocator.LocatedTool::jar), Optional.of(jar));
    }

    private void writeBalTools(String content) throws IOException {
        Files.writeString(home.resolve(".config").resolve("bal-tools.toml"), content);
    }

    private Path createJar(String repository, String version) throws IOException {
        Path libs = Files.createDirectories(home.resolve("repositories").resolve(repository).resolve("bala")
                .resolve("ballerina").resolve("tool_scan").resolve(version).resolve("java21").resolve("tool")
                .resolve("libs"));
        Files.createFile(libs.resolve("commons-io.jar"));
        return Files.createFile(libs.resolve("scan-command-" + version + ".jar"));
    }
}
