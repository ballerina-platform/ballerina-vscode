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

package org.ballerinalang.langserver.workspace.eventbus;

import org.ballerinalang.langserver.workspace.eventbus.event.DomainEvent;
import org.ballerinalang.langserver.workspace.eventbus.event.ProjectEvent;
import org.ballerinalang.langserver.workspace.observability.TelemetryEmitter;
import org.ballerinalang.langserver.workspace.observability.TraceLogSink;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.net.URI;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Tests three-tier delivery behavior of {@link EventSyncPubSubHolder}.
 *
 * @since 1.7.0
 */
public class EventSyncPubSubHolderTest {

    /**
     * Verifies event kind enum contains all domain event identifiers.
     */
    @Test
    public void eventKind_containsAllDomainEvents() {
        Assert.assertEquals(List.of(EventKind.values()).stream().map(Enum::name).toList(), List.of(
                "WORKSPACE_PROJECT_REGISTERED", "WORKSPACE_PROJECT_EVICTED",
                "WORKSPACE_PROJECT_HEALTH_STATE_CHANGED", "WORKSPACE_PROJECT_KIND_TRANSITIONED",
                "WORKSPACE_PROJECT_UPDATED",
                "WORKSPACE_PROJECT_TIER_CHANGED", "WORKSPACE_BATCH_PROJECTS_REGISTERED",
                "WORKSPACE_LOCKING_MODE_CHANGED",
                "WM_FILE_WATCHED_CHANGED",
                "COMPILER_SNAPSHOT_PUBLISHED", "COMPILER_COMPILATION_FAILED",
                "COMPILER_COMPILATION_CANCELLED", "COMPILER_RESOLUTION_COMPLETED",
                "CE_E5A_RESOLUTION_DIAGNOSTICS_READY", "CE_E5B_COMPILATION_DIAGNOSTICS_READY",
                "CE_RESOLUTION_EXHAUSTED", "CE_RESOLUTION_RECOVERED",
                "EXECUTION_PROCESS_STARTED", "EXECUTION_PROCESS_OUTPUT",
                "EXECUTION_PROCESS_TERMINATED", "CACHE_INVALIDATION_REQUESTED",
                "RM_E1_HEAP_PRESSURE_DETECTED"
        ));
    }

    /**
     * Verifies publish asynchronously dispatches to all matching subscribers.
     *
     * @throws InterruptedException if interrupted while awaiting delivery
     */
    @Test
    public void publish_dispatchesAsynchronouslyToAllSubscribers() throws InterruptedException {
        EventSyncPubSubHolder holder = new EventSyncPubSubHolder();
        CountDownLatch latch = new CountDownLatch(2);
        AtomicLong publishThreadId = new AtomicLong(Thread.currentThread().threadId());
        AtomicLong firstSubscriberThread = new AtomicLong(-1L);
        AtomicLong secondSubscriberThread = new AtomicLong(-1L);

        holder.subscribe("sub-a", SubscriberTier.BEST_EFFORT, Set.of(EventKind.WORKSPACE_PROJECT_REGISTERED), event -> {
            firstSubscriberThread.set(Thread.currentThread().threadId());
            latch.countDown();
        });
        holder.subscribe("sub-b", SubscriberTier.BEST_EFFORT, Set.of(EventKind.WORKSPACE_PROJECT_REGISTERED), event -> {
            secondSubscriberThread.set(Thread.currentThread().threadId());
            latch.countDown();
        });

        holder.publish(new ProjectEvent(EventKind.WORKSPACE_PROJECT_REGISTERED, URI.create("file:///workspace-a")));

        Assert.assertTrue(latch.await(2, TimeUnit.SECONDS));
        Assert.assertNotEquals(firstSubscriberThread.get(), publishThreadId.get());
        Assert.assertNotEquals(secondSubscriberThread.get(), publishThreadId.get());
        holder.close();
    }

