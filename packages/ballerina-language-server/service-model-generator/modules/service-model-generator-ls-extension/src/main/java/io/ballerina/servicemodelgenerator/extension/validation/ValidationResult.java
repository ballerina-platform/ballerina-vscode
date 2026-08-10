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
 * A single rule failure. {@code propertyPath} is the dot path from the model root through
 * {@code properties}/{@code choices} keys, matching how the client maps it back onto the field.
 *
 * @param propertyPath the dot path from the model root to the offending field
 * @param rule         the identifier of the rule that failed
 * @param message      a human-readable description of the failure
 * @param severity     ERROR blocks generation; WARNING does not
 * @since 1.8.0
 */
public record ValidationResult(String propertyPath, String rule, String message, ValidationSeverity severity) {

    public boolean isError() {
        return severity == ValidationSeverity.ERROR;
    }
}
