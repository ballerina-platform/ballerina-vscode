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

package org.ballerinalang.langserver.workspace.workspacemanager;

import org.ballerinalang.langserver.workspace.workspacemanager.change.BufferedChange;
import org.ballerinalang.langserver.workspace.workspacemanager.change.ChangeBuffer;
import org.ballerinalang.langserver.workspace.workspacemanager.change.ChangeLayer;
import org.ballerinalang.langserver.workspace.workspacemanager.change.ContentVersion;
import org.ballerinalang.langserver.workspace.workspacemanager.uri.DocumentUri;
import org.eclipse.lsp4j.FileChangeType;
import org.eclipse.lsp4j.FileEvent;
import org.eclipse.lsp4j.TextDocumentContentChangeEvent;
import org.testng.Assert;
import org.testng.annotations.BeforeMethod;
import org.testng.annotations.Test;

import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;


/**
 * Tests for ChangeBuffer — per-URI per-layer delta queue.
 *
 * @since 1.7.0
 */
public class ChangeBufferTest {

    private ChangeBuffer buffer;
    private DocumentUri mainUri;
    private DocumentUri utilUri;

    @BeforeMethod
    public void setUp() {
        buffer = new ChangeBuffer();
        mainUri = new DocumentUri.FileUri(URI.create("file:///workspace/main.bal"));
        utilUri = new DocumentUri.FileUri(URI.create("file:///workspace/util.bal"));
    }

    private BufferedChange makeChange(String text, ChangeLayer layer, int version) {
        TextDocumentContentChangeEvent event = new TextDocumentContentChangeEvent(text);
        return new BufferedChange(event, layer, new ContentVersion(version));
    }

    // =========================================================================
    // append() tests
    // =========================================================================

    @Test
    public void append_addsToBucketForCorrectUri() {
        BufferedChange change = makeChange("hello", ChangeLayer.EDITOR, 1);
        buffer.append(mainUri, change);

        List<BufferedChange> drained = buffer.drain(mainUri, ChangeLayer.EDITOR);
        Assert.assertEquals(drained.size(), 1);
        Assert.assertSame(drained.get(0), change);
    }

    @Test
    public void append_addsToCorrectLayer() {
        BufferedChange editorChange = makeChange("editor", ChangeLayer.EDITOR, 1);
        BufferedChange aiChange = makeChange("ai", ChangeLayer.AI, 1);

        buffer.append(mainUri, editorChange);
        buffer.append(mainUri, aiChange);

        List<BufferedChange> editorDrained = buffer.drain(mainUri, ChangeLayer.EDITOR);
        List<BufferedChange> aiDrained = buffer.drain(mainUri, ChangeLayer.AI);

        Assert.assertEquals(editorDrained.size(), 1);
        Assert.assertSame(editorDrained.get(0), editorChange);
        Assert.assertEquals(aiDrained.size(), 1);
        Assert.assertSame(aiDrained.get(0), aiChange);
    }

    @Test
    public void append_multipleChangesPreserveInsertionOrder() {
        BufferedChange c1 = makeChange("first", ChangeLayer.EDITOR, 1);
        BufferedChange c2 = makeChange("second", ChangeLayer.EDITOR, 2);
        BufferedChange c3 = makeChange("third", ChangeLayer.EDITOR, 3);

        buffer.append(mainUri, c1);
        buffer.append(mainUri, c2);
        buffer.append(mainUri, c3);

        List<BufferedChange> drained = buffer.drain(mainUri, ChangeLayer.EDITOR);
        Assert.assertEquals(drained.size(), 3);
        Assert.assertSame(drained.get(0), c1);
        Assert.assertSame(drained.get(1), c2);
        Assert.assertSame(drained.get(2), c3);
    }

    @Test
    public void append_separateUrisAreIndependent() {
        BufferedChange mainChange = makeChange("main", ChangeLayer.EDITOR, 1);
        BufferedChange utilChange = makeChange("util", ChangeLayer.EDITOR, 1);

        buffer.append(mainUri, mainChange);
        buffer.append(utilUri, utilChange);

        List<BufferedChange> mainDrained = buffer.drain(mainUri, ChangeLayer.EDITOR);
        List<BufferedChange> utilDrained = buffer.drain(utilUri, ChangeLayer.EDITOR);

        Assert.assertEquals(mainDrained.size(), 1);
        Assert.assertSame(mainDrained.get(0), mainChange);
        Assert.assertEquals(utilDrained.size(), 1);
        Assert.assertSame(utilDrained.get(0), utilChange);
    }

