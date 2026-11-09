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

package io.ballerina.flowmodelgenerator.core.model.node;

import com.google.gson.Gson;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonSyntaxException;
import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.api.symbols.Documentation;
import io.ballerina.compiler.api.symbols.ModuleSymbol;
import io.ballerina.compiler.api.symbols.RecordFieldSymbol;
import io.ballerina.compiler.api.symbols.RecordTypeSymbol;
import io.ballerina.compiler.api.symbols.Symbol;
import io.ballerina.compiler.api.symbols.TypeDefinitionSymbol;
import io.ballerina.compiler.api.symbols.TypeSymbol;
import io.ballerina.compiler.api.symbols.UnionTypeSymbol;
import io.ballerina.compiler.syntax.tree.SyntaxInfo;
import io.ballerina.compiler.syntax.tree.SyntaxKind;
import io.ballerina.flowmodelgenerator.core.AiUtils;
import io.ballerina.flowmodelgenerator.core.model.Codedata;
import io.ballerina.flowmodelgenerator.core.model.FlowNode;
import io.ballerina.flowmodelgenerator.core.model.FormBuilder;
import io.ballerina.flowmodelgenerator.core.model.NodeBuilder;
import io.ballerina.flowmodelgenerator.core.model.Property;
import io.ballerina.flowmodelgenerator.core.model.SourceBuilder;
import io.ballerina.flowmodelgenerator.core.utils.FlowNodeUtil;
import io.ballerina.flowmodelgenerator.core.utils.ParamUtils;
import io.ballerina.modelgenerator.commons.CommonUtils;
import io.ballerina.modelgenerator.commons.DefaultValueGeneratorUtil;
import io.ballerina.modelgenerator.commons.FileSystemUtils;
import io.ballerina.modelgenerator.commons.FunctionData;
import io.ballerina.modelgenerator.commons.FunctionDataBuilder;
import io.ballerina.modelgenerator.commons.ModuleInfo;
import io.ballerina.modelgenerator.commons.PackageUtil;
import io.ballerina.modelgenerator.commons.ParameterData;
import io.ballerina.projects.Document;
import io.ballerina.projects.Module;
import io.ballerina.projects.Package;
import io.ballerina.projects.PackageCompilation;
import io.ballerina.projects.Project;
import io.ballerina.tools.text.LineRange;
import org.ballerinalang.langserver.common.utils.NameUtil;
import org.ballerinalang.langserver.commons.eventsync.exceptions.EventSyncException;
import org.ballerinalang.langserver.commons.workspace.WorkspaceDocumentException;
import org.eclipse.lsp4j.Range;
import org.eclipse.lsp4j.TextEdit;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

import static io.ballerina.flowmodelgenerator.core.Constants.Ai;
import static io.ballerina.flowmodelgenerator.core.model.NodeKind.MCP_TOOL_KIT;
import static io.ballerina.flowmodelgenerator.core.model.Property.CHECK_ERROR_KEY;
import static io.ballerina.flowmodelgenerator.core.model.Property.GLOBAL_SCOPE;
import static io.ballerina.flowmodelgenerator.core.model.Property.RESULT_DOC;
import static io.ballerina.flowmodelgenerator.core.model.Property.RESULT_NAME;
import static io.ballerina.flowmodelgenerator.core.model.Property.RESULT_TYPE_LABEL;
import static io.ballerina.flowmodelgenerator.core.model.Property.SCOPE_KEY;
import static io.ballerina.flowmodelgenerator.core.model.Property.TYPE_KEY;
import static io.ballerina.flowmodelgenerator.core.model.Property.VARIABLE_KEY;
import static io.ballerina.flowmodelgenerator.core.model.Property.ValueType;
import static io.ballerina.modelgenerator.commons.CommonUtils.generateIcon;
import static io.ballerina.modelgenerator.commons.ParameterData.Kind;

/**
 * Represents a Generated McpToolKitClass node in the flow model.
 *
 * @since 1.3.1
 */
public class McpToolKitBuilder extends NodeBuilder {

    private static final String TOOL_KIT_NAME_PROPERTY = "toolKitName";
    private static final String TOOL_KIT_NAME_PROPERTY_LABEL = "MCP Toolkit Name";
    private static final String TOOL_KIT_NAME_DESCRIPTION = "Name of the MCP toolkit";
    private static final String TOOL_KIT_DEFAULT_CLASS_NAME = "McpToolKit";
    private static final String PERMITTED_TOOLS_PROPERTY = "permittedTools";
    private static final String TOOL_SCOPES_PROPERTY = "toolScopes";
    private static final String INCLUDE_CONTEXT_PROPERTY = "includeContext";
    // How the MCP server presents itself, kept on the generated class as @display {label, iconPath}
    public static final String TOOL_KIT_LABEL_PROPERTY = "toolKitLabel";
    public static final String TOOL_KIT_ICON_PROPERTY = "toolKitIcon";
    private static final String TOOL_SCOPES_PROPERTY_LABEL = "Tool Scopes";
    private static final String TOOL_SCOPES_DESCRIPTION = "OAuth scopes for each tool";
    private static final String AI_MCP_TOOL_KIT_CLASS = "McpToolKit";
    private static final String AI_MCP_BASE_TOOL_KIT_TYPE_WITH_PREFIX = "ai:McpBaseToolKit";
    private static final String INIT_METHOD_NAME = "init";
    private static final String MINIMUM_COMPATIBLE_AI_VERSION = "1.6.0";
    // First ai version whose getPermittedMcpToolConfigs accepts an mcp.v2 client
    private static final String MINIMUM_MCP_V2_AI_VERSION = "1.17.0";
    private static final String MCP_V2_IMPORT_PREFIX = "mcpv2";
    // The config of the generated mcp.v2 toolkit init method, which also accepts agent identity
    private static final String AI_MCP_V2_CLIENT_CONFIG_TYPE = "McpStreamableHttpClientConfig";
    private static final String MCP_V2_IMPLEMENTATION_TYPE = "Implementation";
    private static final String MCP_V2_DEFAULT_INFO = "{name: \"MCP\", version: \"1.0.0\"}";
    private static final String MCP_V2_TOOL_KIT_DESCRIPTION = "Connects to an MCP server and provides its tools";
    private static final String SERVER_URL_PARAM = "serverUrl";
    private static final String SERVER_URL_DESCRIPTION = "The URL of the MCP server";
    private static final String INFO_PROPERTY = "info";
    private static final String INFO_PROPERTY_LABEL = "Info";
    private static final String INFO_PROPERTY_DESCRIPTION = "The client information sent to the MCP server";
    private static final String HTTP_CONFIG_PROPERTY = "httpConfig";
    // Shown on its own in the mcp.v2 form; the form keeps it in httpConfig, which is what is generated
    private static final String AUTH_PROPERTY = "auth";
    private static final String CONNECTIONS_BAL = "connections.bal";
    public static final String MCP_CLASS_DEFINITION = "mcpClassDefinition";
    public static final String AGENT_DEFINITION_MCP_TOOL_KIT = "agentDefinitionMcpToolKit";
    // Records which MCP client the generated toolkit class is built on, so that saving keeps the class on the same
    // client the form was built from. Absent for toolkits built on the mcp (v1) client. A template request may also
    // carry it to ask for the form of a client; any value other than v2 means the mcp (v1) client.
    public static final String MCP_PROTOCOL_KEY = "mcpProtocol";
    public static final String MCP_PROTOCOL_V2 = "v2";
    private static final Gson gson = new Gson();
    private static final String NEW_LINE = System.lineSeparator();

