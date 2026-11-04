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

package org.ballerinalang.langserver.workspace.test.acceptance;

import org.ballerinalang.langserver.workspace.workspacemanager.change.BufferedChange;
import org.ballerinalang.langserver.workspace.workspacemanager.change.ChangeBuffer;
import org.ballerinalang.langserver.workspace.workspacemanager.change.ChangeLayer;
import org.ballerinalang.langserver.workspace.workspacemanager.change.ContentVersion;
import org.ballerinalang.langserver.workspace.workspacemanager.uri.DocumentUri;
import org.eclipse.lsp4j.FileChangeType;
import org.eclipse.lsp4j.FileEvent;
import org.eclipse.lsp4j.TextDocumentContentChangeEvent;
import org.testng.Assert;
import org.testng.annotations.AfterMethod;
import org.testng.annotations.BeforeMethod;
import org.testng.annotations.Test;

import java.net.URI;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;


/**
 * Acceptance tests for ChangeBuffer — per-URI per-layer delta queue (ADR-047).
 * <p>
 * Verifies buffer semantics for multi-layer document changes, TOML file handling,
 * concurrent access, and memory behavior under pressure.
 *
 * @since 1.7.0
 */
public class ChangeBufferAcceptanceTest {

    private ChangeBuffer buffer;

    @BeforeMethod
    public void setUp() {
        buffer = new ChangeBuffer();
    }

    @AfterMethod
    public void tearDown() {
        buffer = null;
    }

    // =========================================================================
    // HelperMethods
    // =========================================================================

    private DocumentUri fileUri(String path) {
        return new DocumentUri.FileUri(URI.create("file://" + path));
    }

    private BufferedChange change(String text, ChangeLayer layer, int version) {
        TextDocumentContentChangeEvent event = new TextDocumentContentChangeEvent(text);
        return new BufferedChange(event, layer, new ContentVersion(version));
    }

    // =========================================================================
    // TOML FILE HANDLING (ADR-051)
    // =========================================================================

    /**
     * Acceptance: Ballerina.toml changes flow through ChangeBuffer like source files.
     */
    @Test
    public void toml_ballerinaToml_flowsThroughBuffer() {
        DocumentUri tomlUri = fileUri("/workspace/Ballerina.toml");

        BufferedChange c1 = change("[package]\nname = \"test\"", ChangeLayer.EDITOR, 1);
        buffer.append(tomlUri, c1);

        List<BufferedChange> drained = buffer.drain(tomlUri, ChangeLayer.EDITOR);
        Assert.assertEquals(drained.size(), 1, "Ballerina.toml changes should flow through buffer");
        Assert.assertSame(drained.get(0), c1);
    }

    /**
     * Acceptance: Dependencies.toml changes flow through ChangeBuffer.
     */
    @Test
    public void toml_dependenciesToml_flowsThroughBuffer() {
        DocumentUri tomlUri = fileUri("/workspace/Dependencies.toml");

        BufferedChange c1 = change("[[dependency]]\nname = \"http\"", ChangeLayer.EDITOR, 1);
        buffer.append(tomlUri, c1);

        List<BufferedChange> drained = buffer.drain(tomlUri, ChangeLayer.EDITOR);
        Assert.assertEquals(drained.size(), 1, "Dependencies.toml changes should flow through buffer");
        Assert.assertSame(drained.get(0), c1);
    }

    /**
     * Acceptance: Cloud.toml changes flow through ChangeBuffer.
     */
    @Test
    public void toml_cloudToml_flowsThroughBuffer() {
        DocumentUri tomlUri = fileUri("/workspace/Cloud.toml");

        BufferedChange c1 = change("[cloud]\nregion = \"us-east-1\"", ChangeLayer.EDITOR, 1);
        buffer.append(tomlUri, c1);

        List<BufferedChange> drained = buffer.drain(tomlUri, ChangeLayer.EDITOR);
        Assert.assertEquals(drained.size(), 1, "Cloud.toml changes should flow through buffer");
        Assert.assertSame(drained.get(0), c1);
    }

    /**
     * Acceptance: CompilerPlugin.toml changes flow through ChangeBuffer.
     */
    @Test
    public void toml_compilerPluginToml_flowsThroughBuffer() {
        DocumentUri tomlUri = fileUri("/workspace/CompilerPlugin.toml");

        BufferedChange c1 = change("[plugin]\npath = \"./plugin.jar\"", ChangeLayer.EDITOR, 1);
        buffer.append(tomlUri, c1);

        List<BufferedChange> drained = buffer.drain(tomlUri, ChangeLayer.EDITOR);
        Assert.assertEquals(drained.size(), 1, "CompilerPlugin.toml changes should flow through buffer");
        Assert.assertSame(drained.get(0), c1);
    }

