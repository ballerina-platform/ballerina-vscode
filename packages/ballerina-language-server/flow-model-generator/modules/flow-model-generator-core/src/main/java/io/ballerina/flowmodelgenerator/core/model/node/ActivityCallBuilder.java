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

package io.ballerina.flowmodelgenerator.core.model.node;

import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.api.symbols.ClassSymbol;
import io.ballerina.compiler.api.symbols.ModuleSymbol;
import io.ballerina.compiler.api.symbols.ParameterSymbol;
import io.ballerina.compiler.api.symbols.Symbol;
import io.ballerina.compiler.api.symbols.SymbolKind;
import io.ballerina.compiler.syntax.tree.FunctionDefinitionNode;
import io.ballerina.compiler.syntax.tree.FunctionSignatureNode;
import io.ballerina.compiler.syntax.tree.ParameterNode;
import io.ballerina.compiler.syntax.tree.SeparatedNodeList;
import io.ballerina.compiler.syntax.tree.SyntaxKind;
import io.ballerina.flowmodelgenerator.core.model.Codedata;
import io.ballerina.flowmodelgenerator.core.model.FlowNode;
import io.ballerina.flowmodelgenerator.core.model.ItemOption;
import io.ballerina.flowmodelgenerator.core.model.Metadata;
import io.ballerina.flowmodelgenerator.core.model.NodeBuilder;
import io.ballerina.flowmodelgenerator.core.model.NodeKind;
import io.ballerina.flowmodelgenerator.core.model.Option;
import io.ballerina.flowmodelgenerator.core.model.Property;
import io.ballerina.flowmodelgenerator.core.model.SourceBuilder;
import io.ballerina.flowmodelgenerator.core.model.node.builtin.BuiltinActivityStrategy;
import io.ballerina.flowmodelgenerator.core.model.node.builtin.EmailActivityStrategy;
import io.ballerina.flowmodelgenerator.core.model.node.builtin.RestActivityStrategy;
import io.ballerina.flowmodelgenerator.core.model.node.builtin.SoapActivityStrategy;
import io.ballerina.flowmodelgenerator.core.utils.FileSystemUtils;
import io.ballerina.flowmodelgenerator.core.utils.ParamUtils;
import io.ballerina.flowmodelgenerator.core.utils.WorkflowUtil;
import io.ballerina.modelgenerator.commons.CommonUtils;
import io.ballerina.modelgenerator.commons.FunctionData;
import io.ballerina.modelgenerator.commons.FunctionDataBuilder;
import io.ballerina.modelgenerator.commons.ModuleInfo;
import io.ballerina.modelgenerator.commons.PackageUtil;
import io.ballerina.modelgenerator.commons.ParameterData;
import io.ballerina.projects.Module;
import io.ballerina.projects.Project;
import io.ballerina.tools.text.LineRange;
import org.eclipse.lsp4j.Range;
import org.eclipse.lsp4j.TextEdit;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.ACTIVITY_MODULE;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.BUILTIN_EMAIL_FUNCTION;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.BUILTIN_REST_FUNCTION;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.BUILTIN_SOAP_FUNCTION;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.CONTEXT_CLASS_NAME;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.DEFAULT_CTX_PARAM_NAME;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.WORKFLOW_MODULE;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.WORKFLOW_ORG;
import static io.ballerina.flowmodelgenerator.core.model.Property.ADVANCED_PARAM_KEY;
import static io.ballerina.flowmodelgenerator.core.utils.WorkflowUtil.isWorkflowContextParameter;

/**
 * Represents a workflow activity call node.
 * Handles both user-defined activity functions and builtin activity functions
 * (callRestAPI, callSoapAPI, sendEmail) from the workflow.activity module.
 *
 * <p>For user-defined activities, generates:
 * {@code int result = check ctx->callActivity(myActivity, {input});}
 *
 * <p>For builtin activities, generates:
 * {@code <T> varName = check ctx->callActivity(activity:<fn>, {connection: <c>, ...});}
 *
 * @since 1.8.0
 */
public class ActivityCallBuilder extends CallBuilder {
    public static final String LABEL = "Activity Call";
    public static final String DESCRIPTION = "Call a workflow activity function";
    public static final String CALL_ACTIVITY_METHOD = "callActivity";
    public static final String DEFAULT_RETURN_TYPE = "anydata";
    public static final String ADVANCE_CONFIGURATIONS = "Activity call configurations";
    public static final String CHECK_ERROR_KEY = "checkError";
    public static final String RETRY_POLICY_PARAM = "retryPolicy";
    public static final String NO_RETRY_VALUE = "NoRetry";
    public static final String AUTO_RETRY_VALUE = "AutoRetry";
    public static final String MANUAL_RETRY_VALUE = "ManualRetry";
    public static final String MAX_RETRIES_KEY = "maxRetries";
    public static final String RETRY_DELAY_KEY = "retryDelay";
    public static final String RETRY_BACKOFF_KEY = "retryBackoff";
    public static final String MAX_RETRY_DELAY_KEY = "maxRetryDelay";
    // retryPolicy is excluded from ADVANCE_PARAM_LIST; it is added at root level as a DROPDOWN_CHOICE.
    public static final Set<String> EXCLUDED_CALL_ACTIVITY_PARAMS = Set.of("activityFunction", "args", "T",
            CHECK_ERROR_KEY, Property.CONNECTION_KEY, RETRY_POLICY_PARAM);
    private static final String NEW_CONNECTION_SENTINEL = "NEW_CONNECTION";
    private static final String ACTIVITY_MODULE_PREFIX = "activity";
    private static final String DEFAULT_REST_DATABINDING = "json";
    private static final String SOAP_RESPONSE_TYPE = "xml";

