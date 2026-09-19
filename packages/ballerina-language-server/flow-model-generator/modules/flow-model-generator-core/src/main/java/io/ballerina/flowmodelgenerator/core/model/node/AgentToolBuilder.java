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

import com.google.gson.Gson;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.reflect.TypeToken;
import io.ballerina.compiler.api.ModuleID;
import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.api.symbols.ClassFieldSymbol;
import io.ballerina.compiler.api.symbols.ClassSymbol;
import io.ballerina.compiler.api.symbols.FunctionSymbol;
import io.ballerina.compiler.api.symbols.MethodSymbol;
import io.ballerina.compiler.api.symbols.ParameterSymbol;
import io.ballerina.compiler.api.symbols.Symbol;
import io.ballerina.compiler.api.symbols.SymbolKind;
import io.ballerina.compiler.api.symbols.TypeDescKind;
import io.ballerina.compiler.api.symbols.TypeSymbol;
import io.ballerina.compiler.api.symbols.UnionTypeSymbol;
import io.ballerina.compiler.api.symbols.VariableSymbol;
import io.ballerina.compiler.syntax.tree.ClassDefinitionNode;
import io.ballerina.compiler.syntax.tree.FunctionDefinitionNode;
import io.ballerina.compiler.syntax.tree.ModuleMemberDeclarationNode;
import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.compiler.syntax.tree.NonTerminalNode;
import io.ballerina.compiler.syntax.tree.SyntaxKind;
import io.ballerina.compiler.syntax.tree.Token;
import io.ballerina.compiler.syntax.tree.TypeDefinitionNode;
import io.ballerina.flowmodelgenerator.core.AiUtils;
import io.ballerina.flowmodelgenerator.core.ClassMemberManager;
import io.ballerina.flowmodelgenerator.core.Constants;
import io.ballerina.flowmodelgenerator.core.model.Codedata;
import io.ballerina.flowmodelgenerator.core.model.FlowNode;
import io.ballerina.flowmodelgenerator.core.model.FormBuilder;
import io.ballerina.flowmodelgenerator.core.model.NodeBuilder;
import io.ballerina.flowmodelgenerator.core.model.NodeKind;
import io.ballerina.flowmodelgenerator.core.model.Property;
import io.ballerina.flowmodelgenerator.core.model.PropertyCodedata;
import io.ballerina.flowmodelgenerator.core.model.SourceBuilder;
import io.ballerina.flowmodelgenerator.core.utils.FlowNodeUtil;
import io.ballerina.flowmodelgenerator.core.utils.ParamUtils;
import io.ballerina.modelgenerator.commons.CommonUtils;
import io.ballerina.modelgenerator.commons.FileSystemUtils;
import io.ballerina.modelgenerator.commons.ModuleInfo;
import io.ballerina.modelgenerator.commons.ParameterData;
import io.ballerina.projects.Document;
import io.ballerina.tools.diagnostics.Location;
import io.ballerina.tools.text.LinePosition;
import io.ballerina.tools.text.LineRange;
import org.ballerinalang.langserver.common.utils.CommonUtil;
import org.ballerinalang.langserver.common.utils.NameUtil;
import org.ballerinalang.langserver.commons.eventsync.exceptions.EventSyncException;
import org.ballerinalang.langserver.commons.workspace.WorkspaceDocumentException;
import org.ballerinalang.langserver.commons.workspace.WorkspaceManager;
import org.eclipse.lsp4j.Position;
import org.eclipse.lsp4j.Range;
import org.eclipse.lsp4j.TextEdit;

import java.lang.reflect.Type;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

import static io.ballerina.flowmodelgenerator.core.AgentsGenerator.TARGET_TYPE;
import static io.ballerina.flowmodelgenerator.core.Constants.BALLERINA;

public class AgentToolBuilder extends NodeBuilder {

    public static final String LABEL = "Agent Tool";
    public static final String DESCRIPTION = "Expose a function, action, or connection as an agent tool";

    public static final String WRAPPED_NODE_KEY = "node";
    public static final String CONNECTION_KEY = "connection";
    public static final String DESCRIPTION_KEY = "description";
    public static final String TOOL_KIND_KEY = "toolKind";
    public static final String AGENT_VAR_NAME_KEY = "agentVarName";
    public static final String AGENT_RECEIVER_KEY = "agentReceiver";
    public static final String INCLUDE_CONTEXT_KEY = "includeContext";
    public static final String HOST_CLASS_NAME_KEY = "hostClassName";
    public static final String RETURN_TYPE_KEY = "returnType";
    public static final String RETURN_TYPE_IMPORTS_KEY = "returnTypeImports";

    private static final String RUN = "run";
    private static final String RESPONSE_VAR = "response";
    private static final String CLASS_MEMBER_INDENT = "    ";
    private static final Gson gson = new Gson();
    private static final Type IMPORTS_TYPE = new TypeToken<Map<String, String>>() { }.getType();

    @Override
    public void setConcreteConstData() {
        metadata().label(LABEL).description(DESCRIPTION);
        codedata().node(NodeKind.AGENT_TOOL);
    }

    @Override
    public void setConcreteTemplateData(TemplateContext context) {
        properties().functionNameTemplate("tool", context.getAllVisibleSymbolNames());
        FunctionDefinitionBuilder.setMandatoryProperties(this, resolveTemplateReturnType(context), "", "");
        FunctionDefinitionBuilder.setOptionalProperties(this);
    }

    /**
     * The return type to prefill for an agent-call tool: the agent's own {@code run} return type,
     * which is concrete for a fixed-typed agent and {@code string} for a dependently-typed one.
     */
    private static String resolveTemplateReturnType(TemplateContext context) {
        Codedata codedata = context.codedata();
        Map<String, Object> data = codedata != null ? codedata.data() : null;
        if (data == null || !ToolKind.AGENT_CALL.name().equals(dataString(data, TOOL_KIND_KEY, ""))) {
            return "";
        }
        String agentVarName = dataString(data, AGENT_VAR_NAME_KEY, "");
        if (agentVarName.isBlank()) {
            return "";
        }
        try {
            context.workspaceManager().loadProject(context.filePath());
            SemanticModel semanticModel = context.workspaceManager().semanticModel(context.filePath()).orElse(null);
            ModuleInfo hostModule = resolveHostModule(context.filePath(), context.workspaceManager());
            return resolveAgentRunReturnType(semanticModel, agentVarName, hostModule, null,
                    context.workspaceManager(), context.filePath(),
                    dataString(data, HOST_CLASS_NAME_KEY, null));
        } catch (Throwable e) {
            return "";
        }
    }

