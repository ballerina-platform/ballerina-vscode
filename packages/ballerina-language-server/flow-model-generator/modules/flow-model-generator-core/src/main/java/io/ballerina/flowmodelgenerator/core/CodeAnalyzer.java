/*
 *  Copyright (c) 2024, WSO2 LLC. (http://www.wso2.com)
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

package io.ballerina.flowmodelgenerator.core;

import com.google.gson.Gson;
import io.ballerina.compiler.api.ModuleID;
import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.api.symbols.AnnotationAttachmentSymbol;
import io.ballerina.compiler.api.symbols.ClassFieldSymbol;
import io.ballerina.compiler.api.symbols.ClassSymbol;
import io.ballerina.compiler.api.symbols.Documentation;
import io.ballerina.compiler.api.symbols.FunctionSymbol;
import io.ballerina.compiler.api.symbols.FunctionTypeSymbol;
import io.ballerina.compiler.api.symbols.MethodSymbol;
import io.ballerina.compiler.api.symbols.ModuleSymbol;
import io.ballerina.compiler.api.symbols.ParameterKind;
import io.ballerina.compiler.api.symbols.ParameterSymbol;
import io.ballerina.compiler.api.symbols.Qualifier;
import io.ballerina.compiler.api.symbols.RecordFieldSymbol;
import io.ballerina.compiler.api.symbols.RecordTypeSymbol;
import io.ballerina.compiler.api.symbols.Symbol;
import io.ballerina.compiler.api.symbols.SymbolKind;
import io.ballerina.compiler.api.symbols.TypeDefinitionSymbol;
import io.ballerina.compiler.api.symbols.TypeDescKind;
import io.ballerina.compiler.api.symbols.TypeReferenceTypeSymbol;
import io.ballerina.compiler.api.symbols.TypeSymbol;
import io.ballerina.compiler.api.symbols.UnionTypeSymbol;
import io.ballerina.compiler.api.symbols.VariableSymbol;
import io.ballerina.compiler.api.values.ConstantValue;
import io.ballerina.compiler.syntax.tree.AnnotationNode;
import io.ballerina.compiler.syntax.tree.AssignmentStatementNode;
import io.ballerina.compiler.syntax.tree.BinaryExpressionNode;
import io.ballerina.compiler.syntax.tree.BindingPatternNode;
import io.ballerina.compiler.syntax.tree.BlockStatementNode;
import io.ballerina.compiler.syntax.tree.BreakStatementNode;
import io.ballerina.compiler.syntax.tree.ByteArrayLiteralNode;
import io.ballerina.compiler.syntax.tree.CheckExpressionNode;
import io.ballerina.compiler.syntax.tree.ClassDefinitionNode;
import io.ballerina.compiler.syntax.tree.ClientResourceAccessActionNode;
import io.ballerina.compiler.syntax.tree.CommentNode;
import io.ballerina.compiler.syntax.tree.CommitActionNode;
import io.ballerina.compiler.syntax.tree.CompoundAssignmentStatementNode;
import io.ballerina.compiler.syntax.tree.ComputedResourceAccessSegmentNode;
import io.ballerina.compiler.syntax.tree.ContinueStatementNode;
import io.ballerina.compiler.syntax.tree.DoStatementNode;
import io.ballerina.compiler.syntax.tree.ElseBlockNode;
import io.ballerina.compiler.syntax.tree.ExplicitNewExpressionNode;
import io.ballerina.compiler.syntax.tree.ExpressionNode;
import io.ballerina.compiler.syntax.tree.ExpressionStatementNode;
import io.ballerina.compiler.syntax.tree.FailStatementNode;
import io.ballerina.compiler.syntax.tree.FieldAccessExpressionNode;
import io.ballerina.compiler.syntax.tree.ForEachStatementNode;
import io.ballerina.compiler.syntax.tree.ForkStatementNode;
import io.ballerina.compiler.syntax.tree.FunctionArgumentNode;
import io.ballerina.compiler.syntax.tree.FunctionBodyBlockNode;
import io.ballerina.compiler.syntax.tree.FunctionBodyNode;
import io.ballerina.compiler.syntax.tree.FunctionCallExpressionNode;
import io.ballerina.compiler.syntax.tree.FunctionDefinitionNode;
import io.ballerina.compiler.syntax.tree.FunctionSignatureNode;
import io.ballerina.compiler.syntax.tree.IfElseStatementNode;
import io.ballerina.compiler.syntax.tree.ImplicitNewExpressionNode;
import io.ballerina.compiler.syntax.tree.ListBindingPatternNode;
import io.ballerina.compiler.syntax.tree.ListConstructorExpressionNode;
import io.ballerina.compiler.syntax.tree.LocalTypeDefinitionStatementNode;
import io.ballerina.compiler.syntax.tree.LockStatementNode;
import io.ballerina.compiler.syntax.tree.MappingConstructorExpressionNode;
import io.ballerina.compiler.syntax.tree.MappingFieldNode;
import io.ballerina.compiler.syntax.tree.MatchClauseNode;
import io.ballerina.compiler.syntax.tree.MatchGuardNode;
import io.ballerina.compiler.syntax.tree.MatchStatementNode;
import io.ballerina.compiler.syntax.tree.MetadataNode;
import io.ballerina.compiler.syntax.tree.MethodCallExpressionNode;
import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.compiler.syntax.tree.ModuleVariableDeclarationNode;
import io.ballerina.compiler.syntax.tree.NameReferenceNode;
import io.ballerina.compiler.syntax.tree.NamedArgumentNode;
import io.ballerina.compiler.syntax.tree.NamedWorkerDeclarationNode;
import io.ballerina.compiler.syntax.tree.NamedWorkerDeclarator;
import io.ballerina.compiler.syntax.tree.NewExpressionNode;
import io.ballerina.compiler.syntax.tree.Node;
import io.ballerina.compiler.syntax.tree.NodeList;
import io.ballerina.compiler.syntax.tree.NodeVisitor;
import io.ballerina.compiler.syntax.tree.NonTerminalNode;
import io.ballerina.compiler.syntax.tree.ObjectFieldNode;
import io.ballerina.compiler.syntax.tree.OnFailClauseNode;
import io.ballerina.compiler.syntax.tree.OptionalTypeDescriptorNode;
import io.ballerina.compiler.syntax.tree.PanicStatementNode;
import io.ballerina.compiler.syntax.tree.ParameterNode;
import io.ballerina.compiler.syntax.tree.ParenthesizedArgList;
import io.ballerina.compiler.syntax.tree.PositionalArgumentNode;
import io.ballerina.compiler.syntax.tree.QualifiedNameReferenceNode;
import io.ballerina.compiler.syntax.tree.QueryActionNode;
import io.ballerina.compiler.syntax.tree.RemoteMethodCallActionNode;
import io.ballerina.compiler.syntax.tree.RequiredParameterNode;
import io.ballerina.compiler.syntax.tree.RetryStatementNode;
import io.ballerina.compiler.syntax.tree.ReturnStatementNode;
import io.ballerina.compiler.syntax.tree.ReturnTypeDescriptorNode;
import io.ballerina.compiler.syntax.tree.RollbackStatementNode;
import io.ballerina.compiler.syntax.tree.SeparatedNodeList;
import io.ballerina.compiler.syntax.tree.ServiceDeclarationNode;
import io.ballerina.compiler.syntax.tree.SimpleNameReferenceNode;
import io.ballerina.compiler.syntax.tree.SpecificFieldNode;
import io.ballerina.compiler.syntax.tree.StartActionNode;
import io.ballerina.compiler.syntax.tree.StatementNode;
import io.ballerina.compiler.syntax.tree.SyntaxKind;
import io.ballerina.compiler.syntax.tree.TemplateExpressionNode;
import io.ballerina.compiler.syntax.tree.Token;
import io.ballerina.compiler.syntax.tree.TransactionStatementNode;
import io.ballerina.compiler.syntax.tree.TupleTypeDescriptorNode;
import io.ballerina.compiler.syntax.tree.TypedBindingPatternNode;
import io.ballerina.compiler.syntax.tree.VariableDeclarationNode;
import io.ballerina.compiler.syntax.tree.WaitActionNode;
import io.ballerina.compiler.syntax.tree.WaitFieldsListNode;
import io.ballerina.compiler.syntax.tree.WhileStatementNode;
import io.ballerina.flowmodelgenerator.core.model.Branch;
import io.ballerina.flowmodelgenerator.core.model.Codedata;
import io.ballerina.flowmodelgenerator.core.model.CommentProperty;
import io.ballerina.flowmodelgenerator.core.model.Diagnostics;
import io.ballerina.flowmodelgenerator.core.model.FlowNode;
import io.ballerina.flowmodelgenerator.core.model.FormBuilder;
import io.ballerina.flowmodelgenerator.core.model.ItemOption;
import io.ballerina.flowmodelgenerator.core.model.NodeBuilder;
import io.ballerina.flowmodelgenerator.core.model.NodeKind;
import io.ballerina.flowmodelgenerator.core.model.Option;
import io.ballerina.flowmodelgenerator.core.model.Property;
import io.ballerina.flowmodelgenerator.core.model.node.ActivityCallBuilder;
import io.ballerina.flowmodelgenerator.core.model.node.AgentBuilder;
import io.ballerina.flowmodelgenerator.core.model.node.AgentCallBuilder;
import io.ballerina.flowmodelgenerator.core.model.node.AssignBuilder;
import io.ballerina.flowmodelgenerator.core.model.node.BinaryBuilder;
import io.ballerina.flowmodelgenerator.core.model.node.CallBuilder;
import io.ballerina.flowmodelgenerator.core.model.node.ChunkerBuilder;
import io.ballerina.flowmodelgenerator.core.model.node.ClassInitBuilder;
import io.ballerina.flowmodelgenerator.core.model.node.DataLoaderBuilder;
import io.ballerina.flowmodelgenerator.core.model.node.DataMapperBuilder;
import io.ballerina.flowmodelgenerator.core.model.node.EmbeddingProviderBuilder;
import io.ballerina.flowmodelgenerator.core.model.node.FailBuilder;
import io.ballerina.flowmodelgenerator.core.model.node.FunctionCall;
import io.ballerina.flowmodelgenerator.core.model.node.FunctionDefinitionBuilder;
import io.ballerina.flowmodelgenerator.core.model.node.HumanTaskBuilder;
import io.ballerina.flowmodelgenerator.core.model.node.IfBuilder;
import io.ballerina.flowmodelgenerator.core.model.node.JsonPayloadBuilder;
import io.ballerina.flowmodelgenerator.core.model.node.KnowledgeBaseBuilder;
import io.ballerina.flowmodelgenerator.core.model.node.McpToolKitBuilder;
import io.ballerina.flowmodelgenerator.core.model.node.MemoryBuilder;
import io.ballerina.flowmodelgenerator.core.model.node.MethodCall;
import io.ballerina.flowmodelgenerator.core.model.node.ModelProviderBuilder;
import io.ballerina.flowmodelgenerator.core.model.node.NewConnectionBuilder;
import io.ballerina.flowmodelgenerator.core.model.node.PanicBuilder;
import io.ballerina.flowmodelgenerator.core.model.node.RemoteActionCallBuilder;
import io.ballerina.flowmodelgenerator.core.model.node.ResourceActionCallBuilder;
import io.ballerina.flowmodelgenerator.core.model.node.ReturnBuilder;
import io.ballerina.flowmodelgenerator.core.model.node.RollbackBuilder;
import io.ballerina.flowmodelgenerator.core.model.node.ShortTermMemoryStoreBuilder;
import io.ballerina.flowmodelgenerator.core.model.node.StartBuilder;
import io.ballerina.flowmodelgenerator.core.model.node.VariableBuilder;
import io.ballerina.flowmodelgenerator.core.model.node.VectorStoreBuilder;
import io.ballerina.flowmodelgenerator.core.model.node.WaitBuilder;
import io.ballerina.flowmodelgenerator.core.model.node.WaitDataBuilder;
import io.ballerina.flowmodelgenerator.core.model.node.WorkflowRunBuilder;
import io.ballerina.flowmodelgenerator.core.model.node.XmlPayloadBuilder;
import io.ballerina.flowmodelgenerator.core.model.node.builtin.BuiltinActivityStrategy;
import io.ballerina.flowmodelgenerator.core.model.node.builtin.EmailActivityStrategy;
import io.ballerina.flowmodelgenerator.core.model.node.builtin.RestActivityStrategy;
import io.ballerina.flowmodelgenerator.core.model.node.builtin.SoapActivityStrategy;
import io.ballerina.flowmodelgenerator.core.utils.ConnectorUtil;
import io.ballerina.flowmodelgenerator.core.utils.FileSystemUtils;
import io.ballerina.flowmodelgenerator.core.utils.FlowNodeUtil;
import io.ballerina.flowmodelgenerator.core.utils.ParamUtils;
import io.ballerina.modelgenerator.commons.CommonUtils;
import io.ballerina.modelgenerator.commons.FunctionData;
import io.ballerina.modelgenerator.commons.FunctionDataBuilder;
import io.ballerina.modelgenerator.commons.ModuleInfo;
import io.ballerina.modelgenerator.commons.PackageUtil;
import io.ballerina.modelgenerator.commons.ParameterData;
import io.ballerina.projects.Document;
import io.ballerina.projects.Module;
import io.ballerina.projects.Package;
import io.ballerina.projects.Project;
import io.ballerina.tools.diagnostics.DiagnosticSeverity;
import io.ballerina.tools.diagnostics.Location;
import io.ballerina.tools.text.LinePosition;
import io.ballerina.tools.text.LineRange;
import io.ballerina.tools.text.TextDocument;
import org.ballerinalang.langserver.common.utils.CommonUtil;
import org.ballerinalang.langserver.commons.workspace.WorkspaceManager;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Queue;
import java.util.Set;
import java.util.Stack;
import java.util.TreeMap;
import java.util.function.Predicate;
import java.util.stream.Collectors;

import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.ACTIVITY_MODULE;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.AWAIT_METHOD_NAME;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.BUILTIN_EMAIL_FUNCTION;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.BUILTIN_REST_FUNCTION;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.BUILTIN_SOAP_FUNCTION;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.CALL_ACTIVITY_METHOD_NAME;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.CALL_HUMAN_TASK_METHOD_NAME;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.CONTEXT_CLASS_NAME;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.HUMAN_TASK_DESCRIPTION;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.HUMAN_TASK_LABEL;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.SLEEP_DESCRIPTION;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.SLEEP_LABEL;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.SLEEP_METHOD_NAME;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.WORKFLOW_MODULE;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.WORKFLOW_ORG;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.RUN_METHOD_NAME;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.RUN_PROCESS_FUNCTION_PARAM;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.SEND_DATA_METHOD_NAME;
import static io.ballerina.flowmodelgenerator.core.model.node.ActivityCallBuilder.EXCLUDED_CALL_ACTIVITY_PARAMS;
import static io.ballerina.flowmodelgenerator.core.model.node.WaitDataBuilder.EXCLUDED_KEYS;
import static io.ballerina.flowmodelgenerator.core.utils.WorkflowUtil.isActivityFunction;
import static io.ballerina.flowmodelgenerator.core.utils.WorkflowUtil.isWorkflowFunction;
import static io.ballerina.flowmodelgenerator.core.utils.WorkflowUtil.isWorkflowModule;
import static io.ballerina.modelgenerator.commons.CommonUtils.BALLERINA_ORG_NAME;
import static io.ballerina.modelgenerator.commons.CommonUtils.CONNECTOR_TYPE;
import static io.ballerina.modelgenerator.commons.CommonUtils.PERSIST;
import static io.ballerina.modelgenerator.commons.CommonUtils.PERSIST_MODEL_FILE;
import static io.ballerina.modelgenerator.commons.CommonUtils.getClientClassSymbol;
import static io.ballerina.modelgenerator.commons.CommonUtils.getPersistClientLabel;
import static io.ballerina.modelgenerator.commons.CommonUtils.getPersistModelFilePath;
import static io.ballerina.modelgenerator.commons.CommonUtils.isAgentClass;
import static io.ballerina.modelgenerator.commons.CommonUtils.isAiChunker;
import static io.ballerina.modelgenerator.commons.CommonUtils.isAiDataLoader;
import static io.ballerina.modelgenerator.commons.CommonUtils.isAiEmbeddingProvider;
import static io.ballerina.modelgenerator.commons.CommonUtils.isAiFixedReturnAgent;
import static io.ballerina.modelgenerator.commons.CommonUtils.isAiInferredReturnAgent;
import static io.ballerina.modelgenerator.commons.CommonUtils.isAiKnowledgeBase;
import static io.ballerina.modelgenerator.commons.CommonUtils.isAiMcpBaseToolKit;
import static io.ballerina.modelgenerator.commons.CommonUtils.isAiMemory;
import static io.ballerina.modelgenerator.commons.CommonUtils.isAiMemoryStore;
import static io.ballerina.modelgenerator.commons.CommonUtils.isAiModelModule;
import static io.ballerina.modelgenerator.commons.CommonUtils.isAiModelProvider;
import static io.ballerina.modelgenerator.commons.CommonUtils.isAiVectorStore;
import static io.ballerina.modelgenerator.commons.CommonUtils.isPersistClient;

/**
 * Analyzes the source code and generates the flow model.
 *
 * @since 1.0.0
 */
public class CodeAnalyzer extends NodeVisitor {

    public static final String PARAMETERIZED_QUERY = "sql:ParameterizedQuery";
    public static final String PARAMETERIZED_CALL_QUERY = "sql:ParameterizedCallQuery";
    // Readonly fields
    private final Project project;
    private final SemanticModel semanticModel;
    private final Map<String, LineRange> dataMappings;
    private final Map<String, LineRange> naturalFunctions;
    private final TextDocument textDocument;
    private final ModuleInfo moduleInfo;
    private final DiagnosticHandler diagnosticHandler;
    private final boolean forceAssign;
    private final String connectionScope;
    private final WorkspaceManager workspaceManager;
    private final Path filePath;

    // State fields
    private NodeBuilder nodeBuilder;
    private final List<FlowNode> flowNodeList;
    private final Stack<NodeBuilder> flowNodeBuilderStack;
    private TypedBindingPatternNode typedBindingPatternNode;
    private static final String AI_AGENT = "ai";
    public static final String ICON_PATH = CommonUtils.generateIcon(BALLERINA_ORG_NAME, "mcp", "0.4.2");
    public static final String MCP_TOOL_KIT = "McpToolKit";
    public static final String MCP_SERVER = "MCP Server";
    public static final String AGENT_TOOL_TYPE = "Agent";
    private static final String RUN_METHOD = "run";
    public static final String NAME = "name";
    private static final String DATA_MAPPINGS_BAL = "data_mappings.bal";

    // Agent field names
    private static final String FIELD_TOOLS = "tools";
    private static final String FIELD_MODEL = "model";
    private static final String FIELD_SYSTEM_PROMPT = "systemPrompt";
    private static final String FIELD_MEMORY = "memory";
    private static final String MODEL_PROVIDER_INTERFACE_NAME = "ModelProvider";

    // Metadata data keys
    private static final String KIND_KEY = "kind";
    private static final String LABEL_KEY = "label";
    private static final String IS_SERVICE_FUNCTION_KEY = "isServiceFunction";
    private static final String ACCESSOR_KEY = "accessor";

    public CodeAnalyzer(Project project, SemanticModel semanticModel, String connectionScope,
                        Map<String, LineRange> dataMappings, Map<String, LineRange> naturalFunctions,
                        TextDocument textDocument, ModuleInfo moduleInfo,
                        boolean forceAssign,
                        WorkspaceManager workspaceManager, Path filePath) {
        this.project = project;
        this.semanticModel = semanticModel;
        this.dataMappings = dataMappings;
        this.naturalFunctions = naturalFunctions;
        this.connectionScope = connectionScope;
        this.textDocument = textDocument;
        this.moduleInfo = moduleInfo;
        this.forceAssign = forceAssign;
        this.flowNodeList = new ArrayList<>();
        this.flowNodeBuilderStack = new Stack<>();
        // Source diagnostics from the package compilation (superset of the semantic model) so that compiler plugin
        // diagnostics are surfaced alongside semantic-phase ones.
        this.diagnosticHandler = new DiagnosticHandler(
                project.currentPackage().getCompilation().diagnosticResult().diagnostics());
        this.workspaceManager = workspaceManager;
        this.filePath = filePath;
    }

    @Override
    public void visit(FunctionDefinitionNode functionDefinitionNode) {
        Optional<Symbol> symbol = semanticModel.symbol(functionDefinitionNode);
        if (symbol.isEmpty()) {
            return;
        }
        Symbol funcSymbol = symbol.get();
        FunctionBodyNode functionBodyNode = functionDefinitionNode.functionBody();

        // Set the function kind to display in the flow model
        FunctionKind kind;
        NonTerminalNode parentNode = getParentNode(functionDefinitionNode);
        String functionName = functionDefinitionNode.functionName().text();
        String accessor = null;
        if (functionDefinitionNode.kind() == SyntaxKind.RESOURCE_ACCESSOR_DEFINITION) {
            accessor = functionName;
            functionName = getPathString(functionDefinitionNode.relativeResourcePath());
            if (parentNode instanceof ServiceDeclarationNode serviceDeclarationNode &&
                    isAgent(serviceDeclarationNode)) {
                kind = FunctionKind.AI_CHAT_AGENT;
            } else {
                kind = FunctionKind.RESOURCE;
            }
        } else if (functionDefinitionNode.qualifierList().stream()
                .anyMatch(qualifier -> qualifier.kind() == SyntaxKind.REMOTE_KEYWORD)) {
            kind = FunctionKind.REMOTE_FUNCTION;
        } else if (isWorkflowFunction(funcSymbol)) {
            kind = FunctionKind.WORKFLOW;
        } else if (isActivityFunction(funcSymbol)) {
            kind = FunctionKind.ACTIVITY;
        } else {
            kind = FunctionKind.FUNCTION;
        }

        startNode(NodeKind.EVENT_START, functionDefinitionNode).codedata()
                .lineRange(functionBodyNode.lineRange())
                .sourceCode(functionDefinitionNode.toSourceCode().strip());

        nodeBuilder.metadata()
                .addData(KIND_KEY, kind.getValue())
                .addData(LABEL_KEY, functionName)
                .addData(IS_SERVICE_FUNCTION_KEY, parentNode != null &&
                        (parentNode.kind() == SyntaxKind.SERVICE_DECLARATION ||
                                parentNode.kind() == SyntaxKind.CLASS_DEFINITION));
        if (accessor != null) {
            nodeBuilder.metadata().addData(ACCESSOR_KEY, accessor);
        }

        // Add the function signature to the metadata
        FunctionSignatureNode functionSignatureNode = functionDefinitionNode.functionSignature();
        List<String> parametersList = functionSignatureNode.parameters().stream()
                .map(parameter -> parameter.toSourceCode().strip())
                .toList();
        if (!parametersList.isEmpty()) {
            nodeBuilder.metadata().addData(FunctionDefinitionBuilder.METADATA_PARAMETERS_KEY, parametersList);
        }
        functionSignatureNode.returnTypeDesc().ifPresent(returnTypeDesc -> nodeBuilder.metadata()
                .addData(FunctionDefinitionBuilder.METADATA_RETURN_KEY, returnTypeDesc.type().toSourceCode().strip()));

        endNode();
        functionBodyNode.accept(this);
    }

    @Override
    public void visit(ObjectFieldNode objectFieldNode) {
        Optional<ExpressionNode> optExpr = objectFieldNode.expression();
        if (optExpr.isPresent()) {
            optExpr.get().accept(this);
            nodeBuilder.properties()
                    .type(objectFieldNode.typeName(), true)
                    .data(objectFieldNode.fieldName(), false, new HashSet<>());
            endNode(objectFieldNode);
        } else {
            // No inline expression - try to find initialization in init method
            Optional<Symbol> fieldSymbol = semanticModel.symbol(objectFieldNode.fieldName());
            if (fieldSymbol.isPresent() && fieldSymbol.get().kind() == SymbolKind.CLASS_FIELD) {
                Optional<AssignmentStatementNode> initAssignment = findFieldInitAssignment(fieldSymbol.get());
                if (initAssignment.isPresent()) {
                    AssignmentStatementNode assignmentStatementNode = initAssignment.get();
                    ExpressionNode initExpr = assignmentStatementNode.expression();
                    initExpr.accept(this);
                    if (isNodeUnidentified()) {
                        buildDefaultAssignNode(assignmentStatementNode, initExpr);
                        endNode(assignmentStatementNode);
                    } else {
                        nodeBuilder.properties()
                                .type(objectFieldNode.typeName(), true)
                                .data(objectFieldNode.fieldName(), false, new HashSet<>());
                        endNode(objectFieldNode);
                    }
                }
            }
        }
    }

    @Override
    public void visit(FunctionBodyBlockNode functionBodyBlockNode) {
        functionBodyBlockNode.namedWorkerDeclarator()
                .ifPresent(namedWorkerDeclarator -> namedWorkerDeclarator.accept(this));
        for (Node statementOrComment : functionBodyBlockNode.statementsWithComments()) {
            statementOrComment.accept(this);
        }
    }

    @Override
    public void visit(CommentNode commentNode) {
        Node node = commentNode.getCommentAttachedNode();
        LinePosition startPos = textDocument.linePositionFrom(node.textRangeWithMinutiae().startOffset());
        int offset = 0;
        if (!(node instanceof Token)) {
            offset = node.textRangeWithMinutiae().startOffset();
        }
        LinePosition endPos =
                textDocument.linePositionFrom(commentNode.getLastMinutiae().textRange().endOffset() + offset);
        LineRange commentRange = LineRange.from(node.lineRange().fileName(), startPos, endPos);
        CommentMetadata commentMetadata = new CommentMetadata(String.join(System.lineSeparator(),
                commentNode.getCommentLines()), commentRange);
        genCommentNode(commentMetadata);
    }

    @Override
    public void visit(ReturnStatementNode returnStatementNode) {
        Optional<ExpressionNode> optExpr = returnStatementNode.expression();
        NodeBuilder builder = startNode(NodeKind.RETURN, returnStatementNode);
        optExpr.ifPresent(expr -> builder
                .metadata().description(String.format(ReturnBuilder.DESCRIPTION, expr)).stepOut()
                .properties().expressionOrAction(expr, ReturnBuilder.RETURN_EXPRESSION_DOC, true));
        nodeBuilder.returning();
        endNode(returnStatementNode);
    }

