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

package io.ballerina.servicemodelgenerator.extension.util;

import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.api.symbols.ClassSymbol;
import io.ballerina.compiler.api.symbols.MethodSymbol;
import io.ballerina.compiler.api.symbols.ModuleSymbol;
import io.ballerina.compiler.api.symbols.Qualifier;
import io.ballerina.compiler.api.symbols.Symbol;
import io.ballerina.compiler.api.symbols.TypeSymbol;
import io.ballerina.compiler.api.symbols.VariableSymbol;
import io.ballerina.compiler.syntax.tree.CheckExpressionNode;
import io.ballerina.compiler.syntax.tree.ExplicitNewExpressionNode;
import io.ballerina.compiler.syntax.tree.FunctionArgumentNode;
import io.ballerina.compiler.syntax.tree.ImplicitNewExpressionNode;
import io.ballerina.compiler.syntax.tree.ImportDeclarationNode;
import io.ballerina.compiler.syntax.tree.ListenerDeclarationNode;
import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.compiler.syntax.tree.NewExpressionNode;
import io.ballerina.compiler.syntax.tree.Node;
import io.ballerina.compiler.syntax.tree.NodeFactory;
import io.ballerina.compiler.syntax.tree.NonTerminalNode;
import io.ballerina.compiler.syntax.tree.ParenthesizedArgList;
import io.ballerina.compiler.syntax.tree.SeparatedNodeList;
import io.ballerina.modelgenerator.commons.CommonUtils;
import io.ballerina.modelgenerator.commons.FunctionData;
import io.ballerina.modelgenerator.commons.FunctionDataBuilder;
import io.ballerina.modelgenerator.commons.ModuleInfo;
import io.ballerina.modelgenerator.commons.ParameterData;
import io.ballerina.modelgenerator.commons.ServiceDatabaseManager;
import io.ballerina.modelgenerator.commons.trigger.models.TriggerUISchemaModel;
import io.ballerina.projects.Document;
import io.ballerina.projects.DocumentId;
import io.ballerina.projects.Project;
import io.ballerina.servicemodelgenerator.extension.connector.TriggerModelReader;
import io.ballerina.servicemodelgenerator.extension.model.Codedata;
import io.ballerina.servicemodelgenerator.extension.model.Listener;
import io.ballerina.servicemodelgenerator.extension.model.MetaData;
import io.ballerina.servicemodelgenerator.extension.model.Option;
import io.ballerina.servicemodelgenerator.extension.model.PropertyType;
import io.ballerina.servicemodelgenerator.extension.model.ServiceInitModel;
import io.ballerina.servicemodelgenerator.extension.model.Value;
import io.ballerina.servicemodelgenerator.extension.model.context.AddModelContext;
import io.ballerina.servicemodelgenerator.extension.model.response.ListenerFromSourceResponse;
import io.ballerina.tools.diagnostics.Location;
import io.ballerina.tools.text.LinePosition;
import io.ballerina.tools.text.LineRange;
import io.ballerina.tools.text.TextRange;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;

import static io.ballerina.modelgenerator.commons.CommonUtils.removeLeadingSingleQuote;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.ASB;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.ASB_DEFAULT_LISTENER_EXPR;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.DEFAULT_LISTENER_ITEM_LABEL;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.DEFAULT_LISTENER_VAR_NAME;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.DEFAULT_LISTENER_TYPE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.FILE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.FILE_DEFAULT_LISTENER_EXPR;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.FTP;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.FTP_DEFAULT_LISTENER_EXPR;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.GITHUB_DEFAULT_LISTENER_EXPR;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.GRAPHQL;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.GRAPHQL_DEFAULT_LISTENER_EXPR;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.HTTP;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.HTTP_DEFAULT_LISTENER_EXPR;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.HTTP_DEFAULT_LISTENER_ITEM_LABEL;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.KAFKA;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.KAFKA_DEFAULT_LISTENER_EXPR;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.MQTT;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.MQTT_DEFAULT_LISTENER_EXPR;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.NEW_LINE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.PROP_KEY_DEFAULT_LISTENER;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.PROP_KEY_LISTENER_TYPE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.PROP_KEY_VARIABLE_NAME;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.RABBITMQ;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.RABBITMQ_DEFAULT_LISTENER_EXPR;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.SF;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.SF_DEFAULT_LISTENER_EXPR;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.TCP;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.TCP_DEFAULT_LISTENER_EXPR;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.TRIGGER_GITHUB;
import static io.ballerina.servicemodelgenerator.extension.util.Utils.upperCaseFirstLetter;

/**
 * Util class for Listener related operations.
 *
 * @since 1.0.0
 */
