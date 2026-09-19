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

import io.ballerina.compiler.syntax.tree.IdentifierToken;
import io.ballerina.compiler.syntax.tree.ImportDeclarationNode;
import io.ballerina.compiler.syntax.tree.ImportOrgNameNode;
import io.ballerina.compiler.syntax.tree.ModuleMemberDeclarationNode;
import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.compiler.syntax.tree.Node;
import io.ballerina.compiler.syntax.tree.NodeList;
import io.ballerina.compiler.syntax.tree.NodeVisitor;
import io.ballerina.compiler.syntax.tree.QualifiedNameReferenceNode;
import io.ballerina.compiler.syntax.tree.SeparatedNodeList;
import io.ballerina.flowmodelgenerator.extension.request.CreateFilesRequest;
import io.ballerina.flowmodelgenerator.extension.response.CommonSourceResponse;
import io.ballerina.flowmodelgenerator.extension.response.ICPEnabledResponse;
import io.ballerina.projects.Document;
import io.ballerina.projects.DocumentId;
import io.ballerina.projects.Module;
import io.ballerina.projects.Package;
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
 * Service for enabling the workflow management REST API of an integration. Enabling adds
 * {@code import ballerina/workflow.management.rest as _;} to {@code main.bal} — the module whose
 * import brings the API's listener into the program; its port, TLS and CORS settings are
 * {@code Config.toml} entries the configuration editor owns, so nothing else is written here.
 *
 * <p>Before 0.9.0 the API lived in {@code ballerina/workflow.management}, and this checkbox added
 * that import. That module is now the management library, so an import of it no longer means the
 * API is on: it does not count as enabled, and the unused form the old checkbox wrote
 * ({@code as _}) is cleaned up when the API is disabled. An import of it that a program uses is
 * left alone.
 *
 * <p>Disabling removes the REST import under any prefix, but only where the file does not name the
 * module through it: an import a program refers to stays, since deleting it would leave those
 * references unresolved.
 *
 * @since 1.0.0
 */
@JavaSPIService("org.ballerinalang.langserver.commons.service.spi.ExtendedLanguageServerService")
@JsonSegment("workflowManagementService")
public class WorkflowManagementService implements ExtendedLanguageServerService {

    private static final String BALLERINA = "ballerina";
    private static final String MODULE_NAME = "workflow.management.rest";
    /** Where the API lived before 0.9.0; see the class comment for how such an import is treated. */
    private static final String LEGACY_MODULE_NAME = "workflow.management";
    private static final String UNUSED_PREFIX = "_";
    private static final String IMPORT_STMT = "import ballerina/workflow.management.rest as _;%n";
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
                // The import goes into main.bal, created when the project has none. Note that
                // workspaceManager.document() throws for a non-existent path (it cannot resolve
                // the package root), so existence is checked with Files.exists() first.
                Path targetPath = project.sourceRoot().resolve(MAIN_BAL);
                String targetFileName = MAIN_BAL;
                boolean targetExists = Files.exists(targetPath);

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
                        if (validOrg(importNode)
                                && (removableRestImport(importNode, root) || unusedLegacyImport(importNode))) {
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

    private static boolean validOrg(ImportDeclarationNode importNode) {
        Optional<ImportOrgNameNode> importOrgNameNode = importNode.orgName();
        return importOrgNameNode.isPresent() && importOrgNameNode.get().orgName().text().trim().equals(BALLERINA);
    }

    // The REST import counts whether or not it uses the `_` prefix: importing the module is what
    // brings the listener in, and a program may well refer to its configurables by name.
    private static boolean validModuleName(ImportDeclarationNode importNode) {
        return moduleName(importNode).equals(MODULE_NAME);
    }

    // The REST import in a form removing it cannot break the file. `validModuleName` counts the
    // import as enabled under any prefix, but disable is not free to delete one the file uses: an
    // `as _` import cannot be referred to at all, while any other prefix goes only when nothing in
    // the file names it — deleting that one would leave its references unresolved.
    private static boolean removableRestImport(ImportDeclarationNode importNode, ModulePartNode root) {
        return validModuleName(importNode) && !isPrefixReferenced(root, importPrefix(importNode));
    }

    // The import the checkbox wrote before 0.9.0, in the form it wrote it — unused, so removing it
    // on disable cannot break anything. The same module imported for use stays.
    private static boolean unusedLegacyImport(ImportDeclarationNode importNode) {
        return moduleName(importNode).equals(LEGACY_MODULE_NAME)
                && UNUSED_PREFIX.equals(importPrefix(importNode));
    }

    // The prefix the file refers to the module by: the stated one, or the last segment of the module
    // name when the import states none.
    private static String importPrefix(ImportDeclarationNode importNode) {
        if (importNode.prefix().isPresent()) {
            return importNode.prefix().get().prefix().text().trim();
        }
        List<String> segments = importNode.moduleName().stream().map(Node::toSourceCode)
                .map(String::trim).toList();
        return segments.get(segments.size() - 1);
    }

    // Whether anything in the file names the module through this prefix. The `_` prefix names
    // nothing by definition, so an import that carries it is always unreferenced.
    private static boolean isPrefixReferenced(ModulePartNode root, String prefix) {
        if (UNUSED_PREFIX.equals(prefix)) {
            return false;
        }
        PrefixReferenceFinder finder = new PrefixReferenceFinder(prefix);
        for (ModuleMemberDeclarationNode member : root.members()) {
            member.accept(finder);
            if (finder.found()) {
                return true;
            }
        }
        return false;
    }

    /** Finds the first qualified reference through a given import prefix. */
    private static final class PrefixReferenceFinder extends NodeVisitor {

        private final String prefix;
        private boolean found;

        private PrefixReferenceFinder(String prefix) {
            this.prefix = prefix;
        }

        private boolean found() {
            return found;
        }

        @Override
        public void visit(QualifiedNameReferenceNode node) {
            found = found || prefix.equals(node.modulePrefix().text().trim());
        }
    }

    private static String moduleName(ImportDeclarationNode importNode) {
        SeparatedNodeList<IdentifierToken> identifierTokens = importNode.moduleName();
        return identifierTokens.stream().map(Node::toSourceCode).map(String::trim)
                .collect(Collectors.joining("."));
    }

    @Override
    public Class<?> getRemoteInterface() {
        return null;
    }
}