    @Override
    public void visit(RemoteMethodCallActionNode remoteMethodCallActionNode) {
        if (forceAssign) {
            return;
        }
        Optional<Symbol> symbol = semanticModel.symbol(remoteMethodCallActionNode);
        if (symbol.isEmpty() || (symbol.get().kind() != SymbolKind.METHOD)) {
            // Fallback: recognize awaitHumanTask by method name even when semantic model cannot resolve
            // the symbol (e.g., the installed workflow library version predates awaitHumanTask).
            if (tryHandleUnresolvedCallHumanTask(remoteMethodCallActionNode)) {
                return;
            }
            handleExpressionNode(remoteMethodCallActionNode);
            return;
        }
        Optional<ClassSymbol> optClassSymbol = getClassSymbol(remoteMethodCallActionNode.expression());
        if (optClassSymbol.isEmpty()) {
            handleExpressionNode(remoteMethodCallActionNode);
            return;
        }

        String functionName = remoteMethodCallActionNode.methodName().name().text();
        ExpressionNode expressionNode = remoteMethodCallActionNode.expression();
        MethodSymbol functionSymbol = (MethodSymbol) symbol.get();
        ClassSymbol classSymbol = optClassSymbol.get();
        if (isAgentClass(classSymbol)) {
            startNode(NodeKind.AGENT_CALL, expressionNode.parent());
            populateAgentMetaData(expressionNode, classSymbol);
        } else if (isAiFixedReturnAgent(classSymbol) || isAiInferredReturnAgent(classSymbol)) {
            startNode(NodeKind.AGENT_RUN, expressionNode.parent());
            populateAgentRunMetaData(expressionNode, classSymbol);
        } else if (isWorkflowCtxOperation(remoteMethodCallActionNode, classSymbol, CALL_ACTIVITY_METHOD_NAME)) {
            startNode(NodeKind.ACTIVITY_CALL, expressionNode.parent());
        } else if (isWorkflowCtxOperation(remoteMethodCallActionNode, classSymbol, CALL_HUMAN_TASK_METHOD_NAME)) {
            startNode(NodeKind.HUMAN_TASK, expressionNode.parent());
        } else if (isWorkflowCtxOperation(remoteMethodCallActionNode, classSymbol, AWAIT_METHOD_NAME)) {
            // Use the enclosing variable declaration's line range when present so workflow compiler
            // plugin diagnostics on the typed binding pattern (e.g. WORKFLOW_123 on non-nilable tuple
            // members) attach to the WAIT_DATA flow node.
            startNode(NodeKind.WAIT_DATA, remoteMethodCallActionNode.parent());
        } else {
            startNode(NodeKind.REMOTE_ACTION_CALL, expressionNode.parent());
        }
        Map<String, Object> metadataData = getConnectorMetadata(classSymbol);
        setFunctionProperties(functionName, expressionNode, remoteMethodCallActionNode, functionSymbol,
                classSymbol.getName().orElse(""), metadataData);

        if (isWorkflowCtxOperation(remoteMethodCallActionNode, classSymbol, CALL_ACTIVITY_METHOD_NAME)) {
            String builtinSymbol = resolveBuiltinActivitySymbol(remoteMethodCallActionNode.arguments());
            if (builtinSymbol != null) {
                // Builtin: symbol is the actual function name (callRestAPI/callSoapAPI/sendEmail).
                nodeBuilder.codedata().symbol(builtinSymbol);
                nodeBuilder.codedata().module(ACTIVITY_MODULE);
                populateBuiltinActivityProperties(remoteMethodCallActionNode, builtinSymbol);
            } else {
                overrideSymbolFromFirstArg(remoteMethodCallActionNode.arguments());
                populateActivityCallProperties(remoteMethodCallActionNode);
            }
        } else if (isWorkflowCtxOperation(remoteMethodCallActionNode, classSymbol, CALL_HUMAN_TASK_METHOD_NAME)) {
            populateHumanTaskProperties(remoteMethodCallActionNode);
        } else if (isWorkflowCtxOperation(remoteMethodCallActionNode, classSymbol, AWAIT_METHOD_NAME)) {
            populateAwaitWaitDataProperties(remoteMethodCallActionNode);
        }
    }

    private void populateAgentMetaData(ExpressionNode expressionNode, ClassSymbol classSymbol) {
        Map<String, AiUtils.AgentPropertyValue> agentData = new HashMap<>();
        if (isClassField(expressionNode)) {
            FieldAccessExpressionNode fieldAccess = (FieldAccessExpressionNode) expressionNode;
            Optional<Symbol> fieldSymbol = semanticModel.symbol(fieldAccess.fieldName());
            if (fieldSymbol.isEmpty() || fieldSymbol.get().kind() != SymbolKind.CLASS_FIELD) {
                return;
            }

            // Find the initialization expression for the field
            Optional<AssignmentStatementNode> initAssignment = findFieldInitAssignment(fieldSymbol.get());
            if (initAssignment.isPresent()) {
                Optional<ImplicitNewExpressionNode> newExprOpt = getNewExpr(initAssignment.get().expression());
                if (newExprOpt.isPresent()) {
                    agentData.put(Property.SCOPE_KEY,
                            new AiUtils.AgentPropertyValue(Property.SERVICE_INIT_SCOPE, Property.ValueType.EXPRESSION));
                    genAgentData(newExprOpt.get(), classSymbol, agentData, true);
                }
            }
        } else {
            Optional<Symbol> symbol = semanticModel.symbol(expressionNode);
            if (symbol.isEmpty() || !(symbol.get() instanceof VariableSymbol variableSymbol)) {
                return;
            }
            Optional<Location> optLocation = variableSymbol.getLocation();
            if (optLocation.isEmpty()) {
                return;
            }
            Document document = CommonUtils.getDocument(project, optLocation.get());
            if (document == null) {
                return;
            }
            Optional<NonTerminalNode> varNodeOpt =
                    CommonUtil.findNode(variableSymbol, document.syntaxTree());
            if (varNodeOpt.isEmpty()) {
                return;
            }
            NonTerminalNode varNode = varNodeOpt.get();
            ExpressionNode initializerExpr = getInitializerFromVariableNode(varNode);
            if (initializerExpr != null) {
                // Determine scope based on variable declaration type
                NonTerminalNode scopeNode = varNode;
                while (scopeNode != null) {
                    if (scopeNode.kind() == SyntaxKind.MODULE_VAR_DECL) {
                        agentData.put(Property.SCOPE_KEY,
                                new AiUtils.AgentPropertyValue(Property.GLOBAL_SCOPE, Property.ValueType.EXPRESSION));
                        break;
                    } else if (scopeNode.kind() == SyntaxKind.LOCAL_VAR_DECL) {
                        agentData.put(Property.SCOPE_KEY,
                                new AiUtils.AgentPropertyValue(Property.LOCAL_SCOPE, Property.ValueType.EXPRESSION));
                        break;
                    }
                    scopeNode = scopeNode.parent();
                }
                Optional<ImplicitNewExpressionNode> newExpressionNodeOpt = getNewExpr(initializerExpr);
                newExpressionNodeOpt.ifPresent(
                        implicitNewExpressionNode -> genAgentData(implicitNewExpressionNode, classSymbol, agentData,
                                true));
            }
        }
    }

    private void populateAgentRunMetaData(ExpressionNode expressionNode, ClassSymbol classSymbol) {
        SeparatedNodeList<FunctionArgumentNode> argumentNodes = getAgentInstanceNewExpr(expressionNode)
                .flatMap(ImplicitNewExpressionNode::parenthesizedArgList)
                .map(ParenthesizedArgList::arguments)
                .orElse(null);
        AiUtils.applyAgentRunMetadata(nodeBuilder, classSymbol, argumentNodes, project, this::getModelIconUrl);
    }

    private Optional<ImplicitNewExpressionNode> getAgentInstanceNewExpr(ExpressionNode expressionNode) {
        if (isClassField(expressionNode)) {
            FieldAccessExpressionNode fieldAccess = (FieldAccessExpressionNode) expressionNode;
            Optional<Symbol> fieldSymbol = semanticModel.symbol(fieldAccess.fieldName());
            if (fieldSymbol.isEmpty() || fieldSymbol.get().kind() != SymbolKind.CLASS_FIELD) {
                return Optional.empty();
            }
            return findFieldInitAssignment(fieldSymbol.get()).flatMap(assign -> getNewExpr(assign.expression()));
        }
        Optional<Symbol> symbol = semanticModel.symbol(expressionNode);
        if (symbol.isEmpty() || !(symbol.get() instanceof VariableSymbol variableSymbol)) {
            return Optional.empty();
        }
        Optional<Location> optLocation = variableSymbol.getLocation();
        if (optLocation.isEmpty()) {
            return Optional.empty();
        }
        Document document = CommonUtils.getDocument(project, optLocation.get());
        if (document == null) {
            return Optional.empty();
        }
        Optional<NonTerminalNode> varNodeOpt = CommonUtil.findNode(variableSymbol, document.syntaxTree());
        if (varNodeOpt.isEmpty()) {
            return Optional.empty();
        }
        ExpressionNode initializerExpr = getInitializerFromVariableNode(varNodeOpt.get());
        return initializerExpr == null ? Optional.empty() : getNewExpr(initializerExpr);
    }

    private ExpressionNode getInitializerFromVariableNode(NonTerminalNode varNode) {
        // Find the actual variable declaration node by traversing up the tree
        NonTerminalNode currentNode = varNode;
        while (currentNode != null) {
            switch (currentNode.kind()) {
                case MODULE_VAR_DECL -> {
                    ModuleVariableDeclarationNode moduleVarDecl = (ModuleVariableDeclarationNode) currentNode;
                    return moduleVarDecl.initializer().orElse(null);
                }
                case LOCAL_VAR_DECL -> {
                    VariableDeclarationNode localVarDecl = (VariableDeclarationNode) currentNode;
                    return localVarDecl.initializer().orElse(null);
                }
                default -> // Continue traversing up to find a variable declaration
                        currentNode = currentNode.parent();
            }
        }
        return null;
    }

    /**
     * Finds the initialization expression for a field by searching through its references. Currently looks for
     * assignments in the init method.
     *
     * @param fieldSymbol The field symbol to find initialization for
     * @return Optional containing the initialization assignment if found, empty otherwise
     */
    private Optional<AssignmentStatementNode> findFieldInitAssignment(Symbol fieldSymbol) {
        // Get all references to this field
        List<Location> references = semanticModel.references(fieldSymbol);

        // Find the assignment in the init method
        for (Location location : references) {
            ModulePartNode modulePartNode = CommonUtils.getDocument(project, location).syntaxTree().rootNode();
            NonTerminalNode node = modulePartNode.findNode(location.textRange());

            // Check if this reference is part of an assignment statement
            if (node.parent() instanceof AssignmentStatementNode assignmentStmt) {
                FunctionDefinitionNode parentFunc = getParentFunction(assignmentStmt);
                if (parentFunc != null && parentFunc.functionName().text().equals("init")) {
                    return Optional.of(assignmentStmt);
                }
            }
        }
        return Optional.empty();
    }

    private void genAgentData(ImplicitNewExpressionNode newExpressionNode, ClassSymbol classSymbol,
                              Map<String, AiUtils.AgentPropertyValue> agentData, boolean includeCallProperties) {
        Optional<ParenthesizedArgList> argList = newExpressionNode.parenthesizedArgList();
        if (argList.isEmpty()) {
            return;
        }
        ExpressionNode toolsArg = null;
        ExpressionNode modelArg = null;
        ExpressionNode systemPromptArg = null;
        ExpressionNode memory = null;
        Map<String, Object> agentInfo = new HashMap<>();

        for (FunctionArgumentNode arg : argList.get().arguments()) {
            if (arg instanceof NamedArgumentNode namedArgumentNode) {
                String argumentName = namedArgumentNode.argumentName().name().text();
                switch (argumentName) {
                    case FIELD_TOOLS -> toolsArg = namedArgumentNode.expression();
                    case FIELD_MODEL -> modelArg = namedArgumentNode.expression();
                    case FIELD_SYSTEM_PROMPT -> systemPromptArg = namedArgumentNode.expression();
                    case FIELD_MEMORY -> memory = namedArgumentNode.expression();
                    default -> {
                    }
                }
                agentData.put(argumentName,
                        new AiUtils.AgentPropertyValue(namedArgumentNode.expression().toString().trim(),
                                Property.ValueType.EXPRESSION));
            } else if (arg instanceof PositionalArgumentNode positionalArg) {
                ExpressionNode expression = positionalArg.expression();
                if (expression instanceof MappingConstructorExpressionNode mappingCtr) {
                    SeparatedNodeList<MappingFieldNode> fields = mappingCtr.fields();
                    for (MappingFieldNode field : fields) {
                        if (!(field instanceof SpecificFieldNode specificField)) {
                            continue;
                        }
                        Optional<ExpressionNode> valueExprOpt = specificField.valueExpr();
                        if (valueExprOpt.isEmpty()) {
                            continue;
                        }
                        String fieldName = specificField.fieldName().toString().trim();
                        ExpressionNode valueExpr = valueExprOpt.get();
                        switch (fieldName) {
                            case FIELD_TOOLS -> toolsArg = valueExpr;
                            case FIELD_MODEL -> modelArg = valueExpr;
                            case FIELD_SYSTEM_PROMPT -> systemPromptArg = valueExpr;
                            case FIELD_MEMORY -> memory = valueExpr;
                            default -> {
                            }
                        }
                        agentData.put(fieldName,
                                new AiUtils.AgentPropertyValue(valueExpr.toString().trim(),
                                        Property.ValueType.EXPRESSION));
                    }
                }
            }
        }

        if (toolsArg != null && toolsArg.kind() == SyntaxKind.LIST_CONSTRUCTOR) {
            List<ToolData> toolsData = new ArrayList<>();
            for (Node element : ((ListConstructorExpressionNode) toolsArg).expressions()) {
                // `self.<name>` class-method / MCP-toolkit field (agent definitions).
                if (element instanceof FieldAccessExpressionNode fieldAccess) {
                    if (!(fieldAccess.fieldName() instanceof SimpleNameReferenceNode fieldName)) {
                        continue;
                    }
                    String toolName = fieldName.name().text();
                    if (isMcpToolKitExpression(fieldAccess)) {
                        toolsData.add(new ToolData(toolName, ICON_PATH, "", MCP_SERVER));
                        continue;
                    }
                    MethodSymbol method = resolveToolMethod(fieldAccess, toolName).orElse(null);
                    String icon = method == null ? "" : AiUtils.getToolDisplayIcon(method);
                    String type = method != null && isAgentDelegationTool(method) ? AGENT_TOOL_TYPE : null;
                    toolsData.add(new ToolData(toolName, icon, "", type));
                } else if (element instanceof SimpleNameReferenceNode nameRef) {
                    // Module-level tool reference.
                    String toolName = nameRef.name().text();
                    Symbol symbol = semanticModel.symbol(element).orElse(null);
                    if (AiUtils.isMcpToolKitSymbol(symbol) || isMcpToolKitExpression(nameRef)) {
                        toolsData.add(new ToolData(toolName, ICON_PATH, getToolDescription(""), MCP_SERVER));
                    } else {
                        String type = symbol != null && isAgentDelegationTool(symbol) ? AGENT_TOOL_TYPE : null;
                        toolsData.add(new ToolData(toolName, getIcon(toolName), getToolDescription(toolName), type));
                    }
                }
            }
            agentInfo.put(AiUtils.AGENT_TOOLS_KEY, toolsData);
        }

        if (systemPromptArg != null && systemPromptArg.kind() == SyntaxKind.MAPPING_CONSTRUCTOR) {
            parseSystemPromptFields((MappingConstructorExpressionNode) systemPromptArg, agentData);

            Map<String, String> systemPrompt = new HashMap<>();
            for (String field : List.of("role", "instructions")) {
                AiUtils.AgentPropertyValue value = agentData.get(field);
                if (value != null) {
                    systemPrompt.put(field, value.value());
                }
            }
            if (!systemPrompt.isEmpty()) {
                agentInfo.put(AiUtils.AGENT_SYSTEM_PROMPT_KEY, systemPrompt);
            }
        }

        if (memory == null) {
            String defaultMemoryManagerName = getDefaultMemoryManagerName(classSymbol);
            if (!defaultMemoryManagerName.isEmpty()) {
                AiUtils.addPresentationMetadata(agentInfo, AiUtils.MEMORY_METADATA_KEY,
                        new MemoryManagerData(defaultMemoryManagerName, AiUtils.MEMORY_DEFAULT_VALUE));
            }
        } else if (memory.kind() == SyntaxKind.EXPLICIT_NEW_EXPRESSION) {
            ExplicitNewExpressionNode newExpr = (ExplicitNewExpressionNode) memory;
            SeparatedNodeList<FunctionArgumentNode> arguments = newExpr.parenthesizedArgList().arguments();
            String size = "";
            if (arguments.size() == 1) {
                size = arguments.get(0).toSourceCode();
            }
            AiUtils.addPresentationMetadata(agentInfo, AiUtils.MEMORY_METADATA_KEY,
                    new MemoryManagerData(newExpr.typeDescriptor().toSourceCode(), size));
        } else if (memory.kind() == SyntaxKind.SIMPLE_NAME_REFERENCE) {
            Optional<TypeSymbol> optSymbolType = semanticModel.typeOf(memory);
            optSymbolType.ifPresent(typeSymbol -> AiUtils.addPresentationMetadata(agentInfo,
                    AiUtils.MEMORY_METADATA_KEY,
                    new MemoryManagerData(typeSymbol.getName().orElse("Memory Not Configured"),
                            AiUtils.MEMORY_DEFAULT_VALUE)));
        }

        if (modelArg != null) {
            ModelData modelUrl = getModelIconUrl(modelArg);
            if (modelUrl != null) {
                AiUtils.addPresentationMetadata(agentInfo, AiUtils.MODEL_PROVIDER_METADATA_KEY, modelUrl);
            }
        }
        AiUtils.addAgentMetadata(nodeBuilder, agentInfo);

        if (!includeCallProperties) {
            return;
        }

        // Find the agent variable declaration to get the correct line range and source code
        NonTerminalNode statementNode = newExpressionNode.parent();
        while (statementNode != null && statementNode.kind() != SyntaxKind.LOCAL_VAR_DECL &&
                statementNode.kind() != SyntaxKind.MODULE_VAR_DECL &&
                statementNode.kind() != SyntaxKind.ASSIGNMENT_STATEMENT) {
            statementNode = statementNode.parent();
        }

        // Create agent codedata using the agent variable declaration
        Optional<ModuleID> moduleId = classSymbol.getModule().map(ModuleSymbol::id);
        Codedata codedata = new Codedata.Builder<>(null)
                .node(NodeKind.AGENT)
                .lineRange(statementNode != null ? statementNode.lineRange() : newExpressionNode.lineRange())
                .object(Constants.Ai.AGENT_TYPE_NAME)
                .org(moduleId.map(ModuleID::orgName).orElse(""))
                .module(moduleId.map(ModuleID::moduleName).orElse(""))
                .packageName(moduleId.map(ModuleID::packageName).orElse(""))
                .symbol(Constants.Ai.AGENT_SYMBOL_NAME)
                .sourceCode(statementNode != null ? statementNode.toSourceCode().strip() :
                        newExpressionNode.toSourceCode().strip())
                .version(moduleId.map(ModuleID::version).orElse(""))
                .isNew(false)
                .data(Property.SCOPE_KEY, agentData.get(Property.SCOPE_KEY).value())
                .build();

        Path agentFilePath =
                FileSystemUtils.resolveFilePathFromCodedata(codedata, project.sourceRoot());

        NodeBuilder.TemplateContext context =
                new NodeBuilder.TemplateContext(workspaceManager, agentFilePath,
                        statementNode != null ? statementNode.lineRange().startLine() :
                                newExpressionNode.lineRange().startLine(), codedata, null);

        AgentCallBuilder.setAgentProperties(nodeBuilder, context, agentData);
        AgentCallBuilder.setAdditionalAgentProperties(nodeBuilder, agentData);

        nodeBuilder.codedata().addData(Constants.Ai.AGENT_CODEDATA, codedata);
    }

    /**
     * Parses the {@code role} and {@code instructions} fields from an agent's {@code systemPrompt} record mapping into
     * {@code agentData}, detecting PROMPT-typed (string template) versus plain expression values.
     */
    private void parseSystemPromptFields(MappingConstructorExpressionNode mappingCtr,
                                         Map<String, AiUtils.AgentPropertyValue> agentData) {
        for (MappingFieldNode field : mappingCtr.fields()) {
            if (field.kind() != SyntaxKind.SPECIFIC_FIELD) {
                continue;
            }
            SpecificFieldNode specificFieldNode = (SpecificFieldNode) field;
            Optional<ExpressionNode> valueExprOpt = specificFieldNode.valueExpr();
            if (valueExprOpt.isEmpty()) {
                continue;
            }
            ExpressionNode valueExpr = valueExprOpt.get();
            String value;
            Property.ValueType selectedType;
            if (valueExpr.kind() == SyntaxKind.STRING_TEMPLATE_EXPRESSION) {
                TemplateExpressionNode templateExpr = (TemplateExpressionNode) valueExpr;
                value = templateExpr.content().stream()
                        .map(Node::toString)
                        .collect(Collectors.joining());
                value = AiUtils.restoreBackticksFromStringTemplate(value);
                selectedType = Property.ValueType.PROMPT;
            } else {
                value = valueExpr.toString().trim();
                selectedType = Property.ValueType.EXPRESSION;
            }
            agentData.put(specificFieldNode.fieldName().toString().trim(),
                    new AiUtils.AgentPropertyValue(value, selectedType));
        }
    }

    /**
     * Replaces the raw {@code systemPrompt} record on an analyzed AGENT node with the friendly Role + Instructions
     * fields (mirrors the AGENT_CALL form). The {@code systemPrompt} property is kept but hidden so source generation
     * can rebuild it from the Role + Instructions values.
     */
    private void applyAgentRoleInstructionFields(SeparatedNodeList<FunctionArgumentNode> argumentNodes) {
        Map<String, AiUtils.AgentPropertyValue> agentData = new HashMap<>();
        ExpressionNode systemPromptArg = extractSystemPromptArg(argumentNodes);
        if (systemPromptArg != null && systemPromptArg.kind() == SyntaxKind.MAPPING_CONSTRUCTOR) {
            parseSystemPromptFields((MappingConstructorExpressionNode) systemPromptArg, agentData);
        }

        AgentBuilder.hideAgentConfigProperties(nodeBuilder);
        AgentCallBuilder.setAdditionalAgentProperties(nodeBuilder, agentData, false);
    }

    private ExpressionNode extractSystemPromptArg(SeparatedNodeList<FunctionArgumentNode> argumentNodes) {
        if (argumentNodes == null) {
            return null;
        }
        for (FunctionArgumentNode arg : argumentNodes) {
            if (arg instanceof NamedArgumentNode namedArgumentNode) {
                if (FIELD_SYSTEM_PROMPT.equals(namedArgumentNode.argumentName().name().text())) {
                    return namedArgumentNode.expression();
                }
            } else if (arg instanceof PositionalArgumentNode positionalArg
                    && positionalArg.expression() instanceof MappingConstructorExpressionNode mappingCtr) {
                for (MappingFieldNode field : mappingCtr.fields()) {
                    if (field instanceof SpecificFieldNode specificField
                            && FIELD_SYSTEM_PROMPT.equals(specificField.fieldName().toString().trim())
                            && specificField.valueExpr().isPresent()) {
                        return specificField.valueExpr().get();
                    }
                }
            }
        }
        return null;
    }

    private boolean isWorkflowOperation(FunctionSymbol functionSymbol, String operationName) {
        String functionName = functionSymbol.getName().orElse("");
        return operationName.equals(functionName) && isWorkflowModule(functionSymbol.getModule());
    }

    private boolean isWorkflowCtxOperation(RemoteMethodCallActionNode remoteMethodCallActionNode,
                                           ClassSymbol classSymbol, String operationName) {
        String methodName = remoteMethodCallActionNode.methodName().name().text();
        String className = classSymbol.getName().orElse("");
        return methodName.equals(operationName) &&
                className.equals(CONTEXT_CLASS_NAME) && isWorkflowModule(classSymbol.getModule());
    }

    /**
     * Handles a {@code ctx->awaitHumanTask(...)} call when the semantic model cannot resolve the method
     * symbol (e.g., when the installed workflow library version predates {@code awaitHumanTask}).
     * Falls back to method-name + class-symbol detection so the node is still classified as HUMAN_TASK.
     *
     * @return {@code true} if the node was handled as HUMAN_TASK, {@code false} otherwise
     */
    private boolean tryHandleUnresolvedCallHumanTask(RemoteMethodCallActionNode callNode) {
        if (!CALL_HUMAN_TASK_METHOD_NAME.equals(callNode.methodName().name().text())) {
            return false;
        }
        Optional<ClassSymbol> optClassSymbol = getClassSymbol(callNode.expression());
        if (optClassSymbol.isEmpty()) {
            return false;
        }
        ClassSymbol classSymbol = optClassSymbol.get();
        if (!classSymbol.getName().orElse("").equals(CONTEXT_CLASS_NAME)
                || !isWorkflowModule(classSymbol.getModule())) {
            return false;
        }
        startNode(NodeKind.HUMAN_TASK, callNode.expression().parent());
        nodeBuilder.metadata()
                .label(HUMAN_TASK_LABEL)
                .description(HUMAN_TASK_DESCRIPTION)
                .stepOut()
                .codedata()
                .nodeInfo(callNode)
                .org(WORKFLOW_ORG)
                .module(WORKFLOW_MODULE)
                .object(CONTEXT_CLASS_NAME)
                .symbol(CALL_HUMAN_TASK_METHOD_NAME);
        populateHumanTaskProperties(callNode);
        // Set checkError from the parent node kind since setFunctionProperties was skipped.
        SyntaxKind parentKind = callNode.parent().kind();
        boolean hasCheck = parentKind == SyntaxKind.CHECK_ACTION
                || parentKind == SyntaxKind.CHECK_EXPRESSION;
        nodeBuilder.properties().checkError(hasCheck);
        return true;
    }

    /**
     * Populates node properties for a {@code ctx.sleep(...)} call.
     * Sets the full workflow codedata (org/module/object/symbol) and reads the duration
     * argument via the function symbol so the node round-trips as NodeKind.SLEEP.
     */
    private void populateSleepNodeProperties(MethodCallExpressionNode callNode, FunctionSymbol functionSymbol) {
        FunctionDataBuilder functionDataBuilder = new FunctionDataBuilder()
                .name(SLEEP_METHOD_NAME)
                .functionSymbol(functionSymbol)
                .semanticModel(semanticModel)
                .userModuleInfo(moduleInfo);
        FunctionData functionData = functionDataBuilder.build();

        nodeBuilder
                .symbolInfo(functionSymbol)
                .metadata()
                    .label(SLEEP_LABEL)
                    .description(SLEEP_DESCRIPTION)
                    .stepOut()
                .codedata()
                    .node(NodeKind.SLEEP)
                    .org(WORKFLOW_ORG)
                    .module(WORKFLOW_MODULE)
                    .object(CONTEXT_CLASS_NAME)
                    .symbol(SLEEP_METHOD_NAME);

        processFunctionSymbol(callNode, callNode.arguments(), functionSymbol, functionData);

        SyntaxKind parentKind = callNode.parent().kind();
        boolean hasCheck = parentKind == SyntaxKind.CHECK_ACTION
                || parentKind == SyntaxKind.CHECK_EXPRESSION;
        nodeBuilder.properties().checkError(hasCheck);
    }

    /**
     * Returns the builtin-activity strategy symbol ("REST", "SOAP", or "EMAIL") if the first
     * positional argument of a {@code ctx->callActivity(...)} call resolves to one of the known
     * builtin activity functions in the {@code workflow.activity} module, or {@code null} otherwise.
     */
    private String resolveBuiltinActivitySymbol(SeparatedNodeList<FunctionArgumentNode> args) {
        if (args.isEmpty() || !(args.get(0) instanceof PositionalArgumentNode firstArg)) {
            return null;
        }
        Optional<Symbol> resolvedSymbol = semanticModel.symbol(firstArg.expression());
        if (resolvedSymbol.isEmpty()) {
            return null;
        }
        Symbol sym = resolvedSymbol.get();
        String functionName = sym.getName().orElse("");
        Optional<ModuleSymbol> module = sym.getModule();
        if (module.isEmpty()) {
            return null;
        }
        String orgName = module.get().id().orgName();
        String moduleName = module.get().id().moduleName();
        if (!BALLERINA_ORG_NAME.equals(orgName) || !ACTIVITY_MODULE.equals(moduleName)) {
            return null;
        }
        if (BUILTIN_REST_FUNCTION.equals(functionName)) {
            return BUILTIN_REST_FUNCTION;
        } else if (BUILTIN_SOAP_FUNCTION.equals(functionName)) {
            return BUILTIN_SOAP_FUNCTION;
        } else if (BUILTIN_EMAIL_FUNCTION.equals(functionName)) {
            return BUILTIN_EMAIL_FUNCTION;
        }
        return null;
    }

