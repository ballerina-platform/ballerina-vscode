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

package io.ballerina.servicemodelgenerator.extension.util;

import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.api.symbols.Qualifier;
import io.ballerina.compiler.api.symbols.Symbol;
import io.ballerina.compiler.api.symbols.VariableSymbol;
import io.ballerina.compiler.syntax.tree.BasicLiteralNode;
import io.ballerina.compiler.syntax.tree.CheckExpressionNode;
import io.ballerina.compiler.syntax.tree.ExplicitNewExpressionNode;
import io.ballerina.compiler.syntax.tree.ExpressionNode;
import io.ballerina.compiler.syntax.tree.FunctionArgumentNode;
import io.ballerina.compiler.syntax.tree.ImplicitNewExpressionNode;
import io.ballerina.compiler.syntax.tree.InterpolationNode;
import io.ballerina.compiler.syntax.tree.ListenerDeclarationNode;
import io.ballerina.compiler.syntax.tree.MappingConstructorExpressionNode;
import io.ballerina.compiler.syntax.tree.MappingFieldNode;
import io.ballerina.compiler.syntax.tree.ModuleMemberDeclarationNode;
import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.compiler.syntax.tree.NamedArgumentNode;
import io.ballerina.compiler.syntax.tree.NewExpressionNode;
import io.ballerina.compiler.syntax.tree.Node;
import io.ballerina.compiler.syntax.tree.NodeFactory;
import io.ballerina.compiler.syntax.tree.NonTerminalNode;
import io.ballerina.compiler.syntax.tree.ParenthesizedArgList;
import io.ballerina.compiler.syntax.tree.PositionalArgumentNode;
import io.ballerina.compiler.syntax.tree.SeparatedNodeList;
import io.ballerina.compiler.syntax.tree.ServiceDeclarationNode;
import io.ballerina.compiler.syntax.tree.SimpleNameReferenceNode;
import io.ballerina.compiler.syntax.tree.SpecificFieldNode;
import io.ballerina.compiler.syntax.tree.SyntaxKind;
import io.ballerina.compiler.syntax.tree.TemplateExpressionNode;
import io.ballerina.projects.Document;
import io.ballerina.projects.DocumentId;
import io.ballerina.projects.Module;
import io.ballerina.projects.Project;
import io.ballerina.servicemodelgenerator.extension.model.Codedata;
import io.ballerina.servicemodelgenerator.extension.model.Listener;
import io.ballerina.servicemodelgenerator.extension.model.PropertyType;
import io.ballerina.servicemodelgenerator.extension.model.PropertyTypeMemberInfo;
import io.ballerina.servicemodelgenerator.extension.model.Value;
import io.ballerina.tools.diagnostics.Location;
import io.ballerina.tools.text.TextRange;
import org.eclipse.lsp4j.TextEdit;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import static io.ballerina.servicemodelgenerator.extension.util.Constants.ARG_TYPE_LISTENER_PARAM_INCLUDED_FIELD;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.FTP;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.PROP_KEY_LISTENER_TYPE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.PROP_KEY_VARIABLE_NAME;

/**
 * FTP-specific listener utility methods.
 *
 * @since 1.7.0
 */
public class FTPListenerUtil {

    private FTPListenerUtil() {
    }

    /**
     * Filters FTP listeners by the requested service flow style.
     *
     * @param listeners        candidate listener names
     * @param removeDeprecated true to keep only new-style listeners and hide deprecated properties
     * @param semanticModel    semantic model for symbol checks
     * @param project          project for source traversal
     * @return filtered listeners
     */
    public static Set<String> filterFtpListenersByDeprecatedMode(Set<String> listeners,
                                                                 boolean removeDeprecated,
                                                                 SemanticModel semanticModel, Project project) {
        Set<String> filtered = new LinkedHashSet<>();
        for (String listenerName : listeners) {
            if (isFtpListenerCompatibleWithFlow(listenerName, removeDeprecated, semanticModel, project)) {
                filtered.add(listenerName);
            }
        }
        return filtered;
    }

