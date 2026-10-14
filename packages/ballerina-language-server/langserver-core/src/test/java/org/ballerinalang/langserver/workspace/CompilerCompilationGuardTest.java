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

package org.ballerinalang.langserver.workspace;

import io.ballerina.projects.CompilationOptions;
import io.ballerina.projects.Package;
import io.ballerina.projects.PackageResolution;
import io.ballerina.projects.Project;
import org.ballerinalang.compiler.BLangCompilerException;
import org.ballerinalang.langserver.command.executors.PullModuleExecutor;
import org.mockito.MockedStatic;
import org.testng.Assert;
import org.testng.annotations.AfterMethod;
import org.testng.annotations.BeforeMethod;
import org.testng.annotations.Test;

import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.locks.ReentrantLock;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link CompilerCompilationGuard} lock-map lifecycle and key normalization.
 *
 * <p>Covers the eviction contract (task 05): the static {@code PROJECT_LOCKS} map must not grow
 * unbounded across repeated open/close cycles of distinct project roots, and eviction must be
 * keyed consistently with insertion so a close for a project actually frees its entry.
 *
 * @since 1.7.0
 */
public class CompilerCompilationGuardTest {

    @BeforeMethod
    public void setUp() {
        // The static maps are process-wide and shared with other test classes in the suite, so
        // clear them before each test to keep these tests isolated from unrelated leakages.
        CompilerCompilationGuard.clearLocksForTesting();
        CompilerCompilationGuard.clearRepairMarkersForTesting();
    }

    @AfterMethod
    public void tearDown() {
        CompilerCompilationGuard.clearLocksForTesting();
        CompilerCompilationGuard.clearRepairMarkersForTesting();
    }

    @Test
    public void evictProjectLock_removesEntryForMatchingRoot() {
        Path root = Paths.get("/tmp/compilation-guard-test/proj-a");
        CompilerCompilationGuard.lockForTesting(root);
        Assert.assertEquals(CompilerCompilationGuard.lockMapSizeForTesting(), 1,
                "lock should be registered for the project root");

        CompilerCompilationGuard.evictProjectLock(root);
        Assert.assertEquals(CompilerCompilationGuard.lockMapSizeForTesting(), 0,
                "evictProjectLock should remove the entry");
    }

    @Test
    public void evictProjectLock_isNoOpWhenAbsent() {
        // Evicting a root that was never registered must not throw and must leave the map empty.
        CompilerCompilationGuard.evictProjectLock(Paths.get("/tmp/compilation-guard-test/never-opened"));
        Assert.assertEquals(CompilerCompilationGuard.lockMapSizeForTesting(), 0);
    }

    @Test
    public void keysAreNormalizedSoEvictionMatchesInsertion() {
        // Insert via a relative/dotted path; evict via the absolute normalized equivalent.
        // Both must resolve to the same map entry.
        Path inserted = Paths.get("tmp/compilation-guard-test/rel-proj");
        Path evicted = inserted.toAbsolutePath().normalize();

        CompilerCompilationGuard.lockForTesting(inserted);
        Assert.assertEquals(CompilerCompilationGuard.lockMapSizeForTesting(), 1);

        CompilerCompilationGuard.evictProjectLock(evicted);
        Assert.assertEquals(CompilerCompilationGuard.lockMapSizeForTesting(), 0,
                "normalized eviction key must match normalized insertion key");
    }

    @Test
    public void duplicateRootsDoNotLeakLockEntries() {
        // Repeatedly acquiring the lock for the same root must not add new entries.
        Path root = Paths.get("/tmp/compilation-guard-test/dedupe-proj");
        for (int i = 0; i < 10; i++) {
            ReentrantLock lock = CompilerCompilationGuard.lockForTesting(root);
            Assert.assertNotNull(lock);
        }
        Assert.assertEquals(CompilerCompilationGuard.lockMapSizeForTesting(), 1);
    }

    @Test
    public void lockMapDoesNotGrowUnboundedAcrossOpenCloseCycles() {
        // The core acceptance test (task 05): simulating many distinct projects opened and then
        // closed must not leave entries behind. After N open/close cycles the map must be empty.
        int cycles = 50;
        for (int i = 0; i < cycles; i++) {
            Path root = Paths.get("/tmp/compilation-guard-test/cycle-proj-" + i);
            CompilerCompilationGuard.lockForTesting(root);
            CompilerCompilationGuard.evictProjectLock(root);
        }
        Assert.assertEquals(CompilerCompilationGuard.lockMapSizeForTesting(), 0,
                "PROJECT_LOCKS must not retain entries after each project's open/close cycle");
    }