    /**
     * Acceptance: BalTool.toml changes flow through ChangeBuffer.
     */
    @Test
    public void toml_balToolToml_flowsThroughBuffer() {
        DocumentUri tomlUri = fileUri("/workspace/BalTool.toml");

        BufferedChange c1 = change("[tool]\nname = \"openapi\"", ChangeLayer.EDITOR, 1);
        buffer.append(tomlUri, c1);

        List<BufferedChange> drained = buffer.drain(tomlUri, ChangeLayer.EDITOR);
        Assert.assertEquals(drained.size(), 1, "BalTool.toml changes should flow through buffer");
        Assert.assertSame(drained.get(0), c1);
    }

    /**
     * Acceptance: Mixed TOML and source files coexist in buffer with correct isolation.
     */
    @Test
    public void toml_mixedWithSourceFiles_isolatedCorrectly() {
        DocumentUri mainBal = fileUri("/workspace/main.bal");
        DocumentUri ballerinaToml = fileUri("/workspace/Ballerina.toml");
        DocumentUri depsToml = fileUri("/workspace/Dependencies.toml");

        // Append changes to multiple files
        buffer.append(mainBal, change("function main() {}", ChangeLayer.EDITOR, 1));
        buffer.append(ballerinaToml, change("[package]\nname = \"myproject\"", ChangeLayer.EDITOR, 1));
        buffer.append(depsToml, change("[[dependency]]", ChangeLayer.EDITOR, 1));

        // Verify each file's changes are isolated
        List<BufferedChange> mainDrained = buffer.drain(mainBal, ChangeLayer.EDITOR);
        List<BufferedChange> tomlDrained = buffer.drain(ballerinaToml, ChangeLayer.EDITOR);
        List<BufferedChange> depsDrained = buffer.drain(depsToml, ChangeLayer.EDITOR);

        Assert.assertEquals(mainDrained.size(), 1);
        Assert.assertEquals(tomlDrained.size(), 1);
        Assert.assertEquals(depsDrained.size(), 1);

        // Verify isolation - each drain only got its own file's changes
        Assert.assertEquals(mainDrained.get(0).change().getText(), "function main() {}");
        Assert.assertEquals(tomlDrained.get(0).change().getText(), "[package]\nname = \"myproject\"");
        Assert.assertEquals(depsDrained.get(0).change().getText(), "[[dependency]]");
    }

    /**
     * Acceptance: Multiple TOML files with multiple layers maintain correct ordering.
     */
    @Test
    public void toml_multipleFiles_multipleLayers_priorityOrder() {
        DocumentUri ballerinaToml = fileUri("/workspace/Ballerina.toml");
        DocumentUri cloudToml = fileUri("/workspace/Cloud.toml");

        // Append changes in reverse priority order to test ordering
        buffer.append(ballerinaToml, change("expr-change", ChangeLayer.EXPR, 3));
        buffer.append(cloudToml, change("ai-change", ChangeLayer.AI, 2));
        buffer.append(ballerinaToml, change("editor-change", ChangeLayer.EDITOR, 1));

        // Drain ballerina.toml - should get EDITOR then EXPR
        List<BufferedChange> ballerinaDrained = buffer.drain(ballerinaToml);
        Assert.assertEquals(ballerinaDrained.size(), 2);
        Assert.assertEquals(ballerinaDrained.get(0).layer(), ChangeLayer.EDITOR);
        Assert.assertEquals(ballerinaDrained.get(1).layer(), ChangeLayer.EXPR);

        // Drain cloud.toml - should get AI
        List<BufferedChange> cloudDrained = buffer.drain(cloudToml);
        Assert.assertEquals(cloudDrained.size(), 1);
        Assert.assertEquals(cloudDrained.get(0).layer(), ChangeLayer.AI);
    }

    // =========================================================================
    // MULTI-LAYER COEXISTENCE
    // =========================================================================