    // =========================================================================
    // drain(uri, layer) tests
    // =========================================================================

    @Test
    public void drainByLayer_returnsAllChangesInInsertionOrder() {
        BufferedChange c1 = makeChange("a", ChangeLayer.EDITOR, 1);
        BufferedChange c2 = makeChange("b", ChangeLayer.EDITOR, 2);
        buffer.append(mainUri, c1);
        buffer.append(mainUri, c2);

        List<BufferedChange> result = buffer.drain(mainUri, ChangeLayer.EDITOR);

        Assert.assertEquals(result.size(), 2);
        Assert.assertSame(result.get(0), c1);
        Assert.assertSame(result.get(1), c2);
    }

    @Test
    public void drainByLayer_clearsQueueAfterDrain() {
        buffer.append(mainUri, makeChange("x", ChangeLayer.EDITOR, 1));

        buffer.drain(mainUri, ChangeLayer.EDITOR);

        List<BufferedChange> second = buffer.drain(mainUri, ChangeLayer.EDITOR);
        Assert.assertEquals(second.size(), 0);
    }

    @Test
    public void drainByLayer_emptyUriReturnsEmptyList() {
        List<BufferedChange> result = buffer.drain(mainUri, ChangeLayer.EDITOR);
        Assert.assertNotNull(result);
        Assert.assertEquals(result.size(), 0);
    }

    @Test
    public void drainByLayer_emptyLayerReturnsEmptyList() {
        buffer.append(mainUri, makeChange("x", ChangeLayer.EDITOR, 1));

        List<BufferedChange> result = buffer.drain(mainUri, ChangeLayer.AI);
        Assert.assertNotNull(result);
        Assert.assertEquals(result.size(), 0);
    }

    @Test
    public void drainByLayer_doesNotAffectOtherLayers() {
        BufferedChange editorChange = makeChange("e", ChangeLayer.EDITOR, 1);
        BufferedChange aiChange = makeChange("ai", ChangeLayer.AI, 1);
        buffer.append(mainUri, editorChange);
        buffer.append(mainUri, aiChange);

        buffer.drain(mainUri, ChangeLayer.EDITOR);

        List<BufferedChange> aiRemaining = buffer.drain(mainUri, ChangeLayer.AI);
        Assert.assertEquals(aiRemaining.size(), 1);
        Assert.assertSame(aiRemaining.get(0), aiChange);
    }

    // =========================================================================
    // drain(uri) — all layers in priority order
    // =========================================================================

    @Test
    public void drainAllLayers_returnsPriorityOrder_editorFirst() {
        BufferedChange exprChange = makeChange("expr", ChangeLayer.EXPR, 1);
        BufferedChange aiChange = makeChange("ai", ChangeLayer.AI, 1);
        BufferedChange editorChange = makeChange("editor", ChangeLayer.EDITOR, 1);

        // Append in reverse priority order to prove ordering is not insertion-based
        buffer.append(mainUri, exprChange);
        buffer.append(mainUri, aiChange);
        buffer.append(mainUri, editorChange);

        List<BufferedChange> result = buffer.drain(mainUri);

        // EDITOR first, then AI, then EXPR
        Assert.assertEquals(result.size(), 3);
        Assert.assertEquals(result.get(0).layer(), ChangeLayer.EDITOR);
        Assert.assertEquals(result.get(1).layer(), ChangeLayer.AI);
        Assert.assertEquals(result.get(2).layer(), ChangeLayer.EXPR);
    }

    @Test
    public void drainAllLayers_clearsAllLayers() {
        buffer.append(mainUri, makeChange("e", ChangeLayer.EDITOR, 1));
        buffer.append(mainUri, makeChange("ai", ChangeLayer.AI, 1));
        buffer.append(mainUri, makeChange("x", ChangeLayer.EXPR, 1));

        buffer.drain(mainUri);

        Assert.assertFalse(buffer.hasChanges(mainUri));
    }

    @Test
    public void drainAllLayers_emptyUriReturnsEmptyList() {
        List<BufferedChange> result = buffer.drain(mainUri);
        Assert.assertNotNull(result);
        Assert.assertEquals(result.size(), 0);
    }