    /**
     * Shapes FTP listener properties for legacy/new flows in attach-listener create flow.
     * In addition, this method can suggest a unique listener name using semantic model + source document.
     */
    public static void adjustFtpListenerModelForDeprecatedMode(Listener listenerModel,
                                                               boolean removeDeprecated,
                                                               SemanticModel semanticModel,
                                                               Document document) {
        if (listenerModel == null || listenerModel.getProperties() == null) {
            return;
        }

        Map<String, Value> props = new LinkedHashMap<>(listenerModel.getProperties());
        if (removeDeprecated) {
            props.remove("path");
            props.remove("folderPath");
        }

        List<String> primaryKeys = new ArrayList<>(List.of("host", "port", "portNumber", "auth", "authentication"));
        if (!removeDeprecated) {
            primaryKeys.add("path");
            primaryKeys.add("folderPath");
        }

        Map<String, Value> ordered = new LinkedHashMap<>();
        for (String key : primaryKeys) {
            addIfPresent(ordered, props, key);
        }
        addIfPresent(ordered, props, PROP_KEY_VARIABLE_NAME);
        addIfPresent(ordered, props, PROP_KEY_LISTENER_TYPE);

        for (Map.Entry<String, Value> entry : props.entrySet()) {
            ordered.putIfAbsent(entry.getKey(), entry.getValue());
        }

        for (Map.Entry<String, Value> entry : ordered.entrySet()) {
            entry.getValue().setAdvanced(!primaryKeys.contains(entry.getKey()));
        }

        if (semanticModel != null && document != null && ordered.containsKey(PROP_KEY_VARIABLE_NAME)) {
            Value variableName = ordered.get(PROP_KEY_VARIABLE_NAME);
            if (variableName != null && (variableName.getValue() == null || variableName.getValue().isBlank())) {
                String moduleName = moduleName(listenerModel.getModuleName());
                String suggestedName = Utils.generateVariableIdentifier(semanticModel, document,
                        document.syntaxTree().rootNode().lineRange().endLine(),
                        Constants.LISTENER_VAR_NAME.formatted(moduleName));
                variableName.setValue(suggestedName);
            }
        }

        listenerModel.setProperties(ordered);
    }