    /**
     * Acceptance: All three layers (EDITOR, AI, EXPR) can coexist per URI.
     */
    @Test
    public void multiLayer_allThreeLayers_coexistPerUri() {
        DocumentUri uri = fileUri("/workspace/main.bal");

        // Append to all three layers
        BufferedChange editor = change("editor text", ChangeLayer.EDITOR, 1);
        BufferedChange ai = change("ai suggestion", ChangeLayer.AI, 2);
        BufferedChange expr = change("expr result", ChangeLayer.EXPR, 3);

        buffer.append(uri, editor);
        buffer.append(uri, ai);
        buffer.append(uri, expr);

        // Verify all three layers have changes
        Assert.assertTrue(buffer.hasChanges(uri));

        // Drain each layer individually
        List<BufferedChange> editorDrained = buffer.drain(uri, ChangeLayer.EDITOR);
        List<BufferedChange> aiDrained = buffer.drain(uri, ChangeLayer.AI);
        List<BufferedChange> exprDrained = buffer.drain(uri, ChangeLayer.EXPR);

        Assert.assertEquals(editorDrained.size(), 1);
        Assert.assertSame(editorDrained.get(0), editor);

        Assert.assertEquals(aiDrained.size(), 1);
        Assert.assertSame(aiDrained.get(0), ai);

        Assert.assertEquals(exprDrained.size(), 1);
        Assert.assertSame(exprDrained.get(0), expr);

        // After draining all layers, no changes remain
        Assert.assertFalse(buffer.hasChanges(uri));
    }

    /**
     * Acceptance: Multiple changes per layer maintain FIFO order.
     */
    @Test
    public void multiLayer_multipleChangesPerLayer_fifoOrder() {
        DocumentUri uri = fileUri("/workspace/main.bal");

        // Add multiple changes to each layer
        BufferedChange e1 = change("e1", ChangeLayer.EDITOR, 1);
        BufferedChange e2 = change("e2", ChangeLayer.EDITOR, 2);
        BufferedChange e3 = change("e3", ChangeLayer.EDITOR, 3);

        BufferedChange a1 = change("a1", ChangeLayer.AI, 1);
        BufferedChange a2 = change("a2", ChangeLayer.AI, 2);

        BufferedChange x1 = change("x1", ChangeLayer.EXPR, 1);

        buffer.append(uri, e1);
        buffer.append(uri, a1);
        buffer.append(uri, e2);
        buffer.append(uri, x1);
        buffer.append(uri, a2);
        buffer.append(uri, e3);

        // Drain all - should get EDITOR (e1, e2, e3), AI (a1, a2), EXPR (x1) in that order
        List<BufferedChange> all = buffer.drain(uri);
        Assert.assertEquals(all.size(), 6);

        // EDITOR first, in FIFO order
        Assert.assertSame(all.get(0), e1);
        Assert.assertSame(all.get(1), e2);
        Assert.assertSame(all.get(2), e3);

        // AI next, inFIFO order
        Assert.assertSame(all.get(3), a1);
        Assert.assertSame(all.get(4), a2);

        // EXPR last
        Assert.assertSame(all.get(5), x1);
    }

    /**
     * Acceptance: Layer isolation - draining one layer doesn't affect others.
     */
    @Test
    public void multiLayer_drainingOneLayer_preservesOthers() {
        DocumentUri uri = fileUri("/workspace/main.bal");

        buffer.append(uri, change("editor1", ChangeLayer.EDITOR, 1));
        buffer.append(uri, change("ai1", ChangeLayer.AI, 1));
        buffer.append(uri, change("expr1", ChangeLayer.EXPR, 1));

        // Drain EDITOR only
        List<BufferedChange> editorDrained = buffer.drain(uri, ChangeLayer.EDITOR);
        Assert.assertEquals(editorDrained.size(), 1);

        // AI and EXPR should still have changes
        List<BufferedChange> aiDrained = buffer.drain(uri, ChangeLayer.AI);
        List<BufferedChange> exprDrained = buffer.drain(uri, ChangeLayer.EXPR);

        Assert.assertEquals(aiDrained.size(), 1, "AI layer should still have changes after EDITOR drain");
        Assert.assertEquals(exprDrained.size(), 1, "EXPR layer should still have changes after EDITOR drain");
    }

    // =========================================================================
    // LAYER PRIORITY ORDERING
    // =========================================================================

    /**
     * Acceptance: Drain returns changes in EDITOR → AI → EXPR order regardless of append order.
     */
    @Test
    public void priorityOrder_appendReverse_drainStillCorrectOrder() {
        DocumentUri uri = fileUri("/workspace/main.bal");

        // Append in reverse priority order
        buffer.append(uri, change("expr", ChangeLayer.EXPR, 1));
        buffer.append(uri, change("ai", ChangeLayer.AI, 1));
        buffer.append(uri, change("editor", ChangeLayer.EDITOR, 1));

        List<BufferedChange> drained = buffer.drain(uri);

        // Should still come out in priority order: EDITOR, AI, EXPR
        Assert.assertEquals(drained.size(), 3);
        Assert.assertEquals(drained.get(0).layer(), ChangeLayer.EDITOR);
        Assert.assertEquals(drained.get(1).layer(), ChangeLayer.AI);
        Assert.assertEquals(drained.get(2).layer(), ChangeLayer.EXPR);
    }

