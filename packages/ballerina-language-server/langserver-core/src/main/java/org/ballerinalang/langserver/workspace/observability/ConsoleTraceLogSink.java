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

import java.util.Map;

/**
 * Console-backed trace log sink.
 *
 * @since 1.7.0
 */
public final class ConsoleTraceLogSink implements TraceLogSink {
    private static final java.io.PrintStream OUTPUT_STREAM = System.out;

    /**
     * Writes the formatted trace entry to standard output.
     *
     * @param level log level for the entry
     * @param fields structured fields to write
     */
    @Override
    public void write(String level, Map<String, String> fields) {
        OUTPUT_STREAM.println(WorkspaceTraceLogger.formatLogEntry(level, fields));
    }

    /**
     * Leaves the shared console stream open.
     */
    @Override
    public void close() {
        // No-op. System.out must remain open for the process lifetime.
    }
}