public class ListenerUtil {

    public static Set<String> getCompatibleListeners(String moduleName, SemanticModel semanticModel, Project project) {
        Set<String> listeners = new LinkedHashSet<>();
        boolean isHttpDefaultListenerDefined = false;
        boolean isHttp = HTTP.equals(moduleName);
        boolean isKafka = KAFKA.equals(moduleName);

        for (Symbol moduleSymbol : semanticModel.moduleSymbols()) {
            if (!(moduleSymbol instanceof VariableSymbol variableSymbol)
                    || !variableSymbol.qualifiers().contains(Qualifier.LISTENER)) {
                continue;
            }
            Optional<ModuleSymbol> module = variableSymbol.typeDescriptor().getModule();
            if (module.isEmpty() || !module.get().id().moduleName().equals(moduleName) ||
                    variableSymbol.getName().isEmpty()) {
                continue;
            }
            if (isKafka && semanticModel.references(variableSymbol).size() > 1) {
                continue;
            }
            String listenerName = variableSymbol.getName().get();
            if (isHttp) {
                if (variableSymbol.getLocation().isPresent()) {
                    Location location = variableSymbol.getLocation().get();
                    Path path = project.sourceRoot().resolve(location.lineRange().fileName());
                    DocumentId documentId = project.documentId(path);
                    Document document = project.currentPackage().getDefaultModule().document(documentId);
                    if (!isHttpDefaultListenerDefined && document != null) {
                        ModulePartNode node = document.syntaxTree().rootNode();
                        TextRange range = TextRange.from(location.textRange().startOffset(),
                                location.textRange().length());
                        NonTerminalNode foundNode = node.findNode(range);
                        if (foundNode != null) {
                            while (foundNode != null && !(foundNode instanceof ListenerDeclarationNode)) {
                                foundNode = foundNode.parent();
                            }
                            if (foundNode != null) {
                                ListenerDeclarationNode listenerDeclarationNode = (ListenerDeclarationNode) foundNode;
                                isHttpDefaultListenerDefined = listenerDeclarationNode.initializer().toSourceCode()
                                        .trim().contains("http:getDefaultListener()");
                            }
                        }
                    }
                }
            }
            listeners.add(listenerName);
        }

        if (isHttp && !isHttpDefaultListenerDefined) {
            listeners.add(HTTP_DEFAULT_LISTENER_ITEM_LABEL);
        }

        if (moduleName.equals("graphql")) {
            listeners.add(DEFAULT_LISTENER_ITEM_LABEL.formatted(moduleName(moduleName)));
        }

        return listeners;
    }

    public static Optional<String> getHttpDefaultListenerNameRef(SemanticModel semanticModel, Project project) {
        for (Symbol moduleSymbol : semanticModel.moduleSymbols()) {
            if (!(moduleSymbol instanceof VariableSymbol variableSymbol)
                    || !variableSymbol.qualifiers().contains(Qualifier.LISTENER)) {
                continue;
            }
            Optional<ModuleSymbol> module = variableSymbol.typeDescriptor().getModule();
            if (module.isEmpty() || !module.get().id().moduleName().equals(HTTP) ||
                    variableSymbol.getName().isEmpty()) {
                continue;
            }
            String listenerName = variableSymbol.getName().get().trim();
            if (variableSymbol.getLocation().isPresent()) {
                Location location = variableSymbol.getLocation().get();
                Path path = project.sourceRoot().resolve(location.lineRange().fileName());
                DocumentId documentId = project.documentId(path);
                Document document = project.currentPackage().getDefaultModule().document(documentId);
                if (document != null) {
                    ModulePartNode node = document.syntaxTree().rootNode();
                    TextRange range = TextRange.from(location.textRange().startOffset(),
                            location.textRange().length());
                    NonTerminalNode foundNode = node.findNode(range);
                    if (foundNode != null) {
                        while (foundNode != null && !(foundNode instanceof ListenerDeclarationNode)) {
                            foundNode = foundNode.parent();
                        }
                        if (foundNode != null) {
                            ListenerDeclarationNode listenerDeclarationNode = (ListenerDeclarationNode) foundNode;
                            boolean found = listenerDeclarationNode.initializer().toSourceCode()
                                    .trim().contains("http:getDefaultListener()");
                            if (found) {
                                return Optional.of(listenerName);
                            }
                        }
                    }
                }
            }
        }

        return Optional.empty();
    }

    public static DefaultListener getDefaultListener(AddModelContext context) {
        Document document = context.document();
        ModulePartNode node = document.syntaxTree().rootNode();
        return getDefaultListener(context.service().getListener(), context.semanticModel(),
                document, node, context.service().getModuleName());
    }