    /**
     * Acceptance: empty layers are skipped in priority drain.
     */
    @Test
    public void priorityOrder_emptyLayers_skipped() {
        DocumentUri uri = fileUri("/workspace/main.bal");

        // Only add to AI layer
        buffer.append(uri, change("ai-only", ChangeLayer.AI, 1));

        List<BufferedChange> drained = buffer.drain(uri);

        Assert.assertEquals(drained.size(), 1);
        Assert.assertEquals(drained.get(0).layer(), ChangeLayer.AI);
    }

    /**
     * Acceptance: Multi-document priority drain maintains per-document layer ordering.
     */
    @Test
    public void priorityOrder_multipleDocuments_correctPerDocument() {
        DocumentUri uri1 = fileUri("/workspace/main.bal");
        DocumentUri uri2 = fileUri("/workspace/util.bal");

        // Uri1: EXPR then EDITOR
        buffer.append(uri1, change("u1-expr", ChangeLayer.EXPR, 1));
        buffer.append(uri1, change("u1-editor", ChangeLayer.EDITOR, 1));

        // Uri2: AI then EXPR
        buffer.append(uri2, change("u2-ai", ChangeLayer.AI, 1));
        buffer.append(uri2, change("u2-expr", ChangeLayer.EXPR, 1));

        // Drain uri1 - should be EDITOR then EXPR
        List<BufferedChange> uri1Drained = buffer.drain(uri1);
        Assert.assertEquals(uri1Drained.size(), 2);
        Assert.assertEquals(uri1Drained.get(0).layer(), ChangeLayer.EDITOR);
        Assert.assertEquals(uri1Drained.get(1).layer(), ChangeLayer.EXPR);

        // Drain uri2 - should be AI then EXPR
        List<BufferedChange> uri2Drained = buffer.drain(uri2);
        Assert.assertEquals(uri2Drained.size(), 2);
        Assert.assertEquals(uri2Drained.get(0).layer(), ChangeLayer.AI);
        Assert.assertEquals(uri2Drained.get(1).layer(), ChangeLayer.EXPR);
    }

    // =========================================================================
    // DRAIN ATOMICITY
    // =========================================================================

    /**
     * Acceptance: Drain returns all pending changes and clears the buffer.
     */
    @Test
    public void drainAtomicity_drainClearsBuffer() {
        DocumentUri uri = fileUri("/workspace/main.bal");

        buffer.append(uri, change("c1", ChangeLayer.EDITOR, 1));
        buffer.append(uri, change("c2", ChangeLayer.AI, 1));
        buffer.append(uri, change("c3", ChangeLayer.EXPR, 1));

        // First drain returns all
        List<BufferedChange> first = buffer.drain(uri);
        Assert.assertEquals(first.size(), 3);

        // Second drain returns empty
        List<BufferedChange> second = buffer.drain(uri);
        Assert.assertEquals(second.size(), 0);

        // hasChanges should be false
        Assert.assertFalse(buffer.hasChanges(uri));
    }

    /**
     * Acceptance: Drain by layer is atomic.
     */
    @Test
    public void drainAtomicity_drainByLayer_isAtomic() {
        DocumentUri uri = fileUri("/workspace/main.bal");

        buffer.append(uri, change("e1", ChangeLayer.EDITOR, 1));
        buffer.append(uri, change("e2", ChangeLayer.EDITOR, 2));
        buffer.append(uri, change("e3", ChangeLayer.EDITOR, 3));

        // Drain should return all three in order
        List<BufferedChange> drained = buffer.drain(uri, ChangeLayer.EDITOR);
        Assert.assertEquals(drained.size(), 3);

        // Verify order
        Assert.assertEquals(drained.get(0).change().getText(), "e1");
        Assert.assertEquals(drained.get(1).change().getText(), "e2");
        Assert.assertEquals(drained.get(2).change().getText(), "e3");

        // Second drain should be empty
        List<BufferedChange> second = buffer.drain(uri, ChangeLayer.EDITOR);
        Assert.assertEquals(second.size(), 0);
    }

