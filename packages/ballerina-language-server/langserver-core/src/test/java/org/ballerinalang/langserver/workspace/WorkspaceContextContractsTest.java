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

import io.ballerina.projects.Module;
import io.ballerina.projects.PackageDescriptor;
import io.ballerina.projects.Project;
import org.ballerinalang.langserver.commons.workspace.RunContext;
import org.ballerinalang.langserver.workspace.compilerengine.CompilationPhase;
import org.ballerinalang.langserver.workspace.compilerengine.CompilationService;
import org.ballerinalang.langserver.workspace.compilerengine.snapshot.SnapshotView;
import org.ballerinalang.langserver.workspace.compilerengine.snapshot.StableSnapshot;
import org.ballerinalang.langserver.workspace.eventbus.SubscriberTier;
import org.ballerinalang.langserver.workspace.executionmanager.ExecutionMode;
import org.ballerinalang.langserver.workspace.executionmanager.ExecutionService;
import org.ballerinalang.langserver.workspace.executionmanager.ProcessId;
import org.ballerinalang.langserver.workspace.executionmanager.ProcessState;
import org.ballerinalang.langserver.workspace.workspacemanager.LockingMode;
import org.ballerinalang.langserver.workspace.workspacemanager.ProjectService;
import org.ballerinalang.langserver.workspace.workspacemanager.project.EvictionReason;
import org.ballerinalang.langserver.workspace.workspacemanager.project.ProjectHealthState;
import org.ballerinalang.langserver.workspace.workspacemanager.project.ProjectKind;
import org.ballerinalang.langserver.workspace.workspacemanager.uri.DocumentUri;
import org.eclipse.lsp4j.jsonrpc.CancelChecker;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.nio.file.Path;
import java.util.Collection;
import java.util.List;


/**
 * Verifies bounded-context API contracts and value objects.
 *
 * @since 1.7.0
 */
public class WorkspaceContextContractsTest {

    /**
     * Verifies workspace-manager enums expose the expected variants.
     */
    // RED: this test should fail - T-002 contracts are not implemented yet
    @Test
    public void workspaceManagerEnums_haveExpectedVariants() {
        assertEnumValues(ProjectKind.class, "SINGLE_FILE", "BUILD", "BALA", "WORKSPACE");
        assertEnumValues(ProjectHealthState.class, "HEALTHY", "COMPILATION_CRASHED", "PROJECT_CRASHED",
                "CANCELLED", "RECOVERING", "CIRCUIT_OPEN");
        assertEnumValues(LockingMode.class, "SOFT", "MEDIUM", "HARD", "LOCKED");
        assertEnumValues(EvictionReason.class, "DOCUMENT_CLOSED", "HEAP_PRESSURE", "LRU_EVICTION");
    }

    /**
     * Verifies compiler, document, execution, and eventbus enums expose expected variants.
     */
    @Test
    public void otherContextEnums_haveExpectedVariants() {
        assertEnumValues(CompilationPhase.class, "PRE_PARSE", "POST_PARSE", "POST_TYPE_CHECK", "POST_DIAGNOSTICS");
        assertEnumValues(ProcessState.class, "STARTING", "RUNNING", "TERMINATING", "TERMINATED");
        assertEnumValues(ExecutionMode.class, "RUN", "DEBUG");
        assertEnumValues(SubscriberTier.class, "CRITICAL", "COALESCEABLE", "BEST_EFFORT");
    }

