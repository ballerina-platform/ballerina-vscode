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
import io.ballerina.modelgenerator.commons.FunctionData;
import io.ballerina.modelgenerator.commons.FunctionDataBuilder;
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
import java.util.List;
import java.util.Optional;
import java.util.stream.Stream;

/**
 * Verifies that a package still compiles when the cached BIR of its Central dependencies cannot be read.
 * {@code ballerinax/ai.azure} depends on {@code ballerinax/azure.openai.chat} and
 * {@code ballerinax/azure.openai.embeddings}, which only Central provides.
 *
 * @since 1.0.0
 */
public class StaleBirCacheRecoveryTest {

    private static final Path CENTRAL_CACHE = RepoUtils.createAndGetHomeReposPath()
            .resolve(ProjectConstants.REPOSITORIES_DIR).resolve(ProjectConstants.CENTRAL_REPOSITORY_CACHE_NAME)
            .resolve(ProjectConstants.CACHES_DIR_NAME + "-" + RepoUtils.getBallerinaShortVersion())
            .resolve("ballerinax");
    private static final Path CHAT_CACHE = CENTRAL_CACHE.resolve("azure.openai.chat").resolve("3.0.3");
    private static final Path EMBEDDINGS_CACHE = CENTRAL_CACHE.resolve("azure.openai.embeddings").resolve("1.0.2");
    private static final List<Path> DEPENDENCY_CACHES = List.of(CHAT_CACHE, EMBEDDINGS_CACHE);
    private static final ModuleInfo AI_AZURE = new ModuleInfo("ballerinax", "ai.azure", "ai.azure", "1.4.4");

    private static final byte[] UNREADABLE_BIR = {0, 1, 2, 3};

    private Path backup;

    @BeforeClass
    public void backUpDependencyCaches() throws IOException {
        Path snapshot = Files.createTempDirectory("stale-bir-backup");
        for (Path cache : DEPENDENCY_CACHES) {
            Assert.assertTrue(Files.isRegularFile(bir(cache)), "Missing cached BIR fixture: " + bir(cache));
            copyDirectory(cache, snapshot.resolve(packageName(cache)));
        }
        backup = snapshot;
    }

    @AfterClass(alwaysRun = true)
    public void restoreDependencyCaches() throws IOException {
        if (backup == null) {
            return;
        }
        for (Path cache : DEPENDENCY_CACHES) {
            ProjectUtils.deleteDirectory(cache);
            copyDirectory(backup.resolve(packageName(cache)), cache);
        }
        ProjectUtils.deleteDirectory(backup);
    }

    @Test
    public void testRecompilesWhenADependencyBirCannotBeLoaded() throws IOException {
        corrupt(CHAT_CACHE);

        assertHasSymbols(PackageUtil.getSemanticModel(AI_AZURE));
        assertCleared(CHAT_CACHE);
    }

    @Test
    public void testRecompilesTheLatestVersion() throws IOException {
        corrupt(CHAT_CACHE);

        assertHasSymbols(PackageUtil.getSemanticModel(AI_AZURE.org(), AI_AZURE.packageName()));
        assertCleared(CHAT_CACHE);
    }

    @Test
    public void testFunctionDataBuilderRecompiles() throws IOException {
        corrupt(CHAT_CACHE);

        FunctionData functionData = new FunctionDataBuilder()
                .moduleInfo(AI_AZURE)
                .parentSymbolType("OpenAiModelProvider")
                .name("init")
                .functionResultKind(FunctionData.Kind.MODEL_PROVIDER)
                .build();

        Assert.assertFalse(functionData.parameters().isEmpty());
        assertCleared(CHAT_CACHE);
    }

    @Test
    public void testRecompilesWhenSeveralDependencyBirsCannotBeLoaded() throws IOException {
        corrupt(CHAT_CACHE);
        corrupt(EMBEDDINGS_CACHE);

        assertHasSymbols(PackageUtil.getSemanticModel(AI_AZURE));
        assertCleared(CHAT_CACHE);
        assertCleared(EMBEDDINGS_CACHE);
    }

    private static void assertHasSymbols(Optional<SemanticModel> semanticModel) {
        Assert.assertTrue(semanticModel.isPresent());
        Assert.assertFalse(semanticModel.get().moduleSymbols().isEmpty());
    }

    private static void corrupt(Path cache) throws IOException {
        Files.createDirectories(bir(cache).getParent());
        Files.write(bir(cache), UNREADABLE_BIR);
    }

    private static void assertCleared(Path cache) throws IOException {
        Path bir = bir(cache);
        Assert.assertFalse(Files.exists(bir) && Arrays.equals(Files.readAllBytes(bir), UNREADABLE_BIR),
                "The unreadable BIR should be cleared: " + bir);
    }

    private static Path bir(Path cache) {
        return cache.resolve("bir").resolve(packageName(cache) + ".bir");
    }

    private static String packageName(Path cache) {
        return cache.getParent().getFileName().toString();
    }

    private static void copyDirectory(Path source, Path target) throws IOException {
        try (Stream<Path> paths = Files.walk(source)) {
            for (Path path : paths.toList()) {
                Files.copy(path, target.resolve(source.relativize(path).toString()));
            }
        }
    }
}
