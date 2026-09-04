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

package io.ballerina.flowmodelgenerator.extension;

import com.google.gson.JsonArray;
import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.syntax.tree.ExpressionNode;
import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.compiler.syntax.tree.NodeParser;
import io.ballerina.flowmodelgenerator.core.TypesGenerator;
import io.ballerina.flowmodelgenerator.core.VisibleVariableTypesGenerator;
import io.ballerina.flowmodelgenerator.core.expressioneditor.Debouncer;
import io.ballerina.flowmodelgenerator.core.expressioneditor.DocumentContext;
import io.ballerina.flowmodelgenerator.core.expressioneditor.ExpressionEditorContext;
import io.ballerina.flowmodelgenerator.core.expressioneditor.semantictokens.SemanticTokenVisitor;
import io.ballerina.flowmodelgenerator.core.expressioneditor.services.CompletionRequest;
import io.ballerina.flowmodelgenerator.core.expressioneditor.services.DataMapperCompletionRequest;
import io.ballerina.flowmodelgenerator.core.expressioneditor.services.DiagnosticsRequest;
import io.ballerina.flowmodelgenerator.core.expressioneditor.services.SignatureHelpRequest;
import io.ballerina.flowmodelgenerator.core.model.Codedata;
import io.ballerina.flowmodelgenerator.extension.request.ExpressionEditorCompletionRequest;
import io.ballerina.flowmodelgenerator.extension.request.ExpressionEditorDiagnosticsRequest;
import io.ballerina.flowmodelgenerator.extension.request.ExpressionEditorSemanticTokensRequest;
import io.ballerina.flowmodelgenerator.extension.request.ExpressionEditorSignatureRequest;
import io.ballerina.flowmodelgenerator.extension.request.ExpressionEditorTypesRequest;
import io.ballerina.flowmodelgenerator.extension.request.FunctionCallTemplateRequest;
import io.ballerina.flowmodelgenerator.extension.request.ImportModuleRequest;
import io.ballerina.flowmodelgenerator.extension.request.VisibleVariableTypeRequest;
import io.ballerina.flowmodelgenerator.extension.response.FunctionCallTemplateResponse;
import io.ballerina.flowmodelgenerator.extension.response.ImportModuleResponse;
import io.ballerina.flowmodelgenerator.extension.response.VisibleVariableTypesResponse;
import io.ballerina.modelgenerator.commons.CommonUtils;
import io.ballerina.modelgenerator.commons.ImportPrefixReader;
import io.ballerina.modelgenerator.commons.ModuleInfo;
import io.ballerina.modelgenerator.commons.PackageUtil;
import io.ballerina.projects.Document;
import io.ballerina.tools.text.TextEdit;
import org.ballerinalang.annotation.JavaSPIService;
import org.ballerinalang.langserver.LSClientLogger;
import org.ballerinalang.langserver.commons.LanguageServerContext;
import org.ballerinalang.langserver.commons.service.spi.ExtendedLanguageServerService;
import org.ballerinalang.langserver.commons.workspace.WorkspaceManagerProxy;
import org.eclipse.lsp4j.CompletionItem;
import org.eclipse.lsp4j.CompletionList;
import org.eclipse.lsp4j.SemanticTokens;
import org.eclipse.lsp4j.SignatureHelp;
import org.eclipse.lsp4j.jsonrpc.messages.Either;
import org.eclipse.lsp4j.jsonrpc.services.JsonRequest;
import org.eclipse.lsp4j.jsonrpc.services.JsonSegment;
import org.eclipse.lsp4j.services.LanguageServer;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.CompletableFuture;

@JavaSPIService("org.ballerinalang.langserver.commons.service.spi.ExtendedLanguageServerService")
@JsonSegment("expressionEditor")
public class ExpressionEditorService implements ExtendedLanguageServerService {

    private WorkspaceManagerProxy workspaceManagerProxy;
    private LanguageServer langServer;
    private LSClientLogger lsClientLogger;

    @Override
    public void init(LanguageServer langServer, WorkspaceManagerProxy workspaceManagerProxy,
                     LanguageServerContext serverContext) {
        this.workspaceManagerProxy = workspaceManagerProxy;
        this.langServer = langServer;
        this.lsClientLogger = LSClientLogger.getInstance(serverContext);
    }

    @Override
    public Class<?> getRemoteInterface() {
        return null;
    }