    /**
     * Verifies critical subscribers reject publication after timeout under pressure.
     *
     * @throws InterruptedException if interrupted while coordinating latches
     */
    @Test
    public void criticalTier_throwsWhenQueueSaturated() throws InterruptedException {
        EventSyncPubSubHolder holder = new EventSyncPubSubHolder();
        CountDownLatch processingStarted = new CountDownLatch(1);
        CountDownLatch releaseProcessing = new CountDownLatch(1);

        holder.subscribe("critical-sub", SubscriberTier.CRITICAL,
                Set.of(EventKind.WORKSPACE_PROJECT_REGISTERED), event -> {
            processingStarted.countDown();
            awaitLatch(releaseProcessing);
        });

        holder.publish(new ProjectEvent(EventKind.WORKSPACE_PROJECT_REGISTERED, URI.create("file:///workspace-a")));
        Assert.assertTrue(processingStarted.await(1, TimeUnit.SECONDS));

        Assert.assertThrows(IllegalStateException.class, () -> {
            for (int i = 0; i < 1_500; i++) {
                holder.publish(new ProjectEvent(EventKind.WORKSPACE_PROJECT_REGISTERED,
                        URI.create("file:///workspace-a")));
            }
        });

        releaseProcessing.countDown();
        holder.close();
    }

    /**
     * Verifies coalesceable delivery keeps only the latest event for the same key.
     *
     * @throws InterruptedException if interrupted while awaiting delivery
     */
    @Test
    public void coalesceableTier_keepsLatestEventPerCoalesceKey() throws InterruptedException {
        EventSyncPubSubHolder holder = new EventSyncPubSubHolder();
        CountDownLatch latch = new CountDownLatch(1);
        List<DomainEvent> delivered = new CopyOnWriteArrayList<>();

        holder.subscribe("coalesce-sub", SubscriberTier.COALESCEABLE,
                Set.of(EventKind.WORKSPACE_PROJECT_UPDATED), event -> {
            delivered.add(event);
            latch.countDown();
        });

        URI sourceRoot = URI.create("file:///workspace");
        DomainEvent first = new ProjectEvent(EventKind.WORKSPACE_PROJECT_UPDATED, sourceRoot);
        DomainEvent second = new ProjectEvent(EventKind.WORKSPACE_PROJECT_UPDATED, sourceRoot);
        DomainEvent third = new ProjectEvent(EventKind.WORKSPACE_PROJECT_UPDATED, sourceRoot);
        holder.publish(first);
        holder.publish(second);
        holder.publish(third);

        Assert.assertTrue(latch.await(2, TimeUnit.SECONDS));
        Assert.assertEquals(delivered.size(), 1);
        Assert.assertEquals(delivered.get(0), third);
        holder.close();
    }

    /**
     * Verifies best-effort delivery drops oldest events when capacity is exceeded.
     *
     * @throws InterruptedException if interrupted while awaiting delivery
     */
    @Test
    public void bestEffortTier_dropsOldestEventOnOverflow() throws InterruptedException {
        EventSyncPubSubHolder holder = new EventSyncPubSubHolder();
        CountDownLatch processingStarted = new CountDownLatch(1);
        CountDownLatch releaseProcessing = new CountDownLatch(1);
        List<DomainEvent> delivered = new CopyOnWriteArrayList<>();

        holder.subscribe("best-effort-sub", SubscriberTier.BEST_EFFORT,
                Set.of(EventKind.WORKSPACE_PROJECT_REGISTERED), event -> {
            delivered.add(event);
            processingStarted.countDown();
            awaitLatch(releaseProcessing);
        });

        holder.publish(new ProjectEvent(EventKind.WORKSPACE_PROJECT_REGISTERED,
                URI.create("file:///seq-1")));
        Assert.assertTrue(processingStarted.await(1, TimeUnit.SECONDS));

        for (int i = 2; i <= 202; i++) {
            holder.publish(new ProjectEvent(EventKind.WORKSPACE_PROJECT_REGISTERED,
                    URI.create("file:///seq-" + i)));
        }

        releaseProcessing.countDown();
        Thread.sleep(300);

        boolean containsSecond = delivered.stream().anyMatch(
                event -> event instanceof ProjectEvent pe && pe.sourceRoot().toString().endsWith("/seq-2"));
        boolean containsLast = delivered.stream().anyMatch(
                event -> event instanceof ProjectEvent pe && pe.sourceRoot().toString().endsWith("/seq-202"));

        Assert.assertFalse(containsSecond);
        Assert.assertTrue(containsLast);
        holder.close();
    }