    /**
     * Verifies ProjectService matches the contract signatures.
     *
     * @throws ReflectiveOperationException when a method is missing
     */
    @Test
    public void projectService_matchesContractSignatures() throws ReflectiveOperationException {
        Assert.assertTrue(ProjectService.class.isInterface());
        Assert.assertEquals(ProjectService.class.getMethods().length, 17);

        Method loadOrCreate = ProjectService.class.getMethod("loadOrCreate", Path.class, CancelChecker.class);
        Assert.assertEquals(loadOrCreate.getReturnType(), Project.class);

        Method project = ProjectService.class.getMethod("project", Path.class);
        Assert.assertEquals(project.getReturnType(), java.util.Optional.class);

        Method projectByUri = ProjectService.class.getMethod("project", DocumentUri.class);
        Assert.assertEquals(projectByUri.getReturnType(), java.util.Optional.class);

        Method loadOrCreateByUri = ProjectService.class.getMethod("loadOrCreate", DocumentUri.class,
                CancelChecker.class);
        Assert.assertEquals(loadOrCreateByUri.getReturnType(), Project.class);

        Method allProjects = ProjectService.class.getMethod("allProjects");
        Assert.assertEquals(allProjects.getReturnType(), Collection.class);

        Method module = ProjectService.class.getMethod("module", Path.class, CancelChecker.class);
        Assert.assertEquals(module.getReturnType(), Module.class);

        Method moduleByUri = ProjectService.class.getMethod("module", DocumentUri.class, CancelChecker.class);
        Assert.assertEquals(moduleByUri.getReturnType(), Module.class);

        Method documentByUri = ProjectService.class.getMethod("document", DocumentUri.class, CancelChecker.class);
        Assert.assertEquals(documentByUri.getReturnType(), java.util.Optional.class);

        Method getLockingMode = ProjectService.class.getMethod("getLockingMode", Project.class);
        Assert.assertEquals(getLockingMode.getReturnType(), LockingMode.class);

        Method registerWorkspace = ProjectService.class.getMethod("registerWorkspace", java.util.List.class);
        Assert.assertEquals(registerWorkspace.getReturnType(), Void.TYPE);
    }

    /**
     * Verifies CompilationService matches the contract signatures.
     *
     * @throws ReflectiveOperationException when a method is missing
     */
    @Test
    public void compilationService_matchesContractSignatures() throws ReflectiveOperationException {
        Assert.assertTrue(CompilationService.class.isInterface());
        Assert.assertEquals(CompilationService.class.getMethods().length, 2);

        Method stableSnapshot = CompilationService.class.getMethod("stableSnapshot", Project.class,
                PackageDescriptor.class,
                CancelChecker.class);
        Assert.assertEquals(stableSnapshot.getReturnType(), StableSnapshot.class);

        Method latestSnapshot = CompilationService.class.getMethod("latestSnapshot", Project.class,
                PackageDescriptor.class,
                CancelChecker.class);
        Assert.assertEquals(latestSnapshot.getReturnType(), SnapshotView.class);
    }

    /**
     * Verifies ExecutionService matches the contract signatures.
     *
     * @throws ReflectiveOperationException when a method is missing
     */
    @Test
    public void executionService_matchesContractSignatures() throws ReflectiveOperationException {
        Assert.assertTrue(ExecutionService.class.isInterface());
        Assert.assertEquals(ExecutionService.class.getMethods().length, 2);

        Method run = ExecutionService.class.getMethod("run", RunContext.class);
        Assert.assertEquals(run.getReturnType(), ProcessId.class);

        Method stop = ExecutionService.class.getMethod("stop", DocumentUri.class);
        Assert.assertEquals(stop.getReturnType(), Void.TYPE);
    }

    /**
     * Verifies execution value objects are immutable public records.
     */
    @Test
    public void executionValueObjects_areImmutable() {
        Assert.assertTrue(ProcessId.class.isRecord());
        Assert.assertTrue(Modifier.isPublic(ProcessId.class.getModifiers()));

        List<String> processMethodNames = List.of(ProcessId.class.getMethods()).stream()
                .map(Method::getName)
                .toList();
        Assert.assertFalse(processMethodNames.stream().anyMatch(name -> name.startsWith("set")));
    }

    /**
     * Verifies ProcessId retains identifier value.
     */
    @Test
    public void processId_retainsIdentifierValue() {
        ProcessId processId = new ProcessId("process-1");
        Assert.assertEquals(processId.value(), "process-1");
    }

    /**
     * Asserts exact enum value ordering and names.
     *
     * @param enumType enum class to inspect
     * @param expectedNames expected names in declaration order
     */
    private static void assertEnumValues(Class<? extends Enum<?>> enumType, String... expectedNames) {
        String[] actualNames = List.of(enumType.getEnumConstants()).stream()
                .map(Enum::name)
                .toArray(String[]::new);
        Assert.assertEquals(actualNames, expectedNames);
    }
}
