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
 * Singleton {@link DiagnosticLog} that discards every entry.
 *
 * <p>Used as the default for components whose constructors are not given an explicit
 * {@link DiagnosticLog} (e.g. {@code DualSnapshotStore}'s no-arg constructor), so that
 * diagnostics are silently dropped rather than routed to a real sink.
 *
 * @since 1.7.0
 */
public final class NoOpDiagnosticLog implements DiagnosticLog {

    /**
     * Shared no-op instance.
     */
    public static final NoOpDiagnosticLog INSTANCE = new NoOpDiagnosticLog();

    private NoOpDiagnosticLog() {
    }

    @Override
    public void log(LogLevel level, String source, String message) {
        // No-op.
    }

    @Override
    public void log(LogLevel level, String source, String message, Throwable t) {
        // No-op.
    }
}