    /**
     * Maps builtin activity function symbols to the strategy that handles their form and source generation.
     */
    static final Map<String, BuiltinActivityStrategy> BUILTIN_STRATEGY_MAP = Map.of(
            BUILTIN_REST_FUNCTION, new RestActivityStrategy(),
            BUILTIN_SOAP_FUNCTION, new SoapActivityStrategy(),
            BUILTIN_EMAIL_FUNCTION, new EmailActivityStrategy());

    // Strategy resolved at setConcreteTemplateData time; used by processSpecialParameter
    // (called during the advanced-parameter iteration) and buildBuiltinTemplate.
    private BuiltinActivityStrategy currentBuiltinStrategy;

    // For user-defined activities: whether any parameter is a connection client, making this activity
    // connection-backed (so the node kind is switched to CONNECTION_ACTIVITY_CALL).
    private boolean userActivityConnectionBacked;

    @Override
    protected NodeKind getFunctionNodeKind() {
        return NodeKind.ACTIVITY_CALL;
    }

    /**
     * {@link NodeBuilder#build()} re-invokes {@code setConstData()} after the template/analysis has run,
     * which would otherwise reset the node kind back to {@code ACTIVITY_CALL}. Preserve the
     * connection-backed kind when it has been chosen — either by the builtin/user-connection template
     * path (via the flags) or by the analysis path (which sets the node kind on the codedata directly
     * before {@code build()}).
     */
    @Override
    public void setConcreteConstData() {
        if (currentBuiltinStrategy != null || userActivityConnectionBacked
                || codedata().node() == NodeKind.CONNECTION_ACTIVITY_CALL) {
            codedata().node(NodeKind.CONNECTION_ACTIVITY_CALL);
        } else {
            codedata().node(NodeKind.ACTIVITY_CALL);
        }
    }

    @Override
    protected FunctionData.Kind getFunctionResultKind() {
        return FunctionData.Kind.ACTIVITY;
    }

    @Override
    public void setConcreteTemplateData(TemplateContext context) {
        Codedata codedata = context.codedata();
        currentBuiltinStrategy = ACTIVITY_MODULE.equals(codedata.module())
                ? BUILTIN_STRATEGY_MAP.get(codedata.symbol())
                : null;

        if (currentBuiltinStrategy != null) {
            buildBuiltinTemplate(context, codedata.symbol(), currentBuiltinStrategy);
        } else {
            userActivityConnectionBacked = false;
            super.setConcreteTemplateData(context);
            if (userActivityConnectionBacked) {
                // Leading parameter is a connection client — render this call with a connection arrow.
                codedata().node(NodeKind.CONNECTION_ACTIVITY_CALL);
            }
            addRetryPolicyFormProperties(this, NO_RETRY_VALUE, "", "", "", "");
            addAdvancedParameters(context, moduleInfo, this);
        }
    }

    /**
     * Builds the form template for a builtin activity (callRestAPI, callSoapAPI, sendEmail).
     *
     * <p>Each {@link BuiltinActivityStrategy} owns its API-specific form fields via
     * {@link BuiltinActivityStrategy#setFormProperties} (REST: method/path/message/headers; SOAP:
     * body/action/headers/path; Email: the flattened EmailOptions fields). The shared connection
     * selector, databinding/result-type field (REST), result variable, check-error flag, retry policy,
     * and advanced {@code callActivity} options are added here, around the strategy's fields.
     */
    private void buildBuiltinTemplate(TemplateContext context, String symbol, BuiltinActivityStrategy strategy) {
        metadata().label(strategy.getLabel()).description(strategy.getDescription());
        // Builtin activities wrap a connection, so they are modelled as connection-backed activity
        // calls — the diagram renders these with a connection arrow (like remote action calls).
        codedata().node(NodeKind.CONNECTION_ACTIVITY_CALL)
                .org(WORKFLOW_ORG)
                .module(ACTIVITY_MODULE)
                .symbol(symbol);

        Project project = PackageUtil.loadProject(context.workspaceManager(), context.filePath());
        properties().connectionSelector(NEW_CONNECTION_SENTINEL,
                strategy.searchNodesKind(), strategy.connectors());
        strategy.setFormProperties(this, context);

        // Build the callActivity FunctionData once and share it between the inferred-return-type
        // (REST only) and advanced-parameter passes to avoid loading/compiling the project twice.
        FunctionData callActivityData = buildCallActivityFunctionData(context, moduleInfo, project);

        addBuiltinPostProperties(strategy, context);
        if (strategy instanceof RestActivityStrategy) {
            addRestInferredReturnTypeProperty(context, callActivityData, DEFAULT_REST_DATABINDING);
        }
        addCheckErrorProperty();
        addRetryPolicyFormProperties(this, NO_RETRY_VALUE, "", "", "", "");
        addAdvancedParameters(context, this, callActivityData);
    }