    @Override
    public void setConcreteConstData() {
        codedata().node(MCP_TOOL_KIT);
    }

    @Override
    public void setConcreteTemplateData(TemplateContext context) {
        String aiModuleVersion = getAiModuleVersion(context);
        // An edit gets the form of the client the toolkit is built on, named in the request or, when the request
        // carries an existing generated class's codedata, v1 unless marked v2. A new toolkit follows the ai version.
        Map<String, Object> requestData = context.codedata() != null ? context.codedata().data() : null;
        Object requestedProtocol = requestData != null ? requestData.get(MCP_PROTOCOL_KEY) : null;
        boolean mcpV2;
        if (requestedProtocol != null) {
            mcpV2 = MCP_PROTOCOL_V2.equals(requestedProtocol);
        } else if (requestData != null && requestData.containsKey(MCP_CLASS_DEFINITION)) {
            mcpV2 = false;
        } else {
            mcpV2 = supportsMcpV2(aiModuleVersion);
        }
        if (mcpV2) {
            String aiVersion = aiModuleVersion != null ? aiModuleVersion
                    : AiUtils.getNewPackageVersion(Ai.AI_PACKAGE, MINIMUM_MCP_V2_AI_VERSION);
            Optional<AiTypeSource> aiTypeSource = getAiTypeSource(aiVersion);
            // A new toolkit in a project without ai gets the mcp (v1) form when no ai that supports mcp.v2 can be
            // loaded, such as offline with only an older ai cached. A toolkit that needs mcp.v2 still fails.
            if (aiTypeSource.isPresent() || requestedProtocol != null || aiModuleVersion != null) {
                setMcpV2TemplateData(context, aiVersion, aiTypeSource.orElseThrow(
                        () -> new IllegalStateException("Unable to load ballerina/ai:" + aiVersion)));
                return;
            }
        }
        ModuleInfo codedataModuleInfo = new ModuleInfo(Ai.BALLERINA_ORG, Ai.AI_PACKAGE, Ai.AI_PACKAGE, aiModuleVersion);

        // Both the generated class init method and the ai:McpToolKit class init method have similar input argument
        // Hence use the ai:McpToolKit to build the form data
        FunctionData functionData = new FunctionDataBuilder().parentSymbolType(AI_MCP_TOOL_KIT_CLASS)
                .name(INIT_METHOD_NAME).moduleInfo(codedataModuleInfo).userModuleInfo(moduleInfo)
                .lsClientLogger(context.lsClientLogger()).functionResultKind(FunctionData.Kind.MCP_TOOL_KIT)
                .workspaceManager(context.workspaceManager())
                .filePath(context.filePath())
                .build();

        metadata().label(functionData.packageName()).description(functionData.description())
                .icon(generateIcon(functionData.org(), functionData.packageName(), functionData.version()));

        codedata().org(functionData.org()).module(functionData.moduleName()).packageName(functionData.packageName())
                .object(functionData.name()).version(functionData.version());

        metadata().label(functionData.packageName()).description(functionData.description())
                .icon(generateIcon(functionData.org(), functionData.packageName(), functionData.version()));
        codedata().org(functionData.org()).module(functionData.moduleName()).packageName(functionData.packageName())
                .object(functionData.name()).version(functionData.version());

        setParameterProperties(functionData.parameters().values());
        AiUtils.setOptionalPropertiesAdvanced(this);

        // Hide permittedTools property (toolScopes is optional and only added when sent by the frontend)
        functionData.parameters().remove(PERMITTED_TOOLS_PROPERTY);
        setPermittedToolsProperty(this, null);

        if (hasCompatibleAiVersion(aiModuleVersion)) {
            String uniqueToolKitName =
                    NameUtil.getValidatedSymbolName(context.getAllVisibleSymbolNames(), TOOL_KIT_DEFAULT_CLASS_NAME);
            setToolKitNameProperty(this, uniqueToolKitName);
            setReturnType(AI_MCP_BASE_TOOL_KIT_TYPE_WITH_PREFIX, context);
        } else {
            setReturnType(functionData.returnType(), context);
        }
    }

    /**
     * Builds the form of a toolkit class generated on the mcp.v2 client. The generated init method is
     * {@code init(string serverUrl, mcpv2:Implementation info = {...}, *ai:McpStreamableHttpClientConfig config)},
     * which no library function declares, so the server URL and the client info are set here and the config fields
     * are read from the ai record.
     */
    private void setMcpV2TemplateData(TemplateContext context, String aiVersion, AiTypeSource aiTypeSource) {
        SemanticModel aiSemanticModel = aiTypeSource.semanticModel();
        TypeDefinitionSymbol configType =
                getTypeDefinition(aiSemanticModel, Ai.AI_PACKAGE, AI_MCP_V2_CLIENT_CONFIG_TYPE, aiVersion);
        TypeDefinitionSymbol infoType = getMcpV2TypeDefinition(configType, MCP_V2_IMPLEMENTATION_TYPE, aiVersion);

        metadata().label(Ai.AI_PACKAGE).description(MCP_V2_TOOL_KIT_DESCRIPTION)
                .icon(generateIcon(Ai.BALLERINA_ORG, Ai.AI_PACKAGE, aiVersion));
        codedata().org(Ai.BALLERINA_ORG).module(Ai.AI_PACKAGE).packageName(Ai.AI_PACKAGE)
                .object(AI_MCP_TOOL_KIT_CLASS).version(aiVersion)
                .data(MCP_PROTOCOL_KEY, MCP_PROTOCOL_V2);

        // The info parameter follows the server URL, since a defaultable argument is passed positionally
        List<ParameterData> parameters = new ArrayList<>();
        TypeSymbol stringType = aiSemanticModel.types().STRING;
        parameters.add(ParameterData.from(SERVER_URL_PARAM, SERVER_URL_DESCRIPTION, null,
                stringType.signature(), DefaultValueGeneratorUtil.getDefaultValueForType(stringType), null,
                Kind.REQUIRED, false, false, false, null, stringType));
        parameters.add(ParameterData.from(INFO_PROPERTY, INFO_PROPERTY_DESCRIPTION, INFO_PROPERTY_LABEL,
                MCP_V2_IMPORT_PREFIX + ":" + MCP_V2_IMPLEMENTATION_TYPE, MCP_V2_DEFAULT_INFO, MCP_V2_DEFAULT_INFO,
                Kind.DEFAULTABLE, true, false, false,
                CommonUtils.getImportStatement(Ai.BALLERINA_ORG, Ai.MCP_PACKAGE, Ai.MCP_V2_MODULE),
                infoType.typeDescriptor()));
        parameters.add(getHttpAuthParameter(configType, aiTypeSource, aiVersion));
        parameters.addAll(getConfigFieldParameters(configType, aiTypeSource));
        setParameterProperties(parameters);
        AiUtils.setOptionalPropertiesAdvanced(this);

        setPermittedToolsProperty(this, null);
        String uniqueToolKitName =
                NameUtil.getValidatedSymbolName(context.getAllVisibleSymbolNames(), TOOL_KIT_DEFAULT_CLASS_NAME);
        setToolKitNameProperty(this, uniqueToolKitName);
        setReturnType(AI_MCP_BASE_TOOL_KIT_TYPE_WITH_PREFIX, context);
    }

