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

package org.ballerinalang.langserver.workspace.resourcemonitor;

/**
 * Event record published when heap pressure is detected by the Resource Monitor
 * (ADR-041, RM-E1: HeapPressureDetected).
 *
 * <p>This event is published to the shared-kernel event bus when JVM heap usage
 * crosses a configured threshold. Consumers include Workspace Manager
 * ({@code UriResolver}) and Compiler Engine (CompilationPipeline).
 *
 * @param level graduated pressure level at which this event was triggered
 * @param usedBytes current used heap memory in bytes
 * @param maxBytes maximum heap memory in bytes
 * @param ratio heap usage ratio
 * @param direction direction of the pressure transition
 * @since 1.7.0
 */
public record HeapPressureDetected(
        HeapPressureLevel level,
        long usedBytes,
        long maxBytes,
        double ratio,
        PressureDirection direction
) {
}