    /**
     * Verifies a blocked subscriber does not prevent delivery to other subscribers.
     *
     * @throws InterruptedException if interrupted while awaiting delivery
     */
    @Test
    public void subscriberIsolation_blockedSubscriberDoesNotBlockOthers() throws InterruptedException {
        EventSyncPubSubHolder holder = new EventSyncPubSubHolder();
        CountDownLatch blockedStarted = new CountDownLatch(1);
        CountDownLatch unblockBlocked = new CountDownLatch(1);
        CountDownLatch fastDelivered = new CountDownLatch(1);

        holder.subscribe("blocked", SubscriberTier.CRITICAL,
                Set.of(EventKind.WORKSPACE_PROJECT_REGISTERED), event -> {
            blockedStarted.countDown();
            awaitLatch(unblockBlocked);
        });
        holder.subscribe("fast", SubscriberTier.CRITICAL,
                Set.of(EventKind.WORKSPACE_PROJECT_REGISTERED), event -> fastDelivered.countDown());

        holder.publish(new ProjectEvent(EventKind.WORKSPACE_PROJECT_REGISTERED, URI.create("file:///workspace-a")));

        Assert.assertTrue(blockedStarted.await(1, TimeUnit.SECONDS));
        Assert.assertTrue(fastDelivered.await(1, TimeUnit.SECONDS));

        unblockBlocked.countDown();
        holder.close();
    }

    /**
     * Verifies that a CRITICAL tier timeout emits a critical_delivery_timeout metric.
     *
     * @throws InterruptedException if interrupted while coordinating latches
     */
    @Test
    public void criticalTier_timeout_emitsMetric() throws InterruptedException {
        List<Map<String, String>> captured = new CopyOnWriteArrayList<>();
        TelemetryEmitter emitter = new TelemetryEmitter(List.of(capturingSink(captured)));
        EventSyncPubSubHolder holder = new EventSyncPubSubHolder(emitter);

        CountDownLatch processingStarted = new CountDownLatch(1);
        CountDownLatch releaseProcessing = new CountDownLatch(1);

        holder.subscribe("critical-metric-sub", SubscriberTier.CRITICAL,
                Set.of(EventKind.WORKSPACE_PROJECT_REGISTERED), event -> {
            processingStarted.countDown();
            awaitLatch(releaseProcessing);
        });

        holder.publish(new ProjectEvent(EventKind.WORKSPACE_PROJECT_REGISTERED, URI.create("file:///workspace-a")));
        Assert.assertTrue(processingStarted.await(1, TimeUnit.SECONDS));

        Assert.assertThrows(IllegalStateException.class, () -> {
            for (int i = 0; i < 1_500; i++) {
                holder.publish(new ProjectEvent(EventKind.WORKSPACE_PROJECT_REGISTERED,
                        URI.create("file:///workspace-a")));
            }
        });

        releaseProcessing.countDown();
        holder.close();

        boolean hasTimeout = captured.stream()
                .anyMatch(e -> "event_bus.critical_delivery_timeout".equals(e.get("metricName"))
                        && "critical-metric-sub".equals(e.get("subscriber")));
        Assert.assertTrue(hasTimeout, "Expected critical_delivery_timeout metric to be emitted");
    }

