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

package io.ballerina.testmanagerservice.extension.response;

import io.ballerina.testmanagerservice.extension.model.Evaluation;

import java.util.Arrays;
import java.util.List;

/**
 * Represents a response to discover the evaluations of a project.
 *
 * @param evaluations discovered evaluations
 * @param errorMsg    error message if an error occurred
 * @param stacktrace  stacktrace of the error
 */
public record EvaluationsDiscoveryResponse(List<Evaluation> evaluations, String errorMsg, String stacktrace) {

    public static EvaluationsDiscoveryResponse from(List<Evaluation> evaluations) {
        return new EvaluationsDiscoveryResponse(evaluations, null, null);
    }

    public static EvaluationsDiscoveryResponse from(Throwable e) {
        return new EvaluationsDiscoveryResponse(null, e.toString(), Arrays.toString(e.getStackTrace()));
    }
}
