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

import io.ballerina.compiler.syntax.tree.ListenerDeclarationNode;
import io.ballerina.compiler.syntax.tree.ModuleMemberDeclarationNode;
import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.servicemodelgenerator.extension.connector.SchemaDrivenSourceGenerator;
import io.ballerina.servicemodelgenerator.extension.model.PropertyType;
import io.ballerina.servicemodelgenerator.extension.model.ServiceInitModel;
import io.ballerina.servicemodelgenerator.extension.model.Value;
import io.ballerina.servicemodelgenerator.extension.model.context.GetServiceInitModelContext;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Pattern;

import static io.ballerina.servicemodelgenerator.extension.builder.service.agent.A2aAgentCard.FIRST_PORT;

/**
 * Publishes an agent over A2A with an {@code a2a:RestListener}, an Agent Card and the A2A operations.
 *
 * @since 1.9.0
 */
public class A2aChannel implements AgentTriggerChannel {

    static final String ORG_NAME = "ballerina";
    static final String MODULE_NAME = "a2a";
    static final String AI_IMPORT = "ballerina/ai";

    static final String CARD_NAME = "cardName";
    static final String CARD_DESCRIPTION = "cardDescription";
    static final String CARD_VERSION = "cardVersion";
    static final String SKILLS = "skills";
    static final String STREAMING = "streaming";
    static final String PUSH_NOTIFICATIONS = "pushNotifications";
    static final String PROVIDER = "providerOrganization";
    static final String PROVIDER_URL = "providerUrl";
    static final String PROVIDER_EMAIL = "providerEmail";
    static final String SKILLS_SUMMARY = "skillsSummary";
    static final String EXTENDED_CARD = "extendedAgentCard";
    static final String OUTPUT_MODES = "outputModes";
    static final String TEXT_MODE = "text";
    static final String DOCUMENTATION_URL = "documentationUrl";
    static final String ICON_URL = "iconUrl";
    static final String INPUT_MODES = "inputModes";
    static final String EXISTING_EXECUTOR = "existingExecutor";
    static final String EXISTING_STORE = "existingStore";
    static final String EXISTING_PORT = "existingPort";
    static final String PORT = "port";
    static final String PUBLIC_URL = "publicUrl";
    static final String UNSUPPORTED = "unsupportedReason";
    private static final String AGENT_NAME = "agentName";

    private static final String EXECUTOR_CLASS = """

            isolated class {{executor}} {
                *{{alias}}:AgentExecutor;

                public isolated function execute({{alias}}:RequestContext context, {{alias}}:TaskUpdater updater)
                        returns {{alias}}:Message|{{alias}}:Error? {
                    check updater.working();
                    string query = string:'join(" ", ...from {{alias}}:Part part in context.message.parts
                        select part?.text ?: "");
                    string|ai:Error reply = {{agent}}.run(query, sessionId = updater.getContextId());
                    if reply is ai:Error {
                        return error {{alias}}:InternalError(reply.message(), message = reply.message());
                    }
                    check updater.addArtifact([{text: reply}]);
                    check updater.complete();
                    return;
                }
            }
            """;

    private static final String TASK_STORE_DECLARATION = """

            final {{alias}}:InMemoryTaskStore {{store}} = new;
            """;

    private static final String SERVICE_BLOCK = """
            {{storeDecl}}{{executorClass}}
            @{{alias}}:ServiceConfig {
                agentCard: {{card}}
            }
            isolated service on {{listener}} {

                private final {{alias}}:DefaultHandler handler = new (new {{executor}}(), taskStore = {{store}});
            {{resources}}}
            """;

    private static final String SEND = """

                isolated resource function post message\\:send({{alias}}:Context context,
                        {{alias}}:SendMessageRequest request)
                        returns {{alias}}:Task|{{alias}}:Message|{{alias}}:Error {
                    var response = self.handler.handleSendMessage(context, request);
                    return response;
                }
            """;
    private static final String STREAM = """

                isolated resource function post message\\:stream({{alias}}:Context context,
                        {{alias}}:SendMessageRequest request)
                        returns stream<{{alias}}:StreamResponse, {{alias}}:Error?>|{{alias}}:Error {
                    var response = self.handler.handleSendStreamingMessage(context, request);
                    return response;
                }

                isolated resource function get tasks/[string id]/subscribe(
                        {{alias}}:Context context, {{alias}}:SubscribeToTaskRequest request)
                        returns stream<{{alias}}:StreamResponse, {{alias}}:Error?>|{{alias}}:Error {
                    var response = self.handler.handleSubscribeToTask(context, request);
                    return response;
                }
            """;
    private static final String TASKS = """

                isolated resource function get tasks/[string id]({{alias}}:Context context,
                        {{alias}}:GetTaskRequest request)
                        returns {{alias}}:Task|{{alias}}:Error {
                    var response = self.handler.handleGetTask(context, request);
                    return response;
                }

                isolated resource function get tasks({{alias}}:Context context, {{alias}}:ListTasksRequest request)
                        returns {{alias}}:ListTasksResponse|{{alias}}:Error {
                    var response = self.handler.handleListTasks(context, request);
                    return response;
                }

                isolated resource function post tasks/[string id]/cancel({{alias}}:Context context,
                        {{alias}}:CancelTaskRequest request)
                        returns {{alias}}:Task|{{alias}}:Error {
                    var response = self.handler.handleCancelTask(context, request);
                    return response;
                }
            """;