    @Override
    public Map<Path, List<TextEdit>> toSource(SourceBuilder sourceBuilder) {
        FlowNode toolNode = sourceBuilder.flowNode;
        Map<String, Object> data = toolNode.codedata() != null ? toolNode.codedata().data() : null;
        if (data == null) {
            throw new IllegalStateException("Agent tool node is missing codedata.data");
        }

        FlowNode wrappedNode = data.get(WRAPPED_NODE_KEY) != null
                ? gson.fromJson(gson.toJsonTree(data.get(WRAPPED_NODE_KEY)), FlowNode.class) : null;
        ToolKind kind = ToolKind.resolve(data, wrappedNode);
        if (kind != ToolKind.AGENT_CALL && kind != ToolKind.CUSTOM && wrappedNode == null) {
            throw new IllegalStateException("Agent tool node is missing the wrapped node in codedata.data");
        }

        String toolName = sourceBuilder.getProperty(Property.FUNCTION_NAME_KEY)
                .map(property -> property.value().toString())
                .orElseThrow(() -> new IllegalStateException("Tool name (functionName) is required"));
        Property toolParams = sourceBuilder.getProperty(Property.PARAMETERS_KEY).orElse(null);
        String connection = dataString(data, CONNECTION_KEY, "");
        String agentVarName = dataString(data, AGENT_VAR_NAME_KEY, "");
        String agentReceiver = dataString(data, AGENT_RECEIVER_KEY, agentVarName);
        boolean includeContext = Boolean.parseBoolean(String.valueOf(data.get(INCLUDE_CONTEXT_KEY)));
        String description = dataString(data, DESCRIPTION_KEY, sourceBuilder
                .getProperty(Property.FUNCTION_NAME_DESCRIPTION_KEY)
                .map(property -> property.value().toString()).orElse(""));
        if (kind == ToolKind.AGENT_CALL && description.isBlank()) {
            description = "Delegates a query to the " + agentVarName + " agent.";
        }
        String hostClassName = dataString(data, HOST_CLASS_NAME_KEY, null);

        SemanticModel semanticModel = sourceBuilder.workspaceManager.semanticModel(sourceBuilder.filePath)
                .orElse(null);
        FlowNode genNode = wrappedNode != null ? wrappedNode : toolNode;
        if (hostClassName != null) {
            genNode = withData(genNode, Constants.FILE_PATH_KEY, sourceBuilder.filePath.toString());
        }
        SourceBuilder sb = new SourceBuilder(genNode, sourceBuilder.workspaceManager, sourceBuilder.filePath);
        String iconPath = wrappedNode != null && wrappedNode.metadata() != null ? wrappedNode.metadata().icon() : "";

        ToolGenContext context = new ToolGenContext(sb, wrappedNode, data, connection, description, toolName,
                toolParams, semanticModel, sourceBuilder.workspaceManager, sourceBuilder.filePath, iconPath,
                agentVarName, agentReceiver, hostClassName, includeContext);
        Map<Path, List<TextEdit>> textEdits = generate(kind, context);
        if (hostClassName != null) {
            relocateToolIntoClass(textEdits, sb.filePath, hostClassName, toolName, sourceBuilder.workspaceManager,
                    semanticModel);
        }
        return textEdits;
    }

    private static FlowNode withData(FlowNode node, String key, Object value) {
        Codedata codedata = new Codedata.Builder<>(null).from(node.codedata()).addData(key, value).build();
        return new FlowNode(node.id(), node.metadata(), codedata, node.returning(), node.branches(),
                node.properties(), node.diagnostics(), node.flags());
    }

    private static String dataString(Map<String, Object> data, String key, String defaultValue) {
        Object value = data.get(key);
        return value == null ? defaultValue : value.toString();
    }

    private static void relocateToolIntoClass(Map<Path, List<TextEdit>> textEdits, Path classFile, String className,
                                              String toolName, WorkspaceManager workspaceManager,
                                              SemanticModel semanticModel) {
        List<TextEdit> classEdits = textEdits.get(classFile);
        if (classEdits == null || classEdits.isEmpty()) {
            throw new IllegalStateException("Agent tool edits not found: " + className);
        }
        Document document = FileSystemUtils.getDocument(workspaceManager, classFile);
        if (document == null) {
            throw new IllegalStateException("Document not found for agent tool class: " + classFile);
        }
        ClassDefinitionNode classNode = findClass(document.syntaxTree().rootNode(), className);
        if (classNode == null || !isAgentClass(semanticModel, classNode)) {
            throw new IllegalStateException("Agent tool class not found: " + className);
        }
        TextEdit functionEdit = classEdits.stream()
                .filter(edit -> edit.getNewText().contains("function " + toolName + "("))
                .findFirst()
                .orElse(null);
        if (functionEdit == null) {
            throw new IllegalStateException("Agent tool declaration not found: " + toolName);
        }
        LinePosition insertPosition = classNode.members().isEmpty()
                ? classNode.openBrace().lineRange().endLine()
                : classNode.members().get(classNode.members().size() - 1).lineRange().endLine();
        functionEdit.setRange(CommonUtils.toRange(insertPosition));
        functionEdit.setNewText(CLASS_MEMBER_INDENT
                + functionEdit.getNewText().replace("\n", "\n" + CLASS_MEMBER_INDENT));

        classEdits.add(ClassMemberManager.wireToolIntoList(classNode, toolName)
                .orElseThrow(() -> new IllegalStateException("Agent tools list not found: " + className)));
    }

    private static boolean isAgentClass(SemanticModel semanticModel, ClassDefinitionNode classNode) {
        return semanticModel != null && semanticModel.symbol(classNode)
                .filter(ClassSymbol.class::isInstance)
                .map(ClassSymbol.class::cast)
                .map(CommonUtils::isAiAgentType)
                .orElse(false);
    }

    private static ClassDefinitionNode findClass(ModulePartNode root, String className) {
        for (ModuleMemberDeclarationNode member : root.members()) {
            if (member instanceof ClassDefinitionNode classDef && classDef.className().text().equals(className)) {
                return classDef;
            }
        }
        return null;
    }

    private static Map<Path, List<TextEdit>> generate(ToolKind kind, ToolGenContext ctx) {
        ctx.sb.acceptImport(Constants.Ai.BALLERINA_ORG, Constants.Ai.AI_PACKAGE);
        List<ToolParam> params = kind.resolveParams(ctx);
        ctx.resolvedParams = params;
        ReturnInfo returnInfo = kind.resolveReturn(ctx);

        emitDoc(ctx, params, returnInfo);
        emitAnnotation(ctx);
        if (kind.hasDisplay()) {
            emitDisplay(ctx);
        }
        emitSignature(ctx, params, returnInfo);

        return kind.buildBody(ctx, returnInfo);
    }

    private static void emitDoc(ToolGenContext ctx, List<ToolParam> params, ReturnInfo returnInfo) {
        boolean hasDescription = ctx.hasDescription();
        if (hasDescription) {
            ctx.sb.token().descriptionDoc(ctx.description);
        }
        for (ToolParam param : params) {
            if (hasDescription && param.doc() != null) {
                ctx.sb.token().parameterDoc(param.name(), param.doc());
            }
        }
        if (returnInfo.doc() != null) {
            ctx.sb.token().returnDoc(returnInfo.doc());
        }
    }

    private static void emitDisplay(ToolGenContext ctx) {
        ctx.sb.token()
                .name("@display {")
                .name("label: \"\",")
                .name("iconPath: \"")
                .name(ctx.iconPath == null ? "" : ctx.iconPath)
                .name("\"}")
                .name(System.lineSeparator());
    }