    @JsonRequest
    public CompletableFuture<VisibleVariableTypesResponse> visibleVariableTypes(VisibleVariableTypeRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            VisibleVariableTypesResponse response = new VisibleVariableTypesResponse();
            try {
                Path filePath = Path.of(request.filePath());
                this.workspaceManagerProxy.get().loadProject(filePath);
                DocumentContext documentContext = new DocumentContext(workspaceManagerProxy, filePath);
                Optional<SemanticModel> semanticModel = documentContext.semanticModel();
                Document document = documentContext.document();
                if (semanticModel.isEmpty()) {
                    return response;
                }

                VisibleVariableTypesGenerator visibleVariableTypesGenerator = new VisibleVariableTypesGenerator(
                        semanticModel.get(), document, CommonUtils.getPosition(request.position(), document));
                JsonArray visibleVariableTypes = visibleVariableTypesGenerator.getVisibleVariableTypes();
                response.setCategories(visibleVariableTypes);
            } catch (Throwable e) {
                response.setError(e);
            }
            return response;
        });
    }

    @JsonRequest
    public CompletableFuture<Either<List<CompletionItem>, CompletionList>> types(ExpressionEditorTypesRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            try {
                Path filePath = Path.of(request.filePath());
                DocumentContext documentContext = new DocumentContext(workspaceManagerProxy, filePath);
                return TypesGenerator.getInstance()
                        .getTypes(documentContext, request.typeConstraint(), request.position());
            } catch (Throwable e) {
                return Either.forRight(new CompletionList());
            }
        });
    }

    @JsonRequest
    public CompletableFuture<SignatureHelp> signatureHelp(ExpressionEditorSignatureRequest request) {
        String fileUri = CommonUtils.getExprUri(request.filePath());
        return Debouncer.getInstance().debounce(new SignatureHelpRequest(
                new ExpressionEditorContext(
                        workspaceManagerProxy,
                        fileUri,
                        request.context(),
                        Path.of(request.filePath())
                ),
                request.signatureHelpContext(),
                langServer.getTextDocumentService()));
    }

    @JsonRequest
    public CompletableFuture<Either<List<CompletionItem>, CompletionList>> completion(
            ExpressionEditorCompletionRequest request) {
        String fileUri = CommonUtils.getExprUri(request.filePath());
        return Debouncer.getInstance().debounce(new CompletionRequest(
                new ExpressionEditorContext(
                        workspaceManagerProxy,
                        fileUri,
                        request.context(),
                        Path.of(request.filePath())
                ),
                request.completionContext(),
                langServer.getTextDocumentService()));
    }

    @JsonRequest
    public CompletableFuture<Either<List<CompletionItem>, CompletionList>> dataMapperCompletion(
            ExpressionEditorCompletionRequest request) {
        String fileUri = CommonUtils.getExprUri(request.filePath());
        return Debouncer.getInstance().debounce(new DataMapperCompletionRequest(
                new ExpressionEditorContext(
                        workspaceManagerProxy,
                        fileUri,
                        request.context(),
                        Path.of(request.filePath())
                ),
                request.completionContext(),
                langServer.getTextDocumentService()));
    }

    @JsonRequest
    public CompletableFuture<DiagnosticsRequest.Diagnostics> diagnostics(ExpressionEditorDiagnosticsRequest request) {
        String fileUri = CommonUtils.getExprUri(request.filePath());
        return Debouncer.getInstance().debounce(DiagnosticsRequest.from(
                new ExpressionEditorContext(
                        workspaceManagerProxy,
                        fileUri,
                        request.context(),
                        Path.of(request.filePath())
                )));
    }

    @JsonRequest
    public CompletableFuture<FunctionCallTemplateResponse> functionCallTemplate(FunctionCallTemplateRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            FunctionCallTemplateResponse response = new FunctionCallTemplateResponse();
            try {
                Codedata codedata = request.codedata();
                String template;
                switch (request.kind()) {
                    // A symbol of the current module needs no qualifier, and its codedata names no module.
                    case CURRENT -> template = codedata.symbol();
                    case IMPORTED -> {
                        // Already imported, so no import is written here and no prefix may be allocated: an
                        // allocated one would name a binding this file does not have.
                        String prefix = boundPrefix(request.filePath(), codedata, false);
                        response.setPrefix(prefix);
                        response.setModuleId(codedata.getModuleId());
                        template = prefix + ":" + codedata.symbol();
                    }
                    case AVAILABLE -> {
                        // applyModuleImport writes the import below, so a free prefix may be allocated for it.
                        String prefix = boundPrefix(request.filePath(), codedata, true);
                        template = prefix + ":" + codedata.symbol();
                        applyModuleImport(request.filePath(), codedata.getModuleId(), codedata.getImportSignature(),
                                prefix, response);
                    }
                    default -> {
                        response.setError(new IllegalArgumentException("Invalid kind: " + request.kind() +
                                ". Expected kinds are: CURRENT, IMPORTED, AVAILABLE."));
                        return response;
                    }
                }
                // TODO: Fix this after revamping the API
                if (request.searchKind() != null && request.searchKind().equals("TYPE")) {
                    response.setTemplate(template);
                } else {
                    response.setTemplate(template + "(${1})");
                }

            } catch (Exception e) {
                response.setError(e);
            }
            return response;
        });
    }

    @JsonRequest
    public CompletableFuture<ImportModuleResponse> importModule(ImportModuleRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            ImportModuleResponse response = new ImportModuleResponse();
            try {
                String importStatement = request.importStatement()
                        .replaceFirst("^import\\s+", "")
                        .replaceAll(";\\n?$", "");
                applyModuleImport(request.filePath(), importStatement, importStatement, response);
            } catch (Exception e) {
                response.setError(e);
            }
            return response;
        });
    }

    @JsonRequest
    public CompletableFuture<SemanticTokens> semanticTokens(ExpressionEditorSemanticTokensRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            try {
                // Get semantic model from workspace
                Path filePath = Path.of(request.filePath());
                this.workspaceManagerProxy.get().loadProject(filePath);
                Optional<SemanticModel> semanticModel = this.workspaceManagerProxy.get().semanticModel(filePath);

                // Get symbol names based on position
                Set<String> symbolNames = new HashSet<>();
                if (semanticModel.isPresent()) {
                    if (request.position() != null) {
                        // Position provided - get visible symbols at that position
                        Optional<Document> document = this.workspaceManagerProxy.get().document(filePath);
                        document.ifPresent(value -> semanticModel.get().visibleSymbols(value, request.position())
                                .forEach(symbol -> symbol.getName().ifPresent(symbolNames::add)));
                    } else {
                        // No position - get module-level symbols
                        semanticModel.get().moduleSymbols()
                                .forEach(symbol -> symbol.getName().ifPresent(symbolNames::add));
                    }
                }

                // Parse expression using NodeParser
                ExpressionNode expressionNode = NodeParser.parseExpression(request.expression());

                // Create visitor and generate tokens
                SemanticTokenVisitor visitor = new SemanticTokenVisitor(symbolNames);
                return visitor.getSemanticTokens(expressionNode);
            } catch (Throwable e) {
                // Return empty tokens on parse error
                return new SemanticTokens(new ArrayList<>());
            }
        });
    }

    private void applyModuleImport(String filePathString, String moduleId, String importStatement,
                                   ImportModuleResponse response) {
        applyModuleImport(filePathString, moduleId, importStatement, null, response);
    }

    /**
     * Adds the module's import and reports the prefix the inserted reference must use.
     *
     * @param prefix the prefix resolved against the target file, or null to keep the module's natural one. An
     *               {@code as} clause is written only where the two differ, so a module whose natural prefix is
     *               free is imported exactly as before
     */
    private void applyModuleImport(String filePathString, String moduleId, String importStatement, String prefix,
                                   ImportModuleResponse response) {
        String naturalPrefix = CommonUtils.getPackageName(importStatement);
        boolean aliased = prefix != null && !prefix.isBlank() && !prefix.equals(naturalPrefix);
        if (aliased) {
            importStatement = importStatement + " as " + prefix;
        }
        // Generate the module import and apply it
        String fileUri = CommonUtils.getExprUri(filePathString);
        Path filePath = Path.of(filePathString);
        ExpressionEditorContext expressionEditorContext = new ExpressionEditorContext(
                workspaceManagerProxy,
                fileUri,
                filePath,
                null);
        Optional<TextEdit> importTextEdit = expressionEditorContext.getImport(importStatement);
        importTextEdit.ifPresent(textEdit ->
                PackageUtil.pullModuleAndNotify(lsClientLogger, ModuleInfo.from(moduleId)));
        response.setPrefix(aliased ? prefix : naturalPrefix);
        response.setModuleId(moduleId);
    }

    /**
     * The prefix {@code filePath} binds the codedata's module to: the alias of an import it already has, otherwise a
     * prefix that does not collide with any the file already uses.
     *
     * <p>
     * The prefix the target file binds is what an inserted reference has to use, rather than the module name's last
     * segment: {@code ballerinax/github} and {@code ballerinax/trigger.github} both end in {@code github}, so the
     * derived prefix cannot tell them apart and the reference would name whichever the file already imports.
     * </p>
     */
    private String boundPrefix(String filePathString, Codedata codedata, boolean willWriteImport) {
        if (codedata.module() == null || codedata.module().isEmpty()) {
            // Codedata.getModulePrefix would dereference the very module missing here.
            return "";
        }
        try {
            Path filePath = Path.of(filePathString);
            PackageUtil.loadProject(this.workspaceManagerProxy.get(), filePath);
            Optional<Document> document = this.workspaceManagerProxy.get().document(filePath);
            ModulePartNode rootNode = document
                    .map(doc -> doc.syntaxTree().rootNode() instanceof ModulePartNode node ? node : null)
                    .orElse(null);
            // A null root falls back to the module's natural prefix, which is what this method promises without a
            // file to read. Allocating a free prefix is only right where the caller then writes the import that
            // binds it; without one, the file's own binding is the only answer that resolves.
            return willWriteImport
                    ? ImportPrefixReader.resolve(rootNode, codedata.org(), codedata.module(), null)
                    : ImportPrefixReader.boundPrefix(rootNode, codedata.org(), codedata.module());
        } catch (RuntimeException e) {
            // Without a file to read, the module's natural prefix is the only available answer.
            return codedata.getModulePrefix();
        }
    }
}
