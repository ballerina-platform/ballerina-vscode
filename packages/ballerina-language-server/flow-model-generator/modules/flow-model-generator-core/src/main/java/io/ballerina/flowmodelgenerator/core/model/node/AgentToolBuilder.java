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
import io.ballerina.compiler.api.ModuleID;
import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.api.symbols.ClassFieldSymbol;
import io.ballerina.compiler.api.symbols.ClassSymbol;
import io.ballerina.compiler.api.symbols.FunctionSymbol;
import io.ballerina.compiler.api.symbols.MethodSymbol;
import io.ballerina.compiler.api.symbols.Symbol;
import io.ballerina.compiler.api.symbols.SymbolKind;
import io.ballerina.compiler.api.symbols.TypeSymbol;
import io.ballerina.compiler.api.symbols.UnionTypeSymbol;
import io.ballerina.compiler.api.symbols.VariableSymbol;
import io.ballerina.compiler.syntax.tree.AssignmentStatementNode;
import io.ballerina.compiler.syntax.tree.CheckExpressionNode;
import io.ballerina.compiler.syntax.tree.ClassDefinitionNode;
import io.ballerina.compiler.syntax.tree.ExplicitNewExpressionNode;
import io.ballerina.compiler.syntax.tree.ExpressionNode;
import io.ballerina.compiler.syntax.tree.FunctionArgumentNode;
import io.ballerina.compiler.syntax.tree.FunctionBodyBlockNode;
import io.ballerina.compiler.syntax.tree.FunctionDefinitionNode;
import io.ballerina.compiler.syntax.tree.ImplicitNewExpressionNode;
import io.ballerina.compiler.syntax.tree.ListConstructorExpressionNode;
import io.ballerina.compiler.syntax.tree.ModuleMemberDeclarationNode;
import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.compiler.syntax.tree.NamedArgumentNode;
import io.ballerina.compiler.syntax.tree.Node;
import io.ballerina.compiler.syntax.tree.NonTerminalNode;
import io.ballerina.compiler.syntax.tree.SeparatedNodeList;
import io.ballerina.compiler.syntax.tree.StatementNode;
import io.ballerina.compiler.syntax.tree.SyntaxKind;
import io.ballerina.compiler.syntax.tree.Token;
import io.ballerina.compiler.syntax.tree.TypeDefinitionNode;
import io.ballerina.flowmodelgenerator.core.Constants;
import io.ballerina.flowmodelgenerator.core.model.Codedata;
import io.ballerina.flowmodelgenerator.core.model.FlowNode;
import io.ballerina.flowmodelgenerator.core.model.FormBuilder;
import io.ballerina.flowmodelgenerator.core.model.NodeBuilder;
import io.ballerina.flowmodelgenerator.core.model.NodeKind;
import io.ballerina.flowmodelgenerator.core.model.Property;
import io.ballerina.flowmodelgenerator.core.model.PropertyCodedata;
import io.ballerina.flowmodelgenerator.core.model.SourceBuilder;
import io.ballerina.flowmodelgenerator.core.utils.FileSystemUtils;
import io.ballerina.flowmodelgenerator.core.utils.FlowNodeUtil;
import io.ballerina.flowmodelgenerator.core.utils.ParamUtils;
import io.ballerina.modelgenerator.commons.CommonUtils;
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

/**
 * Builds an {@code @ai:AgentTool} wrapper function exposing a function, connection action, or another agent as a
 * tool. All kinds share one envelope; only the body differs per {@link ToolKind}.
 *
 * @since 1.0.0
 */
public class AgentToolBuilder extends NodeBuilder {

    public static final String LABEL = "Agent Tool";
    public static final String DESCRIPTION = "Expose a function, action, or connection as an agent tool";

    // codedata.data keys carrying the parts that drive the generated body.
    public static final String WRAPPED_NODE_KEY = "node";
    public static final String CONNECTION_KEY = "connection";
    public static final String DESCRIPTION_KEY = "description";
    public static final String TOOL_KIND_KEY = "toolKind";
    public static final String AGENT_VAR_NAME_KEY = "agentVarName";
    public static final String AGENT_RECEIVER_KEY = "agentReceiver";
    public static final String INCLUDE_CONTEXT_KEY = "includeContext";
    // When present, the tool method is written inside this agent-definition class (instead of module level).
    public static final String HOST_CLASS_NAME_KEY = "hostClassName";

