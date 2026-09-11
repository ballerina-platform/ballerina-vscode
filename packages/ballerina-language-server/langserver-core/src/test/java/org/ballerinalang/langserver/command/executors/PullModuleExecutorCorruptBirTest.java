/*
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
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
package org.ballerinalang.langserver.command.executors;

import io.ballerina.projects.DependencyGraph;
import io.ballerina.projects.Module;
import io.ballerina.projects.ModuleName;
import io.ballerina.projects.Package;
import io.ballerina.projects.PackageName;
import io.ballerina.projects.PackageOrg;
import io.ballerina.projects.PackageResolution;
import io.ballerina.projects.PackageVersion;
import io.ballerina.projects.Project;
import io.ballerina.projects.ResolvedPackageDependency;
import org.mockito.Mockito;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.util.List;
import java.util.Optional;

/**
 * L1 tests for {@link PullModuleExecutor#detectCorruptBirCache(Throwable, Project)}, the parser that
 * turns a compiler failure into a {@code projectService/corruptBirCache} notification payload. The
 * compiler's BIR reader throws with a fixed signature ("... invalid magic number ...") when a cached
 * BIR is corrupt/incompatible; these tests pin the detection contract so it survives refactors of the
 * surrounding pull flow and flags any drift in the error-message shape it depends on.
 */
public class PullModuleExecutorCorruptBirTest {

    private static final String CORRUPT_WITH_COORDINATES =
            "failed to load the module 'ballerina/ai:1.14.1' from its BIR due to: "
                    + "invalid magic number [99, 111, 114, 114]";

    @Test(description = "A nested corrupt-BIR cause is detected and its module coordinates extracted")
    public void testNestedCorruptBirWithCoordinates() {
        Throwable throwable = new RuntimeException("Pull modules failed",
                new IllegalStateException(CORRUPT_WITH_COORDINATES));

        // No dependency graph resolves the module here, so the package name falls back to the module
        // name — which is correct for a default module (package name == module name).
        Optional<CorruptBirCacheParams> result = PullModuleExecutor.detectCorruptBirCache(throwable, null);

        Assert.assertTrue(result.isPresent(), "Corrupt-BIR cause should be detected in the cause chain");
        CorruptBirCacheParams params = result.get();
        Assert.assertEquals(params.getOrg(), "ballerina");
        Assert.assertEquals(params.getPackageName(), "ai");
        Assert.assertEquals(params.getModuleName(), "ai");
        Assert.assertEquals(params.getVersion(), "1.14.1");
        // Detection only parses coordinates; the caller sets these before emitting the notification.
        Assert.assertNull(params.getProjectUri());
        Assert.assertNull(params.getDistVersion());
    }

    @Test(description = "A corrupt submodule BIR resolves to its owning package name, not the module name")
    public void testSubmoduleResolvesToPackageName() {
        // The compiler names the failing *module* (ai.observe); its BIR lives under the *package* dir
        // 'ai' (ballerina/ai/1.14.1/bir/ai.observe.bir). The parser must send the package name so the
        // client clears the right cache dir instead of a nonexistent ballerina/ai.observe/... dir.
        String message = "failed to load the module 'ballerina/ai.observe:1.14.1' from its BIR due to: "
                + "invalid magic number [99, 111, 114, 114]";
        Throwable throwable = new RuntimeException("Pull modules failed", new IllegalStateException(message));

        PackageName packageName = PackageName.from("ai");
        // Build the module mocks up front — stubbing them inline inside thenReturn(...) would nest an
        // unfinished stubbing and trip Mockito.
        Module defaultModule = mockModule(ModuleName.from(packageName));              // "ai"
        Module submodule = mockModule(ModuleName.from(packageName, "observe"));       // "ai.observe"
        Package aiPackage = Mockito.mock(Package.class);
        Mockito.when(aiPackage.packageOrg()).thenReturn(PackageOrg.from("ballerina"));
        Mockito.when(aiPackage.packageName()).thenReturn(packageName);
        Mockito.when(aiPackage.packageVersion()).thenReturn(PackageVersion.from("1.14.1"));
        Mockito.when(aiPackage.modules()).thenReturn(List.of(defaultModule, submodule));

        Optional<CorruptBirCacheParams> result =
                PullModuleExecutor.detectCorruptBirCache(throwable, mockProjectWith(aiPackage));

        Assert.assertTrue(result.isPresent());
        CorruptBirCacheParams params = result.get();
        Assert.assertEquals(params.getOrg(), "ballerina");
        Assert.assertEquals(params.getPackageName(), "ai", "cache dir is keyed by the package name");
        Assert.assertEquals(params.getModuleName(), "ai.observe", "failing module retained for display");
        Assert.assertEquals(params.getVersion(), "1.14.1");
    }

