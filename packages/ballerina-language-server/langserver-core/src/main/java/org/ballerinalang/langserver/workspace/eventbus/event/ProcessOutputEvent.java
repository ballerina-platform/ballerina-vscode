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
import java.util.Map;
import java.util.UUID;

import javax.annotation.Nonnull;
import javax.annotation.Nullable;

/**
 * Domain event carrying a line of process output (stdout or stderr).
 * Used for EM-E2 events.
 *
 * @since 1.7.0
 */
public final class ProcessOutputEvent extends ProcessEvent {
    private final String output;

    /**
     * Creates a process-output event with no causation link.
     *
     * @param sourceRoot the project source root URI
     * @param processId  the process identifier
     * @param output     the output line (may include stream prefix)
     */
    public ProcessOutputEvent(@Nonnull URI sourceRoot, @Nonnull String processId, @Nonnull String output) {
        this(sourceRoot, processId, output, null);
    }

    /**
     * Creates a process-output event with an optional causation link.
     *
     * @param sourceRoot  the project source root URI
     * @param processId   the process identifier
     * @param output      the output line
     * @param causationId ID of the causing event, or {@code null}
     */
    public ProcessOutputEvent(@Nonnull URI sourceRoot, @Nonnull String processId, @Nonnull String output,
                              @Nullable UUID causationId) {
        super(EventKind.EXECUTION_PROCESS_OUTPUT, sourceRoot, processId, causationId);
        this.output = output;
    }

    /**
     * Returns the process output line.
     *
     * @return output line
     */
    @Nonnull
    public String output() {
        return output;
    }

    @Override
    public Map<String, String> serialize() {
        Map<String, String> fields = super.serialize();
        fields.put("output", output);
        return fields;
    }
}