    public static DefaultListener getDefaultListener(Value listener, SemanticModel semanticModel,
                                                     Document document, ModulePartNode node, String moduleName) {
        if (Objects.nonNull(listener) && listener.isEnabledWithValue()) {
            List<String> values = listener.getValues();
            if (Objects.nonNull(values) && !values.isEmpty()) {
                List<Object> valuesList = new ArrayList<>() {{
                    addAll(values);
                }};
                for (int i = 0; i < values.size(); i++) {
                    String selection = values.get(i);
                    if (selection.equals(HTTP_DEFAULT_LISTENER_ITEM_LABEL) ||
                            selection.equals(DEFAULT_LISTENER_ITEM_LABEL.formatted(moduleName(moduleName)))) {
                        DefaultListener defaultListener = defaultListener(semanticModel, document, node,
                                moduleName);
                        valuesList.set(i, defaultListener.variableName());
                        listener.setValues(valuesList);
                        return defaultListener;
                    }
                }
            } else {
                String selection = listener.getValue();
                if (selection.equals(HTTP_DEFAULT_LISTENER_ITEM_LABEL) ||
                        selection.equals(DEFAULT_LISTENER_ITEM_LABEL.formatted(moduleName(moduleName)))) {
                    DefaultListener defaultListener = defaultListener(semanticModel, document, node, moduleName);
                    listener.setValue(defaultListener.variableName());
                    return defaultListener;
                }
            }
        }
        return null;
    }

    public static DefaultListener defaultListener(SemanticModel semanticModel, Document document,
                                                  ModulePartNode node, String moduleName) {
        List<ImportDeclarationNode> importsList = node.imports().stream().toList();
        LinePosition linePosition = importsList.isEmpty() ? node.lineRange().endLine() :
                importsList.getLast().lineRange().endLine();
        String variableName = Utils.generateVariableIdentifier(semanticModel, document, linePosition,
                DEFAULT_LISTENER_VAR_NAME.formatted(moduleName(moduleName)));
        return new DefaultListener(moduleName, variableName, linePosition);
    }

    public static String getDefaultListenerDeclarationStmt(DefaultListener defaultListener) {
        String stmt = NEW_LINE + "listener %s:Listener %s = %s;" + NEW_LINE;
        String expression = switch (defaultListener.moduleName()) {
            case HTTP -> HTTP_DEFAULT_LISTENER_EXPR;
            case GRAPHQL -> GRAPHQL_DEFAULT_LISTENER_EXPR;
            case TCP -> TCP_DEFAULT_LISTENER_EXPR;
            case KAFKA -> KAFKA_DEFAULT_LISTENER_EXPR;
            case RABBITMQ -> RABBITMQ_DEFAULT_LISTENER_EXPR;
            case MQTT -> MQTT_DEFAULT_LISTENER_EXPR;
            case ASB -> ASB_DEFAULT_LISTENER_EXPR;
            case SF -> SF_DEFAULT_LISTENER_EXPR;
            case TRIGGER_GITHUB -> GITHUB_DEFAULT_LISTENER_EXPR;
            case FTP -> FTP_DEFAULT_LISTENER_EXPR;
            case FILE -> FILE_DEFAULT_LISTENER_EXPR;
            default -> "";
        };
        return stmt.formatted(moduleName(defaultListener.moduleName()), defaultListener.variableName(), expression);
    }

    private static String moduleName(String moduleName) {
        String[] parts = moduleName.split("\\.");
        if (parts.length > 1) {
            return parts[parts.length - 1];
        }
        return moduleName;
    }

    /**
     * Creates a base listener model from function metadata without parameter-specific properties. This method
     * constructs a listener model with core metadata (name, type, description, etc.)
     *
     * @param functionData the function metadata containing listener configuration details
     * @return a {@link Listener} instance with basic metadata and variable name property only
     */
    public static Listener createBaseListenerModel(FunctionData functionData) {
        Map<String, Value> properties = new LinkedHashMap<>();
        String formattedModuleName = bundledShortDisplayName(functionData.packageName())
                .orElseGet(() -> upperCaseFirstLetter(functionData.packageName()));
        String icon = CommonUtils.generateIcon(functionData.org(), functionData.packageName(),
                functionData.version());

        Listener.ListenerBuilder listenerBuilder = new Listener.ListenerBuilder();
        listenerBuilder
                .setId(functionData.packageId())
                .setName(formattedModuleName + " Listener")
                .setType(functionData.packageName())
                .setDisplayName(formattedModuleName)
                .setDescription(functionData.description())
                .setListenerProtocol(getListenerProtocol(functionData.packageName()))
                .setModuleName(functionData.packageName())
                .setOrgName(functionData.org())
                .setPackageName(functionData.packageName())
                .setVersion(functionData.version())
                .setIcon(icon)
                .setProperties(properties);

        properties.put(PROP_KEY_VARIABLE_NAME, nameProperty());
        properties.put(PROP_KEY_LISTENER_TYPE, listenerTypeProperty());
        return listenerBuilder.build();
    }

