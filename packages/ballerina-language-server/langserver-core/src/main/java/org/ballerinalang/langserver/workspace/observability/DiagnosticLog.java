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

package org.ballerinalang.langserver.workspace.observability;

/**
 * Best-effort free-text/exception diagnostic logger.
 *
 * <p>Carries human-readable diagnostics (as opposed to the structured
 * {@code DomainEvent} traces handled by {@link WorkspaceTraceLogger}) to the same
 * {@link TraceLogSink} instances, tagged distinctly so the two channels are not
 * merged. Implementations must absorb failures and never throw.
 *
 * @since 1.7.0
 */
public interface DiagnosticLog {

    /**
     * Logs a diagnostic message at the given level.
     *
     * @param level   log level for the entry
     * @param source  the component that emitted the diagnostic (e.g. a class name)
     * @param message the human-readable message
     */
    void log(LogLevel level, String source, String message);

    /**
     * Logs a diagnostic message with an associated throwable at the given level.
     *
     * @param level   log level for the entry
     * @param source  the component that emitted the diagnostic (e.g. a class name)
     * @param message the human-readable message
     * @param t       the throwable to attach, or {@code null} if none
     */
    void log(LogLevel level, String source, String message, Throwable t);
}
