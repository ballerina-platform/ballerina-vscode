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

package io.ballerina.flowmodelgenerator.core.utils;

import io.ballerina.flowmodelgenerator.core.UserFacingException;
import io.ballerina.modelgenerator.commons.CommonUtils;
import io.ballerina.projects.Project;
import io.ballerina.toml.api.Toml;
import io.ballerina.toml.semantic.ast.TomlKeyNode;
import io.ballerina.toml.semantic.ast.TomlKeyValueNode;
import io.ballerina.toml.semantic.ast.TomlValueNode;
import io.ballerina.toml.semantic.ast.TopLevelNode;
import io.ballerina.tools.diagnostics.DiagnosticSeverity;
import org.eclipse.lsp4j.TextEdit;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Stream;

/**
 * Where a root-module configurable's value is in a Config.toml, and renaming it there. A value is looked up the way
 * the connection form writes it: at the top level, then in the {@code [<org>.<package>]} table, then in the
 * {@code [<package>]} table.
 *
 * @since 1.9.0
 */
public final class ConfigTomlKeys {

    public static final String CONFIG_TOML = "Config.toml";
    private static final String TESTS = "tests";

    private ConfigTomlKeys() {
    }

    /**
     * The table of a Config.toml that holds a configurable's value: the first of the top level, the module's table and
     * the package's table to have the key.
     *
     * @param toml        the parsed Config.toml
     * @param moduleKey   {@code <org>.<package>}, the root module's table
     * @param packageName the package's name, its table
     * @param key         the configurable's name as Config.toml keys it
     * @return the table holding the key, if any
     */
    public static Optional<Toml> tableOf(Toml toml, String moduleKey, String packageName, String key) {
        return Stream.of(Optional.of(toml), toml.getTable(moduleKey), toml.getTable(packageName))
                .flatMap(Optional::stream)
                .filter(table -> entry(table, key).isPresent())
                .findFirst();
    }

    /**
     * A configurable's value in a Config.toml, where {@link #tableOf} finds it.
     */
    public static Optional<TomlValueNode> valueOf(Toml toml, String moduleKey, String packageName, String key) {
        return tableOf(toml, moduleKey, packageName, key)
                .flatMap(table -> entry(table, key))
                .map(TomlKeyValueNode::value);
    }

    /**
     * Whether a table has any entry for a key, a value or a table, written bare or quoted.
     */
    private static boolean hasEntry(Toml table, String key) {
        Map<String, TopLevelNode> entries = table.rootNode().entries();
        return Stream.of(key, "\"" + key + "\"", "'" + key + "'").anyMatch(entries::containsKey);
    }

    /**
     * The entry of a table for a key, written bare or quoted ({@code key}, {@code "key"} or {@code 'key'}).
     */
    private static Optional<TomlKeyValueNode> entry(Toml table, String key) {
        Map<String, TopLevelNode> entries = table.rootNode().entries();
        return Stream.of(key, "\"" + key + "\"", "'" + key + "'")
                .map(entries::get)
                .filter(TomlKeyValueNode.class::isInstance)
                .map(TomlKeyValueNode.class::cast)
                .findFirst();
    }

    /**
     * The edit renaming a configurable's key in a Config.toml, where {@link #tableOf} finds it. Only the key changes:
     * its value, comments and layout stay, and so does an entry of the same name in any other table. A quoted key stays
     * quoted.
     *
     * @return the edit, or empty when the Config.toml has no value for the configurable
     * @throws UserFacingException if the table holding the value already has a value for the new name
     */
    public static Optional<TextEdit> renameKey(Toml toml, String moduleKey, String packageName, String from,
                                               String to) {
        // The root module's value for the new name may be in any of its tables: the form reads the first it finds.
        // Checked even where the old name has no value, since the renamed configurable would take this one.
        if (tableOf(toml, moduleKey, packageName, to).isPresent()) {
            throw new UserFacingException(("Config.toml already has a value for '%s'. Choose another name, or remove "
                    + "that value from Config.toml.").formatted(to));
        }
        Optional<Toml> table = tableOf(toml, moduleKey, packageName, from);
        if (table.isEmpty()) {
            return Optional.empty();
        }
        // A table of that name, such as [wso2] or [wso2.http1] for the name wso2, can't take a value beside it.
        if (hasEntry(table.get(), to)) {
            throw new UserFacingException(("Config.toml already has a table named '%s'. Choose another name.")
                    .formatted(to));
        }
        TomlKeyNode key = entry(table.get(), from).orElseThrow().key();
        String written = key.externalTreeNode().toSourceCode().strip();
        String quote = written.startsWith("\"") ? "\"" : written.startsWith("'") ? "'" : "";
        return Optional.of(new TextEdit(CommonUtils.toRange(key.location().lineRange()), quote + to + quote));
    }

    /**
     * The edits renaming a root-module configurable's key in the project's Config.toml, and in tests/Config.toml if
     * the package has one, each read from disk. Nothing is returned for a file with no value for it; if either file
     * already has a value for the new name, neither is changed.
     *
     * @param project     the project the configurable belongs to
     * @param projectRoot the project's root directory
     * @param from        the configurable's name
     * @param to          its new name
     * @return the edits, by file
     * @throws UserFacingException if a Config.toml already has a value for the new name, or can't be read
     */
    public static Map<Path, List<TextEdit>> renameEdits(Project project, Path projectRoot, String from, String to) {
        String packageName = project.currentPackage().packageName().value();
        String moduleKey = project.currentPackage().packageOrg().value() + "." + packageName;
        Map<Path, List<TextEdit>> edits = new LinkedHashMap<>();
        List<Path> configTomls =
                List.of(projectRoot.resolve(CONFIG_TOML), projectRoot.resolve(TESTS).resolve(CONFIG_TOML));
        for (Path configToml : configTomls) {
            read(configToml).flatMap(toml -> renameKey(parsed(toml, configToml), moduleKey, packageName, from, to))
                    .ifPresent(edit -> edits.put(configToml, List.of(edit)));
        }
        return edits;
    }

    /**
     * A Config.toml that parsed. One with syntax errors can hide the value being renamed, which would then be left
     * under the old name, so it is refused.
     *
     * @throws UserFacingException if the file has syntax errors
     */
    static Toml parsed(Toml toml, Path path) {
        boolean malformed = toml.diagnostics().stream()
                .anyMatch(diagnostic -> diagnostic.diagnosticInfo().severity() == DiagnosticSeverity.ERROR);
        if (malformed) {
            throw new UserFacingException(("%s has syntax errors. Fix them, then rename again.")
                    .formatted(path.getParent() != null && path.getParent().endsWith("tests")
                            ? "tests/Config.toml" : "Config.toml"));
        }
        return toml;
    }

    /**
     * A Config.toml as saved, or empty if there is none.
     */
    public static Optional<Toml> read(Path path) {
        if (!Files.exists(path)) {
            return Optional.empty();
        }
        try {
            return Optional.of(Toml.read(path));
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