    /**
     * Verifies that a BEST_EFFORT head-drop emits a dropped_count metric.
     *
     * @throws InterruptedException if interrupted while awaiting delivery
     */
    @Test
    public void bestEffortTier_headDrop_emitsMetric() throws InterruptedException {
        List<Map<String, String>> captured = new CopyOnWriteArrayList<>();
        TelemetryEmitter emitter = new TelemetryEmitter(List.of(capturingSink(captured)));
        EventSyncPubSubHolder holder = new EventSyncPubSubHolder(emitter);

        CountDownLatch processingStarted = new CountDownLatch(1);
        CountDownLatch releaseProcessing = new CountDownLatch(1);

        holder.subscribe("best-effort-metric-sub", SubscriberTier.BEST_EFFORT,
                Set.of(EventKind.WORKSPACE_PROJECT_REGISTERED), event -> {
            processingStarted.countDown();
            awaitLatch(releaseProcessing);
        });

        // Block the consumer, then overflow the 200-event queue
        holder.publish(new ProjectEvent(EventKind.WORKSPACE_PROJECT_REGISTERED, URI.create("file:///seq-1")));
        Assert.assertTrue(processingStarted.await(1, TimeUnit.SECONDS));

        for (int i = 2; i <= 205; i++) {
            holder.publish(new ProjectEvent(EventKind.WORKSPACE_PROJECT_REGISTERED,
                    URI.create("file:///seq-" + i)));
        }

        releaseProcessing.countDown();
        holder.close();

        boolean hasDropped = captured.stream()
                .anyMatch(e -> "event_bus.dropped_count".equals(e.get("metricName"))
                        && "best-effort-metric-sub".equals(e.get("subscriber")));
        Assert.assertTrue(hasDropped, "Expected dropped_count metric to be emitted on head-drop");
    }

    /**
     * Verifies a subscriber that throws while handling one event still receives subsequent
     * events, and that a healthy subscriber on the same publish call is unaffected.
     *
     * @throws InterruptedException if interrupted while awaiting delivery
     */
    @Test
    public void subscriberException_doesNotStopSubsequentDeliveryOrOtherSubscribers() throws InterruptedException {
        EventSyncPubSubHolder holder = new EventSyncPubSubHolder();
        List<DomainEvent> throwingSubscriberDelivered = new CopyOnWriteArrayList<>();
        List<DomainEvent> healthySubscriberDelivered = new CopyOnWriteArrayList<>();
        CountDownLatch throwingSubscriberSecondEvent = new CountDownLatch(1);
        CountDownLatch healthySubscriberBothEvents = new CountDownLatch(2);

        holder.subscribe("throwing-sub", SubscriberTier.BEST_EFFORT,
                Set.of(EventKind.WORKSPACE_PROJECT_REGISTERED), event -> {
            throwingSubscriberDelivered.add(event);
            if (throwingSubscriberDelivered.size() == 1) {
                throw new RuntimeException("boom");
            }
            throwingSubscriberSecondEvent.countDown();
        });
        holder.subscribe("healthy-sub", SubscriberTier.BEST_EFFORT,
                Set.of(EventKind.WORKSPACE_PROJECT_REGISTERED), event -> {
            healthySubscriberDelivered.add(event);
            healthySubscriberBothEvents.countDown();
        });

        holder.publish(new ProjectEvent(EventKind.WORKSPACE_PROJECT_REGISTERED, URI.create("file:///seq-1")));
        holder.publish(new ProjectEvent(EventKind.WORKSPACE_PROJECT_REGISTERED, URI.create("file:///seq-2")));

        Assert.assertTrue(throwingSubscriberSecondEvent.await(2, TimeUnit.SECONDS),
                "Expected the throwing subscriber to still receive the second event");
        Assert.assertTrue(healthySubscriberBothEvents.await(2, TimeUnit.SECONDS),
                "Expected the healthy subscriber to receive both events");
        Assert.assertEquals(throwingSubscriberDelivered.size(), 2);
        Assert.assertEquals(healthySubscriberDelivered.size(), 2);
        holder.close();
    }

