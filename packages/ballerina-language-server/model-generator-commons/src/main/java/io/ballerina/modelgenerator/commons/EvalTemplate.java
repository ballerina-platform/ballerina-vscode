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

package io.ballerina.modelgenerator.commons;

import io.ballerina.compiler.api.symbols.AnnotationAttachmentSymbol;
import io.ballerina.compiler.api.symbols.FunctionSymbol;
import io.ballerina.compiler.api.symbols.ModuleSymbol;
import io.ballerina.compiler.api.values.ConstantValue;

import java.util.Map;
import java.util.Optional;

/**
 * An {@code ballerina/ai.eval} function annotated with {@code @EvalTemplate}.
 *
 * @param symbol       The template function name.
 * @param label        The display label.
 * @param description  What the template checks.
 * @param kind         {@code RULE_BASED} or {@code LLM_JUDGE}.
 * @param needsEvalset Whether the template only accepts an evalset.
 */
public record EvalTemplate(String symbol, String label, String description, String kind, boolean needsEvalset) {

    private static final String EVAL_MODULE = "ai.eval";
    private static final String ANNOTATION = "EvalTemplate";

    public static Optional<EvalTemplate> from(FunctionSymbol function) {
        Optional<String> name = function.getName();
        if (name.isEmpty() || function.getModule().filter(EvalTemplate::isEvalModule).isEmpty()) {
            return Optional.empty();
        }
        for (AnnotationAttachmentSymbol attachment : function.annotAttachments()) {
            if (!ANNOTATION.equals(attachment.typeDescriptor().getName().orElse(null))
                    || attachment.typeDescriptor().getModule().filter(EvalTemplate::isEvalModule).isEmpty()) {
                continue;
            }
            Object value = attachment.attachmentValue().map(ConstantValue::value).orElse(null);
            if (!(value instanceof Map<?, ?> fields)) {
                return Optional.empty();
            }
            return Optional.of(new EvalTemplate(name.get(), field(fields, "label", name.get()),
                    field(fields, "description", ""), field(fields, "kind", "RULE_BASED"),
                    Boolean.parseBoolean(field(fields, "needsEvalset", "false"))));
        }
        return Optional.empty();
    }

    private static boolean isEvalModule(ModuleSymbol module) {
        return CommonUtils.BALLERINA_ORG_NAME.equals(module.id().orgName())
                && EVAL_MODULE.equals(module.id().moduleName());
    }

    private static String field(Map<?, ?> fields, String key, String defaultValue) {
        Object value = fields.get(key);
        if (value instanceof ConstantValue constantValue) {
            value = constantValue.value();
        }
        return value == null ? defaultValue : String.valueOf(value).replace("\"", "");
    }
}
