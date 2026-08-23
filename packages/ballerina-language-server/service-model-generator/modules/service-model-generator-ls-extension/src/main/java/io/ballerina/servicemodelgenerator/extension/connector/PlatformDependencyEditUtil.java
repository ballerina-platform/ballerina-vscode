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
import io.ballerina.toml.syntax.tree.TableNode;
import org.ballerinalang.langserver.commons.toml.common.TomlSyntaxTreeUtil;
import org.eclipse.lsp4j.Position;
import org.eclipse.lsp4j.Range;
import org.eclipse.lsp4j.TextEdit;

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
        Path rawCandidate = Path.of(rawPath);
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

    public static void populateDriverDependencyFields(ServiceInitModel creationModel, Project project) {
        for (Value field : findDriverDependencyFields(creationModel.getProperties()).values()) {
            DriverDependency dependency = field.getCodedata().getDriverDependency();
            if (isDeclared(project, dependency)) {
                field.setEnabled(false);
            }
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
                fields.put(field.identifier().toSourceCode().trim(), unquote(field.value().toSourceCode()));
            }
            if (dependency.getGroupId().equals(fields.get("groupId"))
                    && dependency.getArtifactId().equals(fields.get("artifactId"))) {
                return Optional.of(fields);
            }
        }
        return Optional.empty();
    }

    private static String unquote(String raw) {
        String trimmed = raw.trim();
        if (trimmed.length() >= 2 && trimmed.startsWith("\"") && trimmed.endsWith("\"")) {
            return trimmed.substring(1, trimmed.length() - 1);
        }
        return trimmed;
    }

    private static TextEdit createPlatformDependencyEdit(BallerinaToml toml, DriverDependency dependency,
                                                          String relativePath) {
        Position dependencyStart = new Position(getDependencyStartLine(toml), 0);
        StringBuilder dependencyText = new StringBuilder();
        dependencyText.append(String.format("[[platform.java21.dependency]]%npath = \"%s\"%ngroupId = \"%s\"%n"
                        + "artifactId = \"%s\"%nversion = \"%s\"%n", relativePath, dependency.getGroupId(),
                dependency.getArtifactId(), dependency.getVersion()));
        if (dependency.getScope() != null && !dependency.getScope().isBlank()) {
            dependencyText.append(String.format("scope = \"%s\"%n", dependency.getScope()));
        }
        dependencyText.append(String.format("%n"));
        return new TextEdit(new Range(dependencyStart, dependencyStart), dependencyText.toString());
    }

    private static int getDependencyStartLine(BallerinaToml toml) {
        DocumentNode tomlSyntaxTree = toml.tomlDocument().syntaxTree().rootNode();
        int lastDocumentLine = tomlSyntaxTree.lineRange().endLine().line();
        int candidateLine = tomlSyntaxTree.members().stream()
                .filter(member -> member.kind().equals(SyntaxKind.TABLE)
                        && TomlSyntaxTreeUtil.toQualifiedName(((TableNode) member).identifier().value())
                                .equals("package"))
                .findFirst()
                .map(member -> member.lineRange().endLine().line() + 2)
                .orElse(lastDocumentLine);
        return Math.min(candidateLine, lastDocumentLine);
    }
}