    private static FunctionData buildCallActivityFunctionData(TemplateContext context, ModuleInfo userModuleInfo,
                                                              Project project) {
        ModuleInfo workflowModuleInfo = new ModuleInfo(WORKFLOW_ORG, WORKFLOW_MODULE, WORKFLOW_MODULE, null);
        return new FunctionDataBuilder()
                .name(CALL_ACTIVITY_METHOD)
                .moduleInfo(workflowModuleInfo)
                .parentSymbolType(CONTEXT_CLASS_NAME)
                .functionResultKind(FunctionData.Kind.REMOTE)
                .project(project)
                .userModuleInfo(userModuleInfo)
                .workspaceManager(context.workspaceManager())
                .filePath(context.filePath())
                .build();
    }

    private void addBuiltinPostProperties(BuiltinActivityStrategy strategy, TemplateContext context) {
        if (strategy instanceof RestActivityStrategy) {
            properties().data(Property.RESULT_NAME, context.getAllVisibleSymbolNames(),
                    Property.RESULT_NAME, Property.RESULT_DOC, false);
        } else if (strategy instanceof SoapActivityStrategy) {
            properties().data(Property.RESULT_NAME, context.getAllVisibleSymbolNames(),
                    Property.RESULT_NAME, Property.RESULT_DOC, false);
        }
        // Email (error? return): no result variable or type field.
    }

    private void addRestInferredReturnTypeProperty(TemplateContext context, FunctionData callActivityData,
                                                   String value) {
        Optional<ParameterData> inferredTypeParam = callActivityData.parameters().values().stream()
                .filter(param -> param.kind() == ParameterData.Kind.PARAM_FOR_TYPE_INFER)
                .findFirst();
        Module module = context.workspaceManager().module(context.filePath()).orElse(null);
        inferredTypeParam.ifPresent(param -> {
            buildInferredTypeProperty(this, param, value, module);
            // Re-key the inferred type to the canonical databindingType/"Databinding Type" form.
            normalizeDatabindingTypeProperty(this);
        });
    }

    private void addCheckErrorProperty() {
        properties().custom()
                .metadata()
                    .label("Check Error")
                    .description("Add 'check' to propagate errors. Uncheck to handle errors manually.")
                    .stepOut()
                .type().fieldType(Property.ValueType.FLAG).ballerinaType("boolean").selected(true).stepOut()
                .value("true")
                .editable(true)
                .optional(true)
                .stepOut()
                .addProperty(CHECK_ERROR_KEY);
    }

    /**
     * Intercepts special parameters during {@link #setParameterProperties} for builtin activities:
     * the shared {@code connection} parameter becomes a connection selector; everything else is
     * delegated to the active strategy. Each builtin owns its API-specific fields via
     * {@link BuiltinActivityStrategy#setFormProperties}, so this is reached only for the advanced
     * {@code callActivity} options iterated by {@link #addAdvancedParameters}.
     */
    @Override
    protected boolean processSpecialParameter(ParameterData paramData) {
        if (currentBuiltinStrategy == null) {
            // User-defined activity: treat every connection-client parameter as a connection
            // selector (like builtin activities) so the diagram links the call to each connection.
            Optional<ClassSymbol> connectionClass =
                    WorkflowUtil.resolveConnectionClass(paramData.typeSymbol());
            if (connectionClass.isPresent()) {
                userActivityConnectionBacked = true;
                addUserActivityConnectionSelector(connectionClass.get(),
                        ParamUtils.removeLeadingSingleQuote(paramData.name()));
                return true;
            }
            return false;
        }

        String paramName = ParamUtils.removeLeadingSingleQuote(paramData.name());
        if (Property.CONNECTION_KEY.equals(paramName)) {
            properties().connectionSelector(
                    NEW_CONNECTION_SENTINEL,
                    currentBuiltinStrategy.searchNodesKind(),
                    currentBuiltinStrategy.connectors());
            return true;
        }

        return currentBuiltinStrategy.processSpecialParameter(paramData, this);
    }

    /**
     * Adds the connection selector for a user-defined connection-backed activity. Mirrors the builtin
     * activities: the connection field lists connections of the client's category and offers an inline
     * "Add new connection" wizard entry derived from the connection client type — so a connection can be
     * created from the wizard just like for the prebuilt activities. The property key is the parameter
     * name so source generation round-trips the argument (an activity may take several connections).
     */
    private void addUserActivityConnectionSelector(ClassSymbol connectionClass, String paramName) {
        ConnectionSelectorData selector = resolveUserActivityConnectionSelector(connectionClass);
        String label = Property.CONNECTION_KEY.equals(paramName) ? Property.CONNECTION_LABEL : paramName;
        properties().connectionSelector(paramName, label, NEW_CONNECTION_SENTINEL,
                selector.searchNodesKind(), selector.connectors());
    }

