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

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Resolves the {@link TraceLogSink} list shared by the event-trace and diagnostic channels.
 *
 * <p>The sink set is driven by the {@code ballerina.ls.trace.sinks} system property, a
 * comma-separated list of sink names ({@code console}, {@code file}, or {@code none}). When the
 * property is absent, the default is {@code file}, preserving the historical file-only
 * behaviour. Unknown names are ignored, and a file sink that cannot be created is skipped so
 * that logging degrades gracefully rather than failing startup.
 *
 * @since 1.7.0
 */
public final class TraceSinkFactory {
    /**
     * System property selecting the trace sinks, e.g. {@code console,file}.
     */
    public static final String SINKS_PROPERTY = "ballerina.ls.trace.sinks";

    private static final String DEFAULT_SINKS = "file";

    private TraceSinkFactory() {
    }

    /**
     * Resolves the configured trace sinks.
     *
     * @return an immutable list of trace sinks (possibly empty)
     */
    public static List<TraceLogSink> resolve() {
        String configured = System.getProperty(SINKS_PROPERTY, DEFAULT_SINKS);
        List<TraceLogSink> sinks = new ArrayList<>();
        for (String token : configured.split(",")) {
            switch (token.trim().toLowerCase(Locale.ROOT)) {
                case "console" -> sinks.add(new ConsoleTraceLogSink());
                case "file" -> addFileSink(sinks);
                case "none", "" -> {
                    // Explicitly disabled or empty token.
                }
                default -> {
                    // Unknown sink name — ignored.
                }
            }
        }
        return List.copyOf(sinks);
    }

    private static void addFileSink(List<TraceLogSink> sinks) {
        try {
            sinks.add(new FileTraceLogSink());
        } catch (IOException ignored) {
            // Degrade gracefully if file logging is unavailable.
        }
    }
}