    @Test(description = "An unresolvable module falls back to the module name as the package name")
    public void testUnresolvedModuleFallsBackToModuleName() {
        String message = "failed to load the module 'ballerina/ai.observe:1.14.1' from its BIR due to: "
                + "invalid magic number [99, 111, 114, 114]";
        Throwable throwable = new RuntimeException("Pull modules failed", new IllegalStateException(message));

        // Graph does not contain the failing package (e.g. it lives in another workspace member).
        Package unrelated = Mockito.mock(Package.class);
        Mockito.when(unrelated.packageOrg()).thenReturn(PackageOrg.from("ballerina"));
        Mockito.when(unrelated.packageVersion()).thenReturn(PackageVersion.from("9.9.9"));

        Optional<CorruptBirCacheParams> result =
                PullModuleExecutor.detectCorruptBirCache(throwable, mockProjectWith(unrelated));

        Assert.assertTrue(result.isPresent());
        CorruptBirCacheParams params = result.get();
        Assert.assertEquals(params.getPackageName(), "ai.observe", "falls back to the module name");
        Assert.assertEquals(params.getModuleName(), "ai.observe");
    }

    @Test(description = "A corrupt-BIR message without parseable coordinates is detected with null coordinates")
    public void testCorruptBirWithoutCoordinates() {
        Throwable throwable = new RuntimeException(
                "failed to read the cached BIR: invalid magic number [99, 111, 114, 114]");

        Optional<CorruptBirCacheParams> result = PullModuleExecutor.detectCorruptBirCache(throwable, null);

        Assert.assertTrue(result.isPresent(), "Corrupt-BIR failure should be detected even without coordinates");
        CorruptBirCacheParams params = result.get();
        Assert.assertNull(params.getOrg());
        Assert.assertNull(params.getPackageName());
        Assert.assertNull(params.getVersion());
    }

    @Test(description = "A non-corrupt failure is not mistaken for a corrupt-BIR condition")
    public void testNonCorruptFailure() {
        Throwable throwable = new RuntimeException("Failed to pull modules: connection timed out");

        Optional<CorruptBirCacheParams> result = PullModuleExecutor.detectCorruptBirCache(throwable, null);

        Assert.assertTrue(result.isEmpty(), "A generic failure must not be reported as corrupt BIR");
    }

    @Test(description = "An 'invalid magic number' error unrelated to BIR is not treated as corrupt BIR")
    public void testInvalidMagicNumberWithoutBir() {
        Throwable throwable = new RuntimeException("invalid magic number in class file");

        Optional<CorruptBirCacheParams> result = PullModuleExecutor.detectCorruptBirCache(throwable, null);

        Assert.assertTrue(result.isEmpty(), "The BIR marker is required, not just 'invalid magic number'");
    }

    @Test(description = "Null and empty-chain throwables are handled without error")
    public void testNoCause() {
        Assert.assertTrue(PullModuleExecutor.detectCorruptBirCache(null, null).isEmpty());
        Assert.assertTrue(PullModuleExecutor.detectCorruptBirCache(new RuntimeException(), null).isEmpty());
    }

    @Test(description = "A null throwable renders to an empty stack-trace string")
    public void testStackTraceToStringNull() {
        Assert.assertEquals(PullModuleExecutor.stackTraceToString(null), "");
    }

    @Test(description = "A throwable renders to a stack trace carrying its type, message and cause")
    public void testStackTraceToStringRendersTrace() {
        Throwable throwable = new RuntimeException("outer failure", new IllegalStateException("inner cause"));

        String trace = PullModuleExecutor.stackTraceToString(throwable);

        Assert.assertTrue(trace.contains("java.lang.RuntimeException: outer failure"), trace);
        Assert.assertTrue(trace.contains("at " + PullModuleExecutorCorruptBirTest.class.getName()), trace);
        Assert.assertTrue(trace.contains("Caused by: java.lang.IllegalStateException: inner cause"), trace);
    }

    @Test(description = "An oversized stack trace is truncated to the bounded length")
    public void testStackTraceToStringTruncates() {
        // The message alone exceeds the 8000-char cap, so the rendered trace must be truncated.
        Throwable throwable = new RuntimeException("x".repeat(20_000));

        String trace = PullModuleExecutor.stackTraceToString(throwable);

        Assert.assertEquals(trace.length(), 8000, "trace should be capped at MAX_STACK_TRACE_CHARS");
    }

    private static Module mockModule(ModuleName moduleName) {
        Module module = Mockito.mock(Module.class);
        Mockito.when(module.moduleName()).thenReturn(moduleName);
        return module;
    }

    @SuppressWarnings("unchecked")
    private static Project mockProjectWith(Package dependencyPackage) {
        ResolvedPackageDependency node = Mockito.mock(ResolvedPackageDependency.class);
        Mockito.when(node.packageInstance()).thenReturn(dependencyPackage);
        DependencyGraph<ResolvedPackageDependency> graph = Mockito.mock(DependencyGraph.class);
        Mockito.when(graph.getNodes()).thenReturn(List.of(node));
        PackageResolution resolution = Mockito.mock(PackageResolution.class);
        Mockito.when(resolution.dependencyGraph()).thenReturn(graph);
        Package rootPackage = Mockito.mock(Package.class);
        Mockito.when(rootPackage.getResolution()).thenReturn(resolution);
        Project project = Mockito.mock(Project.class);
        Mockito.when(project.currentPackage()).thenReturn(rootPackage);
        return project;
    }
}