    private static void emitSignature(ToolGenContext ctx, List<ToolParam> params, ReturnInfo returnInfo) {
        ctx.sb.token().keyword(SyntaxKind.ISOLATED_KEYWORD).keyword(SyntaxKind.FUNCTION_KEYWORD);
        ctx.sb.token().name(ctx.toolName).keyword(SyntaxKind.OPEN_PAREN_TOKEN);
        ctx.sb.token().name(params.stream().map(ToolParam::decl).collect(Collectors.joining(", ")));
        ctx.sb.token().keyword(SyntaxKind.CLOSE_PAREN_TOKEN);

        boolean hasReturn = !returnInfo.typeName().isEmpty();
        if (hasReturn) {
            ctx.sb.token().keyword(SyntaxKind.RETURNS_KEYWORD).name(returnInfo.typeName());
            if (returnInfo.checkError()) {
                ctx.sb.token().keyword(SyntaxKind.PIPE_TOKEN).keyword(SyntaxKind.ERROR_KEYWORD);
            }
        } else if (returnInfo.checkError()) {
            ctx.sb.token().keyword(SyntaxKind.RETURNS_KEYWORD).name("error?");
        }
    }

    // Looks up a single annotation-data key across both places it can live: the tool's own data
    // (ctx.data — authoritative for CUSTOM/AGENT_CALL, which have no wrapped node) and the wrapped
    // node's data (where the form originally writes auth/requiresApproval for FUNCTION/REMOTE/
    // RESOURCE tools). ctx.data wins when both have the key. Resolving key-by-key — instead of
    // picking one map wholesale for every field — means a key present in only one of the two maps
    // is never silently dropped, and emitAnnotation/appendApprovalPredicate can't disagree about
    // where a given field lives.
    private static Object resolveToolData(ToolGenContext ctx, String key) {
        if (ctx.data != null && ctx.data.containsKey(key)) {
            return ctx.data.get(key);
        }
        if (ctx.wrappedNode != null) {
            Map<String, Object> wrappedData = ctx.wrappedNode.codedata().data();
            if (wrappedData != null && wrappedData.containsKey(key)) {
                return wrappedData.get(key);
            }
        }
        return null;
    }

    private static void emitAnnotation(ToolGenContext ctx) {
        // Each entry is a fully-rendered mapping field (already indented) to place inside the
        // `@ai:AgentTool { ... }` record. When empty, a bare `@ai:AgentTool` is emitted instead.
        List<String> annotationFields = new ArrayList<>();

        // auth: { ... } — OAuth client configuration block.
        Object authValue = resolveToolData(ctx, "auth");
        if (authValue != null) {
            String authStr = authValue.toString();
            JsonObject authConfig = gson.fromJson(authStr, JsonObject.class);

            List<String> fields = new ArrayList<>();
            for (Map.Entry<String, JsonElement> entry : authConfig.entrySet()) {
                String key = entry.getKey();
                JsonElement valueElement = entry.getValue();
                String value = valueElement.isJsonArray() ? valueElement.toString() : valueElement.getAsString();

                if (value == null || value.isEmpty() || value.equals("()") || value.trim().matches("\\{\\s*}")) {
                    continue;
                }

                if (key.equals("scopes")) {
                    if (value.startsWith("[") && value.endsWith("]")) {
                        fields.add("        " + key + ": " + value);
                        continue;
                    }
                    String[] scopeParts = value.split(",");
                    List<String> scopeItems = new ArrayList<>();
                    for (String part : scopeParts) {
                        String trimmed = part.trim();
                        if (!trimmed.isEmpty()) {
                            scopeItems.add(trimmed);
                        }
                    }
                    if (scopeItems.isEmpty()) {
                        continue;
                    }
                    fields.add("        " + key + ": [" + String.join(", ", scopeItems) + "]");
                } else {
                    fields.add("        " + key + ": " + value);
                }
            }

            if (!fields.isEmpty()) {
                annotationFields.add("    auth: {" + System.lineSeparator()
                        + String.join("," + System.lineSeparator(), fields) + System.lineSeparator()
                        + "    }");
            }
        }

        // requiresApproval: <boolean|isolated function> — human-in-the-loop gate. The value is
        // emitted verbatim: "true" for the toggle, or an identifier for a predicate function pointer.
        Object approvalValue = resolveToolData(ctx, "requiresApproval");
        if (approvalValue != null) {
            String approval = approvalValue.toString().trim();
            if (!approval.isEmpty()) {
                annotationFields.add("    requiresApproval: " + approval);
            }
        }

        if (annotationFields.isEmpty()) {
            ctx.sb.token().name("@ai:AgentTool").name(System.lineSeparator());
            return;
        }

        String sb = "@ai:AgentTool {" + System.lineSeparator()
                + String.join("," + System.lineSeparator(), annotationFields) + System.lineSeparator()
                + "}";

        ctx.sb.token().name(sb).name(System.lineSeparator());
    }

    private enum ToolKind {
        CUSTOM {
            @Override
            ReturnInfo resolveReturn(ToolGenContext ctx) {
                String typeName = ctx.sb.getProperty(Property.TYPE_KEY)
                        .map(property -> property.value().toString()).orElse("");
                String description = ctx.sb.getProperty(Property.RETURN_DESCRIPTION_KEY)
                        .map(property -> property.value().toString()).filter(value -> !value.isBlank()).orElse(null);
                return new ReturnInfo(typeName, false, description);
            }

            @Override
            boolean hasDisplay() {
                return false;
            }

            @Override
            Map<Path, List<TextEdit>> buildBody(ToolGenContext ctx, ReturnInfo returnInfo) {
                ctx.sb.token().keyword(SyntaxKind.OPEN_BRACE_TOKEN);
                if (!returnInfo.typeName().isEmpty()) {
                    ctx.sb.token().keyword(SyntaxKind.PANIC_KEYWORD).name("error(\"not implemented\")")
                            .endOfStatement();
                }
                ctx.sb.token().keyword(SyntaxKind.CLOSE_BRACE_TOKEN);
                ctx.sb.textEdit(SourceBuilder.SourceKind.DECLARATION).acceptImport();
                appendApprovalPredicate(ctx);
                return ctx.sb.build();
            }
        },
        FUNCTION {
            @Override
            ReturnInfo resolveReturn(ToolGenContext ctx) {
                Optional<Property> returnType = ctx.sb.getProperty(Property.TYPE_KEY);
                String typeName = returnType
                        .map(property -> resolveTypeInferParams(property.value().toString(), ctx.wrappedNode))
                        .orElse("");
                return new ReturnInfo(typeName, FlowNodeUtil.hasCheckKeyFlagSet(ctx.wrappedNode), null);
            }

            @Override
            Map<Path, List<TextEdit>> buildBody(ToolGenContext ctx, ReturnInfo returnInfo) {
                return buildFunctionBody(ctx, returnInfo);
            }
        },
        REMOTE {
            @Override
            ReturnInfo resolveReturn(ToolGenContext ctx) {
                return resolveActionReturn(ctx, true);
            }

            @Override
            Map<Path, List<TextEdit>> buildBody(ToolGenContext ctx, ReturnInfo returnInfo) {
                return buildRemoteActionBody(ctx, returnInfo);
            }
        },
        RESOURCE {
            @Override
            ReturnInfo resolveReturn(ToolGenContext ctx) {
                return resolveActionReturn(ctx, false);
            }

            @Override
            Map<Path, List<TextEdit>> buildBody(ToolGenContext ctx, ReturnInfo returnInfo) {
                return buildResourceActionBody(ctx, returnInfo);
            }
        },
        AGENT_CALL {
            @Override
            List<ToolParam> resolveParams(ToolGenContext ctx) {
                List<ToolParam> params = new ArrayList<>();
                if (ctx.includeContext) {
                    params.add(new ToolParam("ai:Context ctx", "ctx", null));
                }
                params.add(new ToolParam("string query", "query",
                        "The request to send to the " + ctx.agentVarName + " agent."));
                return params;
            }

            @Override
            ReturnInfo resolveReturn(ToolGenContext ctx) {
                String chosen = dataString(ctx.data, RETURN_TYPE_KEY, "").trim();
                if (!chosen.isEmpty()) {
                    acceptChosenTypeImports(ctx.data, ctx.sb);
                    return new ReturnInfo(chosen, true, "The response from the " + ctx.agentVarName + " agent.");
                }
                ModuleInfo hostModule = resolveHostModule(ctx.filePath, ctx.workspaceManager);
                String typeName = resolveAgentRunReturnType(ctx.semanticModel, ctx.agentVarName, hostModule, ctx.sb,
                        ctx.workspaceManager, ctx.filePath, ctx.hostClassName);
                return new ReturnInfo(typeName, true, "The response from the " + ctx.agentVarName + " agent.");
            }

            @Override
            boolean hasDisplay() {
                return false;
            }

            @Override
            Map<Path, List<TextEdit>> buildBody(ToolGenContext ctx, ReturnInfo returnInfo) {
                return buildAgentCallBody(ctx, returnInfo);
            }
        };

