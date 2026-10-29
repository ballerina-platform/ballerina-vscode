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

package io.ballerina.modelgenerator.commons;

import org.ballerinalang.langserver.commons.workspace.WorkspaceManager;
import org.eclipse.lsp4j.Position;
import org.eclipse.lsp4j.Range;
import org.eclipse.lsp4j.TextEdit;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.io.IOException;
import java.lang.reflect.Proxy;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Tests that {@link FormattedEdits#fold} falls back to the raw edits instead of failing the request.
 *
 * @since 1.9.0
 */
public class FormattedEditsTest {

    // A file the edits create is read as empty, so no workspace manager is needed.
    private static final Path NEW_FILE = Path.of("does-not-exist", "new_file.bal");

    @Test
    public void testFoldsEditsForNewFile() {
        Optional<Map<Path, List<TextEdit>>> folded = FormattedEdits.fold(null,
                Map.of(NEW_FILE, List.of(edit(0, 0, "function   main() {\n}\n"))));
        Assert.assertTrue(folded.isPresent());
        // The formatter ends lines with the platform separator.
        Assert.assertEquals(folded.get().get(NEW_FILE).get(0).getNewText().replace("\r\n", "\n"),
                "function main() {\n}\n");
    }

    @Test
    public void testEditPastTheLastLineFallsBack() {
        Optional<Map<Path, List<TextEdit>>> folded = FormattedEdits.fold(null,
                Map.of(NEW_FILE, List.of(edit(5, 0, "int x = 1;\n"))));
        Assert.assertTrue(folded.isEmpty());
    }

    @Test
    public void testInsertsAtOneOffsetKeepListOrder() {
        Optional<Map<Path, List<TextEdit>>> folded = FormattedEdits.fold(null, Map.of(NEW_FILE,
                List.of(edit(0, 0, "import ballerina/io;\n"), edit(0, 0, "public function main() {\n}\n"))));
        Assert.assertTrue(folded.isPresent());
        Assert.assertEquals(folded.get().get(NEW_FILE).get(0).getNewText().replace("\r\n", "\n"),
                "import ballerina/io;\n\npublic function main() {\n}\n");
    }

    @Test
    public void testReplaceAndInsertAtOneOffsetKeepBoth() throws IOException {
        Path file = Files.createTempFile("formatted-edits", ".bal");
        try {
            Files.writeString(file, "function a() {\n}\n");
            TextEdit replace = new TextEdit(new Range(new Position(0, 0), new Position(1, 1)), "function b() {\n}");
            Optional<Map<Path, List<TextEdit>>> folded = FormattedEdits.fold(closedDocuments(),
                    Map.of(file, List.of(replace, edit(0, 0, "import ballerina/io;\n"))));
            Assert.assertTrue(folded.isPresent());
            Assert.assertEquals(folded.get().get(file).get(0).getNewText().replace("\r\n", "\n"),
                    "import ballerina/io;\n\nfunction b() {\n}\n");
        } finally {
            Files.deleteIfExists(file);
        }
    }

    @Test
    public void testOtherFilesKeepTheirEdits() {
        Path toml = Path.of("does-not-exist", "Config.toml");
        List<TextEdit> edits = List.of(edit(0, 0, "port = 9090\n"));
        Optional<Map<Path, List<TextEdit>>> folded = FormattedEdits.fold(null, Map.of(toml, edits));
        Assert.assertTrue(folded.isPresent());
        Assert.assertEquals(folded.get().get(toml), edits);
    }

    @Test
    public void testUnreadableDocumentFallsBackForAllFiles() throws IOException {
        // A directory named like a source file exists but cannot be read as text.
        Path unreadable = Files.createTempDirectory("formatted-edits").resolve("unreadable.bal");
        Files.createDirectory(unreadable);
        try {
            Map<Path, List<TextEdit>> edits = new LinkedHashMap<>();
            edits.put(NEW_FILE, List.of(edit(0, 0, "function main() {\n}\n")));
            edits.put(unreadable, List.of(edit(0, 0, "import ballerina/io;\n")));
            Assert.assertTrue(FormattedEdits.fold(closedDocuments(), edits).isEmpty());
        } finally {
            Files.deleteIfExists(unreadable);
            Files.deleteIfExists(unreadable.getParent());
        }
    }

    private static TextEdit edit(int line, int character, String text) {
        Position position = new Position(line, character);
        return new TextEdit(new Range(position, position), text);
    }

    // A workspace with no open documents or loaded projects, so files are read from disk.
    private static WorkspaceManager closedDocuments() {
        return (WorkspaceManager) Proxy.newProxyInstance(WorkspaceManager.class.getClassLoader(),
                new Class<?>[]{WorkspaceManager.class}, (proxy, method, args) -> Optional.empty());
    }
}
