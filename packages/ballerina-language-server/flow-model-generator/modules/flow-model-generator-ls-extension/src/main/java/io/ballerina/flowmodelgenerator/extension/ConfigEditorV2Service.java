/*
 *  Copyright (c) 2025, WSO2 LLC. (http://www.wso2.com)
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

package io.ballerina.flowmodelgenerator.extension;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonElement;
import io.ballerina.compiler.api.ModuleID;
import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.api.TypeBuilder;
import io.ballerina.compiler.api.Types;
import io.ballerina.compiler.api.symbols.ArrayTypeSymbol;
import io.ballerina.compiler.api.symbols.ErrorTypeSymbol;
import io.ballerina.compiler.api.symbols.FunctionTypeSymbol;
import io.ballerina.compiler.api.symbols.MapTypeSymbol;
import io.ballerina.compiler.api.symbols.ObjectTypeSymbol;
import io.ballerina.compiler.api.symbols.Qualifier;
import io.ballerina.compiler.api.symbols.RecordTypeSymbol;
import io.ballerina.compiler.api.symbols.StreamTypeSymbol;
import io.ballerina.compiler.api.symbols.TableTypeSymbol;
import io.ballerina.compiler.api.symbols.TupleTypeSymbol;
import io.ballerina.compiler.api.symbols.TypeSymbol;
import io.ballerina.compiler.api.symbols.UnionTypeSymbol;
import io.ballerina.compiler.syntax.tree.ExpressionNode;
import io.ballerina.compiler.syntax.tree.ImportDeclarationNode;
import io.ballerina.compiler.syntax.tree.ListConstructorExpressionNode;
import io.ballerina.compiler.syntax.tree.MappingConstructorExpressionNode;
import io.ballerina.compiler.syntax.tree.MappingFieldNode;
import io.ballerina.compiler.syntax.tree.MetadataNode;
import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.compiler.syntax.tree.ModuleVariableDeclarationNode;
import io.ballerina.compiler.syntax.tree.Node;
import io.ballerina.compiler.syntax.tree.NodeList;
import io.ballerina.compiler.syntax.tree.NodeParser;
import io.ballerina.compiler.syntax.tree.SpecificFieldNode;
import io.ballerina.compiler.syntax.tree.SyntaxKind;
import io.ballerina.compiler.syntax.tree.SyntaxTree;
import io.ballerina.compiler.syntax.tree.TypeDescriptorNode;
import io.ballerina.compiler.syntax.tree.TypedBindingPatternNode;
import io.ballerina.flowmodelgenerator.core.Constants;
import io.ballerina.flowmodelgenerator.core.DiagnosticHandler;
import io.ballerina.flowmodelgenerator.core.model.Codedata;
import io.ballerina.flowmodelgenerator.core.model.FlowNode;
import io.ballerina.flowmodelgenerator.core.model.NodeBuilder;
import io.ballerina.flowmodelgenerator.core.model.NodeKind;
import io.ballerina.flowmodelgenerator.core.model.Property;
import io.ballerina.flowmodelgenerator.extension.request.ConfigVariableDeleteRequest;
import io.ballerina.flowmodelgenerator.extension.request.ConfigVariableGetRequest;
import io.ballerina.flowmodelgenerator.extension.request.ConfigVariableNodeTemplateRequest;
import io.ballerina.flowmodelgenerator.extension.request.ConfigVariableUpdateRequest;
import io.ballerina.flowmodelgenerator.extension.response.AbstractFlowModelResponse;
import io.ballerina.flowmodelgenerator.extension.response.ConfigVariableDeleteResponse;
import io.ballerina.flowmodelgenerator.extension.response.ConfigVariableNodeTemplateResponse;
import io.ballerina.flowmodelgenerator.extension.response.ConfigVariableUpdateResponse;
import io.ballerina.flowmodelgenerator.extension.response.ConfigVariablesGetResponse;
import io.ballerina.modelgenerator.commons.CommonUtils;
import io.ballerina.modelgenerator.commons.ModuleInfo;
import io.ballerina.modelgenerator.commons.PackageUtil;
import io.ballerina.modelgenerator.commons.ParameterMemberTypeData;
import io.ballerina.projects.CompilationOptions;
import io.ballerina.projects.Document;
import io.ballerina.projects.DocumentId;
import io.ballerina.projects.Module;
import io.ballerina.projects.ModuleDependency;
import io.ballerina.projects.Package;
import io.ballerina.projects.PackageDescriptor;
import io.ballerina.projects.PackageResolution;
import io.ballerina.projects.PlatformLibraryScope;
import io.ballerina.projects.Project;
import io.ballerina.projects.ProjectKind;
import io.ballerina.projects.ResolvedPackageDependency;
import io.ballerina.toml.api.Toml;
import io.ballerina.toml.semantic.ast.TomlArrayValueNode;
import io.ballerina.toml.semantic.ast.TomlInlineTableValueNode;
import io.ballerina.toml.semantic.ast.TomlKeyValueNode;
import io.ballerina.toml.semantic.ast.TomlNode;
import io.ballerina.toml.semantic.ast.TomlTableArrayNode;
import io.ballerina.toml.semantic.ast.TomlTableNode;
import io.ballerina.toml.semantic.ast.TomlValueNode;
import io.ballerina.toml.semantic.ast.TopLevelNode;
import io.ballerina.tools.diagnostics.DiagnosticSeverity;
import io.ballerina.tools.text.LinePosition;
import io.ballerina.tools.text.LineRange;
import org.ballerinalang.annotation.JavaSPIService;
import org.ballerinalang.langserver.commons.eventsync.exceptions.EventSyncException;
import org.ballerinalang.langserver.commons.service.spi.ExtendedLanguageServerService;
import org.ballerinalang.langserver.commons.workspace.WorkspaceDocumentException;
import org.ballerinalang.langserver.commons.workspace.WorkspaceManager;
import org.eclipse.lsp4j.TextEdit;
import org.eclipse.lsp4j.jsonrpc.services.JsonRequest;
import org.eclipse.lsp4j.jsonrpc.services.JsonSegment;
import org.eclipse.lsp4j.services.LanguageServer;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.CompletableFuture;

import static io.ballerina.flowmodelgenerator.core.model.Property.CONFIG_VALUE_KEY;
import static io.ballerina.flowmodelgenerator.core.model.Property.CONFIG_VAR_DOC_KEY;
import static io.ballerina.flowmodelgenerator.core.model.Property.DEFAULT_VALUE_KEY;
import static io.ballerina.flowmodelgenerator.core.model.Property.TEST_CONFIG_VALUE_KEY;
import static io.ballerina.flowmodelgenerator.core.model.Property.VARIABLE_KEY;
import static io.ballerina.modelgenerator.commons.CommonUtils.importExists;

/**
 * Provides extended services for viewing and editing Ballerina configuration variables.
 *
 * @since 1.0.0
 */
@JavaSPIService("org.ballerinalang.langserver.commons.service.spi.ExtendedLanguageServerService")
@JsonSegment("configEditorV2")
public class ConfigEditorV2Service implements ExtendedLanguageServerService {

    // File and Path Constants
    private static final String CONFIG_TOML_FILENAME = "Config.toml";

    // Character and Separator Constants
    private static final String FORWARD_SLASH = "/";
    private static final String DOT = ".";
    private static final String HASH_COMMENT_PREFIX = "# ";
    private static final String EMPTY_STRING = "";
    private static final String QUESTION_MARK = "?";
    private static final String COMMA_SPACE = ", ";
    private static final String OPEN_BRACE = "{";
    private static final String CLOSE_BRACE = "}";
    private static final String OPEN_BRACKET = "[";
    private static final String CLOSE_BRACKET = "]";
    private static final String COLON_SPACE = ": ";
    private static final String DOUBLE_QUOTE = "\"";
    private static final String EQUALS_SIGN_SPACED = " = ";
    private static final String LS = System.lineSeparator();
    private static final String IMPORT_STMT_TEMPLATE = "%nimport %s/%s;%n";

