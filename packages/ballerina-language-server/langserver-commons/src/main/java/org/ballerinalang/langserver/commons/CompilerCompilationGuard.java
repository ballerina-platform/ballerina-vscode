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

package org.ballerinalang.langserver.commons;

import io.ballerina.projects.CompilationOptions;
import io.ballerina.projects.Package;
import io.ballerina.projects.PackageCompilation;
import io.ballerina.projects.PackageResolution;
import org.eclipse.lsp4j.jsonrpc.CancelChecker;

import java.nio.file.Path;
import java.util.concurrent.CancellationException;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.locks.ReentrantLock;

import javax.annotation.Nonnull;

/**
 * Serializes direct compiler package compilation requests that can initialize shared compiler-plugin state,
 * one lock per project source root, <em>but only on the new workspace-engine compilation pipeline</em>.
 *
 * <p><b>Coverage is not universal.</b> This guard is invoked only from the new workspace engine's
 * compilation path ({@code CompilationActionImpl}, {@code WorkspaceManagerFacadeImpl},
 * {@code WorkspaceRunService}). Legacy call sites that still invoke {@link Package#getCompilation()}
 * directly &mdash; notably {@code BallerinaWorkspaceManager}, {@code PullModuleExecutor},
 * {@code LSPackageLoader}, {@code DiagnosticsHelper}, {@code RenameUtil}, and the flow/service
 * model generators &mdash; bypass this guard and are therefore not serialized against the race it
 * was introduced to prevent. Routing those remaining call sites through the guard is tracked as a
 * follow-up; see
 * {@code packages/ballerina-language-server/tasks/04-compilation-guard-not-universal.md}.
 *
 * <p>Compiler-plugin caches (e.g. the {@code ballerina/http} user-data cache) are scoped to the
 * {@code Project}'s own environment, so two different projects compiling concurrently cannot race on
 * the same cache; only concurrent compiles of the same project can. Keying the lock by source root
 * also serializes a project against its own {@code duplicate()} (used for isolated diagnostics/model
 * reads elsewhere), which is a deliberately conservative choice since there is no verified evidence
 * that {@code duplicate()} is actually safe to run fully in parallel with its origin project.
 *
 * <p>Lock entries are evicted when a project is closed/evicted from the workspace engine (event
 * {@code WORKSPACE_PROJECT_EVICTED}, WM-E2) via {@link #evictProjectLock(Path)}, so the static lock
 * map does not retain entries for projects that are no longer open and does not grow unbounded over
 * a long language-server session.
 *
 * @since 1.7.0
 */
public final class CompilerCompilationGuard {
    private static final ConcurrentHashMap<Path, ReentrantLock> PROJECT_LOCKS = new ConcurrentHashMap<>();

    private CompilerCompilationGuard() {
    }

    /**
     * Returns the package compilation under the shared compiler compilation guard.
     *
     * @param ballerinaPackage package to compile
     * @return guarded package compilation
     */
    public static @Nonnull PackageCompilation getCompilation(@Nonnull Package ballerinaPackage) {
        return getCompilation(ballerinaPackage, null);
    }

    /**
     * Returns the package compilation under the shared compiler compilation guard.
     *
     * @param ballerinaPackage package to compile
     * @param cancelChecker cancellation checker for request-scoped callers
     * @return guarded package compilation
     */
    public static @Nonnull PackageCompilation getCompilation(@Nonnull Package ballerinaPackage,
                                                             CancelChecker cancelChecker) {
        checkCancellation(cancelChecker);
        ReentrantLock projectLock = projectLock(ballerinaPackage);
        lock(projectLock);
        try {
            checkCancellation(cancelChecker);
            PackageCompilation compilation = ballerinaPackage.getCompilation();
            checkCancellation(cancelChecker);
            return compilation;
        } finally {
            projectLock.unlock();
        }
    }