    public static void setToolKitNameProperty(NodeBuilder nodeBuilder, String toolKitName) {
        nodeBuilder.properties().custom()
                .metadata().label(TOOL_KIT_NAME_PROPERTY_LABEL).description(TOOL_KIT_NAME_DESCRIPTION).stepOut()
                .typeWithScope(ValueType.IDENTIFIER, GLOBAL_SCOPE).value(toolKitName)
                .editable().stepOut().addProperty(TOOL_KIT_NAME_PROPERTY);
    }

    public static void setPermittedToolsProperty(NodeBuilder nodeBuilder, String permittedTools) {
        if (permittedTools != null) {
            nodeBuilder.properties().custom()
                    .codedata().kind(Kind.INCLUDED_FIELD.name()).originalName(PERMITTED_TOOLS_PROPERTY).stepOut()
                    .placeholder("()").hidden().value(permittedTools).editable().stepOut()
                    .addProperty(PERMITTED_TOOLS_PROPERTY);
        } else {
            nodeBuilder.properties().custom()
                    .codedata().kind(Kind.INCLUDED_FIELD.name()).originalName(PERMITTED_TOOLS_PROPERTY).stepOut()
                    .placeholder("()").hidden().editable().stepOut()
                    .addProperty(PERMITTED_TOOLS_PROPERTY);
        }
    }

    public static void setToolScopesProperty(NodeBuilder nodeBuilder, String toolScopes) {
        if (toolScopes != null) {
            nodeBuilder.properties().custom()
                    .metadata().label(TOOL_SCOPES_PROPERTY_LABEL).description(TOOL_SCOPES_DESCRIPTION).stepOut()
                    .codedata().kind(Kind.INCLUDED_FIELD.name()).originalName(TOOL_SCOPES_PROPERTY).stepOut()
                    .placeholder("()").hidden().value(toolScopes).editable().stepOut()
                    .addProperty(TOOL_SCOPES_PROPERTY);
        } else {
            nodeBuilder.properties().custom()
                    .metadata().label(TOOL_SCOPES_PROPERTY_LABEL).description(TOOL_SCOPES_DESCRIPTION).stepOut()
                    .codedata().kind(Kind.INCLUDED_FIELD.name()).originalName(TOOL_SCOPES_PROPERTY).stepOut()
                    .placeholder("()").hidden().editable().stepOut()
                    .addProperty(TOOL_SCOPES_PROPERTY);
        }
    }

    public static void setIncludeContextProperty(NodeBuilder nodeBuilder) {
        nodeBuilder.properties().custom()
                .metadata().label("Pass agent context").description("Pass the invoking agent's context to MCP tools")
                .stepOut()
                .codedata().kind(Kind.INCLUDED_FIELD.name()).originalName(INCLUDE_CONTEXT_PROPERTY).stepOut()
                .hidden().value(true).editable().stepOut()
                .addProperty(INCLUDE_CONTEXT_PROPERTY);
    }

    /**
     * Records how the MCP server presents itself, so the generated toolkit class carries it as
     * {@code @display {label, iconPath}}. Either value may be absent.
     */
    public static void setDisplayProperties(NodeBuilder nodeBuilder, String label, String icon) {
        if (label != null && !label.isBlank()) {
            nodeBuilder.properties().custom()
                    .metadata().label("MCP Server Name").description("How the MCP server names itself").stepOut()
                    .value(label).hidden().optional(true).editable().stepOut()
                    .addProperty(TOOL_KIT_LABEL_PROPERTY);
        }
        if (icon != null && !icon.isBlank()) {
            nodeBuilder.properties().custom()
                    .metadata().label("MCP Server Icon").description("The icon the MCP server advertises").stepOut()
                    .value(icon).hidden().optional(true).editable().stepOut()
                    .addProperty(TOOL_KIT_ICON_PROPERTY);
        }
    }

    private boolean hasCompatibleAiVersion(String aiModuleVersion) {
        // checks if aiModule version is latest or have required features implemented in ai module
        return aiModuleVersion == null || AiUtils.compareSemver(aiModuleVersion, MINIMUM_COMPATIBLE_AI_VERSION) >= 0;
    }

    private static boolean supportsMcpV2(String aiModuleVersion) {
        // A missing version means the latest ai module will be pulled
        return aiModuleVersion == null || AiUtils.compareSemver(aiModuleVersion, MINIMUM_MCP_V2_AI_VERSION) >= 0;
    }

    private void setParameterProperties(Collection<ParameterData> parameters) {
        boolean onlyRestParams = parameters.size() == 1;
        for (ParameterData param : parameters) {
            // Skip irrelevant parameter kinds
            if (param.kind() == Kind.PARAM_FOR_TYPE_INFER || param.kind() == Kind.INCLUDED_RECORD) {
                continue;
            }

            String unescapedName = ParamUtils.removeLeadingSingleQuote(param.name());
            String label = (param.label() == null || param.label().isEmpty()) ? unescapedName : param.label();
            Property.Builder<FormBuilder<NodeBuilder>> builder = properties().custom()
                    .metadata().label(label).description(param.description()).stepOut()
                    .codedata()
                        .kind(param.kind().name())
                        .originalName(param.name())
                        .stepOut()
                    .placeholder(param.placeholder())
                    .defaultValue(param.defaultValue())
                    .editable()
                    .optional(param.optional())
                    .advanced(param.advanced());

            // Configure property type & defaultability by parameter kind
            switch (param.kind()) {
                case INCLUDED_RECORD_REST -> {
                    applyRestDefaultability(builder, onlyRestParams);
                    unescapedName = "additionalValues";
                    Property template = builder.buildRepeatableTemplates(param.typeSymbol(),
                            semanticModel, moduleInfo);
                    builder.type()
                            .fieldType(Property.ValueType.REPEATABLE_MAP)
                            .ballerinaType(param.type())
                            .template(template)
                            .selected(true)
                            .stepOut();
                }
                case REST_PARAMETER -> {
                    applyRestDefaultability(builder, onlyRestParams);
                    Property template = builder.buildRepeatableTemplates(param.typeSymbol(),
                            semanticModel, moduleInfo);
                    builder.type()
                            .fieldType(Property.ValueType.REPEATABLE_LIST)
                            .ballerinaType(param.type())
                            .template(template)
                            .selected(true)
                            .stepOut();
                }
                default -> builder.typeWithExpression(param.typeSymbol(), moduleInfo);
            }
            builder.stepOut().addProperty(FlowNodeUtil.getPropertyKey(unescapedName));
        }
    }

    private void applyRestDefaultability(Property.Builder<FormBuilder<NodeBuilder>> builder, boolean onlyRestParam) {
        if (onlyRestParam) {
            builder.optional(false).advanced(false);
        }
    }

