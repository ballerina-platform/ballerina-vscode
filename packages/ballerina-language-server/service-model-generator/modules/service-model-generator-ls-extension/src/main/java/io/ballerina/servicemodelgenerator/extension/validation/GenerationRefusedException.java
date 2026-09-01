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
 * A refusal raised while generating source, carried back as a form validation failure.
 *
 * <p>A plain exception is the wrong channel: the extension reads {@code validationErrors} and
 * {@code textEdits} off the response and never reads {@code errorMsg}, so a throw becomes a submit
 * that writes nothing and reports nothing. This reaches the field named by {@code propertyPath}.
 *
 * @since 1.9.0
 */
public class GenerationRefusedException extends RuntimeException {

    private static final String RULE = "generation.refused";

    private final String propertyPath;

    public GenerationRefusedException(String propertyPath, String message) {
        super(message);
        this.propertyPath = propertyPath;
    }

    public ValidationResult toValidationResult() {
        return new ValidationResult(propertyPath, RULE, getMessage(), ValidationSeverity.ERROR);
    }
}
