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

package io.ballerina.flowmodelgenerator.extension;

import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.modelgenerator.commons.ModuleInfo;
import io.ballerina.modelgenerator.commons.PackageUtil;
import io.ballerina.projects.util.ProjectConstants;
import io.ballerina.projects.util.ProjectUtils;
import org.testng.Assert;
import org.testng.annotations.AfterClass;
import org.testng.annotations.BeforeClass;
import org.testng.annotations.Test;
import org.wso2.ballerinalang.util.RepoUtils;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.Optional;
import java.util.stream.Stream;

/**
 * Verifies that a package still compiles when the cached BIR of one of its Central dependencies cannot be read.
 * {@code ballerinax/ai.azure} depends on {@code ballerinax/azure.openai.chat}, which only Central provides.
 *
 * @since 1.0.0
 */
public class StaleBirCacheRecoveryTest {

    private static final Path DEPENDENCY_CACHE = RepoUtils.createAndGetHomeReposPath()
            .resolve(ProjectConstants.REPOSITORIES_DIR).resolve(ProjectConstants.CENTRAL_REPOSITORY_CACHE_NAME)
            .resolve(ProjectConstants.CACHES_DIR_NAME + "-" + RepoUtils.getBallerinaShortVersion())
            .resolve("ballerinax").resolve("azure.openai.chat").resolve("3.0.3");
    private static final Path DEPENDENCY_BIR = DEPENDENCY_CACHE.resolve("bir").resolve("azure.openai.chat.bir");

    private static final byte[] UNREADABLE_BIR = {0, 1, 2, 3};

    private Path backup;

    @BeforeClass
    public void corruptDependencyBir() throws IOException {
        Assert.assertTrue(Files.isRegularFile(DEPENDENCY_BIR), "Missing cached BIR fixture: " + DEPENDENCY_BIR);
        backup = Files.createTempDirectory("stale-bir-backup").resolve("3.0.3");
        copyDirectory(DEPENDENCY_CACHE, backup);
        Files.write(DEPENDENCY_BIR, UNREADABLE_BIR);
    }

    @AfterClass(alwaysRun = true)
    public void restoreDependencyCache() throws IOException {
        if (backup == null) {
            return;
        }
        ProjectUtils.deleteDirectory(DEPENDENCY_CACHE);
        copyDirectory(backup, DEPENDENCY_CACHE);
        ProjectUtils.deleteDirectory(backup.getParent());
    }

    @Test
    public void testRecompilesWhenADependencyBirCannotBeLoaded() throws IOException {
        Optional<SemanticModel> semanticModel =
                PackageUtil.getSemanticModel(new ModuleInfo("ballerinax", "ai.azure", "ai.azure", "1.4.4"));

        Assert.assertTrue(semanticModel.isPresent());
        Assert.assertFalse(semanticModel.get().moduleSymbols().isEmpty());
        Assert.assertFalse(Files.exists(DEPENDENCY_BIR)
                        && Arrays.equals(Files.readAllBytes(DEPENDENCY_BIR), UNREADABLE_BIR),
                "The unreadable dependency BIR should be cleared");
    }

    private static void copyDirectory(Path source, Path target) throws IOException {
        try (Stream<Path> paths = Files.walk(source)) {
            for (Path path : paths.toList()) {
                Files.copy(path, target.resolve(source.relativize(path).toString()));
            }
        }
    }
}
