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

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Consumer;

import javax.annotation.Nonnull;

/**
 * Shared-kernel synchronous pub-sub holder with tiered per-subscriber delivery.
 *
 * @since 1.7.0
 */
public class EventSyncPubSubHolder implements AutoCloseable {
    private final Map<String, DeliveryChannel> deliveryChannels;
    private final AtomicBoolean closed;
    private final TelemetryEmitter telemetryEmitter;

    /**
     * Creates a new event bus holder that emits queue metrics to the given telemetry emitter.
     *
     * @param telemetryEmitter emitter for queue depth, drop, and timeout metrics
     */
    public EventSyncPubSubHolder(@Nonnull TelemetryEmitter telemetryEmitter) {
        this.deliveryChannels = new ConcurrentHashMap<>();
        this.closed = new AtomicBoolean(false);
        this.telemetryEmitter = telemetryEmitter;
    }

    /**
     * Creates a new event bus holder with no metric emission (for tests).
     */
    public EventSyncPubSubHolder() {
        this(new TelemetryEmitter(List.of()));
    }

    /**
     * Registers a subscriber with the given tier and event filters.
     *
     * @param subscriberId unique subscriber identifier
     * @param subscriberTier delivery tier
     * @param subscribedKinds event kinds accepted by the subscriber
     * @param consumer event consumer callback
     */
    public void subscribe(@Nonnull String subscriberId, @Nonnull SubscriberTier subscriberTier,
                          @Nonnull Set<EventKind> subscribedKinds, @Nonnull Consumer<DomainEvent> consumer) {
        ensureOpen();

        if (subscriberId.isBlank()) {
            throw new IllegalArgumentException("subscriberId must not be blank");
        }
        if (subscribedKinds.isEmpty()) {
            throw new IllegalArgumentException("subscribedKinds must not be empty");
        }

        DeliveryChannel channel = DeliveryChannel.create(subscriberId, subscriberTier, subscribedKinds, consumer,
                telemetryEmitter);
        DeliveryChannel existing = deliveryChannels.putIfAbsent(subscriberId, channel);
        if (existing != null) {
            channel.close();
            throw new IllegalArgumentException("Subscriber already registered: " + subscriberId);
        }
    }

    /**
     * Publishes the given event to all matching subscribers asynchronously.
     *
     * <p>A delivery failure on one channel (e.g. a saturated CRITICAL queue) does not prevent
     * the event from being offered to the remaining matching channels. Once every matching
     * channel has been attempted, the first failure encountered (if any) is rethrown so callers
     * retain the existing explicit-failure signal for their own event.
     *
     * @param event domain event to publish
     */
    public void publish(@Nonnull DomainEvent event) {
        ensureOpen();

        RuntimeException firstFailure = null;
        for (Map.Entry<String, DeliveryChannel> entry : deliveryChannels.entrySet()) {
            DeliveryChannel channel = entry.getValue();
            if (!channel.accepts(event.eventKind())) {
                continue;
            }
            try {
                channel.enqueue(event);
            } catch (RuntimeException enqueueFailure) {
                telemetryEmitter.emit("event_bus.channel_delivery_failure", Map.of(
                        "subscriber", entry.getKey(),
                        "eventKind", event.eventKind().name(),
                        "error", String.valueOf(enqueueFailure)
                ));
                if (firstFailure == null) {
                    firstFailure = enqueueFailure;
                }
            }
        }
        if (firstFailure != null) {
            throw firstFailure;
        }
    }

    /**
     * Closes the holder and all active subscriber channels.
     */
    @Override
    public void close() {
        if (!closed.compareAndSet(false, true)) {
            return;
        }

        for (DeliveryChannel channel : deliveryChannels.values()) {
            channel.close();
        }
        deliveryChannels.clear();
    }

    private void ensureOpen() {
        if (closed.get()) {
            throw new IllegalStateException("EventSyncPubSubHolder is closed");
        }
    }
}