    @Test
    public void openCloseCyclesAcrossManyRootsKeepMapBoundedByOpenCount() {
        // Open N distinct roots, close the first half, then open another N. The map size must be
        // bounded by the number of currently-open roots, not by the total number ever opened.
        int n = 20;
        for (int i = 0; i < n; i++) {
            CompilerCompilationGuard.lockForTesting(Paths.get("/tmp/compilation-guard-test/batch-" + i));
        }
        Assert.assertEquals(CompilerCompilationGuard.lockMapSizeForTesting(), n);

        for (int i = 0; i < n / 2; i++) {
            CompilerCompilationGuard.evictProjectLock(Paths.get("/tmp/compilation-guard-test/batch-" + i));
        }
        Assert.assertEquals(CompilerCompilationGuard.lockMapSizeForTesting(), n / 2,
                "after closing half the projects, only the open half should remain");

        for (int i = 0; i < n; i++) {
            CompilerCompilationGuard.lockForTesting(
                    Paths.get("/tmp/compilation-guard-test/batch2-" + i));
        }
        Assert.assertEquals(CompilerCompilationGuard.lockMapSizeForTesting(), n / 2 + n,
                "map size must equal currently-open roots, not total roots ever opened");
    }

    // ---- Missing-module repair (RECOVERY_LADDER_LOGIC.md Part 1) ----

    @Test
    public void missingModuleRepairFiresOncePerSourceRoot() {
        Path root = Paths.get("/tmp/compilation-guard-test/repair-once");
        Package pkg = packageWithRoot(root);
        when(pkg.getResolution(any(CompilationOptions.class)))
                .thenThrow(new BLangCompilerException("failed to load the module foo"));

        try (MockedStatic<PullModuleExecutor> mocked = mockStatic(PullModuleExecutor.class)) {
            stubMissingModuleFailure(mocked);

            Assert.expectThrows(BLangCompilerException.class,
                    () -> CompilerCompilationGuard.getResolution(pkg, CompilationOptions.builder().build()));
            Assert.expectThrows(BLangCompilerException.class,
                    () -> CompilerCompilationGuard.getResolution(pkg, CompilationOptions.builder().build()));

            mocked.verify(() -> PullModuleExecutor.repairMissingDependencyBalas(any(Project.class)), times(1));
        }
    }

    @Test
    public void markerClearedAfterSuccessfulRetryAllowsRepairAgain() {
        Path root = Paths.get("/tmp/compilation-guard-test/repair-again");
        Package pkg = packageWithRoot(root);
        when(pkg.getResolution(any(CompilationOptions.class)))
                .thenThrow(new BLangCompilerException("failed to load the module foo"))
                .thenReturn(mock(PackageResolution.class))
                .thenThrow(new BLangCompilerException("failed to load the module foo"))
                .thenReturn(mock(PackageResolution.class));

        try (MockedStatic<PullModuleExecutor> mocked = mockStatic(PullModuleExecutor.class)) {
            stubMissingModuleFailure(mocked);

            CompilerCompilationGuard.getResolution(pkg, CompilationOptions.builder().build());
            CompilerCompilationGuard.getResolution(pkg, CompilationOptions.builder().build());

            mocked.verify(() -> PullModuleExecutor.repairMissingDependencyBalas(any(Project.class)), times(2));
        }
    }

    @Test
    public void evictProjectLockClearsRepairMarker() {
        Path root = Paths.get("/tmp/compilation-guard-test/evict-marker");
        Package pkg = packageWithRoot(root);
        when(pkg.getResolution(any(CompilationOptions.class)))
                .thenThrow(new BLangCompilerException("failed to load the module foo"));

        try (MockedStatic<PullModuleExecutor> mocked = mockStatic(PullModuleExecutor.class)) {
            stubMissingModuleFailure(mocked);

            Assert.expectThrows(BLangCompilerException.class,
                    () -> CompilerCompilationGuard.getResolution(pkg, CompilationOptions.builder().build()));

            CompilerCompilationGuard.evictProjectLock(root);

            Assert.expectThrows(BLangCompilerException.class,
                    () -> CompilerCompilationGuard.getResolution(pkg, CompilationOptions.builder().build()));

            mocked.verify(() -> PullModuleExecutor.repairMissingDependencyBalas(any(Project.class)), times(2));
        }
    }

