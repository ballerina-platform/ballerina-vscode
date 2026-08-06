/*
 *  Copyright (c) 2025, WSO2 LLC. (http://www.wso2.com)
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

package io.ballerina.servicemodelgenerator.extension.model.response;

import io.ballerina.servicemodelgenerator.extension.validation.ValidationResult;
import org.eclipse.lsp4j.TextEdit;

import java.util.Arrays;
import java.util.List;
import java.util.Map;

/**
 * @param textEdits        the generated edits, empty when generation was refused
 * @param errorMsg         an unexpected failure, distinct from a validation failure
 * @param stacktrace       the stacktrace behind {@code errorMsg}
 * @param validationErrors rule failures found by the save-time gate. An ERROR here means no edits
 *                         were generated; WARNINGs ride along with a successful generation. The
 *                         client maps each entry back onto its field by {@code propertyPath}.
 */
public record CommonSourceResponse(Map<String, List<TextEdit>> textEdits, String errorMsg, String stacktrace,
                                   List<ValidationResult> validationErrors) {

    public CommonSourceResponse() {
        this(Map.of(), null, null, List.of());
    }

    public CommonSourceResponse(Map<String, List<TextEdit>> textEdits) {
        this(textEdits, null, null, List.of());
    }

    public CommonSourceResponse(Map<String, List<TextEdit>> textEdits, List<ValidationResult> validationErrors) {
        this(textEdits, null, null, validationErrors);
    }

    public CommonSourceResponse(Throwable e) {
        this(Map.of(), e.toString(), Arrays.toString(e.getStackTrace()), List.of());
    }

    /** Generation was refused because the model failed validation — no edits are produced. */
    public static CommonSourceResponse validationFailure(List<ValidationResult> validationErrors) {
        return new CommonSourceResponse(Map.of(), null, null, validationErrors);
    }
}