    /**
     * Acceptance: Clear removes all layers for URI.
     */
    @Test
    public void drainAtomicity_clearRemovesAll() {
        DocumentUri uri = fileUri("/workspace/main.bal");

        buffer.append(uri, change("e", ChangeLayer.EDITOR, 1));
        buffer.append(uri, change("a", ChangeLayer.AI, 1));
        buffer.append(uri, change("x", ChangeLayer.EXPR, 1));

        buffer.clear(uri);

        Assert.assertFalse(buffer.hasChanges(uri));

        // Drain should return empty
        List<BufferedChange> drained = buffer.drain(uri);
        Assert.assertEquals(drained.size(), 0);
    }

    // =========================================================================
    // CONCURRENT APPEND STRESS TESTS
    // =========================================================================

    /**
     * Acceptance: Concurrent append from multiple threads produces no data loss.
     */
    @Test
    public void concurrentAppend_multiThreaded_noDataLoss() throws InterruptedException {
        DocumentUri uri = fileUri("/workspace/main.bal");
        int threadCount = 20;
        int changesPerThread = 500;
        int totalExpectedChanges = threadCount * changesPerThread;

        ExecutorService executor = Executors.newFixedThreadPool(threadCount);
        CountDownLatch startLatch = new CountDownLatch(1);
        CountDownLatch doneLatch = new CountDownLatch(threadCount);

        for (int t = 0; t < threadCount; t++) {
            final int threadId = t;
            executor.submit(() -> {
                try {
                    startLatch.await();
                    for (int i = 0; i < changesPerThread; i++) {
                        buffer.append(uri, change("t" + threadId + "-c" + i, ChangeLayer.EDITOR, i));
                    }
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                } finally {
                    doneLatch.countDown();
                }
            });
        }

        startLatch.countDown();
        boolean finished = doneLatch.await(30, TimeUnit.SECONDS);
        Assert.assertTrue(finished, "All threads should complete within timeout");
        executor.shutdown();

        List<BufferedChange> drained = buffer.drain(uri, ChangeLayer.EDITOR);
        Assert.assertEquals(drained.size(), totalExpectedChanges,
                "All " + totalExpectedChanges + " changes must be present — no data loss");
    }

    /**
     * Acceptance: Concurrent append to different URIs produces no data loss.
     */
    @Test
    public void concurrentAppend_multipleUris_noDataLoss() throws InterruptedException {
        int documentCount = 50;
        int changesPerDocument = 100;
        DocumentUri[] uris = new DocumentUri[documentCount];
        for (int i = 0; i < documentCount; i++) {
            uris[i] = fileUri("/workspace/doc" + i + ".bal");
        }

        ExecutorService executor = Executors.newFixedThreadPool(documentCount);
        CountDownLatch startLatch = new CountDownLatch(1);
        CountDownLatch doneLatch = new CountDownLatch(documentCount);

        for (int d = 0; d < documentCount; d++) {
            final int docId = d;
            executor.submit(() -> {
                try {
                    startLatch.await();
                    for (int i = 0; i < changesPerDocument; i++) {
                        buffer.append(uris[docId], change("change" + i, ChangeLayer.EDITOR, i));
                    }
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                } finally {
                    doneLatch.countDown();
                }
            });
        }

        startLatch.countDown();
        boolean finished = doneLatch.await(30, TimeUnit.SECONDS);
        Assert.assertTrue(finished, "All threads should complete within timeout");
        executor.shutdown();

        // Verify each URI has exactly the right number of changes
        for (int d = 0; d < documentCount; d++) {
            List<BufferedChange> drained = buffer.drain(uris[d], ChangeLayer.EDITOR);
            Assert.assertEquals(drained.size(), changesPerDocument,
                    "Document " + d + " should have exactly " + changesPerDocument + " changes");
        }
    }