        List<ToolParam> resolveParams(ToolGenContext ctx) {
            List<ToolParam> params = wrappedToolParams(ctx.toolParams);
            if (ctx.includeContext) {
                if (params.stream().anyMatch(param -> param.name().equals("ctx"))) {
                    throw new IllegalArgumentException("Agent tool parameters cannot use the reserved name 'ctx' "
                            + "when agent context is enabled");
                }
                params.add(0, new ToolParam("ai:Context ctx", "ctx", null));
            }
            return params;
        }

        abstract ReturnInfo resolveReturn(ToolGenContext ctx);

        boolean hasDisplay() {
            return true;
        }

        abstract Map<Path, List<TextEdit>> buildBody(ToolGenContext ctx, ReturnInfo returnInfo);

        static ToolKind resolve(Map<String, Object> data, FlowNode wrappedNode) {
            Object explicit = data.get(TOOL_KIND_KEY);
            if (explicit != null) {
                return ToolKind.valueOf(explicit.toString());
            }
            if (wrappedNode == null) {
                throw new IllegalStateException("Cannot determine the agent tool kind: no toolKind, no wrapped node");
            }
            return switch (wrappedNode.codedata().node()) {
                case FUNCTION_DEFINITION, FUNCTION_CALL -> FUNCTION;
                case REMOTE_ACTION_CALL -> REMOTE;
                case RESOURCE_ACTION_CALL -> RESOURCE;
                default -> throw new IllegalStateException("Unsupported node kind to generate tool");
            };
        }
    }

    private static ReturnInfo resolveActionReturn(ToolGenContext ctx, boolean includeDescription) {
        boolean checkError = FlowNodeUtil.hasCheckKeyFlagSet(ctx.wrappedNode);
        return ctx.sb.getProperty(Property.TYPE_KEY)
                .map(property -> new ReturnInfo(resolveReturnType(ctx.wrappedNode, property, ctx.sb), checkError,
                        includeDescription ? property.metadata().description() : null))
                .orElse(new ReturnInfo("", checkError, null));
    }

    private static Map<Path, List<TextEdit>> buildFunctionBody(ToolGenContext ctx, ReturnInfo returnInfo) {
        SourceBuilder sourceBuilder = ctx.sb;
        FlowNode flowNode = ctx.wrappedNode;
        NodeKind nodeKind = flowNode.codedata().node();
        String returnType = returnInfo.typeName();
        boolean hasReturn = !returnType.isEmpty();
        boolean hasCheckError = returnInfo.checkError();

        sourceBuilder.token().keyword(SyntaxKind.OPEN_BRACE_TOKEN);
        if (hasReturn) {
            sourceBuilder.token()
                    .name(returnType)
                    .whiteSpace()
                    .name("result")
                    .whiteSpace()
                    .keyword(SyntaxKind.EQUAL_TOKEN);
        }
        if (hasCheckError) {
            sourceBuilder.token().keyword(SyntaxKind.CHECK_KEYWORD);
        }
        Optional<Property> optFuncName = flowNode.getProperty(Property.FUNCTION_NAME_KEY);
        String funcName;
        if (optFuncName.isPresent()) {
            funcName = optFuncName.get().value().toString();
        } else if (flowNode.codedata().symbol() != null) {
            funcName = flowNode.codedata().symbol();
        } else {
            throw new IllegalStateException("Function name is not present");
        }
        if (nodeKind == NodeKind.FUNCTION_CALL) {
            funcName = sourceBuilder.importQualifier() + funcName;
        }

        Map<String, String> toolInputVarNames = new LinkedHashMap<>();
        Optional<Property> funcCallArgs = flowNode.getProperty(Property.PARAMETERS_KEY);
        if (funcCallArgs.isPresent() && funcCallArgs.get().value() instanceof Map<?, ?> paramMap) {
            for (Map.Entry<?, ?> paramEntry : paramMap.entrySet()) {
                Property paramProperty = gson.fromJson(gson.toJsonTree(paramEntry.getValue()),
                        Property.class);
                if (!(paramProperty.value() instanceof Map<?, ?> paramData)) {
                    continue;
                }
                Map<String, Property> paramProperties = gson.fromJson(gson.toJsonTree(paramData),
                        FormBuilder.NODE_PROPERTIES_TYPE);
                toolInputVarNames.put(paramEntry.getKey().toString(),
                        paramProperties.get(Property.VARIABLE_KEY).value().toString());
            }
        }

        List<String> args = new ArrayList<>();
        if (nodeKind == NodeKind.FUNCTION_CALL && flowNode.properties() != null) {
            for (Map.Entry<String, Property> entry : flowNode.properties().entrySet()) {
                String key = entry.getKey();
                Property prop = entry.getValue();
                PropertyCodedata propCodedata = prop.codedata();
                if (propCodedata == null || propCodedata.kind() == null
                        || propCodedata.kind().equals(
                        ParameterData.Kind.PARAM_FOR_TYPE_INFER.name())) {
                    continue;
                }

                String toolInputVar = toolInputVarNames.get(key);
                if (toolInputVar != null) {
                    if (prop.value() instanceof List<?> valueList) {
                        List<String> listArgs = extractListArgs(valueList);
                        if (!listArgs.isEmpty()) {
                            args.addAll(listArgs);
                        } else {
                            args.add(toolInputVar);
                        }
                    } else if (prop.value() != null && !prop.value().toString().isEmpty()
                            && !prop.value().toString().equals(toolInputVar)) {
                        args.add(prop.value().toString());
                    } else {
                        args.add(toolInputVar);
                    }
                } else if (prop.value() instanceof List<?> valueList) {
                    List<String> listArgs = extractListArgs(valueList);
                    args.addAll(listArgs);
                } else if (prop.value() != null && !prop.value().toString().isEmpty()) {
                    args.add(prop.value().toString());
                }
            }
        } else {
            args.addAll(toolInputVarNames.values());
        }

        sourceBuilder.token()
                .name(funcName)
                .keyword(SyntaxKind.OPEN_PAREN_TOKEN);
        sourceBuilder.token()
                .name(String.join(", ", args))
                .keyword(SyntaxKind.CLOSE_PAREN_TOKEN).endOfStatement();

        if (hasReturn) {
            sourceBuilder.token()
                    .keyword(SyntaxKind.RETURN_KEYWORD)
                    .name("result")
                    .endOfStatement();
        }

        sourceBuilder.token()
                .keyword(SyntaxKind.CLOSE_BRACE_TOKEN);
        sourceBuilder.textEdit(SourceBuilder.SourceKind.DECLARATION).acceptImport();
        // If the form asked to scaffold a conditional-approval predicate, emit it as a sibling
        // declaration reusing the tool wrapper's exact parameter list.
        appendApprovalPredicate(ctx);
        Map<Path, List<TextEdit>> textEdits = sourceBuilder.build();
        List<TextEdit> te = new ArrayList<>();
        Path p = addIsolateKeyword(ctx.semanticModel, funcName.trim(), ctx.filePath, te, ctx.workspaceManager);
        if (p != null) {
            textEdits.computeIfAbsent(p, ignored -> new ArrayList<>()).addAll(te);
        }
        return textEdits;
    }

