/*
 * Copyright (c) 2021, WSO2 Inc. (http://wso2.com) All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package org.ballerinalang.langserver.workspace;

import io.ballerina.projects.BuildOptions;
import io.ballerina.projects.Document;
import io.ballerina.projects.Package;
import io.ballerina.projects.Project;
import io.ballerina.projects.ProjectException;
import org.ballerinalang.langserver.LSContextOperation;
import org.ballerinalang.langserver.common.utils.CommonUtil;
import org.ballerinalang.langserver.common.utils.PathUtil;
import org.ballerinalang.langserver.commons.BallerinaCompilerApi;
import org.ballerinalang.langserver.commons.LanguageServerContext;
import org.ballerinalang.langserver.commons.eventsync.exceptions.EventSyncException;
import org.ballerinalang.langserver.commons.workspace.WorkspaceDocumentException;
import org.ballerinalang.langserver.commons.workspace.WorkspaceManager;
import org.eclipse.lsp4j.DidChangeTextDocumentParams;
import org.eclipse.lsp4j.DidCloseTextDocumentParams;
import org.eclipse.lsp4j.DidOpenTextDocumentParams;
import org.eclipse.lsp4j.TextDocumentContentChangeEvent;
import org.eclipse.lsp4j.VersionedTextDocumentIdentifier;

import java.lang.ref.WeakReference;
import java.nio.file.Path;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Ballerina workspace manager proxy implementation.
 * This proxy maintains two workspace managers, one for the expr file scheme based documents and the default manager
 * for the file scheme based documents.
 *
 * @since 1.0.0
 */
public class BallerinaWorkspaceManagerProxyImpl implements BallerinaWorkspaceManagerProxy {
    private final WorkspaceManager baseWorkspaceManager;
    private final ClonedWorkspace clonedWorkspaceManager;
    private final AIWorkspace aiWorkspaceManager;

    public BallerinaWorkspaceManagerProxyImpl(LanguageServerContext serverContext) {
        this.baseWorkspaceManager = new BallerinaWorkspaceManager(serverContext);
        this.clonedWorkspaceManager = new ClonedWorkspace(serverContext, this.baseWorkspaceManager);
        this.aiWorkspaceManager = new AIWorkspace(serverContext);
    }
    
    @Override
    public WorkspaceManager get() {
        return this.baseWorkspaceManager;
    }

    @Override
    public WorkspaceManager get(String fileUri) {
        String scheme = PathUtil.getEncodedURIPath(fileUri).getScheme();
        if (scheme == null) {
            return this.baseWorkspaceManager;
        }
        if (scheme.equals(CommonUtil.AI_SCHEME)) {
            return this.aiWorkspaceManager;
        } else if (scheme.equals(CommonUtil.EXPR_SCHEME)) {
            return this.clonedWorkspaceManager;
        }
        return this.baseWorkspaceManager;
    }

    @Override
    public void didOpen(DidOpenTextDocumentParams params) throws WorkspaceDocumentException {
        String uri = params.getTextDocument().getUri();
        Optional<Path> path = PathUtil.getPathFromURI(uri);
        if (path.isEmpty()) {
            return;
        }
        if (this.isExprScheme(uri)) {
            Optional<Project> source;
            try {
                source = Optional.of(this.baseWorkspaceManager.loadProject(path.get()));
            } catch (EventSyncException e) {
                source = this.baseWorkspaceManager.project(path.get());
            }
            if (source.isPresent()) {
                this.clonedWorkspaceManager.openOrReuse(source.get(), path.get(), params.getTextDocument().getText());
            }
        } else if (this.isAIScheme(uri)) {
            this.aiWorkspaceManager.didOpen(path.get(), params);
        } else {
            Optional<Project> project = this.clonedWorkspaceManager.project(path.get());
            boolean cloneSynced = project.isPresent() && this.baseWorkspaceManager.project(path.get())
                    .filter(this.clonedWorkspaceManager::isSyncedWith).isPresent();
            this.baseWorkspaceManager.didOpen(path.get(), params);

            // Send didOpen if the project is already opened in the cloned workspace
            if (project.isPresent()) {
                this.clonedWorkspaceManager.didOpen(path.get(), params);
                if (cloneSynced) {
                    this.baseWorkspaceManager.project(path.get()).ifPresent(this.clonedWorkspaceManager::markSynced);
                }
            }
        }
    }

