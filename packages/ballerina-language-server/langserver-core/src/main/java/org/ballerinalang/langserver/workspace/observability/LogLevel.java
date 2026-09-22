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

import java.util.Locale;

/**
 * Log levels for the trace logger.
 *
 * @since 1.7.0
 */
public enum LogLevel {
    /**
     * Most verbose - logs everything including TRACE events.
     */
    TRACE(0),
    /**
     * Debug level - logs DEBUG, INFO, WARN, ERROR.
     */
    DEBUG(1),
    /**
     * Default level - logs INFO, WARN, ERROR.
     */
    INFO(2),
    /**
     * Warning level - logs WARN, ERROR.
     */
    WARN(3),
    /**
     * Error level - logs only ERROR.
     */
    ERROR(4),
    /**
     * Disables all logging.
     */
    OFF(5);

    final int priority;

    LogLevel(int priority) {
        this.priority = priority;
    }

    /**
     * Parses a log level from a string.
     *
     * @param level the level string
     * @return the parsed level, or INFO if unknown
     */
    static LogLevel fromString(String level) {
        if (level == null) {
            return INFO;
        }
        return switch (level.toUpperCase(Locale.ROOT)) {
            case "TRACE" -> TRACE;
            case "DEBUG" -> DEBUG;
            case "INFO" -> INFO;
            case "WARN", "WARNING" -> WARN;
            case "ERROR" -> ERROR;
            case "OFF" -> OFF;
            default -> INFO;
        };
    }
}
