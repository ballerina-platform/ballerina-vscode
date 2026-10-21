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

package io.ballerina.modelgenerator.commons;

import io.ballerina.projects.Package;
import io.ballerina.projects.PackageCompilation;
import io.ballerina.projects.Project;
import io.ballerina.projects.ProjectKind;
import io.ballerina.projects.util.ProjectUtils;
import org.ballerinalang.compiler.BLangCompilerException;
import org.mockito.Mockito;
import org.testng.Assert;
import org.testng.annotations.AfterClass;
import org.testng.annotations.Test;
import org.wso2.ballerinalang.util.RepoUtils;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Tests that {@link PackageUtil#compileBala} clears only the cache of the module whose BIR failed to load, and only
 * for BALA projects.
 */
public class StaleBirCacheTest {

    private static final String ORG = "stalebircachetest";

    private final Path orgCache = RepoUtils.createAndGetHomeReposPath().resolve("repositories")
            .resolve("central.ballerina.io").resolve("cache-" + RepoUtils.getBallerinaShortVersion()).resolve(ORG);

    @AfterClass(alwaysRun = true)
    public void tearDown() {
        ProjectUtils.deleteDirectory(orgCache);
    }

    @Test
    public void testClearsOnlyTheFailedPackageCache() throws IOException {
        Path ai = createCachedBir("ai", "1.12.0");
        Path mcp = createCachedBir("mcp", "1.0.3");
        BLangCompilerException error = new BLangCompilerException("failed to load the module '" + ORG
                + "/ai:1.12.0' from its BIR due to: class BSymbol cannot be cast to class BConstantSymbol");

        Assert.assertTrue(PackageUtil.clearFailedBirCache(error, null));
        Assert.assertFalse(Files.exists(ai));
        Assert.assertTrue(Files.exists(mcp));
    }

    @Test
    public void testIgnoresOtherFailures() throws IOException {
        Path ai = createCachedBir("ai", "1.13.0");

        Assert.assertFalse(PackageUtil.clearFailedBirCache(new IllegalStateException("unrelated"), null));
        Assert.assertTrue(Files.exists(ai));
    }

    @Test
    public void testCompileBalaReturnsTheSamePackageOnSuccess() {
        Package pkg = mockPackage(ProjectKind.BALA_PROJECT, "success");
        Mockito.when(pkg.getCompilation()).thenReturn(Mockito.mock(PackageCompilation.class));

        Assert.assertSame(PackageUtil.compileBala(pkg), pkg);
        Mockito.verify(pkg, Mockito.times(1)).getCompilation();
    }

    @Test
    public void testCompileBalaRethrowsOtherFailures() throws IOException {
        Path ai = createCachedBir("ai", "1.14.0");
        IllegalStateException error = new IllegalStateException("unrelated");
        Package pkg = mockPackage(ProjectKind.BALA_PROJECT, "other-failure");
        Mockito.when(pkg.getCompilation()).thenThrow(error);

        Assert.assertSame(Assert.expectThrows(IllegalStateException.class, () -> PackageUtil.compileBala(pkg)), error);
        Assert.assertTrue(Files.exists(ai));
    }

    @Test
    public void testCompileBalaLeavesTheCacheOfNonBalaProjects() throws IOException {
        Path ai = createCachedBir("ai", "1.15.0");
        BLangCompilerException error = new BLangCompilerException("failed to load the module '" + ORG
                + "/ai:1.15.0' from its BIR due to: invalid magic number");
        Package pkg = mockPackage(ProjectKind.BUILD_PROJECT, "user-project");
        Mockito.when(pkg.getCompilation()).thenThrow(error);

        Assert.assertSame(Assert.expectThrows(BLangCompilerException.class, () -> PackageUtil.compileBala(pkg)), error);
        Assert.assertTrue(Files.exists(ai));
    }

    private static Package mockPackage(ProjectKind kind, String root) {
        Project project = Mockito.mock(Project.class);
        Mockito.when(project.kind()).thenReturn(kind);
        Mockito.when(project.sourceRoot()).thenReturn(Path.of(root));
        Package pkg = Mockito.mock(Package.class);
        Mockito.when(pkg.project()).thenReturn(project);
        return pkg;
    }

    private Path createCachedBir(String name, String version) throws IOException {
        Path bir = orgCache.resolve(name).resolve(version).resolve("bir");
        Files.createDirectories(bir);
        Files.writeString(bir.resolve(name + ".bir"), "");
        return bir.getParent();
    }
}
