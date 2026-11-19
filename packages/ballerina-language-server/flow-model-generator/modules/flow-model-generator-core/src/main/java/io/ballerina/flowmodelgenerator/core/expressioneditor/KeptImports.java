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

package io.ballerina.flowmodelgenerator.core.expressioneditor;

import io.ballerina.compiler.syntax.tree.ImportDeclarationNode;
import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.compiler.syntax.tree.SyntaxTree;
import io.ballerina.compiler.syntax.tree.Token;
import io.ballerina.tools.text.TextDocuments;
import org.ballerinalang.langserver.commons.workspace.WorkspaceManager;

import java.nio.file.Path;
import java.util.HashSet;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Predicate;
import java.util.stream.Collectors;

/**
 * The probe imports an expression copy keeps between checks. Adding or removing an import makes the compiler resolve
 * the whole package again, so the copy keeps them for the next check that needs them, and every other reader of the
 * copy puts it back to its own text first. Every method is called with the copy lock held.
 *
 * @since 1.9.0
 */
public final class KeptImports {

    /**
     * The imports a copy holds beyond its own text.
     *
     * @param base     the copy's text without them
     * @param text     the copy's text with them, which tells whether the copy changed since
     * @param modules  their modules, as org/name
     * @param prefixes the prefixes they bind
     */
    public record Kept(String base, String text, Set<String> modules, Set<String> prefixes) {
    }

    private static final Map<Path, Kept> KEPT = new ConcurrentHashMap<>();

    private KeptImports() {
    }

    /**
     * Puts the copy back to its own text unless the request about to run keeps the imports.
     *
     * @param context the request's context
     * @param keeps   whether the request may run with the kept imports
     */
    public static void prepare(ExpressionEditorContext context, Predicate<Kept> keeps) {
        Path path = context.filePath();
        of(path, context.textDocument().toString())
                .filter(kept -> !context.startsAfterImports() || !keeps.test(kept))
                .ifPresent(kept -> {
                    KEPT.remove(path);
                    context.applyContent(TextDocuments.from(kept.base()));
                });
    }

    /**
     * Records the imports a request added to the copy.
     *
     * @param path    the copy's path
     * @param before  the copy's text before the request
     * @param after   the copy's text with the request's imports
     * @param imports the import statements the request added
     */
    public static void keep(Path path, String before, String after, String imports) {
        Optional<Kept> earlier = of(path, before);
        Set<String> modules = new HashSet<>(earlier.map(Kept::modules).orElse(Set.of()));
        Set<String> prefixes = new HashSet<>(earlier.map(Kept::prefixes).orElse(Set.of()));
        ModulePartNode root = SyntaxTree.from(TextDocuments.from(imports)).rootNode();
        for (ImportDeclarationNode node : root.imports()) {
            String name = node.moduleName().stream().map(Token::text).collect(Collectors.joining("."));
            modules.add(node.orgName().map(org -> org.orgName().text()).orElse("") + "/" + name);
            prefixes.add(node.prefix().map(prefix -> prefix.prefix().text())
                    .orElse(node.moduleName().get(node.moduleName().size() - 1).text()));
        }
        KEPT.put(path, new Kept(earlier.map(Kept::base).orElse(before), after, Set.copyOf(modules),
                Set.copyOf(prefixes)));
    }

    /**
     * Puts the copy back to its own text, for a reader of the copy that is not a probe request.
     *
     * @param workspaceManager the copy's workspace manager
     * @param path             the copy's path
     */
    public static void release(WorkspaceManager workspaceManager, Path path) {
        Kept kept = KEPT.remove(path);
        if (kept == null) {
            return;
        }
        workspaceManager.document(path)
                .filter(document -> document.textDocument().toString().equals(kept.text()))
                .ifPresent(document -> document.modify().withContent(kept.base()).apply());
    }

    // A copy whose text changed since, by a sync with its source file, no longer holds the imports.
    private static Optional<Kept> of(Path path, String text) {
        Kept kept = KEPT.get(path);
        if (kept != null && !kept.text().equals(text)) {
            KEPT.remove(path);
            return Optional.empty();
        }
        return Optional.ofNullable(kept);
    }
}