    /**
     * The connection dropdown metadata for a user-defined connection-backed activity: the category of
     * connections to list and the inline "Add new connection" wizard entry derived from the client type.
     *
     * @param searchNodesKind the connection category the dropdown lists
     * @param connectors      the allowed "add new connection" wizard entries (may be empty)
     */
    public record ConnectionSelectorData(String searchNodesKind, List<Metadata.AllowedConnector> connectors) {
    }

    /**
     * Derives the connection selector metadata (category + add-new wizard entry) for a connection client
     * class. Shared by the template path ({@link #addUserActivityConnectionSelector}) and the source
     * analysis path (CodeAnalyzer) so both render an identical connection dropdown.
     */
    public static ConnectionSelectorData resolveUserActivityConnectionSelector(ClassSymbol connectionClass) {
        Optional<ModuleSymbol> connectionModule = connectionClass.getModule();
        if (connectionModule.isEmpty()) {
            return new ConnectionSelectorData(null, List.of());
        }
        ModuleInfo connectorModuleInfo = ModuleInfo.from(connectionModule.get().id());
        // searchNodes treats non-NodeKind kind strings as a module-prefix filter (e.g. "HTTP" matches
        // module "http"), so pass the connector module name to list its existing connections.
        String searchNodesKind = connectorModuleInfo.moduleName();
        Codedata connector = new Codedata.Builder<>(null)
                .node(NodeKind.NEW_CONNECTION)
                .org(connectorModuleInfo.org())
                .module(connectorModuleInfo.moduleName())
                .packageName(connectorModuleInfo.packageName())
                .object(connectionClass.getName().orElse("Client"))
                .symbol("init")
                .version(connectorModuleInfo.version())
                .build();
        List<Metadata.AllowedConnector> connectors = List.of(new Metadata.AllowedConnector(connector,
                "Add new " + connectorModuleInfo.packageName() + " connection"));
        return new ConnectionSelectorData(searchNodesKind, connectors);
    }

    /**
     * Adds the retryPolicy DROPDOWN_CHOICE and its hidden root sub-field properties to the given node builder.
     * Must be called at ROOT level (outside any nested property scope) so the UI can render
     * the DROPDOWN_CHOICE with dynamic sub-fields — nested scopes (ADVANCE_PARAM_LIST) do not
     * support the DROPDOWN_CHOICE type.
     *
     * <p>Sub-properties inside {@code dynamicFormFields.AutoRetry} intentionally carry empty values.
     * The UI reads the actual value from the matching root hidden property (by key name) and writes
     * edits back there, exactly like the {@code method}/{@code message} pattern in
     * {@link io.ballerina.flowmodelgenerator.core.model.node.builtin.RestActivityStrategy}.
     */
    public static void addRetryPolicyFormProperties(NodeBuilder nodeBuilder, String retryPolicyValue,
                                                    String maxRetries, String retryDelay,
                                                    String retryBackoff, String maxRetryDelay) {
        List<Option> options = List.of(
                new Option("No Retry", NO_RETRY_VALUE),
                new Option("Auto Retry", AUTO_RETRY_VALUE),
                new Option("Manual Retry", MANUAL_RETRY_VALUE));

        // Sub-property definitions for the AutoRetry option. Empty values are intentional:
        // the UI reads real values from the root hidden properties with matching keys.
        Property maxRetriesSubProp = buildRetrySubProperty("Max Retries",
                "Maximum number of retry attempts", "int");
        Property retryDelaySubProp = buildRetrySubProperty("Retry Delay",
                "Initial delay between retries in seconds", "decimal");
        Property retryBackoffSubProp = buildRetrySubProperty("Retry Backoff",
                "Exponential backoff multiplier (e.g. 2.0 doubles each delay)", "decimal");
        Property maxRetryDelaySubProp = buildRetrySubProperty("Max Retry Delay",
                "Maximum delay cap in seconds", "decimal");

        // Insertion-ordered so the AutoRetry sub-fields always render in this sequence (Map.of does
        // not guarantee iteration order).
        Map<String, Property> autoRetryFields = new LinkedHashMap<>();
        autoRetryFields.put(MAX_RETRIES_KEY, maxRetriesSubProp);
        autoRetryFields.put(RETRY_DELAY_KEY, retryDelaySubProp);
        autoRetryFields.put(RETRY_BACKOFF_KEY, retryBackoffSubProp);
        autoRetryFields.put(MAX_RETRY_DELAY_KEY, maxRetryDelaySubProp);

        Map<String, Map<String, Property>> dynamicFields = new LinkedHashMap<>();
        dynamicFields.put(NO_RETRY_VALUE, Map.of());
        dynamicFields.put(AUTO_RETRY_VALUE, autoRetryFields);
        dynamicFields.put(MANUAL_RETRY_VALUE, Map.of());

        nodeBuilder.properties().custom()
                .metadata()
                    .label("Retry Policy")
                    .description("Retry strategy to apply when the activity call fails")
                    .stepOut()
                .type()
                    .fieldType(Property.ValueType.DROPDOWN_CHOICE)
                    .options(options)
                    .selected(true)
                    .stepOut()
                .value(retryPolicyValue != null ? retryPolicyValue : NO_RETRY_VALUE)
                .editable(true)
                .itemOptions(ItemOption.from(options))
                .dynamicFormFields(dynamicFields)
                .stepOut()
                .addProperty(RETRY_POLICY_PARAM);

        // Root hidden properties: actual persistent storage for sub-field values.
        addHiddenRetrySubFieldProperty(nodeBuilder, MAX_RETRIES_KEY,
                "Max Retries", "Maximum number of retry attempts", "int", maxRetries);
        addHiddenRetrySubFieldProperty(nodeBuilder, RETRY_DELAY_KEY,
                "Retry Delay", "Initial delay between retries in seconds", "decimal", retryDelay);
        addHiddenRetrySubFieldProperty(nodeBuilder, RETRY_BACKOFF_KEY,
                "Retry Backoff", "Exponential backoff multiplier", "decimal", retryBackoff);
        addHiddenRetrySubFieldProperty(nodeBuilder, MAX_RETRY_DELAY_KEY,
                "Max Retry Delay", "Maximum delay cap in seconds", "decimal", maxRetryDelay);
    }