    /**
     * Overrides the codedata symbol and org/module with the function reference from the first positional argument.
     * Used for workflow operations like callActivity and workflow:run where the first argument is a function reference
     * whose identity should be the node's symbol.
     */
    private void overrideSymbolFromFirstArg(SeparatedNodeList<FunctionArgumentNode> args) {
        if (args.isEmpty() || !(args.get(0) instanceof PositionalArgumentNode positionalArg)) {
            return;
        }
        ExpressionNode expr = positionalArg.expression();
        String functionRefName = expr.toSourceCode().strip();
        nodeBuilder.codedata().symbol(functionRefName);

        Optional<Symbol> resolvedSymbol = semanticModel.symbol(expr);
        resolvedSymbol.ifPresent(symbol -> nodeBuilder.symbolInfo(symbol));
    }

    /**
     * Fixes properties after {@code processFunctionSymbol} runs on {@code callActivity}: removes excluded
     * params, moves advance params into {@code ADVANCED_PARAM_KEY}, and adds flat activity function params
     * from the args map literal.
     *
     * @param remoteMethodCallActionNode the {@code ctx->callActivity(...)} call node
     */
    private void populateActivityCallProperties(RemoteMethodCallActionNode remoteMethodCallActionNode) {
        SeparatedNodeList<FunctionArgumentNode> args = remoteMethodCallActionNode.arguments();

        // Step 1: Move the advance params (already populated with actual values) into ADVANCED_PARAM_KEY.
        Map<String, Property> currentProps = nodeBuilder.properties().build();
        // Save retryPolicy raw value BEFORE removeIf strips it (it is excluded from ADVANCE_PARAM_LIST).
        String rawRetryPolicyValue = null;
        {
            Property rp = currentProps.get(ActivityCallBuilder.RETRY_POLICY_PARAM);
            if (rp != null && rp.value() != null) {
                rawRetryPolicyValue = rp.value().toString();
            }
        }
        currentProps.keySet().removeIf(EXCLUDED_CALL_ACTIVITY_PARAMS::contains);
        Map<String, Property> advancedProps = new LinkedHashMap<>(currentProps);
        currentProps.clear();
        nodeBuilder.properties().nestedProperty();
        nodeBuilder.properties().build().putAll(advancedProps);
        nodeBuilder.properties().endNestedProperty(
                Property.ValueType.ADVANCE_PARAM_LIST,
                Property.ADVANCED_PARAM_KEY,
                ActivityCallBuilder.ADVANCE_CONFIGURATIONS,
                ActivityCallBuilder.ADVANCE_CONFIGURATIONS);

        // Step 2: Get activity function params directly from the symbol (avoids expensive FunctionDataBuilder).
        List<ParameterSymbol> activityParamSymbols = List.of();
        if (!args.isEmpty() && args.get(0) instanceof PositionalArgumentNode firstArg) {
            Optional<Symbol> resolvedSymbol = semanticModel.symbol(firstArg.expression());
            if (resolvedSymbol.isPresent() && resolvedSymbol.get() instanceof FunctionSymbol activityFuncSymbol) {
                activityParamSymbols = activityFuncSymbol.typeDescriptor().params().orElse(List.of());
            }
        }

        if (activityParamSymbols.isEmpty()) {
            addNormalizedRetryPolicyProperties(rawRetryPolicyValue);
            return;
        }

        // Step 3: Parse the args map literal (second positional arg) into a Map<paramName, Node>.
        Map<String, Node> argsValues = new LinkedHashMap<>();
        if (args.size() > 1 && args.get(1) instanceof PositionalArgumentNode secondArg) {
            ExpressionNode secondExpr = secondArg.expression();
            if (secondExpr.kind() == SyntaxKind.MAPPING_CONSTRUCTOR) {
                MappingConstructorExpressionNode mappingNode = (MappingConstructorExpressionNode) secondExpr;
                for (MappingFieldNode field : mappingNode.fields()) {
                    if (field instanceof SpecificFieldNode specificField) {
                        String key = specificField.fieldName().toString().trim();
                        Node valueNode = specificField.valueExpr().orElse(null);
                        argsValues.put(key, valueNode);
                    }
                }
            }
        }

        // Step 4: Add flat properties for each activity function parameter, setting values from the args map.
        for (ParameterSymbol paramSymbol : activityParamSymbols) {
            String paramName = paramSymbol.getName().orElse("");
            if (paramName.isEmpty()) {
                continue;
            }
            Node valueNode = argsValues.get(paramName);
            String value = valueNode != null ? valueNode.toSourceCode().strip() : null;
            boolean isOptional = paramSymbol.paramKind() == ParameterKind.DEFAULTABLE;
            String kind = isOptional ? ParameterData.Kind.DEFAULTABLE.name() : ParameterData.Kind.REQUIRED.name();
            TypeSymbol typeSymbol = paramSymbol.typeDescriptor();
            String typeSignature = CommonUtils.getTypeSignature(typeSymbol, moduleInfo);

            Property.Builder<FormBuilder<NodeBuilder>> customPropBuilder = nodeBuilder.properties().custom();
            FormBuilder<NodeBuilder> nodeBuilderFormBuilder = customPropBuilder
                    .metadata()
                        .label(paramName)
                        .description("")
                        .stepOut()
                    .codedata()
                        .kind(kind)
                        .originalName(paramName)
                        .stepOut()
                    .value(value)
                    .placeholder(typeSignature)
                    .editable()
                    .defaultable(isOptional)
                    .stepOut();
            customPropBuilder.typeWithExpression(typeSymbol, moduleInfo, valueNode, semanticModel,
                    customPropBuilder, diagnosticHandler);
            nodeBuilderFormBuilder.addProperty(FlowNodeUtil.getPropertyKey(paramName), valueNode);
        }
        // After activity input params, add retryPolicy at root level (outside ADVANCE_PARAM_LIST).
        addNormalizedRetryPolicyProperties(rawRetryPolicyValue);
    }

    /**
     * Populates form properties for a {@code ctx->awaitHumanTask(...)} node from the existing source.
     * Reads individual positional and named arguments and maps each to the corresponding form property
     * defined by {@link io.ballerina.flowmodelgenerator.core.model.node.HumanTaskBuilder}.
     *
     * <p>Argument layout: {@code awaitHumanTask(taskName, userRoles[, payload = ..., title = ...,
     * description = ..., timeout = ...])}
     *
     * @param callNode the {@code ctx->awaitHumanTask(...)} call node
     */
    private void populateHumanTaskProperties(RemoteMethodCallActionNode callNode) {
        Map<String, Property> currentProps = nodeBuilder.properties().build();
        Property savedCheckError = currentProps.get(Property.CHECK_ERROR_KEY);
        boolean uncheckedInDoClause = callNode.parent().kind() != SyntaxKind.CHECK_ACTION
                && callNode.parent().kind() != SyntaxKind.CHECK_EXPRESSION
                && CommonUtils.withinDoClause(callNode);

        // When the awaitHumanTask symbol resolves, setFunctionProperties/processFunctionSymbol have already
        // built rich, type-aware properties: each param carries its real type symbol and imports, and the
        // inferred `typedesc<anydata> T` parameter is a record-field-aware result-type selector. Reuse them
        // (relabel + add the result variable) instead of discarding the type metadata with a hardcoded form.
        boolean resolved = currentProps.containsKey(HumanTaskBuilder.TASK_NAME_KEY)
                || currentProps.containsKey(HumanTaskBuilder.USER_ROLES_KEY);
        if (resolved) {
            populateResolvedHumanTaskProperties();
        } else {
            populateFallbackHumanTaskProperties(callNode, currentProps);
        }

        if (savedCheckError != null) {
            boolean checkError = savedCheckError.value() != null
                    && Boolean.parseBoolean(savedCheckError.value().toString());
            nodeBuilder.properties().checkError(checkError);
        } else if (uncheckedInDoClause) {
            nodeBuilder.properties().checkError(false);
        }
    }

    /**
     * Resolved path: relabels the rich {@code awaitHumanTask} properties built by
     * {@code processFunctionSymbol}, drops the implicit {@code ctx} connection, and sets the result variable
     * explicitly so {@code handleVariableNode} skips its generic {@code dataVariable()} (which would otherwise
     * add a duplicate {@code TYPE_KEY} alongside the inferred {@code T} result-type selector).
     */
    private void populateResolvedHumanTaskProperties() {
        Map<String, Property> currentProps = nodeBuilder.properties().build();
        currentProps.remove(Property.CONNECTION_KEY);

        // Canonicalize the inferred result type to the databindingType form first, then relabel — the
        // relabel step renames the databinding property to the human task "Completion Type", so it must
        // run after normalization has created that property.
        CallBuilder.normalizeDatabindingTypeProperty(nodeBuilder);
        HumanTaskBuilder.relabelHumanTaskFormProperties(currentProps);

        if (typedBindingPatternNode != null) {
            String varText = typedBindingPatternNode.bindingPattern().toSourceCode().strip();
            nodeBuilder.properties().custom()
                    .metadata().label(Property.RESULT_NAME).description(Property.RESULT_DOC).stepOut()
                    .value(varText)
                    .type().fieldType(Property.ValueType.IDENTIFIER).selected(true).stepOut()
                    .editable(true).stepOut()
                    .addProperty(Property.VARIABLE_KEY);
        }
    }

    /**
     * Fallback path used when the {@code awaitHumanTask} symbol cannot be resolved (e.g., the installed
     * workflow library predates it). Reads positional/named args directly and builds a stable, static form
     * matching {@link HumanTaskBuilder}'s fallback shape. The result type uses the inferred {@code T} key so
     * {@code toSource} round-trips consistently with the resolved path.
     */
    private void populateFallbackHumanTaskProperties(RemoteMethodCallActionNode callNode,
                                                     Map<String, Property> currentProps) {
        SeparatedNodeList<FunctionArgumentNode> args = callNode.arguments();
        currentProps.clear();

        // Collect all named args first for use as fallback for required params
        Map<String, String> namedArgs = new LinkedHashMap<>();
        for (FunctionArgumentNode arg : args) {
            if (arg instanceof NamedArgumentNode namedArg) {
                String name = namedArg.argumentName().name().text();
                String value = namedArg.expression().toSourceCode().strip();
                namedArgs.put(name, value);
            }
        }

        // taskName: positional arg 0, or named arg form awaitHumanTask(taskName = "...", ...)
        String taskNameValue = "";
        String userRolesValue = "";
        if (args.size() > 0 && args.get(0) instanceof PositionalArgumentNode posArg0) {
            taskNameValue = posArg0.expression().toSourceCode().strip();
        } else if (namedArgs.containsKey(HumanTaskBuilder.TASK_NAME_KEY)) {
            taskNameValue = namedArgs.get(HumanTaskBuilder.TASK_NAME_KEY);
        }
        // userRoles: positional arg 1, or named arg form
        if (args.size() > 1 && args.get(1) instanceof PositionalArgumentNode posArg1) {
            userRolesValue = posArg1.expression().toSourceCode().strip();
        } else if (namedArgs.containsKey(HumanTaskBuilder.USER_ROLES_KEY)) {
            userRolesValue = namedArgs.get(HumanTaskBuilder.USER_ROLES_KEY);
        }

        // payload: named arg, or positional arg 2
        String payloadValue = namedArgs.get(HumanTaskBuilder.PAYLOAD_KEY);
        if (payloadValue == null && args.size() > 2 && args.get(2) instanceof PositionalArgumentNode posArg2) {
            payloadValue = posArg2.expression().toSourceCode().strip();
        }
        // title: named arg only
        String titleValue = namedArgs.get(HumanTaskBuilder.TITLE_KEY);
        // description: named arg, or positional arg 3
        String descValue = namedArgs.get(HumanTaskBuilder.DESCRIPTION_KEY);
        if (descValue == null && args.size() > 3 && args.get(3) instanceof PositionalArgumentNode posArg3) {
            descValue = posArg3.expression().toSourceCode().strip();
        }
        // timeout: named arg only
        String timeoutValue = namedArgs.get(HumanTaskBuilder.TIMEOUT_KEY);

        // Build the human task parameter form via the single shared definition in HumanTaskBuilder,
        // injecting the values parsed from source (empty required values map to no preset value).
        Map<String, String> paramValues = new LinkedHashMap<>();
        paramValues.put(HumanTaskBuilder.TASK_NAME_KEY, taskNameValue.isEmpty() ? null : taskNameValue);
        paramValues.put(HumanTaskBuilder.USER_ROLES_KEY, userRolesValue.isEmpty() ? null : userRolesValue);
        paramValues.put(HumanTaskBuilder.PAYLOAD_KEY, payloadValue);
        paramValues.put(HumanTaskBuilder.TITLE_KEY, titleValue);
        paramValues.put(HumanTaskBuilder.DESCRIPTION_KEY, descValue);
        paramValues.put(HumanTaskBuilder.TIMEOUT_KEY, timeoutValue);
        HumanTaskBuilder.addFallbackHumanTaskParameters(nodeBuilder, paramValues);

        // Inferred databinding/result type and result variable (from typedBindingPatternNode)
        if (typedBindingPatternNode != null) {
            String typeText = typedBindingPatternNode.typeDescriptor().toSourceCode().strip();
            nodeBuilder.properties().custom()
                    .metadata().label(HumanTaskBuilder.COMPLETION_TYPE_LABEL)
                        .description(HumanTaskBuilder.COMPLETION_TYPE_DESCRIPTION).stepOut()
                    .value(typeText)
                    .type().fieldType(Property.ValueType.TYPE).ballerinaType(typeText).selected(true).stepOut()
                    .codedata().kind(ParameterData.Kind.PARAM_FOR_TYPE_INFER.name())
                        .originalName(CallBuilder.DATABINDING_TYPE_KEY).stepOut()
                    .editable(true).stepOut().addProperty(CallBuilder.DATABINDING_TYPE_KEY);
            String varText = typedBindingPatternNode.bindingPattern().toSourceCode().strip();
            nodeBuilder.properties().custom()
                    .metadata().label(Property.RESULT_NAME).description(Property.RESULT_DOC).stepOut()
                    .value(varText).type().fieldType(Property.ValueType.IDENTIFIER).selected(true).stepOut()
                    .editable(true).stepOut().addProperty(Property.VARIABLE_KEY);
        }
    }

    /**
     * Populates form properties for a builtin activity call node (callRestAPI/callSoapAPI/sendEmail)
     * from the existing source.
     * <p>
     * Unlike {@link #populateActivityCallProperties}, this method:
     * <ul>
     *   <li>does NOT create an ADVANCED_PARAM_KEY nested structure,</li>
     *   <li>stores connection under {@link Property#CONNECTION_KEY} ("connection") directly — using
     *       {@code FlowNodeUtil.getPropertyKey("connection")} would produce "$connection" because
     *       "connection" is in RESERVED_PROPERTY_KEYS, causing a key mismatch, and</li>
     *   <li>strips outer Ballerina string-literal quotes from the method value so it matches the
     *       DROPDOWN_CHOICE option expected by the REST-activity form (e.g. {@code GET}, not
     *       {@code "GET"}).</li>
     * </ul>
     * {@link Property#TYPE_KEY} and {@link Property#VARIABLE_KEY} are added here for REST/SOAP;
     * {@code handleVariableNode} skips generic {@code dataVariable()} for these nodes.
     *
     * @param callNode the {@code ctx->callActivity(...)} call node
     */
    /**
     * Populates form properties for a builtin activity call node (callRestAPI/callSoapAPI/sendEmail)
     * from the existing source.
     *
     * <p>Uses a two-pass approach to preserve the exact property shapes defined by each strategy:
     * <ol>
     *   <li>Parse all field values from the source record into a flat map (normalising keyword-escaped
     *       keys like {@code 'from} → {@code from}, and expanding the email {@code options} record
     *       into separate {@code cc}/{@code bcc} entries).</li>
     *   <li>Rebuild every property with the same type/metadata as the creation template, but filled
     *       with the values read from source — so DROPDOWN_CHOICE, dual TEXT/EXPRESSION, hidden, and
     *       advanced flags are all preserved when the diagram reloads.</li>
     * </ol>
     */
    private void populateBuiltinActivityProperties(RemoteMethodCallActionNode callNode, String builtinSymbol) {
        // Validate the second argument is a mapping constructor BEFORE clearing properties.
        // Clearing first would discard connection/result/checkError state on every early return.
        SeparatedNodeList<FunctionArgumentNode> args = callNode.arguments();
        if (args.size() <= 1) {
            return;
        }
        FunctionArgumentNode secondArg = args.get(1);
        if (!(secondArg instanceof PositionalArgumentNode posArg)) {
            return;
        }
        ExpressionNode secondExpr = posArg.expression();
        if (secondExpr.kind() != SyntaxKind.MAPPING_CONSTRUCTOR) {
            return;
        }

        // Preserve checkError and the advanced callActivity params (retryOnError, timeout, etc.)
        // populated by setFunctionProperties/processFunctionSymbol from named args in source, before
        // the clear below discards them.  Without this, builtin activities lose their advanced options
        // on every reload/regeneration, causing toSourceBuiltin() to omit them.
        Map<String, Property> currentProps = nodeBuilder.properties().build();
        Property savedCheckError = currentProps.get(Property.CHECK_ERROR_KEY);
        boolean uncheckedBuiltinInDoClause = callNode.parent().kind() != SyntaxKind.CHECK_ACTION
                && callNode.parent().kind() != SyntaxKind.CHECK_EXPRESSION
                && CommonUtils.withinDoClause(callNode);
        Property savedInferredType = currentProps.values().stream()
                .filter(property -> property.codedata() != null && property.codedata().kind() != null
                        && property.codedata().kind().equals(ParameterData.Kind.PARAM_FOR_TYPE_INFER.name()))
                .findFirst()
                .orElse(null);
        // Save retryPolicy separately — it is excluded from ADVANCE_PARAM_LIST and restored at root level.
        String rawRetryPolicyValue = null;
        {
            Property rp = currentProps.get(ActivityCallBuilder.RETRY_POLICY_PARAM);
            if (rp != null && rp.value() != null) {
                rawRetryPolicyValue = rp.value().toString();
            }
        }
        Map<String, Property> savedAdvancedProps = new LinkedHashMap<>();
        for (Map.Entry<String, Property> entry : currentProps.entrySet()) {
            if (!EXCLUDED_CALL_ACTIVITY_PARAMS.contains(entry.getKey())) {
                savedAdvancedProps.put(entry.getKey(), entry.getValue());
            }
        }
        currentProps.clear();

        BuiltinActivityStrategy strategy = ActivityCallBuilder.getBuiltinStrategy(builtinSymbol);

        // Pass 1: collect source field values, normalising keys and expanding nested records.
        Map<String, String> srcValues = new LinkedHashMap<>();
        // Email EmailOptions fields expanded from the nested options: {...} record
        Map<String, String> emailOptions = new LinkedHashMap<>();

        for (MappingFieldNode field : ((MappingConstructorExpressionNode) secondExpr).fields()) {
            if (!(field instanceof SpecificFieldNode sf)) {
                continue;
            }
            // Strip leading single-quote from Ballerina keyword-escaped identifiers (e.g. 'from → from).
            String rawKey = sf.fieldName().toString().trim();
            String key = rawKey.startsWith("'") ? rawKey.substring(1) : rawKey;
            String value = sf.valueExpr().map(n -> n.toSourceCode().strip()).orElse("");

            // Email: expand options: {...} into flat entries keyed by EmailOptions field name.
            if (BUILTIN_EMAIL_FUNCTION.equals(builtinSymbol) && "options".equals(key)
                    && sf.valueExpr().isPresent()
                    && sf.valueExpr().get().kind() == SyntaxKind.MAPPING_CONSTRUCTOR) {
                MappingConstructorExpressionNode optRecord =
                        (MappingConstructorExpressionNode) sf.valueExpr().get();
                for (MappingFieldNode optField : optRecord.fields()) {
                    if (!(optField instanceof SpecificFieldNode optSf)) {
                        continue;
                    }
                    String optKey = optSf.fieldName().toString().trim();
                    String optVal = optSf.valueExpr().map(n -> n.toSourceCode().strip()).orElse("");
                    emailOptions.put(optKey, optVal);
                }
            } else {
                srcValues.put(key, value);
            }
        }

        // Pass 2: rebuild properties with template-correct shapes and source values.

        // Connection — always present
        String connValue = srcValues.getOrDefault(Property.CONNECTION_KEY, "NEW_CONNECTION");
        nodeBuilder.properties().connectionSelector(
                connValue,
                strategy != null ? strategy.searchNodesKind() : null,
                strategy != null ? strategy.connectors() : null);

        switch (builtinSymbol) {
            case BUILTIN_REST_FUNCTION -> populateRestProperties(srcValues);
            case BUILTIN_SOAP_FUNCTION -> populateSoapProperties(srcValues);
            case BUILTIN_EMAIL_FUNCTION -> populateEmailProperties(srcValues, emailOptions);
            default -> {
                // Unknown builtin — best-effort: emit remaining fields as expressions
                for (Map.Entry<String, String> e : srcValues.entrySet()) {
                    if (Property.CONNECTION_KEY.equals(e.getKey())) {
                        continue;
                    }
                    nodeBuilder.properties().custom()
                            .metadata().label(e.getKey()).description("").stepOut()
                            .type().fieldType(Property.ValueType.EXPRESSION).selected(true).stepOut()
                            .value(e.getValue()).editable().stepOut()
                            .addProperty(e.getKey());
                }
            }
        }

        String typeText = typedBindingPatternNode != null
                ? typedBindingPatternNode.typeDescriptor().toSourceCode().strip() : "json";
        if (BUILTIN_REST_FUNCTION.equals(builtinSymbol) || BUILTIN_SOAP_FUNCTION.equals(builtinSymbol)) {
            String varText = typedBindingPatternNode != null
                    ? typedBindingPatternNode.bindingPattern().toSourceCode().strip() : "result";
            nodeBuilder.properties().custom()
                    .metadata()
                        .label(Property.RESULT_NAME)
                        .description(Property.RESULT_DOC)
                        .stepOut()
                    .value(varText)
                    .type().fieldType(Property.ValueType.IDENTIFIER).selected(true).stepOut()
                    .editable(true)
                    .stepOut()
                    .addProperty(Property.VARIABLE_KEY);
        }
        if (BUILTIN_REST_FUNCTION.equals(builtinSymbol) && savedInferredType != null
                && savedInferredType.codedata() != null && savedInferredType.codedata().originalName() != null) {
            nodeBuilder.properties().build().put(savedInferredType.codedata().originalName(),
                    Property.Builder.copyFrom(savedInferredType)
                            .value(typeText)
                            .advanced(false)
                            .build());
        }
        // Restore checkError. If the original call was unchecked inside a do-clause and no explicit
        // checkError property was captured, persist false explicitly so toSourceBuiltin() doesn't
        // fall back to its default true.
        if (savedCheckError != null) {
            boolean checkError = savedCheckError.value() != null
                    && Boolean.parseBoolean(savedCheckError.value().toString());
            nodeBuilder.properties().checkError(checkError);
        } else if (uncheckedBuiltinInDoClause) {
            nodeBuilder.properties().checkError(false);
        }

        // Restore advanced callActivity params (retryOnError, timeout, etc.) as ADVANCED_PARAM_KEY
        // so toSourceBuiltin() / populateAdvancedArgs() can emit them as named arguments.
        if (!savedAdvancedProps.isEmpty()) {
            nodeBuilder.properties().nestedProperty();
            nodeBuilder.properties().build().putAll(savedAdvancedProps);
            nodeBuilder.properties().endNestedProperty(
                    Property.ValueType.ADVANCE_PARAM_LIST,
                    Property.ADVANCED_PARAM_KEY,
                    ActivityCallBuilder.ADVANCE_CONFIGURATIONS,
                    ActivityCallBuilder.ADVANCE_CONFIGURATIONS);
        }
        // Restore retryPolicy at root level as a DROPDOWN_CHOICE (must be outside ADVANCE_PARAM_LIST).
        addNormalizedRetryPolicyProperties(rawRetryPolicyValue);
    }

    /**
     * Normalizes a raw retryPolicy source value (e.g. {@code "workflow:NoRetry"} or
     * {@code "{maxRetries: 3, retryDelay: 1.0}"}) into the DROPDOWN_CHOICE value + sub-fields,
     * then adds them as root-level properties on the current nodeBuilder.
     */
    private void addNormalizedRetryPolicyProperties(String rawValue) {
        String dropdownValue = ActivityCallBuilder.NO_RETRY_VALUE;
        String maxRetries = "", retryDelay = "", retryBackoff = "", maxRetryDelay = "";

        if (rawValue != null && !rawValue.isBlank()) {
            if (rawValue.contains("ManualRetry")) {
                dropdownValue = ActivityCallBuilder.MANUAL_RETRY_VALUE;
            } else if (rawValue.trim().startsWith("{")) {
                dropdownValue = ActivityCallBuilder.AUTO_RETRY_VALUE;
                Map<String, String> fields = parseSimpleRecord(rawValue);
                maxRetries = fields.getOrDefault(ActivityCallBuilder.MAX_RETRIES_KEY, "");
                retryDelay = fields.getOrDefault(ActivityCallBuilder.RETRY_DELAY_KEY, "");
                retryBackoff = fields.getOrDefault(ActivityCallBuilder.RETRY_BACKOFF_KEY, "");
                maxRetryDelay = fields.getOrDefault(ActivityCallBuilder.MAX_RETRY_DELAY_KEY, "");
            }
            // else: NoRetry (default) or any unrecognized value
        }

        ActivityCallBuilder.addRetryPolicyFormProperties(nodeBuilder, dropdownValue,
                maxRetries, retryDelay, retryBackoff, maxRetryDelay);
    }

    /** Parses a simple Ballerina record literal {@code {key: value, ...}} into a string map. */
    private static Map<String, String> parseSimpleRecord(String recordLiteral) {
        Map<String, String> result = new LinkedHashMap<>();
        String inner = recordLiteral.trim();
        if (inner.startsWith("{") && inner.endsWith("}")) {
            inner = inner.substring(1, inner.length() - 1).trim();
        }
        for (String part : inner.split(",")) {
            int colon = part.indexOf(':');
            if (colon > 0) {
                result.put(part.substring(0, colon).trim(), part.substring(colon + 1).trim());
            }
        }
        return result;
    }