    private static final String PUSH = """

                isolated resource function post tasks/[string id]/pushNotificationConfigs({{alias}}:Context context,
                        {{alias}}:TaskPushNotificationConfig request)
                        returns {{alias}}:TaskPushNotificationConfig|{{alias}}:Error {
                    var response = self.handler.handleCreateTaskPushNotificationConfig(context, request);
                    return response;
                }

                isolated resource function get tasks/[string id]/pushNotificationConfigs/[string configId](
                        {{alias}}:Context context, {{alias}}:GetTaskPushNotificationConfigRequest request)
                        returns {{alias}}:TaskPushNotificationConfig|{{alias}}:Error {
                    var response = self.handler.handleGetTaskPushNotificationConfig(context, request);
                    return response;
                }

                isolated resource function get tasks/[string id]/pushNotificationConfigs(
                        {{alias}}:Context context, {{alias}}:ListTaskPushNotificationConfigsRequest request)
                        returns {{alias}}:ListTaskPushNotificationConfigsResponse|{{alias}}:Error {
                    var response = self.handler.handleListTaskPushNotificationConfigs(context, request);
                    return response;
                }

                isolated resource function delete tasks/[string id]/pushNotificationConfigs/[string configId](
                        {{alias}}:Context context, {{alias}}:DeleteTaskPushNotificationConfigRequest request)
                        returns {{alias}}:Error? {
                    var response = self.handler.handleDeleteTaskPushNotificationConfig(context, request);
                    return response;
                }
            """;

    @Override
    public AgentTriggerKind kind() {
        return AgentTriggerKind.A2A;
    }

    @Override
    public boolean isSchemaDriven() {
        return false;
    }

    @Override
    public List<String> imports() {
        return List.of(AI_IMPORT);
    }

    @Override
    public Optional<ServiceInitModel> initModel(GetServiceInitModelContext context) {
        return Optional.of(buildInitModel(context, A2aAgentCard.sourcesOf(context.project())));
    }

