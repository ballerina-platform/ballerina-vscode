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

package io.ballerina.flowmodelgenerator.extension;

import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.api.symbols.Symbol;
import io.ballerina.compiler.syntax.tree.IdentifierToken;
import io.ballerina.compiler.syntax.tree.ImportDeclarationNode;
import io.ballerina.compiler.syntax.tree.ImportOrgNameNode;
import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.compiler.syntax.tree.Node;
import io.ballerina.compiler.syntax.tree.NodeList;
import io.ballerina.compiler.syntax.tree.SeparatedNodeList;
import io.ballerina.flowmodelgenerator.core.utils.WorkflowUtil;
import io.ballerina.flowmodelgenerator.extension.request.CreateFilesRequest;
import io.ballerina.flowmodelgenerator.extension.response.CommonSourceResponse;
import io.ballerina.flowmodelgenerator.extension.response.ICPEnabledResponse;
import io.ballerina.projects.Document;
import io.ballerina.projects.DocumentId;
import io.ballerina.projects.Module;
import io.ballerina.projects.Package;
import io.ballerina.projects.PackageCompilation;
import io.ballerina.projects.Project;
import io.ballerina.tools.text.LinePosition;
import io.ballerina.tools.text.LineRange;
import org.ballerinalang.annotation.JavaSPIService;
import org.ballerinalang.langserver.common.utils.PositionUtil;
import org.ballerinalang.langserver.commons.service.spi.ExtendedLanguageServerService;
import org.ballerinalang.langserver.commons.workspace.WorkspaceManager;
import org.eclipse.lsp4j.TextEdit;
import org.eclipse.lsp4j.jsonrpc.services.JsonRequest;
import org.eclipse.lsp4j.jsonrpc.services.JsonSegment;
import org.eclipse.lsp4j.services.LanguageServer;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.stream.Collectors;

/**
 * Service for enabling workflow management for an integration. Enabling adds the
 * {@code import ballerina/workflow.management as _;} import to the default module so the
 * workflow management runtime is engaged. Mirrors {@link ICPEnablerService} but is import-only
 * (no Ballerina.toml build options).
 *
 * @since 1.0.0
 */
@JavaSPIService("org.ballerinalang.langserver.commons.service.spi.ExtendedLanguageServerService")
@JsonSegment("workflowManagementService")
public class WorkflowManagementService implements ExtendedLanguageServerService {

    private static final String BALLERINA = "ballerina";
    private static final String MODULE_NAME = "workflow.management";
    private static final String IMPORT_STMT = "import ballerina/workflow.management as _;%n";
    private static final String FUNCTIONS_BAL = "functions.bal";
    private static final String MAIN_BAL = "main.bal";

    private WorkspaceManager workspaceManager;

    @Override
    public void init(LanguageServer langServer, WorkspaceManager workspaceManager) {
        this.workspaceManager = workspaceManager;
    }

