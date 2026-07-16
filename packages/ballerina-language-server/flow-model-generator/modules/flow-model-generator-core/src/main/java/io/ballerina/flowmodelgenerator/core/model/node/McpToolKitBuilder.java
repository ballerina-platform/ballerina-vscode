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
import io.ballerina.compiler.syntax.tree.SyntaxInfo;
import io.ballerina.compiler.syntax.tree.SyntaxKind;
import io.ballerina.flowmodelgenerator.core.AiUtils;
import io.ballerina.flowmodelgenerator.core.model.Codedata;
import io.ballerina.flowmodelgenerator.core.model.FlowNode;
import io.ballerina.flowmodelgenerator.core.model.FormBuilder;
import io.ballerina.flowmodelgenerator.core.model.NodeBuilder;
import io.ballerina.flowmodelgenerator.core.model.Property;
import io.ballerina.flowmodelgenerator.core.model.SourceBuilder;
import io.ballerina.flowmodelgenerator.core.utils.FileSystemUtils;
import io.ballerina.flowmodelgenerator.core.utils.FlowNodeUtil;
import io.ballerina.flowmodelgenerator.core.utils.ParamUtils;
import io.ballerina.modelgenerator.commons.CommonUtils;
import io.ballerina.modelgenerator.commons.FunctionData;
import io.ballerina.modelgenerator.commons.FunctionDataBuilder;
import io.ballerina.modelgenerator.commons.ModuleInfo;
import io.ballerina.modelgenerator.commons.ParameterData;
import io.ballerina.projects.Document;
import io.ballerina.projects.Project;
import io.ballerina.tools.text.LineRange;
import org.ballerinalang.langserver.common.utils.NameUtil;
import org.ballerinalang.langserver.commons.eventsync.exceptions.EventSyncException;
import org.ballerinalang.langserver.commons.workspace.WorkspaceDocumentException;
import org.eclipse.lsp4j.Range;
import org.eclipse.lsp4j.TextEdit;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
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
    private static final String TOOL_SCOPES_PROPERTY_LABEL = "Tool Scopes";
    private static final String TOOL_SCOPES_DESCRIPTION = "OAuth scopes for each tool";
    private static final String AI_MCP_TOOL_KIT_CLASS = "McpToolKit";
    private static final String AI_MCP_BASE_TOOL_KIT_TYPE_WITH_PREFIX = "ai:McpBaseToolKit";
    private static final String INIT_METHOD_NAME = "init";
    private static final String MINIMUM_COMPATIBLE_AI_VERSION = "1.6.0";
    private static final String CONNECTIONS_BAL = "connections.bal";
    public static final String MCP_CLASS_DEFINITION = "mcpClassDefinition";
    public static final String AGENT_DEFINITION_MCP_TOOL_KIT = "agentDefinitionMcpToolKit";
    private static final Gson gson = new Gson();
    private static final String NEW_LINE = System.lineSeparator();

    @Override
    public void setConcreteConstData() {
        codedata().node(MCP_TOOL_KIT);
    }

    @Override
    public void setConcreteTemplateData(TemplateContext context) {
        String aiModuleVersion = getAiModuleVersion(context);
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

        setParameterProperties(functionData);

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

    private boolean hasCompatibleAiVersion(String aiModuleVersion) {
        // checks if aiModule version is latest or have required features implemented in ai module
        return aiModuleVersion == null || AiUtils.compareSemver(aiModuleVersion, MINIMUM_COMPATIBLE_AI_VERSION) >= 0;
    }

    private void setParameterProperties(FunctionData function) {
        boolean onlyRestParams = function.parameters().size() == 1;
        for (ParameterData param : function.parameters().values()) {
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
                    .defaultable(param.optional());

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
            builder.defaultable(false);
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

        Set<String> ignoredProperties =
                new HashSet<>(Set.of(VARIABLE_KEY, TYPE_KEY, SCOPE_KEY, CHECK_ERROR_KEY));
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
            String sourceCode = generateMcpToolKitClassSource(toolKitName, permittedTools, toolScopesMap);

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

                classSourceBuilder.acceptImport(Ai.BALLERINA_ORG, Ai.MCP_PACKAGE);
                classSourceBuilder.acceptImport(Ai.BALLERINA_ORG, Ai.AI_PACKAGE);
                // OAuth scopes require log (error logging) and http (auth config) in generated code
                if (!toolScopesMap.isEmpty()) {
                    classSourceBuilder.acceptImport(Ai.BALLERINA_ORG, Ai.LOG_PACKAGE);
                    classSourceBuilder.acceptImport(Ai.BALLERINA_ORG, Ai.HTTP_PACKAGE);
                }
                classSourceBuilder.token().source(sourceCode).skipFormatting().stepOut()
                        .textEdit(SourceBuilder.SourceKind.STATEMENT, classFilePath, classRange);
                classTextEdits = classSourceBuilder.build();
            } else {
                // Use default agents.bal location
                sourceBuilder.acceptImport(Ai.BALLERINA_ORG, Ai.MCP_PACKAGE);
                sourceBuilder.acceptImport(Ai.BALLERINA_ORG, Ai.AI_PACKAGE);
                // OAuth scopes require log (error logging) and http (auth config) in generated code
                if (!toolScopesMap.isEmpty()) {
                    sourceBuilder.acceptImport(Ai.BALLERINA_ORG, Ai.LOG_PACKAGE);
                    sourceBuilder.acceptImport(Ai.BALLERINA_ORG, Ai.HTTP_PACKAGE);
                }

                sourceBuilder.token().source(sourceCode).skipFormatting().stepOut().textEdit();
            }

            // 2. Initialize an instance of that class
            sourceBuilder.flowNode.properties().remove(TOOL_KIT_NAME_PROPERTY);
            sourceBuilder.flowNode.properties().remove(PERMITTED_TOOLS_PROPERTY);
            sourceBuilder.flowNode.properties().remove(TOOL_SCOPES_PROPERTY);
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

    private static Property getToolKitNameProperty(FlowNode flowNode) {
        try {
            return flowNode.properties().get(TOOL_KIT_NAME_PROPERTY);
        } catch (Exception e) {
            return null;
        }
    }

    private String generateMcpToolKitClassSource(String className, String permittedTools,
                                                 Map<String, List<String>> toolScopesMap) {
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
            toolFunctions = getToolMethodSignature("callTool", callToolScopes);
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
                        return getToolMethodSignature(methodName, scopes);
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

    private String getToolMethodSignature(String toolName, List<String> scopes) {
        boolean hasScopes = scopes != null && !scopes.isEmpty();

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
            sb.append("    public isolated function ").append(toolName).append("(mcp:CallToolParams params)")
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
            return AiUtils.getBallerinaAiModuleVersion(project);
        } catch (WorkspaceDocumentException | EventSyncException e) {
            return null;
        }
    }
}
