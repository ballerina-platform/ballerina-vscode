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
import java.util.UUID;

import javax.annotation.Nullable;

/**
 * Domain event emitted when multiple projects are registered in batch.
 * Used for WM-E6. No payload beyond the base event fields.
 *
 * @since 1.7.0
 */
public final class BatchEvent extends DomainEvent {
    /**
     * Creates a batch event with no causation link.
     */
    public BatchEvent() {
        this(null);
    }

    /**
     * Creates a batch event with an optional causation link.
     *
     * @param causationId ID of the causing event, or {@code null}
     */
    public BatchEvent(@Nullable UUID causationId) {
        super(Instant.now(), EventKind.WORKSPACE_BATCH_PROJECTS_REGISTERED, causationId);
    }

    @Override
    public String coalesceScope() {
        return "batch";
    }
}
