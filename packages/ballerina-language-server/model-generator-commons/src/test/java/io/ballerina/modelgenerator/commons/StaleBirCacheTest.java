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

import io.ballerina.projects.util.ProjectUtils;
import org.ballerinalang.compiler.BLangCompilerException;
import org.testng.Assert;
import org.testng.annotations.AfterClass;
import org.testng.annotations.Test;
import org.wso2.ballerinalang.util.RepoUtils;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Tests that {@link PackageUtil#clearFailedBirCache} removes only the cache of the module whose BIR failed to load.
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

    private Path createCachedBir(String name, String version) throws IOException {
        Path bir = orgCache.resolve(name).resolve(version).resolve("bir");
        Files.createDirectories(bir);
        Files.writeString(bir.resolve(name + ".bir"), "");
        return bir.getParent();
    }
}
