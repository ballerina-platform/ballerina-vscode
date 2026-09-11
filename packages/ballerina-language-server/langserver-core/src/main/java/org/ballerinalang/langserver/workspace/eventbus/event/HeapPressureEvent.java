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
import org.ballerinalang.langserver.workspace.resourcemonitor.HeapPressureLevel;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

import javax.annotation.Nonnull;
import javax.annotation.Nullable;

/**
 * Domain event emitted when heap pressure changes levels.
 * Used for RM-E1. Coalesces by level name so only the latest reading per level is delivered.
 *
 * @since 1.7.0
 */
public final class HeapPressureEvent extends DomainEvent {
    private final HeapPressureLevel pressureLevel;

    /**
     * Creates a heap-pressure event with no causation link.
     *
     * @param pressureLevel the current heap pressure level
     */
    public HeapPressureEvent(@Nonnull HeapPressureLevel pressureLevel) {
        this(pressureLevel, null);
    }

    /**
     * Creates a heap-pressure event with an optional causation link.
     *
     * @param pressureLevel the current heap pressure level
     * @param causationId   ID of the causing event, or {@code null}
     */
    public HeapPressureEvent(@Nonnull HeapPressureLevel pressureLevel, @Nullable UUID causationId) {
        super(Instant.now(), EventKind.RM_E1_HEAP_PRESSURE_DETECTED, causationId);
        this.pressureLevel = pressureLevel;
    }

    @Override
    public String coalesceScope() {
        return pressureLevel.name();
    }

    /**
     * Returns the current heap pressure level.
     *
     * @return heap pressure level
     */
    @Nonnull
    public HeapPressureLevel pressureLevel() {
        return pressureLevel;
    }

    @Override
    public Map<String, String> serialize() {
        Map<String, String> fields = super.serialize();
        fields.put("pressureLevel", pressureLevel.name());
        return fields;
    }
}
