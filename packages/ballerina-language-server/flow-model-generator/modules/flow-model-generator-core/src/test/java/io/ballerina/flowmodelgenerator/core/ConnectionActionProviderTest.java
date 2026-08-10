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

import io.ballerina.flowmodelgenerator.core.model.AvailableNode;
import io.ballerina.flowmodelgenerator.core.model.Category;
import io.ballerina.flowmodelgenerator.core.model.Codedata;
import io.ballerina.flowmodelgenerator.core.model.Item;
import io.ballerina.flowmodelgenerator.core.model.Metadata;
import io.ballerina.flowmodelgenerator.core.model.NodeKind;
import io.ballerina.modelgenerator.commons.ModuleInfo;
import org.testng.Assert;
import org.testng.annotations.AfterMethod;
import org.testng.annotations.BeforeMethod;
import org.testng.annotations.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Tests for {@link ConnectionActionProvider}.
 *
 * @since 1.7.0
 */
public class ConnectionActionProviderTest {

    private Path tempDir;
    private ConnectionActionProvider provider;

    @BeforeMethod
    public void setup() throws IOException {
        tempDir = Files.createTempDirectory("connection-action-provider-test");
        provider = new ConnectionActionProvider(tempDir, 25);
    }

    @AfterMethod
    public void cleanup() throws IOException {
        provider.clearAll();
        deleteRecursively(tempDir);
    }

    @Test(description = "Verifies the cache key format is stable for connector identity fields.")
    public void testCacheKeyGeneration() {
        String key = ConnectionActionProvider.generateKey("ballerina", "http", "http", "Client", "2.15.1");
        Assert.assertEquals(key, "ballerina:http:http:Client:2.15.1");
    }

    @Test(description = "Verifies a built entry is reused from memory without rebuilding on a second lookup.")
    public void testBuildCachesInMemory() {
        String key = "ballerina:http:http:Client:cache-hit";
        AtomicInteger buildCount = new AtomicInteger();
        List<Item> expected = List.of(availableNode("listPets", null, null));

        List<Item> first = provider.getOrBuild(key, () -> {
            buildCount.incrementAndGet();
            return expected;
        });
        List<Item> second = provider.getOrBuild(key, () -> {
            buildCount.incrementAndGet();
            return List.of(availableNode("should-not-build", null, null));
        });

        Assert.assertEquals(buildCount.get(), 1);
        Assert.assertEquals(first, expected);
        Assert.assertEquals(second, expected);
    }

    @Test(description = "Verifies non-cacheable connector contexts bypass memory and disk cache.")
    public void testGetOrBuildCachesRegardlessOfOrg() {
        String key = "acme:local_cache_test:local_cache_test:LocalClient:0.1.0";
        AtomicInteger buildCount = new AtomicInteger();
        ConnectionActionProvider.ConnectorContext context = new ConnectionActionProvider.ConnectorContext(
                key,
                null,
                "LocalClient",
                new ModuleInfo("acme", "local_cache_test", "local_cache_test", "0.1.0"),
                null,
                false,
                false,
                null,
                null,
                false);

        List<Item> first = provider.getOrBuildTemplates(context, () -> {
            buildCount.incrementAndGet();
            return List.of(availableNode("ping", null, null));
        });
        List<Item> second = provider.getOrBuildTemplates(context, () -> {
            buildCount.incrementAndGet();
            return List.of(availableNode("pong", null, null));
        });

        Assert.assertEquals(buildCount.get(), 2);
        Assert.assertEquals(first, List.of(availableNode("ping", null, null)));
        Assert.assertEquals(second, List.of(availableNode("pong", null, null)));
        Assert.assertFalse(Files.exists(provider.cacheFilePath(key)));
    }