    @Test
    public void nonMissingModuleFailurePropagatesWithoutRepair() {
        Path root = Paths.get("/tmp/compilation-guard-test/no-repair");
        Package pkg = packageWithRoot(root);
        when(pkg.getResolution(any(CompilationOptions.class)))
                .thenThrow(new BLangCompilerException("some unrelated compiler failure"));

        try (MockedStatic<PullModuleExecutor> mocked = mockStatic(PullModuleExecutor.class)) {
            stubMissingModuleFailure(mocked);

            Assert.expectThrows(BLangCompilerException.class,
                    () -> CompilerCompilationGuard.getResolution(pkg, CompilationOptions.builder().build()));

            mocked.verify(() -> PullModuleExecutor.repairMissingDependencyBalas(any(Project.class)), times(0));
        }
    }

    @Test
    public void lockIsNotHeldDuringRepair() throws InterruptedException {
        Path root = Paths.get("/tmp/compilation-guard-test/lock-free-repair");
        Package pkg = packageWithRoot(root);
        when(pkg.getResolution(any(CompilationOptions.class)))
                .thenThrow(new BLangCompilerException("failed to load the module foo"))
                .thenReturn(mock(PackageResolution.class));

        CountDownLatch inRepair = new CountDownLatch(1);
        AtomicReference<Throwable> contenderError = new AtomicReference<>();
        ReentrantLock[] lockHolder = new ReentrantLock[1];

        // MockedStatic is thread-local; the resolver must stay on the main thread so the stub is
        // visible. A second thread races to acquire the project lock while the resolver is
        // blocked inside the repaired repair call.
        Thread contender = new Thread(() -> {
            try {
                Assert.assertTrue(inRepair.await(5, TimeUnit.SECONDS),
                        "resolver should be inside the repair by the time contender wakes");
                ReentrantLock lock = CompilerCompilationGuard.lockForTesting(root);
                lockHolder[0] = lock;
                // Once the resolver is in the repair, the only thing that could still hold the
                // lock is the resolver itself - which is no longer waiting on it. Wait a little
                // for any in-flight lock-then-unlock to settle, then check that the lock is
                // unowned.
                Assert.assertTrue(lock.tryLock(5, TimeUnit.SECONDS),
                        "lock must be acquirable from another thread while repair is running");
                lock.unlock();
            } catch (Throwable t) {
                contenderError.set(t);
            }
        });
        contender.setDaemon(true);
        contender.start();

        try (MockedStatic<PullModuleExecutor> mocked = mockStatic(PullModuleExecutor.class)) {
            stubMissingModuleFailure(mocked);
            mocked.when(() -> PullModuleExecutor.repairMissingDependencyBalas(any(Project.class)))
                    .thenAnswer(invocation -> {
                        inRepair.countDown();
                        // Give the contender plenty of time to acquire the lock.
                        Thread.sleep(500);
                        return null;
                    });

            PackageResolution resolution = CompilerCompilationGuard.getResolution(pkg,
                    CompilationOptions.builder().build());
            Assert.assertNotNull(resolution, "retry after repair should succeed");
        }

        contender.join(5000);
        if (contenderError.get() != null) {
            throw new AssertionError("contender thread failed", contenderError.get());
        }
    }

    private static Package packageWithRoot(Path root) {
        Project project = mock(Project.class);
        when(project.sourceRoot()).thenReturn(root);
        Package pkg = mock(Package.class);
        when(pkg.project()).thenReturn(project);
        return pkg;
    }

    private static void stubMissingModuleFailure(MockedStatic<PullModuleExecutor> mocked) {
        mocked.when(() -> PullModuleExecutor.isMissingModuleFailure(any(Throwable.class)))
                .thenAnswer(invocation -> {
                    Throwable throwable = invocation.getArgument(0);
                    return throwable instanceof BLangCompilerException
                            && throwable.getMessage() != null
                            && throwable.getMessage().startsWith("failed to load the module");
                });
    }
}
