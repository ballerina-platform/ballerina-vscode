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

package org.ballerinalang.langserver.workspace.compilerengine.recovery;

/**
 * Classifies compilation failures per ADR-033.
 *
 * <ul>
 *   <li>{@link #TRANSIENT} — retryable system errors (e.g., I/O timeouts)</li>
 *   <li>{@link #PERSISTENT} — source-level errors that require user fixes</li>
 *   <li>{@link #FATAL} — compiler bugs that should be reported</li>
 * </ul>
 *
 * @since 1.7.0
 */
public enum FailureClass {

    TRANSIENT("Retryable system error"),
    PERSISTENT("Source error requiring user fix"),
    FATAL("Compiler bug");

    private final String description;

    FailureClass(String description) {
        this.description = description;
    }

    /**
     * Returns a human-readable description of this failure class.
     *
     * @return failure description
     */
    public String description() {
        return description;
    }
}
