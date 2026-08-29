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

package io.ballerina.servicemodelgenerator.extension.validation;

/**
 * How a rule failure is treated: {@link #ERROR} blocks source generation, {@link #WARNING} is
 * reported alongside the generated edits.
 *
 * @since 1.8.0
 */
public enum ValidationSeverity {
    ERROR,
    WARNING;

    /** Parses the wire value, defaulting to {@link #ERROR} for absent or unrecognised input. */
    public static ValidationSeverity fromWire(String severity) {
        if (severity == null) {
            return ERROR;
        }
        return WARNING.name().equalsIgnoreCase(severity.trim()) ? WARNING : ERROR;
    }
}
