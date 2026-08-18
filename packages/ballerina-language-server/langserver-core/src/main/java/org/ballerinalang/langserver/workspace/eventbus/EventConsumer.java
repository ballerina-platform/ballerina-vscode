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

import org.ballerinalang.langserver.workspace.eventbus.event.BatchEvent;
import org.ballerinalang.langserver.workspace.eventbus.event.CompilerEvent;
import org.ballerinalang.langserver.workspace.eventbus.event.DomainEvent;
import org.ballerinalang.langserver.workspace.eventbus.event.HeapPressureEvent;
import org.ballerinalang.langserver.workspace.eventbus.event.ProcessEvent;
import org.ballerinalang.langserver.workspace.eventbus.event.ProcessOutputEvent;
import org.ballerinalang.langserver.workspace.eventbus.event.ProjectEvent;

/**
 * Interface for type-safe dispatch of domain events using Java 17 pattern matching.
 *
 * <p>Subscribers implement this interface and override only the handler methods they need.
 * The default {@link #consume(DomainEvent)} method dispatches to the correct typed handler
 * based on the concrete event type.
 *
 * <p>Subtypes must appear before supertypes in the switch to ensure most-specific match:
 * {@link ProjectEvictedEvent} before {@link ProjectEvent},
 * {@link ProcessOutputEvent} before {@link ProcessEvent}.
 *
 * @since 1.7.0
 */
public interface EventConsumer {

    /**
     * Dispatches the given event to the most-specific typed handler.
     *
     * @param event the domain event to dispatch
     */
    default void consume(DomainEvent event) {
        switch (event) {
            case ProjectEvictedEvent e          -> onProjectEvicted(e);
            case ProjectKindTransitionedEvent e -> onProjectKindTransitioned(e);
            case ProjectEvent e                 -> onProjectEvent(e);
            case CompilerEvent e                -> onCompilerEvent(e);
            case ProcessOutputEvent e           -> onProcessOutput(e);
            case ProcessEvent e                 -> onProcessEvent(e);
            case HeapPressureEvent e            -> onHeapPressure(e);
            case BatchEvent e                   -> onBatchEvent(e);
            default                             -> { }
        }
    }

    /**
     * Called when a project is registered, health-changed, tier-changed, or locking-mode-changed.
     *
     * @param event the project event
     */
    default void onProjectEvent(ProjectEvent event) { }

    /**
     * Called when a project is evicted from the registry.
     *
     * @param event the project evicted event
     */
    default void onProjectEvicted(ProjectEvictedEvent event) { }

    /**
     * Called when a project transitions between kinds.
     *
     * @param event the project kind transitioned event
     */
    default void onProjectKindTransitioned(ProjectKindTransitionedEvent event) { }

    /**
     * Called for all compilation engine events (CE-E1 through CE-E7).
     *
     * @param event the compiler event
     */
    default void onCompilerEvent(CompilerEvent event) { }

    /**
     * Called when a process starts or terminates.
     *
     * @param event the process event
     */
    default void onProcessEvent(ProcessEvent event) { }

    /**
     * Called when a process produces output.
     *
     * @param event the process output event
     */
    default void onProcessOutput(ProcessOutputEvent event) { }

    /**
     * Called when heap pressure level changes.
     *
     * @param event the heap pressure event
     */
    default void onHeapPressure(HeapPressureEvent event) { }

    /**
     * Called when multiple projects are batch-registered.
     *
     * @param event the batch event
     */
    default void onBatchEvent(BatchEvent event) { }
}