    // Emit a sibling `isolated function` predicate stub for the @ai:AgentTool `requiresApproval` gate,
    // when the form requested one (codedata.data.generateApprovalFunction == "true"). The predicate
    // mirrors the tool wrapper's own parameter list (the exact list its signature was built from) and
    // returns boolean, satisfying the RequiresApproval contract (the ai module binds the proposed
    // call's arguments to the predicate by name). Its name is the `requiresApproval` annotation value.
    // Must be called AFTER the tool declaration has been flushed via textEdit(DECLARATION) (so the
    // token buffer is empty); it appends a second DECLARATION text edit to the same file, which
    // build() returns alongside the tool's. Called from every ToolKind's body builder
    // (buildFunctionBody, buildRemoteActionBody, buildResourceActionBody, CUSTOM's buildBody, and
    // buildAgentCallBody) — every path whose form exposes the "Requires Approval" gate.
    private static void appendApprovalPredicate(ToolGenContext ctx) {
        // Same per-key resolution as emitAnnotation, so the two can't disagree about whether the
        // gate is set or which name it uses.
        if (!"true".equals(String.valueOf(resolveToolData(ctx, "generateApprovalFunction")))) {
            return;
        }
        Object approvalValue = resolveToolData(ctx, "requiresApproval");
        String predicateName = approvalValue == null ? "" : approvalValue.toString().trim();
        if (predicateName.isEmpty()) {
            return;
        }
        // Mirror the tool's own signature, using the same param list generate() built it from
        // (stashed on ctx) — each ToolKind resolves params differently, so this must not recompute
        // with a fixed kind. The leading `ai:Context ctx` param is excluded: the `ai` compiler
        // plugin strips it from the tool's own signature before comparing against the predicate's,
        // so including it here would make the predicate's signature look mismatched. Every ToolKind
        // prepends it at index 0 when includeContext is set (and rejects a user param named "ctx"
        // up front), so skipping by position ties this to the invariant that's actually guaranteed,
        // rather than to the param's name.
        String paramDecls = ctx.resolvedParams.stream()
                .skip(ctx.includeContext ? 1 : 0)
                .map(ToolParam::decl)
                .collect(Collectors.joining(", "));
        ctx.sb.token()
                .keyword(SyntaxKind.ISOLATED_KEYWORD)
                .keyword(SyntaxKind.FUNCTION_KEYWORD)
                .name(predicateName)
                .keyword(SyntaxKind.OPEN_PAREN_TOKEN)
                .name(paramDecls)
                .keyword(SyntaxKind.CLOSE_PAREN_TOKEN)
                .keyword(SyntaxKind.RETURNS_KEYWORD)
                .name("boolean")
                .keyword(SyntaxKind.OPEN_BRACE_TOKEN)
                .newLine()
                .comment("// TODO: inspect the proposed arguments and return true to require approval")
                .newLine()
                .keyword(SyntaxKind.RETURN_KEYWORD)
                .name("true")
                .endOfStatement()
                .keyword(SyntaxKind.CLOSE_BRACE_TOKEN);
        ctx.sb.textEdit(SourceBuilder.SourceKind.DECLARATION);
    }

    private static Map<Path, List<TextEdit>> buildRemoteActionBody(ToolGenContext ctx, ReturnInfo returnInfo) {
        SourceBuilder sourceBuilder = ctx.sb;
        FlowNode flowNode = ctx.wrappedNode;
        String returnType = returnInfo.typeName();
        Set<String> ignoredKeys = new HashSet<>(List.of(Property.VARIABLE_KEY, Property.TYPE_KEY, TARGET_TYPE,
                Property.CONNECTION_KEY, Property.CHECK_ERROR_KEY));
        beginActionBody(sourceBuilder, flowNode, returnType);
        sourceBuilder.token()
                .name(ctx.connection)
                .keyword(SyntaxKind.RIGHT_ARROW_TOKEN)
                .name(flowNode.metadata().label())
                .stepOut()
                .functionParameters(flowNode, ignoredKeys);

        return finishActionBody(ctx, flowNode, returnType);
    }

