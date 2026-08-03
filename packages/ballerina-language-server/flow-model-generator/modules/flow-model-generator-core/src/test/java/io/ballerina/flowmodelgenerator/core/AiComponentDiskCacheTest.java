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

import io.ballerina.flowmodelgenerator.core.AiComponentDiskCache.CachedComponent;
import io.ballerina.flowmodelgenerator.core.model.NodeKind;
import org.testng.Assert;
import org.testng.annotations.AfterMethod;
import org.testng.annotations.BeforeMethod;
import org.testng.annotations.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Optional;

/**
 * Tests for {@link AiComponentDiskCache}.
 *
 * @since 1.7.0
 */
public class AiComponentDiskCacheTest {

    private Path tempDir;
    private AiComponentDiskCache cache;

    @BeforeMethod
    public void setup() throws IOException {
        tempDir = Files.createTempDirectory("ai-component-disk-cache-test");
        cache = new AiComponentDiskCache(tempDir);
    }

    @AfterMethod
    public void cleanup() throws IOException {
        deleteRecursively(tempDir);
    }

    @Test(description = "Verifies a saved component list roundtrips back unchanged from the same cache instance.")
    public void testRoundtrip() {
        List<CachedComponent> components = List.of(
                new CachedComponent("OpenAiProvider", "OpenAI", "OpenAI model provider",
                        NodeKind.MODEL_PROVIDER.name(), "init", "https://icons.example/openai.png"),
                new CachedComponent("PineconeStore", "Pinecone", "Pinecone vector store",
                        NodeKind.VECTOR_STORE.name(), "init", "https://icons.example/pinecone.png"));

        cache.save("ballerinax", "ai.openai", "1.4.0", components);
        Optional<List<CachedComponent>> loaded = cache.load("ballerinax", "ai.openai", "1.4.0");

        Assert.assertTrue(loaded.isPresent());
        Assert.assertEquals(loaded.get(), components);
    }

    @Test(description = "Verifies an empty component list persists and loads back as an empty list, not as empty.")
    public void testEmptyListPersistsAndLoadsAsEmpty() {
        cache.save("ballerinax", "ai.empty", "1.0.0", List.of());
        Optional<List<CachedComponent>> loaded = cache.load("ballerinax", "ai.empty", "1.0.0");

        Assert.assertTrue(loaded.isPresent());
        Assert.assertTrue(loaded.get().isEmpty());
    }

    @Test(description = "Verifies a load for a module that was never saved returns an empty Optional.")
    public void testMissingFileReturnsEmpty() {
        Optional<List<CachedComponent>> loaded = cache.load("ballerinax", "ai.nope", "1.0.0");
        Assert.assertTrue(loaded.isEmpty());
    }

    @Test(description = "Verifies a cache file with corrupt JSON is treated as a miss rather than throwing.")
    public void testCorruptJsonReturnsEmpty() throws IOException {
        cache.save("ballerinax", "ai.corrupt", "1.0.0", List.of(
                new CachedComponent("X", "label", "desc", NodeKind.MODEL_PROVIDER.name(),
                        "init", "icon")));
        Files.writeString(findCacheFile(), "{ not valid json");

        Optional<List<CachedComponent>> loaded = cache.load("ballerinax", "ai.corrupt", "1.0.0");

        Assert.assertTrue(loaded.isEmpty());
    }

    @Test(description = "Verifies a cache file with a mismatched schemaVersion is treated as a miss.")
    public void testSchemaMismatchReturnsEmpty() throws IOException {
        cache.save("ballerinax", "ai.oldschema", "1.0.0", List.of());
        Files.writeString(findCacheFile(), "{\"schemaVersion\":999,\"components\":[]}");

        Optional<List<CachedComponent>> loaded = cache.load("ballerinax", "ai.oldschema", "1.0.0");

        Assert.assertTrue(loaded.isEmpty());
    }