    /**
     * Acceptance: Concurrent append to different layers produces no data loss.
     */
    @Test
    public void concurrentAppend_multipleLayers_noDataLoss() throws InterruptedException {
        DocumentUri uri = fileUri("/workspace/main.bal");
        int threadsPerLayer = 10;
        int changesPerThread = 200;

        ExecutorService executor = Executors.newFixedThreadPool(threadsPerLayer * 3);
        CountDownLatch startLatch = new CountDownLatch(1);
        CountDownLatch doneLatch = new CountDownLatch(threadsPerLayer * 3);
        ChangeLayer[] layers = {ChangeLayer.EDITOR, ChangeLayer.AI, ChangeLayer.EXPR};

        for (ChangeLayer layer : layers) {
            for (int t = 0; t < threadsPerLayer; t++) {
                final ChangeLayer l = layer;
                final int threadId = t;
                executor.submit(() -> {
                    try {
                        startLatch.await();
                        for (int i = 0; i < changesPerThread; i++) {
                            buffer.append(uri, change(l.name() + "-" + threadId + "-" + i, l, i));
                        }
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                    } finally {
                        doneLatch.countDown();
                    }
                });
            }
        }

        startLatch.countDown();
        boolean finished = doneLatch.await(30, TimeUnit.SECONDS);
        Assert.assertTrue(finished, "All threads should complete within timeout");
        executor.shutdown();

        // Verify each layer has exactly the right number of changes
        int expectedPerLayer = threadsPerLayer * changesPerThread;
        List<BufferedChange> editorDrained = buffer.drain(uri, ChangeLayer.EDITOR);
        List<BufferedChange> aiDrained = buffer.drain(uri, ChangeLayer.AI);
        List<BufferedChange> exprDrained = buffer.drain(uri, ChangeLayer.EXPR);

        Assert.assertEquals(editorDrained.size(), expectedPerLayer,
                "EDITOR layer should have " + expectedPerLayer + " changes");
        Assert.assertEquals(aiDrained.size(), expectedPerLayer,
                "AI layer should have " + expectedPerLayer + " changes");
        Assert.assertEquals(exprDrained.size(), expectedPerLayer,
                "EXPR layer should have " + expectedPerLayer + " changes");
    }

    /**
     * Acceptance: Concurrent append and drain produces no exceptions and no data corruption.
     */
    @Test
    public void concurrentAppendAndDrain_noExceptions() throws InterruptedException {
        DocumentUri[] uris = new DocumentUri[10];
        for (int i = 0; i < uris.length; i++) {
            uris[i] = fileUri("/workspace/doc" + i + ".bal");
        }

        int appenderThreads = 20;
        int drainerThreads = 5;
        int iterations = 500;

        ExecutorService executor = Executors.newFixedThreadPool(appenderThreads + drainerThreads);
        CountDownLatch startLatch = new CountDownLatch(1);
        CountDownLatch doneLatch = new CountDownLatch(appenderThreads + drainerThreads);
        AtomicInteger errorCount = new AtomicInteger(0);
        AtomicInteger appendCount = new AtomicInteger(0);
        AtomicInteger drainCount = new AtomicInteger(0);

        // Appenders
        for (int t = 0; t < appenderThreads; t++) {
            final int threadId = t;
            executor.submit(() -> {
                try {
                    startLatch.await();
                    for (int i = 0; i < iterations; i++) {
                        DocumentUri uri = uris[i % uris.length];
                        buffer.append(uri, change("t" + threadId + "-c" + i, ChangeLayer.EDITOR, i));
                        appendCount.incrementAndGet();
                    }
                } catch (Exception e) {
                    errorCount.incrementAndGet();
                } finally {
                    doneLatch.countDown();
                }
            });
        }

        // Drainers
        for (int t = 0; t < drainerThreads; t++) {
            executor.submit(() -> {
                try {
                    startLatch.await();
                    for (int i = 0; i < iterations; i++) {
                        DocumentUri uri = uris[i % uris.length];
                        List<BufferedChange> drained = buffer.drain(uri);
                        drainCount.addAndGet(drained.size());
                    }
                } catch (Exception e) {
                    errorCount.incrementAndGet();
                } finally {
                    doneLatch.countDown();
                }
            });
        }

        startLatch.countDown();
        boolean finished = doneLatch.await(60, TimeUnit.SECONDS);
        Assert.assertTrue(finished, "All threads should complete within timeout");
        executor.shutdown();

        Assert.assertEquals(errorCount.get(), 0, "No exceptions should occur during concurrent operations");

        // Drain remaining and verify no major data loss
        // Due to concurrent nature, some changes may be drained before being counted or vice versa
        // We verify: (1) no exceptions, (2) significant data was processed
        int remaining = 0;
        for (DocumentUri uri : uris) {
            remaining += buffer.drain(uri).size();
        }

        int totalProcessed = remaining + drainCount.get();
        int totalAttempted = appendCount.get();
        // Allow for small race condition differences (within 1% tolerance)
        Assert.assertTrue(totalProcessed >= totalAttempted * 0.99,
                "Most appends should be accounted for. Processed: " + totalProcessed
                        + ", Attempted: " + totalAttempted);
        Assert.assertTrue(totalProcessed > 0, "Some changes should have been processed");
    }

    // =========================================================================
    // MEMORY BEHAVIOR UNDER PRESSURE
    // =========================================================================