    // TOML and Config Statement Format Constants
    private static final String CONFIG_STATEMENT_FORMAT = "configurable %s %s = %s;";
    private static final String TOML_KEY_VALUE_FORMAT = "%s = %s";
    private static final String TOML_MODULE_SECTION_FORMAT = "[%s.%s]";
    private static final String TOML_MODULE_WITH_SUBMODULE_SECTION_FORMAT = "[%s.%s.%s]";

    private WorkspaceManager workspaceManager;
    private Gson gson;

    @Override
    public void init(LanguageServer langServer, WorkspaceManager workspaceManager) {
        this.workspaceManager = workspaceManager;
        this.gson = new GsonBuilder().setPrettyPrinting().disableHtmlEscaping().create();
    }

    @Override
    public Class<?> getRemoteInterface() {
        return null;
    }

    /**
     * Retrieves configuration variables from the Ballerina project.
     *
     * @param request The request containing the project path.
     * @return A {@link CompletableFuture} containing the {@link ConfigVariablesGetResponse}.
     */
    @JsonRequest
    @SuppressWarnings("unused")
    public CompletableFuture<ConfigVariablesGetResponse> getConfigVariables(ConfigVariableGetRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            ConfigVariablesGetResponse response = new ConfigVariablesGetResponse();
            // Need to preserve the insertion order (default package first).
            Map<String, Map<String, List<FlowNode>>> configVarMap = new LinkedHashMap<>();
            try {
                Project project = workspaceManager.loadProject(Path.of(request.projectPath()));
                Package rootPackage = project.currentPackage();

                // Parse root Config.toml if it exists.
                Toml configTomlValues = parseConfigToml(project);
                handleConfigTomlErrors(configTomlValues, response);

                configVarMap.putAll(extractVariablesFromProject(rootPackage, project, configTomlValues));
                if (request.includeLibraries()) {
                    configVarMap.putAll(extractConfigsFromDependencies(rootPackage, configTomlValues));
                }

                response.setConfigVariables(gson.toJsonTree(configVarMap));
            } catch (WorkspaceDocumentException | EventSyncException | RuntimeException e) {
                response.setError(e);
            }
            return response;
        });
    }

    /**
     * Updates a given configuration variable with the provided value.
     *
     * @param request The request containing the configuration variable and file path.
     * @return A {@link CompletableFuture} containing the {@link ConfigVariableUpdateResponse} with text edits.
     */
    @JsonRequest
    @SuppressWarnings("unused")
    public CompletableFuture<ConfigVariableUpdateResponse> updateConfigVariable(ConfigVariableUpdateRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            ConfigVariableUpdateResponse response = new ConfigVariableUpdateResponse();
            try {
                FlowNode configVariable = gson.fromJson(request.configVariable(), FlowNode.class);
                Path configFilePath = Path.of(request.configFilePath());
                Project rootProject = workspaceManager.loadProject(configFilePath);

                Map<Path, List<TextEdit>> allTextEdits = new HashMap<>();

                Property configValueProp = configVariable.properties().get(CONFIG_VALUE_KEY);
                Property testConfigValueProp = configVariable.properties().get(TEST_CONFIG_VALUE_KEY);
                Property variableNameProp = configVariable.properties().get(VARIABLE_KEY);
                boolean configValueModified = configValueProp != null
                        && Boolean.TRUE.equals(configValueProp.modified());
                boolean testConfigValueModified = testConfigValueProp != null
                        && Boolean.TRUE.equals(testConfigValueProp.modified());
                boolean nameModified = variableNameProp != null
                        && Boolean.TRUE.equals(variableNameProp.modified());

                // Text edits for Ballerina source files.
                // Skip when testConfigValue is the only modified property (not a source concern).
                if (requireSourceEdits(configVariable) && isPackageInRootProject(request.packageName(), rootProject)) {
                    allTextEdits.putAll(constructSourceTextEdits(rootProject, configFilePath, configVariable, false));
                }

                // Root Config.toml edits: when configValue or variable name is modified.
                if (configValueModified || nameModified) {
                    Toml existingConfigToml = parseConfigToml(rootProject);
                    handleConfigTomlErrors(existingConfigToml, response);
                    Path configTomlPath = rootProject.sourceRoot().resolve(CONFIG_TOML_FILENAME);
                    allTextEdits.putAll(constructConfigTomlTextEdits(rootProject, request.packageName(),
                            request.moduleName(), configVariable, configTomlPath, existingConfigToml, false,
                            CONFIG_VALUE_KEY));
                }

                // Tests Config.toml edits: when testConfigValue or variable name is modified.
                if (testConfigValueModified || nameModified) {
                    Path testsConfigTomlPath = getTestsConfigTomlPath(rootProject, request.moduleName());
                    Toml existingTestsConfigToml = parseConfigToml(testsConfigTomlPath);
                    handleConfigTomlErrors(existingTestsConfigToml, response);
                    allTextEdits.putAll(constructConfigTomlTextEdits(rootProject, request.packageName(),
                            request.moduleName(), configVariable, testsConfigTomlPath, existingTestsConfigToml, false,
                            TEST_CONFIG_VALUE_KEY));
                }

                response.setTextEdits(gson.toJsonTree(allTextEdits));
            } catch (WorkspaceDocumentException | EventSyncException | RuntimeException e) {
                response.setError(e);
            }

            return response;
        });
    }

    /**
     * Deletes a given configuration variable.
     *
     * @param request The request containing the configuration variable and file path.
     * @return A {@link CompletableFuture} containing the {@link ConfigVariableDeleteResponse} with text edits.
     */
    @JsonRequest
    @SuppressWarnings("unused")
    public CompletableFuture<ConfigVariableDeleteResponse> deleteConfigVariable(ConfigVariableDeleteRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            ConfigVariableDeleteResponse response = new ConfigVariableDeleteResponse();
            try {
                FlowNode configVariable = gson.fromJson(request.configVariable(), FlowNode.class);
                Path configFilePath = Path.of(request.configFilePath());
                Project rootProject = workspaceManager.loadProject(configFilePath);

                Map<Path, List<TextEdit>> allTextEdits = new HashMap<>();
                // Text edits for Ballerina source files.
                allTextEdits.putAll(constructSourceTextEdits(rootProject, configFilePath, configVariable, true));

                // Text edits for root Config.toml.
                Toml existingConfigToml = parseConfigToml(rootProject);
                handleConfigTomlErrors(existingConfigToml, response);
                Path configTomlPath = rootProject.sourceRoot().resolve(CONFIG_TOML_FILENAME);
                allTextEdits.putAll(constructConfigTomlTextEdits(rootProject, request.packageName(),
                        request.moduleName(), configVariable, configTomlPath, existingConfigToml, true,
                        CONFIG_VALUE_KEY));

                // Text edits for tests/Config.toml.
                Path testsConfigTomlPath = getTestsConfigTomlPath(rootProject, request.moduleName());
                Toml existingTestsConfigToml = parseConfigToml(testsConfigTomlPath);
                handleConfigTomlErrors(existingTestsConfigToml, response);
                allTextEdits.putAll(constructConfigTomlTextEdits(rootProject, request.packageName(),
                        request.moduleName(), configVariable, testsConfigTomlPath, existingTestsConfigToml, true,
                        TEST_CONFIG_VALUE_KEY));

                response.setTextEdits(gson.toJsonTree(allTextEdits));
            } catch (WorkspaceDocumentException | EventSyncException | RuntimeException e) {
                response.setError(e);
            }

            return response;
        });
    }

    /**
     * Retrieves the node template for configurable variables.
     *
     * @param request The request indicating if the template is for a new variable.
     * @return A {@link CompletableFuture} containing the {@link ConfigVariableNodeTemplateResponse}.
     */
    @JsonRequest
    @SuppressWarnings("unused")
    public CompletableFuture<ConfigVariableNodeTemplateResponse> getNodeTemplate(
            ConfigVariableNodeTemplateRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            ConfigVariableNodeTemplateResponse response = new ConfigVariableNodeTemplateResponse();
            try {
                FlowNode flowNode = getConfigVariableFlowNodeTemplate(request.isNew());
                JsonElement nodeTemplate = gson.toJsonTree(flowNode);
                response.setFlowNode(nodeTemplate);
            } catch (Throwable e) {
                response.setError(e);
            }
            return response;
        });
    }

    /**
     * Constructs text edits for Ballerina source files to update or delete a configuration variable.
     */
    private Map<Path, List<TextEdit>> constructSourceTextEdits(Project rootProject, Path sourceFilePath,
                                                               FlowNode variable, boolean isDelete) {
        Map<Path, List<TextEdit>> textEditsMap = new HashMap<>();
        try {
            Path variableFilePath = findVariableFilePath(variable, sourceFilePath, rootProject);
            if (variableFilePath == null) {
                return textEditsMap;
            }

            Optional<Document> document = workspaceManager.document(variableFilePath);
            if (document.isEmpty()) {
                return textEditsMap;
            }
            LineRange lineRange = variable.codedata().lineRange();
            String configStatement = constructConfigStatement(variable);

            List<TextEdit> textEdits = new ArrayList<>();
            if (isNew(variable) || lineRange == null) {
                SyntaxTree syntaxTree = document.get().syntaxTree();
                ModulePartNode modulePartNode = syntaxTree.rootNode();
                LinePosition startPos = LinePosition.from(modulePartNode.lineRange().endLine().line() + 1, 0);
                textEdits.add(new TextEdit(CommonUtils.toRange(startPos), configStatement + LS));
                addImportEdits(variable, document.get(), textEdits);
            } else if (isDelete) {
                textEdits.add(new TextEdit(CommonUtils.toRange(lineRange), EMPTY_STRING));
            } else {
                textEdits.add(new TextEdit(CommonUtils.toRange(lineRange), configStatement));
                addImportEdits(variable, document.get(), textEdits);
            }

            textEditsMap.put(variableFilePath, textEdits);
            return textEditsMap;
        } catch (RuntimeException e) {
            return textEditsMap;
        }
    }

    /**
     * Adds necessary import statements to the text edits for a configuration variable.
     *
     * @param node      The configuration variable flow node.
     * @param document  The document containing the configuration variable.
     * @param textEdits The list of text edits to which import statements will be added.
     */
    private static void addImportEdits(FlowNode node, Document document, List<TextEdit> textEdits) {
        Property typeProperty = node.properties().get(Property.TYPE_KEY);
        if (typeProperty == null) {
            return;
        }

        Map<String, String> propImports = typeProperty.imports();
        if (propImports == null || propImports.isEmpty()) {
            return;
        }

        ModulePartNode rootNode = document.syntaxTree().rootNode();
        LineRange startLineRange = rootNode.lineRange();

        Set<String> imports = new HashSet<>();
        NodeList<ImportDeclarationNode> importNodes = rootNode.imports();
        if (!importNodes.isEmpty()) {
            ImportDeclarationNode lastImportNode = importNodes.get(importNodes.size() - 1);
            startLineRange = lastImportNode.lineRange();
        }

        propImports.values().forEach(moduleId -> {
            String[] importParts = moduleId.split("/");
            String orgName = importParts[0];
            String moduleName = importParts[1].split(":")[0];
            if (!importExists(rootNode, orgName, moduleName)) {
                imports.add(String.format(IMPORT_STMT_TEMPLATE, orgName, moduleName));
            }
        });

        if (!imports.isEmpty()) {
            String importsStmts = String.join("", imports);
            textEdits.addFirst(new TextEdit(CommonUtils.toRange(startLineRange.startLine()), importsStmts));
        }
    }

    /**
     * Constructs the Ballerina source code statement for a configuration variable.
     */
    private static String constructConfigStatement(FlowNode node) {
        String defaultValue = node.properties().get(DEFAULT_VALUE_KEY).toSourceCode();
        String variableDoc = node.properties().get(CONFIG_VAR_DOC_KEY).toSourceCode();
        List<String> docLines = Arrays.stream(variableDoc.split(LS)).toList();

        StringBuilder configStatementBuilder = new StringBuilder();
        docLines.forEach(docLine -> {
                    if (!docLine.isBlank()) {
                        configStatementBuilder
                                .append(HASH_COMMENT_PREFIX)
                                .append(docLine)
                                .append(LS);
                    }
                }
        );

        String variableType = node.properties().get(Property.TYPE_KEY).toSourceCode();
        String variableName = node.properties().get(Property.VARIABLE_KEY).toSourceCode();
        String effectiveDefaultValue = defaultValue.isEmpty() ? QUESTION_MARK : defaultValue;

        configStatementBuilder.append(String.format(CONFIG_STATEMENT_FORMAT,
                variableType,
                variableName,
                effectiveDefaultValue)
        );

        return configStatementBuilder.toString();
    }

    /**
     * Parses the Config.toml file and returns its content as a {@link Toml} object.
     *
     * @param project The Ballerina project.
     * @return A {@link Toml} object representing the parsed Config.toml, or {@code null} if parsing fails or the file
     * doesn't exist.
     */
    private Toml parseConfigToml(Project project) {
        return parseConfigToml(project.sourceRoot().resolve(CONFIG_TOML_FILENAME));
    }

    private Toml parseConfigToml(Path configTomlPath) {
        try {
            if (!Files.exists(configTomlPath)) {
                return null;
            }
            return Toml.read(configTomlPath);
        } catch (IOException ignored) {
            return null;
        }
    }

    /**
     * Returns the path to the tests/Config.toml for the given module. For the default module, this is
     * {@code {root}/tests/Config.toml}. For a named module "foo", this is
     * {@code {root}/modules/foo/tests/Config.toml}.
     */
    private Path getTestsConfigTomlPath(Project project, String moduleName) {
        if (moduleName == null || moduleName.isEmpty()) {
            return project.sourceRoot().resolve("tests").resolve(CONFIG_TOML_FILENAME);
        }
        return project.sourceRoot().resolve("modules").resolve(moduleName)
                .resolve("tests").resolve(CONFIG_TOML_FILENAME);
    }

    /**
     * Gets the configuration value for a variable from the parsed Config.toml.
     */
    private Optional<TomlNode> getConfigValue(Toml configValues, String packageName,
                                              String moduleName, String variableName, boolean isRootProject) {
        if (configValues == null) {
            return Optional.empty();
        }

        String pkgNameNormalized = packageName.replace(FORWARD_SLASH, DOT);
        String tomlPkgEntryKey = moduleName.isEmpty() ? pkgNameNormalized :
                String.format("%s.%s", pkgNameNormalized, moduleName);

        // 1. Try to access config values stored with the fully qualified package/module name.
        Optional<Toml> moduleConfigValues = configValues.getTable(tomlPkgEntryKey);
        if (moduleConfigValues.isPresent()) {
            Optional<TomlValueNode> variableValueNode = moduleConfigValues.get().get(variableName);
            if (variableValueNode.isPresent()) {
                return Optional.of(variableValueNode.get());
            }
            Optional<Toml> variableValueTable = moduleConfigValues.get().getTable(variableName);
            if (variableValueTable.isPresent()) {
                return Optional.ofNullable(variableValueTable.get().rootNode());
            }
        }

        // 2. If the module belongs to the root package, try to access directly,
        // as config values can be stored without the package name prefix.
        if (isRootProject) {
            if (moduleName.isEmpty()) {
                Optional<TomlValueNode> variableValueNode = configValues.get(variableName);
                if (variableValueNode.isPresent()) {
                    return Optional.of(variableValueNode.get());
                }
                Optional<Toml> variableValueTable = configValues.getTable(variableName);
                if (variableValueTable.isPresent()) {
                    return Optional.ofNullable(variableValueTable.get().rootNode());
                }
            } else {
                moduleConfigValues = configValues.getTable(moduleName);
                if (moduleConfigValues.isPresent()) {
                    Optional<TomlValueNode> variableValueNode = moduleConfigValues.get().get(variableName);
                    if (variableValueNode.isPresent()) {
                        return Optional.of(variableValueNode.get());
                    }
                    Optional<Toml> variableValueTable = moduleConfigValues.get().getTable(variableName);
                    if (variableValueTable.isPresent()) {
                        return Optional.ofNullable(variableValueTable.get().rootNode());
                    }
                }
            }
        }

        // 3. If the variable is not found, try to access it with a dotted notation.
        String dottedVariableName = String.format("%s.%s", tomlPkgEntryKey, variableName);
        Optional<TomlValueNode> variableValueNode = configValues.get(dottedVariableName);
        if (variableValueNode.isPresent()) {
            return Optional.of(variableValueNode.get());
        }

        return Optional.empty();
    }

    /**
     * Converts a {@link TomlNode} value from TOML syntax to its Ballerina expression syntax.
     */
    private String getInBallerinaSyntax(TomlNode tomlValueNode) {
        // In case of syntax errors, return the original string representation of the value in the TOML file.
        boolean hasSyntaxErrors = tomlValueNode.diagnostics().stream()
                .anyMatch(diagnostic -> diagnostic.diagnosticInfo().severity() == DiagnosticSeverity.ERROR);
        if (hasSyntaxErrors) {
            return tomlValueNode.externalTreeNode().toSourceCode();
        }

        switch (tomlValueNode.kind()) {
            case TABLE -> {
                List<String> keyValuePairs = new ArrayList<>();
                for (Map.Entry<String, TopLevelNode> entry :
                        ((TomlTableNode) tomlValueNode).entries().entrySet()) {
                    String key = entry.getKey();
                    TopLevelNode topLevelNode = entry.getValue();
                    String value = switch (topLevelNode.kind()) {
                        case KEY_VALUE -> getInBallerinaSyntax(((TomlKeyValueNode) topLevelNode).value());
                        case TABLE, TABLE_ARRAY -> getInBallerinaSyntax(topLevelNode);
                        default -> null;
                    };
                    if (value == null) {
                        return null;
                    }
                    keyValuePairs.add(key + COLON_SPACE + value);
                }
                return OPEN_BRACE + String.join(COMMA_SPACE, keyValuePairs) + CLOSE_BRACE;
            }
            case INTEGER, DOUBLE, BOOLEAN -> {
                return tomlValueNode.toString();
            }
            case STRING -> {
                return DOUBLE_QUOTE + CommonUtils.escapeContent(tomlValueNode.toString()) + DOUBLE_QUOTE;
            }
            case ARRAY -> {
                List<TomlValueNode> elements = ((TomlArrayValueNode) tomlValueNode).elements();
                List<String> elementValues = elements.stream().map(this::getInBallerinaSyntax).toList();
                if (elementValues.contains(null)) {
                    return null;
                }
                return OPEN_BRACKET + String.join(COMMA_SPACE, elementValues) + CLOSE_BRACKET;
            }
            case INLINE_TABLE -> {
                return getInBallerinaSyntax(((TomlInlineTableValueNode) tomlValueNode).toTable());
            }
            case TABLE_ARRAY -> {
                List<TomlTableNode> children = ((TomlTableArrayNode) tomlValueNode).children();
                List<String> tableValues = children.stream().map(this::getInBallerinaSyntax).toList();
                if (tableValues.contains(null)) {
                    return null;
                }
                return OPEN_BRACKET + String.join(COMMA_SPACE, tableValues) + CLOSE_BRACKET;
            }
            case UNQUOTED_KEY, KEY_VALUE, NONE -> {
                // Not applicable for value conversion
            }
            default -> {
                return null;
            }
        }
        return null;
    }

    /**
     * Extracts configuration variables from the current package and its submodules.
     */
    private Map<String, Map<String, List<FlowNode>>> extractVariablesFromProject(
            Package rootPackage, Project project, Toml configTomlValues) {
        Map<String, List<FlowNode>> moduleConfigVarMap = new HashMap<>();
        String pkgName = rootPackage.packageOrg().value() + FORWARD_SLASH + rootPackage.packageName().value();

        for (Module module : rootPackage.modules()) {
            String modName = module.moduleName().moduleNamePart() != null ?
                    module.moduleName().moduleNamePart() : EMPTY_STRING;
            Toml testsConfigTomlValues = parseConfigToml(getTestsConfigTomlPath(project, modName));
            List<FlowNode> variables = extractModuleConfigVariables(module, configTomlValues, testsConfigTomlValues,
                    pkgName, modName, true);
            moduleConfigVarMap.put(modName, variables);
        }

        Map<String, Map<String, List<FlowNode>>> configVarMap = new LinkedHashMap<>();
        configVarMap.put(pkgName, moduleConfigVarMap);
        return configVarMap;
    }

    private Path findVariableFilePath(FlowNode configVariable, Path contextFilePath, Project rootProject) {
        // If an explicit file path is supplied in codedata.data (e.g. test-function context), use it.
        Codedata codedata = configVariable.codedata();
        if (codedata != null && codedata.data() != null
                && codedata.data().containsKey(Constants.FILE_PATH_KEY)) {
            return Path.of(codedata.data().get(Constants.FILE_PATH_KEY).toString());
        }

        if (isNew(configVariable)) {
            return contextFilePath;
        }

        if (configVariable.codedata() == null || configVariable.codedata().lineRange() == null) {
            return null;
        }
        String variableFileName = configVariable.codedata().lineRange().fileName();

        if (rootProject.kind() == ProjectKind.SINGLE_FILE_PROJECT) {
            return rootProject.sourceRoot();
        }

        for (Module module : rootProject.currentPackage().modules()) {
            for (DocumentId documentId : module.documentIds()) {
                Document document = module.document(documentId);
                if (document.name().equals(variableFileName)) {
                    return rootProject.sourceRoot().resolve(document.syntaxTree().filePath());
                }
            }
            for (DocumentId documentId : module.testDocumentIds()) {
                Document document = module.document(documentId);
                if (document.name().equals(variableFileName)) {
                    return rootProject.sourceRoot().resolve(document.syntaxTree().filePath());
                }
            }
        }
        return null;
    }

    /**
     * Checks if a configuration variable is new (i.e., does not yet exist in source code).
     */
    private boolean isNew(FlowNode configVariable) {
        return configVariable.codedata() != null
                && configVariable.codedata().isNew() != null
                && configVariable.codedata().isNew();
    }

    /**
     * Extracts configuration variables from the given module.
     */
    private List<FlowNode> extractModuleConfigVariables(Module module, Toml configTomlValues,
                                                        Toml testsConfigTomlValues, String packageName,
                                                        String moduleName, boolean isRootProject) {
        List<FlowNode> configVariables = new LinkedList<>();
        Optional<SemanticModel> semanticModel = getSemanticModel(module);
        boolean hasTests = isRootProject && !module.testDocumentIds().isEmpty();

        for (DocumentId documentId : module.documentIds()) {
            Document document = module.document(documentId);
            SyntaxTree syntaxTree = document.syntaxTree();
            if (syntaxTree == null) {
                continue;
            }
            ModulePartNode modulePartNode = syntaxTree.rootNode();
            for (Node node : modulePartNode.members()) {
                if (node.kind() == SyntaxKind.MODULE_VAR_DECL) {
                    ModuleVariableDeclarationNode varDeclarationNode = (ModuleVariableDeclarationNode) node;
                    if (hasConfigurableQualifier(varDeclarationNode)) {
                        FlowNode configVarNode = constructConfigVarNode(varDeclarationNode, semanticModel.orElse(null),
                                configTomlValues, testsConfigTomlValues, packageName, moduleName, isRootProject, false,
                                hasTests);
                        configVariables.add(configVarNode);
                    }
                }
            }
        }

        for (DocumentId documentId : module.testDocumentIds()) {
            Document document = module.document(documentId);
            SyntaxTree syntaxTree = document.syntaxTree();
            if (syntaxTree == null) {
                continue;
            }
            ModulePartNode modulePartNode = syntaxTree.rootNode();
            for (Node node : modulePartNode.members()) {
                if (node.kind() == SyntaxKind.MODULE_VAR_DECL) {
                    ModuleVariableDeclarationNode varDeclarationNode = (ModuleVariableDeclarationNode) node;
                    if (hasConfigurableQualifier(varDeclarationNode)) {
                        FlowNode configVarNode = constructConfigVarNode(varDeclarationNode, semanticModel.orElse(null),
                                null, testsConfigTomlValues, packageName, moduleName, isRootProject, true, true);
                        configVariables.add(configVarNode);
                    }
                }
            }
        }
        return configVariables;
    }

    /**
     * Retrieves the {@link SemanticModel} for a given module.
     *
     * @param module The module.
     * @return An {@link Optional} containing the {@link SemanticModel}, or empty if unavailable.
     */
    private static Optional<SemanticModel> getSemanticModel(Module module) {
        try {
            Package packageInstance = module.packageInstance();
            if (packageInstance != null) {
                // Resolve the dependency package offline ONLY during tests (ls.test.offline) so compiling it to read
                // its config variables never pulls transitive dependencies from Central; compilation then reuses this
                // cached resolution. In production we leave the package's own (inherited) resolution untouched, which
                // matches the original behaviour exactly.
                if (PackageUtil.isOffline()) {
                    packageInstance.getResolution(
                            CompilationOptions.builder().setOffline(true).build());
                }
                if (packageInstance.getCompilation() != null) {
                    SemanticModel semanticModel = packageInstance.getCompilation()
                            .getSemanticModel(module.moduleId());
                    return Optional.ofNullable(semanticModel);
                }
            }
        } catch (RuntimeException e) {
            // getSemanticModel() can throw an Error if the module is an imported module without a semantic model.
        }
        return Optional.empty();
    }

    /**
     * Extracts configuration variables from the dependencies of the current package.
     */
    private Map<String, Map<String, List<FlowNode>>> extractConfigsFromDependencies(
            Package currentPackage, Toml configTomlValues) {
        Map<String, Map<String, List<FlowNode>>> dependencyConfigVarMap = new HashMap<>();
        for (Module module : currentPackage.modules()) {
            List<ModuleDependency> validDependencies = new LinkedList<>();
            populateValidDependencies(currentPackage, module, validDependencies);
            dependencyConfigVarMap.putAll(getImportedConfigVars(currentPackage, validDependencies, configTomlValues));
        }
        return dependencyConfigVarMap;
    }

    /**
     * Checks if a {@link ModuleVariableDeclarationNode} has the 'configurable' qualifier.
     */
    private static boolean hasConfigurableQualifier(ModuleVariableDeclarationNode node) {
        return node.qualifiers()
                .stream()
                .anyMatch(q -> q.text().equals(Qualifier.CONFIGURABLE.getValue()));
    }

    /**
     * Retrieves configurable variables for all direct imports of a package.
     */
    private Map<String, Map<String, List<FlowNode>>> getImportedConfigVars(
            Package currentPkg, Collection<ModuleDependency> moduleDependencies,
            Toml configTomlValues) {
        Map<String, Map<String, List<FlowNode>>> pkgConfigs = new HashMap<>();
        // Resolve the dependency graph offline ONLY during tests (ls.test.offline) so config extraction never pulls
        // from Central; in production use the package's default (no-arg) resolution to match the original behaviour.
        // Resolve once and reuse.
        PackageResolution resolution = PackageUtil.isOffline()
                ? currentPkg.getResolution(CompilationOptions.builder().setOffline(true).build())
                : currentPkg.getResolution();
        if (resolution == null || resolution.dependencyGraph() == null) {
            return pkgConfigs;
        }
        Collection<ResolvedPackageDependency> dependencies = resolution.dependencyGraph().getNodes();
        for (ResolvedPackageDependency dependency : dependencies) {
            if (dependency.packageInstance() == null || !isDirectDependency(dependency, moduleDependencies)) {
                continue;
            }

            Map<String, List<FlowNode>> moduleConfigs = processDependency(dependency, configTomlValues);
            if (!moduleConfigs.isEmpty()) {
                String pkgKey = dependency.packageInstance().packageOrg().value() + FORWARD_SLASH +
                        dependency.packageInstance().packageName().value();
                pkgConfigs.put(pkgKey, moduleConfigs);
            }
        }
        return pkgConfigs;
    }

    /**
     * Processes a resolved package dependency to extract its configuration variables.
     */
    private Map<String, List<FlowNode>> processDependency(ResolvedPackageDependency dependency,
                                                          Toml configTomlValues) {
        Map<String, List<FlowNode>> moduleConfigs = new HashMap<>();
        String packageName = dependency.packageInstance().packageOrg().value() + FORWARD_SLASH +
                dependency.packageInstance().packageName().value();

        for (Module module : dependency.packageInstance().modules()) {
            String moduleName = module.moduleName().moduleNamePart() != null ?
                    module.moduleName().moduleNamePart() : EMPTY_STRING;
            List<FlowNode> variables = extractModuleConfigVariables(module, configTomlValues, null, packageName,
                    moduleName, false);
            if (!variables.isEmpty()) {
                moduleConfigs.put(moduleName, variables);
            }
        }
        return moduleConfigs;
    }

    /**
     * Populates a collection with valid module dependencies for a given package and module. Valid dependencies are
     * those with default scope and not belonging to the same package.
     */
    private static void populateValidDependencies(Package packageInstance, Module module,
                                                  Collection<ModuleDependency> dependencies) {
        for (ModuleDependency moduleDependency : module.moduleDependencies()) {
            if (!isDefaultScope(moduleDependency) || isSamePackage(packageInstance, moduleDependency)) {
                continue;
            }
            dependencies.add(moduleDependency);
        }
    }

    /**
     * Checks if the dependency has the default scope.
     *
     * @param moduleDependency The module dependency.
     * @return {@code true} if the scope is default, {@code false} otherwise.
     */
    private static boolean isDefaultScope(ModuleDependency moduleDependency) {
        return moduleDependency.packageDependency().scope().getValue().equals(
                PlatformLibraryScope.DEFAULT.getStringValue());
    }

    /**
     * Checks if the dependency is from the same package as the provided package instance.
     */
    private static boolean isSamePackage(Package packageInstance, ModuleDependency moduleDependency) {
        String orgValue = moduleDependency.descriptor().org().value();
        String packageVal = moduleDependency.descriptor().packageName().value();
        return orgValue.equals(packageInstance.packageOrg().value())
                && packageVal.equals(packageInstance.packageName().value());
    }

    /**
     * Checks if a given resolved package dependency is a direct dependency based on a collection of module
     * dependencies.
     */
    private static boolean isDirectDependency(ResolvedPackageDependency dep,
                                              Collection<ModuleDependency> moduleDependencies) {
        PackageDescriptor descriptor = dep.packageInstance().descriptor();
        String orgName = descriptor.org().value();
        String packageName = descriptor.name().value();

        for (ModuleDependency dependency : moduleDependencies) {
            if (dependency.descriptor().org().value().equals(orgName) &&
                    dependency.descriptor().packageName().value().equals(packageName)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Constructs a {@link FlowNode} for a configuration variable, incorporating its value from Config.toml if
     * available.
     */
    private FlowNode constructConfigVarNode(ModuleVariableDeclarationNode variableNode,
                                            SemanticModel semanticModel, Toml configTomlValues,
                                            Toml testsConfigTomlValues, String packageName, String moduleName,
                                            boolean isRootProject, boolean isTestSource, boolean hasTests) {

        NodeBuilder nodeBuilder = NodeBuilder.getNodeFromKind(NodeKind.CONFIG_VARIABLE)
                .semanticModel(semanticModel)
                .defaultModuleName(null);

        if (semanticModel != null) {
            DiagnosticHandler diagnosticHandler = new DiagnosticHandler(semanticModel);
            diagnosticHandler.handle(nodeBuilder, variableNode.lineRange(), false);
            nodeBuilder.diagnosticHandler(diagnosticHandler);
        }

        TypedBindingPatternNode typedBindingPattern = variableNode.typedBindingPattern();
        String variableName = typedBindingPattern.bindingPattern().toSourceCode().trim();
        Optional<Node> markdownDocs = extractVariableDocs(variableNode);

        // Get the configuration value from root Config.toml.
        Optional<TomlNode> configTomlValue = getConfigValue(configTomlValues, packageName, moduleName, variableName,
                isRootProject);
        ExpressionNode configValueExpr = null;
        if (configTomlValue.isPresent()) {
            String tomlStringValue = getInBallerinaSyntax(configTomlValue.get());
            if (tomlStringValue != null) {
                configValueExpr = NodeParser.parseExpression(tomlStringValue);
            }
        }

        // Get the configuration value from the module-specific tests/Config.toml.
        Optional<TomlNode> testConfigTomlValue = getConfigValue(testsConfigTomlValues, packageName, moduleName,
                variableName, isRootProject);
        ExpressionNode testConfigValueExpr = null;
        if (testConfigTomlValue.isPresent()) {
            String tomlStringValue = getInBallerinaSyntax(testConfigTomlValue.get());
            if (tomlStringValue != null) {
                testConfigValueExpr = NodeParser.parseExpression(tomlStringValue);
            }
        }

        TypeDescriptorNode typeDescriptor = typedBindingPattern.typeDescriptor();
        Codedata.Builder<NodeBuilder> codedataBuilder = nodeBuilder
                .metadata()
                .stepOut()
                .codedata()
                .node(NodeKind.CONFIG_VARIABLE)
                .lineRange(variableNode.lineRange());
        if (isTestSource) {
            codedataBuilder.data("isTestConfig", true);
        }
        var propsBuilder = codedataBuilder
                .stepOut()
                .properties()
                .variableName(variableName, isRootProject)
                .custom()
                    .metadata()
                        .label(Property.TYPE_LABEL)
                        .description(Property.TYPE_DOC)
                        .stepOut()
                    .placeholder("var")
                    .value(CommonUtils.getVariableName(typeDescriptor))
                    .type()
                        .fieldType(Property.ValueType.TYPE)
                        .setTypeMembers(extractTypeMembersFromTypeDescriptor(typeDescriptor, semanticModel))
                        .stepOut()
                    .editable(isRootProject)
                    .stepOut()
                    .addProperty(Property.TYPE_KEY, typeDescriptor.lineRange())
                .defaultValue(variableNode.initializer().orElse(null), isRootProject)
                .configValue(configValueExpr);
        if (hasTests) {
            propsBuilder.testConfigValue(testConfigValueExpr);
        }
        return propsBuilder
                .documentation(markdownDocs.orElse(null), isRootProject)
                .stepOut()
                .build();
    }

    /**
     * Extracts the markdown documentation from the variable node.
     */
    private static Optional<Node> extractVariableDocs(ModuleVariableDeclarationNode variableNode) {
        Optional<MetadataNode> metadata = variableNode.metadata();
        if (metadata.isEmpty()) {
            return Optional.empty();
        }
        return metadata.get().documentationString();
    }

    /**
     * Creates a template {@link FlowNode} for a configuration variable.
     */
    private static FlowNode getConfigVariableFlowNodeTemplate(boolean isNew) {
        NodeBuilder nodeBuilder = NodeBuilder
                .getNodeFromKind(NodeKind.CONFIG_VARIABLE)
                .defaultModuleName(null);

        nodeBuilder = nodeBuilder
                .metadata()
                .stepOut()
                .codedata()
                .node(NodeKind.CONFIG_VARIABLE)
                .lineRange(null)
                .isNew(isNew)
                .stepOut();

        if (isNew) {
            nodeBuilder = nodeBuilder
                    .properties()
                    .variableName(null, true, false)
                    .type(null, true, false)
                    .configValue(null)
                    .defaultValue(null)
                    .documentation(null)
                    .stepOut();
        } else {
            nodeBuilder = nodeBuilder
                    .properties()
                    .variableName(null, true, false)
                    .type(null, true, false)
                    .defaultValue(null)
                    .documentation(null)
                    .stepOut();
        }

        return nodeBuilder.build();
    }

    /**
     * Constructs text edits for updating a Config.toml file with a new configuration value or deleting an entry.
     *
     * @param configValueKey the property key to read the value from ({@code CONFIG_VALUE_KEY} for the root Config.toml,
     *                       {@code TEST_CONFIG_VALUE_KEY} for the tests Config.toml)
     */
    private Map<Path, List<TextEdit>> constructConfigTomlTextEdits(Project project, String packageName,
                                                                   String moduleName, FlowNode configVariable,
                                                                   Path configTomlPath, Toml existingConfigToml,
                                                                   boolean isDelete, String configValueKey) {
        Map<Path, List<TextEdit>> textEditsMap = new HashMap<>();
        try {
            if (!isDelete && !configVariable.properties().containsKey(configValueKey)) {
                return textEditsMap;
            }

            Property nameProp = configVariable.properties().get(VARIABLE_KEY);
            String oldVariableName = isNameModified(nameProp) ? nameProp.oldValue().toString()
                    : nameProp.value().toString();

            Optional<TomlNode> oldConfigValue = getConfigValue(existingConfigToml, packageName, moduleName,
                    oldVariableName, isPackageInRootProject(packageName, project));
            String configValue = configVariable.properties().containsKey(configValueKey)
                    ? configVariable.properties().get(configValueKey).toSourceCode() : "";
            // Treat a Ballerina empty-string literal ("") as "no value" so the entry is removed from Config.toml.
            if ("\"\"".equals(configValue)) {
                configValue = EMPTY_STRING;
            }
            if (isDelete && oldConfigValue.isEmpty()) {
                return textEditsMap;
            } else if (oldConfigValue.isEmpty() && configValue.isEmpty()) {
                return textEditsMap;
            }

            String[] pkgParts = packageName.split(FORWARD_SLASH);
            String orgName = pkgParts.length > 0 ? pkgParts[0] : EMPTY_STRING;
            String pkgName = pkgParts.length > 1 ? pkgParts[1] : EMPTY_STRING;
            String variableName = nameProp.value().toString();

            String newContent = isDelete || configValue.isEmpty() ? EMPTY_STRING : constructConfigTomlStatement(
                    orgName, pkgName, moduleName, variableName, configValue, oldConfigValue.isPresent());
            // Key-value only (no section header) for inserting into an existing section.
            String keyValueContent = isDelete || configValue.isEmpty() ? EMPTY_STRING : constructConfigTomlStatement(
                    orgName, pkgName, moduleName, variableName, configValue, true);

            List<TextEdit> textEdits = new ArrayList<>();
            if (oldConfigValue.isPresent()) {
                String fileName = oldConfigValue.get().location().lineRange().fileName();
                LineRange lineRange = oldConfigValue.get().location().lineRange();
                LinePosition startPos = LinePosition.from(lineRange.startLine().line(), 0);
                // When deleting, extend the end to the start of the next line to consume the trailing newline,
                // preventing a blank line from being left behind.
                LinePosition endPos = newContent.isEmpty()
                        ? LinePosition.from(lineRange.endLine().line() + 1, 0)
                        : LinePosition.from(lineRange.endLine().line(), lineRange.endLine().offset());

                LineRange newlineRange = LineRange.from(fileName, startPos, endPos);
                textEdits.add(new TextEdit(CommonUtils.toRange(newlineRange), newContent));
            } else {
                // if the variable is new, we need to find the relevant section in Config.toml file and add the new
                // entry after the last entry of the section.
                if (existingConfigToml != null) {
                    // Try to find existing section for the module
                    String sectionKey = moduleName.isEmpty() ? String.format("%s.%s", orgName, pkgName)
                            : String.format("%s.%s.%s", orgName, pkgName, moduleName);

                    Optional<Toml> moduleSection = existingConfigToml.getTable(sectionKey);
                    if (moduleSection.isPresent()) {
                        // Section exists - find the last entry and add after it
                        TomlTableNode moduleTableNode = moduleSection.get().rootNode();
                        if (!moduleTableNode.entries().isEmpty()) {
                            // Get the last entry in the section
                            TomlNode lastEntry = moduleTableNode.entries().values().stream()
                                    .reduce((first, second) -> second)
                                    .orElse(null);

                            if (lastEntry != null) {
                                LinePosition insertPos = LinePosition.from(
                                        lastEntry.location().lineRange().endLine().line() + 1, 0);
                                textEdits.add(new TextEdit(CommonUtils.toRange(insertPos),
                                        String.format("%s%n", keyValueContent)));
                            }
                        } else {
                            // Section exists but is empty - add right after section header
                            LinePosition insertPos = LinePosition.from(
                                    moduleTableNode.location().lineRange().endLine().line() + 1, 0);
                            textEdits.add(new TextEdit(CommonUtils.toRange(insertPos),
                                    String.format("%s%n", keyValueContent)));
                        }
                    } else {
                        // Section doesn't exist - append to end of file
                        TomlTableNode rootNode = existingConfigToml.rootNode();
                        LinePosition insertPos;

                        if (!rootNode.entries().isEmpty()) {
                            // Find the last entry in the root table
                            TomlNode lastEntry = rootNode.entries().values().stream()
                                    .reduce((first, second) -> second)
                                    .orElseThrow();
                            insertPos = LinePosition.from(lastEntry.location().lineRange().endLine().line() + 1, 0);
                        } else {
                            // Empty config file
                            insertPos = LinePosition.from(0, 0);
                        }

                        textEdits.add(new TextEdit(CommonUtils.toRange(insertPos),
                                String.format("%n%s%n", newContent)));
                    }
                } else {
                    // Config.toml doesn't exist - create new file with the content
                    if (!Files.exists(configTomlPath)) {
                        try {
                            Files.createFile(configTomlPath);
                        } catch (IOException createEx) {
                            // Handle file creation error
                            return textEditsMap;
                        }
                    }
                    LinePosition startPos = LinePosition.from(0, 0);
                    textEdits.add(new TextEdit(CommonUtils.toRange(startPos), newContent + LS));
                }
            }

            textEditsMap.put(configTomlPath, textEdits);
            return textEditsMap;
        } catch (RuntimeException e) {
            return new HashMap<>();
        }
    }

    /**
     * Checks if the configurable variable name has been modified.
     */
    private static boolean isNameModified(Property nameProp) {
        return Boolean.TRUE.equals(nameProp.modified()) && nameProp.oldValue() != null;
    }

    /**
     * Checks if the given package name corresponds to the root project's package.
     */
    private static boolean isPackageInRootProject(String packageName, Project rootProject) {
        if (rootProject == null || rootProject.currentPackage() == null) {
            return false;
        }
        String rootPackageName = rootProject.currentPackage().packageOrg().value() + FORWARD_SLASH +
                rootProject.currentPackage().packageName().value();
        return packageName.equals(rootPackageName);
    }

    /**
     * Constructs a TOML statement for a configuration variable.
     */
    private static String constructConfigTomlStatement(String orgName, String packageName, String moduleName,
                                                       String variableName, String value, boolean sectionHeaderExists) {
        ExpressionNode configValueExpr = NodeParser.parseExpression(value);
        String tomlValue = getInTomlSyntax(configValueExpr);

        if (sectionHeaderExists) {
            return String.format(TOML_KEY_VALUE_FORMAT, variableName, tomlValue);
        } else {
            String sectionHeader;
            if (moduleName.isEmpty()) {
                sectionHeader = String.format(TOML_MODULE_SECTION_FORMAT, orgName, packageName);
            } else {
                sectionHeader = String.format(TOML_MODULE_WITH_SUBMODULE_SECTION_FORMAT,
                        orgName, packageName, moduleName);
            }
            return String.format("%s%n%s", sectionHeader, String.format(TOML_KEY_VALUE_FORMAT,
                    variableName, tomlValue));
        }
    }

    /**
     * Converts a Ballerina {@link ExpressionNode} into its TOML syntax string representation.
     */
    private static String getInTomlSyntax(ExpressionNode configValueExpr) {
        switch (configValueExpr.kind()) {
            case MAPPING_CONSTRUCTOR -> {
                MappingConstructorExpressionNode recordTypeDesc = (MappingConstructorExpressionNode) configValueExpr;
                StringBuilder sb = new StringBuilder(OPEN_BRACE);
                for (MappingFieldNode field : recordTypeDesc.fields()) {
                    if (field.kind() == SyntaxKind.SPECIFIC_FIELD) {
                        SpecificFieldNode mappingField = (SpecificFieldNode) field;
                        String key = mappingField.fieldName().toSourceCode();
                        String value = mappingField.valueExpr().isPresent() ?
                                getInTomlSyntax(mappingField.valueExpr().get()) : null;
                        if (value != null) {
                            sb.append(key).append(EQUALS_SIGN_SPACED).append(value).append(COMMA_SPACE);
                        }
                    }
                }
                if (sb.length() > 1) {
                    sb.setLength(sb.length() - 2);
                }
                sb.append(CLOSE_BRACE);
                return sb.toString();
            }
            case LIST_CONSTRUCTOR -> {
                ListConstructorExpressionNode arrayTypeDesc = (ListConstructorExpressionNode) configValueExpr;
                StringBuilder sbArray = new StringBuilder(OPEN_BRACKET);
                List<String> memberValues = new LinkedList<>();
                for (Node element : arrayTypeDesc.expressions()) {
                    if (element instanceof ExpressionNode expressionNode) {
                        memberValues.add(getInTomlSyntax(expressionNode));
                    }
                }
                sbArray.append(String.join(COMMA_SPACE, memberValues));
                sbArray.append(CLOSE_BRACKET);
                return sbArray.toString();
            }
            case NUMERIC_LITERAL -> {
                // Strip Ballerina-specific decimal (d/D) and float (f/F) suffixes invalid in TOML
                String numericValue = configValueExpr.toSourceCode().trim();
                if (numericValue.endsWith("d") || numericValue.endsWith("D")
                        || numericValue.endsWith("f") || numericValue.endsWith("F")) {
                    numericValue = numericValue.substring(0, numericValue.length() - 1);
                }
                return numericValue;
            }
            default -> {
                // TODO: Add support for other types if needed
                return configValueExpr.toSourceCode();
            }
        }
    }

    /**
     * Checks if the Ballerina source edits are required when updating a configuration variable, based on its modified
     * properties.
     */
    private boolean requireSourceEdits(FlowNode configVariable) {
        Property variableName = configVariable.properties().get(VARIABLE_KEY);
        Property variableType = configVariable.properties().get(Property.TYPE_KEY);
        Property defaultValue = configVariable.properties().get(DEFAULT_VALUE_KEY);
        Property documentation = configVariable.properties().get(CONFIG_VAR_DOC_KEY);

        return (variableName != null && Boolean.TRUE.equals(variableName.modified()))
                || (variableType != null && Boolean.TRUE.equals(variableType.modified()))
                || (defaultValue != null && Boolean.TRUE.equals(defaultValue.modified()))
                || (documentation != null && Boolean.TRUE.equals(documentation.modified()));
    }

    private static void handleConfigTomlErrors(Toml configTomlValues, AbstractFlowModelResponse response) {
        boolean hasErrors = configTomlValues != null && configTomlValues.diagnostics().stream()
                .anyMatch(d -> d.diagnosticInfo().severity() == DiagnosticSeverity.ERROR);
        if (hasErrors) {
            IllegalStateException exception = new IllegalStateException("Config.toml contains syntax errors. " +
                    "Features like config editing, local run, and debugging may not function properly " +
                    "until the file is manually fixed.");
            response.setError(exception);
        }
    }

    /**
     * Extracts type members from a TypeDescriptorNode using SemanticModel. For union types, this extracts all member
     * types with their metadata.
     *
     * <p>
     * TODO: this is a replicate implementation of {@link io.ballerina.modelgenerator.commons.FunctionDataBuilder},
     * and should be refactored to reuse the implementation
     *
     * @param typeDescriptor The type descriptor node to extract type members from.
     * @param semanticModel  The semantic model for type resolution.
     * @return A list of {@link ParameterMemberTypeData} representing the type members.
     */
    private List<ParameterMemberTypeData> extractTypeMembersFromTypeDescriptor(
            Node typeDescriptor, SemanticModel semanticModel) {
        List<ParameterMemberTypeData> typeMembers = new ArrayList<>();

        if (semanticModel == null) {
            return typeMembers;
        }

        Optional<TypeSymbol> typeSymbol = semanticModel.symbol(typeDescriptor)
                .filter(symbol -> symbol instanceof TypeSymbol)
                .map(symbol -> (TypeSymbol) symbol);
        if (typeSymbol.isEmpty()) {
            return typeMembers;
        }

        // Create a union type of basic types for subtype checking
        Types types = semanticModel.types();
        TypeBuilder builder = semanticModel.types().builder();
        UnionTypeSymbol union = builder.UNION_TYPE.withMemberTypes(types.BOOLEAN, types.NIL, types.STRING,
                types.INT, types.FLOAT, types.DECIMAL, types.BYTE, types.REGEX, types.XML).build();

        addTypeMembersFromSymbol(typeSymbol.get(), typeMembers, union);
        return typeMembers;
    }

    /**
     * Recursively adds type members from a TypeSymbol.
     *
     * <p>
     * TODO: this is a replicate implementation of {@link io.ballerina.modelgenerator.commons.FunctionDataBuilder},
     * and should be refactored to reuse the implementation
     *
     * @param typeSymbol  The type symbol to extract members from.
     * @param typeMembers The list to add extracted type members to.
     * @param union       The union type symbol for subtype checking.
     */
    private void addTypeMembersFromSymbol(TypeSymbol typeSymbol, List<ParameterMemberTypeData> typeMembers,
                                          UnionTypeSymbol union) {
        // Handle UnionTypeSymbol - recursively extract members
        if (typeSymbol instanceof UnionTypeSymbol unionTypeSymbol) {
            unionTypeSymbol.memberTypeDescriptors().forEach(
                    memberType -> addTypeMembersFromSymbol(memberType, typeMembers, union));
            return;
        }

        String packageIdentifier = "";
        ModuleInfo moduleInfo = null;
        if (typeSymbol.getModule().isPresent()) {
            ModuleID id = typeSymbol.getModule().get().id();
            packageIdentifier = "%s:%s:%s".formatted(id.orgName(), id.moduleName(), id.version());
            moduleInfo = ModuleInfo.from(id);
        }

        String type = CommonUtils.getTypeSignature(typeSymbol, moduleInfo);
        String kind = "OTHER";
        TypeSymbol rawType = CommonUtils.getRawType(typeSymbol);

        // Check if it's a basic type by verifying if it's a subtype of union
        if (typeSymbol.subtypeOf(union)) {
            kind = "BASIC_TYPE";
        } else if (rawType instanceof TupleTypeSymbol) {
            kind = "TUPLE_TYPE";
        } else if (rawType instanceof ArrayTypeSymbol arrayTypeSymbol) {
            kind = "ARRAY_TYPE";
            // For arrays, extract the member type information
            TypeSymbol memberType = arrayTypeSymbol.memberTypeDescriptor();
            if (memberType.getModule().isPresent()) {
                ModuleID id = memberType.getModule().get().id();
                packageIdentifier = "%s:%s:%s".formatted(id.orgName(), id.moduleName(), id.version());
                moduleInfo = ModuleInfo.from(id);
            }
            type = CommonUtils.getTypeSignature(memberType, moduleInfo);
        } else if (rawType instanceof RecordTypeSymbol) {
            if (typeSymbol instanceof RecordTypeSymbol) {
                kind = "ANON_RECORD_TYPE";
            } else {
                kind = "RECORD_TYPE";
            }
        } else if (rawType instanceof MapTypeSymbol mapTypeSymbol) {
            kind = "MAP_TYPE";
            // For maps, extract the type parameter information
            TypeSymbol typeParam = mapTypeSymbol.typeParam();
            if (typeParam.getModule().isPresent()) {
                ModuleID id = typeParam.getModule().get().id();
                packageIdentifier = "%s:%s:%s".formatted(id.orgName(), id.moduleName(), id.version());
                moduleInfo = ModuleInfo.from(id);
            }
            type = CommonUtils.getTypeSignature(typeSymbol, moduleInfo);
        } else if (rawType instanceof TableTypeSymbol tableTypeSymbol) {
            kind = "TABLE_TYPE";
            // For tables, extract the row type parameter information
            TypeSymbol rowTypeParameter = tableTypeSymbol.rowTypeParameter();
            if (rowTypeParameter.getModule().isPresent()) {
                ModuleID id = rowTypeParameter.getModule().get().id();
                packageIdentifier = "%s:%s:%s".formatted(id.orgName(), id.moduleName(), id.version());
                moduleInfo = ModuleInfo.from(id);
            }
            type = CommonUtils.getTypeSignature(typeSymbol, moduleInfo);
        } else if (rawType instanceof StreamTypeSymbol) {
            kind = "STREAM_TYPE";
        } else if (rawType instanceof ObjectTypeSymbol) {
            kind = "OBJECT_TYPE";
        } else if (rawType instanceof FunctionTypeSymbol) {
            kind = "FUNCTION_TYPE";
        } else if (rawType instanceof ErrorTypeSymbol) {
            kind = "ERROR_TYPE";
        }

        // Remove module prefix from type name if present
        String[] typeParts = type.split(":");
        if (typeParts.length > 1) {
            type = typeParts[1];
        }

        typeMembers.add(new ParameterMemberTypeData(type, kind, packageIdentifier,
                moduleInfo == null ? "" : moduleInfo.packageName()));
    }
}