    @Test(description = "Verifies a persisted cache entry is reloaded from disk by a fresh provider instance.")
    public void testCachePersistsToDiskAndLoadsFromFreshProvider() {
        String key = "ballerina:http:http:Client:disk-hit";
        AtomicInteger buildCount = new AtomicInteger();
        List<Item> expected = List.of(availableNode("createOrder", null, null));

        provider.getOrBuild(key, () -> {
            buildCount.incrementAndGet();
            return expected;
        });
        Assert.assertTrue(Files.exists(provider.cacheFilePath(key)));

        ConnectionActionProvider freshProvider = new ConnectionActionProvider(tempDir, 25);
        try {
            List<Item> actual = freshProvider.getOrBuild(key, () -> {
                buildCount.incrementAndGet();
                return List.of(availableNode("should-not-build", null, null));
            });

            Assert.assertEquals(buildCount.get(), 1);
            Assert.assertEquals(actual, expected);
        } finally {
            freshProvider.clearAll();
        }
    }

    @Test(description = "Verifies an unreadable cache file is treated as a miss and rebuilt successfully.")
    public void testCorruptDiskFileTriggersRebuild() throws IOException {
        String key = "ballerina:http:http:Client:corrupt-entry";
        Files.createDirectories(tempDir);
        Files.writeString(provider.cacheFilePath(key), "{ not-json");

        AtomicInteger buildCount = new AtomicInteger();
        List<Item> expected = List.of(availableNode("recovered", null, null));

        List<Item> actual = provider.getOrBuild(key, () -> {
            buildCount.incrementAndGet();
            return expected;
        });

        Assert.assertEquals(buildCount.get(), 1);
        Assert.assertEquals(actual, expected);
        Assert.assertTrue(Files.readString(provider.cacheFilePath(key)).contains("\"metadata\""));
    }

    @Test(description = "Verifies explicit invalidation removes the corresponding persisted cache file.")
    public void testInvalidateDeletesDiskFile() {
        String key = "ballerina:http:http:Client:invalidate";
        provider.getOrBuild(key, () -> List.of(availableNode("deleteCache", null, null)));
        Path cacheFile = provider.cacheFilePath(key);

        Assert.assertTrue(Files.exists(cacheFile));
        provider.invalidate(key);
        provider.cleanUp();

        Assert.assertFalse(Files.exists(cacheFile));
    }

    @Test(description = "Verifies size-based eviction removes only the in-memory entry and keeps the disk copy.")
    public void testSizeEvictionKeepsDiskFile() {
        ConnectionActionProvider sizeBoundProvider = new ConnectionActionProvider(tempDir, 1);
        try {
            AtomicInteger buildCount = new AtomicInteger();
            String firstKey = "ballerina:http:http:Client:one";
            String secondKey = "ballerina:http:http:Client:two";
            sizeBoundProvider.getOrBuild(firstKey, () -> {
                buildCount.incrementAndGet();
                return List.of(availableNode("one", null, null));
            });
            sizeBoundProvider.getOrBuild(secondKey, () -> {
                buildCount.incrementAndGet();
                return List.of(availableNode("two", null, null));
            });
            sizeBoundProvider.cleanUp();

            Assert.assertTrue(Files.exists(sizeBoundProvider.cacheFilePath(firstKey)));

            List<Item> reloaded = sizeBoundProvider.getOrBuild(firstKey, () -> {
                buildCount.incrementAndGet();
                return List.of(availableNode("should-not-build", null, null));
            });

            Assert.assertEquals(buildCount.get(), 2);
            Assert.assertEquals(reloaded, List.of(availableNode("one", null, null)));
        } finally {
            sizeBoundProvider.clearAll();
        }
    }

    @Test(description = "Verifies nested Item implementations serialize and deserialize correctly through Gson.")
    public void testPolymorphicSerializationRoundTrip() {
        String key = "ballerina:http:http:Client:polymorphic";
        List<Item> expected = List.of(new Category(
                new Metadata("Connections", "Connector actions", null, null, null, null, null, null),
                List.of(availableNode("query", null, null), availableNode("close", null, null))));

        provider.getOrBuild(key, () -> expected);

        ConnectionActionProvider freshProvider = new ConnectionActionProvider(tempDir, 25);
        try {
            List<Item> actual = freshProvider.getOrBuild(key, List::of);

            Assert.assertEquals(actual, expected);
            Assert.assertTrue(actual.get(0) instanceof Category);
            Assert.assertTrue(((Category) actual.get(0)).items().get(0) instanceof AvailableNode);
        } finally {
            freshProvider.clearAll();
        }
    }