    ServiceInitModel buildInitModel(GetServiceInitModelContext context, List<String> sources) {
        String agent = context.agentName();
        A2aAgentCard.Defaults defaults = A2aAgentCard.derive(agent, sources);

        ServiceInitModel model = new ServiceInitModel("a2a-server", "A2A",
                "Attach the agent to A2A so other agents can call it over the A2A protocol.",
                context.orgName(), context.packageName(), MODULE_NAME, context.version(), "agent-a2a", "");
        model.addProperty(CARD_NAME, text("Agent Name", "Shown to calling agents.", defaults.name()));
        model.addProperty(CARD_DESCRIPTION, text("Description",
                "Calling agents read this to decide whether to delegate.", defaults.description()));
        model.addProperty(CARD_VERSION, text("Version", "The version of this agent.", A2aAgentCard.DEFAULT_VERSION));
        model.addProperty(SKILLS, hidden("Skills", A2aAgentCard.skillsToJson(defaults.skills())));
        model.addProperty(SKILLS_SUMMARY, readOnly("Skills", "What the card advertises, generated from the agent. "
                + "Change the skills in the generated card.", Value.FieldType.DOC_TEXT,
                skillsSummary(defaults.skills())));
        model.addProperty(INPUT_MODES, select("Input Modes", "What callers may send to the agent.",
                List.of(TEXT_MODE)));
        model.addProperty(OUTPUT_MODES, select("Output Modes", "What the agent replies with.",
                List.of(TEXT_MODE)));
        model.addProperty(STREAMING, flag("Streaming",
                "Let callers follow a task as it runs. Adds message:stream and tasks/{id}/subscribe.", "true"));
        model.addProperty(PUSH_NOTIFICATIONS, flag("Push notifications",
                "Let callers register a webhook that is called when a task changes. Adds the four "
                        + "pushNotificationConfigs operations.", "true"));
        model.addProperty(EXTENDED_CARD, readOnly("Extended agent card", "A richer card that only signed-in callers "
                + "can fetch. It needs authentication on the listener, which is not offered yet.",
                Value.FieldType.TEXT, "Not available yet"));
        model.addProperty(PORT, number("Port", "Each A2A agent needs its own port.",
                String.valueOf(A2aAgentCard.freePort(sources))));
        model.addProperty(PROVIDER, advancedText("Provider",
                "The organization that publishes the agent, shown on the card."));
        model.addProperty(PROVIDER_URL, advancedText("Provider URL", "The organization's website."));
        model.addProperty(PROVIDER_EMAIL, advancedText("Provider contact email",
                "Where callers can reach the people behind the agent."));
        model.addProperty(DOCUMENTATION_URL, advancedText("Documentation URL",
                "A link to human-readable documentation."));
        model.addProperty(ICON_URL, advancedText("Icon URL", "A link to an icon for the agent."));
        model.addProperty(PUBLIC_URL, advancedText("Public URL",
                "Set when callers reach the agent through a gateway or proxy."));
        String executorClass = A2aAgentCard.pascal(agent) + "A2aExecutor";
        model.addProperty(EXISTING_EXECUTOR, hidden("Existing executor", String.valueOf(
                sources.stream().anyMatch(source -> Pattern.compile("\\bclass\\s+" + executorClass + "\\b")
                        .matcher(source).find()))));
        model.addProperty(EXISTING_STORE, hidden("Existing task store", String.valueOf(
                sources.stream().anyMatch(source -> Pattern.compile("\\bInMemoryTaskStore\\s+" + storeVar(agent)
                        + "\\b").matcher(source).find()))));
        model.addProperty(EXISTING_PORT, hidden("Existing port", String.valueOf(
                sources.stream().anyMatch(source -> Pattern.compile("\\bconfigurable\\s+int\\s+" + portVar(agent)
                        + "\\b").matcher(source).find()))));
        String unsupported = unsupportedReason(context, sources);
        if (unsupported != null) {
            model.addProperty(UNSUPPORTED, hidden("Unsupported", unsupported));
        }
        return model;
    }

    private static String unsupportedReason(GetServiceInitModelContext context, List<String> sources) {
        Pattern service = Pattern.compile("\\bservice\\s+on\\s+" + listenerVar(context.agentName()) + "\\b");
        if (sources.stream().anyMatch(source -> service.matcher(source).find())) {
            return "This agent is already attached to A2A. Open its A2A service to change it.";
        }
        if (AgentTriggerContext.DURABLE_KIND.equals(context.agentKind())) {
            return "Durable agents can't be attached to A2A yet.";
        }
        String org = context.agentOrgName();
        if (org != null && !org.isBlank() && !ORG_NAME.equals(org)) {
            return "Agents from other libraries can't be attached to A2A yet.";
        }
        return null;
    }

    @Override
    public Optional<SchemaDrivenSourceGenerator.ResolvedListener> listener(ModulePartNode rootNode, String alias,
                                                                          Map<String, String> formValues) {
        String agent = formValues.get(AGENT_NAME);
        String listenerVar = listenerVar(agent);
        for (ModuleMemberDeclarationNode member : rootNode.members()) {
            if (member instanceof ListenerDeclarationNode declaration
                    && declaration.variableName().text().strip().equals(listenerVar)) {
                return Optional.of(new SchemaDrivenSourceGenerator.ResolvedListener(listenerVar, null));
            }
        }
        String port = formValues.getOrDefault(PORT, String.valueOf(FIRST_PORT));
        String publicUrl = formValues.get(PUBLIC_URL);
        String args = portVar(agent)
                + (publicUrl == null || publicUrl.isBlank() ? ""
                : ", publicUrl = " + A2aAgentCard.quote(publicUrl.strip()));
        String portDeclaration = "true".equals(formValues.get(EXISTING_PORT)) ? ""
                : "configurable int " + portVar(agent) + " = " + port.strip() + ";\n";
        String declaration = portDeclaration
                + "listener " + alias + ":RestListener " + listenerVar + " = new (" + args + ");";
        return Optional.of(new SchemaDrivenSourceGenerator.ResolvedListener(listenerVar, declaration));
    }

