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

package io.ballerina.flowmodelgenerator.core;

import io.ballerina.modelgenerator.commons.PackageUtil;
import io.ballerina.projects.PackageCompilation;
import io.ballerina.projects.Project;
import io.ballerina.projects.directory.SingleFileProject;
import org.ballerinalang.langserver.commons.workspace.ProjectLocks;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.ReentrantLock;

/**
 * Tests that {@link PackageUtil#getCompilation(Project)} compiles a project under the lock its owner guards it with.
 *
 * <p>The compiler does not support two first-time compilations of the same project at once: both add to the
 * project's compiler plugin contexts, an unsynchronized list. The workspace manager compiles its projects under its
 * own per-project lock, so a compilation started here has to wait for that lock too.</p>
 */
public class PackageUtilCompilationLockTest {

    private static final long WAIT_MILLIS = TimeUnit.SECONDS.toMillis(30);

    @Test(description = "A compilation waits while the owner's lock for the project is held, and completes after")
    public void testCompilationWaitsForOwnerLock() throws Exception {
        Project project = SingleFileProject.load(singleFile());
        ReentrantLock ownerLock = new ReentrantLock(true);
        ProjectLocks.Owner owner = candidate -> candidate == project ? Optional.of(ownerLock) : Optional.empty();
        ProjectLocks.addOwner(owner);
        try {
            CompletableFuture<PackageCompilation> compilation;
            ownerLock.lock();
            try {
                compilation = CompletableFuture.supplyAsync(() -> PackageUtil.getCompilation(project));
                // The compilation is queued on the owner's lock, not running under the path lock alone.
                awaitQueued(ownerLock);
                Assert.assertFalse(compilation.isDone(), "Compiled while the owner held the project's lock");
            } finally {
                ownerLock.unlock();
            }

            Assert.assertNotNull(compilation.get(WAIT_MILLIS, TimeUnit.MILLISECONDS));
        } finally {
            ProjectLocks.removeOwner(owner);
        }
    }

    @Test(description = "A project no owner holds still compiles; the fallback lock itself is not observed here")
    public void testProjectWithoutOwnerCompiles() throws IOException {
        Project project = SingleFileProject.load(singleFile());
        Assert.assertTrue(ProjectLocks.of(project).isEmpty());
        Assert.assertNotNull(PackageUtil.getCompilation(project));
    }

    private static Path singleFile() throws IOException {
        Path dir = Files.createTempDirectory("compilation-lock");
        dir.toFile().deleteOnExit();
        Path file = dir.resolve("main.bal");
        Files.writeString(file, "public function main() {\n}\n");
        file.toFile().deleteOnExit();
        return file;
    }

    private static void awaitQueued(ReentrantLock lock) throws InterruptedException {
        long deadline = System.currentTimeMillis() + WAIT_MILLIS;
        while (!lock.hasQueuedThreads()) {
            if (System.currentTimeMillis() > deadline) {
                Assert.fail("The compilation never waited on the owner's lock for the project");
            }
            Thread.sleep(10);
        }
    }
}