    /**
     * The compact display name the connector's bundled trigger model ships (e.g. {@code Azure Files} for
     * {@code azure.storage.files}), for connectors whose package name would otherwise render awkwardly.
     *
     * @param packageName the connector's package name
     * @return the model's {@code shortDisplayName}, or empty when no bundled model declares one
     */
    private static Optional<String> bundledShortDisplayName(String packageName) {
        return TriggerModelReader.getInstance().getBundledTriggerModel(packageName)
                .map(TriggerUISchemaModel::shortDisplayName)
                .filter(name -> !name.isBlank());
    }

    private static String getListenerProtocol(String packageName) {
        String pkgName = packageName.toLowerCase(Locale.ROOT);
        String[] split = pkgName.split("\\.");
        return split[split.length - 1];
    }

    /**
     * Like {@link #getListenerModelByName(Codedata, SemanticModel, ModuleInfo, boolean)}, but
     * {@code semanticModel} here is the connector's own package semantic model, not the current file's.
     */
    public static Optional<Listener> getListenerModelFromConnectorPackage(Codedata codedata,
                                                                          SemanticModel semanticModel,
                                                                          ModuleInfo moduleInfo) {
        return getListenerModelByName(codedata, semanticModel, moduleInfo, true, semanticModel);
    }

    public static Optional<Listener> getListenerModelByName(Codedata codedata, SemanticModel semanticModel,
                                                            ModuleInfo moduleInfo,
                                                            boolean removeDeprecated) {
        return getListenerModelByName(codedata, semanticModel, moduleInfo, removeDeprecated, null);
    }

    private static Optional<Listener> getListenerModelByName(Codedata codedata, SemanticModel semanticModel,
                                                            ModuleInfo moduleInfo,
                                                            boolean removeDeprecated,
                                                            SemanticModel parentSymbolSemanticModel) {
        String listenerType = codedata.getType() == null ? "Listener" : codedata.getType();
        FunctionDataBuilder functionDataBuilder = new FunctionDataBuilder()
                .parentSymbolType(listenerType)
                .name("init")
                .moduleInfo(new ModuleInfo(codedata.getOrgName(), codedata.getPackageName(), codedata.getModuleName(),
                        codedata.getVersion()))
                .lsClientLogger(null) // Set the LS Client Logger
                .functionResultKind(FunctionData.Kind.LISTENER_INIT);
        if (parentSymbolSemanticModel != null) {
            functionDataBuilder.semanticModel(parentSymbolSemanticModel);
        }
        functionDataBuilder.userModuleInfo(moduleInfo);

        FunctionData functionData = functionDataBuilder.build();
        Listener listener = createBaseListenerModel(functionData);
        listener.getListenerTypeProperty().setValue(listenerType);
        setParameterProperties(functionData, listener.getProperties(), semanticModel, moduleInfo, removeDeprecated);
        return Optional.of(listener);
    }

    private static void setParameterProperties(FunctionData function, Map<String, Value> properties,
                                               SemanticModel semanticModel,
                                               ModuleInfo moduleInfo,
                                               boolean removeDeprecated) {
        for (ParameterData paramResult : function.parameters().values()) {
            if (paramResult.kind().equals(ParameterData.Kind.PARAM_FOR_TYPE_INFER)
                    || paramResult.kind().equals(ParameterData.Kind.INCLUDED_RECORD)) {
                continue;
            }
            if (removeDeprecated && paramResult.deprecated()) {
                continue;
            }

            String unescapedParamName = removeLeadingSingleQuote(paramResult.name());

            Codedata codedata = new Codedata("LISTENER_INIT_PARAM");
            codedata.setOriginalName(paramResult.name());


            Value.ValueBuilder valueBuilder = new Value.ValueBuilder()
                    .setMetadata(new MetaData(paramResult.label(), paramResult.description()))
                    .setCodedata(codedata)
                    .value("")
                    .setPlaceholder(paramResult.placeholder())
                    .editable(true)
                    .enabled(true)
                    .optional(paramResult.optional())
                    .setAdvanced(paramResult.optional());

            ListenerDeclAnalyzer.buildPropertyType(valueBuilder, paramResult, semanticModel, moduleInfo);
            properties.put(unescapedParamName, valueBuilder.build());
        }
    }

