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

package io.ballerina.testmanagerservice.extension;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.api.symbols.Symbol;
import io.ballerina.compiler.syntax.tree.AnnotationNode;
import io.ballerina.compiler.syntax.tree.ExpressionFunctionBodyNode;
import io.ballerina.compiler.syntax.tree.ExpressionNode;
import io.ballerina.compiler.syntax.tree.ExpressionStatementNode;
import io.ballerina.compiler.syntax.tree.FunctionBodyBlockNode;
import io.ballerina.compiler.syntax.tree.FunctionBodyNode;
import io.ballerina.compiler.syntax.tree.FunctionDefinitionNode;
import io.ballerina.compiler.syntax.tree.MetadataNode;
import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.compiler.syntax.tree.NodeList;
import io.ballerina.compiler.syntax.tree.NonTerminalNode;
import io.ballerina.compiler.syntax.tree.StatementNode;
import io.ballerina.projects.Document;
import io.ballerina.projects.DocumentId;
import io.ballerina.projects.Module;
import io.ballerina.projects.Project;
import io.ballerina.testmanagerservice.extension.model.Annotation;
import io.ballerina.testmanagerservice.extension.model.FunctionParameter;
import io.ballerina.testmanagerservice.extension.model.Property;
import io.ballerina.testmanagerservice.extension.model.TestFunction;
import io.ballerina.testmanagerservice.extension.request.AddTestFunctionRequest;
import io.ballerina.testmanagerservice.extension.request.GetTestFunctionRequest;
import io.ballerina.testmanagerservice.extension.request.TestsDiscoveryRequest;
import io.ballerina.testmanagerservice.extension.request.UpdateTestFunctionRequest;
import io.ballerina.testmanagerservice.extension.response.CommonSourceResponse;
import io.ballerina.testmanagerservice.extension.response.GetTestFunctionResponse;
import io.ballerina.testmanagerservice.extension.response.TestsDiscoveryResponse;
import io.ballerina.tools.text.LineRange;
import io.ballerina.tools.text.TextDocument;
import io.ballerina.tools.text.TextRange;
import org.ballerinalang.annotation.JavaSPIService;
import org.ballerinalang.langserver.common.utils.NameUtil;
import org.ballerinalang.langserver.commons.service.spi.ExtendedLanguageServerService;
import org.ballerinalang.langserver.commons.workspace.WorkspaceManager;
import org.eclipse.lsp4j.TextEdit;
import org.eclipse.lsp4j.jsonrpc.services.JsonRequest;
import org.eclipse.lsp4j.jsonrpc.services.JsonSegment;
import org.eclipse.lsp4j.services.LanguageServer;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Represents the extended language server service for the test manager service.
 *
 * @since 1.0.0
 */
@JavaSPIService("org.ballerinalang.langserver.commons.service.spi.ExtendedLanguageServerService")
@JsonSegment("testManagerService")
public class TestManagerService implements ExtendedLanguageServerService {

    private WorkspaceManager workspaceManager;

    @Override
    public void init(LanguageServer langServer, WorkspaceManager workspaceManager) {
        this.workspaceManager = workspaceManager;
    }

    @Override
    public Class<?> getRemoteInterface() {
        return null;
    }