    @Override
    public void didChange(DidChangeTextDocumentParams params) throws WorkspaceDocumentException {
        String uri = params.getTextDocument().getUri();
        Optional<Path> path = PathUtil.getPathFromURI(uri);
        if (path.isEmpty()) {
            return;
        }
        if (this.isExprScheme(uri)) {
            this.clonedWorkspaceManager.didChange(path.get(), params);
        } else if (this.isAIScheme(uri)) {
            this.aiWorkspaceManager.didChange(path.get(), params);
        } else {
            Optional<Project> project = this.clonedWorkspaceManager.project(path.get());
            boolean cloneSynced = project.isPresent() && this.baseWorkspaceManager.project(path.get())
                    .filter(this.clonedWorkspaceManager::isSyncedWith).isPresent();
            this.baseWorkspaceManager.didChange(path.get(), params);

            // Send didChange if the project is already opened in the cloned workspace
            if (project.isPresent()) {
                this.clonedWorkspaceManager.didChange(path.get(), params);
                if (cloneSynced) {
                    this.baseWorkspaceManager.project(path.get()).ifPresent(this.clonedWorkspaceManager::markSynced);
                }
            }
        }
    }

    @Override
    public void didClose(DidCloseTextDocumentParams params) {
        String uri = params.getTextDocument().getUri();
        Optional<Path> path = PathUtil.getPathFromURI(uri);
        if (path.isEmpty()) {
            return;
        }
        if (this.isExprScheme(uri)) {
            this.clonedWorkspaceManager.didClose(path.get(), params);
        } else if (this.isAIScheme(uri)) {
            this.aiWorkspaceManager.didClose(path.get(), params);
        } else {
            this.baseWorkspaceManager.didClose(path.get(), params);
        }
    }

    private static class ClonedWorkspace extends BallerinaWorkspaceManager {
        private final WorkspaceManager source;
        // The source package each cloned package last matched; a different instance means the source changed unseen.
        private final Map<Path, WeakReference<Package>> syncedWith = new ConcurrentHashMap<>();

        public ClonedWorkspace(LanguageServerContext serverContext, WorkspaceManager source) {
            super(serverContext);
            this.source = source;
        }

        // A clone mirrors the source workspace's loaded state, so it is copied from there rather than read from disk.
        @Override
        public Project loadProject(Path filePath) throws ProjectException, WorkspaceDocumentException,
                EventSyncException {
            if (source != null && project(filePath).isEmpty()) {
                synchronized (this) {
                    if (project(filePath).isEmpty()) {
                        open(source.loadProject(filePath));
                    }
                }
            }
            return super.loadProject(filePath);
        }

        public void open(Project project) {
            BallerinaCompilerApi compilerApi = BallerinaCompilerApi.getInstance();
            Optional<Project> workspaceProject = compilerApi.getWorkspaceProject(project);
            if (workspaceProject.isPresent()) {
                Project workspaceProjectDuplicate = workspaceProject.get().duplicate();
                List<Project> workspacePackages = compilerApi.getWorkspaceProjects(workspaceProjectDuplicate);
                for (Project workspacePackage : workspacePackages) {
                    Path packageRoot = workspacePackage.sourceRoot();
                    sourceRootToProject.put(packageRoot, ProjectContext.from(workspacePackage));
                }
            } else {
                this.sourceRootToProject.put(project.sourceRoot(), ProjectContext.from(project.duplicate()));
            }
            markSynced(project);
        }