    private static final String RUN = "run";
    private static final String RESPONSE_VAR = "response";
    private static final String INIT = "init";
    private static final String TOOLS_ARG = "tools";
    private static final String CLASS_MEMBER_INDENT = "    ";
    private static final Gson gson = new Gson();

    @Override
    public void setConcreteConstData() {
        metadata().label(LABEL).description(DESCRIPTION);
        codedata().node(NodeKind.AGENT_TOOL);
    }

    @Override
    public void setConcreteTemplateData(TemplateContext context) {
        // The tool signature (function name + parameters) is supplied by the caller; the wrapped node / connection
        // ride in codedata.data. A function-shaped template is provided for completeness.
        properties().functionNameTemplate("tool", context.getAllVisibleSymbolNames());
        FunctionDefinitionBuilder.setMandatoryProperties(this, "", "", "");
        FunctionDefinitionBuilder.setOptionalProperties(this);
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
        String connection = data.get(CONNECTION_KEY) != null ? data.get(CONNECTION_KEY).toString() : "";
        String agentVarName = data.get(AGENT_VAR_NAME_KEY) != null ? data.get(AGENT_VAR_NAME_KEY).toString() : "";
        String agentReceiver = data.get(AGENT_RECEIVER_KEY) != null
                ? data.get(AGENT_RECEIVER_KEY).toString() : agentVarName;
        boolean includeContext = Boolean.parseBoolean(String.valueOf(data.get(INCLUDE_CONTEXT_KEY)));
        String description = data.get(DESCRIPTION_KEY) != null ? data.get(DESCRIPTION_KEY).toString()
                : sourceBuilder.getProperty(Property.FUNCTION_NAME_DESCRIPTION_KEY)
                        .map(property -> property.value().toString()).orElse("");
        if (kind == ToolKind.AGENT_CALL && description.isBlank()) {
            description = "Delegates a query to the " + agentVarName + " agent.";
        }
        // When set, the tool method is placed inside this agent-definition class rather than at module level.
        String hostClassName = data.get(HOST_CLASS_NAME_KEY) != null ? data.get(HOST_CLASS_NAME_KEY).toString() : null;

        SemanticModel semanticModel = sourceBuilder.workspaceManager.semanticModel(sourceBuilder.filePath)
                .orElse(null);
        // Agent-call has no wrapped node, so it writes through the tool node (AGENT_TOOL + isNew → agents.bal).
        FlowNode genNode = wrappedNode != null ? wrappedNode : toolNode;
        if (hostClassName != null) {
            // Pin generation to the class file so imports/placement resolve there instead of functions.bal/agents.bal.
            genNode = withData(genNode, Constants.FILE_PATH_KEY, sourceBuilder.filePath.toString());
        }
        SourceBuilder sb = new SourceBuilder(genNode, sourceBuilder.workspaceManager, sourceBuilder.filePath);
        String iconPath = wrappedNode != null && wrappedNode.metadata() != null ? wrappedNode.metadata().icon() : "";

        ToolGenContext context = new ToolGenContext(sb, wrappedNode, data, connection, description, toolName,
                toolParams, semanticModel, sourceBuilder.workspaceManager, sourceBuilder.filePath, iconPath,
                agentVarName, agentReceiver, hostClassName, includeContext);
        Map<Path, List<TextEdit>> textEdits = generate(kind, context);
        if (hostClassName != null) {
            relocateToolIntoClass(textEdits, sb.filePath, hostClassName, toolName, sourceBuilder.workspaceManager);
        }
        return textEdits;
    }

    private static FlowNode withData(FlowNode node, String key, Object value) {
        Codedata codedata = new Codedata.Builder<>(null).from(node.codedata()).addData(key, value).build();
        return new FlowNode(node.id(), node.metadata(), codedata, node.returning(), node.branches(),
                node.properties(), node.diagnostics(), node.flags());
    }