    private static Property buildRetrySubProperty(String label, String description, String ballerinaType) {
        return new Property.Builder<Void>(null)
                .metadata()
                    .label(label)
                    .description(description)
                    .stepOut()
                .type().fieldType(Property.ValueType.EXPRESSION)
                    .ballerinaType(ballerinaType).selected(true).stepOut()
                .value("")
                .editable(true)
                .build();
    }

    private static void addHiddenRetrySubFieldProperty(NodeBuilder nodeBuilder, String key,
                                                       String label, String description,
                                                       String ballerinaType, String value) {
        nodeBuilder.properties().custom()
                .metadata().label(label).description(description).stepOut()
                .type().fieldType(Property.ValueType.EXPRESSION)
                    .ballerinaType(ballerinaType).selected(true).stepOut()
                .value(value != null ? value : "")
                .editable(true).optional(true).hidden(true)
                .stepOut()
                .addProperty(key);
    }

    public static void addAdvancedParameters(TemplateContext context, ModuleInfo moduleInfo,
                                             CallBuilder builder) {
        addAdvancedParameters(context, moduleInfo, builder,
                PackageUtil.loadProject(context.workspaceManager(), context.filePath()));
    }

    public static void addAdvancedParameters(TemplateContext context, ModuleInfo moduleInfo,
                                             CallBuilder builder, Project project) {
        addAdvancedParameters(context, builder, buildCallActivityFunctionData(context, moduleInfo, project));
    }

    public static void addAdvancedParameters(TemplateContext context, CallBuilder builder,
                                             FunctionData callActivityData) {
        LinkedHashMap<String, ParameterData> filteredParams = new LinkedHashMap<>(callActivityData.parameters());
        filteredParams.keySet().removeAll(EXCLUDED_CALL_ACTIVITY_PARAMS);
        filteredParams.values().removeIf(p -> p.kind() == ParameterData.Kind.PARAM_FOR_TYPE_INFER);
        callActivityData.setParameters(filteredParams);

        Module module = context.workspaceManager().module(context.filePath()).orElse(null);

        builder.properties().nestedProperty();
        builder.setParameterProperties(callActivityData, module);
        builder.properties().endNestedProperty(Property.ValueType.ADVANCE_PARAM_LIST, ADVANCED_PARAM_KEY,
                ADVANCE_CONFIGURATIONS, ADVANCE_CONFIGURATIONS);
    }

    /**
     * Returns the strategy for the given function symbol, or {@code null} if it is not a builtin.
     * Used by CodeAnalyzer when re-populating diagram node properties from source.
     */
    public static BuiltinActivityStrategy getBuiltinStrategy(String functionSymbol) {
        return functionSymbol != null ? BUILTIN_STRATEGY_MAP.get(functionSymbol) : null;
    }

    @Override
    public Map<Path, List<TextEdit>> toSource(SourceBuilder sourceBuilder) {
        BuiltinActivityStrategy strategy = resolveBuiltinStrategy(sourceBuilder.flowNode.codedata());
        if (strategy != null) {
            return toSourceBuiltin(sourceBuilder, strategy);
        }
        return toSourceUserActivity(sourceBuilder);
    }