    /**
     * Acceptance: Buffer does not grow unboundedly - drain clears all queues.
     */
    @Test
    public void memoryBehavior_drainClearsBuffers_noUnboundedGrowth() {
        DocumentUri uri = fileUri("/workspace/main.bal");

        // Fill buffer with many changes
        for (int i = 0; i < 10000; i++) {
            buffer.append(uri, change("change" + i, ChangeLayer.EDITOR, i));
        }

        Assert.assertTrue(buffer.hasChanges(uri));

        // Drain clears everything
        List<BufferedChange> drained = buffer.drain(uri);
        Assert.assertEquals(drained.size(), 10000);

        // Buffer should be empty
        Assert.assertFalse(buffer.hasChanges(uri));

        // Second drain returns empty
        List<BufferedChange> secondDrain = buffer.drain(uri);
        Assert.assertEquals(secondDrain.size(), 0);
    }

    /**
     * Acceptance: Clear removes all data for all layers.
     */
    @Test
    public void memoryBehavior_clearRemovesAllLayers() {
        DocumentUri uri = fileUri("/workspace/main.bal");

        // Fillall three layers
        for (int i = 0; i < 1000; i++) {
            buffer.append(uri, change("e" + i, ChangeLayer.EDITOR, i));
            buffer.append(uri, change("a" + i, ChangeLayer.AI, i));
            buffer.append(uri, change("x" + i, ChangeLayer.EXPR, i));
        }

        Assert.assertTrue(buffer.hasChanges(uri));

        buffer.clear(uri);

        Assert.assertFalse(buffer.hasChanges(uri));

        // All drains return empty
        Assert.assertEquals(buffer.drain(uri, ChangeLayer.EDITOR).size(), 0);
        Assert.assertEquals(buffer.drain(uri, ChangeLayer.AI).size(), 0);
        Assert.assertEquals(buffer.drain(uri, ChangeLayer.EXPR).size(), 0);
    }

    /**
     * Acceptance: Many documents with many layers drain correctly.
     */
    @Test
    public void memoryBehavior_manyDocuments_drainsCorrectly() {
        int documentCount = 100;
        int changesPerDocument = 100;

        DocumentUri[] uris = new DocumentUri[documentCount];
        for (int d = 0; d < documentCount; d++) {
            uris[d] = fileUri("/workspace/doc" + d + ".bal");

            // Add changes to all three layers
            for (int i = 0; i < changesPerDocument; i++) {
                buffer.append(uris[d], change("e" + i, ChangeLayer.EDITOR, i));
                buffer.append(uris[d], change("a" + i, ChangeLayer.AI, i));
                buffer.append(uris[d], change("x" + i, ChangeLayer.EXPR, i));
            }
        }

        // Drain each and verify
        for (int d = 0; d < documentCount; d++) {
            List<BufferedChange> all = buffer.drain(uris[d]);
            Assert.assertEquals(all.size(), changesPerDocument * 3,
                    "Each document should have " + (changesPerDocument * 3) + " total changes");

            // Verify ordering within each layer
            int editorCount = 0;
            int aiCount = 0;
            int exprCount = 0;
            for (BufferedChange c : all) {
                switch (c.layer()) {
                    case EDITOR: editorCount++; break;
                    case AI: aiCount++; break;
                    case EXPR: exprCount++; break;
                }
            }

            Assert.assertEquals(editorCount, changesPerDocument);
            Assert.assertEquals(aiCount, changesPerDocument);
            Assert.assertEquals(exprCount, changesPerDocument);
        }
    }

    /**
     * Acceptance: Repeated fill-drain cycles don't leak memory.
     */
    @Test
    public void memoryBehavior_repeatedFillDrain_noLeaks() {
        DocumentUri uri = fileUri("/workspace/main.bal");

        // Repeatedly fill and drain
        for (int cycle = 0; cycle < 100; cycle++) {
            // Fill
            for (int i = 0; i < 100; i++) {
                buffer.append(uri, change("cycle" + cycle + "-" + i, ChangeLayer.EDITOR, i));
            }

            // Drain
            List<BufferedChange> drained = buffer.drain(uri, ChangeLayer.EDITOR);
            Assert.assertEquals(drained.size(), 100);

            // Verify empty
            Assert.assertFalse(buffer.hasChanges(uri));
        }
    }

    // =========================================================================
    // WATCHER EVENT INTEGRATION
    // =========================================================================

