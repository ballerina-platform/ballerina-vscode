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
 * Domain event representing a compilation engine event.
 * Used for CE-E1 through CE-E7 events.
 * Coalesces by descriptor name so concurrent compilations of the same package
 * coalesce correctly.
 *
 * @since 1.7.0
 */
public final class CompilerEvent extends DomainEvent {
    private final URI sourceRoot;
    private final String descriptorName;

    /**
     * Creates a compiler event with no causation link.
     *
     * @param eventKind      the event kind
     * @param sourceRoot     the project source root URI
     * @param descriptorName the package descriptor name used as coalesce scope
     */
    public CompilerEvent(@Nonnull EventKind eventKind, @Nonnull URI sourceRoot, @Nonnull String descriptorName) {
        this(eventKind, sourceRoot, descriptorName, null);
    }

    /**
     * Creates a compiler event with an optional causation link.
     *
     * @param eventKind      the event kind
     * @param sourceRoot     the project source root URI
     * @param descriptorName the package descriptor name used as coalesce scope
     * @param causationId    ID of the causing event, or {@code null}
     */
    public CompilerEvent(@Nonnull EventKind eventKind, @Nonnull URI sourceRoot, @Nonnull String descriptorName,
                         @Nullable UUID causationId) {
        super(Instant.now(), eventKind, causationId);
        this.sourceRoot = sourceRoot;
        this.descriptorName = descriptorName;
    }

    @Override
    public String coalesceScope() {
        return descriptorName;
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
     * Returns the package descriptor name.
     *
     * @return descriptor name
     */
    @Nonnull
    public String descriptorName() {
        return descriptorName;
    }

    @Override
    public Map<String, String> serialize() {
        Map<String, String> fields = super.serialize();
        fields.put("sourceRoot", sourceRoot.toString());
        fields.put("descriptorName", descriptorName);
        return fields;
    }
}
