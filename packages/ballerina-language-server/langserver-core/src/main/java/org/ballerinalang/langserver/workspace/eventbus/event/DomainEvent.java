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

package org.ballerinalang.langserver.workspace.eventbus.event;

import org.ballerinalang.langserver.workspace.eventbus.EventKind;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

import javax.annotation.Nonnull;
import javax.annotation.Nullable;

/**
 * Base abstract domain event value routed through the event bus.
 * Each concrete subclass enforces its own typed payload.
 *
 * @since 1.7.0
 */
public abstract class DomainEvent {
    private final UUID id;
    private final Instant timestamp;
    private final EventKind eventKind;
    @Nullable
    private final UUID causationId;
    /**
     * Creates a domain event with no causation link.
     *
     * @param timestamp event occurrence time
     * @param eventKind domain event kind
     */
    protected DomainEvent(@Nonnull Instant timestamp, @Nonnull EventKind eventKind) {
        this(timestamp, eventKind, null);
    }

    /**
     * Creates a domain event with an optional causation link.
     *
     * @param timestamp    event occurrence time
     * @param eventKind    domain event kind
     * @param causationId  ID of the event that caused this one, or {@code null}
     */
    protected DomainEvent(@Nonnull Instant timestamp, @Nonnull EventKind eventKind, @Nullable UUID causationId) {
        this.id = UUID.randomUUID();
        this.timestamp = timestamp;
        this.eventKind = eventKind;
        this.causationId = causationId;
    }

    /**
     * Returns the coalesce scope used by coalesceable delivery channels.
     *
     * @return deterministic coalesce scope string
     */
    public abstract String coalesceScope();

    /**
     * Returns the key used by coalesceable delivery channels.
     *
     * @return deterministic coalesce key
     */
    public String coalesceKey() {
        return eventKind.name() + "|" + coalesceScope();
    }

    /**
     * Returns structured fields for trace logging.
     * Subclasses override to add payload-specific fields.
     *
     * @return ordered map of field name to value
     */
    public Map<String, String> serialize() {
        Map<String, String> fields = new LinkedHashMap<>();
        fields.put("id", id.toString());
        fields.put("timestamp", timestamp.toString());
        fields.put("eventType", eventKind.name());
        fields.put("eventId", eventKind.eventId());
        if (causationId != null) {
            fields.put("causationId", causationId.toString());
        }
        return fields;
    }

    /**
     * Returns the unique event ID.
     *
     * @return event UUID
     */
    public UUID id() {
        return id;
    }

    /**
     * Returns the event occurrence time.
     *
     * @return event timestamp
     */
    @Nonnull
    public Instant timestamp() {
        return timestamp;
    }

    /**
     * Returns the domain event kind.
     *
     * @return event kind
     */
    @Nonnull
    public EventKind eventKind() {
        return eventKind;
    }

    /**
     * Returns the ID of the event that caused this one, or {@code null}.
     *
     * @return causation ID or null
     */
    @Nullable
    public UUID causationId() {
        return causationId;
    }
}