    @Test
    public void drainAllLayers_multipleChangesPerLayerPreservedInOrder() {
        BufferedChange e1 = makeChange("e1", ChangeLayer.EDITOR, 1);
        BufferedChange e2 = makeChange("e2", ChangeLayer.EDITOR, 2);
        BufferedChange ai1 = makeChange("ai1", ChangeLayer.AI, 1);

        buffer.append(mainUri, e1);
        buffer.append(mainUri, e2);
        buffer.append(mainUri, ai1);

        List<BufferedChange> result = buffer.drain(mainUri);
        Assert.assertEquals(result.size(), 3);
        Assert.assertSame(result.get(0), e1);
        Assert.assertSame(result.get(1), e2);
        Assert.assertSame(result.get(2), ai1);
    }

    // =========================================================================
    // clear(uri) tests
    // =========================================================================

    @Test
    public void clear_removesAllDataForUri() {
        buffer.append(mainUri, makeChange("e", ChangeLayer.EDITOR, 1));
        buffer.append(mainUri, makeChange("ai", ChangeLayer.AI, 1));
        buffer.append(mainUri, makeChange("x", ChangeLayer.EXPR, 1));

        buffer.clear(mainUri);

        Assert.assertFalse(buffer.hasChanges(mainUri));
    }

    @Test
    public void clear_doesNotAffectOtherUris() {
        buffer.append(mainUri, makeChange("e", ChangeLayer.EDITOR, 1));
        buffer.append(utilUri, makeChange("e", ChangeLayer.EDITOR, 1));

        buffer.clear(mainUri);

        Assert.assertFalse(buffer.hasChanges(mainUri));
        Assert.assertTrue(buffer.hasChanges(utilUri));
    }

    @Test
    public void clear_onEmptyUriIsNoOp() {
        // Should not throw
        buffer.clear(mainUri);
        Assert.assertFalse(buffer.hasChanges(mainUri));
    }

    // =========================================================================
    // hasChanges(uri) tests
    // =========================================================================

    @Test
    public void hasChanges_returnsFalseForEmptyUri() {
        Assert.assertFalse(buffer.hasChanges(mainUri));
    }

    @Test
    public void hasChanges_returnsTrueAfterAppend() {
        buffer.append(mainUri, makeChange("x", ChangeLayer.EDITOR, 1));
        Assert.assertTrue(buffer.hasChanges(mainUri));
    }

    @Test
    public void hasChanges_returnsFalseAfterDrainByLayer() {
        buffer.append(mainUri, makeChange("x", ChangeLayer.EDITOR, 1));
        buffer.drain(mainUri, ChangeLayer.EDITOR);
        Assert.assertFalse(buffer.hasChanges(mainUri));
    }

    @Test
    public void hasChanges_returnsFalseAfterDrainAll() {
        buffer.append(mainUri, makeChange("e", ChangeLayer.EDITOR, 1));
        buffer.append(mainUri, makeChange("ai", ChangeLayer.AI, 1));
        buffer.drain(mainUri);
        Assert.assertFalse(buffer.hasChanges(mainUri));
    }

    @Test
    public void hasChanges_returnsFalseAfterClear() {
        buffer.append(mainUri, makeChange("x", ChangeLayer.EDITOR, 1));
        buffer.clear(mainUri);
        Assert.assertFalse(buffer.hasChanges(mainUri));
    }

    @Test
    public void hasChanges_returnsTrueWhenOnlyAiLayerHasChanges() {
        buffer.append(mainUri, makeChange("ai", ChangeLayer.AI, 1));
        Assert.assertTrue(buffer.hasChanges(mainUri));
    }

    // =========================================================================
    // routeWatcherEvent() tests
    // =========================================================================

    @Test
    public void routeWatcherEvent_noEditorLayer_routesToClosedDocChanges() {
        FileEvent event = new FileEvent("file:///workspace/main.bal", FileChangeType.Changed);
        buffer.routeWatcherEvent(mainUri, event);

        Map<DocumentUri, FileEvent> closedChanges = buffer.drainClosedDocChanges();
        Assert.assertTrue(closedChanges.containsKey(mainUri));
        Assert.assertSame(closedChanges.get(mainUri), event);
    }

