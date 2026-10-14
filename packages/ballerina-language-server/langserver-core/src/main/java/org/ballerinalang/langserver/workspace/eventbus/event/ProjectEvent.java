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
 * Domain event representing a project-scoped workspace manager event.
 * Used for WM-E1, WM-E3, WM-E5, WM-E7, and CI-E1 events.
 *
 * @since 1.7.0
 */
public class ProjectEvent extends DomainEvent {
    private final URI sourceRoot;

    /**
     * Creates a project event with no causation link.
     *
     * @param eventKind  the event kind
     * @param sourceRoot the source root URI of the affected project
     */
    public ProjectEvent(@Nonnull EventKind eventKind, @Nonnull URI sourceRoot) {
        this(eventKind, sourceRoot, null);
    }

    /**
     * Creates a project event with an optional causation link.
     *
     * @param eventKind   the event kind
     * @param sourceRoot  the source root URI of the affected project
     * @param causationId ID of the causing event, or {@code null}
     */
    public ProjectEvent(@Nonnull EventKind eventKind, @Nonnull URI sourceRoot, @Nullable UUID causationId) {
        super(Instant.now(), eventKind, causationId);
        this.sourceRoot = sourceRoot;
    }

    @Override
    public String coalesceScope() {
        return sourceRoot.toString();
    }

    /**
     * Returns the source root URI of the affected project.
     *
     * @return source root URI
     */
    @Nonnull
    public URI sourceRoot() {
        return sourceRoot;
    }

    @Override
    public Map<String, String> serialize() {
        Map<String, String> fields = super.serialize();
        fields.put("sourceRoot", sourceRoot.toString());
        return fields;
    }
}
