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
    import org.ballerinalang.langserver.workspace.observability.TelemetryEmitter;

import java.util.Iterator;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Consumer;

/**
 * Per-subscriber delivery channel that enforces tier-specific buffering and dispatch semantics.
 *
 * @since 1.7.0
 */
final class DeliveryChannel {
    private static final int CRITICAL_CAPACITY = 1_000;
    private static final long CRITICAL_PUBLISH_TIMEOUT_MILLIS = 100L;
    private static final int BEST_EFFORT_CAPACITY = 200;
    private static final int COALESCEABLE_MAP_CAPACITY = 1_000;
    private static final long COALESCE_DRAIN_INTERVAL_MILLIS = 10L;
    private static final int SAMPLE_EVERY_FIVE = 5;
    private static final int SAMPLE_EVERY_TEN = 10;
    private final String subscriberId;
    private final SubscriberTier subscriberTier;
    private final Set<EventKind> subscribedKinds;
    private final Consumer<DomainEvent> consumer;
    private final AtomicBoolean closed;
    private final AtomicInteger sampleCounter;
    private final TelemetryEmitter telemetryEmitter;

    private final BlockingQueue<DomainEvent> queue;
    private final ConcurrentHashMap<String, DomainEvent> stagingMap;
    private final ExecutorService deliveryExecutor;
    private final ScheduledExecutorService coalesceDrainer;

    private DeliveryChannel(String subscriberId, SubscriberTier subscriberTier, Set<EventKind> subscribedKinds,
                            Consumer<DomainEvent> consumer, BlockingQueue<DomainEvent> queue,
                            ConcurrentHashMap<String, DomainEvent> stagingMap, ExecutorService deliveryExecutor,
                            ScheduledExecutorService coalesceDrainer, TelemetryEmitter telemetryEmitter) {
        this.subscriberId = subscriberId;
        this.subscriberTier = subscriberTier;
        this.subscribedKinds = subscribedKinds;
        this.consumer = consumer;
        this.queue = queue;
        this.stagingMap = stagingMap;
        this.deliveryExecutor = deliveryExecutor;
        this.coalesceDrainer = coalesceDrainer;
        this.closed = new AtomicBoolean(false);
        this.sampleCounter = new AtomicInteger(0);
        this.telemetryEmitter = telemetryEmitter;
    }

    /**
     * Creates a delivery channel for a subscriber based on the configured tier.
     *
     * @param subscriberId subscriber identifier
     * @param subscriberTier delivery tier policy
     * @param subscribedKinds event kinds accepted by this subscriber
     * @param consumer subscriber callback
     * @return configured delivery channel
     */
    static DeliveryChannel create(String subscriberId, SubscriberTier subscriberTier, Set<EventKind> subscribedKinds,
                                  Consumer<DomainEvent> consumer, TelemetryEmitter telemetryEmitter) {
        Set<EventKind> immutableKinds = Set.copyOf(subscribedKinds);
        return switch (subscriberTier) {
            case CRITICAL -> {
                ArrayBlockingQueue<DomainEvent> queue = new ArrayBlockingQueue<>(CRITICAL_CAPACITY);
                ExecutorService executor = Executors.newSingleThreadExecutor(
                        threadFactory(subscriberId, subscriberTier));
                DeliveryChannel channel = new DeliveryChannel(subscriberId, subscriberTier, immutableKinds, consumer,
                        queue, null, executor, null, telemetryEmitter);
                executor.execute(channel::drainQueue);
                yield channel;
            }
            case BEST_EFFORT -> {
                ArrayBlockingQueue<DomainEvent> queue = new ArrayBlockingQueue<>(BEST_EFFORT_CAPACITY);
                ExecutorService executor = Executors.newSingleThreadExecutor(
                        threadFactory(subscriberId, subscriberTier));
                DeliveryChannel channel = new DeliveryChannel(subscriberId, subscriberTier, immutableKinds, consumer,
                        queue, null, executor, null, telemetryEmitter);
                executor.execute(channel::drainQueue);
                yield channel;
            }
            case COALESCEABLE -> {
                ConcurrentHashMap<String, DomainEvent> stagingMap = new ConcurrentHashMap<>(COALESCEABLE_MAP_CAPACITY);
                ScheduledExecutorService drainer = Executors.newSingleThreadScheduledExecutor(
                        threadFactory(subscriberId, subscriberTier));
                DeliveryChannel channel = new DeliveryChannel(subscriberId, subscriberTier, immutableKinds, consumer,
                        null, stagingMap, null, drainer, telemetryEmitter);
                drainer.scheduleAtFixedRate(channel::drainCoalesceMap, COALESCE_DRAIN_INTERVAL_MILLIS,
                        COALESCE_DRAIN_INTERVAL_MILLIS, TimeUnit.MILLISECONDS);
                yield channel;
            }
        };
    }