    private void setReturnType(String returnType, TemplateContext context) {
        properties().type(returnType, false, null, true, RESULT_TYPE_LABEL)
                .data(returnType, context.getAllVisibleSymbolNames(), RESULT_NAME, RESULT_DOC, false);
    }

    @Override
    public Map<Path, List<TextEdit>> toSource(SourceBuilder sourceBuilder) {

        Map<String, Object> data = sourceBuilder.flowNode.codedata().data();
        boolean agentDefinitionMcpToolKit = data != null && data.containsKey(AGENT_DEFINITION_MCP_TOOL_KIT);
        Path connectionsFilePath = agentDefinitionMcpToolKit
                ? sourceBuilder.filePath
                : sourceBuilder.workspaceManager.projectRoot(sourceBuilder.filePath).resolve(CONNECTIONS_BAL);
        Range defaultRange = getDefaultLineRange(sourceBuilder, connectionsFilePath);

        if (!agentDefinitionMcpToolKit
                && (sourceBuilder.flowNode.codedata().isNew() == null || !sourceBuilder.flowNode.codedata().isNew())) {
            connectionsFilePath = sourceBuilder.workspaceManager.projectRoot(sourceBuilder.filePath)
                    .resolve(sourceBuilder.flowNode.codedata().lineRange().fileName());
            LineRange lineRange = sourceBuilder.flowNode.codedata().lineRange();
            defaultRange = CommonUtils.toRange(lineRange);
        }

        Set<String> ignoredProperties = new HashSet<>(Set.of(VARIABLE_KEY, TYPE_KEY, SCOPE_KEY, CHECK_ERROR_KEY,
                TOOL_KIT_LABEL_PROPERTY, TOOL_KIT_ICON_PROPERTY));
        String displayLabel = stringValue(sourceBuilder.flowNode.properties().remove(TOOL_KIT_LABEL_PROPERTY));
        String displayIcon = stringValue(sourceBuilder.flowNode.properties().remove(TOOL_KIT_ICON_PROPERTY));
        Property toolKitNameProperty = getToolKitNameProperty(sourceBuilder.flowNode);
        if (toolKitNameProperty == null) {
            // Generate the following code
            // ```final ai:McpToolKit aiMcpToolkit = new ("http://...")```
            ignoredProperties.add(TOOL_KIT_NAME_PROPERTY);
            sourceBuilder.token().keyword(SyntaxKind.FINAL_KEYWORD).stepOut().newVariable()
                    .token().keyword(SyntaxKind.CHECK_KEYWORD).keyword(SyntaxKind.NEW_KEYWORD).stepOut()
                    .functionParameters(sourceBuilder.flowNode, ignoredProperties)
                    .acceptImport().textEdit(SourceBuilder.SourceKind.STATEMENT, connectionsFilePath, defaultRange);
            return sourceBuilder.build();
        } else {
            // 1. Generate the MCP toolkit class in user code
            Property permittedToolsProperty = sourceBuilder.flowNode.properties().get(PERMITTED_TOOLS_PROPERTY);
            String permittedTools = permittedToolsProperty.value() instanceof String
                    ? (String) permittedToolsProperty.value()
                    : "()";
            String toolKitName = String.valueOf(toolKitNameProperty.value());

            Map<String, List<String>> toolScopesMap = parseToolScopes(sourceBuilder.flowNode);
            boolean includeContext = parseIncludeContext(sourceBuilder.flowNode);
            boolean mcpV2 = data != null && MCP_PROTOCOL_V2.equals(data.get(MCP_PROTOCOL_KEY));
            if (mcpV2) {
                // The init method takes auth inside httpConfig, where the form has already put it
                ignoredProperties.add(AUTH_PROPERTY);
            }

            // Check if class definition data exists in codedata
            Map<Path, List<TextEdit>> classTextEdits = null;
            if (data != null && data.containsKey(MCP_CLASS_DEFINITION)) {
                Object classDefinitionCodedata = data.get(MCP_CLASS_DEFINITION);
                Codedata codedata = gson.fromJson(gson.toJsonTree(classDefinitionCodedata),
                        Codedata.class);
                LineRange lineRange = codedata.lineRange();

                // Use a separate SourceBuilder for the class file so imports target the correct file
                Path classFilePath = sourceBuilder.workspaceManager.projectRoot(sourceBuilder.filePath)
                        .resolve(lineRange.fileName());
                Range classRange = CommonUtils.toRange(lineRange);
                SourceBuilder classSourceBuilder = new SourceBuilder(sourceBuilder.flowNode,
                        sourceBuilder.workspaceManager, classFilePath);

                String sourceCode = displayAnnotation(displayLabel, displayIcon) + generateClassSource(
                        classSourceBuilder, toolKitName, permittedTools, toolScopesMap, includeContext, mcpV2);
                classSourceBuilder.token().source(sourceCode).skipFormatting().stepOut()
                        .textEdit(SourceBuilder.SourceKind.STATEMENT, classFilePath, classRange);
                classTextEdits = classSourceBuilder.build();
            } else {
                // Use default agents.bal location
                String sourceCode = displayAnnotation(displayLabel, displayIcon) + generateClassSource(
                        sourceBuilder, toolKitName, permittedTools, toolScopesMap, includeContext, mcpV2);
                sourceBuilder.token().source(sourceCode).skipFormatting().stepOut().textEdit();
            }

            // 2. Initialize an instance of that class
            sourceBuilder.flowNode.properties().remove(TOOL_KIT_NAME_PROPERTY);
            sourceBuilder.flowNode.properties().remove(PERMITTED_TOOLS_PROPERTY);
            sourceBuilder.flowNode.properties().remove(TOOL_SCOPES_PROPERTY);
            sourceBuilder.flowNode.properties().remove(INCLUDE_CONTEXT_PROPERTY);
            sourceBuilder.flowNode.properties().remove(TYPE_KEY);
            sourceBuilder.flowNode.properties().put(TYPE_KEY, toolKitNameProperty);
            sourceBuilder.token().keyword(SyntaxKind.FINAL_KEYWORD).stepOut().newVariable()
                    .token().keyword(SyntaxKind.CHECK_KEYWORD).keyword(SyntaxKind.NEW_KEYWORD).stepOut()
                    .functionParameters(sourceBuilder.flowNode, ignoredProperties);

            Map<Path, List<TextEdit>> result =
                    sourceBuilder.textEdit(SourceBuilder.SourceKind.STATEMENT, connectionsFilePath,
                            defaultRange).build();
            if (classTextEdits != null) {
                combineTextEdits(classTextEdits, result);
            }
            return result;
        }
    }

    private static Range getDefaultLineRange(SourceBuilder sourceBuilder, Path connectionsFilePath) {
        Range defaultRange;
        try {
            sourceBuilder.workspaceManager.loadProject(sourceBuilder.filePath);
            Document document = FileSystemUtils.getDocument(sourceBuilder.workspaceManager, connectionsFilePath);
            // If the file exists, get the end of the file
            defaultRange = CommonUtils.toRange(document.syntaxTree().rootNode().lineRange().endLine());
        } catch (WorkspaceDocumentException | EventSyncException e) {
            throw new RuntimeException(e);
        }
        return defaultRange;
    }