    @Test(description = "Verifies load rejects the whole file when any cached component has a null required field.")
    public void testNullFieldInComponentRejectsFile() {
        List<CachedComponent> bad = List.of(
                new CachedComponent(null, "label", "desc", NodeKind.MODEL_PROVIDER.name(),
                        "init", "icon"));
        cache.save("ballerinax", "ai.nulls", "1.0.0", bad);

        Optional<List<CachedComponent>> loaded = cache.load("ballerinax", "ai.nulls", "1.0.0");

        Assert.assertTrue(loaded.isEmpty());
    }

    @Test(description = "Verifies load rejects the whole file when any category is not a valid NodeKind name.")
    public void testUnknownCategoryRejectsFile() {
        List<CachedComponent> bad = List.of(
                new CachedComponent("X", "label", "desc", "NOT_A_REAL_CATEGORY",
                        "init", "icon"));
        cache.save("ballerinax", "ai.bogus", "1.0.0", bad);

        Optional<List<CachedComponent>> loaded = cache.load("ballerinax", "ai.bogus", "1.0.0");

        Assert.assertTrue(loaded.isEmpty());
    }

    @Test(description = "Verifies a load with a null version short-circuits to empty without touching the filesystem.")
    public void testNullVersionBypassesLoad() {
        Optional<List<CachedComponent>> loaded = cache.load("ballerinax", "ai.openai", null);
        Assert.assertTrue(loaded.isEmpty());
    }

    @Test(description = "Verifies a save with a null version is a no-op and writes no files.")
    public void testNullVersionBypassesSave() throws IOException {
        cache.save("ballerinax", "ai.openai", null, List.of(
                new CachedComponent("X", "l", "d", NodeKind.MODEL_PROVIDER.name(),
                        "init", "icon")));

        try (var stream = Files.list(tempDir)) {
            Assert.assertEquals(stream.count(), 0L,
                    "save() with null version must not write any files");
        }
    }

    @Test(description = "Verifies a disk write failure disables the cache so subsequent saves become no-ops.")
    public void testDiskWriteFailureDisablesCache() throws IOException {
        // Block the cache directory path with a regular file so createDirectories will fail
        Path blockedCachePath = Files.createTempFile("blocked-cache-path", ".txt");
        AiComponentDiskCache blockedCache = new AiComponentDiskCache(blockedCachePath);
        try {
            List<CachedComponent> components = List.of(
                    new CachedComponent("X", "l", "d", NodeKind.MODEL_PROVIDER.name(),
                            "init", "icon"));

            // First save fails because the cache path is a regular file — disables the cache
            blockedCache.save("ballerinax", "ai.blocked", "1.0.0", components);

            // Remove the blocker so the path is free
            Files.delete(blockedCachePath);

            // Second save must be a no-op now; if the cache were still enabled,
            // createDirectories would create a directory at blockedCachePath
            blockedCache.save("ballerinax", "ai.blocked", "1.0.0", components);

            Assert.assertFalse(Files.exists(blockedCachePath),
                    "disabled cache must not create the cache directory on subsequent saves");
        } finally {
            Files.deleteIfExists(blockedCachePath);
        }
    }

    private Path findCacheFile() throws IOException {
        try (var stream = Files.list(tempDir)) {
            return stream.filter(p -> !p.getFileName().toString().startsWith("tmp_"))
                    .findFirst()
                    .orElseThrow(() -> new IllegalStateException("no cache file found in " + tempDir));
        }
    }

    private static void deleteRecursively(Path root) throws IOException {
        if (root == null || Files.notExists(root)) {
            return;
        }
        try (var paths = Files.walk(root)) {
            paths.sorted((left, right) -> right.getNameCount() - left.getNameCount())
                    .forEach(path -> {
                        try {
                            Files.deleteIfExists(path);
                        } catch (IOException e) {
                            throw new RuntimeException(e);
                        }
                    });
        } catch (RuntimeException e) {
            if (e.getCause() instanceof IOException ioException) {
                throw ioException;
            }
            throw e;
        }
    }
}
