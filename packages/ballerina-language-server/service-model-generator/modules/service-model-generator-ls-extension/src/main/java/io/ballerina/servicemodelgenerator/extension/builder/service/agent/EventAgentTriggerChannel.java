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
import io.ballerina.servicemodelgenerator.extension.connector.SchemaDrivenSourceGenerator.HandlerParameter;
import io.ballerina.servicemodelgenerator.extension.model.Codedata;
import io.ballerina.servicemodelgenerator.extension.model.Option;
import io.ballerina.servicemodelgenerator.extension.model.PropertyType;
import io.ballerina.servicemodelgenerator.extension.model.ServiceInitModel;
import io.ballerina.servicemodelgenerator.extension.model.ValidationRule;
import io.ballerina.servicemodelgenerator.extension.model.Value;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

import static io.ballerina.servicemodelgenerator.extension.util.Constants.ARG_TYPE_SERVICE_TYPE_DESCRIPTOR;
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
    static final String HANDLER = "agentEventHandler";
    private static final String DEFAULT_INSTRUCTIONS =
            "Review this event and summarize what happened and what should be done next.";
    private static final String REPLY_METHOD_PREFIX = "runAgent";
    private static final String INDENT = "    ";
    private static final String XML_TYPE = "xml";
    private static final String STRING_TYPE = "string";

    private static final Map<String, String> PREFERRED_HANDLER = Map.of("cdc:Service", "onCreate");

    private static final String REPLY_METHOD = """
                function {{method}}({{params}}) {
                    string prompt = string `{{instructions}}

            {{event}}`;
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
    public void customizeInitModel(ServiceInitModel initModel, TriggerUISchemaModel triggerModel) {
        if (initModel == null || triggerModel == null || triggerModel.serviceTypes() == null) {
            return;
        }
        Value descriptor = findServiceTypeField(initModel.getProperties());
        if (descriptor == null) {
            addSoleServiceTypeHandlerField(initModel, triggerModel);
            return;
        }
        Map<String, Value> perServiceType = new LinkedHashMap<>();
        for (TriggerUISchemaModel.ServiceTypeModel serviceType : triggerModel.serviceTypes()) {
            List<TriggerUISchemaModel.FunctionModel> handlers = handlersOf(serviceType);
            if (handlers.isEmpty()) {
                continue;
            }
            perServiceType.put(serviceType.name(), new Value.ValueBuilder()
                    .metadata(serviceType.name(), "Events of " + serviceType.name())
                    .value(serviceType.name())
                    .types(List.of(PropertyType.types(Value.FieldType.FORM)))
                    .enabled(true)
                    .editable(false)
                    .setProperties(Map.of(HANDLER, handlerField(handlers, serviceType.name())))
                    .build());
        }
        if (!perServiceType.isEmpty()) {
            descriptor.setProperties(perServiceType);
        }
    }

    private static void addSoleServiceTypeHandlerField(ServiceInitModel initModel,
                                                       TriggerUISchemaModel triggerModel) {
        if (triggerModel.serviceTypes().size() != 1) {
            return;
        }
        TriggerUISchemaModel.ServiceTypeModel only = triggerModel.serviceTypes().getFirst();
        List<TriggerUISchemaModel.FunctionModel> handlers = handlersOf(only);
        if (!handlers.isEmpty()) {
            initModel.addProperty(HANDLER, handlerField(handlers, only.name()));
        }
    }

    private static Value handlerField(List<TriggerUISchemaModel.FunctionModel> handlers, String serviceTypeName) {
        List<Option> options = handlers.stream()
                .map(handler -> new Option(handlerLabel(handler), handler.name()))
                .toList();
        return new Value.ValueBuilder()
                .metadata("Event", "The event that runs the agent. The channel's other events are still "
                        + "generated, with empty bodies.")
                .types(List.of(PropertyType.types(Value.FieldType.SINGLE_SELECT, options)))
                .enabled(true)
                .editable(true)
                .optional(false)
                .value(preferredHandler(handlers, serviceTypeName).name())
                .build();
    }

    private static String handlerLabel(TriggerUISchemaModel.FunctionModel handler) {
        String label = handler.metadata() == null ? null : handler.metadata().label();
        String name = label == null || label.isBlank() ? handler.name() : label;
        return handler.variantLabel() == null || handler.variantLabel().isBlank()
                ? name : name + " (" + handler.variantLabel() + ")";
    }

    private static Value findServiceTypeField(Map<String, Value> properties) {
        if (properties == null) {
            return null;
        }
        for (Value field : properties.values()) {
            Codedata codedata = field == null ? null : field.getCodedata();
            if (codedata != null && (ARG_TYPE_SERVICE_TYPE_DESCRIPTOR.equals(codedata.getArgType())
                    || ARG_TYPE_SERVICE_TYPE_DESCRIPTOR.equals(codedata.getType()))) {
                return field;
            }
            Value nested = field == null ? null : findServiceTypeField(field.getProperties());
            if (nested != null) {
                return nested;
            }
        }
        return null;
    }

    @Override
    public Optional<HandlerBinding> handlerBinding(AgentTriggerContext context) {
        List<TriggerUISchemaModel.FunctionModel> handlers = handlers(context);
        if (handlers.isEmpty()) {
            return Optional.empty();
        }
        TriggerUISchemaModel.FunctionModel primary = selectHandler(handlers, context.formValue(HANDLER),
                serviceTypeName(context));
        String replyMethodName = REPLY_METHOD_PREFIX + capitalize(primary.name());
        List<HandlerParameter> parameters = context.parametersOf(primary);
        String arguments = parameters.stream().map(HandlerParameter::name).collect(Collectors.joining(", "));
        String offload = "_ = start self." + replyMethodName + "(" + arguments + ");";
        return Optional.of(new HandlerBinding(primary.name(), offload,
                replyMethod(context, replyMethodName, parameters), render(primary, context, offload)));
    }

    private static List<TriggerUISchemaModel.FunctionModel> handlersOf(
            TriggerUISchemaModel.ServiceTypeModel serviceType) {
        if (serviceType == null) {
            return List.of();
        }
        List<TriggerUISchemaModel.FunctionModel> present = serviceType.functions();
        if (present != null && !present.isEmpty()) {
            return present;
        }
        return serviceType.schemaFunctions() == null ? List.of() : serviceType.schemaFunctions();
    }

    private static List<TriggerUISchemaModel.FunctionModel> handlers(AgentTriggerContext context) {
        return handlersOf(context.serviceType());
    }

    private static String serviceTypeName(AgentTriggerContext context) {
        return context.serviceType() == null ? "" : context.serviceType().name();
    }

    @Override
    public String serviceBlock(AgentTriggerContext context) {
        Optional<HandlerBinding> binding = handlerBinding(context);
        if (binding.isEmpty()) {
            return "";
        }
        String chosen = binding.get().handlerName();
        List<String> members = new ArrayList<>();
        for (TriggerUISchemaModel.FunctionModel handler : handlers(context)) {
            if (handler.name().equals(chosen)) {
                members.add(binding.get().handler());
            } else if (isPresent(handler)) {
                members.add(render(handler, context, ""));
            }
        }
        members.add(binding.get().replyMethod());

        StringBuilder block = new StringBuilder();
        for (String annotation : context.serviceAnnotations()) {
            block.append(annotation).append(NEW_LINE);
        }
        String basePath = context.basePath();
        block.append(SERVICE).append(SPACE).append(context.serviceDescriptor()).append(SPACE);
        if (!basePath.isEmpty()) {
            block.append(basePath).append(SPACE);
        }
        return block.append(ON).append(SPACE).append(context.listenerVarName())
                .append(SPACE).append(OPEN_BRACE).append(NEW_LINE)
                .append(String.join(TWO_NEW_LINES, members)).append(NEW_LINE)
                .append(CLOSE_BRACE).append(NEW_LINE).toString();
    }

    private static boolean isPresent(TriggerUISchemaModel.FunctionModel handler) {
        return handler.enabled() && !Boolean.TRUE.equals(handler.optional());
    }

    private String render(TriggerUISchemaModel.FunctionModel handler, AgentTriggerContext context, String body) {
        String source = SchemaDrivenSourceGenerator.buildHandlerSource(handler, moduleName, context.emitAlias());
        if (!body.isBlank()) {
            source = source.substring(0, source.lastIndexOf(CLOSE_BRACE))
                    + INDENT + body + NEW_LINE + CLOSE_BRACE;
        }
        return INDENT + source.replace(NEW_LINE, NEW_LINE + INDENT);
    }

    private String replyMethod(AgentTriggerContext context, String methodName, List<HandlerParameter> parameters) {
        return REPLY_METHOD
                .replace("{{method}}", methodName)
                .replace("{{params}}", parameters.stream()
                        .map(parameter -> parameter.type() + SPACE + parameter.name())
                        .collect(Collectors.joining(", ")))
                .replace("{{instructions}}", escapeTemplate(context.formValue(INSTRUCTIONS)))
                .replace("{{event}}", eventSection(parameters))
                .replace("{{agentRun}}", context.agentRun("prompt"));
    }

    private static String eventSection(List<HandlerParameter> parameters) {
        List<HandlerParameter> carried = parameters.stream().filter(HandlerParameter::carries).toList();
        if (carried.isEmpty()) {
            return "";
        }
        if (carried.size() == 1) {
            return "Event payload:" + NEW_LINE + interpolate(carried.getFirst());
        }
        return carried.stream()
                .map(parameter -> parameter.name() + ":" + NEW_LINE + interpolate(parameter))
                .collect(Collectors.joining(NEW_LINE + NEW_LINE));
    }

    private static String interpolate(HandlerParameter parameter) {
        String type = parameter.type().strip();
        if (STRING_TYPE.equals(type)) {
            return "${" + parameter.name() + "}";
        }
        String conversion = XML_TYPE.equals(type) || type.startsWith(XML_TYPE + "<") ? ".toString()"
                : ".toJsonString()";
        return "${" + parameter.name() + conversion + "}";
    }

    private static String escapeTemplate(String instructions) {
        String text = instructions == null || instructions.isBlank() ? DEFAULT_INSTRUCTIONS : instructions.strip();
        // A string template has no backslash escape, so both are escaped as interpolations of
        // themselves, as AiUtils.replaceBackticksForStringTemplate does. "${" goes first: the
        // backtick replacement introduces one.
        return text.replace("${", "${\"$\"}{").replace("`", "${\"`\"}");
    }

    private static TriggerUISchemaModel.FunctionModel selectHandler(
            List<TriggerUISchemaModel.FunctionModel> handlers, String selected, String serviceTypeName) {
        return handlers.stream()
                .filter(handler -> handler.name() != null && handler.name().equals(selected))
                .findFirst()
                .orElseGet(() -> preferredHandler(handlers, serviceTypeName));
    }

    private static TriggerUISchemaModel.FunctionModel preferredHandler(
            List<TriggerUISchemaModel.FunctionModel> handlers, String serviceTypeName) {
        String preferred = PREFERRED_HANDLER.get(serviceTypeName);
        return handlers.stream()
                .filter(handler -> handler.name() != null && handler.name().equals(preferred))
                .findFirst()
                .orElseGet(handlers::getFirst);
    }

    private static String capitalize(String name) {
        return name == null || name.isEmpty() ? "" : Character.toUpperCase(name.charAt(0)) + name.substring(1);
    }
}
