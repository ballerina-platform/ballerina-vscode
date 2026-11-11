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
import org.ballerinalang.langserver.LSClientLogger;
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
import java.time.Duration;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.locks.Condition;
import java.util.concurrent.locks.Lock;
import java.util.concurrent.locks.ReentrantLock;

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
    private final ExprCopyLock exprCopyLock = new ExprCopyLock();
    private final LSClientLogger clientLogger;
    // Copy edits not applied yet, in arrival order and latest per document: the server syncs whole files.
    private final Map<String, QueuedEdit> pendingCopyEdits = new LinkedHashMap<>();
    // Per package root, the source package the copy matches once the queued edits are applied.
    private final Map<Path, WeakReference<Package>> pendingSync = new HashMap<>();

    // An expression copy is a second compilation of its project, so one idle this long with no form open is dropped.
    private static final Duration EXPR_COPY_IDLE_TIMEOUT = Duration.ofMinutes(10);

    public BallerinaWorkspaceManagerProxyImpl(LanguageServerContext serverContext) {
        this(serverContext, EXPR_COPY_IDLE_TIMEOUT);
    }

    BallerinaWorkspaceManagerProxyImpl(LanguageServerContext serverContext, Duration exprCopyIdleTimeout) {
        this.baseWorkspaceManager = new BallerinaWorkspaceManager(serverContext);
        this.clonedWorkspaceManager = new ClonedWorkspace(serverContext, this.baseWorkspaceManager,
                exprCopyIdleTimeout, exprCopyLock);
        this.clientLogger = LSClientLogger.getInstance(serverContext);
        this.aiWorkspaceManager = new AIWorkspace(serverContext);
    }

    @Override
    public Lock exprCopyLock() {
        return exprCopyLock;
    }

    @FunctionalInterface
    private interface CopyEdit {
        void run() throws WorkspaceDocumentException;
    }

    // A source edit only reaches a copy of its project; root is set for source edits that track sync.
    private record QueuedEdit(Path path, Path root, boolean needsCopy, CopyEdit edit) {
    }

    // Applies the source edits that waited for the copy whenever a holder takes or gives back the lock.
    private final class ExprCopyLock implements Lock {
        private final ReentrantLock lock = new ReentrantLock(true);

        @Override
        public void lock() {
            lock.lock();
            applyOrRelease();
        }

        @Override
        public void lockInterruptibly() throws InterruptedException {
            lock.lockInterruptibly();
            applyOrRelease();
        }

        @Override
        public boolean tryLock() {
            if (!lock.tryLock()) {
                return false;
            }
            applyOrRelease();
            return true;
        }

        @Override
        public boolean tryLock(long time, TimeUnit unit) throws InterruptedException {
            if (!lock.tryLock(time, unit)) {
                return false;
            }
            applyOrRelease();
            return true;
        }

        // A throw here comes before the caller's try, so its finally would never release the lock.
        private void applyOrRelease() {
            try {
                applyPendingCopyEdits();
            } catch (Throwable t) {
                lock.unlock();
                throw t;
            }
        }

        @Override
        public void unlock() {
            try {
                applyPendingCopyEdits();
            } finally {
                lock.unlock();
            }
            // An edit queued while this holder was applying the queue would otherwise wait for the next holder.
            while (lock.getHoldCount() == 0 && hasPendingCopyEdits() && lock.tryLock()) {
                try {
                    applyPendingCopyEdits();
                } finally {
                    lock.unlock();
                }
            }
        }

        @Override
        public Condition newCondition() {
            return lock.newCondition();
        }

        int getHoldCount() {
            return lock.getHoldCount();
        }
    }

    // A form request compiles the copy under the lock, so the reader thread queues the edit instead of waiting.
    private void queueCopyEdit(String uri, QueuedEdit edit) {
        synchronized (pendingCopyEdits) {
            pendingCopyEdits.remove(uri);
            pendingCopyEdits.put(uri, edit);
        }
        if (exprCopyLock.tryLock()) {
            exprCopyLock.unlock();
        }
    }

    // Called after the source took the edit: the copy stays in sync only if it was in sync just before.
    private void queueSourceEdit(String uri, Path path, boolean copySynced, CopyEdit edit) {
        Optional<Project> source = this.baseWorkspaceManager.project(path);
        Path root = source.map(Project::sourceRoot).orElse(null);
        synchronized (pendingCopyEdits) {
            if (root != null && copySynced) {
                pendingSync.put(root, new WeakReference<>(source.get().currentPackage()));
            } else if (root != null) {
                pendingSync.remove(root);
            }
        }
        queueCopyEdit(uri, new QueuedEdit(path, root, true, edit));
    }

    private boolean hasPendingCopyEdits() {
        synchronized (pendingCopyEdits) {
            return !pendingCopyEdits.isEmpty();
        }
    }

    private void applyPendingCopyEdits() {
        if (exprCopyLock.getHoldCount() != 1) {
            return;
        }
        List<QueuedEdit> edits;
        Map<Path, WeakReference<Package>> expectedSync;
        synchronized (pendingCopyEdits) {
            edits = List.copyOf(pendingCopyEdits.values());
            pendingCopyEdits.clear();
            expectedSync = Map.copyOf(pendingSync);
            pendingSync.clear();
        }
        Set<Path> failedRoots = new HashSet<>();
        for (QueuedEdit edit : edits) {
            try {
                if (!edit.needsCopy() || this.clonedWorkspaceManager.project(edit.path()).isPresent()) {
                    edit.edit().run();
                }
            } catch (WorkspaceDocumentException | RuntimeException e) {
                // Thrown inside lock() or unlock(), it would leave the lock held.
                this.clientLogger.logTrace("Updating the expression copy failed: " + e.getMessage());
                Optional.ofNullable(edit.root()).ifPresent(failedRoots::add);
            }
        }
        // A source change the copy never saw (a file changed on disk meanwhile) leaves a different package.
        expectedSync.forEach((root, expected) -> {
            Package current = this.baseWorkspaceManager.project(root).map(Project::currentPackage).orElse(null);
            if (current != null && current == expected.get() && !failedRoots.contains(root)) {
                this.clonedWorkspaceManager.markSynced(root, current);
            } else {
                this.clonedWorkspaceManager.markUnsynced(root);
            }
        });
    }

    void evictIdleExprCopies(long nowMillis) {
        this.clonedWorkspaceManager.evictIdle(nowMillis);
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
                Project sourceProject = source.get();
                queueCopyEdit(uri, new QueuedEdit(path.get(), null, false, () -> this.clonedWorkspaceManager
                        .openOrReuse(sourceProject, path.get(), params.getTextDocument().getText())));
            }
        } else if (this.isAIScheme(uri)) {
            this.aiWorkspaceManager.didOpen(path.get(), params);
        } else {
            boolean copyPresent = this.clonedWorkspaceManager.project(path.get()).isPresent();
            boolean copySynced = copyPresent && isCopySynced(path.get());
            this.baseWorkspaceManager.didOpen(path.get(), params);

            // Send didOpen if the project is already opened in the cloned workspace
            if (copyPresent) {
                queueSourceEdit(uri, path.get(), copySynced,
                        () -> this.clonedWorkspaceManager.didOpen(path.get(), params));
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
            queueCopyEdit(uri, new QueuedEdit(path.get(), null, false,
                    () -> this.clonedWorkspaceManager.didChange(path.get(), params)));
        } else if (this.isAIScheme(uri)) {
            this.aiWorkspaceManager.didChange(path.get(), params);
        } else {
            boolean copyPresent = this.clonedWorkspaceManager.project(path.get()).isPresent();
            boolean copySynced = copyPresent && isCopySynced(path.get());
            this.baseWorkspaceManager.didChange(path.get(), params);

            // Send didChange if the project is already opened in the cloned workspace
            if (copyPresent) {
                queueSourceEdit(uri, path.get(), copySynced,
                        () -> this.clonedWorkspaceManager.didChange(path.get(), params));
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
            queueCopyEdit(uri, new QueuedEdit(path.get(), null, false,
                    () -> this.clonedWorkspaceManager.didClose(path.get(), params)));
        } else if (this.isAIScheme(uri)) {
            this.aiWorkspaceManager.didClose(path.get(), params);
        } else {
            this.baseWorkspaceManager.didClose(path.get(), params);
            // A project the base evicted on its last close would otherwise live on in its clone.
            if (this.baseWorkspaceManager.project(path.get()).isEmpty()) {
                queueCopyEdit(uri, new QueuedEdit(path.get(), null, true,
                        () -> this.clonedWorkspaceManager.evict(path.get())));
            }
        }
    }

    private static class ClonedWorkspace extends BallerinaWorkspaceManager {
        private static final ScheduledExecutorService SWEEPER = Executors.newSingleThreadScheduledExecutor(runnable -> {
            Thread thread = new Thread(runnable, "expr-copy-sweeper");
            thread.setDaemon(true);
            return thread;
        });
        private final WorkspaceManager source;
        // The source package each cloned package last matched; a different instance means the source changed unseen.
        private final Map<Path, WeakReference<Package>> syncedWith = new ConcurrentHashMap<>();
        // Each copy under every package root it registered, so a copy is always removed whole.
        private final Map<Path, Copy> copies = new ConcurrentHashMap<>();
        // A count per file: a form can open another on the same file, such as the helper pane's new variable.
        private final Map<Path, Integer> openForms = new ConcurrentHashMap<>();
        private final long idleTimeoutMillis;
        private final Lock copyLock;

        public ClonedWorkspace(LanguageServerContext serverContext, WorkspaceManager source, Duration idleTimeout,
                               Lock copyLock) {
            super(serverContext);
            this.source = source;
            this.copyLock = copyLock;
            this.idleTimeoutMillis = idleTimeout == null ? Long.MAX_VALUE : idleTimeout.toMillis();
            if (idleTimeout == null) {
                return;
            }
            long period = Math.min(idleTimeoutMillis, Duration.ofMinutes(1).toMillis());
            // A weak reference, so the sweep never keeps a discarded workspace and its compilations alive.
            WeakReference<ClonedWorkspace> self = new WeakReference<>(this);
            AtomicReference<ScheduledFuture<?>> sweep = new AtomicReference<>();
            sweep.set(SWEEPER.scheduleWithFixedDelay(() -> {
                ClonedWorkspace workspace = self.get();
                if (workspace == null) {
                    sweep.get().cancel(false);
                    return;
                }
                workspace.evictIdle(System.currentTimeMillis());
            }, period, period, TimeUnit.MILLISECONDS));
        }

        private static final class Copy {
            private final Set<Path> roots = ConcurrentHashMap.newKeySet();
            private final AtomicLong lastUsed = new AtomicLong(System.currentTimeMillis());
        }

        // A clone mirrors the source workspace's loaded state, so it is copied from there rather than read from disk.
        @Override
        public Project loadProject(Path filePath) throws ProjectException, WorkspaceDocumentException,
                EventSyncException {
            if (source != null && project(filePath).isEmpty()) {
                copyLock.lock();
                try {
                    if (project(filePath).isEmpty()) {
                        open(source.loadProject(filePath));
                    }
                } finally {
                    copyLock.unlock();
                }
            }
            touch(filePath);
            return super.loadProject(filePath);
        }

        public void open(Project project) {
            BallerinaCompilerApi compilerApi = BallerinaCompilerApi.getInstance();
            // Read before duplicating: an edit landing in between then makes the copy newer, never falsely synced.
            Map<Path, Package> sourcePackages = new HashMap<>();
            members(project).forEach(member -> sourcePackages.put(member.sourceRoot(), member.currentPackage()));
            sourcePackages.keySet().forEach(this::removeCopy);
            Copy copy = new Copy();
            Optional<Project> workspaceProject = compilerApi.getWorkspaceProject(project);
            if (workspaceProject.isPresent()) {
                Project workspaceProjectDuplicate = workspaceProject.get().duplicate();
                List<Project> workspacePackages = compilerApi.getWorkspaceProjects(workspaceProjectDuplicate);
                for (Project workspacePackage : workspacePackages) {
                    Path packageRoot = workspacePackage.sourceRoot();
                    sourceRootToProject.put(packageRoot, ProjectContext.from(workspacePackage));
                    copy.roots.add(packageRoot);
                }
            } else {
                this.sourceRootToProject.put(project.sourceRoot(), ProjectContext.from(project.duplicate()));
                copy.roots.add(project.sourceRoot());
            }
            copy.roots.forEach(root -> copies.put(root, copy));
            sourcePackages.forEach(this::markSynced);
        }

        // Reuses the clone while it still matches the source, discarding a previous form's edits to the file.
        public void openOrReuse(Project sourceProject, Path filePath, String text) throws WorkspaceDocumentException {
            openForms.merge(filePath, 1, Integer::sum);
            if (!isSyncedWith(sourceProject) || crashed(filePath)) {
                open(sourceProject);
            }
            reset(filePath, text);
            touch(filePath);
        }

        // A copy whose compilation crashed returns no semantic model until it is rebuilt.
        private boolean crashed(Path filePath) {
            ProjectContext context = sourceRootToProject.get(projectRoot(filePath));
            return context != null && context.compilationCrashed();
        }

        // Drops idle copies with no open form; skips a round while a request holds the copy, so it never waits.
        void evictIdle(long nowMillis) {
            if (!copyLock.tryLock()) {
                return;
            }
            try {
                Set<Path> busyRoots = new HashSet<>();
                openForms.keySet().forEach(form ->
                        project(form).ifPresent(project -> busyRoots.add(project.sourceRoot())));
                new HashSet<>(copies.values()).stream()
                        .filter(copy -> nowMillis - copy.lastUsed.get() >= idleTimeoutMillis)
                        .filter(copy -> copy.roots.stream().noneMatch(busyRoots::contains))
                        .forEach(copy -> removeCopy(copy.roots.iterator().next()));
            } finally {
                copyLock.unlock();
            }
        }

        private void touch(Path filePath) {
            project(filePath).map(project -> copies.get(project.sourceRoot()))
                    .ifPresent(copy -> copy.lastUsed.set(System.currentTimeMillis()));
        }

        public void evict(Path filePath) {
            project(filePath).ifPresent(project -> removeCopy(project.sourceRoot()));
        }

        // A copied workspace registers every member package; removing one entry would keep the whole copy alive.
        private void removeCopy(Path root) {
            Copy copy = copies.get(root);
            for (Path copied : copy == null ? Set.of(root) : copy.roots) {
                sourceRootToProject.remove(copied);
                syncedWith.remove(copied);
                copies.remove(copied);
            }
        }

        void markSynced(Path root, Package sourcePackage) {
            syncedWith.put(root, new WeakReference<>(sourcePackage));
        }

        void markUnsynced(Path root) {
            syncedWith.remove(root);
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
            touch(filePath);
            if (openForms.computeIfPresent(filePath, (form, count) -> count > 1 ? count - 1 : null) != null) {
                return;
            }
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
            removeCopy(projectRoot);
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
            super(serverContext, null, null, new ReentrantLock());
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

    // A queued edit already moved the source on, so the copy counts as synced if the source is still where it left it.
    private boolean isCopySynced(Path path) {
        return this.baseWorkspaceManager.project(path).filter(project -> {
            WeakReference<Package> expected;
            synchronized (pendingCopyEdits) {
                expected = pendingSync.get(project.sourceRoot());
            }
            return expected != null ? expected.get() == project.currentPackage()
                    : this.clonedWorkspaceManager.isSyncedWith(project);
        }).isPresent();
    }

    private boolean isExprScheme(String uri) {
        return PathUtil.getEncodedURIPath(uri).getScheme().equals(CommonUtil.EXPR_SCHEME);
    }

    private boolean isAIScheme(String uri) {
        return PathUtil.getEncodedURIPath(uri).getScheme().equals(CommonUtil.AI_SCHEME);
    }
}
