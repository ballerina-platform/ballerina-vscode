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
 * Enum representing graduated heap pressure levels for the Resource Monitor
 * bounded context (ADR-041).
 *
 * <p>Levels are ordered from lowest to highest pressure:
 * NORMAL (0%) &lt; WARNING (70%) &lt; CRITICAL (80%) &lt; EMERGENCY (90%)
 *
 * @since 1.7.0
 */
public enum HeapPressureLevel {
    /** No significant heap pressure - below WARNING threshold. */
    NORMAL(0.0),

    /** Early warning threshold - consumers may start proactive cleanup (70%). */
    WARNING(0.70),

    /** Strong pressure threshold - consumers should shed load (80%). */
    CRITICAL(0.80),

    /** Last resort threshold - consumers must take aggressive action (90%). */
    EMERGENCY(0.90);

    private final double threshold;

    HeapPressureLevel(double threshold) {
        this.threshold = threshold;
    }

    /**
     * Returns the threshold percentage for this pressure level.
     *
     * @return threshold as a ratio (e.g., 0.70 for 70%)
     */
    public double threshold() {
        return threshold;
    }
}