    private static String stringValue(Property property) {
        if (property == null || !(property.value() instanceof String value)) {
            return null;
        }
        String unquoted = value.strip();
        if (unquoted.length() >= 2 && unquoted.startsWith("\"") && unquoted.endsWith("\"")) {
            unquoted = unquoted.substring(1, unquoted.length() - 1);
        }
        return unquoted.isBlank() ? null : unquoted;
    }

    /**
     * The {@code @display} annotation that names the toolkit class after its MCP server and carries the
     * server's icon; empty when the server stated neither.
     */
    static String displayAnnotation(String label, String icon) {
        if (label == null && icon == null) {
            return "";
        }
        StringBuilder annotation = new StringBuilder("@display {label: ")
                .append(toStringLiteral(label == null ? "" : label));
        if (icon != null) {
            annotation.append(", iconPath: ").append(toStringLiteral(icon));
        }
        return annotation.append("}").append(NEW_LINE).toString();
    }

    private static String toStringLiteral(String value) {
        StringBuilder literal = new StringBuilder("\"");
        value.codePoints().forEach(codePoint -> {
            switch (codePoint) {
                case '"' -> literal.append("\\\"");
                case '\\' -> literal.append("\\\\");
                case '\n' -> literal.append("\\n");
                case '\r' -> literal.append("\\r");
                case '\t' -> literal.append("\\t");
                default -> {
                    if (Character.isISOControl(codePoint)) {
                        literal.append("\\u{").append(Integer.toHexString(codePoint)).append("}");
                    } else {
                        literal.appendCodePoint(codePoint);
                    }
                }
            }
        });
        return literal.append("\"").toString();
    }