    /**
     * Discovers tests in a file.
     *
     * @param request the request to discover tests in a file
     * @return the response to discover tests in a file
     */
    @JsonRequest
    public CompletableFuture<TestsDiscoveryResponse> discoverInFile(TestsDiscoveryRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            try {
                Path filePath = Path.of(request.projectPath());
                this.workspaceManager.loadProject(filePath);
                Optional<Document> document = this.workspaceManager.document(filePath);
                if (document.isEmpty()) {
                    throw new RuntimeException("Test document not found: " + filePath);
                }
                ModuleTestDetailsHolder moduleTestDetailsHolder = new ModuleTestDetailsHolder();
                TestFunctionsFinder testFunctionsFinder = new TestFunctionsFinder(document.get(),
                        moduleTestDetailsHolder);
                testFunctionsFinder.find();
                return TestsDiscoveryResponse.from(moduleTestDetailsHolder.getGroupsToFunctions());
            } catch (Throwable e) {
                return TestsDiscoveryResponse.from(e);
            }
        });
    }

    /**
     * Discovers tests in a project.
     *
     * @param request the request to discover tests in a project
     * @return the response to discover tests in a project
     */
    @JsonRequest
    public CompletableFuture<TestsDiscoveryResponse> discoverInProject(TestsDiscoveryRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            try {
                Path filePath = Path.of(request.projectPath());
                Project project = this.workspaceManager.loadProject(filePath);
                io.ballerina.projects.Package currentPackage = project.currentPackage();
                Module defaultModule = currentPackage.getDefaultModule();
                ModuleTestDetailsHolder moduleTestDetailsHolder = new ModuleTestDetailsHolder();
                for (DocumentId documentId : defaultModule.testDocumentIds()) {
                    TestFunctionsFinder testFunctionsFinder = new TestFunctionsFinder(
                            defaultModule.document(documentId), moduleTestDetailsHolder);
                    testFunctionsFinder.find();
                }
                return TestsDiscoveryResponse.from(moduleTestDetailsHolder.getGroupsToFunctions());
            } catch (Throwable e) {
                return TestsDiscoveryResponse.from(e);
            }
        });
    }

    /**
     * Get the test function model for the given test function.
     *
     * @param request the request to get the test function model
     * @return the response to get the test function model
     */
    @JsonRequest
    public CompletableFuture<GetTestFunctionResponse> getTestFunction(GetTestFunctionRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            try {
                Path filePath = Path.of(request.filePath());
                this.workspaceManager.loadProject(filePath);
                Optional<Document> document = this.workspaceManager.document(filePath);
                Optional<SemanticModel> semanticModel = this.workspaceManager.semanticModel(filePath);
                if (document.isEmpty() || semanticModel.isEmpty()) {
                    return GetTestFunctionResponse.get();
                }
                ModulePartNode modulePartNode = document.get().syntaxTree().rootNode();
                Optional<FunctionDefinitionNode> matchingFunc = modulePartNode.members().stream()
                        .filter(mem -> mem instanceof FunctionDefinitionNode)
                        .map(mem -> (FunctionDefinitionNode) mem)
                        .filter(mem -> mem.functionName().text().trim().equals(request.functionName()))
                        .findFirst();

                return matchingFunc.map(functionDefinitionNode -> GetTestFunctionResponse.from(
                                Utils.getTestFunctionModel(functionDefinitionNode, semanticModel.get(),
                                        modulePartNode)))
                        .orElseGet(GetTestFunctionResponse::get);
            } catch (Throwable e) {
                return GetTestFunctionResponse.from(e);
            }
        });
    }

    /**
     * Add a test function to the given test function.
     *
     * @param request the request to get the test function model
     * @return the response to get the test function model
     */
    @JsonRequest
    public CompletableFuture<CommonSourceResponse> addTestFunction(AddTestFunctionRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            try {
                Path filePath = Path.of(request.filePath());
                this.workspaceManager.loadProject(filePath);
                Optional<Document> document = this.workspaceManager.document(filePath);
                Optional<SemanticModel> semanticModel = this.workspaceManager.semanticModel(filePath);
                if (document.isEmpty() || semanticModel.isEmpty()) {
                    return new CommonSourceResponse();
                }
                ModulePartNode modulePartNode = document.get().syntaxTree().rootNode();
                LineRange lineRange = modulePartNode.lineRange();
                List<TextEdit> edits = new ArrayList<>();

                // Check if test import is needed
                if (!Utils.isTestModuleImportExists(modulePartNode)) {
                    edits.add(new TextEdit(Utils.toRange(lineRange.startLine()), Constants.IMPORT_TEST_STMT));
                }

                if (request.evalTemplate() != null) {
                    return addTemplateEvaluation(request, document.get(), semanticModel.get(), modulePartNode,
                            lineRange, edits);
                }

                // Check if dataProviderMode is evalSet
                String dataProviderMode = getDataProviderMode(request.function());
                String dataProviderFunctionName;

                if (Constants.DATA_PROVIDER_MODE_EVALSET.equals(dataProviderMode)) {
                    // Add AI import if needed
                    if (!Utils.isAiModuleImportExists(modulePartNode)) {
                        edits.add(new TextEdit(Utils.toRange(lineRange.startLine()), Constants.IMPORT_AI_STMT));
                    }

                    // Generate unique function name for evalSet data provider
                    dataProviderFunctionName = NameUtil.getValidatedSymbolName(
                            visibleSymbolNames(semanticModel.get(), document.get(), modulePartNode),
                            Constants.DEFAULT_EVALSET_FUNCTION_NAME
                    );

                    // Generate the evalSet data provider function
                    String evalSetFile = getEvalSetFile(request.function());
                    if (evalSetFile == null || evalSetFile.isEmpty()) {
                        evalSetFile = "session.json"; // Default fallback
                    }
                    String dataProviderFunction = Utils.getEvalSetDataProviderFunctionTemplate(
                            dataProviderFunctionName,
                            evalSetFile
                    );
                    edits.add(new TextEdit(Utils.toRange(lineRange.endLine()), dataProviderFunction));

                    // Add ai:ConversationThread parameter to the test function
                    addTestParameter(request.function(), Constants.AI_CONVERSATION_THREAD_TYPE,
                            Constants.EVALSET_PROVIDER_VAR);

                    // Update the dataProvider field with the generated function name
                    updateDataProviderField(request.function(), dataProviderFunctionName);
                }

                // Generate the test function
                String function = Utils.getTestFunctionTemplate(request.function());
                edits.add(new TextEdit(Utils.toRange(lineRange.endLine()), function));

                return new CommonSourceResponse(Map.of(request.filePath(), edits));
            } catch (Throwable e) {
                return new CommonSourceResponse(e);
            }
        });
    }

    private CommonSourceResponse addTemplateEvaluation(AddTestFunctionRequest request, Document document,
                                                       SemanticModel semanticModel, ModulePartNode modulePartNode,
                                                       LineRange lineRange, List<TextEdit> edits) {
        JsonObject template = request.evalTemplate();
        String symbol = template.has("symbol") ? template.get("symbol").getAsString() : "";
        if (symbol.isBlank()) {
            throw new IllegalArgumentException("An evaluation template function is required");
        }
        if (!Utils.isAiEvalModuleImportExists(modulePartNode)) {
            edits.add(new TextEdit(Utils.toRange(lineRange.startLine()), Constants.IMPORT_AI_EVAL_STMT));
        }

        String boundArgument = null;
        JsonObject dataSource = template.has("dataSource") && template.get("dataSource").isJsonObject()
                ? template.getAsJsonObject("dataSource") : null;
        if (dataSource != null) {
            String paramName = dataSource.has("paramName") ? dataSource.get("paramName").getAsString() : "";
            String mode = dataSource.has("mode") ? dataSource.get("mode").getAsString() : "";
            if (paramName.isBlank()) {
                throw new IllegalArgumentException("The evaluation input parameter name is required");
            }
            Set<String> visibleSymbolNames = visibleSymbolNames(semanticModel, document, modulePartNode);
            if (Constants.DATA_SOURCE_MODE_QUERIES.equals(mode)) {
                List<String> queries = readQueries(dataSource);
                if (queries.isEmpty()) {
                    throw new IllegalArgumentException("At least one query is required");
                }
                String dataProviderFunctionName = NameUtil.getValidatedSymbolName(visibleSymbolNames,
                        Constants.DEFAULT_QUERIES_FUNCTION_NAME);
                edits.add(new TextEdit(Utils.toRange(lineRange.endLine()),
                        Utils.getQueriesDataProviderFunctionTemplate(dataProviderFunctionName, queries)));
                addTestParameter(request.function(), Constants.STRING_TYPE, Constants.QUERY_PROVIDER_VAR);
                updateDataProviderField(request.function(), dataProviderFunctionName);
                boundArgument = paramName + " = " + Constants.QUERY_PROVIDER_VAR;
            } else {
                if (!Utils.isAiModuleImportExists(modulePartNode)) {
                    edits.add(new TextEdit(Utils.toRange(lineRange.startLine()), Constants.IMPORT_AI_STMT));
                }
                String evalSetFile = dataSource.has("evalSetFile") ? dataSource.get("evalSetFile").getAsString() : "";
                if (evalSetFile.isBlank()) {
                    throw new IllegalArgumentException("An evalset is required for the selected input mode");
                }
                String dataProviderFunctionName = NameUtil.getValidatedSymbolName(visibleSymbolNames,
                        Constants.DEFAULT_EVALSET_FUNCTION_NAME);
                edits.add(new TextEdit(Utils.toRange(lineRange.endLine()), Utils.getEvalSetDataProviderFunctionTemplate(
                        dataProviderFunctionName, evalSetFile)));
                addTestParameter(request.function(), Constants.AI_CONVERSATION_THREAD_TYPE,
                        Constants.EVALSET_PROVIDER_VAR);
                updateDataProviderField(request.function(), dataProviderFunctionName);
                boundArgument = paramName + " = " + Constants.EVALSET_PROVIDER_VAR;
            }
        }

        edits.add(new TextEdit(Utils.toRange(lineRange.endLine()), getTemplateTestFunction(request.function(),
                symbol, template.getAsJsonObject("parameters"), boundArgument)));
        return new CommonSourceResponse(Map.of(request.filePath(), edits));
    }

    private List<String> readQueries(JsonObject dataSource) {
        List<String> queries = new ArrayList<>();
        if (dataSource.has("queries") && dataSource.get("queries").isJsonArray()) {
            for (JsonElement element : dataSource.getAsJsonArray("queries")) {
                if (!element.isJsonNull()) {
                    String query = element.getAsString().trim();
                    if (!query.isEmpty()) {
                        queries.add(query);
                    }
                }
            }
        }
        return queries;
    }

    private void updateTemplateEvaluation(UpdateTestFunctionRequest request, TextDocument textDocument,
                                          Document document, SemanticModel semanticModel,
                                          ModulePartNode modulePartNode, FunctionDefinitionNode functionNode,
                                          List<TextEdit> edits) {
        JsonObject template = request.evalTemplate();
        Optional<ExpressionStatementNode> call = Utils.findEvalTemplateCall(functionNode);
        if (call.isEmpty()) {
            // Nothing recognisable to replace; never rewrite a body we did not generate.
            return;
        }

        String symbol = template.has("symbol") ? template.get("symbol").getAsString() : "";
        if (symbol.isBlank()) {
            throw new IllegalArgumentException("An evaluation template function is required");
        }

        String boundArgument = reconcileDataSource(request, template, textDocument, document, semanticModel,
                modulePartNode, edits);
        String invocation = Utils.buildEvalTemplateInvocation(symbol,
                readTemplateArguments(template.getAsJsonObject("parameters"), boundArgument));
        edits.add(new TextEdit(Utils.toRange(call.get().lineRange()), invocation));
    }

    private String reconcileDataSource(UpdateTestFunctionRequest request, JsonObject template,
                                       TextDocument textDocument, Document document, SemanticModel semanticModel,
                                       ModulePartNode modulePartNode, List<TextEdit> edits) {
        JsonObject dataSource = template.has("dataSource") && template.get("dataSource").isJsonObject()
                ? template.getAsJsonObject("dataSource") : null;
        if (dataSource == null) {
            return null;
        }
        String paramName = dataSource.has("paramName") ? dataSource.get("paramName").getAsString() : "";
        if (paramName.isBlank()) {
            throw new IllegalArgumentException("The evaluation input parameter name is required");
        }
        boolean wantsQueries = Constants.DATA_SOURCE_MODE_QUERIES
                .equals(dataSource.has("mode") ? dataSource.get("mode").getAsString() : "");

        String providerName = Utils.getConfigFieldValue(request.function(), "dataProvider");
        Optional<FunctionDefinitionNode> provider = providerName == null || providerName.isBlank()
                ? Optional.empty() : Utils.findFunctionByName(modulePartNode, providerName);
        Utils.DataProviderShape shape = provider.map(Utils::getDataProviderShape)
                .orElse(Utils.DataProviderShape.UNKNOWN);

        Utils.DataProviderShape wantedShape = wantsQueries
                ? Utils.DataProviderShape.QUERIES : Utils.DataProviderShape.EVALSET;
        String paramType = wantsQueries ? Constants.STRING_TYPE : Constants.AI_CONVERSATION_THREAD_TYPE;
        String providerVar = wantsQueries ? Constants.QUERY_PROVIDER_VAR : Constants.EVALSET_PROVIDER_VAR;
        String defaultName = wantsQueries
                ? Constants.DEFAULT_QUERIES_FUNCTION_NAME : Constants.DEFAULT_EVALSET_FUNCTION_NAME;
        Function<String, String> providerTemplate;
        Runnable patchInPlace;
        if (wantsQueries) {
            List<String> queries = readQueries(dataSource);
            if (queries.isEmpty()) {
                throw new IllegalArgumentException("At least one query is required");
            }
            providerTemplate = name -> Utils.getQueriesDataProviderFunctionTemplate(name, queries);
            patchInPlace = () -> Utils.findQueriesListLocation(provider.get()).ifPresent(range ->
                    edits.add(new TextEdit(Utils.toRange(range), Utils.buildQueryExpressionArray(queries))));
        } else {
            String evalSetFile = dataSource.has("evalSetFile") ? dataSource.get("evalSetFile").getAsString() : "";
            if (evalSetFile.isBlank()) {
                throw new IllegalArgumentException("An evalset is required for the selected input mode");
            }
            providerTemplate = name -> Utils.getEvalSetDataProviderFunctionTemplate(name, evalSetFile);
            patchInPlace = () -> updateEvalSetFile(textDocument, modulePartNode, providerName, evalSetFile, edits);
        }

        if (shape == wantedShape) {
            patchInPlace.run();
            return paramName + " = " + boundVariable(request.function(), paramType, providerVar);
        }
        if (shape == Utils.DataProviderShape.UNKNOWN && provider.isPresent()) {
            return paramName + " = " + boundVariable(request.function(), paramType, providerVar);
        }
        if (!wantsQueries && !Utils.isAiModuleImportExists(modulePartNode)) {
            edits.add(new TextEdit(Utils.toRange(modulePartNode.lineRange().startLine()), Constants.IMPORT_AI_STMT));
        }
        String functionName = replaceDataProvider(document, semanticModel, modulePartNode, provider, edits,
                defaultName, providerTemplate);
        swapDataSourceParameter(request.function(), paramType, providerVar);
        updateDataProviderField(request.function(), functionName);
        return paramName + " = " + providerVar;
    }

    private String replaceDataProvider(Document document, SemanticModel semanticModel,
                                       ModulePartNode modulePartNode, Optional<FunctionDefinitionNode> provider,
                                       List<TextEdit> edits, String defaultName,
                                       Function<String, String> template) {
        String currentName = provider.map(func -> func.functionName().text().trim()).orElse("");
        boolean generatedName = currentName.startsWith(Constants.DEFAULT_EVALSET_FUNCTION_NAME)
                || currentName.startsWith(Constants.DEFAULT_QUERIES_FUNCTION_NAME);
        String functionName = !currentName.isEmpty() && !generatedName ? currentName
                : NameUtil.getValidatedSymbolName(visibleSymbolNames(semanticModel, document, modulePartNode),
                        defaultName);
        String source = template.apply(functionName);
        if (provider.isPresent()) {
            edits.add(new TextEdit(Utils.toRange(provider.get().lineRange()), source.stripLeading()));
        } else {
            edits.add(new TextEdit(Utils.toRange(modulePartNode.lineRange().endLine()), source));
        }
        return functionName;
    }

    private Set<String> visibleSymbolNames(SemanticModel semanticModel, Document document,
                                           ModulePartNode modulePartNode) {
        if (semanticModel == null) {
            return Set.of();
        }
        return semanticModel.visibleSymbols(document, modulePartNode.lineRange().endLine()).stream()
                .map(Symbol::getName).filter(Optional::isPresent).map(Optional::get).collect(Collectors.toSet());
    }

    private String boundVariable(TestFunction function, String type, String defaultName) {
        if (function.parameters() == null) {
            return defaultName;
        }
        return function.parameters().stream()
                .filter(param -> param.type() != null && type.equals(String.valueOf(param.type().value()).trim()))
                .map(param -> String.valueOf(param.variable().value()).trim())
                .findFirst().orElse(defaultName);
    }

    private void swapDataSourceParameter(TestFunction function, String type, String variable) {
        if (function.parameters() == null) {
            return;
        }
        String previousType = Constants.STRING_TYPE.equals(type)
                ? Constants.AI_CONVERSATION_THREAD_TYPE : Constants.STRING_TYPE;
        function.parameters().stream()
                .filter(param -> param.type() != null
                        && previousType.equals(String.valueOf(param.type().value()).trim()))
                .findFirst()
                .ifPresent(param -> function.parameters().remove(param));
        addTestParameter(function, type, variable);
    }

    private List<String> readTemplateArguments(JsonObject parameters, String boundArgument) {
        List<String> arguments = new ArrayList<>();
        if (parameters != null) {
            for (Map.Entry<String, JsonElement> entry : parameters.entrySet()) {
                String value = entry.getValue().isJsonNull() ? "" : entry.getValue().getAsString().trim();
                if (!value.isEmpty()) {
                    arguments.add(entry.getKey() + " = " + value);
                }
            }
        }
        if (boundArgument != null) {
            arguments.add(boundArgument);
        }
        return arguments;
    }

    private String getTemplateTestFunction(TestFunction function, String symbol, JsonObject parameters,
                                           String boundArgument) {
        String invocation = Utils.buildEvalTemplateInvocation(symbol, readTemplateArguments(parameters, boundArgument));
        return Utils.buildAnnotation(function.annotations()) + Constants.LINE_SEPARATOR
                + Constants.KEYWORD_FUNCTION + Constants.SPACE + function.functionName().value()
                + Utils.buildFunctionSignature(function) + Constants.SPACE + Constants.OPEN_CURLY_BRACE
                + Constants.LINE_SEPARATOR + Constants.TAB_SEPARATOR + invocation
                + Constants.LINE_SEPARATOR + Constants.CLOSE_CURLY_BRACE;
    }

    private String getDataProviderMode(TestFunction function) {
        return Utils.getConfigFieldValue(function, "dataProviderMode");
    }

    private String getEvalSetFile(TestFunction function) {
        return Utils.getConfigFieldValue(function, "evalSetFile");
    }

    private void addTestParameter(TestFunction function, String type, String variable) {
        if (function.parameters() == null) {
            return;
        }
        FunctionParameter.FunctionParameterBuilder paramBuilder = new FunctionParameter.FunctionParameterBuilder();
        paramBuilder.type(type);
        paramBuilder.variable(variable);
        function.parameters().add(paramBuilder.build());
    }

    private void updateDataProviderField(TestFunction function, String functionName) {
        if (function.annotations() == null) {
            return;
        }
        for (Annotation annotation : function.annotations()) {
            if ("Config".equals(annotation.name())) {
                for (int i = 0; i < annotation.fields().size(); i++) {
                    Property field = annotation.fields().get(i);
                    if ("dataProvider".equals(field.originalName())) {
                        // Update the dataProvider value with the generated function name
                        Property.PropertyBuilder builder = new Property.PropertyBuilder();
                        builder.metadata(field.metadata());
                        builder.codedata(field.codedata());
                        builder.valueType(field.valueType());
                        builder.valueTypeConstraint(field.valueTypeConstraint());
                        builder.value(functionName);
                        builder.originalName(field.originalName());
                        builder.placeholder(field.placeholder());
                        builder.optional(field.optional());
                        builder.editable(field.editable());
                        builder.advanced(field.advanced());
                        annotation.fields().set(i, builder.build());
                        break;
                    }
                }
            }
        }
    }

    /**
     * Update the test function model for the given test function.
     *
     * @param request the request to get the test function model
     * @return the response to get the test function model
     */
    @JsonRequest
    public CompletableFuture<CommonSourceResponse> updateTestFunction(UpdateTestFunctionRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            try {
                Path filePath = Path.of(request.filePath());
                this.workspaceManager.loadProject(filePath);
                Optional<Document> document = this.workspaceManager.document(filePath);
                if (document.isEmpty()) {
                    return new CommonSourceResponse();
                }
                TextDocument textDocument = document.get().syntaxTree().textDocument();
                ModulePartNode modulePartNode = document.get().syntaxTree().rootNode();
                LineRange lineRange = request.function()
                        .codedata().lineRange();
                int start = textDocument.textPositionFrom(lineRange.startLine());
                int end = textDocument.textPositionFrom(lineRange.endLine());
                NonTerminalNode node = modulePartNode.findNode(TextRange.from(start, end - start), true);
                if (!(node instanceof FunctionDefinitionNode functionDefinitionNode)) {
                    return new CommonSourceResponse();
                }

                List<TextEdit> edits = new ArrayList<>();

                if (request.evalTemplate() != null) {
                    updateTemplateEvaluation(request, textDocument, document.get(),
                            this.workspaceManager.semanticModel(filePath).orElse(null), modulePartNode,
                            functionDefinitionNode, edits);
                }

                // Update function name if changed
                String functionName = functionDefinitionNode.functionName().text().trim();
                LineRange nameRange = functionDefinitionNode.functionName().lineRange();
                if (!functionName.equals(request.function().functionName().value())) {
                    edits.add(new TextEdit(Utils.toRange(nameRange),
                            request.function().functionName().value().toString()));
                }

                // Update function signature
                LineRange signatureRange = functionDefinitionNode.functionSignature().lineRange();
                String functionSignature = Utils.buildFunctionSignature(request.function());
                edits.add(new TextEdit(Utils.toRange(signatureRange), functionSignature));

                // Update annotations if present
                if (functionDefinitionNode.metadata().isPresent() &&
                        request.function().annotations() != null &&
                        !request.function().annotations().isEmpty()) {
                    updateAnnotations(functionDefinitionNode, request.function(), edits);
                }

                if (request.evalTemplate() == null) {
                    updateEvalSetFile(textDocument, modulePartNode, request.function(), edits);
                }

                return new CommonSourceResponse(Map.of(request.filePath(), edits));
            } catch (Throwable e) {
                return new CommonSourceResponse(e);
            }
        });
    }

    /**
     * Update the annotations of the function.
     *
     * @param functionDefinitionNode the function definition node
     * @param function               the test function model
     * @param edits                  list of text edits to add to
     */
    private void updateAnnotations(FunctionDefinitionNode functionDefinitionNode, TestFunction function,
                                   List<TextEdit> edits) {
        if (functionDefinitionNode.metadata().isEmpty()) {
            return;
        }

        MetadataNode metadataNode = functionDefinitionNode.metadata().get();
        NodeList<AnnotationNode> annotations = metadataNode.annotations();

        if (annotations.isEmpty()) {
            return;
        }

        // Get the range of all annotations
        LineRange annotationsRange = getAnnotationsRange(annotations);
        if (annotationsRange == null) {
            return;
        }

        // Build new annotation string
        String newAnnotations = Utils.buildAnnotation(function.annotations());
        if (!newAnnotations.isEmpty()) {
            edits.add(new TextEdit(Utils.toRange(annotationsRange), newAnnotations));
        }
    }

    /**
     * Update the evalSetFile in the data provider function.
     *
     * @param textDocument   the text document
     * @param modulePartNode the module part node
     * @param function       the test function model
     * @param edits          list of text edits to add to
     */
    private void updateEvalSetFile(TextDocument textDocument, ModulePartNode modulePartNode, TestFunction function,
                                   List<TextEdit> edits) {
        updateEvalSetFile(textDocument, modulePartNode, getDataProviderName(function), getEvalSetFile(function), edits);
    }

    private void updateEvalSetFile(TextDocument textDocument, ModulePartNode modulePartNode, String dataProviderName,
                                   String newEvalSetFile, List<TextEdit> edits) {

        if (newEvalSetFile == null || newEvalSetFile.isEmpty() ||
                dataProviderName == null || dataProviderName.isEmpty()) {
            return;
        }

        // Find the data provider function
        Optional<FunctionDefinitionNode> dataProviderFunc = findDataProviderFunction(modulePartNode, dataProviderName);
        if (dataProviderFunc.isEmpty()) {
            return;
        }

        // Find the evalSetFile path location in the data provider function
        Optional<LineRange> filePathRange = findEvalSetFilePathLocation(dataProviderFunc.get());
        if (filePathRange.isEmpty()) {
            return;
        }

        // Extract current file path from the source
        String currentFilePath = extractCurrentFilePath(textDocument, filePathRange.get());

        // If changed, add edit to update it
        if (!currentFilePath.equals(newEvalSetFile)) {
            edits.add(new TextEdit(Utils.toRange(filePathRange.get()), "\"" + newEvalSetFile + "\""));
        }
    }

    /**
     * Get the line range covering all annotations.
     *
     * @param annotations the list of annotation nodes
     * @return the line range covering all annotations, or null if empty
     */
    private LineRange getAnnotationsRange(NodeList<AnnotationNode> annotations) {
        return Utils.getAnnotationsRange(annotations);
    }

    /**
     * Extract the dataProvider field value from annotations.
     *
     * @param function the test function model
     * @return the data provider name, or null if not found
     */
    private String getDataProviderName(TestFunction function) {
        return Utils.getConfigFieldValue(function, "dataProvider");
    }

    /**
     * Find the data provider function by name in the module.
     *
     * @param modulePartNode   the module part node
     * @param dataProviderName the data provider function name
     * @return the function definition node, or empty if not found
     */
    private Optional<FunctionDefinitionNode> findDataProviderFunction(ModulePartNode modulePartNode,
                                                                      String dataProviderName) {
        return Utils.findFunctionByName(modulePartNode, dataProviderName);
    }

    /**
     * Find the location of the evalSetFile path in the data provider function.
     *
     * @param dataProviderFunc the data provider function
     * @return the line range of the file path string, or empty if not found
     */
    private Optional<LineRange> findEvalSetFilePathLocation(FunctionDefinitionNode dataProviderFunc) {
        FunctionBodyNode functionBody = dataProviderFunc.functionBody();

        if (functionBody instanceof FunctionBodyBlockNode blockBody) {
            return findFilePathInStatements(blockBody.statements());
        } else if (functionBody instanceof ExpressionFunctionBodyNode exprBody) {
            return findFilePathInExpression(exprBody.expression());
        }

        return Optional.empty();
    }

    /**
     * Find the file path location in statements.
     *
     * @param statements the list of statements
     * @return the line range of the file path string, or empty if not found
     */
    private Optional<LineRange> findFilePathInStatements(NodeList<StatementNode> statements) {
        return Utils.findLoadConversationThreadsArgumentInStatements(statements)
                .map(ExpressionNode::lineRange);
    }

    /**
     * Find the file path location in an expression.
     *
     * @param expression the expression node
     * @return the line range of the file path string, or empty if not found
     */
    private Optional<LineRange> findFilePathInExpression(ExpressionNode expression) {
        return Utils.findLoadConversationThreadsArgument(expression)
                .map(ExpressionNode::lineRange);
    }

    /**
     * Extract the current file path from the source at the given range.
     *
     * @param textDocument the text document
     * @param range        the line range of the file path
     * @return the file path without quotes
     */
    private String extractCurrentFilePath(TextDocument textDocument, LineRange range) {
        return Utils.extractTextFromRange(textDocument, range);
    }
}