    private Map<Path, List<TextEdit>> toSourceUserActivity(SourceBuilder sourceBuilder) {
        FlowNode flowNode = sourceBuilder.flowNode;

        Optional<Property> typeProp = sourceBuilder.getProperty(Property.TYPE_KEY);
        Optional<Property> variableProp = sourceBuilder.getProperty(Property.VARIABLE_KEY);

        String resultType = typeProp
                .map(p -> p.value().toString())
                .orElse(DEFAULT_RETURN_TYPE);
        String variableName = variableProp
                .map(p -> p.value().toString())
                .orElse("result");

        String ctxParamName = resolveContextParamName(sourceBuilder);

        Codedata codedata = flowNode.codedata();
        String activityFunctionSymbol = codedata.symbol();
        if (activityFunctionSymbol == null || activityFunctionSymbol.isBlank()) {
            throw new IllegalStateException("ActivityCallBuilder requires a non-empty activity function symbol");
        }

        String qualifiedActivityFunction = getQualifiedActivityFunctionName(sourceBuilder, codedata);

        sourceBuilder.token()
                .name(resultType)
                .whiteSpace()
                .name(variableName)
                .whiteSpace()
                .keyword(SyntaxKind.EQUAL_TOKEN)
                .keyword(SyntaxKind.CHECK_KEYWORD)
                .name(ctxParamName)
                .keyword(SyntaxKind.RIGHT_ARROW_TOKEN)
                .name(CALL_ACTIVITY_METHOD)
                .keyword(SyntaxKind.OPEN_PAREN_TOKEN)
                .name(qualifiedActivityFunction)
                .keyword(SyntaxKind.COMMA_TOKEN);

        Map<String, Property> properties = flowNode.properties();
        Set<String> excludedKeys = Set.of(Property.VARIABLE_KEY, Property.TYPE_KEY,
                CHECK_ERROR_KEY, ADVANCED_PARAM_KEY, RETRY_POLICY_PARAM,
                MAX_RETRIES_KEY, RETRY_DELAY_KEY, RETRY_BACKOFF_KEY, MAX_RETRY_DELAY_KEY);
        populateActivityCallArg(sourceBuilder, properties, excludedKeys);
        populateRetryPolicyArg(sourceBuilder, properties);
        populateAdvancedArgs(sourceBuilder, properties);

        sourceBuilder.token()
                .keyword(SyntaxKind.CLOSE_PAREN_TOKEN)
                .endOfStatement();

        return sourceBuilder.textEdit().build();
    }

    private Map<Path, List<TextEdit>> toSourceBuiltin(SourceBuilder sourceBuilder,
                                                       BuiltinActivityStrategy strategy) {
        LineRange lineRange = sourceBuilder.flowNode.codedata().lineRange();
        if (lineRange == null) {
            throw new IllegalStateException("Line range is not available for the builtin activity node");
        }

        Optional<Property> connectionProp = sourceBuilder.getProperty(Property.CONNECTION_KEY);
        String connection = connectionProp
                .map(p -> p.value() == null ? "" : p.value().toString())
                .orElse("");
        if (connection.isEmpty() || NEW_CONNECTION_SENTINEL.equals(connection)) {
            throw new IllegalStateException("A connection is required for the builtin activity. "
                    + "Pick a module-level final client from the Connection dropdown.");
        }

        Optional<Property> checkErrorProp = sourceBuilder.getProperty(CHECK_ERROR_KEY);
        boolean useCheck = checkErrorProp
                .map(p -> p.value() != null && "true".equals(p.value().toString()))
                .orElse(true);

        String variableName = sourceBuilder.getProperty(Property.VARIABLE_KEY)
                .map(p -> p.value() == null ? "result" : p.value().toString())
                .orElse("result");

        // Determine LHS type and whether to emit a result variable
        String lhsType;
        String databindingType = null;
        boolean hasReturnValue;
        if (strategy instanceof RestActivityStrategy) {
            databindingType = sourceBuilder.getProperty(DATABINDING_TYPE_KEY)
                    .map(p -> p.value() != null && !p.value().toString().isEmpty()
                            ? p.value().toString()
                            : DEFAULT_REST_DATABINDING)
                    .orElse(DEFAULT_REST_DATABINDING);
            lhsType = databindingType;
            hasReturnValue = true;
        } else if (strategy instanceof SoapActivityStrategy) {
            lhsType = SOAP_RESPONSE_TYPE;
            hasReturnValue = true;
        } else {
            lhsType = null;
            hasReturnValue = false;
        }

        String ctxParamName = resolveContextParamName(sourceBuilder);

        if (hasReturnValue) {
            String declaredType = useCheck ? lhsType : lhsType + "|error";
            sourceBuilder.token()
                    .name(declaredType)
                    .whiteSpace()
                    .name(variableName)
                    .whiteSpace()
                    .keyword(SyntaxKind.EQUAL_TOKEN);
        }

        if (useCheck) {
            sourceBuilder.token().keyword(SyntaxKind.CHECK_KEYWORD);
        }

        sourceBuilder.token()
                .name(ctxParamName)
                .keyword(SyntaxKind.RIGHT_ARROW_TOKEN)
                .name(CALL_ACTIVITY_METHOD)
                .keyword(SyntaxKind.OPEN_PAREN_TOKEN)
                .name(ACTIVITY_MODULE_PREFIX)
                .keyword(SyntaxKind.COLON_TOKEN)
                .name(strategy.activityFunctionSymbol())
                .keyword(SyntaxKind.COMMA_TOKEN);

        // Build args record: { connection: <c>, <strategy-specific args> }
        // NOTE: callRestAPI has `typedesc<anydata> t = <>` for contextual-inference — it must NOT
        // be passed explicitly; the LHS type drives the binding.
        List<String> argEntries = new ArrayList<>();
        argEntries.add("connection: " + connection);
        argEntries.addAll(strategy.getCallActivityArgs(sourceBuilder));

        sourceBuilder.token()
                .keyword(SyntaxKind.OPEN_BRACE_TOKEN)
                .name(String.join(", ", argEntries))
                .keyword(SyntaxKind.CLOSE_BRACE_TOKEN);
        populateRetryPolicyArg(sourceBuilder, sourceBuilder.flowNode.properties());
        populateAdvancedArgs(sourceBuilder, sourceBuilder.flowNode.properties());
        sourceBuilder.token()
                .keyword(SyntaxKind.CLOSE_PAREN_TOKEN)
                .endOfStatement();

        sourceBuilder.textEdit(SourceBuilder.SourceKind.STATEMENT,
                sourceBuilder.filePath, CommonUtils.toRange(lineRange));

        sourceBuilder.acceptImport(WORKFLOW_ORG, WORKFLOW_MODULE);
        sourceBuilder.acceptImport(WORKFLOW_ORG, ACTIVITY_MODULE);
        for (BuiltinActivityStrategy.Import imp : strategy.getRequiredImports(sourceBuilder)) {
            sourceBuilder.acceptImport(imp.org(), imp.module());
        }

        return sourceBuilder.build();
    }