    /**
     * Checks whether the given FTP listener constructor uses legacy path/folderPath arguments.
     *
     * @param arguments constructor argument list
     * @return true if legacy path argument is present
     */
    public static boolean hasLegacyFtpPathArgument(SeparatedNodeList<FunctionArgumentNode> arguments) {
        for (FunctionArgumentNode argument : arguments) {
            if (argument.kind() == SyntaxKind.NAMED_ARG) {
                NamedArgumentNode namedArg = (NamedArgumentNode) argument;
                String argName = namedArg.argumentName().name().text().trim();
                if ("path".equals(argName) || "folderPath".equals(argName)) {
                    return true;
                }
            } else if (argument.kind() == SyntaxKind.POSITIONAL_ARG) {
                PositionalArgumentNode positionalArg = (PositionalArgumentNode) argument;
                if (positionalArg.expression() instanceof MappingConstructorExpressionNode mappingExpr
                        && hasLegacyPathField(mappingExpr)) {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * Extracts listener configuration properties from source code for the given listener names.
     * For each listener, finds its declaration in the project and extracts key configuration
     * values (protocol, host, port, authentication).
     *
     * @param listenerNames  Set of listener variable names to extract configs for
     * @param semanticModel  Semantic model for symbol resolution
     * @param project        Project for source traversal
     * @return Map of listener name to its configuration properties.
     */
    public static Map<String, Map<String, Value>> extractListenerConfigs(Set<String> listenerNames,
                                                                          SemanticModel semanticModel,
                                                                          Project project) {
        Map<String, Map<String, Value>> configs = new LinkedHashMap<>();

        for (String listenerName : listenerNames) {
            Map<String, Value> config = extractSingleListenerConfig(listenerName, semanticModel, project);
            if (config != null && !config.isEmpty()) {
                configs.put(listenerName, config);
            }
        }
        return configs;
    }

    // ── Private helpers ─────────────────────────────────────────────────

    private static void addIfPresent(Map<String, Value> target, Map<String, Value> source, String key) {
        if (source.containsKey(key)) {
            target.put(key, source.get(key));
        }
    }

    private static boolean isFtpListenerCompatibleWithFlow(String listenerName,
                                                           boolean removeDeprecated,
                                                           SemanticModel semanticModel, Project project) {
        Module defaultModule = project.currentPackage().getDefaultModule();
        List<ServiceDeclarationNode> attachedServices = new ArrayList<>();

        for (DocumentId documentId : defaultModule.documentIds()) {
            Document document = defaultModule.document(documentId);
            ModulePartNode modulePartNode = document.syntaxTree().rootNode();

            for (ModuleMemberDeclarationNode member : modulePartNode.members()) {
                if (member.kind() != SyntaxKind.SERVICE_DECLARATION) {
                    continue;
                }
                ServiceDeclarationNode serviceNode = (ServiceDeclarationNode) member;
                if (isServiceAttachedToListener(serviceNode, listenerName)) {
                    attachedServices.add(serviceNode);
                }
            }
        }

        if (attachedServices.isEmpty()) {
            return true;
        }

        boolean allNewStyle = true;
        boolean allLegacyStyle = true;
        for (ServiceDeclarationNode serviceNode : attachedServices) {
            boolean hasServiceConfig = serviceNode.metadata().isPresent() &&
                    FTPFunctionModelUtil.findFtpAnnotation(
                            serviceNode.metadata().get().annotations(),
                            "ServiceConfig", semanticModel).isPresent();
            allNewStyle &= hasServiceConfig;
            allLegacyStyle &= !hasServiceConfig;
        }

        return removeDeprecated ? allNewStyle : allLegacyStyle;
    }

    public static boolean isServiceAttachedToListener(ServiceDeclarationNode serviceNode, String listenerName) {
        for (ExpressionNode expr : serviceNode.expressions()) {
            if (expr instanceof SimpleNameReferenceNode simpleRef && simpleRef.name().text().equals(listenerName)) {
                return true;
            }
        }
        return false;
    }

    private static boolean hasLegacyPathField(MappingConstructorExpressionNode mappingExpr) {
        for (MappingFieldNode field : mappingExpr.fields()) {
            if (field.kind() != SyntaxKind.SPECIFIC_FIELD) {
                continue;
            }
            SpecificFieldNode specificField = (SpecificFieldNode) field;
            String fieldName = specificField.fieldName().toSourceCode().trim();
            if ("path".equals(fieldName) || "folderPath".equals(fieldName)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Extracts configuration for a single listener by finding its declaration node and parsing its
     * constructor arguments.
     */
    private static Map<String, Value> extractSingleListenerConfig(String listenerName,
                                                                    SemanticModel semanticModel,
                                                                    Project project) {
        // Find the listener's VariableSymbol
        Optional<VariableSymbol> listenerSymbol = Optional.empty();
        for (Symbol moduleSymbol : semanticModel.moduleSymbols()) {
            if (!(moduleSymbol instanceof VariableSymbol variableSymbol)
                    || !variableSymbol.qualifiers().contains(Qualifier.LISTENER)) {
                continue;
            }
            if (variableSymbol.getName().isPresent() && variableSymbol.getName().get().equals(listenerName)) {
                listenerSymbol = Optional.of(variableSymbol);
                break;
            }
        }
        if (listenerSymbol.isEmpty() || listenerSymbol.get().getLocation().isEmpty()) {
            return null;
        }

        // Find the ListenerDeclarationNode from the symbol's location
        Location location = listenerSymbol.get().getLocation().get();
        try {
            Path path = project.sourceRoot().resolve(location.lineRange().fileName());
            DocumentId documentId = project.documentId(path);
            Document document = project.currentPackage().getDefaultModule().document(documentId);
            if (document == null) {
                return null;
            }

            ModulePartNode modulePartNode = document.syntaxTree().rootNode();
            TextRange range = TextRange.from(location.textRange().startOffset(), location.textRange().length());
            NonTerminalNode foundNode = modulePartNode.findNode(range);
            while (foundNode != null && !(foundNode instanceof ListenerDeclarationNode)) {
                foundNode = foundNode.parent();
            }
            if (foundNode == null) {
                return null;
            }

            ListenerDeclarationNode listenerNode = (ListenerDeclarationNode) foundNode;
            return extractConfigFromListenerDeclaration(listenerNode);
        } catch (RuntimeException e) {
            return null;
        }
    }

    /**
     * Extracts key configuration values from a listener declaration node by parsing its
     * constructor arguments directly.
     *
     * @param listenerNode The listener declaration node
     * @return Map of config property names to their Value objects
     */
    private static Map<String, Value> extractConfigFromListenerDeclaration(ListenerDeclarationNode listenerNode) {
        Map<String, Value> config = new LinkedHashMap<>();

        Node initializer = listenerNode.initializer();
        NewExpressionNode newExpressionNode;
        if (initializer instanceof CheckExpressionNode checkExpressionNode) {
            newExpressionNode = (NewExpressionNode) checkExpressionNode.expression();
        } else {
            newExpressionNode = (NewExpressionNode) initializer;
        }

        SeparatedNodeList<FunctionArgumentNode> arguments = getArgList(newExpressionNode);
        if (arguments == null) {
            return config;
        }

        // First pass: extract protocol to determine auth model
        String protocol = "FTP";
        for (FunctionArgumentNode argument : arguments) {
            if (argument instanceof NamedArgumentNode namedArg) {
                String argName = namedArg.argumentName().name().text().trim();
                if ("protocol".equals(argName)) {
                    String argValue = namedArg.expression().toSourceCode().trim();
                    // Strip module prefix (e.g., "ftp:SFTP" → "SFTP")
                    if (argValue.contains(":")) {
                        protocol = argValue.substring(argValue.indexOf(':') + 1).trim();
                    } else {
                        protocol = argValue;
                    }
                    break;
                }
            }
        }

        // Second pass: extract all named arguments
        for (FunctionArgumentNode argument : arguments) {
            if (argument instanceof NamedArgumentNode namedArg) {
                String argName = namedArg.argumentName().name().text().trim();
                ExpressionNode argExpr = namedArg.expression();

                switch (argName) {
                    case "protocol" -> config.put("protocol",
                            buildProtocolSelectValue(argExpr.toSourceCode().trim()));
                    case "host" -> config.put("host", buildReadOnlyTextValue("Host",
                            "Server hostname", argExpr));
                    case "port", "portNumber" -> config.put("portNumber", buildReadOnlyNumericValue(
                            "Port", "Server port", argExpr, "int"));
                    case "auth" -> config.put("authentication",
                            buildAuthChoiceValue(argExpr, protocol));
                    case "secureSocket" -> config.put("secureSocket",
                            buildReadOnlySecureSocketValue(argExpr));
                    default -> {
                        // Skip other arguments
                    }
                }
            }
        }

        // Default to "No Authentication" when no auth argument is present
        if (!config.containsKey("authentication")) {
            config.put("authentication", buildAuthChoiceValue(null, protocol));
        }

        return config;
    }

    private static SeparatedNodeList<FunctionArgumentNode> getArgList(NewExpressionNode newExpressionNode) {
        if (newExpressionNode instanceof ExplicitNewExpressionNode explicitNewExpressionNode) {
            return explicitNewExpressionNode.parenthesizedArgList().arguments();
        } else {
            Optional<ParenthesizedArgList> parenthesizedArgList = ((ImplicitNewExpressionNode) newExpressionNode)
                    .parenthesizedArgList();
            return parenthesizedArgList.isPresent() ? parenthesizedArgList.get().arguments() :
                    NodeFactory.createSeparatedNodeList();
        }
    }

    /**
     * Builds a read-only CHOICE (radio button) Value for displaying the authentication
     * configuration of an existing listener, mirroring the structure in trigger-models/ftp.json.
     *
     * <p>Parses the auth mapping constructor to determine which auth type is used
     * (No Auth / Basic / Certificate) and populates the selected choice's properties
     * with actual values from the source code. No Authentication and Basic Authentication
     * choices are always emitted; Certificate Based Authentication is additionally emitted
     * only for SFTP.
     *
     * @param authExpression The auth argument expression node, or null if no auth argument
     * @param protocol       The protocol string (FTP, SFTP, or FTPS)
     */
    static Value buildAuthChoiceValue(Node authExpression, String protocol) {
        boolean isSftp = "SFTP".equalsIgnoreCase(protocol);

        // Parse auth fields from the mapping constructor
        ExpressionNode usernameExpr = null;
        ExpressionNode passwordExpr = null;
        ExpressionNode privateKeyExpr = null;
        boolean hasCredentials = false;
        boolean hasPrivateKey = false;

        if (authExpression instanceof MappingConstructorExpressionNode mapping) {
            for (MappingFieldNode fieldNode : mapping.fields()) {
                if (fieldNode instanceof SpecificFieldNode field) {
                    String fieldName = field.fieldName().toSourceCode().trim();

                    switch (fieldName) {
                        case "credentials" -> {
                            hasCredentials = true;
                            // Parse nested credentials record
                            if (field.valueExpr().isPresent()
                                    && field.valueExpr().get()
                                    instanceof MappingConstructorExpressionNode credMapping) {
                                for (MappingFieldNode credField : credMapping.fields()) {
                                    if (credField instanceof SpecificFieldNode credSpecific) {
                                        String credFieldName =
                                                credSpecific.fieldName().toSourceCode().trim();
                                        if ("username".equals(credFieldName)) {
                                            usernameExpr = credSpecific.valueExpr().orElse(null);
                                        } else if ("password".equals(credFieldName)) {
                                            passwordExpr = credSpecific.valueExpr().orElse(null);
                                        }
                                    }
                                }
                            }
                        }
                        case "privateKey" -> {
                            hasPrivateKey = true;
                            privateKeyExpr = field.valueExpr().orElse(null);
                        }
                        default -> {
                            // Skip other fields
                        }
                    }
                }
            }
        }

        // Determine which auth type is active
        boolean isCertAuth = hasPrivateKey;
        boolean isBasicAuth = hasCredentials && !hasPrivateKey;
        boolean isNoAuth = !isBasicAuth && !isCertAuth;

        // Build choices mirroring trigger-models/ftp.json's auth CHOICE structure
        List<Value> choices = new ArrayList<>();

        // No Authentication
        choices.add(new Value.ValueBuilder()
                .metadata("No Authentication", "")
                .value("true")
                .types(List.of(PropertyType.types(Value.FieldType.FORM)))
                .enabled(isNoAuth)
                .editable(false)
                .setAdvanced(false)
                .build());

        // Basic Authentication (supported for FTP, FTPS, and SFTP)
        Map<String, Value> basicProps = new LinkedHashMap<>();
        if (usernameExpr != null) {
            basicProps.put("userName", buildReadOnlyTextValue("Username",
                    "Remote server username for authentication", usernameExpr));
        }
        if (passwordExpr != null) {
            basicProps.put("password", buildReadOnlyTextValue("Password",
                    "Remote server password for authentication", passwordExpr));
        }
        Value basicChoice = new Value.ValueBuilder()
                .metadata("Basic Authentication", "")
                .value("true")
                .types(List.of(PropertyType.types(Value.FieldType.FORM)))
                .enabled(isBasicAuth)
                .editable(false)
                .setAdvanced(false)
                .setProperties(basicProps)
                .build();
        choices.add(basicChoice);

        if (isSftp) {
            // SFTP also supports Certificate Based Authentication
            Map<String, Value> certProps = new LinkedHashMap<>();
            if (hasPrivateKey && privateKeyExpr != null) {
                certProps.put("privateKey", buildReadOnlyRecordValue("Private Key",
                        "Private key configuration for SSH-based authentication",
                        privateKeyExpr, "ftp:PrivateKey", "PrivateKey", false));
            }
            if (usernameExpr != null) {
                certProps.put("userName", buildReadOnlyTextValue("Username",
                        "Remote server username for key-based authentication", usernameExpr));
            }
            Value certChoice = new Value.ValueBuilder()
                    .metadata("Certificate Based Authentication", "")
                    .value("true")
                    .types(List.of(PropertyType.types(Value.FieldType.FORM)))
                    .enabled(isCertAuth)
                    .editable(false)
                    .setAdvanced(false)
                    .setProperties(certProps)
                    .build();
            choices.add(certChoice);
        }

        Value auth = new Value.ValueBuilder()
                .metadata("Authentication", "Select the authentication method")
                .value("")
                .types(List.of(PropertyType.types(Value.FieldType.CHOICE)))
                .enabled(true)
                .editable(false)
                .setAdvanced(false)
                .build();
        auth.setChoices(choices);
        return auth;
    }

    /**
     * Builds a read-only text Value for displaying listener config information.
     * Uses the AST node kind to determine whether the value is a string literal
     * or an expression. For string templates with a single interpolation
     * (e.g. {@code string `${test}`}), extracts the inner expression via the AST.
     */
    static Value buildReadOnlyTextValue(String label, String description, ExpressionNode expression) {
        String displayValue;
        boolean isExpression;

        if (expression instanceof BasicLiteralNode) {
            displayValue = expression.toSourceCode().trim();
            isExpression = false;
        } else if (expression instanceof TemplateExpressionNode template
                && template.kind() == SyntaxKind.STRING_TEMPLATE_EXPRESSION) {
            // Check if template has exactly one member and it is an interpolation
            if (template.content().size() == 1
                    && template.content().get(0) instanceof InterpolationNode interpolation) {
                // Single interpolation only: string `${expr}` → show expr as expression
                displayValue = interpolation.expression().toSourceCode().trim();
            } else {
                // Plain text or mixed content: show full template as expression
                displayValue = expression.toSourceCode().trim();
            }
            isExpression = true;
        } else {
            displayValue = expression.toSourceCode().trim();
            isExpression = true;
        }

        return new Value.ValueBuilder()
                .metadata(label, description)
                .value(displayValue)
                .types(List.of(
                        new PropertyType.Builder()
                                .fieldType(Value.FieldType.TEXT)
                                .ballerinaType("string")
                                .selected(!isExpression)
                                .build(),
                        new PropertyType.Builder()
                                .fieldType(Value.FieldType.EXPRESSION)
                                .ballerinaType("string")
                                .selected(isExpression)
                                .build()))
                .enabled(true)
                .editable(false)
                .setAdvanced(false)
                .build();
    }

    /**
     * Builds a read-only numeric Value for displaying listener config information.
     * Uses the AST node kind to determine whether the value is a numeric literal
     * or an expression.
     */
    static Value buildReadOnlyNumericValue(String label, String description,
                                           ExpressionNode expression, String ballerinaType) {
        String value = expression.toSourceCode().trim();
        boolean isExpression = !(expression instanceof BasicLiteralNode);
        return new Value.ValueBuilder()
                .metadata(label, description)
                .value(value)
                .types(List.of(
                        new PropertyType.Builder()
                                .fieldType(Value.FieldType.NUMBER)
                                .ballerinaType(ballerinaType)
                                .selected(!isExpression)
                                .build(),
                        new PropertyType.Builder()
                                .fieldType(Value.FieldType.EXPRESSION)
                                .ballerinaType(ballerinaType)
                                .selected(isExpression)
                                .build()))
                .enabled(true)
                .editable(false)
                .setAdvanced(false)
                .build();
    }

    /**
     * Builds a read-only secure socket Value for displaying the secureSocket configuration
     * of an existing FTPS listener, mirroring the structure in trigger-models/ftp.json.
     */
    static Value buildReadOnlySecureSocketValue(ExpressionNode expression) {
        return buildReadOnlyRecordValue("Secure Socket (SecureSocket)",
                "Configure SSL/TLS configuration for secure connection.",
                expression, "ftp:SecureSocket", "SecureSocket", true);
    }

    /**
     * Builds a read-only record Value for displaying record-type listener config information.
     * Uses the AST node kind to determine whether the value is a mapping constructor
     * (record literal) or an expression.
     */
    static Value buildReadOnlyRecordValue(String label, String description,
                                          ExpressionNode expression, String ballerinaType,
                                          String typeName, boolean advanced) {
        String value = expression.toSourceCode().trim();
        boolean isExpression = !(expression instanceof MappingConstructorExpressionNode);

        List<PropertyTypeMemberInfo> typeMembers = List.of(
                new PropertyTypeMemberInfo(typeName, "ballerina:ftp", FTP, "RECORD_TYPE", true)
        );

        PropertyType recordType = new PropertyType.Builder()
                .fieldType(Value.FieldType.RECORD_MAP_EXPRESSION)
                .ballerinaType(ballerinaType)
                .setMembers(typeMembers)
                .selected(!isExpression)
                .build();

        PropertyType expressionType = new PropertyType.Builder()
                .fieldType(Value.FieldType.EXPRESSION)
                .ballerinaType(ballerinaType)
                .selected(isExpression)
                .build();

        return new Value.ValueBuilder()
                .metadata(label, description)
                .value(value)
                .types(List.of(recordType, expressionType))
                .setCodedata(new Codedata(null, ARG_TYPE_LISTENER_PARAM_INCLUDED_FIELD))
                .enabled(true)
                .editable(false)
                .setAdvanced(advanced)
                .build();
    }

    /**
     * Builds a read-only CHOICE (radio button) Value for displaying the protocol of an existing listener.
     */
    static Value buildProtocolSelectValue(String value) {
        // Strip module prefix (e.g. "ftp:SFTP" → "SFTP") for matching against choice values
        String normalizedValue = value.contains(":") ? value.substring(value.lastIndexOf(':') + 1) : value;
        List<Value> choices = List.of(
                buildProtocolChoice("FTP", "FTP", normalizedValue),
                buildProtocolChoice("SFTP", "SFTP", normalizedValue),
                buildProtocolChoice("FTPS", "FTPS", normalizedValue)
        );

        Value protocol = new Value.ValueBuilder()
                .metadata("Protocol", "Connection protocol")
                .value(normalizedValue)
                .types(List.of(PropertyType.types(Value.FieldType.CHOICE)))
                .enabled(true)
                .editable(false)
                .setAdvanced(false)
                .build();
        protocol.setChoices(choices);
        return protocol;
    }

    /**
     * Builds a single protocol choice for the radio button group.
     */
    private static Value buildProtocolChoice(String label, String choiceValue, String selectedValue) {
        return new Value.ValueBuilder()
                .metadata(label, "")
                .value(choiceValue)
                .types(List.of(PropertyType.types(Value.FieldType.FORM)))
                .enabled(choiceValue.equals(selectedValue))
                .editable(false)
                .setAdvanced(false)
                .build();
    }

    private static String moduleName(String moduleName) {
        String[] parts = moduleName.split("\\.");
        if (parts.length > 1) {
            return parts[parts.length - 1];
        }
        return moduleName;
    }

    /**
     * Adds import text edits required by the FTP listener's coordination config.
     * When the listener declaration contains {@code <task:MysqlConfig>} or {@code <task:PostgresqlConfig>},
     * the corresponding driver import ({@code ballerinax/mysql.driver as _} or
     * {@code ballerinax/postgresql.driver as _}) and the {@code ballerina/task} import are added.
     *
     * @param listenerDeclaration the generated listener declaration source code
     * @param modulePartNode      the module part node for checking existing imports
     * @param edits               the list of text edits to append to
     */
    public static void addCoordinationConfigImports(String listenerDeclaration, ModulePartNode modulePartNode,
                                                    List<TextEdit> edits) {
        if (listenerDeclaration.contains("<task:MysqlConfig>")) {
            addImportIfMissing(modulePartNode, edits, "ballerina", "task", false);
            addImportIfMissing(modulePartNode, edits, "ballerinax", "mysql.driver", true);
        } else if (listenerDeclaration.contains("<task:PostgresqlConfig>")) {
            addImportIfMissing(modulePartNode, edits, "ballerina", "task", false);
            addImportIfMissing(modulePartNode, edits, "ballerinax", "postgresql.driver", true);
        }
    }

    private static void addImportIfMissing(ModulePartNode modulePartNode, List<TextEdit> edits,
                                           String org, String module, boolean unnamed) {
        if (!Utils.importExists(modulePartNode, org, module)) {
            String importModule = unnamed ? module + " as _" : module;
            edits.add(new TextEdit(Utils.toRange(modulePartNode.lineRange().startLine()),
                    Utils.getImportStmt(org, importModule)));
        }
    }
}
