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

package io.ballerina.servicemodelgenerator.extension.model.response;

import io.ballerina.servicemodelgenerator.extension.validation.ValidationResult;

import java.util.Arrays;
import java.util.List;

/**
 * The outcome of a live {@code validateProperty} call. {@code version} echoes the request's, so a client
 * that has typed on since issuing the call can drop a now-stale answer.
 *
 * @param propertyPath     the path of the property this result answers for
 * @param version          echoes the request's version so stale answers can be dropped
 * @param validationErrors the failures found; empty when the value is acceptable
 * @param errorMsg         set only when the call itself failed, never for a validation failure
 * @param stacktrace       the failing call's stack trace, when {@code errorMsg} is set
 * @since 1.8.0
 */
public record ValidatePropertyResponse(String propertyPath, int version, List<ValidationResult> validationErrors,
                                       String errorMsg, String stacktrace) {

    public ValidatePropertyResponse(String propertyPath, int version, List<ValidationResult> validationErrors) {
        this(propertyPath, version, validationErrors, null, null);
    }

    public ValidatePropertyResponse(String propertyPath, int version, Throwable e) {
        this(propertyPath, version, List.of(), e.toString(), Arrays.toString(e.getStackTrace()));
    }
}