    @Test
    public void routeWatcherEvent_withEditorLayer_routesToDeferredWatcherEvents() {
        buffer.append(mainUri, makeChange("open", ChangeLayer.EDITOR, 1));

        FileEvent event = new FileEvent("file:///workspace/main.bal", FileChangeType.Changed);
        buffer.routeWatcherEvent(mainUri, event);

        // Should NOT be in closedDocChanges
        Map<DocumentUri, FileEvent> closedChanges = buffer.drainClosedDocChanges();
        Assert.assertFalse(closedChanges.containsKey(mainUri));

        // Should be in deferredWatcherEvents
        Map<DocumentUri, FileEvent> deferred = buffer.drainDeferredWatcherEvents();
        Assert.assertTrue(deferred.containsKey(mainUri));
        Assert.assertSame(deferred.get(mainUri), event);
    }

    @Test
    public void routeWatcherEvent_afterDrainEditorLayer_stillConsideredOpen() {
        // Drain empties the EDITOR queue but preserves the key — document remains open per ADR-047 §6
        buffer.append(mainUri, makeChange("open", ChangeLayer.EDITOR, 1));
        buffer.drain(mainUri, ChangeLayer.EDITOR); // EDITOR key persists, queue is emptied

        FileEvent event = new FileEvent("file:///workspace/main.bal", FileChangeType.Changed);
        buffer.routeWatcherEvent(mainUri, event);

        // EDITOR key still present => document is open => event is deferred, not closed
        Map<DocumentUri, FileEvent> closedChanges = buffer.drainClosedDocChanges();
        Assert.assertFalse(closedChanges.containsKey(mainUri), "Event should NOT be in closedDocChanges");

        Map<DocumentUri, FileEvent> deferred = buffer.drainDeferredWatcherEvents();
        Assert.assertTrue(deferred.containsKey(mainUri), "Event should be in deferredWatcherEvents");
    }

    // =========================================================================
    // drainClosedDocChanges() tests
    // =========================================================================

    @Test
    public void drainClosedDocChanges_returnsAllAndClears() {
        FileEvent e1 = new FileEvent("file:///workspace/main.bal", FileChangeType.Changed);
        FileEvent e2 = new FileEvent("file:///workspace/util.bal", FileChangeType.Created);

        buffer.routeWatcherEvent(mainUri, e1);
        buffer.routeWatcherEvent(utilUri, e2);

        Map<DocumentUri, FileEvent> result = buffer.drainClosedDocChanges();
        Assert.assertEquals(result.size(), 2);
        Assert.assertSame(result.get(mainUri), e1);
        Assert.assertSame(result.get(utilUri), e2);

        // Should be empty after drain
        Map<DocumentUri, FileEvent> second = buffer.drainClosedDocChanges();
        Assert.assertEquals(second.size(), 0);
    }

    @Test
    public void drainClosedDocChanges_emptyReturnsEmptyMap() {
        Map<DocumentUri, FileEvent> result = buffer.drainClosedDocChanges();
        Assert.assertNotNull(result);
        Assert.assertEquals(result.size(), 0);
    }

    // =========================================================================
    // Concurrency tests
    // =========================================================================

    @Test
    public void concurrentAppend_noDataLoss() throws InterruptedException {
        int threadCount = 10;
        int changesPerThread = 100;
        ExecutorService executor = Executors.newFixedThreadPool(threadCount);
        CountDownLatch startLatch = new CountDownLatch(1);
        CountDownLatch doneLatch = new CountDownLatch(threadCount);

        for (int t = 0; t < threadCount; t++) {
            final int threadId = t;
            executor.submit(() -> {
                try {
                    startLatch.await();
                    for (int i = 0; i < changesPerThread; i++) {
                        buffer.append(mainUri, makeChange("t" + threadId + "c" + i, ChangeLayer.EDITOR, i));
                    }
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                } finally {
                    doneLatch.countDown();
                }
            });
        }

        startLatch.countDown();
        Assert.assertTrue(doneLatch.await(10, TimeUnit.SECONDS), "Threads did not finish in time");
        executor.shutdown();

        List<BufferedChange> all = buffer.drain(mainUri, ChangeLayer.EDITOR);
        Assert.assertEquals(all.size(), threadCount * changesPerThread,
                "All " + (threadCount * changesPerThread) + " changes must be present — no data loss");
    }