    private static Property getToolKitNameProperty(FlowNode flowNode) {
        try {
            return flowNode.properties().get(TOOL_KIT_NAME_PROPERTY);
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * Generates the toolkit class and records the imports it needs on the builder that writes it.
     */
    private String generateClassSource(SourceBuilder classSourceBuilder, String className, String permittedTools,
                                       Map<String, List<String>> toolScopesMap, boolean includeContext,
                                       boolean mcpV2) {
        if (mcpV2) {
            classSourceBuilder.acceptImport(Ai.BALLERINA_ORG, Ai.AI_PACKAGE);
            String mcpV2Qualifier = classSourceBuilder.referenceQualifier(Ai.BALLERINA_ORG, Ai.MCP_V2_MODULE,
                    MCP_V2_IMPORT_PREFIX);
            return generateMcpV2ToolKitClassSource(className, permittedTools, toolScopesMap, includeContext,
                    mcpV2Qualifier);
        }
        classSourceBuilder.acceptImport(Ai.BALLERINA_ORG, Ai.MCP_PACKAGE);
        classSourceBuilder.acceptImport(Ai.BALLERINA_ORG, Ai.AI_PACKAGE);
        // OAuth scopes require log (error logging) and http (auth config) in generated code
        if (!toolScopesMap.isEmpty()) {
            classSourceBuilder.acceptImport(Ai.BALLERINA_ORG, Ai.LOG_PACKAGE);
            classSourceBuilder.acceptImport(Ai.BALLERINA_ORG, Ai.HTTP_PACKAGE);
        }
        return generateMcpToolKitClassSource(className, permittedTools, toolScopesMap, includeContext);
    }

    /**
     * Generates a toolkit class on the mcp.v2 client. Its config is always {@code ai:McpStreamableHttpClientConfig},
     * whose {@code httpConfig.auth} also accepts agent identity, so the class is not regenerated with another config
     * type when tool scopes are added or removed.
     */
    private String generateMcpV2ToolKitClassSource(String className, String permittedTools,
                                                   Map<String, List<String>> toolScopesMap, boolean includeContext,
                                                   String mcpV2Prefix) {
        String permittedToolsDeclaration;
        String toolsArgument;
        String toolFunctions;
        if (permittedTools.equals("()") || permittedTools.isBlank()) {
            permittedToolsDeclaration = "";
            toolsArgument = "self.callTool";
            toolFunctions = getMcpV2ToolMethodSignature("callTool", toolScopesMap.getOrDefault("callTool", List.of()),
                    includeContext, mcpV2Prefix);
        } else {
            Map<String, String> toolMapping = generatePermittedToolsMapping(permittedTools);
            String permittedToolsMappingConstructorExp = toolMapping.entrySet().stream()
                    .map(e -> "                " + e.getKey() + " : self." + e.getValue())
                    .collect(Collectors.joining("," + System.lineSeparator()));
            permittedToolsDeclaration = "        final map<ai:FunctionTool> permittedTools = {" + NEW_LINE +
                    permittedToolsMappingConstructorExp + NEW_LINE +
                    "        };" + NEW_LINE + NEW_LINE;
            toolsArgument = "permittedTools";
            toolFunctions = toolMapping.entrySet().stream()
                    .map(e -> getMcpV2ToolMethodSignature(e.getValue(),
                            toolScopesMap.getOrDefault(e.getKey().replaceAll("^\"|\"$", ""), List.of()),
                            includeContext, mcpV2Prefix))
                    .collect(Collectors.joining(System.lineSeparator()));
        }

        // The mcp.v2 client does not accept agent identity, so it is taken out of the config and passed to
        // ai:getPermittedMcpToolConfigs instead
        return "isolated class " + className + " {" + NEW_LINE +
                "    *ai:McpBaseToolKit;" + NEW_LINE +
                "    private final " + mcpV2Prefix + "StreamableHttpClient mcpClient;" + NEW_LINE +
                "    private final readonly & ai:ToolConfig[] tools;" + NEW_LINE + NEW_LINE +
                "    public isolated function init(string serverUrl," +
                " " + mcpV2Prefix + "Implementation info = " + MCP_V2_DEFAULT_INFO + "," + NEW_LINE +
                "            *ai:" + AI_MCP_V2_CLIENT_CONFIG_TYPE + " config) returns ai:Error? {" + NEW_LINE +
                permittedToolsDeclaration +
                "        do {" + NEW_LINE +
                "            ai:" + AI_MCP_V2_CLIENT_CONFIG_TYPE + " {httpConfig, ...clientConfig} = config;" +
                NEW_LINE +
                "            ai:McpHttpClientConfig {auth, ...httpSettings} = httpConfig;" + NEW_LINE +
                "            " + mcpV2Prefix + "HttpClientConfig mcpHttpConfig = {...httpSettings};" + NEW_LINE +
                "            ai:AgentIdAuthConfig? agentIdAuth = ();" + NEW_LINE +
                "            if auth is ai:AgentIdAuthConfig {" + NEW_LINE +
                "                agentIdAuth = auth;" + NEW_LINE +
                "            } else {" + NEW_LINE +
                "                mcpHttpConfig.auth = auth;" + NEW_LINE +
                "            }" + NEW_LINE +
                "            self.mcpClient = check new " + mcpV2Prefix + "StreamableHttpClient(serverUrl, " +
                "{...clientConfig, httpConfig: mcpHttpConfig});" + NEW_LINE +
                "            self.tools = check ai:getPermittedMcpToolConfigs(self.mcpClient, " +
                "info, " + toolsArgument + ", agentIdAuth).cloneReadOnly();" + NEW_LINE +
                "        } on fail error e {" + NEW_LINE +
                "            return error ai:Error(\"Failed to initialize MCP toolkit\", e);" + NEW_LINE +
                "        }" + NEW_LINE +
                "    }" + NEW_LINE + NEW_LINE +
                "    public isolated function getTools() returns ai:ToolConfig[] => self.tools;" + NEW_LINE +
                NEW_LINE +
                toolFunctions +
                "}" + NEW_LINE;
    }

    // A tool with scopes sends the access token the agent obtained for it, as in the mcp (v1) toolkit
    private String getMcpV2ToolMethodSignature(String toolName, List<String> scopes, boolean includeContext,
                                               String mcpV2Prefix) {
        boolean hasScopes = scopes != null && !scopes.isEmpty();
        String annotation = hasScopes
                ? "    @ai:AgentTool {" + NEW_LINE +
                        "        auth: {" + NEW_LINE +
                        "            scopes: [" + scopes.stream().map(s -> "\"" + s + "\"")
                                .collect(Collectors.joining(", ")) + "]" + NEW_LINE +
                        "        }" + NEW_LINE +
                        "    }" + NEW_LINE
                : "    @ai:AgentTool" + NEW_LINE;
        String callTool = hasScopes
                ? "self.mcpClient->callTool(params, headers = {\"Authorization\": " +
                        "string `Bearer ${check ctx.getAccessToken(params.name)}`})"
                : "self.mcpClient->callTool(params)";
        return annotation +
                "    public isolated function " + toolName + "(" +
                (includeContext || hasScopes ? "ai:Context ctx, " : "") +
                mcpV2Prefix + "CallToolParams params) returns " + mcpV2Prefix + "CallToolResult|error {" + NEW_LINE +
                "        return " + callTool + ";" + NEW_LINE +
                "    }" + NEW_LINE;
    }

    private String generateMcpToolKitClassSource(String className, String permittedTools,
                                                 Map<String, List<String>> toolScopesMap,
                                                 boolean includeContext) {
        String initBody;
        String toolFunctions;
        boolean hasAnyScopes = !toolScopesMap.isEmpty();

        if (permittedTools.equals("()") || permittedTools.isBlank()) {
            // Generate init body using self.callTool as function reference
            if (hasAnyScopes) {
                initBody = "        do {" + NEW_LINE +
                        "            ai:StreamableHttpClientTransportConfig{auth, ...configs} = config;" + NEW_LINE +
                        "            mcp:StreamableHttpClientTransportConfig mcpConfig = {...configs};" + NEW_LINE +
                        "            ai:AgentIdAuthConfig? agentIdAuth = ();" + NEW_LINE +
                        "            if auth is http:ClientAuthConfig {" + NEW_LINE +
                        "                mcpConfig.auth = auth;" + NEW_LINE +
                        "                auth = ();" + NEW_LINE +
                        "            } else {" + NEW_LINE +
                        "                agentIdAuth = auth;" + NEW_LINE +
                        "            }" + NEW_LINE +
                        "            self.mcpClient = check new mcp:StreamableHttpClient(serverUrl, mcpConfig);" +
                        NEW_LINE +
                        "            self.tools = check ai:getPermittedMcpToolConfigs(self.mcpClient, info, " +
                        "self.callTool, agentIdAuth).cloneReadOnly();" + NEW_LINE +
                        "        } on fail error e {" + NEW_LINE +
                        "            log:printError(\"Error initializing MCP toolkit\", e);" + NEW_LINE +
                        "            return error ai:Error(\"Failed to initialize MCP toolkit\", e);" + NEW_LINE +
                        "        }";
            } else {
                initBody = "        do {" + NEW_LINE +
                        "            self.mcpClient = check new mcp:StreamableHttpClient(serverUrl, config);" +
                        NEW_LINE +
                        "            self.tools = check ai:getPermittedMcpToolConfigs(self.mcpClient, info, " +
                        "self.callTool).cloneReadOnly();" + NEW_LINE +
                        "        } on fail error e {" + NEW_LINE +
                        "            return error ai:Error(\"Failed to initialize MCP toolkit\", e);" + NEW_LINE +
                        "        }";
            }

            // Generate callTool method
            List<String> callToolScopes = toolScopesMap.getOrDefault("callTool", List.of());
            toolFunctions = getToolMethodSignature("callTool", callToolScopes, includeContext);
        } else {
            // Generate init body with permitted tools mapping
            Map<String, String> toolMapping = generatePermittedToolsMapping(permittedTools);
            String permittedToolsMappingConstructorExp = toolMapping.entrySet().stream()
                    .map(e -> "                " + e.getKey() + " : self." + e.getValue())
                    .collect(Collectors.joining("," + System.lineSeparator()));

            if (hasAnyScopes) {
                initBody = "        final map<ai:FunctionTool> permittedTools = {" + NEW_LINE +
                        permittedToolsMappingConstructorExp + NEW_LINE +
                        "        };" + NEW_LINE + NEW_LINE +
                        "        do {" + NEW_LINE +
                        "            ai:StreamableHttpClientTransportConfig{auth, ...configs} = config;" + NEW_LINE +
                        "            mcp:StreamableHttpClientTransportConfig mcpConfig = {...configs};" + NEW_LINE +
                        "            ai:AgentIdAuthConfig? agentIdAuth = ();" + NEW_LINE +
                        "            if auth is http:ClientAuthConfig {" + NEW_LINE +
                        "                mcpConfig.auth = auth;" + NEW_LINE +
                        "                auth = ();" + NEW_LINE +
                        "            } else {" + NEW_LINE +
                        "                agentIdAuth = auth;" + NEW_LINE +
                        "            }" + NEW_LINE +
                        "            self.mcpClient = check new mcp:StreamableHttpClient(serverUrl, mcpConfig);" +
                        NEW_LINE +
                        "            self.tools = check ai:getPermittedMcpToolConfigs(self.mcpClient, info, " +
                        "permittedTools, agentIdAuth).cloneReadOnly();" + NEW_LINE +
                        "        } on fail error e {" + NEW_LINE +
                        "            log:printError(\"Error initializing MCP toolkit\", e);" + NEW_LINE +
                        "            return error ai:Error(\"Failed to initialize MCP toolkit\", e);" + NEW_LINE +
                        "        }";
            } else {
                initBody = "        final map<ai:FunctionTool> permittedTools = {" + NEW_LINE +
                        permittedToolsMappingConstructorExp + NEW_LINE +
                        "        };" + NEW_LINE + NEW_LINE +
                        "        do {" + NEW_LINE +
                        "            self.mcpClient = check new mcp:StreamableHttpClient(serverUrl, config);" +
                        NEW_LINE +
                        "            self.tools = check ai:getPermittedMcpToolConfigs(self.mcpClient, info, " +
                        "permittedTools).cloneReadOnly();" + NEW_LINE +
                        "        } on fail error e {" + NEW_LINE +
                        "            return error ai:Error(\"Failed to initialize MCP toolkit\", e);" + NEW_LINE +
                        "        }";
            }

            // Generate individual tool methods
            toolFunctions = toolMapping.entrySet().stream()
                    .map(e -> {
                        String originalToolName = e.getKey();
                        String methodName = e.getValue();
                        // Strip surrounding quotes from tool name for scope lookup
                        // (permittedTools keys retain quotes like "toolName", but toolScopes keys don't)
                        String unquotedToolName = originalToolName.replaceAll("^\"|\"$", "");
                        List<String> scopes = toolScopesMap.getOrDefault(unquotedToolName, List.of());
                        return getToolMethodSignature(methodName, scopes, includeContext);
                    })
                    .collect(Collectors.joining(System.lineSeparator()));
        }

        String configType = hasAnyScopes ? "ai:StreamableHttpClientTransportConfig"
                : "mcp:StreamableHttpClientTransportConfig";

        return "isolated class " + className + " {" + NEW_LINE +
                "    *ai:McpBaseToolKit;" + NEW_LINE +
                "    private final mcp:StreamableHttpClient mcpClient;" + NEW_LINE +
                "    private final readonly & ai:ToolConfig[] tools;" + NEW_LINE + NEW_LINE +
                "    public isolated function init(string serverUrl," +
                " mcp:Implementation info = {name: \"MCP\", version: \"1.0.0\"}," + NEW_LINE +
                "            *" + configType + " config) returns ai:Error? {" + NEW_LINE +
                initBody +
                NEW_LINE + "    }" + NEW_LINE + NEW_LINE +
                "    public isolated function getTools() returns ai:ToolConfig[] => self.tools;" + NEW_LINE +
                NEW_LINE +
                toolFunctions +
                "}" + NEW_LINE;
    }

    private String getToolMethodSignature(String toolName, List<String> scopes, boolean includeContext) {
        boolean hasScopes = scopes != null && !scopes.isEmpty();
        boolean requiresContext = includeContext || hasScopes;

        StringBuilder sb = new StringBuilder();
        if (hasScopes) {
            String scopesList = scopes.stream()
                    .map(s -> "\"" + s + "\"")
                    .collect(Collectors.joining(", "));
            sb.append("    @ai:AgentTool {").append(NEW_LINE)
                    .append("        auth: {").append(NEW_LINE)
                    .append("            scopes: [").append(scopesList).append("]").append(NEW_LINE)
                    .append("        }").append(NEW_LINE)
                    .append("    }").append(NEW_LINE);
        } else {
            sb.append("    @ai:AgentTool").append(NEW_LINE);
        }

        if (hasScopes) {
            sb.append("    public isolated function ").append(toolName)
                    .append("(ai:Context ctx, mcp:CallToolParams params)")
                    .append(" returns mcp:CallToolResult|error {").append(NEW_LINE)
                    .append("        return self.mcpClient->callTool(params, headers = {\"Authorization\": ")
                    .append("string `Bearer ${check ctx.getAccessToken(params.name)}`});").append(NEW_LINE)
                    .append("    }").append(NEW_LINE);
        } else {
            sb.append("    public isolated function ").append(toolName).append("(")
                    .append(requiresContext ? "ai:Context ctx, " : "")
                    .append("mcp:CallToolParams params)")
                    .append(" returns mcp:CallToolResult|error {").append(NEW_LINE)
                    .append("        return self.mcpClient->callTool(params);").append(NEW_LINE)
                    .append("    }").append(NEW_LINE);
        }

        return sb.toString();
    }

    private Map<String, String> generatePermittedToolsMapping(String permittedTools) {
        if (permittedTools == null || permittedTools.isBlank() || permittedTools.equals("()")) {
            return Map.of();
        }
        String cleanedTools = permittedTools.trim()
                .replaceAll("^\\[|]$", "");
        return java.util.Arrays.stream(cleanedTools.split(","))
                .map(String::trim)
                .filter(tool -> !tool.isEmpty())
                .collect(Collectors.toMap(name -> name, this::toMethodName));
    }

    private String toMethodName(String toolName) {
        if (toolName == null || toolName.isBlank()) {
            throw new IllegalArgumentException("Input cannot be null or blank");
        }

        // If it's already a valid identifier and not a reserved word, return as-is
        Set<String> predefinedMembers = Set.of("init", "getTools", "mcpClient", "tools");
        if (SyntaxInfo.isIdentifier(toolName) &&
                !SyntaxInfo.isKeyword(toolName) && !predefinedMembers.contains(toolName)) {
            return toolName;
        }

        // Otherwise, generate a method name from the input
        String[] parts = toolName.split("\\s+");
        if (parts.length == 0) {
            throw new IllegalArgumentException("Tool name contains only whitespace");
        }
        StringBuilder sb = new StringBuilder(parts[0].toLowerCase(Locale.UK));
        for (int i = 1; i < parts.length; i++) {
            String part = parts[i];
            if (!part.isEmpty()) {
                sb.append(Character.toUpperCase(part.charAt(0)))
                        .append(part.substring(1).toLowerCase(Locale.UK));
            }
        }
        String methodName = sb.toString();

        // Replace invalid characters with underscores first
        methodName = methodName.chars()
                .mapToObj(c -> Character.isJavaIdentifierPart(c) ? String.valueOf((char) c) : "_")
                .collect(Collectors.joining());

        // Strip leading and trailing underscores that came from invalid characters
        methodName = methodName.replaceAll("^_+|_+$", "");

        // Check if the result is empty after stripping
        if (methodName.isEmpty()) {
            methodName = "_";
        }

        // Then check if we need a leading underscore
        if (!Character.isJavaIdentifierStart(methodName.charAt(0))) {
            methodName = "_" + methodName;
        }

        if (SyntaxInfo.isKeyword(methodName) || predefinedMembers.contains(methodName)) {
            methodName = "'" + methodName;
        }
        return methodName;
    }

    private static Map<String, List<String>> parseToolScopes(FlowNode flowNode) {
        Property toolScopesProperty = flowNode.properties().get(TOOL_SCOPES_PROPERTY);
        if (toolScopesProperty == null || !(toolScopesProperty.value() instanceof String value)
                || value.isBlank() || value.equals("()")) {
            return Collections.emptyMap();
        }
        try {
            JsonObject jsonObject = gson.fromJson(value, JsonObject.class);
            Map<String, List<String>> result = new HashMap<>();
            for (Map.Entry<String, JsonElement> entry : jsonObject.entrySet()) {
                JsonElement entryValue = entry.getValue();
                if (!entryValue.isJsonArray()) {
                    continue;
                }
                List<String> scopes = new ArrayList<>();
                for (JsonElement element : entryValue.getAsJsonArray()) {
                    if (element.isJsonPrimitive()) {
                        scopes.add(element.getAsString());
                    }
                }
                if (!scopes.isEmpty()) {
                    result.put(entry.getKey(), scopes);
                }
            }
            return result;
        } catch (JsonSyntaxException | IllegalStateException e) {
            return Collections.emptyMap();
        }
    }

    private static boolean parseIncludeContext(FlowNode flowNode) {
        Property includeContextProperty = flowNode.properties().get(INCLUDE_CONTEXT_PROPERTY);
        return includeContextProperty != null && Boolean.parseBoolean(String.valueOf(includeContextProperty.value()));
    }

    private static void combineTextEdits(Map<Path, List<TextEdit>> source,
                                          Map<Path, List<TextEdit>> target) {
        for (Map.Entry<Path, List<TextEdit>> sourceEntry : source.entrySet()) {
            Path path = sourceEntry.getKey();
            List<TextEdit> targetTextEdits = target.get(path);
            if (targetTextEdits == null) {
                target.put(path, sourceEntry.getValue());
            } else {
                targetTextEdits.addAll(sourceEntry.getValue());
            }
        }
    }

    private String getAiModuleVersion(TemplateContext context) {
        try {
            Project project = context.workspaceManager().loadProject(context.filePath());
            return AiUtils.getProjectPackageVersion(project, Ai.AI_PACKAGE);
        } catch (WorkspaceDocumentException | EventSyncException e) {
            return null;
        }
    }

    /**
     * The ai package and its compilation, which the ai types and their default values are read from.
     *
     * @param semanticModel        resolves the ai types by name
     * @param aiPackage            the ai package
     * @param declaringModuleModel the semantic model of an ai module, used to resolve enum defaults
     */
    private record AiTypeSource(SemanticModel semanticModel, Package aiPackage,
                                Function<Module, SemanticModel> declaringModuleModel) {
    }

    // Loaded like the library of a function-based form: the bala of that version from the cache, Central or the
    // local repository, compiled as a package of its own. Empty when that version cannot be found
    private static Optional<AiTypeSource> getAiTypeSource(String aiVersion) {
        return PackageUtil.getModulePackage(PackageUtil.getSampleProject(), Ai.BALLERINA_ORG, Ai.AI_PACKAGE,
                aiVersion).map(aiPackage -> {
                    PackageCompilation compilation = PackageUtil.getCompilation(aiPackage);
                    return new AiTypeSource(compilation.getSemanticModel(aiPackage.getDefaultModule().moduleId()),
                            aiPackage, module -> compilation.getSemanticModel(module.moduleId()));
                });
    }

    private static TypeDefinitionSymbol getTypeDefinition(SemanticModel semanticModel, String moduleName,
                                                          String typeName, String aiVersion) {
        Optional<Symbol> symbol = semanticModel.types().getTypeByName(Ai.BALLERINA_ORG, moduleName, "", typeName);
        if (symbol.isPresent() && symbol.get() instanceof TypeDefinitionSymbol typeDefinition) {
            return typeDefinition;
        }
        throw new IllegalStateException(String.format("'%s:%s' is not found in ballerina/ai:%s", moduleName,
                typeName, aiVersion));
    }

    /**
     * Returns a type of the mcp.v2 module. The ai module's semantic model does not resolve types of the modules it
     * imports by name, so the mcp.v2 module is reached through the config record's fields, which use its types.
     */
    private static TypeDefinitionSymbol getMcpV2TypeDefinition(TypeDefinitionSymbol configType, String typeName,
                                                               String aiVersion) {
        RecordTypeSymbol recordType = (RecordTypeSymbol) CommonUtils.getRawType(configType.typeDescriptor());
        for (RecordFieldSymbol field : recordType.fieldDescriptors().values()) {
            TypeSymbol fieldType = field.typeDescriptor();
            List<TypeSymbol> candidates = fieldType instanceof UnionTypeSymbol union
                    ? union.memberTypeDescriptors() : List.of(fieldType);
            for (TypeSymbol candidate : candidates) {
                Optional<ModuleSymbol> module = candidate.getModule();
                if (module.isEmpty() || !Ai.MCP_V2_MODULE.equals(module.get().id().moduleName())) {
                    continue;
                }
                Optional<TypeDefinitionSymbol> typeDefinition = module.get().typeDefinitions().stream()
                        .filter(definition -> definition.getName().filter(typeName::equals).isPresent())
                        .findFirst();
                if (typeDefinition.isPresent()) {
                    return typeDefinition.get();
                }
            }
        }
        throw new IllegalStateException(String.format("'%s:%s' is not found through ballerina/ai:%s",
                Ai.MCP_V2_MODULE, typeName, aiVersion));
    }

    /**
     * Returns a parameter for each field of the included config record, as the function data builder does for an
     * included record parameter.
     */
    private List<ParameterData> getConfigFieldParameters(TypeDefinitionSymbol configType,
                                                         AiTypeSource aiTypeSource) {
        Map<String, String> fieldDocs = configType.documentation()
                .map(Documentation::parameterMap).orElse(Map.of());
        RecordTypeSymbol recordType = (RecordTypeSymbol) CommonUtils.getRawType(configType.typeDescriptor());
        List<ParameterData> parameters = new ArrayList<>();
        for (Map.Entry<String, RecordFieldSymbol> entry : recordType.fieldDescriptors().entrySet()) {
            parameters.add(getFieldParameter(entry.getKey(), entry.getValue(), fieldDocs, aiTypeSource));
        }
        return parameters;
    }

    /**
     * Returns a parameter for the {@code auth} field of the config's {@code httpConfig}. The form shows it on its own
     * so that authentication can be configured without opening the HTTP settings; the form keeps it in step with the
     * auth in {@code httpConfig}, which is what the generated code passes.
     */
    private ParameterData getHttpAuthParameter(TypeDefinitionSymbol configType, AiTypeSource aiTypeSource,
                                               String aiVersion) {
        RecordTypeSymbol configRecord = (RecordTypeSymbol) CommonUtils.getRawType(configType.typeDescriptor());
        RecordFieldSymbol httpConfigField = configRecord.fieldDescriptors().get(HTTP_CONFIG_PROPERTY);
        if (httpConfigField != null
                && CommonUtils.getRawType(httpConfigField.typeDescriptor()) instanceof RecordTypeSymbol httpRecord) {
            RecordFieldSymbol authField = httpRecord.fieldDescriptors().get(AUTH_PROPERTY);
            if (authField != null) {
                return getFieldParameter(AUTH_PROPERTY, authField, Map.of(), aiTypeSource);
            }
        }
        throw new IllegalStateException(String.format("'%s.%s' is not found in ai:%s of ballerina/ai:%s",
                HTTP_CONFIG_PROPERTY, AUTH_PROPERTY, AI_MCP_V2_CLIENT_CONFIG_TYPE, aiVersion));
    }

    private ParameterData getFieldParameter(String name, RecordFieldSymbol field, Map<String, String> fieldDocs,
                                            AiTypeSource aiTypeSource) {
        TypeSymbol fieldType = field.typeDescriptor();
        String description = field.documentation().flatMap(Documentation::description)
                .orElse(fieldDocs.getOrDefault(name, ""));
        String defaultValue = CommonUtils.resolveDefaultValue(field, aiTypeSource.declaringModuleModel(),
                aiTypeSource.aiPackage());
        return ParameterData.from(name, description, null,
                CommonUtils.getTypeSignature(aiTypeSource.semanticModel(), fieldType, false, moduleInfo),
                DefaultValueGeneratorUtil.getDefaultValueForType(CommonUtils.getRawType(fieldType)),
                defaultValue, Kind.INCLUDED_FIELD, field.isOptional() || field.hasDefaultValue(),
                field.isOptional(), false, CommonUtils.getImportStatements(fieldType, moduleInfo).orElse(null),
                fieldType);
    }
}