    /**
     * Returns the package resolution under the shared compiler compilation guard.
     *
     * <p>Resolution and compilation of the same package both drive the compiler's dependency
     * resolution machinery, so a caller resolving a package outside of {@link #getCompilation}
     * must still take this guard to avoid racing a concurrent guarded (or unguarded) compile of
     * the same project.
     *
     * @param ballerinaPackage package to resolve
     * @param compilationOptions options controlling the resolution
     * @return guarded package resolution
     */
    public static @Nonnull PackageResolution getResolution(@Nonnull Package ballerinaPackage,
                                                           @Nonnull CompilationOptions compilationOptions) {
        return getResolution(ballerinaPackage, compilationOptions, null);
    }

    /**
     * Returns the package resolution under the shared compiler compilation guard.
     *
     * @param ballerinaPackage package to resolve
     * @param compilationOptions options controlling the resolution
     * @param cancelChecker cancellation checker for request-scoped callers
     * @return guarded package resolution
     */
    public static @Nonnull PackageResolution getResolution(@Nonnull Package ballerinaPackage,
                                                           @Nonnull CompilationOptions compilationOptions,
                                                           CancelChecker cancelChecker) {
        checkCancellation(cancelChecker);
        ReentrantLock projectLock = projectLock(ballerinaPackage);
        lock(projectLock);
        try {
            checkCancellation(cancelChecker);
            PackageResolution resolution = ballerinaPackage.getResolution(compilationOptions);
            checkCancellation(cancelChecker);
            return resolution;
        } finally {
            projectLock.unlock();
        }
    }

    /**
     * Evicts the per-project compilation lock for the given source root.
     *
     * <p>Called from the workspace engine's project-eviction path (WM-E2,
     * {@code WORKSPACE_PROJECT_EVICTED}) via {@code CompilationServiceImpl}, so the static lock map
     * does not retain entries for closed/evicted projects. The eviction is performed even when no
     * compilation pipeline was ever created for the project, since the guard may have been used
     * directly (e.g. via {@code WorkspaceRunService} or {@code WorkspaceManagerFacadeImpl}) without
     * a pipeline being registered.
     *
     * <p>Safe to call when no lock entry exists for the given root (no-op). The path is normalized
     * the same way as in {@link #getCompilation}, so callers may pass either a raw or an already
     * normalized source root.
     *
     * @param sourceRoot the source root of the evicted project; normalized internally
     */
    public static void evictProjectLock(@Nonnull Path sourceRoot) {
        PROJECT_LOCKS.remove(normalizeSourceRoot(sourceRoot));
    }

    private static ReentrantLock projectLock(Package ballerinaPackage) {
        Path sourceRoot = normalizeSourceRoot(ballerinaPackage.project().sourceRoot());
        return PROJECT_LOCKS.computeIfAbsent(sourceRoot, root -> new ReentrantLock());
    }

    private static Path normalizeSourceRoot(Path sourceRoot) {
        return sourceRoot.toAbsolutePath().normalize();
    }

    private static void lock(ReentrantLock lock) {
        try {
            lock.lockInterruptibly();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new CancellationException("Package compilation cancelled while waiting for compiler guard");
        }
    }

    private static void checkCancellation(CancelChecker cancelChecker) {
        if (cancelChecker != null) {
            cancelChecker.checkCanceled();
        }
        if (Thread.currentThread().isInterrupted()) {
            throw new CancellationException("Package compilation cancelled");
        }
    }

    // ---- Test seams (package-private) ----

    /**
     * Returns the lock for the given source root, creating it if absent. Test-only seam that allows
     * populating the lock map without constructing a {@link Package}.
     */
    static ReentrantLock lockForTesting(@Nonnull Path sourceRoot) {
        return PROJECT_LOCKS.computeIfAbsent(normalizeSourceRoot(sourceRoot), root -> new ReentrantLock());
    }

    /**
     * Returns the number of entries currently held in the static lock map. Test-only seam.
     */
    static int lockMapSizeForTesting() {
        return PROJECT_LOCKS.size();
    }

    /**
     * Removes every entry from the static lock map. Test-only seam to isolate tests that share the
     * process-wide {@code PROJECT_LOCKS}.
     */
    static void clearLocksForTesting() {
        PROJECT_LOCKS.clear();
    }
}
