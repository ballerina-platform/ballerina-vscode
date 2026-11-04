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

import java.net.URI;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;

import javax.annotation.Nonnull;
import javax.annotation.Nullable;

/**
 * Domain event representing a process lifecycle event.
 * Used for EM-E1 (process started) and EM-E3 (process terminated).
 *
 * @since 1.7.0
 */
public class ProcessEvent extends DomainEvent {
    private final URI sourceRoot;
    private final String processId;

    /**
     * Creates a process event with no causation link.
     *
     * @param eventKind  the event kind
     * @param sourceRoot the project source root URI
     * @param processId  the process identifier
     */
    public ProcessEvent(@Nonnull EventKind eventKind, @Nonnull URI sourceRoot, @Nonnull String processId) {
        this(eventKind, sourceRoot, processId, null);
    }

    /**
     * Creates a process event with an optional causation link.
     *
     * @param eventKind   the event kind
     * @param sourceRoot  the project source root URI
     * @param processId   the process identifier
     * @param causationId ID of the causing event, or {@code null}
     */
    public ProcessEvent(@Nonnull EventKind eventKind, @Nonnull URI sourceRoot, @Nonnull String processId,
                        @Nullable UUID causationId) {
        super(Instant.now(), eventKind, causationId);
        this.sourceRoot = sourceRoot;
        this.processId = processId;
    }

    @Override
    public String coalesceScope() {
        return processId;
    }

    /**
     * Returns the project source root URI.
     *
     * @return source root URI
     */
    @Nonnull
    public URI sourceRoot() {
        return sourceRoot;
    }

    /**
     * Returns the process identifier.
     *
     * @return process ID string
     */
    @Nonnull
    public String processId() {
        return processId;
    }

    @Override
    public Map<String, String> serialize() {
        Map<String, String> fields = super.serialize();
        fields.put("sourceRoot", sourceRoot.toString());
        fields.put("processId", processId);
        return fields;
    }
}