    private static Map<Path, List<TextEdit>> buildResourceActionBody(ToolGenContext ctx, ReturnInfo returnInfo) {
        SourceBuilder sourceBuilder = ctx.sb;
        FlowNode flowNode = ctx.wrappedNode;
        String returnType = returnInfo.typeName();
        Map<String, Property> properties = flowNode.properties();
        Set<String> keys = new LinkedHashSet<>(properties != null ? properties.keySet() : Set.of());
        Set<String> ignoredKeys = new HashSet<>(List.of(Property.CONNECTION_KEY, Property.VARIABLE_KEY,
                Property.TYPE_KEY, TARGET_TYPE, Property.RESOURCE_PATH_KEY, Property.CHECK_ERROR_KEY));
        keys.removeAll(ignoredKeys);
        Set<String> pathParams = new HashSet<>();
        for (String k : keys) {
            Property property = properties.get(k);
            if (property == null) {
                continue;
            }
            String key = k;
            if (k.startsWith("$")) {
                key = "'" + k.substring(1);
            }
            PropertyCodedata codedata = property.codedata();
            if (codedata != null) {
                String kind = codedata.kind();
                if (ParameterData.Kind.PATH_PARAM.name().equals(kind)
                        || ParameterData.Kind.PATH_REST_PARAM.name().equals(kind)) {
                    pathParams.add(key);
                }
            }
        }
        beginActionBody(sourceBuilder, flowNode, returnType);

        String resourcePath = flowNode.properties().get(Property.RESOURCE_PATH_KEY)
                .codedata().originalName();

        if (resourcePath.equals(ParamUtils.REST_RESOURCE_PATH)) {
            resourcePath = flowNode.properties().get(Property.RESOURCE_PATH_KEY).value().toString();
        }

        for (String key : pathParams) {
            Optional<Property> property = flowNode.getProperty(key);
            if (property.isEmpty()) {
                continue;
            }
            PropertyCodedata propCodedata = property.get()
                    .codedata();
            if (propCodedata == null) {
                continue;
            }
            if (propCodedata.kind().equals(ParameterData.Kind.PATH_REST_PARAM.name())) {
                String replacement = property.get().value().toString();
                resourcePath = resourcePath.replace(ParamUtils.REST_PARAM_PATH, replacement);
            }
        }
        ignoredKeys.addAll(pathParams);

        sourceBuilder.token()
                .name(ctx.connection)
                .keyword(SyntaxKind.RIGHT_ARROW_TOKEN)
                .resourcePath(resourcePath)
                .keyword(SyntaxKind.DOT_TOKEN)
                .name(flowNode.codedata().symbol())
                .stepOut()
                .functionParameters(flowNode, ignoredKeys);

        return finishActionBody(ctx, flowNode, returnType);
    }

    private static void beginActionBody(SourceBuilder sourceBuilder, FlowNode flowNode, String returnType) {
        sourceBuilder.token().keyword(SyntaxKind.OPEN_BRACE_TOKEN);
        if (!returnType.isEmpty()) {
            sourceBuilder.token().expressionWithType(returnType,
                    flowNode.getProperty(Property.VARIABLE_KEY).orElseThrow()).keyword(SyntaxKind.EQUAL_TOKEN);
        }
        if (FlowNodeUtil.hasCheckKeyFlagSet(flowNode)) {
            sourceBuilder.token().keyword(SyntaxKind.CHECK_KEYWORD);
        }
    }

    private static Map<Path, List<TextEdit>> finishActionBody(ToolGenContext ctx, FlowNode flowNode,
                                                                String returnType) {
        SourceBuilder sourceBuilder = ctx.sb;
        if (!returnType.isEmpty()) {
            sourceBuilder.token().keyword(SyntaxKind.RETURN_KEYWORD)
                    .name(flowNode.getProperty(Property.VARIABLE_KEY).orElseThrow().value().toString())
                    .endOfStatement();
        }
        sourceBuilder.token().keyword(SyntaxKind.CLOSE_BRACE_TOKEN);
        sourceBuilder.textEdit(SourceBuilder.SourceKind.DECLARATION);
        sourceBuilder.acceptImport();
        // If the form asked to scaffold a conditional-approval predicate, emit it as a sibling
        // declaration reusing the tool wrapper's exact parameter list (mirrors buildFunctionBody).
        appendApprovalPredicate(ctx);
        return sourceBuilder.build();
    }

    private static Map<Path, List<TextEdit>> buildAgentCallBody(ToolGenContext ctx, ReturnInfo returnInfo) {
        SourceBuilder sourceBuilder = ctx.sb;
        String runArgs = ctx.includeContext ? "query, context = ctx" : "query";
        sourceBuilder.token().keyword(SyntaxKind.OPEN_BRACE_TOKEN);
        sourceBuilder.token()
                .name(returnInfo.typeName())
                .keyword(SyntaxKind.PIPE_TOKEN)
                .keyword(SyntaxKind.ERROR_KEYWORD)
                .name(RESPONSE_VAR)
                .whiteSpace()
                .keyword(SyntaxKind.EQUAL_TOKEN)
                .name(ctx.agentReceiver)
                .keyword(SyntaxKind.DOT_TOKEN)
                .name(RUN)
                .keyword(SyntaxKind.OPEN_PAREN_TOKEN)
                .name(runArgs)
                .keyword(SyntaxKind.CLOSE_PAREN_TOKEN)
                .endOfStatement();
        sourceBuilder.token()
                .keyword(SyntaxKind.RETURN_KEYWORD)
                .name(RESPONSE_VAR)
                .endOfStatement();
        sourceBuilder.token().keyword(SyntaxKind.CLOSE_BRACE_TOKEN);
        sourceBuilder.textEdit(SourceBuilder.SourceKind.DECLARATION).acceptImport();
        appendApprovalPredicate(ctx);
        return sourceBuilder.build();
    }

    private static List<ToolParam> wrappedToolParams(Property toolParams) {
        List<ToolParam> paramList = new ArrayList<>();
        if (toolParams == null || !(toolParams.value() instanceof Map<?, ?> paramMap)) {
            return paramList;
        }
        for (Object obj : paramMap.values()) {
            Property paramProperty = gson.fromJson(gson.toJsonTree(obj), Property.class);
            if (!(paramProperty.value() instanceof Map<?, ?> paramData)) {
                continue;
            }
            Map<String, Property> paramProperties = gson.fromJson(gson.toJsonTree(paramData),
                    FormBuilder.NODE_PROPERTIES_TYPE);

            String paramType = paramProperties.get(Property.TYPE_KEY).value().toString();
            String paramName = paramProperties.get(Property.VARIABLE_KEY).value().toString();
            Property descProperty = paramProperties.get(Property.PARAMETER_DESCRIPTION_KEY);
            String doc = descProperty != null ? descProperty.value().toString() : null;
            paramList.add(new ToolParam(paramType + " " + paramName, paramName, doc));
        }
        return paramList;
    }

    private static String resolveTypeInferParams(String returnType, FlowNode flowNode) {
        if (flowNode.properties() == null) {
            return returnType;
        }
        for (Map.Entry<String, Property> entry : flowNode.properties().entrySet()) {
            PropertyCodedata propCodedata = entry.getValue()
                    .codedata();
            if (propCodedata != null
                    && ParameterData.Kind.PARAM_FOR_TYPE_INFER.name().equals(propCodedata.kind())) {
                String paramName = entry.getKey();
                String resolvedType;
                Object value = entry.getValue().value();
                if (value != null && !value.toString().isEmpty()) {
                    resolvedType = value.toString();
                } else {
                    resolvedType = entry.getValue().defaultValue();
                }
                if (resolvedType == null || resolvedType.isEmpty()) {
                    resolvedType = "json";
                }
                returnType = returnType.replace(paramName, resolvedType);
            }
        }
        return returnType;
    }

