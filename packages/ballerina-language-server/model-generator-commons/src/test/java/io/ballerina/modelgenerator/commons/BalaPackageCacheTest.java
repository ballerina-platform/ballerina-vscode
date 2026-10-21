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
import org.mockito.Mockito;
import org.testng.Assert;
import org.testng.annotations.AfterMethod;
import org.testng.annotations.Test;

import java.lang.ref.SoftReference;
import java.lang.reflect.Field;
import java.nio.file.Path;
import java.util.Map;

/**
 * Tests that {@link PackageUtil#getCompilation(Package)} drops a cached BALA package whose compilation failed.
 */
public class BalaPackageCacheTest {

    private static final Path BALA = Path.of("bala-package-cache-test");

    @AfterMethod(alwaysRun = true)
    public void tearDown() throws ReflectiveOperationException {
        balaPackages().remove(BALA);
    }

    @Test
    public void testKeepsAPackageThatCompiles() throws ReflectiveOperationException {
        Package pkg = mockPackage();
        Mockito.when(pkg.getCompilation()).thenReturn(Mockito.mock(PackageCompilation.class));
        balaPackages().put(BALA, new SoftReference<>(pkg));

        PackageUtil.getCompilation(pkg);

        Assert.assertSame(balaPackages().get(BALA).get(), pkg);
    }

    @Test
    public void testDropsAPackageThatFailsToCompile() throws ReflectiveOperationException {
        Package pkg = mockPackage();
        Mockito.when(pkg.getCompilation()).thenThrow(new IllegalStateException("failed"));
        balaPackages().put(BALA, new SoftReference<>(pkg));

        Assert.expectThrows(IllegalStateException.class, () -> PackageUtil.getCompilation(pkg));

        Assert.assertFalse(balaPackages().containsKey(BALA));
    }

    @Test
    public void testDropsAPackageThatThrowsAnError() throws ReflectiveOperationException {
        Package pkg = mockPackage();
        Mockito.when(pkg.getCompilation()).thenThrow(new AssertionError("failed"));
        balaPackages().put(BALA, new SoftReference<>(pkg));

        Assert.expectThrows(AssertionError.class, () -> PackageUtil.getCompilation(pkg));

        Assert.assertFalse(balaPackages().containsKey(BALA));
    }

    @Test
    public void testKeepsANewerPackageLoadedForTheSamePath() throws ReflectiveOperationException {
        Package failed = mockPackage();
        Mockito.when(failed.getCompilation()).thenThrow(new IllegalStateException("failed"));
        Package newer = mockPackage();
        balaPackages().put(BALA, new SoftReference<>(newer));

        Assert.expectThrows(IllegalStateException.class, () -> PackageUtil.getCompilation(failed));

        Assert.assertSame(balaPackages().get(BALA).get(), newer);
    }

    private static Package mockPackage() {
        Project project = Mockito.mock(Project.class);
        Mockito.when(project.sourceRoot()).thenReturn(BALA);
        Package pkg = Mockito.mock(Package.class);
        Mockito.when(pkg.project()).thenReturn(project);
        return pkg;
    }

    @SuppressWarnings("unchecked")
    private static Map<Path, SoftReference<Package>> balaPackages() throws ReflectiveOperationException {
        Field field = PackageUtil.class.getDeclaredField("BALA_PACKAGES");
        field.setAccessible(true);
        return (Map<Path, SoftReference<Package>>) field.get(null);
    }
}
