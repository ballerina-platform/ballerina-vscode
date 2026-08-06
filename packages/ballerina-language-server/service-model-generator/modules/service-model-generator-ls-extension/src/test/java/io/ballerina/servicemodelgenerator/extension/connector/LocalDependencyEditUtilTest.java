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
import org.eclipse.lsp4j.TextEdit;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.net.URISyntaxException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Tests {@link LocalDependencyEditUtil}: the {@code Ballerina.toml} {@code [[dependency]]} edit bundled
 * alongside generated source for a connector picked from a Ballerina local-repository search result.
 */
public class LocalDependencyEditUtilTest {

    @Test
    public void testAddsEditWhenNoExistingDependency() throws URISyntaxException {
        Project project = load("local_dependency/no_dependency");
        Map<String, List<TextEdit>> edits = new HashMap<>();

        LocalDependencyEditUtil.addIfMissing(edits, project, "testlocaldep", "myconnector", "0.1.0");

        Assert.assertEquals(edits.size(), 1, "a toml edit must be added for a not-yet-declared dependency");
        TextEdit tomlEdit = edits.values().iterator().next().get(0);
        Assert.assertTrue(tomlEdit.getNewText().contains("org = \"testlocaldep\""));
        Assert.assertTrue(tomlEdit.getNewText().contains("name = \"myconnector\""));
        Assert.assertTrue(tomlEdit.getNewText().contains("version = \"0.1.0\""));
        Assert.assertTrue(tomlEdit.getNewText().contains("repository = \"local\""));
    }

    @Test
    public void testNoDuplicateWhenAlreadyDeclared() throws URISyntaxException {
        Project project = load("local_dependency/already_declared");
        Map<String, List<TextEdit>> edits = new HashMap<>();

        LocalDependencyEditUtil.addIfMissing(edits, project, "testlocaldep", "myconnector", "0.1.0");

        Assert.assertTrue(edits.isEmpty(), "no edit should be added for an already-declared dependency");
    }

    @Test
    public void testVersionBumpReplacesExistingDeclarationInPlace() throws URISyntaxException {
        Project project = load("local_dependency/already_declared");
        Map<String, List<TextEdit>> edits = new HashMap<>();

        LocalDependencyEditUtil.addIfMissing(edits, project, "testlocaldep", "myconnector", "0.2.0");

        Assert.assertEquals(edits.size(), 1, "the existing dependency's version must be replaced");
        List<TextEdit> tomlEdits = edits.values().iterator().next();
        Assert.assertEquals(tomlEdits.size(), 1, "no duplicate [[dependency]] stanza must be added");
        TextEdit versionEdit = tomlEdits.get(0);
        Assert.assertEquals(versionEdit.getNewText(), "\"0.2.0\"");
        Assert.assertEquals(versionEdit.getRange().getStart().getLine(), versionEdit.getRange().getEnd().getLine(),
                "the edit must replace only the version value, not the whole stanza");
    }

    @Test
    public void testDifferentConnectorStillAddedWhenAnotherIsAlreadyDeclared() throws URISyntaxException {
        Project project = load("local_dependency/already_declared");
        Map<String, List<TextEdit>> edits = new HashMap<>();

        LocalDependencyEditUtil.addIfMissing(edits, project, "othertestorg", "otherconnector", "2.0.0");

        Assert.assertEquals(edits.size(), 1);
    }

    @Test
    public void testCentralDeclaredDependencyAtDifferentVersionGetsLocalEntryAddedNotRewritten()
            throws URISyntaxException {
        Project project = load("local_dependency/central_declared");
        Map<String, List<TextEdit>> edits = new HashMap<>();

        LocalDependencyEditUtil.addIfMissing(edits, project, "testlocaldep", "myconnector", "0.2.0");

        Assert.assertEquals(edits.size(), 1);
        List<TextEdit> tomlEdits = edits.values().iterator().next();
        Assert.assertEquals(tomlEdits.size(), 1, "a new [[dependency]] stanza must be added, "
                + "not the Central-declared one rewritten in place");
        TextEdit tomlEdit = tomlEdits.get(0);
        Assert.assertTrue(tomlEdit.getNewText().contains("version = \"0.2.0\""));
        Assert.assertTrue(tomlEdit.getNewText().contains("repository = \"local\""));
    }

    @Test
    public void testCentralDeclaredDependencyAtSameVersionStillGetsLocalEntryAdded() throws URISyntaxException {
        Project project = load("local_dependency/central_declared");
        Map<String, List<TextEdit>> edits = new HashMap<>();

        LocalDependencyEditUtil.addIfMissing(edits, project, "testlocaldep", "myconnector", "0.1.0");

        Assert.assertEquals(edits.size(), 1, "the Central declaration must not be mistaken for "
                + "an already-declared local one");
        TextEdit tomlEdit = edits.values().iterator().next().get(0);
        Assert.assertTrue(tomlEdit.getNewText().contains("repository = \"local\""));
    }

    @Test
    public void testDependencyStartLineIsClampedToDocumentBounds() throws Exception {
        Project project = load("local_dependency/no_dependency");
        Map<String, List<TextEdit>> edits = new HashMap<>();

        LocalDependencyEditUtil.addIfMissing(edits, project, "testlocaldep", "myconnector", "0.1.0");

        TextEdit tomlEdit = edits.values().iterator().next().get(0);
        Path tomlPath = Paths.get(getClass().getClassLoader()
                .getResource("local_dependency/no_dependency/Ballerina.toml").toURI());
        long lineCount = Files.readAllLines(tomlPath).size();
        Assert.assertTrue(tomlEdit.getRange().getStart().getLine() <= lineCount,
                "the insertion position must stay within the document's line range, not assume a "
                        + "trailing blank line after [package]");
    }

    @Test
    public void testNullProjectIsANoOp() {
        Map<String, List<TextEdit>> edits = new HashMap<>();
        LocalDependencyEditUtil.addIfMissing(edits, null, "org", "name", "1.0.0");
        Assert.assertTrue(edits.isEmpty());
    }

    private Project load(String resource) throws URISyntaxException {
        Path projectPath = Paths.get(getClass().getClassLoader().getResource(resource).toURI());
        return BuildProject.load(projectPath);
    }
}
