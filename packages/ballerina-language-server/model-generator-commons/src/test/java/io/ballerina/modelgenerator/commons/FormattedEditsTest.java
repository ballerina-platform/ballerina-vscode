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

import org.eclipse.lsp4j.Position;
import org.eclipse.lsp4j.Range;
import org.eclipse.lsp4j.TextEdit;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Tests that {@link FormattedEdits#fold} falls back to the raw edits instead of failing the request.
 *
 * @since 1.8.0
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

    private static TextEdit edit(int line, int character, String text) {
        Position position = new Position(line, character);
        return new TextEdit(new Range(position, position), text);
    }
}
