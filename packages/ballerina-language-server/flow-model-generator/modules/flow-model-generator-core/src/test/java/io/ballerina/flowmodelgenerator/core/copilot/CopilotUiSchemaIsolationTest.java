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

package io.ballerina.flowmodelgenerator.core.copilot;

import org.testng.Assert;
import org.testng.annotations.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;

/**
 * Guards the boundary between the two trigger-metadata consumers: <b>the UI schema must never reach the
 * Copilot.</b>
 *
 * <p>{@code trigger-ui-schema.json} and its {@code TriggerUISchemaModel} describe a <i>form</i> — property
 * widgets, editability, placeholder values, listener init fields. The Copilot renders <i>Ballerina source
 * text</i> for a prompt, and every one of those concepts is meaningless to it. The two consumers share
 * {@code LibraryMetadataReader} precisely because they share the one thing that <i>is</i> common: reading
 * {@code trigger-metadata.json} from a package root.
 *
 * <p>Nothing in the compiler stops the two from being mixed, and the failure mode is quiet: the UI schema
 * carries plausible-looking type strings, so a Copilot path that reached for it would render syntax derived
 * from designer presentation rules and only look subtly wrong. This test is the tripwire — it reads the
 * Copilot source tree and fails on any reference at all.
 *
 * <p>If this test fails, the fix is not to relax it. Read the metadata document, not the UI schema.
 *
 * @since 1.7.0
 */
public class CopilotUiSchemaIsolationTest {

    /** Package-root-relative source tree the Copilot owns. */
    private static final String COPILOT_SOURCE_ROOT =
            "src/main/java/io/ballerina/flowmodelgenerator/core/copilot";

    /** Every spelling of the designer-only vocabulary. Substring matches, so imports and FQNs both trip. */
    private static final List<String> FORBIDDEN = List.of(
            "TriggerUISchemaModel",
            "trigger-ui-schema",
            "getTriggerUISchemaModel",
            "TriggerModelSynthesizer",
            "TriggerLibraryIntrospector",
            "servicemodelgenerator");

    @Test
    public void testTheCopilotNeverReferencesTheUiSchema() throws IOException {
        Path root = Paths.get(COPILOT_SOURCE_ROOT);
        Assert.assertTrue(Files.isDirectory(root),
                "Copilot source root not found at " + root.toAbsolutePath()
                        + " -- this test must run with the module directory as its working directory, and a"
                        + " move of the package needs COPILOT_SOURCE_ROOT updated rather than the test"
                        + " silently passing on an empty scan.");

        List<String> violations = new ArrayList<>();
        try (Stream<Path> files = Files.walk(root)) {
            for (Path file : files.filter(p -> p.toString().endsWith(".java")).toList()) {
                String code = withoutComments(Files.readString(file));
                for (String forbidden : FORBIDDEN) {
                    if (code.contains(forbidden)) {
                        violations.add(root.relativize(file) + " references '" + forbidden + "'");
                    }
                }
            }
        }

        Assert.assertTrue(violations.isEmpty(),
                "The Copilot must build only from trigger-metadata.json, never from the designer's UI schema"
                        + " or its synthesizer. Found:\n  " + String.join("\n  ", violations));
    }

    /**
     * The source with comments removed, so only real references count.
     *
     * <p><b>Prose about a designer type is not a dependency on it, and is often the opposite.</b>
     * {@code TriggerSemanticFacts} documents why it reads record fields itself rather than through
     * {@code TriggerLibraryIntrospector} — exactly the reasoning a future reader needs, and precisely what a
     * naive text scan flags. Banning the explanation would push people to delete the note instead of
     * keeping the boundary, so comments are stripped before matching.
     *
     * <p>Deliberately crude: a {@code //} or {@code /*} sequence inside a string literal would over-strip.
     * That direction is safe here — it can only hide a violation from a file that embeds the vocabulary in a
     * literal, which no Copilot class does, and never invents one.
     */
    private static String withoutComments(String source) {
        return source.replaceAll("(?s)/\\*.*?\\*/", "").replaceAll("(?m)//.*$", "");
    }

    /**
     * The reverse direction is deliberately <b>not</b> asserted.
     *
     * <p>The designer legitimately reads {@code trigger-metadata.json} — it is tier 3 of its own precedence
     * chain, synthesized into a UI schema when a connector ships no schema of its own. Only the Copilot
     * direction is a one-way boundary, and stating that here keeps someone from "fixing" the asymmetry.
     */
    @Test
    public void testTheDesignerMayStillReadTheMetadataDocument() {
        Assert.assertTrue(FORBIDDEN.stream().noneMatch(term -> term.contains("TriggerMetadataModel")),
                "trigger-metadata.json is the shared document. Forbidding it would break the very reuse"
                        + " this boundary exists to enable.");
    }
}
