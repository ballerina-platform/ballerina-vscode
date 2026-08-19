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
 * Direction of a heap pressure level transition (ADR-041 §4).
 *
 * <p>{@code RISING} indicates escalation (heap usage crossed a threshold upward);
 * {@code FALLING} indicates recovery (heap usage dropped below a hysteresis clear point).
 *
 * @since 1.7.0
 */
public enum PressureDirection {
    /** Pressure level increased — heap usage crossed a threshold upward. */
    RISING,

    /** Pressure level decreased — heap usage dropped below a hysteresis clear point. */
    FALLING
}
