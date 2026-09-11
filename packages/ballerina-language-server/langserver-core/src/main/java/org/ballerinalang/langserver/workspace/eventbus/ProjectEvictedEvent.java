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

import org.ballerinalang.langserver.workspace.eventbus.event.ProjectEvent;
import org.ballerinalang.langserver.workspace.workspacemanager.project.EvictionReason;

import java.net.URI;
import java.util.Map;
import java.util.UUID;

import javax.annotation.Nonnull;
import javax.annotation.Nullable;

/**
 * Domain event emitted when a project is evicted from the registry.
 * Carries the eviction reason so consumers can distinguish normal lifecycle
 * from heap-pressure eviction and LRU churn.
 *
 * @since 1.7.0
 */
public final class ProjectEvictedEvent extends ProjectEvent {
    private final EvictionReason evictionReason;

    /**
     * Creates a project-evicted event with no causation link.
     *
     * @param sourceRoot     the source root URI of the evicted project
     * @param evictionReason reason for the eviction
     */
    public ProjectEvictedEvent(@Nonnull URI sourceRoot, @Nonnull EvictionReason evictionReason) {
        this(sourceRoot, evictionReason, null);
    }

    /**
     * Creates a project-evicted event with an optional causation link.
     *
     * @param sourceRoot     the source root URI of the evicted project
     * @param evictionReason reason for the eviction
     * @param causationId    ID of the causing event, or {@code null}
     */
    public ProjectEvictedEvent(@Nonnull URI sourceRoot, @Nonnull EvictionReason evictionReason,
                               @Nullable UUID causationId) {
        super(EventKind.WORKSPACE_PROJECT_EVICTED, sourceRoot, causationId);
        this.evictionReason = evictionReason;
    }

    /**
     * Returns the reason this project was evicted.
     *
     * @return eviction reason
     */
    @Nonnull
    public EvictionReason evictionReason() {
        return evictionReason;
    }

    @Override
    public Map<String, String> serialize() {
        Map<String, String> fields = super.serialize();
        fields.put("evictionReason", evictionReason.name());
        return fields;
    }
}
