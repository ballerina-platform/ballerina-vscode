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

package io.ballerina.testmanagerservice.extension.model;

import io.ballerina.modelgenerator.commons.EvalTemplate;
import io.ballerina.tools.text.LineRange;

import java.util.List;

/**
 * A test in the evaluations group and the module-level agents it runs.
 *
 * @param functionName the test function name
 * @param lineRange    the range of the test function
 * @param template     the evaluation template the test calls, or {@code null} for a custom evaluation
 * @param agents       the agents the test runs, directly or through functions of the module
 */
public record Evaluation(String functionName, LineRange lineRange, EvalTemplate template,
                         List<EvaluationAgent> agents) {
}