    /** Rebuilds REST-specific form properties from source values, preserving template shapes. */
    private void populateRestProperties(Map<String, String> src) {
        // method — DROPDOWN_CHOICE; strip quotes carried over from source ("GET" → GET)
        String method = src.getOrDefault(RestActivityStrategy.METHOD_KEY, "GET");
        if (method.length() >= 2 && method.startsWith("\"") && method.endsWith("\"")) {
            method = method.substring(1, method.length() - 1);
        }
        List<Option> methodOptions = List.of(
                new Option("GET", "GET"), new Option("POST", "POST"),
                new Option("PUT", "PUT"), new Option("DELETE", "DELETE"),
                new Option("PATCH", "PATCH"));

        Property messageSubProp = new Property.Builder<Void>(null)
                .metadata()
                    .label("Message")
                    .description("Request body payload (for POST, PUT, PATCH)")
                    .stepOut()
                .type().fieldType(Property.ValueType.EXPRESSION)
                    .ballerinaType("http:RequestMessage").selected(true).stepOut()
                .value(src.getOrDefault(RestActivityStrategy.MESSAGE_KEY, ""))
                .editable(true)
                .build();

        Map<String, Map<String, Property>> methodDynamicFields = new LinkedHashMap<>();
        methodDynamicFields.put("GET", Map.of());
        methodDynamicFields.put("POST", Map.of(RestActivityStrategy.MESSAGE_KEY, messageSubProp));
        methodDynamicFields.put("PUT", Map.of(RestActivityStrategy.MESSAGE_KEY, messageSubProp));
        methodDynamicFields.put("DELETE", Map.of());
        methodDynamicFields.put("PATCH", Map.of(RestActivityStrategy.MESSAGE_KEY, messageSubProp));

        nodeBuilder.properties().custom()
                .metadata().label("Method").description("HTTP method to invoke").stepOut()
                .type().fieldType(Property.ValueType.DROPDOWN_CHOICE)
                    .options(methodOptions).selected(true).stepOut()
                .codedata().kind(ParameterData.Kind.REQUIRED.name()).stepOut()
                .value(method).editable(true)
                .itemOptions(ItemOption.from(methodOptions))
                .dynamicFormFields(methodDynamicFields)
                .stepOut().addProperty(RestActivityStrategy.METHOD_KEY);

        // path — TEXT/EXPRESSION; detect existing string-literal to set mode correctly
        addDualTypePathProperty(src, RestActivityStrategy.PATH_KEY,
                "Path", "Resource path appended to the connection's base URL (e.g., \"/users/1\")",
                "/users/1", false);

        // Hidden top-level message property — value store for method-driven dynamic sub-field.
        String message = src.getOrDefault(RestActivityStrategy.MESSAGE_KEY, "");
        nodeBuilder.properties().custom()
                .metadata().label("Message")
                    .description("Request body payload (for POST, PUT, PATCH)").stepOut()
                .type().fieldType(Property.ValueType.EXPRESSION)
                    .ballerinaType("http:RequestMessage").selected(true).stepOut()
                .value(message).editable(true).optional(true).hidden(true)
                .stepOut().addProperty(RestActivityStrategy.MESSAGE_KEY);

        // headers — advanced EXPRESSION
        String headers = src.getOrDefault(RestActivityStrategy.HEADERS_KEY, "");
        nodeBuilder.properties().custom()
                .metadata().label("Headers").description("Optional request headers").stepOut()
                .type().fieldType(Property.ValueType.EXPRESSION)
                    .ballerinaType("map<string|string[]>?").selected(true).stepOut()
                .value(headers).editable(true).optional(true).advanced(true)
                .stepOut().addProperty(RestActivityStrategy.HEADERS_KEY);
    }

    /** Rebuilds SOAP-specific form properties from source values, preserving template shapes. */
    private void populateSoapProperties(Map<String, String> src) {
        // body — REQUIRED EXPRESSION
        String body = src.getOrDefault(SoapActivityStrategy.BODY_KEY, "");
        nodeBuilder.properties().custom()
                .metadata().label("Body").description("SOAP envelope as xml").stepOut()
                .type().fieldType(Property.ValueType.EXPRESSION).ballerinaType("xml").selected(true).stepOut()
                .codedata().kind(ParameterData.Kind.REQUIRED.name()).stepOut()
                .value(body).editable(true)
                .stepOut().addProperty(SoapActivityStrategy.BODY_KEY);

        // action — dual TEXT/EXPRESSION (like path: detect string literals)
        addDualTypePathProperty(src, SoapActivityStrategy.ACTION_KEY,
                "Action",
                "SOAPAction header. Required for SOAP 1.1 endpoints; optional for SOAP 1.2.",
                "http://tempuri.org/Add", true);

        // headers — advanced EXPRESSION
        String headers = src.getOrDefault(SoapActivityStrategy.HEADERS_KEY, "");
        nodeBuilder.properties().custom()
                .metadata().label("Headers").description("Additional HTTP headers").stepOut()
                .type().fieldType(Property.ValueType.EXPRESSION)
                    .ballerinaType("map<string|string[]>").selected(true).stepOut()
                .value(headers).editable(true).optional(true).advanced(true)
                .stepOut().addProperty(SoapActivityStrategy.HEADERS_KEY);

        // path — TEXT/EXPRESSION, advanced
        addDualTypePathProperty(src, SoapActivityStrategy.PATH_KEY,
                "Path", "Optional resource path appended to the connection's base URL",
                "", true);
    }

    /** Rebuilds Email-specific form properties from source values, preserving template shapes. */
    private void populateEmailProperties(Map<String, String> src, Map<String, String> opts) {
        addRequiredExpressionProperty(src, EmailActivityStrategy.TO_KEY,
                "To", "Recipient email address (or list of addresses)", "string|string[]");
        addRequiredExpressionProperty(src, EmailActivityStrategy.SUBJECT_KEY,
                "Subject", "Email subject line", "string");
        addRequiredExpressionProperty(src, EmailActivityStrategy.FROM_KEY,
                "From", "Sender address", "string");
        addRequiredExpressionProperty(src, EmailActivityStrategy.BODY_KEY,
                "Body", "Plain-text body of the email", "string");

        // EmailOptions fields — all optional, advanced
        addOptionalAdvancedExpression(opts, "cc",
                EmailActivityStrategy.CC_KEY, "CC", "Optional CC recipient(s)", "string|string[]?");
        addOptionalAdvancedExpression(opts, "bcc",
                EmailActivityStrategy.BCC_KEY, "BCC", "Optional BCC recipient(s)", "string|string[]?");
        addOptionalAdvancedExpression(opts, "htmlBody",
                EmailActivityStrategy.HTML_BODY_KEY, "HTML Body",
                "Optional HTML body (sent alongside the plain-text body)", "string?");
        addOptionalAdvancedExpression(opts, "contentType",
                EmailActivityStrategy.CONTENT_TYPE_KEY, "Content Type",
                "MIME content type override (e.g., \"text/plain\")", "string?");
        addOptionalAdvancedExpression(opts, "headers",
                EmailActivityStrategy.EMAIL_HEADERS_KEY, "Email Headers",
                "Additional mail headers as map<string>", "map<string>?");
        addOptionalAdvancedExpression(opts, "replyTo",
                EmailActivityStrategy.REPLY_TO_KEY, "Reply To",
                "Optional Reply-To address(es)", "string|string[]?");
        addOptionalAdvancedExpression(opts, "sender",
                EmailActivityStrategy.SENDER_KEY, "Sender",
                "Sender address (used when the envelope sender differs from From)", "string?");
    }

    /** Adds an optional advanced EXPRESSION property, reading its value from opts by optKey. */
    private void addOptionalAdvancedExpression(Map<String, String> opts, String optKey,
                                               String propKey, String label,
                                               String description, String ballerinaType) {
        String value = opts != null ? opts.getOrDefault(optKey, "") : "";
        nodeBuilder.properties().custom()
                .metadata().label(label).description(description).stepOut()
                .type().fieldType(Property.ValueType.EXPRESSION)
                    .ballerinaType(ballerinaType).selected(true).stepOut()
                .value(value).editable(true).optional(true).advanced(true)
                .stepOut().addProperty(propKey);
    }

    /**
     * Adds a dual TEXT/EXPRESSION path-style property. The TEXT type is selected when the source
     * value is a Ballerina double-quoted string literal; EXPRESSION otherwise.
     *
     * @param advanced {@code true} to mark the property as advanced (for SOAP path/action)
     */
    private void addDualTypePathProperty(Map<String, String> src, String key,
                                          String label, String description,
                                          String placeholder, boolean advanced) {
        String value = src.getOrDefault(key, "");
        boolean isStringLit = value.length() >= 2 && value.startsWith("\"") && value.endsWith("\"");
        String displayValue = isStringLit ? value.substring(1, value.length() - 1) : value;

        nodeBuilder.properties().custom()
                .metadata().label(label).description(description).stepOut()
                .type().fieldType(Property.ValueType.TEXT).ballerinaType("string")
                    .selected(isStringLit).stepOut()
                .type().fieldType(Property.ValueType.EXPRESSION).ballerinaType("string")
                    .selected(!isStringLit).stepOut()
                .value(displayValue).placeholder(placeholder)
                .editable(true).optional(true).advanced(advanced)
                .stepOut().addProperty(key);
    }

    /** Adds a REQUIRED EXPRESSION property for simple string/string[] fields. */
    private void addRequiredExpressionProperty(Map<String, String> src,
                                                String key, String label,
                                                String description, String ballerinaType) {
        String value = src.getOrDefault(key, "");
        nodeBuilder.properties().custom()
                .metadata().label(label).description(description).stepOut()
                .type().fieldType(Property.ValueType.EXPRESSION)
                    .ballerinaType(ballerinaType).selected(true).stepOut()
                .codedata().kind(ParameterData.Kind.REQUIRED.name()).stepOut()
                .value(value).editable(true)
                .stepOut().addProperty(key);
    }

    /**
     * Populates DATA_WAITS_KEY property for a simple wait expression (check wait data.dataName).
     */
    private void populateSimpleWaitDataProperties(WaitActionNode waitActionNode) {
        Node waitFutureExpr = waitActionNode.waitFutureExpr();
        if (waitFutureExpr.kind() != SyntaxKind.FIELD_ACCESS) {
            return;
        }
        FieldAccessExpressionNode fieldAccess = (FieldAccessExpressionNode) waitFutureExpr;
        String dataName = fieldAccess.fieldName().toSourceCode().strip();

        if (typedBindingPatternNode != null) {
            String variableName = typedBindingPatternNode.bindingPattern().toSourceCode().strip();
            Node typeDesc = typedBindingPatternNode.typeDescriptor();
            boolean isNilable = typeDesc.kind() == SyntaxKind.OPTIONAL_TYPE_DESC;
            Node bareTypeDesc = isNilable ? ((OptionalTypeDescriptorNode) typeDesc).typeDescriptor() : typeDesc;
            String dataType = bareTypeDesc.toSourceCode().strip();
            LineRange dataTypeRange = bareTypeDesc.lineRange();
            buildDataWaitsProperty(List.of(new DataWaitEntry(variableName, dataType, dataName, dataTypeRange)));
            addOptionalFlagProperty(isNilable, false);
        }

        ((WaitDataBuilder) nodeBuilder).addAdvancedProperties(workspaceManager.module(filePath)
                .orElse(project.currentPackage().getDefaultModule()), workspaceManager, filePath);
    }

    /**
     * Populates DATA_WAITS_KEY property for an await remote call (ctx->await([data.d1, data.d2])).
     * Removes the generic futures/T properties and keeps minCount/timeout.
     */
    private void populateAwaitWaitDataProperties(RemoteMethodCallActionNode remoteMethodCallActionNode) {
        // Remove generic properties that don't match WaitDataBuilder expectations
        Map<String, Property> properties = nodeBuilder.properties().build();
        properties.keySet().removeIf(EXCLUDED_KEYS::contains);

        // Parse the first argument (futures array) to extract data field references
        SeparatedNodeList<FunctionArgumentNode> args = remoteMethodCallActionNode.arguments();
        List<DataWaitEntry> entries = new ArrayList<>();

        if (!args.isEmpty() && args.get(0) instanceof PositionalArgumentNode positionalArg) {
            ExpressionNode futuresExpr = positionalArg.expression();
            // Expected: [data.field1, data.field2]
            if (futuresExpr.kind() == SyntaxKind.LIST_CONSTRUCTOR) {
                ListConstructorExpressionNode listNode = (ListConstructorExpressionNode) futuresExpr;
                for (Node member : listNode.expressions()) {
                    if (member.kind() == SyntaxKind.FIELD_ACCESS) {
                        FieldAccessExpressionNode fieldAccess = (FieldAccessExpressionNode) member;
                        entries.add(new DataWaitEntry("", "",
                                fieldAccess.fieldName().toSourceCode().strip(), null));
                    }
                }
            }
        }

        // Extract variable names and types from typedBindingPatternNode
        // Tuple: [Type1, Type2] [var1, var2] = check ctx->await([data.f1, data.f2]);
        populateDataEntries(entries);
        buildDataWaitsProperty(entries);
        addOptionalFlagProperty(false, isMinCountLessThanEntries(entries.size()));
    }

    /**
     * Extracts variable names and types from a tuple binding pattern and updates the entries.
     */
    private void populateDataEntries(List<DataWaitEntry> entries) {
        if (typedBindingPatternNode == null) {
            return;
        }

        // Extract types from tuple type descriptor: [Type1, Type2]
        // Strip any trailing '?' (nilable/optional type) from each member — bare type is stored.
        Node typeDesc = typedBindingPatternNode.typeDescriptor();
        List<String> types = new ArrayList<>();
        List<LineRange> typeRanges = new ArrayList<>();
        if (typeDesc.kind() == SyntaxKind.TUPLE_TYPE_DESC) {
            TupleTypeDescriptorNode tupleType = (TupleTypeDescriptorNode) typeDesc;
            for (Node memberType : tupleType.memberTypeDesc()) {
                if (memberType.kind() != SyntaxKind.COMMA_TOKEN) {
                    boolean isNilable = memberType.kind() == SyntaxKind.OPTIONAL_TYPE_DESC;
                    Node bareType = isNilable ? ((OptionalTypeDescriptorNode) memberType).typeDescriptor() : memberType;
                    types.add(bareType.toSourceCode().strip());
                    typeRanges.add(bareType.lineRange());
                }
            }
        }

        // Extract variable names from list binding pattern: [var1, var2]
        BindingPatternNode bindingPattern = typedBindingPatternNode.bindingPattern();
        List<String> varNames = new ArrayList<>();
        if (bindingPattern.kind() == SyntaxKind.LIST_BINDING_PATTERN) {
            ListBindingPatternNode listPattern = (ListBindingPatternNode) bindingPattern;
            for (BindingPatternNode member : listPattern.bindingPatterns()) {
                varNames.add(member.toSourceCode().strip());
            }
        }

        // Update entries with types, variable names, and line ranges
        for (int i = 0; i < entries.size(); i++) {
            String type = i < types.size() ? types.get(i) : "";
            String varName = i < varNames.size() ? varNames.get(i) : "";
            LineRange typeRange = i < typeRanges.size() ? typeRanges.get(i) : null;
            entries.set(i, entries.get(i).withVarAndType(varName, type, typeRange));
        }
    }

    /**
     * Adds the optional FLAG property to the current WAIT_DATA node builder.
     * For the simple-wait case the value reflects actual source nilability; for the tuple-await case
     * the value is always false and a diagnostic is attached when minCount < entry count.
     */
    private void addOptionalFlagProperty(boolean isNilable, boolean addDiagnostic) {
        nodeBuilder.properties().custom()
                .metadata()
                    .label(WaitDataBuilder.OPTIONAL_LABEL)
                    .description(WaitDataBuilder.OPTIONAL_DOC)
                    .stepOut()
                .type()
                    .fieldType(Property.ValueType.FLAG)
                    .selected(false)
                    .stepOut()
                .value(isNilable)
                .optional(false)
                .editable(true)
                .advanced(true)
                .hidden(false);
        if (addDiagnostic) {
            nodeBuilder.properties().custom()
                    .diagnostics()
                        .diagnostic(DiagnosticSeverity.ERROR, WaitDataBuilder.OPTIONAL_DOC);
        }
        nodeBuilder.properties().addProperty(WaitDataBuilder.OPTIONAL_KEY);
    }

    /**
     * Returns true when the minCount named-argument on the current await node is strictly less than
     * the number of data-wait entries (meaning partial completion is allowed and all types should be
     * nilable, but are not → diagnostic).
     */
    private boolean isMinCountLessThanEntries(int entryCount) {
        Map<String, Property> props = nodeBuilder.properties().build();
        Property minCountProp = props.get("minCount");
        if (minCountProp == null || minCountProp.value() == null) {
            return false;
        }
        try {
            int minCount = Integer.parseInt(minCountProp.value().toString().strip());
            return minCount < entryCount;
        } catch (NumberFormatException e) {
            return false;
        }
    }

    /**
     * Builds the DATA_WAITS_KEY repeatable property from a list of DataWaitEntry values.
     */
    private void buildDataWaitsProperty(List<DataWaitEntry> entries) {
        nodeBuilder.properties().nestedProperty();
        for (int i = 0; i < entries.size(); i++) {
            DataWaitEntry entry = entries.get(i);
            nodeBuilder.properties().nestedProperty();

            nodeBuilder.properties().custom()
                    .metadata().label(WaitDataBuilder.DATA_RECEIVE_VAR_NAME)
                        .description(WaitDataBuilder.DATA_RECEIVE_VAR_DOC).stepOut()
                    .value(entry.variableName)
                    .editable(true)
                    .stepOut()
                    .addProperty(Property.VARIABLE_KEY);

            nodeBuilder.properties().custom()
                    .metadata().label(WaitDataBuilder.DATA_TYPE_LABEL)
                        .description(WaitDataBuilder.DATA_TYPE_DOC).stepOut()
                    .value(entry.dataType)
                    .editable(true)
                    .stepOut()
                    .addProperty(WaitDataBuilder.DATA_TYPE_KEY, entry.dataTypeRange);

            nodeBuilder.properties().custom()
                    .metadata().label(WaitDataBuilder.DATA_NAME_LABEL)
                        .description(WaitDataBuilder.DATA_NAME_DOC).stepOut()
                    .value(entry.dataName)
                    .editable(true)
                    .stepOut()
                    .addProperty(WaitDataBuilder.DATA_NAME_KEY);

            nodeBuilder.properties().endNestedProperty(Property.ValueType.FIXED_PROPERTY,
                    String.valueOf(i), WaitDataBuilder.DATA_WAITS_LABEL, WaitDataBuilder.DATA_WAITS_DOC);
        }
        nodeBuilder.properties().endNestedProperty(Property.ValueType.REPEATABLE_PROPERTY,
                WaitDataBuilder.DATA_WAITS_KEY, WaitDataBuilder.DATA_WAITS_LABEL, WaitDataBuilder.DATA_WAITS_DOC,
                WaitDataBuilder.getDataWaitSchema(), false, false);
    }

    private record DataWaitEntry(String variableName, String dataType, String dataName, LineRange dataTypeRange) {
        DataWaitEntry withVarAndType(String variableName, String dataType, LineRange dataTypeRange) {
            return new DataWaitEntry(variableName, dataType, this.dataName, dataTypeRange);
        }
    }

    private boolean isWorkflowWaitData(WaitActionNode waitActionNode) {
        Node waitFutureExpr = waitActionNode.waitFutureExpr();
        // For workflow data, we expect: wait events.dataName
        if (waitFutureExpr.kind() != SyntaxKind.FIELD_ACCESS) {
            return false;
        }

        FieldAccessExpressionNode fieldAccess = (FieldAccessExpressionNode) waitFutureExpr;
        ExpressionNode expression = fieldAccess.expression();
        // Check if the variable being accessed is named "events"
        if (expression.kind() != SyntaxKind.SIMPLE_NAME_REFERENCE) {
            return false;
        }

        Node parent = waitActionNode.parent();
        while (parent != null) {
            if (parent.kind() == SyntaxKind.FUNCTION_DEFINITION) {
                if (isWorkflowFunction(semanticModel.symbol(parent).orElse(null))) {
                    SeparatedNodeList<ParameterNode> parameters =
                            ((FunctionDefinitionNode) parent).functionSignature().parameters();
                    if (parameters.isEmpty()) {
                        return false;
                    }
                    ParameterNode lastParam = parameters.get(parameters.size() - 1);
                    if (lastParam.kind() == SyntaxKind.REQUIRED_PARAM) {
                        RequiredParameterNode requiredParameterNode = (RequiredParameterNode) lastParam;
                        SimpleNameReferenceNode nameRef = (SimpleNameReferenceNode) expression;
                        Optional<Token> paramName = requiredParameterNode.paramName();
                        return paramName.isPresent() && paramName.get().text().equals(nameRef.name().text());
                    }
                }
                return false;
            }
            parent = parent.parent();
        }
        return false;
    }

    private boolean isClassField(ExpressionNode expr) {
        if (expr.kind() == SyntaxKind.FIELD_ACCESS) {
            return ((FieldAccessExpressionNode) expr).expression().toSourceCode().trim().equals("self");
        }
        return false;
    }

    private FunctionDefinitionNode getParentFunction(NonTerminalNode node) {
        NonTerminalNode currentNode = node;
        while (currentNode != null && currentNode.kind() != SyntaxKind.OBJECT_METHOD_DEFINITION &&
                currentNode.kind() != SyntaxKind.FUNCTION_DEFINITION) {
            currentNode = currentNode.parent();
        }
        return currentNode instanceof FunctionDefinitionNode ? (FunctionDefinitionNode) currentNode : null;
    }

    private NonTerminalNode getParentNode(NonTerminalNode node) {
        NonTerminalNode currentNode = node;
        while (currentNode != null && currentNode.kind() != SyntaxKind.SERVICE_DECLARATION &&
                currentNode.kind() != SyntaxKind.CLASS_DEFINITION) {
            currentNode = currentNode.parent();
        }
        return currentNode;
    }

    private void setFunctionProperties(String functionName, ExpressionNode expressionNode,
                                       RemoteMethodCallActionNode remoteMethodCallActionNode,
                                       MethodSymbol functionSymbol, String objName,
                                       Map<String, Object> metadataData) {
        Optional<Package> resolvedPackage = moduleInfo != null ?
                PackageUtil.resolveModulePackage(moduleInfo.org(), moduleInfo.packageName(), moduleInfo.version()) :
                Optional.empty();

        FunctionDataBuilder functionDataBuilder = new FunctionDataBuilder()
                .name(functionName)
                .functionSymbol(functionSymbol)
                .semanticModel(semanticModel)
                .userModuleInfo(moduleInfo)
                .resolvedPackage(resolvedPackage.orElse(null));
        FunctionData functionData = functionDataBuilder.build();

        nodeBuilder
                .symbolInfo(functionSymbol)
                .metadata()
                .label(functionName)
                .description(functionData.description())
                .stepOut()
                .codedata()
                .nodeInfo(remoteMethodCallActionNode)
                .object(objName)
                .symbol(functionName)
                .stepOut()
                .properties().callConnection(expressionNode, Property.CONNECTION_KEY, metadataData);
        processFunctionSymbol(remoteMethodCallActionNode, remoteMethodCallActionNode.arguments(), functionSymbol,
                functionData);
    }

    private String getDefaultMemoryManagerName(ClassSymbol classSymbol) {
        Optional<MethodSymbol> initMethodSymbol = classSymbol.initMethod();
        if (initMethodSymbol.isEmpty()) {
            return "";
        }
        Optional<List<ParameterSymbol>> optParams = initMethodSymbol.get().typeDescriptor().params();
        if (optParams.isEmpty()) {
            return "";
        }
        for (ParameterSymbol param : optParams.get()) {
            ParameterKind paramKind = param.paramKind();
            if (paramKind == ParameterKind.INCLUDED_RECORD) {
                TypeSymbol rawType = CommonUtils.getRawType(param.typeDescriptor());
                if (rawType.typeKind() != TypeDescKind.RECORD) {
                    break;
                }
                RecordFieldSymbol recordFieldSymbol =
                        ((RecordTypeSymbol) rawType).fieldDescriptors().get("memory");
                if (recordFieldSymbol == null) {
                    break;
                }
                if (recordFieldSymbol.hasDefaultValue()) {
                    // TODO: This should be derived from the default value of memory parameter
                    return "ai:MessageWindowChatMemory";
                }
            }
        }
        return "";
    }

    @Override
    public void visit(ClientResourceAccessActionNode clientResourceAccessActionNode) {
        if (forceAssign) {
            return;
        }
        Optional<Symbol> symbol = semanticModel.symbol(clientResourceAccessActionNode);
        if (symbol.isEmpty() || (symbol.get().kind() != SymbolKind.METHOD &&
                symbol.get().kind() != SymbolKind.RESOURCE_METHOD)) {
            handleExpressionNode(clientResourceAccessActionNode);
            return;
        }
        Optional<ClassSymbol> classSymbol = getClassSymbol(clientResourceAccessActionNode.expression());
        if (classSymbol.isEmpty()) {
            handleExpressionNode(clientResourceAccessActionNode);
            return;
        }

        String functionName = clientResourceAccessActionNode.methodName()
                .map(simpleNameReference -> simpleNameReference.name().text()).orElse("get");
        ExpressionNode expressionNode = clientResourceAccessActionNode.expression();
        SeparatedNodeList<FunctionArgumentNode> argumentNodes =
                clientResourceAccessActionNode.arguments().map(ParenthesizedArgList::arguments).orElse(null);

        MethodSymbol functionSymbol = (MethodSymbol) symbol.get();
        startNode(NodeKind.RESOURCE_ACTION_CALL, expressionNode.parent());

        SeparatedNodeList<Node> nodes = clientResourceAccessActionNode.resourceAccessPath();
        ParamUtils.ResourcePathTemplate resourcePathTemplate = ParamUtils.buildResourcePathTemplate(semanticModel,
                functionSymbol, semanticModel.types().ERROR);
        if (CommonUtils.isHttpModule(functionSymbol)) {
            String resourcePath = nodes.stream().map(Node::toSourceCode).collect(Collectors.joining("/"));
            String fullPath = "/" + resourcePath;
            nodeBuilder.properties().resourcePath(fullPath, true);
        } else {
            nodeBuilder.properties().resourcePath(resourcePathTemplate.resourcePathTemplate(), false);
            int idx = 0;
            for (int i = 0; i < nodes.size(); i++) {
                Node node = nodes.get(i);
                if (nodes.size() <= idx) {
                    break;
                }
                if (node instanceof ComputedResourceAccessSegmentNode computedResourceAccessSegmentNode) {
                    ExpressionNode expr = computedResourceAccessSegmentNode.expression();
                    ParameterData paramResult = resourcePathTemplate.pathParams().get(idx);
                    String unescapedParamName = ParamUtils.removeLeadingSingleQuote(paramResult.name());
                    nodeBuilder.properties()
                            .custom()
                                .metadata()
                                .label(paramResult.label())
                                .description(paramResult.description())
                                .stepOut()
                            .codedata()
                                .kind(paramResult.kind().name())
                                .originalName(paramResult.name())
                                .stepOut()
                            .value(expr.toSourceCode())
                            .typeWithExpression(paramResult.typeSymbol(), moduleInfo)
                            .editable()
                            .defaultable(paramResult.optional())
                            .stepOut()
                            .addProperty(unescapedParamName);
                    idx++;
                }
            }
        }

        FunctionDataBuilder functionDataBuilder = new FunctionDataBuilder()
                .name(functionName)
                .functionSymbol(functionSymbol)
                .semanticModel(semanticModel)
                .userModuleInfo(moduleInfo)
                .resourcePath(resourcePathTemplate.resourcePathTemplate())
                .functionResultKind(FunctionData.Kind.RESOURCE);
        FunctionData functionData = functionDataBuilder.build();
        Map<String, Object> metadataData = getConnectorMetadata(classSymbol.get());

        nodeBuilder.symbolInfo(functionSymbol)
                .metadata()
                    .label(functionName)
                    .description(functionData.description())
                    .stepOut()
                .codedata()
                    .nodeInfo(clientResourceAccessActionNode)
                    .object(classSymbol.get().getName().orElse(""))
                    .symbol(functionName)
                    .resourcePath(resourcePathTemplate.resourcePathTemplate())
                    .stepOut()
                .properties()
                .callConnection(expressionNode, Property.CONNECTION_KEY, metadataData)
                .data(this.typedBindingPatternNode, false, new HashSet<>());
        if (isPersistClient(classSymbol.get(), semanticModel)) {
            CommonUtils.getPersistDatabaseIcon(classSymbol.get())
                    .ifPresent(icon -> nodeBuilder.metadata().icon(icon));
        }
        processFunctionSymbol(clientResourceAccessActionNode, argumentNodes, functionSymbol, functionData);
    }