    @Test(description = "Verifies parent-symbol rebinding returns caller-specific nodes without mutating templates.")
    public void testBindForParentSymbolDoesNotMutateCachedTemplates() {
        String key = "ballerina:http:http:Client:binding";
        List<Item> templates = provider.getOrBuild(key, () -> List.of(availableNode("invoke", null, null)));

        List<Item> firstBound = provider.bindForParentSymbol(templates, "clientA", Map.of("invoke", true),
                Map.of(), Map.of());
        List<Item> secondBound = provider.bindForParentSymbol(templates, "clientB", Map.of(), Map.of(), Map.of());

        AvailableNode original = (AvailableNode) templates.get(0);
        AvailableNode first = (AvailableNode) firstBound.get(0);
        AvailableNode second = (AvailableNode) secondBound.get(0);

        Assert.assertNull(original.codedata().parentSymbol());
        Assert.assertEquals(first.codedata().parentSymbol(), "clientA");
        Assert.assertEquals(((Map<?, ?>) first.codedata().data()).get("agentToolCompatible"), true);
        Assert.assertEquals(second.codedata().parentSymbol(), "clientB");
        Assert.assertNull(second.codedata().data());
    }

    @Test(description = "Verifies disk write failures do not prevent successful in-memory cache population.")
    public void testDiskFailureFallsBackToMemory() throws IOException {
        Path invalidCacheRoot = Files.createTempFile("connection-action-provider-invalid", ".tmp");
        ConnectionActionProvider invalidProvider = new ConnectionActionProvider(invalidCacheRoot, 25);
        try {
            List<Item> expected = List.of(availableNode("memoryOnly", null, null));

            List<Item> actual = invalidProvider.getOrBuild("ballerina:http:http:Client:memory-only", () -> expected);

            Assert.assertEquals(actual, expected);
            Assert.assertFalse(Files.isDirectory(invalidCacheRoot));
        } finally {
            invalidProvider.clearAll();
            Files.deleteIfExists(invalidCacheRoot);
        }
    }

    @Test(description = "Verifies concurrent requests for the same missing key trigger only one build.")
    public void testConcurrentMissBuildsOnce() throws InterruptedException, ExecutionException {
        String key = "ballerina:http:http:Client:concurrent";
        ExecutorService executor = Executors.newFixedThreadPool(4);
        CountDownLatch ready = new CountDownLatch(4);
        CountDownLatch start = new CountDownLatch(1);
        AtomicInteger buildCount = new AtomicInteger();

        Callable<List<Item>> task = () -> {
            ready.countDown();
            Assert.assertTrue(start.await(5, TimeUnit.SECONDS));
            return provider.getOrBuild(key, () -> {
                buildCount.incrementAndGet();
                try {
                    Thread.sleep(50);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    throw new RuntimeException(e);
                }
                return List.of(availableNode("shared", null, null));
            });
        };

        try {
            Future<List<Item>> first = executor.submit(task);
            Future<List<Item>> second = executor.submit(task);
            Future<List<Item>> third = executor.submit(task);
            Future<List<Item>> fourth = executor.submit(task);

            Assert.assertTrue(ready.await(5, TimeUnit.SECONDS));
            start.countDown();

            List<Item> expected = List.of(availableNode("shared", null, null));
            Assert.assertEquals(first.get(), expected);
            Assert.assertEquals(second.get(), expected);
            Assert.assertEquals(third.get(), expected);
            Assert.assertEquals(fourth.get(), expected);
            Assert.assertEquals(buildCount.get(), 1);
        } finally {
            executor.shutdownNow();
        }
    }

    private static AvailableNode availableNode(String symbol, String parentSymbol, Map<String, Object> data) {
        return new AvailableNode(
                new Metadata(symbol, symbol + " description", null, "icon-" + symbol, null, null, null, null),
                new Codedata(NodeKind.METHOD_CALL, "ballerina", "http", "http", "Client", symbol, "1.0.0",
                        null, null, parentSymbol, null, null, false, false, null, data),
                true);
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