    @JsonRequest
    public CompletableFuture<ICPEnabledResponse> isWorkflowManagementEnabled(CreateFilesRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            ICPEnabledResponse response = new ICPEnabledResponse();
            try {
                Project project = this.workspaceManager.loadProject(Path.of(request.projectPath()));
                response.setEnabled(hasManagementImport(project.currentPackage()));
            } catch (Throwable e) {
                response.setError(e);
            }
            return response;
        });
    }

    /**
     * Determines whether workflow management should be enabled automatically (e.g. when ICP is
     * being enabled). Returns {@code true} only when management is not already enabled, ICP is
     * enabled, and the integration contains at least one {@code @workflow:Workflow} function. This
     * keys off the presence of workflow functions, not workflow imports, so it stays {@code false}
     * for integrations that merely import the workflow module without defining a workflow.
     */
    @JsonRequest
    public CompletableFuture<ICPEnabledResponse> shouldEnableWorkflowManagementByDefault(CreateFilesRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            ICPEnabledResponse response = new ICPEnabledResponse();
            try {
                Project project = this.workspaceManager.loadProject(Path.of(request.projectPath()));
                Package pkg = project.currentPackage();
                // Use the control-plane import (not the full isIcpEnabled) as the ICP signal: this
                // runs during ICP enablement, right after the import is added via a text edit but
                // before the Ballerina.toml remoteManagement write is reflected in the loaded
                // project, so an isIcpEnabled() toml check would spuriously fail here.
                boolean shouldEnable = !hasManagementImport(pkg)
                        && ICPEnablerService.hasControlPlaneImport(pkg)
                        && hasWorkflowFunction(pkg);
                response.setEnabled(shouldEnable);
            } catch (Throwable e) {
                response.setError(e);
            }
            return response;
        });
    }

    @JsonRequest
    public CompletableFuture<CommonSourceResponse> addWorkflowManagement(CreateFilesRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            CommonSourceResponse response = new CommonSourceResponse();
            Map<String, List<TextEdit>> textEdits = new HashMap<>();
            response.setTextEdits(textEdits);
            try {
                Project project = this.workspaceManager.loadProject(Path.of(request.projectPath()));
                if (hasManagementImport(project.currentPackage())) {
                    return response;
                }
                // Prefer functions.bal, fall back to main.bal, otherwise create functions.bal.
                // Note: workspaceManager.document() throws for a non-existent path (it cannot
                // resolve the package root), so existence is checked with Files.exists() first.
                Path sourceRoot = project.sourceRoot();
                Path functionsPath = sourceRoot.resolve(FUNCTIONS_BAL);
                Path mainPath = sourceRoot.resolve(MAIN_BAL);

                Path targetPath;
                String targetFileName;
                boolean targetExists;
                if (Files.exists(functionsPath)) {
                    targetPath = functionsPath;
                    targetFileName = FUNCTIONS_BAL;
                    targetExists = true;
                } else if (Files.exists(mainPath)) {
                    targetPath = mainPath;
                    targetFileName = MAIN_BAL;
                    targetExists = true;
                } else {
                    targetPath = functionsPath;
                    targetFileName = FUNCTIONS_BAL;
                    targetExists = false;
                }

                Optional<Document> targetDoc = targetExists ? workspaceManager.document(targetPath) : Optional.empty();
                TextEdit edit;
                if (targetDoc.isPresent()) {
                    Node node = targetDoc.get().syntaxTree().rootNode();
                    edit = new TextEdit(PositionUtil.toRange(node.lineRange().startLine()), IMPORT_STMT.formatted());
                } else {
                    edit = new TextEdit(PositionUtil.toRange(LineRange.from(targetFileName,
                            LinePosition.from(0, 0), LinePosition.from(0, 0))), IMPORT_STMT.formatted());
                }
                textEdits.put(targetPath.toString(), List.of(edit));
            } catch (Throwable e) {
                response.setError(e);
            }
            return response;
        });
    }

    @JsonRequest
    public CompletableFuture<CommonSourceResponse> disableWorkflowManagement(CreateFilesRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            CommonSourceResponse response = new CommonSourceResponse();
            Map<String, List<TextEdit>> textEdits = new HashMap<>();
            response.setTextEdits(textEdits);
            try {
                Project project = this.workspaceManager.loadProject(Path.of(request.projectPath()));
                Package pkg = project.currentPackage();
                Module defaultModule = pkg.getDefaultModule();
                for (DocumentId documentId : defaultModule.documentIds()) {
                    Document document = defaultModule.document(documentId);
                    ModulePartNode root = document.syntaxTree().rootNode();
                    for (ImportDeclarationNode importNode : root.imports()) {
                        if (validOrg(importNode) && validModuleName(importNode)) {
                            Path path = project.sourceRoot().resolve(importNode.lineRange().fileName());
                            textEdits.computeIfAbsent(path.toString(), key -> new ArrayList<>()).add(new TextEdit(
                                    PositionUtil.toRange(importNode.location().lineRange()), ""));
                        }
                    }
                }
            } catch (Throwable e) {
                response.setError(e);
            }
            return response;
        });
    }

    private static boolean hasManagementImport(Package pkg) {
        Module defaultModule = pkg.getDefaultModule();
        Collection<DocumentId> documentIds = defaultModule.documentIds();
        for (DocumentId documentId : documentIds) {
            Document document = defaultModule.document(documentId);
            ModulePartNode root = document.syntaxTree().rootNode();
            NodeList<ImportDeclarationNode> imports = root.imports();
            for (ImportDeclarationNode importNode : imports) {
                if (validOrg(importNode) && validModuleName(importNode)) {
                    return true;
                }
            }
        }
        return false;
    }

    private static boolean hasWorkflowFunction(Package pkg) {
        PackageCompilation compilation = pkg.getCompilation();
        for (Module module : pkg.modules()) {
            SemanticModel semanticModel = compilation.getSemanticModel(module.moduleId());
            for (Symbol symbol : semanticModel.moduleSymbols()) {
                if (WorkflowUtil.isWorkflowFunction(symbol)) {
                    return true;
                }
            }
        }
        return false;
    }

    private static boolean validOrg(ImportDeclarationNode importNode) {
        Optional<ImportOrgNameNode> importOrgNameNode = importNode.orgName();
        return importOrgNameNode.isPresent() && importOrgNameNode.get().orgName().text().trim().equals(BALLERINA);
    }

    private static boolean validModuleName(ImportDeclarationNode importNode) {
        SeparatedNodeList<IdentifierToken> identifierTokens = importNode.moduleName();
        return identifierTokens.stream().map(Node::toSourceCode).map(String::trim)
                .collect(Collectors.joining(".")).equals(MODULE_NAME);
    }

    // Note: the management import is accepted whether or not it uses the `_` prefix
    // (`import ballerina/workflow.management;` or `... as _;`), so the prefix is intentionally
    // not validated when detecting or removing the import.

    @Override
    public Class<?> getRemoteInterface() {
        return null;
    }
}