    private Map<String, Object> getPersistDataFromClient(ClassSymbol classSymbol) {
        Map<String, Object> persistData;
        if (isPersistClient(classSymbol, semanticModel)) {
            persistData = new HashMap<>();
            persistData.put(CONNECTOR_TYPE, PERSIST);
            getPersistModelFilePath(project.sourceRoot(), classSymbol)
                    .ifPresent(modelFile -> persistData.put(PERSIST_MODEL_FILE, modelFile));
        } else {
            persistData = null;
        }
        return persistData;
    }

    private Map<String, Object> getConnectorMetadata(ClassSymbol classSymbol) {
        Map<String, Object> persistData = getPersistDataFromClient(classSymbol);
        if (persistData != null) {
            return persistData;
        }
        String moduleName = classSymbol.getModule().map(ModuleSymbol::id).map(ModuleID::moduleName).orElse("");
        Map<String, Object> connectorData = new HashMap<>();
        connectorData.put(CONNECTOR_TYPE, ConnectorUtil.getConnectionCategory(moduleName));
        return connectorData;
    }

    private void addRemainingParamsToPropertyMap(Map<String, ParameterData> funcParamMap,
                                                 boolean hasOnlyRestParams) {
        for (Map.Entry<String, ParameterData> entry : funcParamMap.entrySet()) {
            ParameterData paramResult = entry.getValue();
            if (paramResult.kind().equals(ParameterData.Kind.PARAM_FOR_TYPE_INFER)
                    || paramResult.kind().equals(ParameterData.Kind.INCLUDED_RECORD)) {
                continue;
            }

            String unescapedParamName = ParamUtils.removeLeadingSingleQuote(paramResult.name());
            Property.Builder<FormBuilder<NodeBuilder>> customPropBuilder = nodeBuilder.properties().custom();
            customPropBuilder
                    .metadata()
                        .label(paramResult.label())
                        .description(paramResult.description())
                        .stepOut()
                    .codedata()
                        .kind(paramResult.kind().name())
                        .originalName(paramResult.name())
                        .stepOut()
                    .placeholder(paramResult.placeholder())
                    .defaultValue(paramResult.defaultValue())
                    .imports(paramResult.importStatements())
                    .editable()
                    .defaultable(paramResult.optional());

            if (paramResult.kind() == ParameterData.Kind.INCLUDED_RECORD_REST) {
                if (hasOnlyRestParams) {
                    customPropBuilder.defaultable(false);
                }
                unescapedParamName = "additionalValues";
                Property template = customPropBuilder.buildRepeatableTemplates(paramResult.typeSymbol(),
                        semanticModel, moduleInfo);
                customPropBuilder.type()
                        .fieldType(Property.ValueType.REPEATABLE_MAP)
                        .ballerinaType(paramResult.type())
                        .template(template)
                        .selected(true)
                        .stepOut();
            } else if (paramResult.kind() == ParameterData.Kind.REST_PARAMETER) {
                if (hasOnlyRestParams) {
                    customPropBuilder.defaultable(false);
                }
                Property template = customPropBuilder.buildRepeatableTemplates(paramResult.typeSymbol(),
                        semanticModel, moduleInfo);
                customPropBuilder.type()
                        .fieldType(Property.ValueType.REPEATABLE_LIST)
                        .ballerinaType(paramResult.type())
                        .template(template)
                        .selected(true)
                        .stepOut();
            } else {
                customPropBuilder.typeWithExpression(paramResult.typeSymbol(), moduleInfo);
            }
            customPropBuilder
                    .stepOut()
                    .addProperty(unescapedParamName);
        }
    }

    private void calculateFunctionArgs(Map<String, Node> namedArgValueMap,
                                       Queue<Node> positionalArgs,
                                       SeparatedNodeList<FunctionArgumentNode> argumentNodes) {
        if (argumentNodes != null) {
            for (FunctionArgumentNode argument : argumentNodes) {
                switch (argument.kind()) {
                    case NAMED_ARG -> {
                        NamedArgumentNode namedArgument = (NamedArgumentNode) argument;
                        namedArgValueMap.put(namedArgument.argumentName().name().text(),
                                namedArgument.expression());
                    }
                    case POSITIONAL_ARG -> positionalArgs.add(((PositionalArgumentNode) argument).expression());
                    default -> {
                        // Ignore the default case
                    }
                }
            }
        }
    }

    private void buildPropsFromFuncCallArgs(SeparatedNodeList<FunctionArgumentNode> argumentNodes,
                                            FunctionTypeSymbol functionTypeSymbol,
                                            Map<String, ParameterData> funcParamMap,
                                            Queue<Node> positionalArgs, Map<String, Node> namedArgValueMap) {
        if (argumentNodes == null) { // cl->/path/to/'resource;
            List<ParameterData> functionParameters = funcParamMap.values().stream().toList();
            boolean hasOnlyRestParams = functionParameters.size() == 1;
            for (ParameterData paramResult : functionParameters) {
                ParameterData.Kind paramKind = paramResult.kind();

                if (paramKind.equals(ParameterData.Kind.PATH_PARAM) ||
                        paramKind.equals(ParameterData.Kind.PATH_REST_PARAM)
                        || paramKind.equals(ParameterData.Kind.PARAM_FOR_TYPE_INFER)
                        || paramKind.equals(ParameterData.Kind.INCLUDED_RECORD)) {
                    continue;
                }

                String unescapedParamName = ParamUtils.removeLeadingSingleQuote(paramResult.name());
                Property.Builder<FormBuilder<NodeBuilder>> customPropBuilder = nodeBuilder.properties().custom();
                customPropBuilder
                        .metadata()
                            .label(paramResult.label())
                            .description(paramResult.description())
                            .stepOut()
                        .codedata()
                            .kind(paramKind.name())
                            .originalName(paramResult.name())
                            .stepOut()
                        .placeholder(paramResult.placeholder())
                        .defaultValue(paramResult.defaultValue())
                        .imports(paramResult.importStatements())
                        .editable()
                        .defaultable(paramResult.optional());

                if (paramKind == ParameterData.Kind.INCLUDED_RECORD_REST) {
                    if (hasOnlyRestParams) {
                        customPropBuilder.defaultable(false);
                    }
                    Property template = customPropBuilder.buildRepeatableTemplates(paramResult.typeSymbol(),
                            semanticModel, moduleInfo);
                    customPropBuilder.type()
                            .fieldType(Property.ValueType.REPEATABLE_MAP)
                            .ballerinaType(paramResult.type())
                            .template(template)
                            .selected(true)
                            .stepOut();
                } else if (paramKind == ParameterData.Kind.REST_PARAMETER) {
                    if (hasOnlyRestParams) {
                        customPropBuilder.defaultable(false);
                    }
                    Property template = customPropBuilder.buildRepeatableTemplates(paramResult.typeSymbol(),
                            semanticModel, moduleInfo);
                    customPropBuilder.type()
                            .fieldType(Property.ValueType.REPEATABLE_LIST)
                            .ballerinaType(paramResult.type())
                            .template(template)
                            .selected(true)
                            .stepOut();
                } else {
                    customPropBuilder.typeWithExpression(paramResult.typeSymbol(), moduleInfo);
                }
                customPropBuilder
                        .stepOut()
                        .addProperty(FlowNodeUtil.getPropertyKey(unescapedParamName));
            }
            return;
        }

        boolean hasOnlyRestParams = funcParamMap.size() == 1;
        if (functionTypeSymbol.restParam().isPresent()) {
            ParameterSymbol restParamSymbol = functionTypeSymbol.restParam().get();
            Optional<List<ParameterSymbol>> paramsOptional = functionTypeSymbol.params();

            if (paramsOptional.isPresent()) {
                List<ParameterSymbol> paramsList = paramsOptional.get();
                int paramCount = paramsList.size(); // param count without rest params
                int argCount = positionalArgs.size();

                List<Node> restArgs = new ArrayList<>();
                for (int i = 0; i < paramsList.size(); i++) {
                    ParameterSymbol parameterSymbol = paramsList.get(i);
                    Optional<String> nameOptional = parameterSymbol.getName();
                    if (nameOptional.isEmpty()) {
                        continue;
                    }
                    String escapedParamName = nameOptional.get();
                    ParameterData paramResult = funcParamMap.get(escapedParamName);
                    if (paramResult == null) {
                        escapedParamName = CommonUtil.escapeReservedKeyword(escapedParamName);
                    }
                    paramResult = funcParamMap.get(escapedParamName);
                    if (paramResult == null) {
                        continue;
                    }
                    Node paramValue = i < argCount ? positionalArgs.poll()
                            : namedArgValueMap.get(paramResult.name());

                    funcParamMap.remove(escapedParamName);
                    Property.Builder<FormBuilder<NodeBuilder>> customPropBuilder =
                            nodeBuilder.properties().custom();
                    String unescapedParamName = ParamUtils.removeLeadingSingleQuote(paramResult.name());
                    String value = paramValue != null ? paramValue.toSourceCode().strip() : null;

                    FormBuilder<NodeBuilder> nodeBuilderFormBuilder = customPropBuilder
                            .metadata()
                                .label(paramResult.label())
                                .description(paramResult.description())
                                .stepOut()
                            .imports(paramResult.importStatements())
                            .value(value)
                            .placeholder(paramResult.placeholder())
                            .defaultValue(paramResult.defaultValue())
                            .editable()
                            .defaultable(paramResult.optional())
                            .codedata()
                                .kind(paramResult.kind().name())
                                .originalName(paramResult.name())
                                .stepOut()
                            .stepOut();

                    buildPropertyType(customPropBuilder, paramResult, paramValue);
                    nodeBuilderFormBuilder.addProperty(FlowNodeUtil.getPropertyKey(unescapedParamName));
                }

                for (int i = paramCount; i < argCount; i++) {
                    restArgs.add(Objects.requireNonNull(positionalArgs.poll()));
                }
                Property.Builder<FormBuilder<NodeBuilder>> customPropBuilder =
                        nodeBuilder.properties().custom();
                Optional<String> restNameOptional = restParamSymbol.getName();
                if (restNameOptional.isEmpty()) {
                    return;
                }
                String escapedParamName = restNameOptional.get();
                ParameterData restParamResult = funcParamMap.get(escapedParamName);
                Optional<String> restParamName = restParamSymbol.getName();
                if (restParamResult == null && restParamName.isPresent()) {
                    restParamResult = funcParamMap.get(CommonUtil.escapeReservedKeyword(
                            restParamName.get()));
                }
                restParamName.ifPresent(funcParamMap::remove);
                if (restParamResult == null) {
                    return;
                }
                String unescapedParamName = ParamUtils.removeLeadingSingleQuote(restParamResult.name());
                FormBuilder<NodeBuilder> nodeBuilderFormBuilder = customPropBuilder
                        .metadata()
                        .label(unescapedParamName)
                        .description(restParamResult.description())
                        .stepOut()
                        .imports(restParamResult.importStatements())
                        .value(restArgs)
                        .placeholder(restParamResult.placeholder())
                        .defaultValue(restParamResult.defaultValue())
                        .editable()
                        .defaultable(!hasOnlyRestParams)
                        .codedata()
                        .kind(restParamResult.kind().name())
                        .originalName(restParamResult.name())
                        .stepOut()
                        .stepOut();

                buildPropertyTypeForRestParam(customPropBuilder, restParamResult, restArgs);
                nodeBuilderFormBuilder.addProperty(FlowNodeUtil.getPropertyKey(unescapedParamName));
            }
            // iterate over functionParamMap
            addRemainingParamsToPropertyMap(funcParamMap, hasOnlyRestParams);
            return;
        }
        boolean hasIncludedParamAsNamedArg = false;
        Optional<List<ParameterSymbol>> paramsOptional = functionTypeSymbol.params();
        if (paramsOptional.isPresent()) {
            List<ParameterSymbol> paramsList = paramsOptional.get();
            int argCount = positionalArgs.size();

            final List<LinkedHashMap<String, Node>> includedRecordRestArgs = new ArrayList<>();
            for (int i = 0; i < paramsList.size(); i++) {
                ParameterSymbol parameterSymbol = paramsList.get(i);
                Optional<String> paramNameOptional = parameterSymbol.getName();
                if (paramNameOptional.isEmpty()) {
                    continue;
                }
                String escapedParamName = paramNameOptional.get();
                if (!funcParamMap.containsKey(escapedParamName)) {
                    escapedParamName = CommonUtil.escapeReservedKeyword(escapedParamName);
                    if (!funcParamMap.containsKey(escapedParamName)) {
                        continue;
                    }
                }
                ParameterData paramResult = funcParamMap.get(escapedParamName);
                Node paramValue;
                if (i < argCount) {
                    paramValue = positionalArgs.poll();
                } else {
                    paramValue = namedArgValueMap.get(paramResult.name());
                    namedArgValueMap.remove(paramResult.name());
                }
                if (paramResult.kind() == ParameterData.Kind.INCLUDED_RECORD) {
                    if (argumentNodes.size() > i && argumentNodes.get(i).kind() == SyntaxKind.NAMED_ARG) {
                        FunctionArgumentNode argNode = argumentNodes.get(i);
                        NamedArgumentNode namedArgumentNode = (NamedArgumentNode) argNode;
                        String argName = namedArgumentNode.argumentName().name().text();
                        if (argName.equals(paramResult.name())) {  // foo("a", b = {})
                            paramResult = funcParamMap.get(escapedParamName);

                            Property.Builder<FormBuilder<NodeBuilder>> customPropBuilder =
                                    nodeBuilder.properties().custom();
                            String value = paramValue != null ? paramValue.toSourceCode().strip() : null;
                            String unescapedParamName = ParamUtils.removeLeadingSingleQuote(paramResult.name());

                            FormBuilder<NodeBuilder> nodeBuilderFormBuilder = customPropBuilder
                                    .metadata()
                                        .label(paramResult.label())
                                        .description(paramResult.description())
                                        .stepOut()
                                    .imports(paramResult.importStatements())
                                    .value(value)
                                    .placeholder(paramResult.placeholder())
                                    .defaultValue(paramResult.defaultValue())
                                    .editable()
                                    .defaultable(paramResult.optional())
                                    .codedata()
                                        .kind(paramResult.kind().name())
                                        .originalName(paramResult.name())
                                        .stepOut()
                                    .stepOut();

                            buildPropertyType(customPropBuilder, paramResult, paramValue);
                            nodeBuilderFormBuilder.addProperty(FlowNodeUtil.getPropertyKey(unescapedParamName));
                            hasIncludedParamAsNamedArg = true;
                        } else {
                            if (funcParamMap.containsKey(argName)) { // included record attribute
                                paramResult = funcParamMap.get(argName);
                                funcParamMap.remove(argName);
                                Property.Builder<FormBuilder<NodeBuilder>> customPropBuilder =
                                        nodeBuilder.properties().custom();
                                if (paramValue == null) {
                                    paramValue = namedArgValueMap.get(argName);
                                    namedArgValueMap.remove(argName);
                                }
                                String value = paramValue != null ? paramValue.toSourceCode().strip() : null;
                                String unescapedParamName = ParamUtils.removeLeadingSingleQuote(paramResult.name());

                                FormBuilder<NodeBuilder> nodeBuilderFormBuilder = customPropBuilder
                                        .metadata()
                                            .label(paramResult.label())
                                            .description(paramResult.description())
                                            .stepOut()
                                        .imports(paramResult.importStatements())
                                        .value(value)
                                        .placeholder(paramResult.placeholder())
                                        .defaultValue(paramResult.defaultValue())
                                        .editable()
                                        .defaultable(paramResult.optional())
                                        .codedata()
                                            .kind(paramResult.kind().name())
                                            .originalName(paramResult.name())
                                            .stepOut()
                                        .stepOut();

                                buildPropertyType(customPropBuilder, paramResult, paramValue);
                                nodeBuilderFormBuilder.addProperty(FlowNodeUtil.getPropertyKey(unescapedParamName),
                                        paramValue);
                            }
                        }
                        funcParamMap.remove(escapedParamName);
                    } else { // positional arg
                        if (paramValue != null) {
                            Property.Builder<FormBuilder<NodeBuilder>> customPropBuilder =
                                    nodeBuilder.properties().custom();

                            String unescapedParamName = ParamUtils.removeLeadingSingleQuote(paramResult.name());
                            funcParamMap.remove(escapedParamName);
                            String value = paramValue.toSourceCode().strip();

                            FormBuilder<NodeBuilder> nodeBuilderFormBuilder = customPropBuilder
                                    .metadata()
                                        .label(paramResult.label())
                                        .description(paramResult.description())
                                        .stepOut()
                                    .imports(paramResult.importStatements())
                                    .value(value)
                                    .placeholder(paramResult.placeholder())
                                    .defaultValue(paramResult.defaultValue())
                                    .editable()
                                    .defaultable(paramResult.optional())
                                    .codedata()
                                        .kind(paramResult.kind().name())
                                        .originalName(paramResult.name())
                                        .stepOut()
                                    .stepOut();

                            buildPropertyType(customPropBuilder, paramResult, paramValue);
                            nodeBuilderFormBuilder.addProperty(FlowNodeUtil.getPropertyKey(unescapedParamName),
                                    paramValue);
                            return;
                        }
                    }
                }

                if (paramValue == null && paramResult.kind() == ParameterData.Kind.INCLUDED_RECORD) {
                    funcParamMap.remove(escapedParamName);
                    continue;
                }
                Property.Builder<FormBuilder<NodeBuilder>> customPropBuilder =
                        nodeBuilder.properties().custom();
                funcParamMap.remove(escapedParamName);
                String unescapedParamName = ParamUtils.removeLeadingSingleQuote(paramResult.name());
                String value = paramValue != null ? paramValue.toSourceCode().strip() : null;

                FormBuilder<NodeBuilder> nodeBuilderFormBuilder = customPropBuilder
                        .metadata()
                            .label(paramResult.label())
                            .description(paramResult.description())
                            .stepOut()
                        .imports(paramResult.importStatements())
                        .value(value)
                        .placeholder(paramResult.placeholder())
                        .defaultValue(paramResult.defaultValue())
                        .editable()
                        .defaultable(paramResult.optional())
                        .codedata()
                            .kind(paramResult.kind().name())
                            .originalName(paramResult.name())
                            .stepOut()
                        .stepOut();

                buildPropertyType(customPropBuilder, paramResult, paramValue);
                nodeBuilderFormBuilder.addProperty(FlowNodeUtil.getPropertyKey(unescapedParamName), paramValue);
            }

            handleRemaningNamedArgs(funcParamMap, namedArgValueMap, includedRecordRestArgs);
            handleIncludedRecordRestArgs(funcParamMap, includedRecordRestArgs);
            if (hasIncludedParamAsNamedArg) {
                return;
            }
            addRemainingParamsToPropertyMap(funcParamMap, hasOnlyRestParams);
        }
    }

    private void handleRemaningNamedArgs(Map<String, ParameterData> funcParamMap, Map<String, Node> namedArgValueMap,
                                         List<LinkedHashMap<String, Node>> includedRecordRestArgs) {
        for (Map.Entry<String, Node> entry : namedArgValueMap.entrySet()) {
            String escapedParamName = CommonUtil.escapeReservedKeyword(entry.getKey());
            if (!funcParamMap.containsKey(escapedParamName)) {
                LinkedHashMap<String, Node> map = new LinkedHashMap<>();
                map.put(entry.getKey(), entry.getValue());
                includedRecordRestArgs.add(map);
                continue;
            }
            Property.Builder<FormBuilder<NodeBuilder>> customPropBuilder =
                    nodeBuilder.properties().custom();
            ParameterData paramResult = funcParamMap.remove(escapedParamName);
            String unescapedParamName = ParamUtils.removeLeadingSingleQuote(paramResult.name());
            Node paramValue = entry.getValue();
            String value = paramValue != null ? paramValue.toSourceCode().strip() : null;

            FormBuilder<NodeBuilder> nodeBuilderFormBuilder = customPropBuilder
                    .metadata()
                        .label(paramResult.label())
                        .description(paramResult.description())
                        .stepOut()
                    .imports(paramResult.importStatements())
                    .value(value)
                    .placeholder(paramResult.placeholder())
                    .defaultValue(paramResult.defaultValue())
                    .editable()
                    .defaultable(paramResult.optional())
                    .codedata()
                        .kind(paramResult.kind().name())
                        .originalName(paramResult.name())
                        .stepOut()
                    .stepOut();

            buildPropertyType(customPropBuilder, paramResult, paramValue);
            nodeBuilderFormBuilder.addProperty(FlowNodeUtil.getPropertyKey(unescapedParamName), paramValue);
        }
    }

    private void handleIncludedRecordRestArgs(Map<String, ParameterData> funcParamMap,
                                              List<LinkedHashMap<String, Node>> includedRecordRestArgs) {
        ParameterData includedRecordRest = funcParamMap.get("Additional Values");
        if (includedRecordRest != null) {
            funcParamMap.remove("Additional Values");
            Property.Builder<FormBuilder<NodeBuilder>> customPropBuilder =
                    nodeBuilder.properties().custom();
            FormBuilder<NodeBuilder> nodeBuilderFormBuilder = customPropBuilder
                    .metadata()
                    .label(includedRecordRest.label())
                    .description(includedRecordRest.description())
                    .stepOut()
                    .imports(includedRecordRest.importStatements())
                    .value(includedRecordRestArgs)
                    .placeholder(includedRecordRest.placeholder())
                    .defaultValue(includedRecordRest.defaultValue())
                    .editable()
                    .defaultable(includedRecordRest.optional())
                    .codedata()
                    .kind(includedRecordRest.kind().name())
                    .originalName(includedRecordRest.name())
                    .stepOut()
                    .stepOut();

            buildPropertyTypeForIncludedRecordRest(customPropBuilder, includedRecordRest, includedRecordRestArgs);
            nodeBuilderFormBuilder.addProperty("additionalValues");
        }
    }

    private void handleCheckFlag(NonTerminalNode node, FunctionTypeSymbol functionTypeSymbol) {
        SyntaxKind parentKind = node.parent().kind();
        if (parentKind == SyntaxKind.CHECK_ACTION || parentKind == SyntaxKind.CHECK_EXPRESSION) {
            nodeBuilder.properties().checkError(true);
        } else {
            functionTypeSymbol.returnTypeDescriptor()
                    .ifPresent(typeSymbol -> {
                        if (CommonUtils.subTypeOf(typeSymbol, semanticModel.types().ERROR)
                                && CommonUtils.withinDoClause(node)) {
                            nodeBuilder.properties().checkError(false);
                        }
                    });
        }
    }

    private void buildPropertyTypeForRestParam(Property.Builder<?> builder, ParameterData paramData,
                                               List<Node> values) {
        Property template = builder.buildRepeatableTemplates(paramData.typeSymbol(), semanticModel, moduleInfo);
        builder.type()
                .fieldType(Property.ValueType.REPEATABLE_LIST)
                .ballerinaType(paramData.type())
                .template(template)
                .selected(true)
                .stepOut();
        builder.handleRestArguments(builder, values, diagnosticHandler);
    }

    private void buildPropertyTypeForIncludedRecordRest(Property.Builder<?> builder, ParameterData paramData,
                                                        List<LinkedHashMap<String, Node>> values) {
        Property template = builder.buildRepeatableTemplates(paramData.typeSymbol(), semanticModel, moduleInfo);
        builder.type()
                .fieldType(Property.ValueType.REPEATABLE_MAP)
                .ballerinaType(paramData.type())
                .template(template)
                .selected(true)
                .stepOut();
        builder.handleIncludedRecordRestArgs(builder, values, diagnosticHandler);
    }

    private void buildPropertyType(Property.Builder<?> builder, ParameterData paramData, Node value) {
        ParameterData.Kind kind = paramData.kind();
        if (kind == ParameterData.Kind.REST_PARAMETER) {
            builder.type(Property.ValueType.EXPRESSION_SET);
        } else if (kind == ParameterData.Kind.INCLUDED_RECORD_REST) {
            builder.type(Property.ValueType.MAPPING_EXPRESSION_SET);
        } else {
            String ballerinaType = CommonUtils.getTypeSignature(paramData.typeSymbol(), moduleInfo);
            if (ballerinaType != null && (ballerinaType.contains(PARAMETERIZED_QUERY)
                    || ballerinaType.contains(PARAMETERIZED_CALL_QUERY))) {
                // Handle SQL query parameters with SQL_QUERY as primary option
                builder.type()
                        .fieldType(Property.ValueType.SQL_QUERY)
                        .ballerinaType(ballerinaType)
                        .selected(true)
                        .stepOut();
                builder.type()
                        .fieldType(Property.ValueType.EXPRESSION)
                        .ballerinaType(ballerinaType)
                        .selected(false)
                        .stepOut();
            } else if (isSubTypeOfRawTemplate(paramData.typeSymbol())) {
                String typeSignature = CommonUtils.getTypeSignature(paramData.typeSymbol(), moduleInfo);
                if (AiUtils.AI_PROMPT_TYPE.equals(typeSignature)) {
                    boolean isPromptSelected = value != null && value.kind() == SyntaxKind.RAW_TEMPLATE_EXPRESSION;
                    builder.type()
                            .fieldType(Property.ValueType.PROMPT)
                            .ballerinaType(AiUtils.AI_PROMPT_TYPE)
                            .selected(isPromptSelected)
                            .stepOut();
                    builder.type()
                            .fieldType(Property.ValueType.EXPRESSION)
                            .ballerinaType(typeSignature)
                            .selected(!isPromptSelected)
                            .stepOut();
                } else {
                    builder.type(Property.ValueType.RAW_TEMPLATE);
                }
            } else {
                builder.typeWithExpression(paramData.typeSymbol(), moduleInfo, value, semanticModel, builder,
                        diagnosticHandler);
            }
        }
    }

    @Override
    public void visit(IfElseStatementNode ifElseStatementNode) {
        startNode(NodeKind.IF, ifElseStatementNode);
        addConditionalBranch(ifElseStatementNode.condition(), ifElseStatementNode.ifBody(), IfBuilder.IF_THEN_LABEL);
        ifElseStatementNode.elseBody().ifPresent(this::analyzeElseBody);
        endNode(ifElseStatementNode);
    }

    private void addConditionalBranch(ExpressionNode condition, BlockStatementNode body, String label) {
        Branch.Builder branchBuilder = startBranch(label, NodeKind.CONDITIONAL, Branch.BranchKind.BLOCK,
                Branch.Repeatable.ONE_OR_MORE).properties().condition(condition).stepOut();
        analyzeBlock(body, branchBuilder);
        endBranch(branchBuilder, body);
    }

    private void analyzeElseBody(Node elseBody) {
        switch (elseBody.kind()) {
            case ELSE_BLOCK -> analyzeElseBody(((ElseBlockNode) elseBody).elseBody());
            case BLOCK_STATEMENT -> {
                Branch.Builder branchBuilder =
                        startBranch(IfBuilder.IF_ELSE_LABEL, NodeKind.ELSE, Branch.BranchKind.BLOCK,
                                Branch.Repeatable.ZERO_OR_ONE);
                analyzeBlock((BlockStatementNode) elseBody, branchBuilder);
                endBranch(branchBuilder, elseBody);
            }
            case IF_ELSE_STATEMENT -> {
                IfElseStatementNode ifElseNode = (IfElseStatementNode) elseBody;
                addConditionalBranch(ifElseNode.condition(), ifElseNode.ifBody(),
                        ifElseNode.condition().toSourceCode().strip());
                ifElseNode.elseBody().ifPresent(this::analyzeElseBody);
            }
            default -> throw new IllegalStateException("Unexpected else body kind: " + elseBody.kind());
        }
    }