    @Test
    public void concurrentDrainAndAppend_doesNotThrow() throws InterruptedException {
        int iterations = 500;
        ExecutorService executor = Executors.newFixedThreadPool(4);
        CountDownLatch startLatch = new CountDownLatch(1);
        CountDownLatch doneLatch = new CountDownLatch(4);
        List<Throwable> errors = new ArrayList<>();

        // 2 appenders
        for (int t = 0; t < 2; t++) {
            final int threadId = t;
            executor.submit(() -> {
                try {
                    startLatch.await();
                    for (int i = 0; i < iterations; i++) {
                        buffer.append(mainUri, makeChange("c" + i, ChangeLayer.EDITOR, i));
                    }
                } catch (Throwable e) {
                    synchronized (errors) {
                        errors.add(e);
                    }
                } finally {
                    doneLatch.countDown();
                }
            });
        }

        // 2 drainers
        for (int t = 0; t < 2; t++) {
            executor.submit(() -> {
                try {
                    startLatch.await();
                    for (int i = 0; i < iterations; i++) {
                        buffer.drain(mainUri, ChangeLayer.EDITOR);
                    }
                } catch (Throwable e) {
                    synchronized (errors) {
                        errors.add(e);
                    }
                } finally {
                    doneLatch.countDown();
                }
            });
        }

        startLatch.countDown();
        Assert.assertTrue(doneLatch.await(10, TimeUnit.SECONDS), "Threads did not finish in time");
        executor.shutdown();

        Assert.assertTrue(errors.isEmpty(), "Concurrent drain+append must not throw: " + errors);
    }

    // -------------------------------------------------------------------------
    // Regression: snapshot-then-removeAll race (PR #674 review)
    //
    // A routeWatcherEvent() put that lands between a drain's snapshot copy and its
    // removeAll must NOT be deleted unless it was actually returned. The fix uses
    // per-entry conditional remove(key, capturedValue). Each round forces the race
    // between a drain and a put for the same URI; the racing put must be recovered
    // by either the racing drain or the final drain. With the old removeAll pattern
    // the put is silently lost on roughly half the rounds, so this fails reliably.
    // -------------------------------------------------------------------------

    @Test
    public void drainClosedDocChanges_racingPutForSameUriNotLost() throws Exception {
        assertRacingPutSurvivesDrain(false);
    }

    @Test
    public void drainDeferredWatcherEvents_racingPutForSameUriNotLost() throws Exception {
        assertRacingPutSurvivesDrain(true);
    }

    private void assertRacingPutSurvivesDrain(boolean openDocument) throws Exception {
        int rounds = 2000;
        for (int round = 0; round < rounds; round++) {
            ChangeBuffer b = new ChangeBuffer();
            if (openDocument) {
                // An EDITOR layer key makes isOpen() true, so routeWatcherEvent targets
                // deferredWatcherEvents instead of closedDocChanges.
                b.ensureLayer(mainUri, ChangeLayer.EDITOR);
            }
            FileEvent initial = new FileEvent("file:///workspace/main.bal", FileChangeType.Changed);
            FileEvent racer = new FileEvent("file:///workspace/main.bal", FileChangeType.Created);
            b.routeWatcherEvent(mainUri, initial);

            CyclicBarrier barrier = new CyclicBarrier(2);
            AtomicReference<Map<DocumentUri, FileEvent>> drainResult = new AtomicReference<>();
            Thread drainer = new Thread(() -> {
                try {
                    barrier.await();
                } catch (Exception e) {
                    return;
                }
                drainResult.set(openDocument
                        ? b.drainDeferredWatcherEvents()
                        : b.drainClosedDocChanges());
            });
            Thread router = new Thread(() -> {
                try {
                    barrier.await();
                } catch (Exception e) {
                    return;
                }
                b.routeWatcherEvent(mainUri, racer);
            });
            drainer.start();
            router.start();
            drainer.join();
            router.join();

            Map<DocumentUri, FileEvent> drained = drainResult.get();
            Map<DocumentUri, FileEvent> finalDrain = openDocument
                    ? b.drainDeferredWatcherEvents()
                    : b.drainClosedDocChanges();

            // The racing put must be returned by the racing drain OR survive to the final drain.
            // (When the racing drain captured the older `initial`, the fix leaves `racer` in place
            // for the final drain; the old removeAll pattern deleted it silently.)
            boolean racerReturnedByRacingDrain = drained.get(mainUri) == racer;
            boolean racerReturnedByFinalDrain = finalDrain.get(mainUri) == racer;
            Assert.assertTrue(racerReturnedByRacingDrain || racerReturnedByFinalDrain,
                    "Racing routeWatcherEvent must survive drain (round " + round
                            + ", open=" + openDocument + ")");
        }
    }
}
