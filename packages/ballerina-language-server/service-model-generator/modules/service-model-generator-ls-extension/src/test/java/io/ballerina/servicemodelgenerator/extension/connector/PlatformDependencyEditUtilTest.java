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

package io.ballerina.servicemodelgenerator.extension.connector;

import io.ballerina.projects.Project;
import io.ballerina.projects.directory.BuildProject;
import io.ballerina.servicemodelgenerator.extension.model.DriverDependency;
import org.eclipse.lsp4j.TextEdit;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.net.URISyntaxException;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Tests {@link PlatformDependencyEditUtil}: the {@code Ballerina.toml} {@code [[platform.java21.dependency]]}
 * edit bundled alongside generated source for a connector requiring a driver JAR that isn't bundled
 * with the connector (e.g. SAP JCo's {@code sapjco3.jar}).
 */
public class PlatformDependencyEditUtilTest {

    private static final DriverDependency SAP_JCO = new DriverDependency("com.sap", "com.sap.conn.jco", "3.1.*",
            "provided");
    private static final DriverDependency SAP_IDOC = new DriverDependency("com.sap", "com.sap.conn.idoc", "3.1.*",
            "provided");

    @Test
    public void testIsDeclaredFalseWhenNoDependency() throws URISyntaxException {
        Project project = load("platform_dependency/no_dependency");
        Assert.assertFalse(PlatformDependencyEditUtil.isDeclared(project, SAP_JCO));
    }

    @Test
    public void testIsDeclaredTrueWhenAlreadyDeclared() throws URISyntaxException {
        Project project = load("platform_dependency/already_declared");
        Assert.assertTrue(PlatformDependencyEditUtil.isDeclared(project, SAP_JCO));
    }

    @Test
    public void testIsDeclaredFalseForADifferentArtifact() throws URISyntaxException {
        Project project = load("platform_dependency/already_declared");
        Assert.assertFalse(PlatformDependencyEditUtil.isDeclared(project, SAP_IDOC));
    }

    @Test
    public void testFindDeclaredPathReturnsTheDeclaredPath() throws URISyntaxException {
        Project project = load("platform_dependency/already_declared");
        Optional<String> path = PlatformDependencyEditUtil.findDeclaredPath(project, SAP_JCO);
        Assert.assertTrue(path.isPresent());
        Assert.assertEquals(path.get(), "libs/sapjco3.jar");
    }

    @Test
    public void testFindDeclaredPathEmptyWhenNotDeclared() throws URISyntaxException {
        Project project = load("platform_dependency/no_dependency");
        Assert.assertTrue(PlatformDependencyEditUtil.findDeclaredPath(project, SAP_JCO).isEmpty());
    }

    @Test
    public void testAddsEditWhenNoExistingDependency() throws URISyntaxException {
        Project project = load("platform_dependency/no_dependency");
        Map<String, List<TextEdit>> edits = new HashMap<>();
        String absolutePath = project.sourceRoot().resolve("libs/sapjco3.jar").toString();

        PlatformDependencyEditUtil.addIfMissing(edits, project, SAP_JCO, absolutePath);

        Assert.assertEquals(edits.size(), 1, "a toml edit must be added for a not-yet-declared driver dependency");
        TextEdit tomlEdit = edits.values().iterator().next().get(0);
        Assert.assertTrue(tomlEdit.getNewText().contains("[[platform.java21.dependency]]"));
        Assert.assertTrue(tomlEdit.getNewText().contains("path = \"libs/sapjco3.jar\""),
                "an absolute path under the project must be relativized before being written");
        Assert.assertTrue(tomlEdit.getNewText().contains("groupId = \"com.sap\""));
        Assert.assertTrue(tomlEdit.getNewText().contains("artifactId = \"com.sap.conn.jco\""));
        Assert.assertTrue(tomlEdit.getNewText().contains("version = \"3.1.*\""));
        Assert.assertTrue(tomlEdit.getNewText().contains("scope = \"provided\""));
    }

    @Test
    public void testAbsolutePathOutsideProjectIsWrittenAsIs() throws URISyntaxException {
        Project project = load("platform_dependency/no_dependency");
        Map<String, List<TextEdit>> edits = new HashMap<>();
        String outsidePath = Paths.get(System.getProperty("java.io.tmpdir"), "sapjco3.jar").toString();

        PlatformDependencyEditUtil.addIfMissing(edits, project, SAP_JCO, outsidePath);

        TextEdit tomlEdit = edits.values().iterator().next().get(0);
        Assert.assertTrue(tomlEdit.getNewText().contains("path = \"" + outsidePath.replace("\\", "/") + "\""));
    }

    @Test
    public void testAlreadyRelativePathIsWrittenVerbatim() throws URISyntaxException {
        Project project = load("platform_dependency/no_dependency");
        Map<String, List<TextEdit>> edits = new HashMap<>();

        PlatformDependencyEditUtil.addIfMissing(edits, project, SAP_JCO, "./resources/sapjco3.jar");

        TextEdit tomlEdit = edits.values().iterator().next().get(0);
        Assert.assertTrue(tomlEdit.getNewText().contains("path = \"./resources/sapjco3.jar\""));
    }

    @Test
    public void testPathContainingQuoteIsEscaped() throws URISyntaxException {
        Project project = load("platform_dependency/no_dependency");
        Map<String, List<TextEdit>> edits = new HashMap<>();

        PlatformDependencyEditUtil.addIfMissing(edits, project, SAP_JCO, "./resources/sap\"jco3.jar");

        TextEdit tomlEdit = edits.values().iterator().next().get(0);
        Assert.assertTrue(tomlEdit.getNewText().contains("path = \"./resources/sap\\\"jco3.jar\""),
                "a double quote in the path must be escaped so the generated TOML stays valid");
    }

    @Test
    public void testDriverDependencyWithBackslashAndNewlineIsEscaped() throws URISyntaxException {
        Project project = load("platform_dependency/no_dependency");
        Map<String, List<TextEdit>> edits = new HashMap<>();
        DriverDependency hostile = new DriverDependency("com.sap\\evil", "com.sap.conn.jco", "3.1.*\n",
                "provided");

        PlatformDependencyEditUtil.addIfMissing(edits, project, hostile, "libs/sapjco3.jar");

        TextEdit tomlEdit = edits.values().iterator().next().get(0);
        Assert.assertTrue(tomlEdit.getNewText().contains("groupId = \"com.sap\\\\evil\""),
                "a backslash in a dependency field must be escaped so the generated TOML stays valid");
        Assert.assertTrue(tomlEdit.getNewText().contains("version = \"3.1.*\\n\""),
                "a newline in a dependency field must be escaped so the generated TOML stays valid, not break "
                        + "the line");
    }

    @Test
    public void testNoDuplicateWhenAlreadyDeclared() throws URISyntaxException {
        Project project = load("platform_dependency/already_declared");
        Map<String, List<TextEdit>> edits = new HashMap<>();

        PlatformDependencyEditUtil.addIfMissing(edits, project, SAP_JCO, "libs/sapjco3.jar");

        Assert.assertTrue(edits.isEmpty(), "no edit should be added for an already-declared driver dependency");
    }

    @Test
    public void testDifferentDriverStillAddedWhenAnotherIsAlreadyDeclared() throws URISyntaxException {
        Project project = load("platform_dependency/already_declared");
        Map<String, List<TextEdit>> edits = new HashMap<>();
        String absolutePath = project.sourceRoot().resolve("libs/sapidoc3.jar").toString();

        PlatformDependencyEditUtil.addIfMissing(edits, project, SAP_IDOC, absolutePath);

        Assert.assertEquals(edits.size(), 1);
        TextEdit tomlEdit = edits.values().iterator().next().get(0);
        Assert.assertTrue(tomlEdit.getNewText().contains("path = \"libs/sapidoc3.jar\""));
    }

    @Test
    public void testNullProjectIsANoOp() {
        Map<String, List<TextEdit>> edits = new HashMap<>();
        PlatformDependencyEditUtil.addIfMissing(edits, null, SAP_JCO, "libs/a.jar");
        Assert.assertTrue(edits.isEmpty());
    }

    private Project load(String resource) throws URISyntaxException {
        Path projectPath = Paths.get(getClass().getClassLoader().getResource(resource).toURI());
        return BuildProject.load(projectPath);
    }
}