        // Reuses the clone while it still matches the source, discarding a previous form's edits to the file.
        public void openOrReuse(Project sourceProject, Path filePath, String text) throws WorkspaceDocumentException {
            if (isSyncedWith(sourceProject)) {
                reset(filePath, text);
                return;
            }
            open(sourceProject);
        }

        public void markSynced(Project sourceProject) {
            members(sourceProject).forEach(member ->
                    syncedWith.put(member.sourceRoot(), new WeakReference<>(member.currentPackage())));
        }

        private boolean isSyncedWith(Project sourceProject) {
            return members(sourceProject).stream().allMatch(member -> project(member.sourceRoot()).isPresent()
                    && Optional.ofNullable(syncedWith.get(member.sourceRoot())).map(WeakReference::get)
                    .orElse(null) == member.currentPackage());
        }

        private static List<Project> members(Project project) {
            BallerinaCompilerApi compilerApi = BallerinaCompilerApi.getInstance();
            return compilerApi.getWorkspaceProject(project).map(compilerApi::getWorkspaceProjects)
                    .orElse(List.of(project));
        }

        private void reset(Path filePath, String text) throws WorkspaceDocumentException {
            Optional<Document> document = document(filePath);
            if (document.isEmpty() || document.get().textDocument().toString().equals(text)) {
                return;
            }
            DidChangeTextDocumentParams params = new DidChangeTextDocumentParams(
                    new VersionedTextDocumentIdentifier(filePath.toUri().toString(), null),
                    List.of(new TextDocumentContentChangeEvent(text)));
            didChange(filePath, params);
        }

        @Override
        public void didClose(Path filePath, DidCloseTextDocumentParams params) {
            if (source != null) {
                Optional<Document> sourceDocument = source.document(filePath);
                if (sourceDocument.isPresent()) {
                    try {
                        reset(filePath, sourceDocument.get().textDocument().toString());
                        return;
                    } catch (WorkspaceDocumentException e) {
                        this.clientLogger.logTrace("Resetting the cloned document failed: " + e.getMessage());
                    }
                }
            }
            Optional<Project> project = project(filePath);
            if (project.isEmpty()) {
                return;
            }
            Path projectRoot = project.get().sourceRoot();
            sourceRootToProject.remove(projectRoot);
            this.clientLogger.logTrace("Operation '" + LSContextOperation.TXT_DID_CLOSE.getName() +
                    "' {project: '" + projectRoot.toUri().toString() +
                    "' kind: '" + project.get().kind().name().toLowerCase(Locale.getDefault()) +
                    "'} removed");
        }

        @Override
        public String uriScheme() {
            return CommonUtil.EXPR_SCHEME;
        }
    }

    private static class AIWorkspace extends ClonedWorkspace {

        public AIWorkspace(LanguageServerContext serverContext) {
            super(serverContext, null);
        }

        @Override
        public String uriScheme() {
            return CommonUtil.AI_SCHEME;
        }
    }

    /**
     * Sets the build options for both base and cloned workspace managers.
     *
     * @param buildOptions The build options to be set
     */
    public void setBuildOptions(BuildOptions buildOptions) {
        ((BallerinaWorkspaceManager) this.baseWorkspaceManager).setBuildOptions(buildOptions);
        this.clonedWorkspaceManager.setBuildOptions(buildOptions);
    }

    public void setEvictProjectOnLastClose(boolean enabled) {
        ((BallerinaWorkspaceManager) this.baseWorkspaceManager).setEvictProjectOnLastClose(enabled);
    }

    private boolean isExprScheme(String uri) {
        return PathUtil.getEncodedURIPath(uri).getScheme().equals(CommonUtil.EXPR_SCHEME);
    }

    private boolean isAIScheme(String uri) {
        return PathUtil.getEncodedURIPath(uri).getScheme().equals(CommonUtil.AI_SCHEME);
    }
}