    @Override
    public void visit(ImplicitNewExpressionNode implicitNewExpressionNode) {
        SeparatedNodeList<FunctionArgumentNode> argumentNodes =
                implicitNewExpressionNode.parenthesizedArgList()
                        .map(ParenthesizedArgList::arguments)
                        .orElse(null);
        checkForNewConnectionOrAgent(implicitNewExpressionNode, argumentNodes);
    }

    @Override
    public void visit(ExplicitNewExpressionNode explicitNewExpressionNode) {
        SeparatedNodeList<FunctionArgumentNode> argumentNodes =
                explicitNewExpressionNode.parenthesizedArgList().arguments();
        checkForNewConnectionOrAgent(explicitNewExpressionNode, argumentNodes);
    }

    private void checkForNewConnectionOrAgent(NewExpressionNode newExpressionNode,
                                              SeparatedNodeList<FunctionArgumentNode> argumentNodes) {
        Optional<ClassSymbol> optClassSymbol = getClassSymbol(newExpressionNode);
        if (optClassSymbol.isEmpty()) {
            return;
        }
        ClassSymbol classSymbol = optClassSymbol.get();
        NodeKind kind = resolveNodeKind(classSymbol);
        if (kind == null) {
            handleExpressionNode(newExpressionNode);
            return;
        }
        startNode(kind, newExpressionNode);
        Optional<MethodSymbol> optMethodSymbol = classSymbol.initMethod();
        FunctionDataBuilder functionDataBuilder = new FunctionDataBuilder()
                .parentSymbol(classSymbol)
                .semanticModel(semanticModel)
                .name(NewConnectionBuilder.INIT_SYMBOL)
                .functionResultKind(getFunctionResultKind(classSymbol))
                .userModuleInfo(moduleInfo)
                .project(project);

        FunctionData functionData;
        if (optMethodSymbol.isPresent()) {
            MethodSymbol methodSymbol = optMethodSymbol.get();
            functionDataBuilder.functionSymbol(methodSymbol);
            functionData = functionDataBuilder.build();
            processFunctionSymbol(newExpressionNode, argumentNodes, methodSymbol, functionData);
        } else {
            functionData = functionDataBuilder.build();
        }

        String org = functionData.org();
        String packageName = functionData.packageName();
        String moduleName = functionData.moduleName();
        String name = classSymbol.getName().orElse("");
        // For sub-modules (e.g. "new_connection1.db"), use the package name so the label/module
        // reflects the top-level package rather than the internal sub-module segment.
        String effectiveModule = (kind == NodeKind.NEW_CONNECTION && packageName != null
                && moduleName.startsWith(packageName + ".")) ? packageName : moduleName;
        nodeBuilder
                .metadata()
                    .label(kind == NodeKind.NEW_CONNECTION ?
                        ConnectorUtil.getConnectorName(name, effectiveModule) : moduleName)
                    .description(functionData.description())
                    .icon(CommonUtils.generateIcon(org, packageName, functionData.version()))
                    .stepOut()
                .codedata()
                    .org(org)
                    .module(effectiveModule)
                    .object(name)
                    .symbol(NewConnectionBuilder.INIT_SYMBOL);

        if (kind == NodeKind.AGENT || kind == NodeKind.AGENT_TYPE) {
            nodeBuilder.codedata().packageName(packageName).version(functionData.version());
        }

        if (kind == NodeKind.MCP_TOOL_KIT && isAiMcpBaseToolKit(classSymbol)) {
            Map<String, Object> classDefinitionData = getClassDefinitionCodedata(classSymbol);
            if (classDefinitionData != null) {
                nodeBuilder.codedata().data(McpToolKitBuilder.MCP_CLASS_DEFINITION, classDefinitionData);
                McpToolKitBuilder.setToolKitNameProperty(nodeBuilder, name);
                String permittedTools = getPermittedToolsFromClass(classSymbol);
                McpToolKitBuilder.setPermittedToolsProperty(nodeBuilder, permittedTools);
                String toolScopes = getToolScopesFromClass(classSymbol);
                if (toolScopes != null) {
                    McpToolKitBuilder.setToolScopesProperty(nodeBuilder, toolScopes);
                }
            }
        }

        ClassSymbol clientClassSymbol = getClientClassSymbol(semanticModel, functionData, name)
                .orElse(classSymbol);
        if (isPersistClient(clientClassSymbol, semanticModel)) {
            updatePersistRelatedMetadata(functionData, packageName, clientClassSymbol);
        }

        nodeBuilder.codedata()
                    .stepOut()
                .properties()
                .scope(connectionScope)
                .checkError(true, NewConnectionBuilder.CHECK_ERROR_DOC, false);

        if (kind == NodeKind.AGENT) {
            applyAgentRoleInstructionFields(argumentNodes);
            if (newExpressionNode instanceof ImplicitNewExpressionNode implicitAgentExpr) {
                genAgentData(implicitAgentExpr, classSymbol, new HashMap<>(), false);
            }
        }

        if (kind == NodeKind.AGENT_TYPE) {
            AiUtils.applyAgentTypeMetadata(nodeBuilder, classSymbol, argumentNodes, project, this::getModelIconUrl,
                    this::getMemoryData);
        }
    }

    /**
     * Updates node metadata for persist-related database connections.
     * <p>
     * This method extracts the database type and name from the module name, which is expected to follow the pattern
     * {@code <packageName>.<database-type>.<database-name>}. The substring after the package name should be in the
     * format {@code <database-type>.<database-name>}, for example, {@code mysql.mydb}.
     * <p>
     * The method updates the node metadata with a label (e.g., "Mysql mydb"), sets the connector type to "persist", and
     * adds the path to the persist model file.
     *
     * @param functionData the function data containing the module name
     * @param packageName  the package name to strip from the module name
     * @param classSymbol  the class symbol representing the persist client
     */
    private void updatePersistRelatedMetadata(FunctionData functionData, String packageName, ClassSymbol classSymbol) {
        String moduleName = functionData.moduleName();
        Optional<String> persistLabel = getPersistClientLabel(packageName, moduleName);
        if (persistLabel.isPresent()) {
            nodeBuilder.metadata().label(persistLabel.get());
        } else {
            // Single-level persist module (e.g. "new_connection1.db") — use the package name for
            // the label and codedata.module so the UI shows the package, not the sub-module.
            String className = classSymbol.getName().orElse("");
            nodeBuilder.metadata().label(ConnectorUtil.getConnectorName(className, packageName));
            nodeBuilder.codedata().module(packageName);
        }
        nodeBuilder.metadata()
                .addData(CONNECTOR_TYPE, PERSIST);
        getPersistModelFilePath(project.sourceRoot(), classSymbol)
                .ifPresent(modelPath -> nodeBuilder.metadata().addData(PERSIST_MODEL_FILE, modelPath));
        CommonUtils.getPersistDatabaseIcon(classSymbol)
                .ifPresent(icon -> nodeBuilder.metadata().icon(icon));
    }

    private NodeKind resolveNodeKind(ClassSymbol classSymbol) {
        if (isAgentClass(classSymbol)) {
            return NodeKind.AGENT;
        }
        if (isAiFixedReturnAgent(classSymbol) || isAiInferredReturnAgent(classSymbol)) {
            return NodeKind.AGENT_TYPE;
        }
        if (isAiModelProvider(classSymbol)) {
            return NodeKind.MODEL_PROVIDER;
        }
        if (isAiEmbeddingProvider(classSymbol)) {
            return NodeKind.EMBEDDING_PROVIDER;
        }
        if (isAiKnowledgeBase(classSymbol)) {
            return NodeKind.KNOWLEDGE_BASE;
        }
        if (isAiVectorStore(classSymbol)) {
            return NodeKind.VECTOR_STORE;
        }
        if (isAiDataLoader(classSymbol)) {
            return NodeKind.DATA_LOADER;
        }
        if (isAiChunker(classSymbol)) {
            return NodeKind.CHUNKER;
        }
        if (isAIModel(classSymbol)) {
            return NodeKind.CLASS_INIT;
        }
        if (classSymbol.qualifiers().contains(Qualifier.CLIENT)) {
            return NodeKind.NEW_CONNECTION;
        }
        if (classSymbol.nameEquals(MCP_TOOL_KIT) || isAiMcpBaseToolKit(classSymbol)) {
            return NodeKind.MCP_TOOL_KIT;
        }
        if (isAiMemory(classSymbol)) {
            return NodeKind.MEMORY;
        }
        if (isAiMemoryStore(classSymbol)) {
            return NodeKind.SHORT_TERM_MEMORY_STORE;
        }
        return null;
    }

    private static final Set<NodeKind> AI_COMPONENT_KINDS = Set.of(
            NodeKind.MODEL_PROVIDER, NodeKind.EMBEDDING_PROVIDER,
            NodeKind.KNOWLEDGE_BASE, NodeKind.VECTOR_STORE,
            NodeKind.DATA_LOADER, NodeKind.CHUNKER,
            NodeKind.MEMORY, NodeKind.SHORT_TERM_MEMORY_STORE
    );

    private static boolean isAiComponentKind(NodeKind kind) {
        return AI_COMPONENT_KINDS.contains(kind);
    }

    private record ReturnTypeNodeInfo(NodeKind nodeKind, ClassSymbol classSymbol) { }

    private Optional<ReturnTypeNodeInfo> getReturnTypeNodeInfo(FunctionSymbol functionSymbol) {
        Optional<TypeSymbol> returnType = functionSymbol.typeDescriptor().returnTypeDescriptor();
        if (returnType.isEmpty()) {
            return Optional.empty();
        }
        TypeSymbol typeSymbol = returnType.get();
        if (typeSymbol.typeKind() == TypeDescKind.UNION) {
            typeSymbol = ((UnionTypeSymbol) typeSymbol).memberTypeDescriptors().stream()
                    .filter(tSymbol -> !tSymbol.subtypeOf(semanticModel.types().ERROR))
                    .findFirst().orElse(null);
            if (typeSymbol == null) {
                return Optional.empty();
            }
        }
        if (typeSymbol.typeKind() != TypeDescKind.TYPE_REFERENCE) {
            return Optional.empty();
        }
        Symbol defSymbol = ((TypeReferenceTypeSymbol) typeSymbol).definition();
        if (defSymbol.kind() != SymbolKind.CLASS) {
            return Optional.empty();
        }
        ClassSymbol classSymbol = (ClassSymbol) defSymbol;
        NodeKind kind = resolveNodeKind(classSymbol);
        if (kind == null) {
            return Optional.empty();
        }
        return Optional.of(new ReturnTypeNodeInfo(kind, classSymbol));
    }

    private FunctionData.Kind getFunctionResultKind(ClassSymbol classSymbol) {
        Map<Predicate<ClassSymbol>, FunctionData.Kind> kindMappings = Map.of(
                CommonUtils::isAiModelProvider, FunctionData.Kind.MODEL_PROVIDER,
                CommonUtils::isAiEmbeddingProvider, FunctionData.Kind.EMBEDDING_PROVIDER,
                CommonUtils::isAiKnowledgeBase, FunctionData.Kind.KNOWLEDGE_BASE,
                CommonUtils::isAiVectorStore, FunctionData.Kind.VECTOR_STORE,
                CommonUtils::isAiDataLoader, FunctionData.Kind.DATA_LOADER,
                CommonUtils::isAiChunker, FunctionData.Kind.CHUNKER,
                CommonUtils::isAiMemory, FunctionData.Kind.MEMORY,
                CommonUtils::isAiMemoryStore, FunctionData.Kind.SHORT_TERM_MEMORY_STORE
        );

        return kindMappings.entrySet().stream().filter(entry -> entry.getKey().test(classSymbol))
                .map(Map.Entry::getValue).findFirst().orElse(FunctionData.Kind.CONNECTOR);
    }

    private Optional<ClassSymbol> getClassSymbol(ExpressionNode newExpressionNode) {
        Optional<TypeSymbol> typeSymbol =
                CommonUtils.getTypeSymbol(semanticModel, newExpressionNode).flatMap(symbol -> {
                    if (symbol.typeKind() == TypeDescKind.UNION) {
                        return ((UnionTypeSymbol) symbol).memberTypeDescriptors().stream()
                                .filter(tSymbol -> !tSymbol.subtypeOf(semanticModel.types().ERROR))
                                .findFirst();
                    }
                    return Optional.of(symbol);
                });
        if (typeSymbol.isEmpty()) {
            return Optional.empty();
        }
        if (typeSymbol.get().typeKind() != TypeDescKind.TYPE_REFERENCE) {
            return Optional.empty();
        }
        Symbol defintionSymbol = ((TypeReferenceTypeSymbol) typeSymbol.get()).definition();
        if (defintionSymbol.kind() != SymbolKind.CLASS) {
            return Optional.empty();
        }
        return Optional.of((ClassSymbol) defintionSymbol);
    }

    @Override
    public void visit(TemplateExpressionNode templateExpressionNode) {
//        Treating these as variable nodes despite the force assign flag
//        if (forceAssign) {
//            return;
//        }
//        if (templateExpressionNode.kind() == SyntaxKind.XML_TEMPLATE_EXPRESSION) {
//            startNode(NodeKind.XML_PAYLOAD, templateExpressionNode)
//                    .metadata()
//                    .description(XmlPayloadBuilder.DESCRIPTION)
//                    .stepOut()
//                    .properties().expression(templateExpressionNode);
//        }
    }

    @Override
    public void visit(ByteArrayLiteralNode byteArrayLiteralNode) {
//        Treating these as variable nodes despite the force assign flag
//        if (forceAssign) {
//            return;
//        }
//        startNode(NodeKind.BINARY_DATA, byteArrayLiteralNode)
//                .metadata()
//                .stepOut()
//                .properties().expression(byteArrayLiteralNode);
    }

    @Override
    public void visit(VariableDeclarationNode variableDeclarationNode) {
        handleVariableNode(variableDeclarationNode);
    }

    private void handleVariableNode(NonTerminalNode variableDeclarationNode) {
        Optional<ExpressionNode> initializer;
        Optional<Token> finalKeyword;
        switch (variableDeclarationNode.kind()) {
            case LOCAL_VAR_DECL -> {
                VariableDeclarationNode localVariableDeclarationNode =
                        (VariableDeclarationNode) variableDeclarationNode;
                initializer = localVariableDeclarationNode.initializer();
                this.typedBindingPatternNode = localVariableDeclarationNode.typedBindingPattern();
                finalKeyword = localVariableDeclarationNode.finalKeyword();
            }
            case MODULE_VAR_DECL -> {
                ModuleVariableDeclarationNode moduleVariableDeclarationNode =
                        (ModuleVariableDeclarationNode) variableDeclarationNode;
                initializer = moduleVariableDeclarationNode.initializer();
                this.typedBindingPatternNode = moduleVariableDeclarationNode.typedBindingPattern();
                finalKeyword = Optional.empty();
            }
            default -> throw new IllegalStateException("Unexpected variable declaration kind: " +
                    variableDeclarationNode.kind());
        }
        boolean implicit = false;
        if (initializer.isEmpty()) {
            implicit = true;
            startNode(NodeKind.VARIABLE, variableDeclarationNode)
                    .metadata()
                    .description(VariableBuilder.DESCRIPTION)
                    .stepOut()
                    .properties().expressionOrAction(null, VariableBuilder.EXPRESSION_DOC, true);
        } else {
            ExpressionNode initializerNode = initializer.get();
            initializerNode.accept(this);

            // Generate the default expression node if a node is not built
            if (isNodeUnidentified()) {
                implicit = true;
                startNode(NodeKind.VARIABLE, variableDeclarationNode)
                        .metadata()
                        .description(VariableBuilder.DESCRIPTION)
                        .stepOut()
                        .properties().expressionOrAction(initializerNode, VariableBuilder.EXPRESSION_DOC, true);
            }
        }

        // TODO: Find a better way on how we can achieve this
        if (nodeBuilder instanceof DataMapperBuilder) {
            nodeBuilder.properties().data(this.typedBindingPatternNode, new HashSet<>());
        } else if (nodeBuilder instanceof XmlPayloadBuilder) {
            nodeBuilder.properties().payload(this.typedBindingPatternNode, "xml");
        } else if (nodeBuilder instanceof JsonPayloadBuilder) {
            nodeBuilder.properties().payload(this.typedBindingPatternNode, "json");
        } else if (nodeBuilder instanceof BinaryBuilder) {
            nodeBuilder.properties().payload(this.typedBindingPatternNode, "byte[]");
        } else if (nodeBuilder instanceof NewConnectionBuilder) {
            nodeBuilder.properties()
                    .dataVariable(this.typedBindingPatternNode, NewConnectionBuilder.CONNECTION_NAME_LABEL,
                            NewConnectionBuilder.CONNECTION_TYPE_LABEL, NewConnectionBuilder.CONNECTION_NAME_DOC,
                            false, new HashSet<>(), true);
        } else if (nodeBuilder instanceof RemoteActionCallBuilder || nodeBuilder instanceof ResourceActionCallBuilder) {
            nodeBuilder.properties()
                    .dataVariable(this.typedBindingPatternNode, Property.RESULT_NAME, Property.RESULT_TYPE_LABEL,
                            Property.RESULT_DOC, false, new HashSet<>(), true);
        } else if (nodeBuilder instanceof FunctionCall || nodeBuilder instanceof MethodCall) {
            nodeBuilder.properties()
                    .dataVariable(this.typedBindingPatternNode, Property.RESULT_NAME, Property.RESULT_TYPE_LABEL,
                            Property.RESULT_DOC, false, new HashSet<>(), false);
        } else if (nodeBuilder instanceof WaitBuilder) {
            nodeBuilder.properties()
                    .dataVariable(this.typedBindingPatternNode, Property.VARIABLE_NAME, Property.TYPE_DOC,
                            Property.VARIABLE_DOC, true, new HashSet<>(), true);
        } else if (nodeBuilder instanceof WaitDataBuilder) {
            // Variable/type info is embedded in the dataWaits property — skip generic handling
        } else if (nodeBuilder.properties().build().containsKey(Property.VARIABLE_KEY)
                && !(nodeBuilder instanceof AgentCallBuilder)) {
            // VARIABLE_KEY already set (e.g. by populateBuiltinActivityProperties) — skip.
            // AgentCallBuilder is excluded: its template pre-sets a placeholder value, but we
            // must overwrite it with the authoritative type/variable from the source.
        } else {
            nodeBuilder.properties().dataVariable(this.typedBindingPatternNode, implicit, new HashSet<>());
        }
        finalKeyword.ifPresent(token -> nodeBuilder.flag(FlowNode.NODE_FLAG_FINAL));
        endNode(variableDeclarationNode);
        this.typedBindingPatternNode = null;
    }

    @Override
    public void visit(ModuleVariableDeclarationNode moduleVariableDeclarationNode) {
        handleVariableNode(moduleVariableDeclarationNode);
    }

    @Override
    public void visit(AssignmentStatementNode assignmentStatementNode) {
        ExpressionNode expression = assignmentStatementNode.expression();
        expression.accept(this);

        if (isNodeUnidentified()) {
            buildDefaultAssignNode(assignmentStatementNode, expression);
        } else if (nodeBuilder instanceof AgentBuilder
                || nodeBuilder instanceof ModelProviderBuilder
                || nodeBuilder instanceof EmbeddingProviderBuilder
                || nodeBuilder instanceof KnowledgeBaseBuilder
                || nodeBuilder instanceof VectorStoreBuilder
                || nodeBuilder instanceof DataLoaderBuilder
                || nodeBuilder instanceof ChunkerBuilder
                || nodeBuilder instanceof MemoryBuilder
                || nodeBuilder instanceof ShortTermMemoryStoreBuilder
                || nodeBuilder instanceof ClassInitBuilder) {
            // If an AI type node (agent, model provider, etc.) was identified, set the variable property on it
            String variableName = CommonUtils.getVariableName(assignmentStatementNode.varRef());
            nodeBuilder.properties().custom()
                    .metadata()
                        .label(AssignBuilder.VARIABLE_LABEL)
                        .description(AssignBuilder.VARIABLE_DOC)
                        .stepOut()
                    .type(Property.ValueType.LV_EXPRESSION)
                    .value(variableName)
                    .editable()
                    .stepOut()
                    .addProperty(Property.VARIABLE_KEY);
            // An agent constructed as a class field (`self.agent = check new (...)` in init) must round-trip as an
            // assignment, not a `final ... = check new` declaration. SERVICE_INIT_SCOPE drives that in AgentBuilder.
            if (nodeBuilder instanceof AgentBuilder
                    && assignmentStatementNode.varRef() instanceof FieldAccessExpressionNode) {
                nodeBuilder.properties().scope(Property.SERVICE_INIT_SCOPE);
            }
        }
        endNode(assignmentStatementNode);
    }

    private void buildDefaultAssignNode(AssignmentStatementNode assignmentStatementNode, ExpressionNode expression) {
        startNode(NodeKind.ASSIGN, assignmentStatementNode)
                .metadata()
                .description(AssignBuilder.DESCRIPTION)
                .stepOut()
                .properties()
                .expressionOrAction(expression, AssignBuilder.EXPRESSION_DOC, false);

        nodeBuilder.properties().custom()
                .metadata()
                    .label(AssignBuilder.VARIABLE_LABEL)
                    .description(AssignBuilder.VARIABLE_DOC)
                    .stepOut()
                .type(Property.ValueType.LV_EXPRESSION)
                .value(CommonUtils.getVariableName(assignmentStatementNode.varRef()))
                .editable()
                .stepOut()
                .addProperty(Property.VARIABLE_KEY, assignmentStatementNode.varRef());
    }

    @Override
    public void visit(CompoundAssignmentStatementNode compoundAssignmentStatementNode) {
        handleDefaultStatementNode(compoundAssignmentStatementNode);
    }

    @Override
    public void visit(BlockStatementNode blockStatementNode) {
        handleDefaultStatementNode(blockStatementNode);
    }

    @Override
    public void visit(QueryActionNode queryActionNode) {
        handleExpressionNode(queryActionNode);
    }

    @Override
    public void visit(BreakStatementNode breakStatementNode) {
        startNode(NodeKind.BREAK, breakStatementNode);
        endNode(breakStatementNode);
    }

    @Override
    public void visit(FailStatementNode failStatementNode) {
        startNode(NodeKind.FAIL, failStatementNode)
                .properties().expression(failStatementNode.expression(), FailBuilder.FAIL_EXPRESSION_DOC, false,
                        TypesGenerator.TYPE_ERROR);
        endNode(failStatementNode);
    }

    @Override
    public void visit(ExpressionStatementNode expressionStatementNode) {
        expressionStatementNode.expression().accept(this);
        if (isNodeUnidentified()) {
            handleExpressionNode(expressionStatementNode);
        }
        endNode(expressionStatementNode);
    }

    @Override
    public void visit(ContinueStatementNode continueStatementNode) {
        startNode(NodeKind.CONTINUE, continueStatementNode);
        endNode(continueStatementNode);
    }

    @Override
    public void visit(MethodCallExpressionNode methodCallExpressionNode) {
        if (forceAssign) {
            return;
        }
        Optional<Symbol> symbol = semanticModel.symbol(methodCallExpressionNode);
        if (symbol.isEmpty() || !(symbol.get() instanceof FunctionSymbol functionSymbol)) {
            handleExpressionNode(methodCallExpressionNode);
            return;
        }

        // Consider lang lib methods as a variable node with an expression
        if (CommonUtils.isValueLangLibFunction(functionSymbol)) {
            return;
        }

        Optional<ClassSymbol> optClassSymbol = getClassSymbol(methodCallExpressionNode.expression());
        if (optClassSymbol.isEmpty()) {
            handleExpressionNode(methodCallExpressionNode);
            return;
        }

        ExpressionNode expressionNode = methodCallExpressionNode.expression();
        NameReferenceNode nameReferenceNode = methodCallExpressionNode.methodName();
        String functionName = getIdentifierName(nameReferenceNode);
        ClassSymbol classSymbol = optClassSymbol.get();

        // ctx.sleep(...) — workflow Context regular method, not a remote call
        if (SLEEP_METHOD_NAME.equals(functionName)
                && CONTEXT_CLASS_NAME.equals(classSymbol.getName().orElse(""))
                && isWorkflowModule(classSymbol.getModule())) {
            startNode(NodeKind.SLEEP, expressionNode.parent());
            populateSleepNodeProperties(methodCallExpressionNode, functionSymbol);
            return;
        }

        if (isAgentClass(classSymbol)) {
            startNode(NodeKind.AGENT_CALL, expressionNode.parent());
            populateAgentMetaData(expressionNode, classSymbol);
        } else if (isAiFixedReturnAgent(classSymbol) || isAiInferredReturnAgent(classSymbol)) {
            startNode(NodeKind.AGENT_RUN, expressionNode.parent());
            populateAgentRunMetaData(expressionNode, classSymbol);
        } else if (isAiKnowledgeBase(classSymbol)) {
            startNode(NodeKind.KNOWLEDGE_BASE_CALL, expressionNode.parent());
        } else {
            startNode(NodeKind.METHOD_CALL, methodCallExpressionNode.parent());
        }

        CommonUtils.getViewLineRange(functionSymbol, moduleInfo, project)
                .ifPresent(lineRange -> nodeBuilder.properties().view(lineRange));

        FunctionDataBuilder functionDataBuilder =
                new FunctionDataBuilder()
                        .name(functionName)
                        .functionSymbol(functionSymbol)
                        .semanticModel(semanticModel)
                        .userModuleInfo(moduleInfo)
                        .project(project)
                        .workspaceManager(workspaceManager)
                        .filePath(filePath);
        FunctionData functionData = functionDataBuilder.build();

        nodeBuilder
                .symbolInfo(functionSymbol)
                    .metadata()
                    .label(functionName)
                    .description(functionData.description())
                    .stepOut()
                .codedata()
                    .symbol(functionName)
                    .object(classSymbol.getName().orElse(""));
        if (classSymbol.qualifiers().contains(Qualifier.CLIENT)) {
            Map<String, Object> metadataData = getConnectorMetadata(classSymbol);
            nodeBuilder.properties().callConnection(expressionNode, Property.CONNECTION_KEY, metadataData);
        } else {
            nodeBuilder.properties().callExpression(expressionNode, Property.CONNECTION_KEY);
        }
        processFunctionSymbol(methodCallExpressionNode, methodCallExpressionNode.arguments(), functionSymbol,
                functionData);
    }

