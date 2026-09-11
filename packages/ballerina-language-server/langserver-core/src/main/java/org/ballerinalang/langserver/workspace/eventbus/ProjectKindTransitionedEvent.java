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
import org.ballerinalang.langserver.workspace.workspacemanager.project.ProjectKind;

import java.net.URI;
import java.util.Map;
import java.util.UUID;

import javax.annotation.Nonnull;
import javax.annotation.Nullable;

/**
 * Domain event emitted when a project transitions between kinds (e.g., SINGLE_FILE to BUILD).
 *
 * @since 1.7.0
 */
public final class ProjectKindTransitionedEvent extends ProjectEvent {
    private final ProjectKind newKind;

    /**
     * Creates a project-kind-transitioned event with no causation link.
     *
     * @param sourceRoot the source root URI of the affected project
     * @param newKind    the target project kind after the transition
     */
    public ProjectKindTransitionedEvent(@Nonnull URI sourceRoot, @Nonnull ProjectKind newKind) {
        this(sourceRoot, newKind, null);
    }

    /**
     * Creates a project-kind-transitioned event with an optional causation link.
     *
     * @param sourceRoot  the source root URI of the affected project
     * @param newKind     the target project kind after the transition
     * @param causationId ID of the causing event, or {@code null}
     */
    public ProjectKindTransitionedEvent(@Nonnull URI sourceRoot, @Nonnull ProjectKind newKind,
                                        @Nullable UUID causationId) {
        super(EventKind.WORKSPACE_PROJECT_KIND_TRANSITIONED, sourceRoot, causationId);
        this.newKind = newKind;
    }

    /**
     * Returns the project kind after the transition.
     *
     * @return new project kind
     */
    @Nonnull
    public ProjectKind newKind() {
        return newKind;
    }

    @Override
    public Map<String, String> serialize() {
        Map<String, String> fields = super.serialize();
        fields.put("newKind", newKind.name());
        return fields;
    }
}
