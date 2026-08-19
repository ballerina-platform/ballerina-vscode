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

import org.testng.Assert;
import org.testng.annotations.AfterMethod;
import org.testng.annotations.Test;

import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.concurrent.locks.ReentrantLock;

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

    @AfterMethod
    public void tearDown() {
        CompilerCompilationGuard.clearLocksForTesting();
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
}
