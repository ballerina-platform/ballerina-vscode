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

package org.ballerinalang.langserver.workspace.workspacemanager;

import org.ballerinalang.langserver.workspace.workspacemanager.project.OpenDocumentCount;
import org.ballerinalang.langserver.workspace.workspacemanager.project.Project;
import org.ballerinalang.langserver.workspace.workspacemanager.project.ProjectHealthState;
import org.ballerinalang.langserver.workspace.workspacemanager.project.ProjectKind;
import org.ballerinalang.langserver.workspace.workspacemanager.project.ProjectTier;
import org.ballerinalang.langserver.workspace.workspacemanager.uri.DocumentUri;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.lang.annotation.Annotation;
import java.lang.reflect.Constructor;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import javax.annotation.Nonnull;


/**
 * Tests for {@link Project} and {@link OpenDocumentCount}.
 *
 * @since 1.7.0
 */
public class ProjectTest {

    private static final Path ABS_PATH = Path.of("/workspace/myproject").toAbsolutePath().normalize();
    private static final DocumentUri SOURCE_ROOT = new DocumentUri.FileUri(ABS_PATH.toUri());

    @Test
    public void openDocumentCount_initialState_zeroAndBackground() {
        OpenDocumentCount count = new OpenDocumentCount();

        Assert.assertEquals(count.count(), 0);
        Assert.assertEquals(count.tier(), ProjectTier.BACKGROUND);
    }

    @Test
    public void openDocumentCount_incrementAndDecrement_tracksTier() {
        OpenDocumentCount count = new OpenDocumentCount();

        count.increment();
        Assert.assertEquals(count.count(), 1);
        Assert.assertEquals(count.tier(), ProjectTier.ACTIVE);

        count.decrement();
        Assert.assertEquals(count.count(), 0);
        Assert.assertEquals(count.tier(), ProjectTier.BACKGROUND);
    }

    @Test
    public void openDocumentCount_concurrency_neverGoesNegative() throws Exception {
        OpenDocumentCount count = new OpenDocumentCount();
        CountDownLatch start = new CountDownLatch(1);
        CountDownLatch done = new CountDownLatch(10);

        for (int i = 0; i < 10; i++) {
            int index = i;
            Thread thread = new Thread(() -> {
                try {
                    start.await();
                    if (index % 2 == 0) {
                        count.increment();
                    } else {
                        count.decrement();
                    }
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                } finally {
                    done.countDown();
                }
            });
            thread.start();
        }

        start.countDown();
        Assert.assertTrue(done.await(5, TimeUnit.SECONDS));
        Assert.assertTrue(count.count() >= 0);
    }

    @Test
    public void project_constructor_initialState() {
        Project project = new Project(SOURCE_ROOT, ProjectKind.BUILD);

        Assert.assertEquals(project.sourceRoot(), SOURCE_ROOT);
        Assert.assertEquals(project.kind(), ProjectKind.BUILD);
        Assert.assertEquals(project.healthState(), ProjectHealthState.HEALTHY);
        Assert.assertNotNull(project.openDocumentCount());
    }

    @Test
    public void project_constructor_parameters_areNonnullAnnotated() throws Exception {
        Constructor<Project> ctor = Project.class.getDeclaredConstructor(DocumentUri.class, ProjectKind.class);

        Assert.assertTrue(hasNonnull(ctor.getParameterAnnotations()[0]));
        Assert.assertTrue(hasNonnull(ctor.getParameterAnnotations()[1]));
    }

    @Test
    public void project_equals_usesSourceRootIdentity() {
        Project first = new Project(SOURCE_ROOT, ProjectKind.BUILD);
        Project second = new Project(SOURCE_ROOT, ProjectKind.SINGLE_FILE);

        Assert.assertEquals(first, second);
        Assert.assertEquals(first.hashCode(), second.hashCode());
    }

    @Test
    public void project_transitionTo_validRecoveryPath_succeeds() {
        Project project = new Project(SOURCE_ROOT, ProjectKind.BUILD);

        project.transitionTo(ProjectHealthState.COMPILATION_CRASHED);
        project.notifySourceChanged();
        project.transitionTo(ProjectHealthState.RECOVERING);
        project.transitionTo(ProjectHealthState.HEALTHY);

        Assert.assertEquals(project.healthState(), ProjectHealthState.HEALTHY);
    }

    @Test
    public void project_transitionTo_withoutSourceChange_rejectsCompilationRecovery() {
        Project project = new Project(SOURCE_ROOT, ProjectKind.BUILD);
        project.transitionTo(ProjectHealthState.COMPILATION_CRASHED);

        Assert.assertThrows(IllegalStateException.class,
                () -> project.transitionTo(ProjectHealthState.RECOVERING));
    }

    @Test
    public void project_transitionKind_singleFileToBuild_succeeds() {
        Project project = new Project(SOURCE_ROOT, ProjectKind.SINGLE_FILE);

        project.transitionKind(ProjectKind.BUILD);

        Assert.assertEquals(project.kind(), ProjectKind.BUILD);
    }

    @Test
    public void project_transitionKind_sameKind_throws() {
        Project project = new Project(SOURCE_ROOT, ProjectKind.BUILD);

        Assert.assertThrows(IllegalStateException.class,
                () -> project.transitionKind(ProjectKind.BUILD));
    }

    private static boolean hasNonnull(Annotation[] annotations) {
        return Arrays.stream(annotations).anyMatch(annotation -> annotation.annotationType() == Nonnull.class);
    }
}