    @Override
    public String serviceBlock(AgentTriggerContext context) {
        String agent = context.agentVarName();
        String name = context.formValue(CARD_NAME);
        String card = A2aAgentCard.cardLiteral(name.isBlank() ? A2aAgentCard.humanize(agent) : name,
                context.formValue(CARD_DESCRIPTION),
                valueOr(context.formValue(CARD_VERSION), A2aAgentCard.DEFAULT_VERSION),
                A2aAgentCard.skillsFromJson(context.formValue(SKILLS)), extras(context), "    ");
        boolean streaming = enabled(context.formValue(STREAMING));
        boolean push = enabled(context.formValue(PUSH_NOTIFICATIONS));
        String resources = SEND + (streaming ? STREAM : "") + TASKS + (push ? PUSH : "");
        String executorClass = "true".equals(context.formValue(EXISTING_EXECUTOR)) ? "" : EXECUTOR_CLASS;
        String storeDecl = "true".equals(context.formValue(EXISTING_STORE)) ? "" : TASK_STORE_DECLARATION;
        return context.fill(SERVICE_BLOCK)
                .replace("{{storeDecl}}", storeDecl)
                .replace("{{executorClass}}", executorClass)
                .replace("{{store}}", storeVar(agent))
                .replace("{{resources}}", resources)
                .replace("{{executor}}", A2aAgentCard.pascal(agent) + "A2aExecutor")
                .replace("{{agent}}", agent)
                .replace("{{card}}", card)
                .replace("{{alias}}", context.emitAlias());
    }

    private static boolean enabled(String value) {
        return value == null || !"false".equalsIgnoreCase(value.strip());
    }

    private static A2aAgentCard.Extras extras(AgentTriggerContext context) {
        return new A2aAgentCard.Extras(context.formValue(PROVIDER), context.formValue(PROVIDER_URL),
                context.formValue(DOCUMENTATION_URL), context.formValue(ICON_URL), context.formValue(INPUT_MODES),
                context.formValue(PROVIDER_EMAIL), context.formValue(OUTPUT_MODES));
    }

    static String listenerVar(String agent) {
        return agent + "A2aListener";
    }

    static String portVar(String agent) {
        return agent + "A2aPort";
    }

    static String storeVar(String agent) {
        return agent + "A2aTaskStore";
    }

    private static String valueOr(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value;
    }

    private static Value text(String label, String description, String value) {
        return field(label, description, Value.FieldType.TEXT, "string", false, false, value);
    }

    private static Value advancedText(String label, String description) {
        Value value = field(label, description, Value.FieldType.TEXT, "string", true, false, "");
        value.setAdvanced(true);
        return value;
    }

    private static Value select(String label, String description, List<String> choices) {
        List<PropertyType> types = new ArrayList<>();
        types.add(PropertyType.types(Value.FieldType.SINGLE_SELECT, "string"));
        List<String> items = new ArrayList<>(choices);
        return new Value.ValueBuilder()
                .metadata(label, description)
                .types(types)
                .enabled(true)
                .editable(true)
                .optional(false)
                .setItems(new ArrayList<Object>(items))
                .value(choices.get(0))
                .build();
    }

    private static Value readOnly(String label, String description, Value.FieldType type, String value) {
        List<PropertyType> types = new ArrayList<>();
        types.add(PropertyType.types(type, "string"));
        return new Value.ValueBuilder()
                .metadata(label, description)
                .types(types)
                .enabled(true)
                .editable(false)
                .optional(true)
                .value(value)
                .build();
    }

    private static String skillsSummary(List<A2aAgentCard.Skill> skills) {
        return skills.stream().map(skill -> skill.name() + ": " + skill.description())
                .reduce((first, second) -> first + "\n" + second).orElse("");
    }

    private static Value flag(String label, String description, String value) {
        return field(label, description, Value.FieldType.FLAG, "boolean", false, false, value);
    }

    private static Value number(String label, String description, String value) {
        return field(label, description, Value.FieldType.NUMBER, "int", false, false, value);
    }

    private static Value hidden(String label, String value) {
        return field(label, label, Value.FieldType.TEXT, "string", true, true, value);
    }

    private static Value field(String label, String description, Value.FieldType type, String ballerinaType,
                               boolean optional, boolean hidden, String value) {
        List<PropertyType> types = new ArrayList<>();
        types.add(PropertyType.types(type, ballerinaType));
        return new Value.ValueBuilder()
                .metadata(label, description)
                .types(types)
                .enabled(true)
                .editable(true)
                .optional(optional)
                .setHidden(hidden)
                .value(value)
                .build();
    }
}
