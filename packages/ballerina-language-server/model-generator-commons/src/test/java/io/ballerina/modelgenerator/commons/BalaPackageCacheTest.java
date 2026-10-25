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
import org.mockito.Mockito;
import org.testng.Assert;
import org.testng.annotations.AfterMethod;
import org.testng.annotations.Test;

import java.nio.file.Path;
import java.time.Duration;

/**
 * Tests the cache of BALA packages: failed compilations are dropped, and only a few recently used packages, fewer
 * when compiled, are kept.
 */
public class BalaPackageCacheTest {

    private static final Path BALA = Path.of("bala-package-cache-test");

    @AfterMethod(alwaysRun = true)
    public void tearDown() {
        PackageUtil.BALA_PACKAGES.remove(BALA, PackageUtil.BALA_PACKAGES.get(BALA));
    }

    @Test
    public void testKeepsAPackageThatCompiles() {
        Package pkg = mockPackage(BALA);
        Mockito.when(pkg.getCompilation()).thenReturn(Mockito.mock(PackageCompilation.class));
        PackageUtil.BALA_PACKAGES.put(BALA, pkg);

        PackageUtil.getCompilation(pkg);

        Assert.assertSame(PackageUtil.BALA_PACKAGES.get(BALA), pkg);
    }

    @Test
    public void testDropsAPackageThatFailsToCompile() {
        Package pkg = mockPackage(BALA);
        Mockito.when(pkg.getCompilation()).thenThrow(new IllegalStateException("failed"));
        PackageUtil.BALA_PACKAGES.put(BALA, pkg);

        Assert.expectThrows(IllegalStateException.class, () -> PackageUtil.getCompilation(pkg));

        Assert.assertNull(PackageUtil.BALA_PACKAGES.get(BALA));
    }

    @Test
    public void testDropsAPackageThatThrowsAnError() {
        Package pkg = mockPackage(BALA);
        Mockito.when(pkg.getCompilation()).thenThrow(new AssertionError("failed"));
        PackageUtil.BALA_PACKAGES.put(BALA, pkg);

        Assert.expectThrows(AssertionError.class, () -> PackageUtil.getCompilation(pkg));

        Assert.assertNull(PackageUtil.BALA_PACKAGES.get(BALA));
    }

    @Test
    public void testKeepsANewerPackageLoadedForTheSamePath() {
        Package failed = mockPackage(BALA);
        Mockito.when(failed.getCompilation()).thenThrow(new IllegalStateException("failed"));
        Package newer = mockPackage(BALA);
        PackageUtil.BALA_PACKAGES.put(BALA, newer);

        Assert.expectThrows(IllegalStateException.class, () -> PackageUtil.getCompilation(failed));

        Assert.assertSame(PackageUtil.BALA_PACKAGES.get(BALA), newer);
    }

    @Test
    public void testCachesALibraryOnceCompiled() {
        Package pkg = mockPackage(BALA);
        Mockito.when(pkg.project().kind()).thenReturn(ProjectKind.BALA_PROJECT);
        Mockito.when(pkg.getCompilation()).thenReturn(Mockito.mock(PackageCompilation.class));

        PackageUtil.getCompilation(pkg);

        Assert.assertSame(PackageUtil.BALA_PACKAGES.get(BALA), pkg);
    }

    @Test
    public void testEvictsTheLeastRecentlyUsedPackage() {
        PackageUtil.BalaPackageCache cache = new PackageUtil.BalaPackageCache(2, 2, Duration.ofMinutes(10));
        Path a = Path.of("a");
        Path b = Path.of("b");
        Path c = Path.of("c");
        cache.put(a, mockPackage(a));
        cache.put(b, mockPackage(b));
        cache.get(a);
        cache.put(c, mockPackage(c));

        Assert.assertNotNull(cache.get(a), "The recently used package should stay");
        Assert.assertNull(cache.get(b), "The least recently used package should be evicted");
        Assert.assertNotNull(cache.get(c));
    }

    @Test
    public void testLimitsCompiledPackagesSeparately() {
        PackageUtil.BalaPackageCache cache = new PackageUtil.BalaPackageCache(1, 10, Duration.ofMinutes(10));
        Path compiled = Path.of("compiled");
        Path loaded = Path.of("loaded");
        Path newer = Path.of("newer");
        cache.putCompiled(compiled, mockPackage(compiled));
        cache.put(loaded, mockPackage(loaded));
        cache.putCompiled(newer, mockPackage(newer));

        Assert.assertNull(cache.get(compiled), "The older compiled package should be evicted");
        Assert.assertNotNull(cache.get(loaded), "An uncompiled package should not count against the compiled limit");
        Assert.assertNotNull(cache.get(newer));
    }

    @Test
    public void testEvictsIdlePackages() {
        Duration timeout = Duration.ofMinutes(10);
        PackageUtil.BalaPackageCache cache = new PackageUtil.BalaPackageCache(3, 10, timeout);
        Path a = Path.of("a");
        cache.putCompiled(a, mockPackage(a));

        cache.evictIdle(System.currentTimeMillis() + timeout.toMillis() / 2);
        Assert.assertNotNull(cache.get(a), "A recently used package should stay");

        cache.evictIdle(System.currentTimeMillis() + 2 * timeout.toMillis());
        Assert.assertNull(cache.get(a), "An idle package should be dropped");
    }

    private static Package mockPackage(Path root) {
        Project project = Mockito.mock(Project.class);
        Mockito.when(project.sourceRoot()).thenReturn(root);
        Package pkg = Mockito.mock(Package.class);
        Mockito.when(pkg.project()).thenReturn(project);
        return pkg;
    }
}