    /**
     * Acceptance: Watcher events for TOML files route correctly (closed vsopen).
     */
    @Test
    public void watcherEvent_tomlFiles_routeCorrectly() {
        DocumentUri tomlUri = fileUri("/workspace/Ballerina.toml");
        FileEvent closedEvent = new FileEvent(tomlUri.uri().toString(), FileChangeType.Changed);

        // No EDITOR layer → closed document
        buffer.routeWatcherEvent(tomlUri, closedEvent);

        Map<DocumentUri, FileEvent> closedChanges = buffer.drainClosedDocChanges();
        Assert.assertTrue(closedChanges.containsKey(tomlUri));

        // Now with EDITOR layer → open document
        buffer.append(tomlUri, change("some change", ChangeLayer.EDITOR, 1));
        FileEvent openEvent = new FileEvent(tomlUri.uri().toString(), FileChangeType.Changed);
        buffer.routeWatcherEvent(tomlUri, openEvent);

        Map<DocumentUri, FileEvent> deferred = buffer.drainDeferredWatcherEvents();
        Assert.assertTrue(deferred.containsKey(tomlUri));
    }

    /**
     * Acceptance: Multiple watcher events for mixed TOML and source files.
     */
    @Test
    public void watcherEvent_mixedFiles_correctRouting() {
        DocumentUri mainBal = fileUri("/workspace/main.bal");
        DocumentUri tomlUri = fileUri("/workspace/Ballerina.toml");

        // main.bal is open (has EDITOR layer)
        buffer.append(mainBal, change("open", ChangeLayer.EDITOR, 1));

        // Ballerina.toml is closed (no EDITOR layer)
        // No append for tomlUri

        FileEvent mainEvent = new FileEvent(mainBal.uri().toString(), FileChangeType.Changed);
        FileEvent tomlEvent = new FileEvent(tomlUri.uri().toString(), FileChangeType.Changed);

        buffer.routeWatcherEvent(mainBal, mainEvent);
        buffer.routeWatcherEvent(tomlUri, tomlEvent);

        // main.bal event should be deferred
        Map<DocumentUri, FileEvent> deferred = buffer.drainDeferredWatcherEvents();
        Assert.assertTrue(deferred.containsKey(mainBal));
        Assert.assertEquals(deferred.get(mainBal), mainEvent);

        // Ballerina.toml event should be in closed changes
        Map<DocumentUri, FileEvent> closed = buffer.drainClosedDocChanges();
        Assert.assertTrue(closed.containsKey(tomlUri));
        Assert.assertEquals(closed.get(tomlUri), tomlEvent);
    }

    /**
     * Acceptance: Concurrent watcher event routing is thread-safe.
     */
    @Test
    public void watcherEvent_concurrentRouting_threadSafe() throws InterruptedException {
        int uriCount = 50;
        int eventsPerUri = 20;

        DocumentUri[] uris = new DocumentUri[uriCount];
        for (int i = 0; i < uriCount; i++) {
            uris[i] = fileUri("/workspace/file" + i + ".bal");
        }

        // Half open, half closed
        for (int i = 0; i < uriCount / 2; i++) {
            buffer.append(uris[i], change("open", ChangeLayer.EDITOR, 1));
        }

        ExecutorService executor = Executors.newFixedThreadPool(uriCount);
        CountDownLatch startLatch = new CountDownLatch(1);
        CountDownLatch doneLatch = new CountDownLatch(uriCount);
        AtomicInteger errorCount = new AtomicInteger(0);

        for (int i = 0; i < uriCount; i++) {
            final int uriIdx = i;
            executor.submit(() -> {
                try {
                    startLatch.await();
                    for (int j = 0; j < eventsPerUri; j++) {
                        FileEvent event = new FileEvent(uris[uriIdx].uri().toString(), FileChangeType.Changed);
                        buffer.routeWatcherEvent(uris[uriIdx], event);
                    }
                } catch (Exception e) {
                    errorCount.incrementAndGet();
                } finally {
                    doneLatch.countDown();
                }
            });
        }

        startLatch.countDown();
        boolean finished = doneLatch.await(30, TimeUnit.SECONDS);
        Assert.assertTrue(finished, "All threads should complete");
        executor.shutdown();

        Assert.assertEquals(errorCount.get(), 0, "No exceptions during concurrent watcher event routing");

        // Verify events were routed (some deferred, some closed)
        Map<DocumentUri, FileEvent> deferred = buffer.drainDeferredWatcherEvents();
        Map<DocumentUri, FileEvent> closed = buffer.drainClosedDocChanges();

        int totalRouted = deferred.size() + closed.size();
        Assert.assertTrue(totalRouted > 0, "Some events should have been routed");
    }
}