    private static Value getHttpDefaultListenerValue() {
        return new Value.ValueBuilder()
                .metadata("HTTP Default Listener", "The default HTTP listener")
                .types(List.of(PropertyType.types(Value.FieldType.EXPRESSION)))
                .value(HTTP_DEFAULT_LISTENER_EXPR)
                .enabled(true)
                .setImports(new HashMap<>())
                .build();
    }

    /**
     * Processes a syntax tree node to extract listener information and create a response. This method handles both
     * listener declarations and explicit new expressions that create listeners.
     *
     * @param node          the syntax tree node to process (should be ListenerDeclarationNode or
     *                      ExplicitNewExpressionNode)
     * @param orgName       the organization name for looking up listener metadata
     * @param semanticModel the semantic model for symbol resolution
     * @return {@link ListenerFromSourceResponse} containing the extracted listener model or empty response if
     * processing fails
     */
    public static ListenerFromSourceResponse processListenerNode(NonTerminalNode node, String orgName,
                                                                 SemanticModel semanticModel,
                                                                 ModuleInfo moduleInfo) {
        Listener listener;
        if (node instanceof ListenerDeclarationNode listenerNode) {
            listener = processListenerDeclaration(listenerNode, orgName, semanticModel, moduleInfo);
            if (Objects.isNull(listener)) {
                return new ListenerFromSourceResponse();
            }
            processListenerName(listener, listenerNode);
        } else if (node instanceof ExplicitNewExpressionNode newExpressionNode) {
            listener = processExplicitNewExpression(newExpressionNode, semanticModel, moduleInfo);
        } else {
            listener = new Listener.ListenerBuilder().build();
        }

        return new ListenerFromSourceResponse(listener);
    }

    /**
     * Processes a listener declaration node to extract listener configuration and properties. This method handles
     * listener variable declarations with their initialization expressions.
     *
     * @param listenerNode  the listener declaration syntax node
     * @param orgName       the organization name for looking up listener metadata
     * @param semanticModel the semantic model for symbol resolution
     * @return {@link Listener} containing the listener model with all properties set as non-advanced
     */
    private static Listener processListenerDeclaration(ListenerDeclarationNode listenerNode, String orgName,
                                                       SemanticModel semanticModel, ModuleInfo moduleInfo) {

        if (isHttpDefaultListener(listenerNode)) {
            return createHttpDefaultListenerModel(orgName, listenerNode).get();
        }

        Optional<Symbol> symbol = semanticModel.symbol(listenerNode.variableName());
        if (symbol.isEmpty() || !(symbol.get() instanceof VariableSymbol variableSymbol)
                || !(CommonUtils.getRawType(variableSymbol.typeDescriptor()) instanceof ClassSymbol classSymbol)) {
            return null;
        }
        TypeSymbol typeSymbol = variableSymbol.typeDescriptor();

        Node initializer = listenerNode.initializer();
        NewExpressionNode newExpressionNode;
        if (initializer instanceof CheckExpressionNode checkExpressionNode) {
            newExpressionNode = (NewExpressionNode) checkExpressionNode.expression();
        } else {
            newExpressionNode = (NewExpressionNode) initializer;
        }

        Listener listener = createListenerModelFromNewExpressionNode(listenerNode.lineRange(), newExpressionNode,
                semanticModel,
                classSymbol, moduleInfo);
        listener.getListenerTypeProperty().setValue(typeSymbol.getName().orElse(DEFAULT_LISTENER_TYPE));
        return listener;
    }

    private static void processListenerName(Listener listener, ListenerDeclarationNode listenerDeclarationNode) {
        Value nameProperty = listener.getVariableNameProperty();
        nameProperty.setValue(listenerDeclarationNode.variableName().text().trim());
        nameProperty.setCodedata(new Codedata(listenerDeclarationNode.variableName().lineRange()));
        nameProperty.setEditable(false);
    }

    /**
     * Creates a default HTTP listener model from a listener declaration node that uses the default HTTP listener. This
     * method builds a listener model specifically for HTTP default listeners (http:getDefaultListener())
     *
     * @param org          the organization name used to look up the HTTP listener metadata from the database
     * @param listenerNode the listener declaration node containing the default HTTP listener initialization
     */
    private static Optional<Listener> createHttpDefaultListenerModel(String org, ListenerDeclarationNode listenerNode) {
        Optional<FunctionData> optionalFunctionData = ServiceDatabaseManager.getInstance().getListener(org, HTTP);
        if (optionalFunctionData.isEmpty()) {
            return Optional.empty();
        }

        FunctionData functionData = optionalFunctionData.get();
        functionData.setParameters(new LinkedHashMap<>());

        Listener listener = createBaseListenerModel(functionData);
        listener.getProperties().put(PROP_KEY_DEFAULT_LISTENER, getHttpDefaultListenerValue());
        listener.getListenerTypeProperty().setValue(DEFAULT_LISTENER_TYPE);
        listener.setCodedata(new Codedata(listenerNode.lineRange()));

        return Optional.of(listener);
    }