    // Moves the tool function into the class body (after the last member, indented) and wires self.<tool> into the
    // inner agent's tools = [...] — one atomic response.
    private static void relocateToolIntoClass(Map<Path, List<TextEdit>> textEdits, Path classFile, String className,
                                              String toolName, WorkspaceManager workspaceManager) {
        List<TextEdit> classEdits = textEdits.get(classFile);
        if (classEdits == null || classEdits.isEmpty()) {
            return;
        }
        Document document = FileSystemUtils.getDocument(workspaceManager, classFile);
        if (document == null) {
            return;
        }
        ClassDefinitionNode classNode = findClass(document.syntaxTree().rootNode(), className);
        if (classNode == null) {
            return;
        }
        // Find the function edit by signature — build() prepends the import edits, so it isn't necessarily first.
        TextEdit functionEdit = classEdits.stream()
                .filter(edit -> edit.getNewText().contains("function " + toolName + "("))
                .findFirst()
                .orElse(null);
        if (functionEdit == null) {
            return;
        }
        LinePosition insertPosition = classNode.members().isEmpty()
                ? classNode.openBrace().lineRange().endLine()
                : classNode.members().get(classNode.members().size() - 1).lineRange().endLine();
        functionEdit.setRange(CommonUtils.toRange(insertPosition));
        functionEdit.setNewText(CLASS_MEMBER_INDENT
                + functionEdit.getNewText().replace("\n", "\n" + CLASS_MEMBER_INDENT));

        wireToolIntoList(classNode, toolName).ifPresent(classEdits::add);
    }

    private static ClassDefinitionNode findClass(ModulePartNode root, String className) {
        for (ModuleMemberDeclarationNode member : root.members()) {
            if (member instanceof ClassDefinitionNode classDef && classDef.className().text().equals(className)) {
                return classDef;
            }
        }
        return null;
    }

    // Appends `self.<tool>` to the inner agent's `tools = [...]` list (empty → [self.x]; non-empty → , self.x).
    private static Optional<TextEdit> wireToolIntoList(ClassDefinitionNode classNode, String toolName) {
        ListConstructorExpressionNode toolsList = findInnerToolsList(classNode);
        if (toolsList == null) {
            return Optional.empty();
        }
        String element = "self." + toolName;
        if (toolsList.expressions().isEmpty()) {
            return Optional.of(new TextEdit(
                    CommonUtils.toRange(toolsList.openBracket().lineRange().endLine()), element));
        }
        return Optional.of(new TextEdit(
                CommonUtils.toRange(toolsList.closeBracket().lineRange().startLine()), ", " + element));
    }

    private static ListConstructorExpressionNode findInnerToolsList(ClassDefinitionNode classNode) {
        for (Node member : classNode.members()) {
            if (!(member instanceof FunctionDefinitionNode func) || !func.functionName().text().equals(INIT)
                    || !(func.functionBody() instanceof FunctionBodyBlockNode body)) {
                continue;
            }
            for (StatementNode statement : body.statements()) {
                ListConstructorExpressionNode tools = extractToolsFromAssignment(statement);
                if (tools != null) {
                    return tools;
                }
            }
        }
        return null;
    }

    // From a `self.<field> = (check) new (... tools = [...] ...)` statement, returns the tools list (or null).
    private static ListConstructorExpressionNode extractToolsFromAssignment(StatementNode statement) {
        if (!(statement instanceof AssignmentStatementNode assignment)) {
            return null;
        }
        ExpressionNode expression = assignment.expression();
        if (expression instanceof CheckExpressionNode checkExpr) {
            expression = checkExpr.expression();
        }
        SeparatedNodeList<FunctionArgumentNode> args;
        if (expression instanceof ImplicitNewExpressionNode implicitNew) {
            if (implicitNew.parenthesizedArgList().isEmpty()) {
                return null;
            }
            args = implicitNew.parenthesizedArgList().get().arguments();
        } else if (expression instanceof ExplicitNewExpressionNode explicitNew) {
            args = explicitNew.parenthesizedArgList().arguments();
        } else {
            return null;
        }
        for (FunctionArgumentNode arg : args) {
            if (arg instanceof NamedArgumentNode namedArg && namedArg.argumentName().name().text().equals(TOOLS_ARG)
                    && namedArg.expression() instanceof ListConstructorExpressionNode list) {
                return list;
            }
        }
        return null;
    }

