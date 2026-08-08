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

package io.ballerina.servicemodelgenerator.extension.builder.service.agent;

import io.ballerina.modelgenerator.commons.trigger.models.TriggerUISchemaModel;
import io.ballerina.servicemodelgenerator.extension.connector.SchemaDrivenSourceGenerator;
import io.ballerina.servicemodelgenerator.extension.model.PropertyType;
import io.ballerina.servicemodelgenerator.extension.model.ValidationRule;
import io.ballerina.servicemodelgenerator.extension.model.Value;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static io.ballerina.servicemodelgenerator.extension.util.Constants.CLOSE_BRACE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.NEW_LINE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.ON;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.OPEN_BRACE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.SERVICE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.SPACE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.TWO_NEW_LINES;

/**
 * Runs an agent when something happens in another system.
 *
 * @since 1.9.0
 */
public class EventAgentTriggerChannel implements AgentTriggerChannel {

    static final String INSTRUCTIONS = "instructions";
    private static final String DEFAULT_INSTRUCTIONS =
            "Review this event and summarize what happened and what should be done next.";
    private static final String REPLY_METHOD_PREFIX = "runAgent";
    private static final String INDENT = "    ";

    private static final String REPLY_METHOD = """
                function {{method}}({{payloadType}} {{payload}}) {
                    string prompt = string `{{instructions}}

            Event payload:
            ${{{payload}}.toJsonString()}`;
                    string|error result = {{agentRun}};
                    if result is error {
                        log:printError("Agent run failed", result);
                        return;
                    }
                    // TODO: replace this with what should happen with the agent's answer
                    log:printInfo("Agent result", result = result);
                }""";

    private final String moduleName;

    public EventAgentTriggerChannel(String moduleName) {
        this.moduleName = moduleName;
    }

    @Override
    public String moduleName() {
        return moduleName;
    }

    @Override
    public AgentTriggerKind kind() {
        return AgentTriggerKind.EVENT;
    }

    @Override
    public Map<String, Value> additionalProperties() {
        return Map.of(INSTRUCTIONS, new Value.ValueBuilder()
                .metadata("Instructions", "What the agent should do with each event. The event itself is "
                        + "passed along automatically, so describe the task rather than the data.")
                .types(List.of(PropertyType.types(Value.FieldType.DOC_TEXT, "string")))
                .enabled(true)
                .editable(true)
                .optional(false)
                .value(DEFAULT_INSTRUCTIONS)
                .setValidations(List.of(new ValidationRule("common.validate.required")))
                .build());
    }

    @Override
    public String serviceBlock(AgentTriggerContext context) {
        TriggerUISchemaModel.ServiceTypeModel serviceType = context.serviceType();
        List<TriggerUISchemaModel.FunctionModel> handlers = serviceType == null || serviceType.functions() == null
                ? List.of() : serviceType.functions();
        if (handlers.isEmpty()) {
            return "";
        }
        TriggerUISchemaModel.FunctionModel primary = handlers.getFirst();
        String replyMethod = REPLY_METHOD_PREFIX + capitalize(primary.name());
        String payload = payloadName(primary);

        List<String> members = new ArrayList<>();
        members.add(render(primary, context, "_ = start self." + replyMethod + "(" + payload + ");"));
        for (TriggerUISchemaModel.FunctionModel handler : handlers.subList(1, handlers.size())) {
            members.add(render(handler, context, ""));
        }
        members.add(replyMethod(context, primary, replyMethod, payload));

        String basePath = context.basePath();
        return SERVICE + SPACE + context.serviceDescriptor() + SPACE
                + (basePath.isEmpty() ? "" : basePath + SPACE)
                + ON + SPACE + context.listenerVarName()
                + SPACE + OPEN_BRACE + NEW_LINE
                + String.join(TWO_NEW_LINES, members) + NEW_LINE
                + CLOSE_BRACE + NEW_LINE;
    }

    private String render(TriggerUISchemaModel.FunctionModel handler, AgentTriggerContext context, String body) {
        String source = SchemaDrivenSourceGenerator.buildHandlerSource(handler, moduleName, context.emitAlias());
        if (!body.isBlank()) {
            source = source.substring(0, source.lastIndexOf(CLOSE_BRACE))
                    + INDENT + body + NEW_LINE + CLOSE_BRACE;
        }
        return INDENT + source.replace(NEW_LINE, NEW_LINE + INDENT);
    }

    private String replyMethod(AgentTriggerContext context, TriggerUISchemaModel.FunctionModel handler,
                               String methodName, String payload) {
        return REPLY_METHOD
                .replace("{{method}}", methodName)
                .replace("{{payloadType}}", context.qualify(payloadType(handler)))
                .replace("{{instructions}}", escapeTemplate(context.formValue(INSTRUCTIONS)))
                .replace("{{agentRun}}", context.agentRun("prompt"))
                .replace("{{payload}}", payload);
    }

    private static String escapeTemplate(String instructions) {
        String text = instructions == null || instructions.isBlank() ? DEFAULT_INSTRUCTIONS : instructions.strip();
        return text.replace("`", "\\`").replace("${", "\\${");
    }

    private static String payloadName(TriggerUISchemaModel.FunctionModel handler) {
        TriggerUISchemaModel.Parameter parameter = firstParameter(handler);
        if (parameter == null || parameter.name() == null || parameter.name().value() == null) {
            return "payload";
        }
        return String.valueOf(parameter.name().value());
    }

    private static String payloadType(TriggerUISchemaModel.FunctionModel handler) {
        TriggerUISchemaModel.Parameter parameter = firstParameter(handler);
        if (parameter == null || parameter.type() == null || parameter.type().value() == null) {
            return "anydata";
        }
        return String.valueOf(parameter.type().value());
    }

    private static TriggerUISchemaModel.Parameter firstParameter(TriggerUISchemaModel.FunctionModel handler) {
        return handler.parameters() == null || handler.parameters().isEmpty()
                ? null : handler.parameters().getFirst();
    }

    private static String capitalize(String name) {
        return name == null || name.isEmpty() ? "" : Character.toUpperCase(name.charAt(0)) + name.substring(1);
    }
}