    /**
     * Processes an explicit new expression node that creates a listener instance. This method extracts listener
     * configuration from constructor calls and removes the variable name property.
     *
     * @param newExpressionNode the explicit new expression syntax node
     * @param semanticModel     the semantic model for symbol resolution
     * @return {@link Listener}  the listener model without variable name property
     */
    private static Listener processExplicitNewExpression(ExplicitNewExpressionNode newExpressionNode,
                                                         SemanticModel semanticModel,
                                                         ModuleInfo moduleInfo) {
        Optional<Symbol> symbol = semanticModel.symbol(newExpressionNode.typeDescriptor());
        if (symbol.isEmpty() || !(symbol.get() instanceof TypeSymbol typeSymbol)
                || !(CommonUtils.getRawType(typeSymbol) instanceof ClassSymbol classSymbol)) {
            return null;
        }
        Listener listenerModel = createListenerModelFromNewExpressionNode(newExpressionNode.lineRange(),
                newExpressionNode, semanticModel, classSymbol, moduleInfo);
        listenerModel.getProperties().remove(PROP_KEY_VARIABLE_NAME);
        listenerModel.getListenerTypeProperty().setValue(getListenerTypeName(newExpressionNode));
        return listenerModel;
    }

    private static String getListenerTypeName(ExplicitNewExpressionNode explicitNewExpressionNode) {
        String typeName = explicitNewExpressionNode.typeDescriptor().toSourceCode().trim();
        if (typeName.contains(":")) {
            return typeName.substring(typeName.lastIndexOf(":") + 1);
        }
        return typeName;
    }

    /**
     * Creates a listener model from a syntax tree node and class symbol with complete property analysis. This method
     * constructs a comprehensive listener model by analyzing the listener's initialization arguments, setting up all
     * properties, and configuring code metadata for UI representation.
     *
     * @param lineRange         the line range in the source code where the listener is defined
     * @param newExpressionNode the new expression node containing the listener initialization
     * @param semanticModel     the semantic model for symbol resolution and type analysis
     * @param classSymbol       the class symbol representing the listener type
     * @return a fully configured {@link Listener} model with analyzed properties, code metadata, and all properties
     * marked as non-advanced for UI visibility
     */
    private static Listener createListenerModelFromNewExpressionNode(LineRange lineRange,
                                                                     NewExpressionNode newExpressionNode,
                                                                     SemanticModel semanticModel,
                                                                     ClassSymbol classSymbol,
                                                                     ModuleInfo moduleInfo) {
        FunctionData functionData = buildListenerFunctionData(classSymbol, semanticModel);

        Listener listenerModel = createBaseListenerModel(functionData);
        analyzeAndSetListenerProperties(listenerModel, functionData, newExpressionNode,
                classSymbol.initMethod().get(), semanticModel, moduleInfo);

        setPropertiesAsNonAdvanced(listenerModel);
        Codedata codedata = new Codedata.Builder()
                .setLineRange(lineRange)
                .build();
        listenerModel.setCodedata(codedata);

        return listenerModel;
    }

    /**
     * Builds function data from a class symbol's initialization method. This helper method extracts the init method
     * information to create function metadata used for property analysis and listener model construction.
     *
     * @param classSymbol   the class symbol representing the listener type
     * @param semanticModel the semantic model for symbol resolution
     * @return {@link FunctionData} containing the initialization method metadata
     */
    private static FunctionData buildListenerFunctionData(ClassSymbol classSymbol, SemanticModel semanticModel) {
        Optional<MethodSymbol> optMethodSymbol = classSymbol.initMethod();

        FunctionDataBuilder functionDataBuilder = new FunctionDataBuilder()
                .parentSymbol(classSymbol)
                .semanticModel(semanticModel)
                .name("init")
                .functionResultKind(FunctionData.Kind.CLASS_INIT);

        optMethodSymbol.ifPresent(functionDataBuilder::functionSymbol);

        return functionDataBuilder.build();
    }