    /**
     * Verifies the coalesceable tier's scheduled drain task keeps running after a subscriber
     * throws once, rather than being permanently suppressed by {@code scheduleAtFixedRate}.
     *
     * @throws InterruptedException if interrupted while awaiting delivery
     */
    @Test
    public void coalesceableTier_subscriberException_doesNotStopScheduledDrain() throws InterruptedException {
        EventSyncPubSubHolder holder = new EventSyncPubSubHolder();
        List<DomainEvent> delivered = new CopyOnWriteArrayList<>();
        CountDownLatch secondEventHandled = new CountDownLatch(1);

        holder.subscribe("coalesce-throw-sub", SubscriberTier.COALESCEABLE,
                Set.of(EventKind.WORKSPACE_PROJECT_UPDATED), event -> {
            delivered.add(event);
            if (delivered.size() == 1) {
                throw new RuntimeException("boom");
            }
            secondEventHandled.countDown();
        });

        holder.publish(new ProjectEvent(EventKind.WORKSPACE_PROJECT_UPDATED, URI.create("file:///workspace-a")));
        Thread.sleep(100);
        holder.publish(new ProjectEvent(EventKind.WORKSPACE_PROJECT_UPDATED, URI.create("file:///workspace-b")));

        Assert.assertTrue(secondEventHandled.await(2, TimeUnit.SECONDS),
                "Expected the scheduled coalesce drain to keep running after a handler threw once");
        Assert.assertEquals(delivered.size(), 2);
        holder.close();
    }

    /**
     * Verifies that a saturated CRITICAL channel's delivery failure does not prevent delivery
     * to a healthy channel for the same publish call.
     *
     * @throws InterruptedException if interrupted while coordinating latches
     */
    @Test
    public void publish_channelFailureDoesNotPreventDeliveryToOtherChannels() throws InterruptedException {
        EventSyncPubSubHolder holder = new EventSyncPubSubHolder();
        CountDownLatch blockedStarted = new CountDownLatch(1);
        CountDownLatch unblockBlocked = new CountDownLatch(1);
        List<DomainEvent> healthyDelivered = new CopyOnWriteArrayList<>();

        holder.subscribe("blocked-critical", SubscriberTier.CRITICAL,
                Set.of(EventKind.WORKSPACE_PROJECT_REGISTERED), event -> {
            blockedStarted.countDown();
            awaitLatch(unblockBlocked);
        });
        holder.subscribe("healthy-critical", SubscriberTier.CRITICAL,
                Set.of(EventKind.WORKSPACE_PROJECT_REGISTERED), healthyDelivered::add);

        holder.publish(new ProjectEvent(EventKind.WORKSPACE_PROJECT_REGISTERED, URI.create("file:///workspace-a")));
        Assert.assertTrue(blockedStarted.await(1, TimeUnit.SECONDS));

        AtomicInteger publishAttempts = new AtomicInteger(1);
        Assert.assertThrows(IllegalStateException.class, () -> {
            for (int i = 0; i < 1_500; i++) {
                publishAttempts.incrementAndGet();
                holder.publish(new ProjectEvent(EventKind.WORKSPACE_PROJECT_REGISTERED,
                        URI.create("file:///workspace-a")));
            }
        });

        int expectedDeliveries = publishAttempts.get();
        long deadline = System.currentTimeMillis() + 2_000;
        while (healthyDelivered.size() < expectedDeliveries && System.currentTimeMillis() < deadline) {
            Thread.sleep(20);
        }

        Assert.assertEquals(healthyDelivered.size(), expectedDeliveries,
                "Expected the healthy channel to receive every published event, including the one whose "
                        + "delivery to the blocked channel failed");

        unblockBlocked.countDown();
        holder.close();
    }

    private static TraceLogSink capturingSink(List<Map<String, String>> target) {
        return new TraceLogSink() {
            @Override
            public void write(String level, Map<String, String> fields) {
                target.add(new java.util.LinkedHashMap<>(fields));
            }

            @Override
            public void close() {
            }
        };
    }

    private static void awaitLatch(CountDownLatch latch) {
        try {
            latch.await();
        } catch (InterruptedException interruptedException) {
            Thread.currentThread().interrupt();
            throw new RuntimeException(interruptedException);
        }
    }
}
