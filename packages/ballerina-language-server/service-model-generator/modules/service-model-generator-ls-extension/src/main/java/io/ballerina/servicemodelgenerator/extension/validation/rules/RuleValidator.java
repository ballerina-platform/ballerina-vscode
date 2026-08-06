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

package io.ballerina.servicemodelgenerator.extension.validation.rules;

import io.ballerina.servicemodelgenerator.extension.model.Value;
import io.ballerina.servicemodelgenerator.extension.validation.ValidationContext;

import java.util.Map;
import java.util.Optional;

/**
 * One named validation rule. {@link Optional#empty()} means pass or skip (e.g. a rule that cannot
 * meaningfully judge the value); on failure it returns an uninterpolated default message template,
 * which the engine substitutes and a model-supplied {@code message} may override.
 *
 * @since 1.8.0
 */
@FunctionalInterface
public interface RuleValidator {

    /**
     * @param args    never {@code null}; empty when the model supplied none
     * @param context project context; {@code common.*} validators ignore it
     */
    Optional<String> validate(Value node, Map<String, Object> args, ValidationContext context);
}