    /**
     * Analyzes listener initialization arguments and sets corresponding properties. This method extracts argument
     * values from the new expression and maps them to listener properties using the function metadata.
     *
     * @param listener          the listener model to populate with properties
     * @param functionData      the function metadata containing parameter information
     * @param newExpressionNode the new expression containing initialization arguments
     * @param initSymbol        the init method symbol
     */
    private static void analyzeAndSetListenerProperties(Listener listener, FunctionData functionData,
                                                        NewExpressionNode newExpressionNode,
                                                        MethodSymbol initSymbol,
                                                        SemanticModel semanticModel,
                                                        ModuleInfo moduleInfo) {
        SeparatedNodeList<FunctionArgumentNode> arguments = getArgList(newExpressionNode);
        boolean removeDeprecated = true;
        if (FTP.equals(functionData.packageName()) && FTPListenerUtil.hasLegacyFtpPathArgument(arguments)) {
            removeDeprecated = false;
        }
        ListenerDeclAnalyzer analyzer = new ListenerDeclAnalyzer(listener.getProperties(), semanticModel, moduleInfo,
                removeDeprecated);
        analyzer.analyze(arguments, initSymbol, functionData);
    }

    /**
     * Sets all properties of a listener model as non-advanced. to make all properties visible and editable in the UI.
     *
     * @param listenerModel the listener model whose properties should be marked as non-advanced
     */
    private static void setPropertiesAsNonAdvanced(Listener listenerModel) {
        listenerModel.getProperties().forEach((k, v) -> v.setAdvanced(false));
    }

    public static SeparatedNodeList<FunctionArgumentNode> getArgList(NewExpressionNode newExpressionNode) {
        if (newExpressionNode instanceof ExplicitNewExpressionNode explicitNewExpressionNode) {
            return explicitNewExpressionNode.parenthesizedArgList().arguments();
        } else {
            Optional<ParenthesizedArgList> parenthesizedArgList = ((ImplicitNewExpressionNode) newExpressionNode)
                    .parenthesizedArgList();
            return parenthesizedArgList.isPresent() ? parenthesizedArgList.get().arguments() :
                    NodeFactory.createSeparatedNodeList();
        }
    }

    public static boolean isHttpDefaultListener(ListenerDeclarationNode listenerNode) {
        return listenerNode.initializer().toSourceCode().trim().contains(HTTP_DEFAULT_LISTENER_EXPR);
    }

    public static Value nameProperty() {

        Value.ValueBuilder valueBuilder = new Value.ValueBuilder();
        valueBuilder
                .setMetadata(new MetaData("Name", "The name of the listener"))
                .setCodedata(new Codedata("LISTENER_VAR_NAME"))
                .value("")
                .types(List.of(PropertyType.types(Value.FieldType.IDENTIFIER)))
                .editable(true)
                .enabled(true)
                .optional(false)
                .setAdvanced(false);

        return valueBuilder.build();
    }

    public static Value listenerTypeProperty() {
        return new Value.ValueBuilder()
                .setMetadata(new MetaData("Listener Type", "The type of the listener"))
                .value("")
                .types(List.of(PropertyType.types(Value.FieldType.TYPE)))
                .build();
    }

    /**
     * Builds a CHOICE property for listener configuration with options to use an existing listener or create a new
     * one.
     *
     * @param listenerConfigProperties Map of properties needed to create a new listener
     * @param existingListeners        Set of existing listener variable names
     * @param moduleName               Module name for display (e.g., "Solace", "RabbitMQ")
     * @return Value configured as CHOICE with two options.
     */
    public static Value buildListenerChoiceProperty(Map<String, Value> listenerConfigProperties,
                                                    Set<String> existingListeners,
                                                    String moduleName) {
        Value choicesProperty = new Value.ValueBuilder()
                .metadata("Use Existing Listener", "Use Existing Listener or Create New Listener")
                .value("")
                .types(List.of(PropertyType.types(Value.FieldType.CHOICE)))
                .enabled(true)
                .editable(true)
                .setAdvanced(true)
                .build();

        choicesProperty.setChoices(List.of(buildUseExistingListenerChoice(existingListeners, moduleName),
                buildCreateNewListenerChoice(listenerConfigProperties, moduleName)));
        return choicesProperty;
    }