    @Override
    public void visit(FunctionCallExpressionNode functionCallExpressionNode) {
        if (forceAssign) {
            return;
        }
        Optional<Symbol> symbol = semanticModel.symbol(functionCallExpressionNode);
        if (symbol.isEmpty() || symbol.get().kind() != SymbolKind.FUNCTION) {
            handleExpressionNode(functionCallExpressionNode);
            return;
        }

        FunctionSymbol functionSymbol = (FunctionSymbol) symbol.get();

        NameReferenceNode nameReferenceNode = functionCallExpressionNode.functionName();
        String functionName = getIdentifierName(nameReferenceNode);

        // TODO: Here we address the majority of cases by assuming that data mappings reside in `functions.bal`.
        //  Ideally, there should be a path to determine whether a symbol is an expression-bodied function using the
        //  semantic model.
        if (dataMappings.containsKey(functionName) ||
                functionSymbol.getLocation()
                        .map(loc -> DATA_MAPPINGS_BAL.equals(loc.lineRange().fileName()))
                        .orElse(false)) {
            startNode(NodeKind.DATA_MAPPER_CALL, functionCallExpressionNode.parent());
        } else if (isAgentClass(symbol.get())) {
            startNode(NodeKind.AGENT_CALL, functionCallExpressionNode.parent());
        } else if (isAiFixedReturnAgent(symbol.get()) || isAiInferredReturnAgent(symbol.get())) {
            startNode(NodeKind.AGENT_RUN, functionCallExpressionNode.parent());
        } else if (naturalFunctions.containsKey(functionName)) {
            startNode(NodeKind.NP_FUNCTION_CALL, functionCallExpressionNode.parent());
        } else if (isWorkflowOperation(functionSymbol, RUN_METHOD_NAME)) {
            startNode(NodeKind.WORKFLOW_RUN, functionCallExpressionNode.parent());
        } else if (isWorkflowOperation(functionSymbol, SEND_DATA_METHOD_NAME)) {
            startNode(NodeKind.SEND_DATA, functionCallExpressionNode.parent());
        } else {
            // Check if the function returns an AI type (e.g., MODEL_PROVIDER via factory function)
            Optional<ReturnTypeNodeInfo> returnTypeInfo = getReturnTypeNodeInfo(functionSymbol);
            if (returnTypeInfo.isPresent() && isAiComponentKind(returnTypeInfo.get().nodeKind())) {
                ReturnTypeNodeInfo info = returnTypeInfo.get();
                startNode(info.nodeKind(), functionCallExpressionNode.parent());

                FunctionDataBuilder functionDataBuilder =
                        new FunctionDataBuilder()
                                .name(functionName)
                                .functionSymbol(functionSymbol)
                                .functionResultKind(getFunctionResultKind(info.classSymbol()))
                                .semanticModel(semanticModel)
                                .userModuleInfo(moduleInfo)
                                .project(project)
                                .workspaceManager(workspaceManager)
                                .filePath(filePath);
                FunctionData functionData = functionDataBuilder.build();

                processFunctionSymbol(functionCallExpressionNode, functionCallExpressionNode.arguments(),
                        functionSymbol, functionData);

                nodeBuilder
                        .metadata()
                            .label(functionData.packageName())
                            .description(functionData.description())
                            .icon(CommonUtils.generateIcon(functionData.org(), functionData.packageName(),
                                functionData.version()))
                            .stepOut()
                        .codedata()
                            .org(functionData.org())
                            .module(functionData.moduleName())
                            .symbol(functionName)
                            .stepOut()
                        .properties()
                            .scope(connectionScope)
                            .checkError(true, NewConnectionBuilder.CHECK_ERROR_DOC, false);
                return;
            }
            startNode(NodeKind.FUNCTION_CALL, functionCallExpressionNode.parent());
        }

        CommonUtils.getViewLineRange(functionSymbol, moduleInfo, project)
                .ifPresent(lineRange -> nodeBuilder.properties().view(lineRange));

        FunctionDataBuilder functionDataBuilder =
                new FunctionDataBuilder()
                        .name(functionName)
                        .functionSymbol(functionSymbol)
                        .semanticModel(semanticModel)
                        .userModuleInfo(moduleInfo)
                        .project(project)
                        .workspaceManager(workspaceManager)
                        .filePath(filePath);
        FunctionData functionData = functionDataBuilder.build();

        processFunctionSymbol(functionCallExpressionNode, functionCallExpressionNode.arguments(), functionSymbol,
                functionData);

        nodeBuilder
                .symbolInfo(functionSymbol)
                .metadata()
                .label(functionName)
                .description(functionData.description())
                .stepOut()
                .codedata().symbol(functionName);

        handleWorkflowFunctionSymbol(functionCallExpressionNode, functionSymbol);
    }

    private void handleWorkflowFunctionSymbol(FunctionCallExpressionNode functionCallExpressionNode,
                                              FunctionSymbol functionSymbol) {
        if (isWorkflowOperation(functionSymbol, RUN_METHOD_NAME)) {
            overrideSymbolFromFirstArg(functionCallExpressionNode.arguments());
            populateWorkflowRunProperties(functionCallExpressionNode);
        }
    }

    /**
     * Fixes properties after {@code processFunctionSymbol} runs on a {@code workflow:run(...)} call.
     * The generic path types the {@code input} property from the library signature of
     * {@code workflow:run} ({@code anydata input}), which loses the specific input type of the
     * target workflow function. This re-derives the {@code input} property type from the workflow
     * function's declared input parameter (the first parameter that is a subtype of {@code anydata};
     * {@code workflow:Context} and the events record are not anydata), matching the template path in
     * {@link WorkflowRunBuilder}. The raw {@code processFunction} property is dropped because the
     * function reference is carried in {@code codedata.symbol}.
     *
     * @param callNode the {@code workflow:run(...)} call node
     */
    private void populateWorkflowRunProperties(FunctionCallExpressionNode callNode) {
        SeparatedNodeList<FunctionArgumentNode> args = callNode.arguments();
        Map<String, Property> currentProps = nodeBuilder.properties().build();
        currentProps.remove(RUN_PROCESS_FUNCTION_PARAM);

        if (args.isEmpty() || !(args.get(0) instanceof PositionalArgumentNode firstArg)) {
            return;
        }
        Optional<Symbol> resolvedSymbol = semanticModel.symbol(firstArg.expression());
        if (resolvedSymbol.isEmpty() || !(resolvedSymbol.get() instanceof FunctionSymbol workflowFuncSymbol)) {
            return;
        }

        // The workflow's input parameter is the first parameter that is a subtype of anydata.
        TypeSymbol inputType = WorkflowRunBuilder.findWorkflowInputType(workflowFuncSymbol, semanticModel);
        if (inputType == null) {
            // The workflow function declares no input; drop the library-derived input property.
            currentProps.remove(WorkflowRunBuilder.INPUT_KEY);
            return;
        }

        // Resolve the current input value from the call source (second positional or named arg).
        Node valueNode = null;
        if (args.size() > 1 && args.get(1) instanceof PositionalArgumentNode secondArg) {
            valueNode = secondArg.expression();
        }
        for (FunctionArgumentNode arg : args) {
            if (arg instanceof NamedArgumentNode namedArg
                    && WorkflowRunBuilder.INPUT_KEY.equals(namedArg.argumentName().name().text())) {
                valueNode = namedArg.expression();
            }
        }
        // The input property built by processFunctionSymbol already consumed the diagnostic-handler
        // cursor for this value node, so its diagnostics are correct — only its type is wrong
        // (library map<anydata>? vs the workflow's declared type). Capture those diagnostics and
        // re-apply them, and rebuild the type WITHOUT the handler so the single-pass cursor is not
        // advanced a second time for the same node (which would drop or misattribute diagnostics).
        Property existingInputProp = currentProps.get(WorkflowRunBuilder.INPUT_KEY);
        String value = valueNode != null ? valueNode.toSourceCode().strip()
                : (existingInputProp != null && existingInputProp.value() != null
                        ? existingInputProp.value().toString() : "");
        Diagnostics existingDiagnostics = existingInputProp != null ? existingInputProp.diagnostics() : null;

        // Re-adding at the same key preserves the property's position in the form.
        Property.Builder<FormBuilder<NodeBuilder>> customPropBuilder = nodeBuilder.properties().custom();
        FormBuilder<NodeBuilder> formBuilder = customPropBuilder
                .metadata()
                    .label(WorkflowRunBuilder.INPUT_LABEL)
                    .description(WorkflowRunBuilder.INPUT_DOC)
                    .stepOut()
                .value(value)
                .placeholder("")
                .editable()
                .stepOut();
        customPropBuilder.typeWithExpression(inputType, moduleInfo, valueNode, semanticModel, customPropBuilder);
        if (existingDiagnostics != null && existingDiagnostics.hasDiagnostics()) {
            customPropBuilder.diagnostics().hasDiagnostics();
            if (existingDiagnostics.diagnostics() != null) {
                customPropBuilder.diagnostics().diagnostics(existingDiagnostics.diagnostics());
            }
        }
        formBuilder.addProperty(WorkflowRunBuilder.INPUT_KEY, valueNode);
    }

    private void processFunctionSymbol(NonTerminalNode callNode, SeparatedNodeList<FunctionArgumentNode> arguments,
                                       FunctionSymbol functionSymbol, FunctionData functionData) {
        final Map<String, Node> namedArgValueMap = new HashMap<>();
        final Queue<Node> positionalArgs = new LinkedList<>();
        calculateFunctionArgs(namedArgValueMap, positionalArgs, arguments);

        Map<String, ParameterData> funcParamMap = new LinkedHashMap<>();
        Map<String, ParameterData> typeInferParamMap = new LinkedHashMap<>();
        FunctionTypeSymbol functionTypeSymbol = functionSymbol.typeDescriptor();

        functionData.parameters().forEach((key, paramResult) -> {
            if (paramResult.kind() == ParameterData.Kind.PATH_PARAM) {
                // Skip if `path` param
                return;
            }

            if (paramResult.kind() == ParameterData.Kind.PARAM_FOR_TYPE_INFER) {
                typeInferParamMap.put(key, paramResult);
                // Reserve the slot at its signature position so the later emission (which happens
                // after regular args and checkError) lands here instead of being appended.
                nodeBuilder.properties()
                        .reserveProperty(ParamUtils.removeLeadingSingleQuote(paramResult.name()));
                return;
            }

            funcParamMap.put(key, paramResult);
        });

        buildPropsFromFuncCallArgs(arguments, functionTypeSymbol, funcParamMap, positionalArgs, namedArgValueMap);
        handleCheckFlag(callNode, functionTypeSymbol);

        // Process PARAM_FOR_TYPE_INFER parameters at the end
        typeInferParamMap.forEach((key, paramResult) -> {
            String returnType = functionData.returnType();

            // Derive the value of the inferred type name
            String inferredTypeName;
            TypeSymbol targetVarType = null;
            // Check if the value exists in the named arg map
            Node node = namedArgValueMap.get(key);
            if (node != null) {
                inferredTypeName = node.toSourceCode();
            } else if (typedBindingPatternNode == null) {
                // Get the default value if the variable is absent
                inferredTypeName = paramResult.placeholder();
            } else {
                // Derive the inferred type from the variable type
                Optional<Symbol> symbol = semanticModel.symbol(typedBindingPatternNode);
                if (symbol.isEmpty() || symbol.get().kind() != SymbolKind.VARIABLE) {
                    // Drop the reserved slot so the placeholder doesn't leak into the output.
                    nodeBuilder.properties()
                            .removeProperty(ParamUtils.removeLeadingSingleQuote(paramResult.name()));
                    return;
                }
                targetVarType = ((VariableSymbol) symbol.get()).typeDescriptor();
                String variableType =
                        CommonUtils.getTypeSignature(((VariableSymbol) symbol.get()).typeDescriptor(), moduleInfo);

                inferredTypeName = deriveInferredType(variableType, returnType, key);
            }

            // Generate the property of the inferred type param
            nodeBuilder.codedata().inferredReturnType(functionData.returnError() ? returnType : null);
            Module module = workspaceManager.module(filePath)
                    .orElse(project.currentPackage().getDefaultModule());
            CallBuilder.buildInferredTypeProperty(nodeBuilder, paramResult, inferredTypeName, module, targetVarType,
                    callNode);
            AgentCallBuilder.postProcessTdProperty(nodeBuilder, key);
        });
    }

    private static String deriveInferredType(String variableType, String returnType, String key) {
        int keyIndex = returnType.indexOf(key);
        if (keyIndex == -1) {
            // If key is not found, fallback to returning variableType.
            return variableType;
        }
        String prefix = returnType.substring(0, keyIndex);
        String suffix = returnType.substring(keyIndex + key.length());

        // Check if variableType has the same structure as returnType.
        if (variableType.startsWith(prefix) && variableType.endsWith(suffix)) {
            return variableType.substring(prefix.length(), variableType.length() - suffix.length());
        }
        // If the structure doesn't match, return variableType as fallback.
        return variableType;
    }

    private boolean isAIModel(ClassSymbol classSymbol) {
        Optional<ModuleSymbol> optModule = classSymbol.getModule();
        if (optModule.isEmpty()) {
            return false;
        }
        ModuleID id = optModule.get().id();
        if (!isAiModelModule(id.orgName(), id.packageName())) {
            return false;
        }

        for (TypeSymbol typeSymbol : classSymbol.typeInclusions()) {
            Optional<String> optName = typeSymbol.getName();
            if (optName.isPresent()) {
                String name = optName.get();
                if (name.equals("ModelProvider") || name.equals("MemoryManager")) {
                    return true;
                }
            }
        }
        return false;
    }

    private ModelData getModelIconUrl(ExpressionNode expressionNode) {
        if (expressionNode.kind() == SyntaxKind.SIMPLE_NAME_REFERENCE) {
            Optional<Symbol> optSymbol = semanticModel.symbol(expressionNode);
            if (optSymbol.isEmpty()) {
                return null;
            }
            Symbol symbol = optSymbol.get();
            TypeSymbol typeDescriptor;
            if (symbol.kind() == SymbolKind.VARIABLE) {
                typeDescriptor = ((VariableSymbol) symbol).typeDescriptor();
            } else if (symbol.kind() == SymbolKind.CLASS_FIELD) {
                typeDescriptor = ((ClassFieldSymbol) symbol).typeDescriptor();
            } else {
                return null;
            }
            Optional<String> symbolName = typeDescriptor.getName();
            Optional<ModuleSymbol> optModule = typeDescriptor.getModule();
            if (optModule.isEmpty()) {
                return null;
            }
            ModuleID id = optModule.get().id();
            String iconType = symbolName.orElse("");
            if (iconType.isEmpty() || iconType.equals(MODEL_PROVIDER_INTERFACE_NAME)) {
                iconType = id.packageName();
            }
            return new ModelData(optSymbol.get().getName().orElse(""),
                    CommonUtils.generateIcon(id.orgName(), id.packageName(), id.version()),
                    iconType);
        } else if (expressionNode.kind() == SyntaxKind.FIELD_ACCESS) {
            FieldAccessExpressionNode fieldAccessExpressionNode = (FieldAccessExpressionNode) expressionNode;
            return getModelIconUrl(fieldAccessExpressionNode.fieldName());
        }
        return new ModelData(expressionNode.toSourceCode().strip(), null, null);
    }

    private MemoryManagerData getMemoryData(ExpressionNode memory) {
        if (memory == null) {
            return null;
        }
        if (memory.kind() == SyntaxKind.EXPLICIT_NEW_EXPRESSION) {
            ExplicitNewExpressionNode newExpr = (ExplicitNewExpressionNode) memory;
            SeparatedNodeList<FunctionArgumentNode> arguments = newExpr.parenthesizedArgList().arguments();
            String size = arguments.size() == 1 ? arguments.get(0).toSourceCode() : "";
            return new MemoryManagerData(newExpr.typeDescriptor().toSourceCode(), size);
        }
        if (memory.kind() == SyntaxKind.SIMPLE_NAME_REFERENCE) {
            return semanticModel.typeOf(memory)
                    .map(typeSymbol -> new MemoryManagerData(typeSymbol.getName().orElse("Memory Not Configured"),
                            AiUtils.MEMORY_DEFAULT_VALUE))
                    .orElse(null);
        }
        return null;
    }

    private static String getIdentifierName(NameReferenceNode nameReferenceNode) {
        return switch (nameReferenceNode.kind()) {
            case QUALIFIED_NAME_REFERENCE -> ((QualifiedNameReferenceNode) nameReferenceNode).identifier().text();
            case SIMPLE_NAME_REFERENCE -> ((SimpleNameReferenceNode) nameReferenceNode).name().text();
            default -> "";
        };
    }

    @Override
    public void visit(WhileStatementNode whileStatementNode) {
        startNode(NodeKind.WHILE, whileStatementNode)
                .properties().condition(whileStatementNode.condition());

        BlockStatementNode whileBody = whileStatementNode.whileBody();
        Branch.Builder branchBuilder =
                startBranch(Branch.BODY_LABEL, NodeKind.CONDITIONAL, Branch.BranchKind.BLOCK,
                        Branch.Repeatable.ONE);
        analyzeBlock(whileBody, branchBuilder);
        endBranch(branchBuilder, whileBody);
        whileStatementNode.onFailClause().ifPresent(this::processOnFailClause);
        endNode(whileStatementNode);
    }

    private void processOnFailClause(OnFailClauseNode onFailClauseNode) {
        Branch.Builder branchBuilder =
                startBranch(Branch.ON_FAILURE_LABEL, NodeKind.ON_FAILURE, Branch.BranchKind.BLOCK,
                        Branch.Repeatable.ZERO_OR_ONE);
        if (onFailClauseNode.typedBindingPattern().isPresent()) {
            branchBuilder.properties().ignore(false).onErrorVariable(onFailClauseNode.typedBindingPattern().get());
        }
        BlockStatementNode onFailClauseBlock = onFailClauseNode.blockStatement();
        analyzeBlock(onFailClauseBlock, branchBuilder);
        endBranch(branchBuilder, onFailClauseBlock);
    }

    @Override
    public void visit(PanicStatementNode panicStatementNode) {
        startNode(NodeKind.PANIC, panicStatementNode)
                .properties().expression(panicStatementNode.expression(), PanicBuilder.PANIC_EXPRESSION_DOC, false,
                        TypesGenerator.TYPE_ERROR);
        endNode(panicStatementNode);
    }

    @Override
    public void visit(LocalTypeDefinitionStatementNode localTypeDefinitionStatementNode) {
        handleDefaultStatementNode(localTypeDefinitionStatementNode
        );
    }

    @Override
    public void visit(StartActionNode startActionNode) {
        startNode(NodeKind.START, startActionNode).properties()
                .expressionOrAction(startActionNode.expression(), StartBuilder.START_EXPRESSION_DOC, false);
    }

    @Override
    public void visit(LockStatementNode lockStatementNode) {
        startNode(NodeKind.LOCK, lockStatementNode);
        Branch.Builder branchBuilder =
                startBranch(Branch.BODY_LABEL, NodeKind.BODY, Branch.BranchKind.BLOCK, Branch.Repeatable.ONE);
        BlockStatementNode lockBody = lockStatementNode.blockStatement();
        analyzeBlock(lockBody, branchBuilder);
        endBranch(branchBuilder, lockBody);
        lockStatementNode.onFailClause().ifPresent(this::processOnFailClause);
        endNode(lockStatementNode);
    }

    @Override
    public void visit(ForkStatementNode forkStatementNode) {
        startNode(NodeKind.FORK, forkStatementNode);
        forkStatementNode.namedWorkerDeclarations().forEach(this::visit);
        endNode(forkStatementNode);
    }

    @Override
    public void visit(NamedWorkerDeclarator namedWorkerDeclarator) {
        // Analyze the worker init statements
        namedWorkerDeclarator.workerInitStatements().forEach(statement -> statement.accept(this));

        // Generate a parallel flow node for the named workers
        startNode(NodeKind.PARALLEL_FLOW);
        NodeList<NamedWorkerDeclarationNode> workers = namedWorkerDeclarator.namedWorkerDeclarations();
        LineRange startLineRange = workers.get(0).lineRange();
        LinePosition endLine = workers.get(workers.size() - 1).lineRange().endLine();
        workers.forEach(this::visit);
        nodeBuilder.codedata()
                .lineRange(LineRange.from(startLineRange.fileName(), startLineRange.startLine(), endLine));
        endNode();
    }

    @Override
    public void visit(NamedWorkerDeclarationNode namedWorkerDeclarationNode) {
        Branch.Builder workerBranchBuilder =
                startBranch(namedWorkerDeclarationNode.workerName().text(), NodeKind.WORKER, Branch.BranchKind.WORKER,
                        Branch.Repeatable.ONE_OR_MORE);

        // Set the properties of the worker branch
        Optional<Node> returnTypeDesc = namedWorkerDeclarationNode.returnTypeDesc();
        String type;
        if (returnTypeDesc.isPresent() && returnTypeDesc.get().kind() == SyntaxKind.RETURN_TYPE_DESCRIPTOR) {
            ReturnTypeDescriptorNode returnTypeDescriptorNode = (ReturnTypeDescriptorNode) returnTypeDesc.get();
            type = returnTypeDescriptorNode.type().toSourceCode().strip();
        } else {
            type = "";
        }
        workerBranchBuilder.properties()
                .data(namedWorkerDeclarationNode.workerName(), Property.WORKER_NAME, Property.WORKER_DOC,
                        "worker", false)
                .returnType(type);

        // Analyze the body of the worker
        analyzeBlock(namedWorkerDeclarationNode.workerBody(), workerBranchBuilder);
        endBranch(workerBranchBuilder, namedWorkerDeclarationNode);
    }

    @Override
    public void visit(WaitActionNode waitActionNode) {
        // Capture the future nodes associated with the wait node
        boolean waitAll = false;
        Node waitFutureExpr = waitActionNode.waitFutureExpr();
        List<Node> nodes = new ArrayList<>();
        switch (waitFutureExpr.kind()) {
            case BINARY_EXPRESSION -> {
                BinaryExpressionNode binaryExpressionNode = (BinaryExpressionNode) waitFutureExpr;
                Stack<Node> futuresStack = new Stack<>();

                // Capture the right most future
                futuresStack.push(binaryExpressionNode.rhsExpr());

                // Build the stack for the left futures, starting from the right
                Node lhsNode = binaryExpressionNode.lhsExpr();
                while (lhsNode.kind() == SyntaxKind.BINARY_EXPRESSION) {
                    BinaryExpressionNode nestedBinary = (BinaryExpressionNode) lhsNode;
                    futuresStack.push(nestedBinary.rhsExpr());
                    lhsNode = nestedBinary.lhsExpr();
                }
                futuresStack.push(lhsNode);

                // Add the futures to the node list in reverse order from the stack
                while (!futuresStack.isEmpty()) {
                    nodes.add(futuresStack.pop());
                }
            }
            case WAIT_FIELDS_LIST -> {
                WaitFieldsListNode waitFieldsListNode = (WaitFieldsListNode) waitFutureExpr;
                for (Node field : waitFieldsListNode.waitFields()) {
                    nodes.add(field);
                }
                waitAll = true;
            }
            default -> nodes.add(waitFutureExpr);
        }

        if (!waitAll) {
            // custom node
            // Check if this is a workflow wait for data (wait events.dataName)
            if (isWorkflowWaitData(waitActionNode)) {
                startNode(NodeKind.WAIT_DATA, waitActionNode.parent());
                populateSimpleWaitDataProperties(waitActionNode);
            } else {
                startNode(NodeKind.EXPRESSION, waitActionNode)
                        .properties().statement(waitActionNode);
            }
            return;
        }

        startNode(NodeKind.WAIT, waitActionNode);
        nodeBuilder.properties().custom().handleWaitNode(nodes).stepOut().addProperty(WaitBuilder.FUTURES_KEY);
    }

    @Override
    public void visit(TransactionStatementNode transactionStatementNode) {
        startNode(NodeKind.TRANSACTION, transactionStatementNode);
        Branch.Builder branchBuilder =
                startBranch(Branch.BODY_LABEL, NodeKind.BODY, Branch.BranchKind.BLOCK, Branch.Repeatable.ONE);
        BlockStatementNode blockStatementNode = transactionStatementNode.blockStatement();
        analyzeBlock(blockStatementNode, branchBuilder);
        endBranch(branchBuilder, blockStatementNode);
        transactionStatementNode.onFailClause().ifPresent(this::processOnFailClause);
        endNode(transactionStatementNode);
    }

    @Override
    public void visit(ForEachStatementNode forEachStatementNode) {
        startNode(NodeKind.FOREACH, forEachStatementNode)
                .properties()
                .dataVariable(forEachStatementNode.typedBindingPattern(), new HashSet<>())
                .collection(forEachStatementNode.actionOrExpressionNode());
        Branch.Builder branchBuilder =
                startBranch(Branch.BODY_LABEL, NodeKind.BODY, Branch.BranchKind.BLOCK, Branch.Repeatable.ONE);
        BlockStatementNode blockStatementNode = forEachStatementNode.blockStatement();
        analyzeBlock(blockStatementNode, branchBuilder);
        endBranch(branchBuilder, blockStatementNode);
        forEachStatementNode.onFailClause().ifPresent(this::processOnFailClause);
        endNode(forEachStatementNode);
    }

    @Override
    public void visit(RollbackStatementNode rollbackStatementNode) {
        startNode(NodeKind.ROLLBACK, rollbackStatementNode);
        Optional<ExpressionNode> optExpr = rollbackStatementNode.expression();
        if (optExpr.isPresent()) {
            ExpressionNode expr = optExpr.get();
            expr.accept(this);
            nodeBuilder.properties().expression(expr, RollbackBuilder.ROLLBACK_EXPRESSION_DOC);
        }
        endNode(rollbackStatementNode);
    }

    @Override
    public void visit(RetryStatementNode retryStatementNode) {
        int retryCount;
        if (retryStatementNode.arguments().isEmpty()) {
            retryCount = 3;
        } else {
            Optional<Node> argumentOptional = retryStatementNode.arguments()
                    .map(arg -> arg.arguments().get(0));
            retryCount = argumentOptional.map(node -> Integer.parseInt(node.toString())).orElse(3);
        }

        StatementNode statementNode = retryStatementNode.retryBody();
        if (statementNode.kind() == SyntaxKind.BLOCK_STATEMENT) {
            startNode(NodeKind.RETRY, retryStatementNode)
                    .properties().retryCount(retryCount);

            Branch.Builder branchBuilder =
                    startBranch(Branch.BODY_LABEL, NodeKind.BODY, Branch.BranchKind.BLOCK, Branch.Repeatable.ONE);
            analyzeBlock((BlockStatementNode) statementNode, branchBuilder);
            endBranch(branchBuilder, statementNode);
            retryStatementNode.onFailClause().ifPresent(this::processOnFailClause);
            endNode(retryStatementNode);
        } else { // retry transaction node
            TransactionStatementNode transactionStatementNode = (TransactionStatementNode) statementNode;
            BlockStatementNode blockStatementNode = transactionStatementNode.blockStatement();
            startNode(NodeKind.TRANSACTION, retryStatementNode)
                    .properties().retryCount(retryCount);
            Branch.Builder branchBuilder =
                    startBranch(Branch.BODY_LABEL, NodeKind.BODY, Branch.BranchKind.BLOCK, Branch.Repeatable.ONE);
            analyzeBlock(blockStatementNode, branchBuilder);
            endBranch(branchBuilder, blockStatementNode);
            transactionStatementNode.onFailClause().ifPresent(this::processOnFailClause);
            endNode(retryStatementNode);
        }
    }

    @Override
    public void visit(CommitActionNode commitActionNode) {
        startNode(NodeKind.COMMIT, commitActionNode);
        endNode();
    }

    @Override
    public void visit(MatchStatementNode matchStatementNode) {
        startNode(NodeKind.MATCH, matchStatementNode)
                .properties().matchTarget(matchStatementNode.condition());

        NodeList<MatchClauseNode> matchClauseNodes = matchStatementNode.matchClauses();
        for (MatchClauseNode matchClauseNode : matchClauseNodes) {
            Optional<MatchGuardNode> matchGuardNode = matchClauseNode.matchGuard();
            CommentProperty commentProperty = new CommentProperty();
            String pattern = matchClauseNode.matchPatterns().stream()
                    .map(p -> removeLeadingAndTrailingMinutiae(p, commentProperty))
                    .collect(Collectors.joining("|"));
            String label = pattern;
            if (matchGuardNode.isPresent()) {
                label += " " + matchGuardNode.get().toSourceCode().strip();
            }

            Branch.Builder branchBuilder = startBranch(label, NodeKind.CONDITIONAL, Branch.BranchKind.BLOCK,
                    Branch.Repeatable.ONE_OR_MORE)
                    .properties().patterns(matchClauseNode, pattern, commentProperty).stepOut();

            matchGuardNode.ifPresent(guard -> branchBuilder.properties()
                    .expression(guard.expression(), Property.GUARD_KEY, Property.GUARD_DOC));
            analyzeBlock(matchClauseNode.blockStatement(), branchBuilder);
            endBranch(branchBuilder, matchClauseNode.blockStatement());
        }

        matchStatementNode.onFailClause().ifPresent(this::processOnFailClause);
        endNode(matchStatementNode);
    }