    /**
     * Checks whether this channel accepts a given event kind.
     *
     * @param eventKind event kind to evaluate
     * @return {@code true} when subscribed to the event kind
     */
    boolean accepts(EventKind eventKind) {
        return subscribedKinds.contains(eventKind);
    }

    /**
     * Enqueues an event for asynchronous delivery according to the subscriber tier.
     *
     * @param event event to dispatch
     */
    void enqueue(DomainEvent event) {
        if (closed.get()) {
            return;
        }

        switch (subscriberTier) {
            case CRITICAL -> enqueueCritical(event);
            case COALESCEABLE -> enqueueCoalesceable(event);
            case BEST_EFFORT -> enqueueBestEffort(event);
        }
    }

    /**
     * Closes this channel and stops background delivery workers.
     */
    void close() {
        if (!closed.compareAndSet(false, true)) {
            return;
        }
        if (deliveryExecutor != null) {
            deliveryExecutor.shutdownNow();
        }
        if (coalesceDrainer != null) {
            coalesceDrainer.shutdownNow();
        }
    }

    private void enqueueCritical(DomainEvent event) {
        try {
            if (!queue.offer(event, CRITICAL_PUBLISH_TIMEOUT_MILLIS, TimeUnit.MILLISECONDS)) {
                telemetryEmitter.emit("event_bus.critical_delivery_timeout", Map.of(
                        "subscriber", subscriberId,
                        "eventKind", event.eventKind().name()
                ));
                throw new IllegalStateException("Critical event delivery timed out for subscriber: " + subscriberId);
            }
        } catch (InterruptedException interruptedException) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Interrupted while publishing critical event for subscriber: "
                    + subscriberId, interruptedException);
        }
    }

    private void enqueueCoalesceable(DomainEvent event) {
        String key = event.coalesceKey();
        if (stagingMap.size() >= COALESCEABLE_MAP_CAPACITY && !stagingMap.containsKey(key)) {
            return;
        }
        stagingMap.put(key, event);
    }

    private void enqueueBestEffort(DomainEvent event) {
        if (shouldSampleOut(event)) {
            return;
        }
        if (!queue.offer(event)) {
            queue.poll();
            boolean enqueued = queue.offer(event);
            telemetryEmitter.emit("event_bus.dropped_count", Map.of(
                    "subscriber", subscriberId,
                    "eventKind", event.eventKind().name()
            ));
            if (!enqueued) {
                telemetryEmitter.emit("event_bus.best_effort_delivery_failed", Map.of(
                        "subscriber", subscriberId,
                        "eventKind", event.eventKind().name()
                ));
            }
        }
    }

    private void drainQueue() {
        while (!Thread.currentThread().isInterrupted()) {
            try {
                DomainEvent event = queue.take();
                telemetryEmitter.emitGauge("event_bus.queue_depth", queue.size());
                deliverSafely(event);
            } catch (InterruptedException interruptedException) {
                Thread.currentThread().interrupt();
            }
        }
    }

    private void drainCoalesceMap() {
        if (closed.get()) {
            return;
        }
        Iterator<Map.Entry<String, DomainEvent>> iterator = stagingMap.entrySet().iterator();
        while (iterator.hasNext()) {
            Map.Entry<String, DomainEvent> entry = iterator.next();
            if (stagingMap.remove(entry.getKey(), entry.getValue())) {
                deliverSafely(entry.getValue());
            }
        }
    }

    /**
     * Delivers a single event to the subscriber consumer, isolating any exception the
     * subscriber throws so it can never stop delivery of subsequent events on this channel.
     *
     * @param event event to deliver
     */
    private void deliverSafely(DomainEvent event) {
        try {
            consumer.accept(event);
        } catch (RuntimeException subscriberException) {
            telemetryEmitter.emit("event_bus.subscriber_exception", Map.of(
                    "subscriber", subscriberId,
                    "eventKind", event.eventKind().name(),
                    "error", String.valueOf(subscriberException)
            ));
        }
    }

    private boolean shouldSampleOut(DomainEvent event) {
        if (event.eventKind() != EventKind.CE_E5B_COMPILATION_DIAGNOSTICS_READY
                && event.eventKind() != EventKind.EXECUTION_PROCESS_OUTPUT) {
            return false;
        }

        int depth = queue.size();
        if (depth > 160) {
            return sampleCounter.incrementAndGet() % SAMPLE_EVERY_TEN != 0;
        }
        if (depth > 100) {
            return sampleCounter.incrementAndGet() % SAMPLE_EVERY_FIVE != 0;
        }
        return false;
    }

    private static ThreadFactory threadFactory(String subscriberId, SubscriberTier subscriberTier) {
        return runnable -> {
            Thread thread = new Thread(runnable);
            thread.setName("eventbus-" + subscriberTier.name().toLowerCase(Locale.ROOT) + "-" + subscriberId);
            thread.setDaemon(true);
            return thread;
        };
    }
}