    /**
     * Builds a "Use Existing Listener" choice with a dropdown of available listeners.
     *
     * @param listeners  Set of existing listener variable names
     * @param moduleName Module name for display (e.g., "Solace", "RabbitMQ")
     * @return Value configured as a FORM with a single select dropdown.
     */
    private static Value buildUseExistingListenerChoice(Set<String> listeners, String moduleName) {
        Map<String, Value> existingListenerProps = new LinkedHashMap<>();
        List<String> items = listeners.stream().toList();
        Value existingListenerOptions = new Value.ValueBuilder()
                .metadata("Select Listener",
                        String.format("Select from the existing %s listeners", moduleName))
                .value(items.getFirst())
                .types(List.of(PropertyType.types(Value.FieldType.SINGLE_SELECT, Option.of(items))))
                .enabled(true)
                .editable(true)
                .setAdvanced(false)
                .build();
        existingListenerProps.put(ServiceInitModel.KEY_EXISTING_LISTENER, existingListenerOptions);

        return new Value.ValueBuilder()
                .metadata("Use Existing Listener", "Use Existing Listener")
                .value("true")
                .types(List.of(PropertyType.types(Value.FieldType.FORM)))
                .enabled(true)
                .editable(true)
                .setAdvanced(false)
                .setProperties(existingListenerProps)
                .build();
    }

    /**
     * Builds a "Create New Listener" choice with configuration properties.
     *
     * @param existingListenerProps Map of properties for creating a new listener
     * @param moduleName            Module name for display (e.g., "Solace", "RabbitMQ")
     * @return Value configured as a FORM with listener configuration properties.
     */
    private static Value buildCreateNewListenerChoice(Map<String, Value> existingListenerProps,
                                                      String moduleName) {
        return new Value.ValueBuilder()
                .metadata("Create New Listener",
                        String.format("Create a new %s listener", moduleName))
                .value("true")
                .types(List.of(PropertyType.types(Value.FieldType.FORM)))
                .enabled(false)
                .editable(true)
                .setAdvanced(false)
                .setProperties(existingListenerProps)
                .build();
    }

    /**
     * Removes specified listener configuration properties from the main properties map and returns them in a new map.
     *
     * @param allProperties The complete properties map
     * @param propertyKeys  Keys of properties to remove and collect
     * @return Map containing only the removed listener properties.
     */
    public static Map<String, Value> removeAndCollectListenerProperties(Map<String, Value> allProperties,
                                                                        List<String> propertyKeys) {
        Map<String, Value> listenerProps = new LinkedHashMap<>();
        for (String key : propertyKeys) {
            Value value = allProperties.remove(key);
            if (value != null) {
                listenerProps.put(key, value);
            }
        }
        return listenerProps;
    }

    /**
     * Determines whether an existing listener should be used based on the properties.
     *
     * @param properties Service initialization properties
     * @return true if an existing listener was selected.
     */
    public static boolean shouldUseExistingListener(Map<String, Value> properties) {
        return properties.containsKey(ServiceInitModel.KEY_EXISTING_LISTENER);
    }

    /**
     * Retrieves the name of the selected existing listener.
     *
     * @param properties Service initialization properties
     * @return Optional containing the listener name if selected.
     */
    public static Optional<String> getExistingListenerName(Map<String, Value> properties) {
        if (!properties.containsKey(ServiceInitModel.KEY_EXISTING_LISTENER)) {
            return Optional.empty();
        }
        Value existingListener = properties.get(ServiceInitModel.KEY_EXISTING_LISTENER);
        return Optional.ofNullable(existingListener.getValue());
    }

    /**
     * Builds a read-only text Value for displaying listener config information.
     */
    public static Value buildReadOnlyTextValue(String label, String description, String value) {
        return new Value.ValueBuilder()
                .metadata(label, description)
                .value(value)
                .types(List.of(PropertyType.types(Value.FieldType.TEXT, "string"),
                        PropertyType.types(Value.FieldType.EXPRESSION, "string")))
                .enabled(true)
                .editable(false)
                .setAdvanced(false)
                .build();
    }

    /**
     * Builds a read-only number Value for displaying listener config information.
     */
    public static Value buildReadOnlyNumberValue(String label, String description, String value) {
        return new Value.ValueBuilder()
                .metadata(label, description)
                .value(value)
                .types(List.of(PropertyType.types(Value.FieldType.NUMBER, "int"),
                        PropertyType.types(Value.FieldType.EXPRESSION, "int")))
                .enabled(true)
                .editable(false)
                .setAdvanced(false)
                .build();
    }

    /**
     * Builds a read-only TEXT_SET Value for displaying multi-valued listener config fields.
     */
    public static Value buildReadOnlyTextSetValue(String label, String description, List<String> values) {
        return new Value.ValueBuilder()
                .metadata(label, description)
                .setValues(values.stream().map(v -> (Object) v).toList())
                .types(List.of(new PropertyType.Builder()
                        .fieldType(Value.FieldType.TEXT_SET)
                        .ballerinaType("string")
                        .selected(true)
                        .build()))
                .enabled(true)
                .editable(false)
                .setAdvanced(false)
                .build();
    }

    public record DefaultListener(String moduleName, String variableName, LinePosition linePosition) {
    }
}