    private static BuiltinActivityStrategy resolveBuiltinStrategy(Codedata codedata) {
        if (codedata == null || !ACTIVITY_MODULE.equals(codedata.module())) {
            return null;
        }
        return BUILTIN_STRATEGY_MAP.get(codedata.symbol());
    }

    /**
     * Resolves the workflow context parameter name from the enclosing workflow function.
     * If no context parameter exists, one is added automatically.
     */
    public static String resolveContextParamName(SourceBuilder sourceBuilder) {
        try {
            sourceBuilder.workspaceManager.loadProject(sourceBuilder.filePath);
        } catch (Exception e) {
            throw new IllegalStateException("Failed to load the project for file: " + sourceBuilder.filePath, e);
        }
        SemanticModel semanticModel = FileSystemUtils.getSemanticModel(sourceBuilder.workspaceManager,
                sourceBuilder.filePath);

        FunctionDefinitionNode functionNode = WorkflowUtil.findEnclosingWorkflowFunction(sourceBuilder);
        if (functionNode == null) {
            throw new IllegalStateException("Activity call must be inside a workflow function");
        }

        Optional<String> optCtxParamName = getContextParamName(functionNode, semanticModel);
        if (optCtxParamName.isPresent()) {
            return optCtxParamName.get();
        }
        addContextParameterToFunction(sourceBuilder, functionNode);
        return DEFAULT_CTX_PARAM_NAME;
    }

    /**
     * Emits a map of activity function parameters as {@code {key: value, ...}} into the source builder.
     */
    public static void populateActivityCallArg(SourceBuilder sourceBuilder, Map<String, Property> properties,
                                               Set<String> excludedKeys) {
        sourceBuilder.token().keyword(SyntaxKind.OPEN_BRACE_TOKEN);
        if (properties != null) {
            boolean isFirstArg = true;
            for (Map.Entry<String, Property> entry : properties.entrySet()) {
                if (excludedKeys.contains(entry.getKey())) {
                    continue;
                }

                if (entry.getValue().value() == null) {
                    continue;
                }
                // toSourceCode() converts structured values (map/array form values) into Ballerina
                // literals; the raw value.toString() would emit the internal form-field objects.
                String source = entry.getValue().toSourceCode();
                if (source == null || source.isEmpty()) {
                    continue;
                }

                if (!isFirstArg) {
                    sourceBuilder.token()
                            .keyword(SyntaxKind.COMMA_TOKEN);
                } else {
                    isFirstArg = false;
                }
                sourceBuilder.token()
                        .whiteSpace()
                        .name(entry.getKey())
                        .keyword(SyntaxKind.COLON_TOKEN)
                        .name(source);
            }
        }
        sourceBuilder.token()
                .keyword(SyntaxKind.CLOSE_BRACE_TOKEN);
    }

    /**
     * Emits activity call options as named arguments into the source builder.
     */
    private static void populateRetryPolicyArg(SourceBuilder sourceBuilder, Map<String, Property> properties) {
        if (properties == null) {
            return;
        }
        Property retryPolicy = properties.get(RETRY_POLICY_PARAM);
        if (retryPolicy == null || retryPolicy.value() == null || retryPolicy.value().toString().isEmpty()) {
            return;
        }
        // NoRetry is the default; don't emit it explicitly to avoid cluttering source.
        if (NO_RETRY_VALUE.equals(retryPolicy.value().toString())) {
            return;
        }
        String retryPolicyExpr = retryPolicyExpression(retryPolicy, properties);
        if (retryPolicyExpr == null || retryPolicyExpr.isEmpty()) {
            return;
        }
        sourceBuilder.token()
                .keyword(SyntaxKind.COMMA_TOKEN)
                .name(RETRY_POLICY_PARAM)
                .whiteSpace()
                .keyword(SyntaxKind.EQUAL_TOKEN)
                .name(retryPolicyExpr);
    }

