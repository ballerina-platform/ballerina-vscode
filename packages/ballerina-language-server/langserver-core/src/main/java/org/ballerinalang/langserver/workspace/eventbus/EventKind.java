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

/**
 * Enumerates all domain event kinds routed via the shared-kernel event bus.
 *
 * @since 1.7.0
 */
public enum EventKind {
    WORKSPACE_PROJECT_REGISTERED("WM-E1"),
    WORKSPACE_PROJECT_EVICTED("WM-E2"),
    WORKSPACE_PROJECT_HEALTH_STATE_CHANGED("WM-E12"),
    WORKSPACE_PROJECT_KIND_TRANSITIONED("WM-E3"),
    WORKSPACE_PROJECT_UPDATED("WM-E4"),
    WORKSPACE_PROJECT_TIER_CHANGED("WM-E5"),
    WORKSPACE_BATCH_PROJECTS_REGISTERED("WM-E6"),
    WORKSPACE_LOCKING_MODE_CHANGED("WM-E7"),

    WM_FILE_WATCHED_CHANGED("WM-E11"),

    COMPILER_SNAPSHOT_PUBLISHED("CE-E1"),
    COMPILER_COMPILATION_FAILED("CE-E2"),
    COMPILER_COMPILATION_CANCELLED("CE-E3"),
    COMPILER_RESOLUTION_COMPLETED("CE-E4"),
    CE_E5A_RESOLUTION_DIAGNOSTICS_READY("CE-E5a"),
    CE_E5B_COMPILATION_DIAGNOSTICS_READY("CE-E5b"),
    CE_RESOLUTION_EXHAUSTED("CE-E6"),
    CE_RESOLUTION_RECOVERED("CE-E7"),

    EXECUTION_PROCESS_STARTED("EM-E1"),
    EXECUTION_PROCESS_OUTPUT("EM-E2"),
    EXECUTION_PROCESS_TERMINATED("EM-E3"),

    CACHE_INVALIDATION_REQUESTED("CI-E1"),

    RM_E1_HEAP_PRESSURE_DETECTED("RM-E1");

    private final String eventId;

    EventKind(String eventId) {
        this.eventId = eventId;
    }

    /**
     * Returns the architecture event identifier (for example, {@code WM-E1}).
     *
     * @return stable event identifier from domain model documents
     */
    public String eventId() {
        return eventId;
    }
}