    @Override
    public void visit(DoStatementNode doStatementNode) {
        Optional<OnFailClauseNode> optOnFailClauseNode = doStatementNode.onFailClause();
        BlockStatementNode blockStatementNode = doStatementNode.blockStatement();
        if (optOnFailClauseNode.isEmpty()) {
            handleDefaultStatementNode(doStatementNode);
            return;
        }

        startNode(NodeKind.ERROR_HANDLER, doStatementNode);
        Branch.Builder branchBuilder =
                startBranch(Branch.BODY_LABEL, NodeKind.BODY, Branch.BranchKind.BLOCK, Branch.Repeatable.ONE);
        analyzeBlock(blockStatementNode, branchBuilder);
        endBranch(branchBuilder, blockStatementNode);
        processOnFailClause(optOnFailClauseNode.get());
        endNode(doStatementNode);
    }

    @Override
    public void visit(CheckExpressionNode checkExpressionNode) {
        checkExpressionNode.expression().accept(this);
        if (isNodeUnidentified()) {
            return;
        }

        String checkText = checkExpressionNode.checkKeyword().text();
        switch (checkText) {
            case Constants.CHECK -> nodeBuilder.flag(FlowNode.NODE_FLAG_CHECKED);
            case Constants.CHECKPANIC -> nodeBuilder.flag(FlowNode.NODE_FLAG_CHECKPANIC);
            default -> throw new IllegalStateException("Unexpected value: " + checkText);

        }
        nodeBuilder.codedata().nodeInfo(checkExpressionNode);
    }

    @Override
    public void visit(MappingConstructorExpressionNode mappingCtrExprNode) {
        handleConstructorExpressionNode(mappingCtrExprNode);
    }

    @Override
    public void visit(ListConstructorExpressionNode listCtrExprNode) {
        handleConstructorExpressionNode(listCtrExprNode);
    }

    private void handleConstructorExpressionNode(ExpressionNode constructorExprNode) {
        NonTerminalNode parent = constructorExprNode.parent();
        SyntaxKind kind = parent.kind();

        if (kind != SyntaxKind.ASSIGNMENT_STATEMENT && kind != SyntaxKind.MODULE_VAR_DECL &&
                kind != SyntaxKind.LOCAL_VAR_DECL) {
            return;
        }

        Optional<Symbol> parentSymbol = semanticModel.symbol(parent);
        parentSymbol.ifPresent(symbol -> CommonUtils.getRawType(
                ((VariableSymbol) symbol).typeDescriptor()).typeKind());

        //Treating these as variable nodes despite the force assign flag
//        if (parentSymbol.isPresent() && CommonUtils.getRawType(
//                ((VariableSymbol) parentSymbol.get()).typeDescriptor()).typeKind() == TypeDescKind.JSON &&
//                !forceAssign) {
//            Treating these as variable nodes despite the force assign flag
//            startNode(NodeKind.JSON_PAYLOAD, constructorExprNode)
//                    .metadata()
//                    .description(JsonPayloadBuilder.DESCRIPTION)
//                    .stepOut()
//                    .properties().expression(constructorExprNode);
    }
    // Utility methods

    /**
     * It's the responsibility of the parent node to add the children nodes when building the diagram. Hence, the method
     * only adds the node to the diagram if there is no active parent node which is building its branches.
     */
    private void endNode(Node node) {
        diagnosticHandler.resolveUnconsumed(nodeBuilder);
        nodeBuilder.codedata().nodeInfo(node);
        endNode();
    }

    private void endNode() {
        if (this.flowNodeBuilderStack.isEmpty()) {
            this.flowNodeList.add(buildNode());
        }
    }

    private NodeBuilder startNode(NodeKind kind) {
        this.nodeBuilder = NodeBuilder.getNodeFromKind(kind)
                .semanticModel(semanticModel)
                .defaultModuleName(moduleInfo);
        return this.nodeBuilder;
    }

    private NodeBuilder startNode(NodeKind kind, Node node) {
        this.nodeBuilder = NodeBuilder.getNodeFromKind(kind)
                .semanticModel(semanticModel)
                .diagnosticHandler(diagnosticHandler)
                .defaultModuleName(moduleInfo);
        diagnosticHandler.handle(nodeBuilder,
                node instanceof ExpressionNode ? node.parent().lineRange() : node.lineRange(), false);
        return this.nodeBuilder;
    }

    /**
     * Builds the flow node and resets the node builder.
     *
     * @return the built flow node
     */
    private FlowNode buildNode() {
        FlowNode node = nodeBuilder.build();
        this.nodeBuilder = null;
        return node;
    }

    /**
     * Starts a new branch and sets the node builder to the starting node of the branch.
     */
    private Branch.Builder startBranch(String label, NodeKind node, Branch.BranchKind kind,
                                       Branch.Repeatable repeatable) {
        this.flowNodeBuilderStack.push(nodeBuilder);
        this.nodeBuilder = null;
        return new Branch.Builder()
                .semanticModel(semanticModel)
                .defaultModuleName(moduleInfo)
                .diagnosticHandler(diagnosticHandler)
                .codedata().node(node).stepOut()
                .label(label)
                .kind(kind)
                .repeatable(repeatable);
    }

    /**
     * Ends the current branch and sets the node builder to the parent node.
     */
    private void endBranch(Branch.Builder branchBuilder, Node node) {
        branchBuilder.codedata().nodeInfo(node);
        nodeBuilder = this.flowNodeBuilderStack.pop();
        nodeBuilder.branch(branchBuilder.build());
    }

    private boolean isNodeUnidentified() {
        return this.nodeBuilder == null;
    }

    /**
     * The default procedure to handle the statement nodes. These nodes should be handled explicitly.
     *
     * @param statementNode the statement node
     */
    private void handleDefaultStatementNode(NonTerminalNode statementNode) {
        handleExpressionNode(statementNode);
        endNode(statementNode);
    }

    private void handleExpressionNode(NonTerminalNode statementNode) {
        // If there is a type binding pattern node, then default to the variable node
        if (typedBindingPatternNode != null) {
            return;
        }

        startNode(NodeKind.EXPRESSION, statementNode)
                .properties().statement(statementNode);
    }

    private void analyzeBlock(BlockStatementNode blockStatement, Branch.Builder branchBuilder) {
        for (Node statementOrComment : blockStatement.statementsWithComments()) {
            statementOrComment.accept(this);
            branchBuilder.node(buildNode());
        }
    }

    @Override
    protected void visitSyntaxNode(Node node) {
        // Skip visiting the child nodes of non-overridden methods.
    }

    private void genCommentNode(CommentMetadata comment) {
        startNode(NodeKind.COMMENT)
                .metadata().description(comment.comment()).stepOut()
                .properties().comment(comment.comment());
        nodeBuilder.codedata()
                .lineRange(comment.position)
                .sourceCode(comment.comment());
        endNode();
    }

    private String getIcon(String name) {
        for (Symbol symbol : semanticModel.moduleSymbols()) {
            if (symbol.kind() != SymbolKind.FUNCTION) {
                continue;
            }
            FunctionSymbol functionSymbol = (FunctionSymbol) symbol;
            if (functionSymbol.nameEquals(name)) {
                for (AnnotationAttachmentSymbol annotAttachment : functionSymbol.annotAttachments()) {
                    Optional<String> annotName = annotAttachment.typeDescriptor().getName();
                    if (annotName.isEmpty() || !annotName.get().equals("display")) {
                        continue;
                    }
                    Optional<ConstantValue> optAttachmentValue = annotAttachment.attachmentValue();
                    if (optAttachmentValue.isEmpty()) {
                        return "";
                    }
                    ConstantValue attachmentValue = optAttachmentValue.get();
                    if (attachmentValue.valueType().typeKind() != TypeDescKind.RECORD) {
                        return "";
                    }
                    HashMap<?, ?> valueMap = (HashMap<?, ?>) attachmentValue.value();
                    if (valueMap.get("iconPath") == null) {
                        return "";
                    }
                    return valueMap.get("iconPath").toString();
                }
            }
        }
        return "";
    }

    private boolean isMcpToolKitExpression(ExpressionNode expressionNode) {
        if (AiUtils.isMcpToolKitSymbol(semanticModel.symbol(expressionNode).orElse(null))) {
            return true;
        }
        return semanticModel.typeOf(expressionNode)
                .map(AiUtils::isMcpToolKitType)
                .orElse(false);
    }

    // Resolves the class method backing a `self.<tool>` field-access tool (so its @display is readable;
    // semanticModel.symbol on the field access yields a VariableSymbol that carries no annotations).
    private Optional<MethodSymbol> resolveToolMethod(FieldAccessExpressionNode fieldAccess, String toolName) {
        Node parent = fieldAccess.parent();
        while (parent != null && !(parent instanceof ClassDefinitionNode)) {
            parent = parent.parent();
        }
        if (parent != null && semanticModel.symbol(parent).orElse(null) instanceof ClassSymbol classSymbol) {
            return Optional.ofNullable(classSymbol.methods().get(toolName));
        }
        return Optional.empty();
    }

    private String getToolDescription(String toolName) {
        for (Symbol symbol : semanticModel.moduleSymbols()) {
            if (symbol.kind() != SymbolKind.FUNCTION) {
                continue;
            }
            FunctionSymbol functionSymbol = (FunctionSymbol) symbol;
            if (!functionSymbol.getName().orElseThrow().equals(toolName)) {
                continue;
            }
            Optional<Documentation> optDoc = functionSymbol.documentation();
            if (optDoc.isEmpty()) {
                break;
            }
            Optional<String> optDescription = optDoc.get().description();
            if (optDescription.isEmpty()) {
                break;
            }
            return optDescription.get();
        }

        return "";
    }

    private boolean isAgentDelegationTool(Symbol functionSymbol) {
        Optional<Location> location = functionSymbol.getLocation();
        if (location.isEmpty()) {
            return false;
        }
        Document document = CommonUtils.getDocument(project, location.get());
        if (document == null) {
            return false;
        }
        NonTerminalNode node = ((ModulePartNode) document.syntaxTree().rootNode())
                .findNode(location.get().textRange());
        while (node != null && !(node instanceof FunctionDefinitionNode)) {
            node = node.parent();
        }
        return node != null && delegatesToAgentRun(((FunctionDefinitionNode) node).functionBody());
    }

    private boolean delegatesToAgentRun(Node node) {
        if (!(node instanceof NonTerminalNode nonTerminal)) {
            return false;
        }
        if (node instanceof MethodCallExpressionNode methodCall
                && methodCall.methodName().toString().trim().equals(RUN_METHOD)) {
            Optional<TypeSymbol> receiverType = semanticModel.typeOf(methodCall.expression());
            if (receiverType.isPresent() && CommonUtils.getRawType(receiverType.get()) instanceof ClassSymbol cls
                    && (isAgentClass(cls) || isAiFixedReturnAgent(cls) || isAiInferredReturnAgent(cls))) {
                return true;
            }
        }
        for (Node child : nonTerminal.children()) {
            if (delegatesToAgentRun(child)) {
                return true;
            }
        }
        return false;
    }

    private Optional<ImplicitNewExpressionNode> getNewExpr(ExpressionNode expressionNode) {
        NonTerminalNode expr = expressionNode;
        if (expressionNode.kind() == SyntaxKind.CHECK_EXPRESSION) {
            expr = ((CheckExpressionNode) expr).expression();
        }
        if (expr.kind() == SyntaxKind.IMPLICIT_NEW_EXPRESSION) {
            return Optional.of((ImplicitNewExpressionNode) expr);
        }

        // Handle variable references - follow the reference to find the actual new expression
        if (expr instanceof NameReferenceNode) {
            return semanticModel.symbol(expr)
                    .filter(s -> s instanceof VariableSymbol)
                    .map(s -> (VariableSymbol) s)
                    .flatMap(variableSymbol -> variableSymbol.getLocation()
                            .flatMap(location -> Optional.ofNullable(CommonUtils.getDocument(project, location))
                                    .flatMap(document -> CommonUtil.findNode(variableSymbol, document.syntaxTree())
                                            .flatMap(varNode -> Optional.ofNullable(
                                                            getInitializerFromVariableNode(varNode))
                                                    .flatMap(this::getNewExpr)))));
        }

        return Optional.empty();
    }

    /**
     * Extracts class definition information for MCP toolkit classes. Returns a Map containing the class definition's
     * codedata.
     *
     * @param classSymbol The class symbol representing the MCP toolkit class
     * @return A Map containing "lineRange" if found, null otherwise
     */
    private Map<String, Object> getClassDefinitionCodedata(ClassSymbol classSymbol) {
        Optional<Location> optLocation = classSymbol.getLocation();
        if (optLocation.isEmpty()) {
            return null;
        }

        Location location = optLocation.get();
        Document document = CommonUtils.getDocument(project, location);
        if (document == null) {
            return null;
        }

        Optional<NonTerminalNode> optNode = CommonUtil.findNode(classSymbol, document.syntaxTree());

        if (optNode.isEmpty()) {
            return null;
        }

        NonTerminalNode classNode = optNode.get();
        Map<String, Object> classDefinitionData = new LinkedHashMap<>();
        classDefinitionData.put("lineRange", classNode.lineRange());

        return classDefinitionData;
    }

    /**
     * Extracts the permitted tools from the `permittedTools` map in the MCP toolkit class's init method.
     *
     * @param classSymbol The class symbol representing the MCP toolkit class
     * @return A list of permitted tool names, or an empty list if not found
     */
    private String getPermittedToolsFromClass(ClassSymbol classSymbol) {
        Optional<Location> optLocation = classSymbol.getLocation();
        if (optLocation.isEmpty()) {
            return "()";
        }

        Location location = optLocation.get();
        Document document = CommonUtils.getDocument(project, location);
        if (document == null) {
            return "()";
        }

        Optional<NonTerminalNode> optNode = CommonUtil.findNode(classSymbol, document.syntaxTree());

        if (optNode.isEmpty() || !(optNode.get() instanceof ClassDefinitionNode classNode)) {
            return "()";
        }

        // Find the init method in the class
        for (Node member : classNode.members()) {
            if (member.kind() != SyntaxKind.OBJECT_METHOD_DEFINITION) {
                continue;
            }

            FunctionDefinitionNode methodNode = (FunctionDefinitionNode) member;
            if (!methodNode.functionName().text().equals("init")) {
                continue;
            }

            // Find the permittedTools variable in the init method
            FunctionBodyNode bodyNode = methodNode.functionBody();
            if (!(bodyNode instanceof FunctionBodyBlockNode blockNode)) {
                continue;
            }

            for (StatementNode statement : blockNode.statements()) {
                if (statement.kind() != SyntaxKind.LOCAL_VAR_DECL) {
                    continue;
                }

                VariableDeclarationNode varDecl = (VariableDeclarationNode) statement;
                String variableName = varDecl.typedBindingPattern().bindingPattern().toSourceCode().trim();

                if (!variableName.equals("permittedTools")) {
                    continue;
                }

                // Extract the keys from the mapping constructor
                Optional<ExpressionNode> optInitializer = varDecl.initializer();
                if (optInitializer.isEmpty() ||
                        optInitializer.get().kind() != SyntaxKind.MAPPING_CONSTRUCTOR) {
                    continue;
                }

                MappingConstructorExpressionNode mappingExpr =
                        (MappingConstructorExpressionNode) optInitializer.get();

                List<String> toolNames = new ArrayList<>();
                for (MappingFieldNode field : mappingExpr.fields()) {
                    if (field.kind() == SyntaxKind.SPECIFIC_FIELD) {
                        SpecificFieldNode specificField = (SpecificFieldNode) field;
                        String fieldName = specificField.fieldName().toSourceCode().trim();
                        // Remove quotes if present
                        if (fieldName.startsWith("\"") && fieldName.endsWith("\"")) {
                            fieldName = fieldName.substring(1, fieldName.length() - 1);
                        }
                        toolNames.add(fieldName);
                    }
                }
                // Convert list to JSON array string format
                return toolNames.stream()
                        .map(name -> "\"" + name + "\"")
                        .collect(Collectors.joining(", ", "[", "]"));
            }
        }
        return "()";
    }

    /**
     * Extracts tool scopes from {@code @ai:AgentTool} annotations on the MCP toolkit class methods. Builds a reverse
     * mapping from method names to original tool names using the {@code permittedTools} map, then extracts scopes from
     * each method's annotation.
     *
     * @param classSymbol The class symbol representing the MCP toolkit class
     * @return A JSON string mapping tool names to their scopes, or null if no scopes are found
     */
    private String getToolScopesFromClass(ClassSymbol classSymbol) {
        Optional<Location> optLocation = classSymbol.getLocation();
        if (optLocation.isEmpty()) {
            return null;
        }

        Document document = CommonUtils.getDocument(project, optLocation.get());
        if (document == null) {
            return null;
        }

        Optional<NonTerminalNode> optNode = CommonUtil.findNode(classSymbol, document.syntaxTree());
        if (optNode.isEmpty() || !(optNode.get() instanceof ClassDefinitionNode classNode)) {
            return null;
        }

        // Build reverse mapping: methodName -> originalToolName from the permittedTools map in init
        Map<String, String> methodToToolName = buildMethodToToolNameMapping(classNode);

        // Extract scopes from @ai:AgentTool annotations on each method
        Map<String, List<String>> toolScopes = new TreeMap<>();
        Set<String> predefinedMethods = Set.of("init", "getTools");

        for (Node member : classNode.members()) {
            if (member.kind() != SyntaxKind.OBJECT_METHOD_DEFINITION) {
                continue;
            }

            FunctionDefinitionNode methodNode = (FunctionDefinitionNode) member;
            String methodName = methodNode.functionName().text();
            if (predefinedMethods.contains(methodName)) {
                continue;
            }

            List<String> scopes = extractScopesFromAnnotation(methodNode);
            if (!scopes.isEmpty()) {
                // Map back to original tool name if we have a mapping, otherwise use method name
                String toolName = methodToToolName.getOrDefault(methodName, methodName);
                toolScopes.put(toolName, scopes);
            }
        }

        if (toolScopes.isEmpty()) {
            return null;
        }

        return new Gson().toJson(toolScopes);
    }

    /**
     * Builds a mapping from method names to original tool names by parsing the permittedTools map in the init method.
     */
    private Map<String, String> buildMethodToToolNameMapping(ClassDefinitionNode classNode) {
        Map<String, String> mapping = new HashMap<>();
        for (Node member : classNode.members()) {
            if (member.kind() != SyntaxKind.OBJECT_METHOD_DEFINITION) {
                continue;
            }
            FunctionDefinitionNode methodNode = (FunctionDefinitionNode) member;
            if (!methodNode.functionName().text().equals("init")) {
                continue;
            }
            FunctionBodyNode bodyNode = methodNode.functionBody();
            if (!(bodyNode instanceof FunctionBodyBlockNode blockNode)) {
                continue;
            }
            for (StatementNode statement : blockNode.statements()) {
                if (statement.kind() != SyntaxKind.LOCAL_VAR_DECL) {
                    continue;
                }
                VariableDeclarationNode varDecl = (VariableDeclarationNode) statement;
                String variableName = varDecl.typedBindingPattern().bindingPattern().toSourceCode().trim();
                if (!variableName.equals("permittedTools")) {
                    continue;
                }
                Optional<ExpressionNode> optInitializer = varDecl.initializer();
                if (optInitializer.isEmpty() ||
                        optInitializer.get().kind() != SyntaxKind.MAPPING_CONSTRUCTOR) {
                    continue;
                }
                MappingConstructorExpressionNode mappingExpr =
                        (MappingConstructorExpressionNode) optInitializer.get();
                for (MappingFieldNode field : mappingExpr.fields()) {
                    if (field.kind() == SyntaxKind.SPECIFIC_FIELD) {
                        SpecificFieldNode specificField = (SpecificFieldNode) field;
                        String toolName = specificField.fieldName().toSourceCode().trim();
                        if (toolName.startsWith("\"") && toolName.endsWith("\"")) {
                            toolName = toolName.substring(1, toolName.length() - 1);
                        }
                        // Value is like "self.methodName" - extract method name
                        if (specificField.valueExpr().isPresent()) {
                            String valueSource = specificField.valueExpr().get().toSourceCode().trim();
                            if (valueSource.startsWith("self.")) {
                                String methodName = valueSource.substring(5);
                                mapping.put(methodName, toolName);
                            }
                        }
                    }
                }
            }
        }
        return mapping;
    }

    // TODO: Clean this up, and move to AiUtils

    /**
     * Extracts OAuth scopes from an {@code @ai:AgentTool} annotation on a function definition.
     */
    private List<String> extractScopesFromAnnotation(FunctionDefinitionNode methodNode) {
        Optional<MetadataNode> optMetadata = methodNode.metadata();
        if (optMetadata.isEmpty()) {
            return List.of();
        }

        for (AnnotationNode annotation : optMetadata.get().annotations()) {
            String annotRef = annotation.annotReference().toSourceCode().trim();
            if (!annotRef.equals("ai:AgentTool")) {
                continue;
            }

            // Check if annotation has a value (mapping constructor)
            Optional<MappingConstructorExpressionNode> optAnnotValue = annotation.annotValue();
            if (optAnnotValue.isEmpty()) {
                continue;
            }

            // Look for auth field
            for (MappingFieldNode field : optAnnotValue.get().fields()) {
                if (field.kind() != SyntaxKind.SPECIFIC_FIELD) {
                    continue;
                }
                SpecificFieldNode specificField = (SpecificFieldNode) field;
                String fieldName = specificField.fieldName().toSourceCode().trim();
                if (!fieldName.equals("auth") || specificField.valueExpr().isEmpty()) {
                    continue;
                }

                ExpressionNode authExpr = specificField.valueExpr().get();
                if (authExpr.kind() != SyntaxKind.MAPPING_CONSTRUCTOR) {
                    continue;
                }

                // Look for scopes field inside auth
                MappingConstructorExpressionNode authMapping =
                        (MappingConstructorExpressionNode) authExpr;
                for (MappingFieldNode innerField : authMapping.fields()) {
                    if (innerField.kind() != SyntaxKind.SPECIFIC_FIELD) {
                        continue;
                    }
                    SpecificFieldNode scopesField = (SpecificFieldNode) innerField;
                    String innerFieldName = scopesField.fieldName().toSourceCode().trim();
                    if (!innerFieldName.equals("scopes") || scopesField.valueExpr().isEmpty()) {
                        continue;
                    }

                    ExpressionNode scopesExpr = scopesField.valueExpr().get();
                    if (scopesExpr.kind() != SyntaxKind.LIST_CONSTRUCTOR) {
                        continue;
                    }

                    ListConstructorExpressionNode listNode = (ListConstructorExpressionNode) scopesExpr;
                    List<String> scopes = new ArrayList<>();
                    for (Node item : listNode.expressions()) {
                        String scopeValue = item.toSourceCode().trim();
                        if (scopeValue.startsWith("\"") && scopeValue.endsWith("\"")) {
                            scopeValue = scopeValue.substring(1, scopeValue.length() - 1);
                        }
                        scopes.add(scopeValue);
                    }
                    return scopes;
                }
            }
        }
        return List.of();
    }

    // Check whether a type symbol is subType of `RawTemplate`
    private boolean isSubTypeOfRawTemplate(TypeSymbol typeSymbol) {
        if (typeSymbol == null) {
            return false;
        }

        // TODO: Once https://github.com/ballerina-platform/ballerina-lang/pull/43871 is merged,
        //  we can use `typeSymbol.subtypeOf(semanticModel.types().RAW_TEMPLATE)` to check the subtyping
        Optional<Symbol> rawSymbolOptional = semanticModel.types()
                .getTypeByName(BALLERINA_ORG_NAME, "lang.object", "0.0.0", "RawTemplate");
        if (rawSymbolOptional.isEmpty()) {
            return false;
        }
        TypeDefinitionSymbol rawTypeDefSymbol = (TypeDefinitionSymbol) rawSymbolOptional.get();

        TypeSymbol rawTemplateTypeDesc = rawTypeDefSymbol.typeDescriptor();
        return typeSymbol.subtypeOf(rawTemplateTypeDesc);
    }

    public List<FlowNode> getFlowNodes() {
        return flowNodeList;
    }

    private record CommentMetadata(String comment, LineRange position) {

    }

    private record ToolData(String name, String path, String description, String type) {

    }

    private record ModelData(String name, String path, String type) {

    }

    // TODO: Update data based on requirements
    private record MemoryManagerData(String type, String size) {

    }

    private String removeLeadingAndTrailingMinutiae(Node node, CommentProperty commentProperty) {
        String sourceCode = node.toSourceCode().strip();
        String leadingMinutiae = node.leadingMinutiae().toString();
        if (leadingMinutiae.contains("//")) {
            commentProperty.setLeadingComment(leadingMinutiae.substring(leadingMinutiae.indexOf("//")));
        }
        sourceCode = sourceCode.replace(leadingMinutiae.strip(), "");

        String trailingMinutiae = node.trailingMinutiae().toString();
        if (trailingMinutiae.contains("//")) {
            commentProperty.setTrailingComment(trailingMinutiae.substring(trailingMinutiae.indexOf("//")));
        }
        sourceCode = sourceCode.replace(trailingMinutiae.strip(), "");
        return sourceCode.strip();
    }

    private static String getPathString(NodeList<Node> nodes) {
        return nodes.stream()
                .map(node -> node.toString().trim())
                .collect(Collectors.joining());
    }

    private boolean isAgent(ServiceDeclarationNode serviceDeclarationNode) {
        SeparatedNodeList<ExpressionNode> expressions = serviceDeclarationNode.expressions();
        if (expressions.isEmpty()) {
            return false;
        }

        ExpressionNode listenerExpression = expressions.get(0);
        Optional<TypeSymbol> typeSymbol = semanticModel.typeOf(listenerExpression);
        if (typeSymbol.isEmpty()) {
            return false;
        }

        TypeSymbol listenerTypeSymbol = getListenerTypeSymbol(typeSymbol.get());
        if (listenerTypeSymbol == null) {
            return false;
        }

        Optional<ModuleSymbol> module = listenerTypeSymbol.getModule();
        return module.isPresent() && AI_AGENT.equals(module.get().id().moduleName());
    }

    private TypeSymbol getListenerTypeSymbol(TypeSymbol typeSymbol) {
        if (typeSymbol.typeKind() == TypeDescKind.UNION) {
            UnionTypeSymbol unionTypeSymbol = (UnionTypeSymbol) typeSymbol;
            return unionTypeSymbol.memberTypeDescriptors().stream()
                    .filter(member -> !member.subtypeOf(semanticModel.types().ERROR))
                    .findFirst().orElse(null);
        }
        return typeSymbol;
    }

    /**
     * Represents the function kind to display in the flow model.
     *
     * @since 1.0.1
     */
    public enum FunctionKind {
        FUNCTION("Function"),
        REMOTE_FUNCTION("Remote Function"),
        RESOURCE("Resource"),
        AI_CHAT_AGENT("AI Chat Agent"),
        WORKFLOW("Workflow"),
        ACTIVITY("Activity");

        private final String value;

        FunctionKind(String value) {
            this.value = value;
        }

        public String getValue() {
            return value;
        }
    }
}