    private static String retryPolicyExpression(Property retryPolicy, Map<String, Property> properties) {
        String value = retryPolicy.value().toString();
        if (AUTO_RETRY_VALUE.equals(value)) {
            return autoRetryRecordLiteral(properties);
        }
        return switch (value) {
            // NO_RETRY is handled (and skipped) by populateRetryPolicyArg before reaching here.
            case MANUAL_RETRY_VALUE -> "workflow:ManualRetry";
            default -> value;
        };
    }

    private static String autoRetryRecordLiteral(Map<String, Property> autoRetryFields) {
        List<String> fields = new ArrayList<>();
        addRecordField(fields, autoRetryFields, MAX_RETRIES_KEY);
        addRecordField(fields, autoRetryFields, RETRY_DELAY_KEY);
        addRecordField(fields, autoRetryFields, RETRY_BACKOFF_KEY);
        addRecordField(fields, autoRetryFields, MAX_RETRY_DELAY_KEY);
        return fields.isEmpty() ? "{}" : "{" + String.join(", ", fields) + "}";
    }

    private static void addRecordField(List<String> fields, Map<String, Property> properties, String key) {
        Property property = properties.get(key);
        if (property == null || property.value() == null || property.value().toString().isEmpty()) {
            return;
        }
        fields.add(key + ": " + property.value());
    }

    public static void populateAdvancedArgs(SourceBuilder sourceBuilder, Map<String, Property> properties) {
        if (properties == null) {
            return;
        }
        Property advanceProp = properties.get(ADVANCED_PARAM_KEY);
        if (advanceProp != null && advanceProp.value() instanceof Map<?, ?> advance) {
            for (Map.Entry<?, ?> param : advance.entrySet()) {
                if (param.getKey() instanceof String paramName && !paramName.isEmpty() &&
                        param.getValue() instanceof Map<?, ?> paramProp) {
                    Property paramData = Property.convertToProperty(paramProp);
                    if (paramData.value() != null && !paramData.value().toString().isEmpty()) {
                        sourceBuilder.token()
                                .keyword(SyntaxKind.COMMA_TOKEN)
                                .name(paramName)
                                .whiteSpace()
                                .keyword(SyntaxKind.EQUAL_TOKEN)
                                .param(paramData);
                    }
                }
            }
        }
    }

    public static Optional<String> getContextParamName(FunctionDefinitionNode functionNode,
                                                              SemanticModel semanticModel) {
        SeparatedNodeList<ParameterNode> parameters = functionNode.functionSignature().parameters();
        if (parameters.isEmpty()) {
            return Optional.empty();
        }

        Optional<Symbol> symbol = semanticModel.symbol(parameters.get(0));
        if (symbol.isPresent() && symbol.get().kind() == SymbolKind.PARAMETER) {
            ParameterSymbol paramSymbol = (ParameterSymbol) symbol.get();
            if (isWorkflowContextParameter(paramSymbol)) {
                return paramSymbol.getName();
            }
        }

        return Optional.empty();
    }

    public static void addContextParameterToFunction(SourceBuilder sourceBuilder,
                                                      FunctionDefinitionNode functionNode) {
        FunctionSignatureNode functionSignature = functionNode.functionSignature();
        LineRange closeParenLineRange = functionSignature.openParenToken().lineRange();
        Range insertRange = CommonUtils.toRange(closeParenLineRange.endLine());
        sourceBuilder.token()
                .name(WORKFLOW_MODULE)
                .name(SyntaxKind.COLON_TOKEN.stringValue())
                .name(CONTEXT_CLASS_NAME)
                .whiteSpace()
                .name(DEFAULT_CTX_PARAM_NAME);
        if (!functionSignature.parameters().isEmpty()) {
            sourceBuilder.token().keyword(SyntaxKind.COMMA_TOKEN);
        }
        sourceBuilder.token().skipFormatting().stepOut().textEdit(null, sourceBuilder.filePath, insertRange);
    }

    /**
     * Gets the qualified activity function name, handling both local and imported module functions.
     */
    private String getQualifiedActivityFunctionName(SourceBuilder sourceBuilder, Codedata codedata) {
        String functionSymbol = codedata.symbol();
        String org = codedata.org();
        String module = codedata.module();

        if (org == null || org.isEmpty() || module == null || module.isEmpty()) {
            return functionSymbol;
        }

        boolean isLocalFunction = PackageUtil.isLocalFunction(
                sourceBuilder.workspaceManager, sourceBuilder.filePath, org, module);

        if (isLocalFunction) {
            return functionSymbol;
        }

        String modulePrefix = module.substring(module.lastIndexOf('.') + 1);
        sourceBuilder.acceptImport(org, module);
        return modulePrefix + ":" + functionSymbol;
    }
}