    private static String resolveReturnType(FlowNode flowNode, Property returnProperty, SourceBuilder sourceBuilder) {
        if (flowNode.codedata().inferredReturnType() != null && hasRecordFieldSelector(flowNode)) {
            Optional<Property> variable = flowNode.getProperty(Property.VARIABLE_KEY);
            if (variable.isPresent()) {
                Property varProp = variable.get();
                Path typesFilePath = sourceBuilder.filePath.resolveSibling("types.bal");
                Document typesDoc = FileSystemUtils.getDocument(
                        sourceBuilder.workspaceManager, typesFilePath);
                if (typesDoc != null) {
                    ModulePartNode typesRoot = typesDoc.syntaxTree().rootNode();
                    Set<String> existingTypeNames = typesRoot.members().stream()
                            .filter(m -> m.kind() == SyntaxKind.TYPE_DEFINITION)
                            .map(m -> ((TypeDefinitionNode) m).typeName().text())
                            .collect(Collectors.toSet());
                    String varName = varProp.toSourceCode();
                    String candidateTypeName = varName.substring(0, 1).toUpperCase(Locale.ROOT)
                            + varName.substring(1) + "Type";
                    if (existingTypeNames.contains(candidateTypeName)) {
                        String baseVarName = varName.replaceAll("\\d+$", "");
                        Set<String> usedVarNames = new HashSet<>();
                        usedVarNames.add(baseVarName);
                        for (String typeName : existingTypeNames) {
                            if (typeName.endsWith("Type") && typeName.length() > 4) {
                                String prefix = typeName.substring(0, typeName.length() - 4);
                                usedVarNames.add(prefix.substring(0, 1).toLowerCase(Locale.ROOT) + prefix.substring(1));
                            }
                        }
                        String uniqueVarName = NameUtil.generateTypeName(baseVarName, usedVarNames);
                        varProp = new Property.Builder<>(null).value(uniqueVarName).build();
                    }
                }
                return sourceBuilder.getTypeNameForInferredParam(varProp,
                        sourceBuilder.requalifiedType(returnProperty));
            }
        }
        Optional<Property> optTargetType = flowNode.getProperty(TARGET_TYPE);
        String returnType;
        if (optTargetType.isPresent() && optTargetType.get().value() != null
                && !optTargetType.get().value().toString().isEmpty()) {
            returnType = sourceBuilder.requalifiedType(optTargetType.get());
        } else if (optTargetType.isPresent()) {
            String defaultType = optTargetType.get().defaultValue();
            returnType = (defaultType != null && !defaultType.isEmpty()) ? defaultType : "json";
        } else {
            returnType = sourceBuilder.requalifiedType(returnProperty);
        }
        return resolveTypeInferParams(returnType, flowNode);
    }

    private static boolean hasRecordFieldSelector(FlowNode flowNode) {
        if (flowNode.properties() == null) {
            return false;
        }
        return flowNode.properties().values().stream()
                .anyMatch(p -> p.codedata() != null
                        && ParameterData.Kind.PARAM_FOR_TYPE_INFER.name().equals(p.codedata().kind())
                        && p.types() != null && !p.types().isEmpty()
                        && p.types().getFirst().recordSelectorType() != null);
    }

    private static List<String> extractListArgs(List<?> valueList) {
        return valueList.stream()
                .filter(Map.class::isInstance)
                .map(Map.class::cast)
                .map(val -> Property.convertToProperty(val).toSourceCode())
                .filter(s -> !s.isEmpty())
                .collect(Collectors.toList());
    }

    private static String resolveAgentRunReturnType(SemanticModel semanticModel, String agentVarName,
                                                    ModuleInfo hostModule, SourceBuilder sourceBuilder,
                                                    WorkspaceManager workspaceManager, Path filePath,
                                                    String hostClassName) {
        if (semanticModel == null) {
            return "string";
        }
        if (hostClassName != null && !hostClassName.isBlank()) {
            TypeSymbol hostFieldType = resolveHostClassFieldType(semanticModel, workspaceManager, filePath,
                    hostClassName, agentVarName);
            return resolveAgentRunReturnType(semanticModel, hostFieldType, hostModule, sourceBuilder);
        }
        for (Symbol symbol : semanticModel.moduleSymbols()) {
            if (symbol.kind() != SymbolKind.VARIABLE || !agentVarName.equals(symbol.getName().orElse(""))) {
                continue;
            }
            return resolveAgentRunReturnType(semanticModel, ((VariableSymbol) symbol).typeDescriptor(), hostModule,
                    sourceBuilder);
        }
        return "string";
    }

    private static TypeSymbol resolveHostClassFieldType(SemanticModel semanticModel, WorkspaceManager workspaceManager,
                                                        Path filePath, String hostClassName, String fieldName) {
        Document document = FileSystemUtils.getDocument(workspaceManager, filePath);
        if (document == null) {
            return null;
        }
        ClassDefinitionNode classNode = findClass(document.syntaxTree().rootNode(), hostClassName);
        if (classNode == null) {
            return null;
        }
        Optional<Symbol> symbol = semanticModel.symbol(classNode);
        if (symbol.isEmpty() || !(symbol.get() instanceof ClassSymbol classSymbol)) {
            return null;
        }
        ClassFieldSymbol fieldSymbol = classSymbol.fieldDescriptors().get(fieldName);
        return fieldSymbol != null ? fieldSymbol.typeDescriptor() : null;
    }

    private static String resolveAgentRunReturnType(SemanticModel semanticModel, TypeSymbol agentType,
                                                    ModuleInfo hostModule, SourceBuilder sourceBuilder) {
        if (agentType == null) {
            return "string";
        }
        TypeSymbol type = CommonUtils.getRawType(agentType);
        if (type.kind() != SymbolKind.CLASS
                || !(CommonUtils.isAgentClass(type) || AiUtils.isTypedAgent(type))) {
            return "string";
        }
        MethodSymbol runMethod = ((ClassSymbol) type).methods().get(RUN);
        if (runMethod == null) {
            return "string";
        }
        Optional<TypeSymbol> optReturn = runMethod.typeDescriptor().returnTypeDescriptor();
        if (optReturn.isEmpty() || hasInferredTypedescReturn(runMethod, optReturn.get())) {
            return "string";
        }
        String signature = CommonUtils.getTypeSignature(semanticModel, optReturn.get(), true, hostModule);
        if (signature.isBlank() || signature.equals("anydata") || signature.equals("()")
                || isInferredTypedescReturn(runMethod, signature)) {
            return "string";
        }
        // Only a concrete type is worth importing; a dependent one is not emitted.
        acceptTypeImports(optReturn.get(), hostModule, sourceBuilder);
        return signature;
    }

    private static boolean hasInferredTypedescReturn(MethodSymbol runMethod, TypeSymbol returnType) {
        Set<String> typedescParams = runMethod.typeDescriptor().params().orElse(List.of()).stream()
                .filter(param -> CommonUtils.getRawType(param.typeDescriptor()).typeKind() == TypeDescKind.TYPEDESC)
                .map(param -> param.getName().orElse(""))
                .filter(name -> !name.isEmpty())
                .collect(Collectors.toSet());
        return !typedescParams.isEmpty() && referencesName(returnType, typedescParams);
    }