    private static Map<Path, List<TextEdit>> generate(ToolKind kind, ToolGenContext ctx) {
        ctx.sb.acceptImport(Constants.Ai.BALLERINA_ORG, Constants.Ai.AI_PACKAGE);
        List<ToolParam> params = kind.resolveParams(ctx);
        ReturnInfo returnInfo = kind.resolveReturn(ctx);

        emitDoc(ctx, params, returnInfo);
        emitAnnotation(ctx);
        if (kind.hasDisplay()) {
            emitDisplay(ctx);
        }
        emitSignature(ctx, params, returnInfo);

        return kind.buildBody(ctx, params, returnInfo);
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

    private static void emitAnnotation(ToolGenContext ctx) {
        Map<String, Object> data = ctx.data != null && ctx.data.containsKey("auth")
                ? ctx.data
                : ctx.wrappedNode != null ? ctx.wrappedNode.codedata().data() : null;
        if (data == null || !data.containsKey("auth")) {
            ctx.sb.token().name("@ai:AgentTool").name(System.lineSeparator());
            return;
        }

        String authStr = data.get("auth").toString();
        JsonObject authConfig = gson.fromJson(authStr, JsonObject.class);

        StringBuilder sb = new StringBuilder();
        sb.append("@ai:AgentTool {").append(System.lineSeparator());
        sb.append("    auth: {").append(System.lineSeparator());

        List<String> fields = new ArrayList<>();
        for (Map.Entry<String, JsonElement> entry : authConfig.entrySet()) {
            String key = entry.getKey();
            String value = entry.getValue().getAsString();

            // Skip fields with empty or default values
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

        if (fields.isEmpty()) {
            ctx.sb.token().name("@ai:AgentTool").name(System.lineSeparator());
            return;
        }

        sb.append(String.join("," + System.lineSeparator(), fields)).append(System.lineSeparator());
        sb.append("    }").append(System.lineSeparator());
        sb.append("}");

        ctx.sb.token().name(sb.toString()).name(System.lineSeparator());
    }

    /**
     * The kinds of agent tool the builder can emit. Each constant owns its parameter resolution, return-type
     * resolution, whether it carries an {@code @display} annotation, and its body.
     */
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
            Map<Path, List<TextEdit>> buildBody(ToolGenContext ctx, List<ToolParam> params, ReturnInfo returnInfo) {
                ctx.sb.token().keyword(SyntaxKind.OPEN_BRACE_TOKEN).keyword(SyntaxKind.CLOSE_BRACE_TOKEN);
                ctx.sb.textEdit(SourceBuilder.SourceKind.DECLARATION).acceptImport();
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
            Map<Path, List<TextEdit>> buildBody(ToolGenContext ctx, List<ToolParam> params, ReturnInfo returnInfo) {
                return buildFunctionBody(ctx, returnInfo);
            }
        },
        REMOTE {
            @Override
            ReturnInfo resolveReturn(ToolGenContext ctx) {
                Optional<Property> optReturnType = ctx.sb.getProperty(Property.TYPE_KEY);
                if (optReturnType.isEmpty()) {
                    return new ReturnInfo("", FlowNodeUtil.hasCheckKeyFlagSet(ctx.wrappedNode), null);
                }
                Property returnProperty = optReturnType.get();
                String typeName = resolveReturnType(ctx.wrappedNode, returnProperty, ctx.sb);
                return new ReturnInfo(typeName, FlowNodeUtil.hasCheckKeyFlagSet(ctx.wrappedNode),
                        returnProperty.metadata().description());
            }

            @Override
            Map<Path, List<TextEdit>> buildBody(ToolGenContext ctx, List<ToolParam> params, ReturnInfo returnInfo) {
                return buildRemoteActionBody(ctx, params, returnInfo);
            }
        },
        RESOURCE {
            @Override
            ReturnInfo resolveReturn(ToolGenContext ctx) {
                Optional<Property> optReturnType = ctx.sb.getProperty(Property.TYPE_KEY);
                String typeName = optReturnType
                        .map(property -> resolveReturnType(ctx.wrappedNode, property, ctx.sb)).orElse("");
                return new ReturnInfo(typeName, FlowNodeUtil.hasCheckKeyFlagSet(ctx.wrappedNode), null);
            }

            @Override
            Map<Path, List<TextEdit>> buildBody(ToolGenContext ctx, List<ToolParam> params, ReturnInfo returnInfo) {
                return buildResourceActionBody(ctx, params, returnInfo);
            }
        },
        AGENT_CALL {
            @Override
            List<ToolParam> resolveParams(ToolGenContext ctx) {
                List<ToolParam> params = new ArrayList<>();
                if (ctx.includeContext) {
                    params.add(new ToolParam("ai:Context context", "context", null));
                }
                params.add(new ToolParam("string query", "query",
                        "The request to send to the " + ctx.agentVarName + " agent."));
                return params;
            }

            @Override
            ReturnInfo resolveReturn(ToolGenContext ctx) {
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
            Map<Path, List<TextEdit>> buildBody(ToolGenContext ctx, List<ToolParam> params, ReturnInfo returnInfo) {
                return buildAgentCallBody(ctx, returnInfo);
            }
        };

        List<ToolParam> resolveParams(ToolGenContext ctx) {
            return wrappedToolParams(ctx.toolParams);
        }

        abstract ReturnInfo resolveReturn(ToolGenContext ctx);

        boolean hasDisplay() {
            return true;
        }

        abstract Map<Path, List<TextEdit>> buildBody(ToolGenContext ctx, List<ToolParam> params, ReturnInfo returnInfo);

        // An explicit codedata.data.toolKind wins; otherwise the wrapped node's kind selects the handler.
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
            String module = flowNode.codedata().module();
            if (module != null) {
                funcName = flowNode.codedata().getModulePrefix() + ":" + funcName;
            }
        }

        // Build a lookup of tool input variable names keyed by parameter name
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
            // FUNCTION_CALL: iterate properties in order to preserve argument position.
            // Only include properties that are actual function call arguments (have a
            // codedata.kind like REQUIRED or DEFAULTABLE), not metadata properties.
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
                    // Has a tool input — use mapping override if set, otherwise the variable name
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
                    // No tool input — use the mapping expression directly
                    args.add(prop.value().toString());
                }
            }
        } else {
            // FUNCTION_DEFINITION: arguments come only from the parameters map
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
        Map<Path, List<TextEdit>> textEdits = sourceBuilder.build();
        List<TextEdit> te = new ArrayList<>();
        Path p = addIsolateKeyword(ctx.semanticModel, funcName.trim(), ctx.filePath, te, ctx.workspaceManager);
        if (p != null) {
            textEdits.put(p, te);
        }
        return textEdits;
    }

    private static Map<Path, List<TextEdit>> buildRemoteActionBody(ToolGenContext ctx, List<ToolParam> params,
                                                                   ReturnInfo returnInfo) {
        SourceBuilder sourceBuilder = ctx.sb;
        FlowNode flowNode = ctx.wrappedNode;
        String returnType = returnInfo.typeName();
        Set<String> ignoredKeys = new HashSet<>(List.of(Property.VARIABLE_KEY, Property.TYPE_KEY, TARGET_TYPE,
                Property.CONNECTION_KEY, Property.CHECK_ERROR_KEY));
        sourceBuilder.token().keyword(SyntaxKind.OPEN_BRACE_TOKEN);

        if (!returnType.isEmpty()) {
            sourceBuilder.token().expressionWithType(returnType,
                    flowNode.getProperty(Property.VARIABLE_KEY).orElseThrow()).keyword(SyntaxKind.EQUAL_TOKEN);
        }
        if (FlowNodeUtil.hasCheckKeyFlagSet(flowNode)) {
            sourceBuilder.token().keyword(SyntaxKind.CHECK_KEYWORD);
        }
        sourceBuilder.token()
                .name(ctx.connection)
                .keyword(SyntaxKind.RIGHT_ARROW_TOKEN)
                .name(flowNode.metadata().label())
                .stepOut()
                .functionParameters(flowNode, ignoredKeys);

        if (!returnType.isEmpty()) {
            sourceBuilder.token()
                    .keyword(SyntaxKind.RETURN_KEYWORD)
                    .name(flowNode.getProperty(Property.VARIABLE_KEY).get().value().toString())
                    .endOfStatement();
        }
        sourceBuilder.token()
                .keyword(SyntaxKind.CLOSE_BRACE_TOKEN);
        sourceBuilder.textEdit(SourceBuilder.SourceKind.DECLARATION);
        if (needsModuleImport(flowNode, returnType, paramDecls(params))) {
            sourceBuilder.acceptImport();
        }
        return sourceBuilder.build();
    }

    private static Map<Path, List<TextEdit>> buildResourceActionBody(ToolGenContext ctx, List<ToolParam> params,
                                                                     ReturnInfo returnInfo) {
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
                if (kind.equals(ParameterData.Kind.PATH_PARAM.name()) ||
                        kind.equals(ParameterData.Kind.PATH_REST_PARAM.name())) {
                    pathParams.add(key);
                }
            }
        }
        sourceBuilder.token().keyword(SyntaxKind.OPEN_BRACE_TOKEN);

        if (!returnType.isEmpty()) {
            sourceBuilder.token().expressionWithType(returnType,
                    flowNode.getProperty(Property.VARIABLE_KEY).orElseThrow()).keyword(SyntaxKind.EQUAL_TOKEN);
        }
        if (FlowNodeUtil.hasCheckKeyFlagSet(flowNode)) {
            sourceBuilder.token().keyword(SyntaxKind.CHECK_KEYWORD);
        }

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

        if (!returnType.isEmpty()) {
            sourceBuilder.token()
                    .keyword(SyntaxKind.RETURN_KEYWORD)
                    .name(flowNode.getProperty(Property.VARIABLE_KEY).get().value().toString())
                    .endOfStatement();
        }
        sourceBuilder.token()
                .keyword(SyntaxKind.CLOSE_BRACE_TOKEN);
        sourceBuilder.textEdit(SourceBuilder.SourceKind.DECLARATION);
        if (needsModuleImport(flowNode, returnType, paramDecls(params))) {
            sourceBuilder.acceptImport();
        }
        return sourceBuilder.build();
    }

    private static Map<Path, List<TextEdit>> buildAgentCallBody(ToolGenContext ctx, ReturnInfo returnInfo) {
        SourceBuilder sourceBuilder = ctx.sb;
        String runArgs = ctx.includeContext ? "query, context = context" : "query";
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
        sourceBuilder.textEdit(SourceBuilder.SourceKind.DECLARATION);
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

    private static List<String> paramDecls(List<ToolParam> params) {
        return params.stream().map(ToolParam::decl).collect(Collectors.toList());
    }

    private static boolean needsModuleImport(FlowNode flowNode, String returnType, List<String> paramList) {
        String modulePrefix = flowNode.codedata().getModulePrefix() + ":";
        if (returnType.contains(modulePrefix)) {
            return true;
        }
        for (String param : paramList) {
            if (param.contains(modulePrefix)) {
                return true;
            }
        }
        return false;
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
                // Use user-provided value if set, otherwise fall back to defaultValue
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
                // Ensure the variable name produces a unique type name by checking types.bal
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
                        // Strip trailing digits to get the base prefix (e.g. "var1" -> "var"),
                        // matching how the LS generates unique variable names (var, var1, var2...)
                        String baseVarName = varName.replaceAll("\\d+$", "");
                        // Convert type names to their variable form for collision checking
                        Set<String> usedVarNames = new HashSet<>();
                        // Include the base name so numbering starts from 1 (var1, var2...)
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
                        returnProperty.value().toString());
            }
        }
        Optional<Property> optTargetType = flowNode.getProperty(TARGET_TYPE);
        String returnType;
        if (optTargetType.isPresent() && optTargetType.get().value() != null
                && !optTargetType.get().value().toString().isEmpty()) {
            returnType = optTargetType.get().value().toString();
        } else if (optTargetType.isPresent()) {
            String defaultType = optTargetType.get().defaultValue();
            returnType = (defaultType != null && !defaultType.isEmpty()) ? defaultType : "json";
        } else {
            returnType = returnProperty.value().toString();
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

    // Wrapper return type from <agentVarName>.run(...); built-in/unresolvable/anydata fall back to string.
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
        if (type.kind() != SymbolKind.CLASS || CommonUtils.isAgentClass(type)) {
            return "string";
        }
        MethodSymbol runMethod = ((ClassSymbol) type).methods().get(RUN);
        if (runMethod == null) {
            return "string";
        }
        Optional<TypeSymbol> optReturn = runMethod.typeDescriptor().returnTypeDescriptor();
        if (optReturn.isEmpty()) {
            return "string";
        }
        acceptTypeImports(optReturn.get(), hostModule, sourceBuilder);
        String signature = CommonUtils.getTypeSignature(semanticModel, optReturn.get(), true, hostModule);
        if (signature.isBlank() || signature.equals("anydata") || signature.equals("()")) {
            return "string";
        }
        return signature;
    }

    private static ModuleInfo resolveHostModule(Path filePath, WorkspaceManager workspaceManager) {
        try {
            workspaceManager.loadProject(filePath);
            return workspaceManager.module(filePath).map(module -> ModuleInfo.from(module.descriptor())).orElse(null);
        } catch (WorkspaceDocumentException | EventSyncException e) {
            return null;
        }
    }

    private static void acceptTypeImports(TypeSymbol typeSymbol, ModuleInfo hostModule, SourceBuilder sourceBuilder) {
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
            LinePosition startLine = lineRange.startLine();
            int offset = startLine.offset() - SyntaxKind.FUNCTION_KEYWORD.stringValue().length() - 1;
            int line = startLine.line();
            Position position = new Position(line, offset);
            textEdits.add(new TextEdit(new Range(position, position), "isolated "));
            return functionFile;
        }
        return null;
    }

    // decl is the full declaration, e.g. "string city".
    private record ToolParam(String decl, String name, String doc) {
    }

    // typeName is "" when there is no return type.
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
