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

import io.ballerina.modelgenerator.commons.ModuleInfo;
import io.ballerina.modelgenerator.commons.trigger.LibraryMetadataReader;
import io.ballerina.modelgenerator.commons.trigger.models.TriggerMetadataModel;
import io.ballerina.projects.BallerinaToml;
import io.ballerina.projects.Project;
import io.ballerina.projects.util.ProjectConstants;
import io.ballerina.servicemodelgenerator.extension.model.Codedata;
import io.ballerina.servicemodelgenerator.extension.model.DriverDependency;
import io.ballerina.servicemodelgenerator.extension.model.Listener;
import io.ballerina.servicemodelgenerator.extension.model.ServiceInitModel;
import io.ballerina.servicemodelgenerator.extension.model.Value;
import io.ballerina.toml.syntax.tree.DocumentNode;
import io.ballerina.toml.syntax.tree.KeyValueNode;
import io.ballerina.toml.syntax.tree.SyntaxKind;
import io.ballerina.toml.syntax.tree.TableArrayNode;
import org.ballerinalang.langserver.commons.toml.common.TomlSyntaxTreeUtil;
import org.eclipse.lsp4j.Position;
import org.eclipse.lsp4j.Range;
import org.eclipse.lsp4j.TextEdit;

import java.nio.file.InvalidPathException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Registers a connector-required driver JAR (e.g. SAP JCo) as a {@code [[platform.java21.dependency]]}
 * in {@code Ballerina.toml}. Bridges a {@link Value} field's {@link DriverDependency} codedata
 * (populated by {@link #overlayDriverDependencies}) to the TOML text edit that declares it
 * (emitted by {@link #addDriverDependenciesIfPresent}/{@link #addIfMissing}), checking the existing
 * TOML first so a dependency already declared is neither duplicated nor re-prompted for.
 *
 * @since 1.8.0
 */
public final class PlatformDependencyEditUtil {

    private static final String TABLE_ARRAY_NAME = "platform.java21.dependency";

    private PlatformDependencyEditUtil() {
    }

    public static Map<String, Value> findDriverDependencyFields(Map<String, Value> properties) {
        Map<String, Value> found = new LinkedHashMap<>();
        collectDriverDependencyFields(properties, found);
        return found;
    }

    private static void collectDriverDependencyFields(Map<String, Value> properties, Map<String, Value> found) {
        if (properties == null) {
            return;
        }
        for (Map.Entry<String, Value> entry : properties.entrySet()) {
            Value value = entry.getValue();
            if (value == null) {
                continue;
            }
            Codedata codedata = value.getCodedata();
            if (codedata != null && codedata.getDriverDependency() != null) {
                found.put(entry.getKey(), value);
                continue;
            }
            collectDriverDependencyFields(value.getProperties(), found);
            if (value.getChoices() != null) {
                for (Value choice : value.getChoices()) {
                    collectDriverDependencyFields(choice.getProperties(), found);
                }
            }
        }
    }

    public static boolean isDeclared(Project project, DriverDependency dependency) {
        return findEntry(project, dependency).isPresent();
    }

    public static Optional<String> findDeclaredPath(Project project, DriverDependency dependency) {
        return findEntry(project, dependency).map(fields -> fields.get("path"));
    }

    public static void addIfMissing(Map<String, List<TextEdit>> edits, Project project, DriverDependency dependency,
                                     String path) {
        if (project == null || dependency == null || dependency.getGroupId() == null
                || dependency.getArtifactId() == null || dependency.getVersion() == null
                || path == null || path.isBlank()) {
            return;
        }
        if (isDeclared(project, dependency)) {
            return;
        }
        Optional<BallerinaToml> toml = project.currentPackage().ballerinaToml();
        if (toml.isEmpty()) {
            return;
        }
        String tomlPath = project.sourceRoot().resolve(ProjectConstants.BALLERINA_TOML).toString();
        TextEdit tomlEdit = createPlatformDependencyEdit(toml.get(), dependency, relativize(project, path));
        edits.computeIfAbsent(tomlPath, ignored -> new ArrayList<>()).add(tomlEdit);
    }

    private static String relativize(Project project, String rawPath) {
        Path rawCandidate;
        try {
            rawCandidate = Path.of(rawPath);
        } catch (InvalidPathException e) {
            return rawPath.replace('\\', '/');
        }
        if (!rawCandidate.isAbsolute()) {
            return rawPath.replace('\\', '/');
        }
        Path candidate = rawCandidate.normalize();
        Path sourceRoot = project.sourceRoot().toAbsolutePath().normalize();
        if (candidate.startsWith(sourceRoot)) {
            return sourceRoot.relativize(candidate).toString().replace('\\', '/');
        }
        return rawPath.replace('\\', '/');
    }

    /**
     * Shows what's already configured instead of hiding it: a driver dependency already declared in
     * Ballerina.toml gets its discovered path filled in and becomes read-only, mirroring
     * {@link #overlayDriverDependencies}'s treatment of the same case for a listener. The section
     * stays visible either way -- disabling the field (and, previously, collapsing its enclosing
     * group when every field in it was hidden) looked identical to the field never having been
     * generated at all, which is indistinguishable from the bug it was meant to avoid.
     */
    public static void populateDriverDependencyFields(ServiceInitModel creationModel, Project project) {
        for (Value field : findDriverDependencyFields(creationModel.getProperties()).values()) {
            DriverDependency dependency = field.getCodedata().getDriverDependency();
            findDeclaredPath(project, dependency).ifPresent(path -> {
                field.setValue(path);
                field.setEditable(false);
            });
        }
    }

    public static void addDriverDependenciesIfPresent(Map<String, List<TextEdit>> edits, Project project,
                                                       Map<String, Value> properties) {
        for (Value field : findDriverDependencyFields(properties).values()) {
            if (!field.isEnabled()) {
                continue;
            }
            String path = field.getValue();
            if (path == null || path.isBlank()) {
                continue;
            }
            addIfMissing(edits, project, field.getCodedata().getDriverDependency(), path);
        }
    }

    public static void overlayDriverDependencies(Listener listener, String orgName, String moduleName,
                                                  String version, Project project) {
        if (listener == null || project == null) {
            return;
        }
        // This runs on every getListenerModel call, so gate on a cheap L1 presence check before
        // building the full template. Without this gate, a connector whose shipped L1 declares no
        // platformDependencies (http, grpc, ...) would fall through to getSchemaDrivenServiceInitModel
        // for a template that can never carry one — and for a connector not yet in the local
        // repository that resolution is deliberately not memoized (TriggerModelReader.Resolution), so
        // it would re-run on every fetch.
        if (!moduleDeclaresDriverDependencies(orgName, moduleName)) {
            return;
        }
        Optional<ServiceInitModel> template = TriggerModelReader.getInstance()
                .getSchemaDrivenServiceInitModel(orgName, moduleName, version);
        if (template.isEmpty()) {
            return;
        }
        for (Map.Entry<String, Value> entry : findDriverDependencyFields(template.get().getProperties())
                .entrySet()) {
            Value templateField = entry.getValue();
            DriverDependency dependency = templateField.getCodedata().getDriverDependency();
            Value displayField = new Value(templateField);
            Optional<String> declaredPath = findDeclaredPath(project, dependency);
            displayField.setEnabled(true);
            if (declaredPath.isPresent()) {
                displayField.setValue(declaredPath.get());
                displayField.setEditable(false);
            } else {
                displayField.setValue("");
                displayField.setEditable(true);
            }
            listener.getProperties().put(entry.getKey(), displayField);
        }
    }

    /**
     * Whether the module's shipped L1 declares a driver dependency on any listener -- a presence
     * check, precise enough to replace the old bundled-registry gate (which was only ever a proxy for
     * "this connector needs a jar the user must supply") without becoming a package compile.
     */
    private static boolean moduleDeclaresDriverDependencies(String orgName, String moduleName) {
        ModuleInfo moduleInfo = new ModuleInfo(orgName, moduleName, moduleName, null);
        return LibraryMetadataReader.getInstance().getTriggerMetadataModel(moduleInfo)
                .map(TriggerMetadataModel::listeners)
                .map(listeners -> listeners.stream().anyMatch(
                        listener -> listener.platformDependencies() != null
                                && !listener.platformDependencies().isEmpty()))
                .orElse(false);
    }

    /**
     * The declared {@code [[platform.java21.dependency]]} matching {@code dependency} by
     * {@code groupId}/{@code artifactId}.
     *
     * <p>The match deliberately ignores {@code version}, unlike {@link LocalDependencyEditUtil},
     * which rewrites a drifted version in place. For a {@code scope = "provided"} dependency the
     * JAR at {@code path} is what actually resolves and the version is inert metadata, so a project
     * already pointing at its own SAP JCo build is treated as configured rather than having its
     * manifest silently rewritten.
     */
    private static Optional<Map<String, String>> findEntry(Project project, DriverDependency dependency) {
        if (project == null || dependency == null || dependency.getGroupId() == null
                || dependency.getArtifactId() == null) {
            return Optional.empty();
        }
        Optional<BallerinaToml> toml = project.currentPackage().ballerinaToml();
        if (toml.isEmpty()) {
            return Optional.empty();
        }
        DocumentNode tomlSyntaxTree = toml.get().tomlDocument().syntaxTree().rootNode();
        for (var member : tomlSyntaxTree.members()) {
            if (member.kind() != SyntaxKind.TABLE_ARRAY) {
                continue;
            }
            TableArrayNode tableArrayNode = (TableArrayNode) member;
            if (!TABLE_ARRAY_NAME.equals(
                    TomlSyntaxTreeUtil.toQualifiedName(tableArrayNode.identifier().value()))) {
                continue;
            }
            Map<String, String> fields = new LinkedHashMap<>();
            for (KeyValueNode field : tableArrayNode.fields()) {
                fields.put(field.identifier().toSourceCode().trim(),
                        TomlDependencyUtil.unquote(field.value().toSourceCode()));
            }
            if (dependency.getGroupId().equals(fields.get("groupId"))
                    && dependency.getArtifactId().equals(fields.get("artifactId"))) {
                return Optional.of(fields);
            }
        }
        return Optional.empty();
    }

    private static TextEdit createPlatformDependencyEdit(BallerinaToml toml, DriverDependency dependency,
                                                          String relativePath) {
        Position dependencyStart = new Position(TomlDependencyUtil.getDependencyStartLine(toml), 0);
        StringBuilder dependencyText = new StringBuilder();
        dependencyText.append(String.format("[[platform.java21.dependency]]%npath = \"%s\"%ngroupId = \"%s\"%n"
                        + "artifactId = \"%s\"%nversion = \"%s\"%n", tomlString(relativePath),
                tomlString(dependency.getGroupId()), tomlString(dependency.getArtifactId()),
                tomlString(dependency.getVersion())));
        if (dependency.getScope() != null && !dependency.getScope().isBlank()) {
            dependencyText.append(String.format("scope = \"%s\"%n", tomlString(dependency.getScope())));
        }
        dependencyText.append(String.format("%n"));
        return new TextEdit(new Range(dependencyStart, dependencyStart), dependencyText.toString());
    }

    /**
     * Escapes a value for a TOML basic string ({@code "..."}), per the TOML spec's escape rules.
     * Every control character other than tab (U+0009) is disallowed unescaped in a basic string
     * (U+0000-U+0008, U+000A-U+001F, and U+007F), so any not covered by a named escape falls
     * through to a {@code \\uXXXX} escape.
     */
    private static String tomlString(String raw) {
        StringBuilder escaped = new StringBuilder();
        for (int i = 0; i < raw.length(); i++) {
            char c = raw.charAt(i);
            switch (c) {
                case '\\' -> escaped.append("\\\\");
                case '"' -> escaped.append("\\\"");
                case '\n' -> escaped.append("\\n");
                case '\r' -> escaped.append("\\r");
                case '\t' -> escaped.append("\\t");
                case '\b' -> escaped.append("\\b");
                case '\f' -> escaped.append("\\f");
                default -> {
                    if (c < 0x20 || c == 0x7F) {
                        escaped.append(String.format("\\u%04X", (int) c));
                    } else {
                        escaped.append(c);
                    }
                }
            }
        }
        return escaped.toString();
    }
}