    private static boolean referencesName(TypeSymbol type, Set<String> names) {
        if (type instanceof UnionTypeSymbol union) {
            return union.memberTypeDescriptors().stream().anyMatch(member -> referencesName(member, names));
        }
        return names.contains(type.getName().orElse(""));
    }

    /**
     * Whether {@code run} returns its own inferred {@code typedesc} parameter, as
     * {@code ai:DependentlyTypedAgent} does with {@code typedesc<Trace|anydata> td = <>} returning
     * {@code td|Error}. That name means nothing outside the method's signature, so emitting it
     * produces a tool that does not compile.
     */
    private static boolean isInferredTypedescReturn(MethodSymbol runMethod, String returnSignature) {
        Optional<List<ParameterSymbol>> params = runMethod.typeDescriptor().params();
        if (params.isEmpty()) {
            return false;
        }
        return params.get().stream()
                .filter(param -> CommonUtils.getRawType(param.typeDescriptor()).typeKind() == TypeDescKind.TYPEDESC)
                .map(param -> param.getName().orElse(""))
                .anyMatch(name -> !name.isBlank() && name.equals(returnSignature));
    }

    private static ModuleInfo resolveHostModule(Path filePath, WorkspaceManager workspaceManager) {
        try {
            workspaceManager.loadProject(filePath);
            return workspaceManager.module(filePath).map(module -> ModuleInfo.from(module.descriptor())).orElse(null);
        } catch (WorkspaceDocumentException | EventSyncException e) {
            return null;
        }
    }

    /**
     * A chosen return type arrives as a bare string ({@code http:Response}), so its module comes
     * from the client as a prefix to {@code org/module:version} map, like {@link Property#imports()}.
     */
    private static void acceptChosenTypeImports(Map<String, Object> data, SourceBuilder sourceBuilder) {
        String raw = dataString(data, RETURN_TYPE_IMPORTS_KEY, "");
        if (sourceBuilder == null || raw.isBlank()) {
            return;
        }
        Map<String, String> imports = gson.fromJson(raw, IMPORTS_TYPE);
        imports.values().stream()
                .map(moduleId -> moduleId.split("[/:]"))
                .filter(parts -> parts.length >= 2)
                .forEach(parts -> sourceBuilder.acceptImport(parts[0], parts[1]));
    }

    private static void acceptTypeImports(TypeSymbol typeSymbol, ModuleInfo hostModule, SourceBuilder sourceBuilder) {
        if (sourceBuilder == null) {
            // Resolving for a template preview; there is no source to add imports to.
            return;
        }
        if (typeSymbol instanceof UnionTypeSymbol union) {
            union.memberTypeDescriptors().forEach(member -> acceptTypeImports(member, hostModule, sourceBuilder));
            return;
        }
        typeSymbol.getModule().ifPresent(moduleSymbol -> {
            ModuleID id = moduleSymbol.id();
            if (id.orgName().equals(BALLERINA) && id.moduleName().startsWith("lang.")) {
                return;
            }
            boolean sameModule = hostModule != null && id.orgName().equals(hostModule.org())
                    && id.moduleName().equals(hostModule.moduleName());
            if (sameModule) {
                return;
            }
            sourceBuilder.acceptImport(id.orgName(), id.moduleName());
        });
    }

    private static Path addIsolateKeyword(SemanticModel semanticModel, String name, Path filePath,
                                          List<TextEdit> textEdits, WorkspaceManager workspaceManager) {
        if (semanticModel == null) {
            return null;
        }
        for (Symbol symbol : semanticModel.moduleSymbols()) {
            if (symbol.kind() != SymbolKind.FUNCTION) {
                continue;
            }
            FunctionSymbol functionSymbol = (FunctionSymbol) symbol;
            if (!functionSymbol.getName().orElseThrow().equals(name)) {
                continue;
            }
            Path parent = filePath.getParent();
            Location location = functionSymbol.getLocation().orElseThrow();
            LineRange lineRange = location.lineRange();
            if (parent == null) {
                break;
            }
            Path functionFile = parent.resolve(lineRange.fileName());
            Optional<Document> optDocument = workspaceManager.document(functionFile);
            if (optDocument.isEmpty()) {
                break;
            }
            Document document = optDocument.get();
            Optional<NonTerminalNode> optNode = CommonUtil.findNode(functionSymbol, document.syntaxTree());
            if (optNode.isEmpty()) {
                break;
            }
            NonTerminalNode node = optNode.get();
            if (node.kind() != SyntaxKind.FUNCTION_DEFINITION) {
                break;
            }
            FunctionDefinitionNode functionDefinitionNode = (FunctionDefinitionNode) node;
            boolean isIsolated = false;
            for (Token token : functionDefinitionNode.qualifierList()) {
                if (token.text().trim().equals("isolated")) {
                    isIsolated = true;
                }
            }

            if (isIsolated) {
                break;
            }
            LinePosition functionStart = functionDefinitionNode.functionKeyword().lineRange().startLine();
            Position position = new Position(functionStart.line(), functionStart.offset());
            textEdits.add(new TextEdit(new Range(position, position), "isolated "));
            return functionFile;
        }
        return null;
    }

    private record ToolParam(String decl, String name, String doc) {
    }

    private record ReturnInfo(String typeName, boolean checkError, String doc) {
    }

    private static final class ToolGenContext {

        private final SourceBuilder sb;
        private final FlowNode wrappedNode;
        private final Map<String, Object> data;
        private final String connection;
        private final String description;
        private final String toolName;
        private final Property toolParams;
        private final SemanticModel semanticModel;
        private final WorkspaceManager workspaceManager;
        private final Path filePath;
        private final String iconPath;
        private final String agentVarName;
        private final String agentReceiver;
        private final String hostClassName;
        private final boolean includeContext;
        // The tool signature's parameter list, stashed by generate() so appendApprovalPredicate can
        // mirror it exactly (each ToolKind resolves params differently — AGENT_CALL uses `query`,
        // not the wrapped node's params — so recomputing with a fixed kind would be wrong).
        private List<ToolParam> resolvedParams = List.of();

        private ToolGenContext(SourceBuilder sb, FlowNode wrappedNode, Map<String, Object> data,
                               String connection, String description,
                               String toolName, Property toolParams, SemanticModel semanticModel,
                               WorkspaceManager workspaceManager, Path filePath, String iconPath, String agentVarName,
                               String agentReceiver, String hostClassName, boolean includeContext) {
            this.sb = sb;
            this.wrappedNode = wrappedNode;
            this.data = data;
            this.connection = connection;
            this.description = description;
            this.toolName = toolName;
            this.toolParams = toolParams;
            this.semanticModel = semanticModel;
            this.workspaceManager = workspaceManager;
            this.filePath = filePath;
            this.iconPath = iconPath;
            this.agentVarName = agentVarName;
            this.agentReceiver = agentReceiver;
            this.hostClassName = hostClassName;
            this.includeContext = includeContext;
        }

        private boolean hasDescription() {
            return description != null && !description.isEmpty();
        }
    }
}
