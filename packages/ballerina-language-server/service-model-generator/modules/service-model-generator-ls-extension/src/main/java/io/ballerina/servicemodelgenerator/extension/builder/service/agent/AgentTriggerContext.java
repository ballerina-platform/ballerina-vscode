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
import io.ballerina.servicemodelgenerator.extension.model.ServiceInitModel;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Everything a channel needs to render one service block.
 *
 * @param emitAlias       the prefix the connector's module is imported under
 * @param listenerVarName the listener the service attaches to
 * @param agentVarName    the agent variable the trigger is wired to
 * @param agentOrgName    the agent's publishing org, deciding {@code .run} vs {@code ->run}
 * @param agentKind       "durable" for a workflow:DurableAgent, which runs and chats through instances; else absent
 * @param formValues      the filled creation form, flattened to leaf key -> value
 * @param initForm        the filled creation form itself
 * @param triggerModel    the connector's schema
 * @param auxiliaryTypes   type definitions the channel produced, destined for {@code types.bal}
 * @param auxiliaryImports imports those definitions need, keyed by module name
 * @since 1.9.0
 */
public record AgentTriggerContext(String emitAlias, String listenerVarName, String agentVarName,
                                  String agentOrgName, String agentKind, Map<String, String> formValues,
                                  ServiceInitModel initForm, TriggerUISchemaModel triggerModel,
                                  List<String> auxiliaryTypes, Map<String, String> auxiliaryImports) {

    public static final String DURABLE_KIND = "durable";
    public static final String CHAT_CHANNEL_PROPERTY = "chatChannel";
    public static final String DEFAULT_CHAT_CHANNEL = "chat";
    public static final String EVENT_CHANNEL_PROPERTY = "eventChannel";
    public static final String EVENT_RESPONSE_PROPERTY = "eventResponse";
    private static final String BALLERINA_ORG = "ballerina";
    private static final String DURABLE_HELPERS_SLOT = "\n{{durableHelpers}}\n";

    // A durable run starts an instance and returns its id; a chat turn is an event sent into that instance and
    // awaited. One instance per session lives in the service for as long as the service does.
    private static final String DURABLE_HELPERS = """
                // In memory: a restart starts a new instance for a returning session while the old one keeps waiting.
                private map<string> durableSessions = {};

                function durableTurn(string sessionKey, string text) returns string|error {
                    string instanceId = check self.instanceFor(sessionKey);
                    string token = check {{agent}}.sendData(instanceId, "{{channel}}", text);
                    return {{agent}}.waitForDataResult(instanceId, token);
                }

                function instanceFor(string sessionKey) returns string|error {
                    lock {
                        string? existing = self.durableSessions[sessionKey];
                        if existing is string {
                            return existing;
                        }
                        string id = check {{agent}}.run(string `session=${sessionKey}`);
                        self.durableSessions[sessionKey] = id;
                        return id;
                    }
                }
            """;

    public AgentTriggerContext(String emitAlias, String listenerVarName, String agentVarName, String agentOrgName,
                               Map<String, String> formValues, ServiceInitModel initForm,
                               TriggerUISchemaModel triggerModel) {
        this(emitAlias, listenerVarName, agentVarName, agentOrgName, null, formValues, initForm, triggerModel);
    }

    public AgentTriggerContext(String emitAlias, String listenerVarName, String agentVarName, String agentOrgName,
                               String agentKind, Map<String, String> formValues, ServiceInitModel initForm,
                               TriggerUISchemaModel triggerModel) {
        this(emitAlias, listenerVarName, agentVarName, agentOrgName, agentKind, formValues, initForm,
                triggerModel, new ArrayList<>(), new LinkedHashMap<>());
    }

    public boolean isDurable() {
        return DURABLE_KIND.equals(agentKind);
    }

    /** The trigger sends data on one of the durable agent's channels instead of running it. */
    public boolean isEventTrigger() {
        return isDurable() && !eventChannel().isEmpty();
    }

    public String eventChannel() {
        return formValue(EVENT_CHANNEL_PROPERTY).strip();
    }

    /** The channel's response type; empty for a one-way channel, whose send has nothing to await. */
    public String eventResponse() {
        return formValue(EVENT_RESPONSE_PROPERTY).strip();
    }

    // A chat turn: the AI agent's run keyed by session, or the durable agent's turn on its session's instance.
    public String agentRun(String queryExpr, String sessionExpr) {
        if (isDurable()) {
            return "self.durableTurn(%s, %s)".formatted(sessionExpr, queryExpr);
        }
        return "%s(%s, sessionId = %s)".formatted(runTarget(), queryExpr, sessionExpr);
    }

    // A one-shot run; for a durable agent the result is the started instance's id.
    public String agentRun(String queryExpr) {
        return "%s(%s)".formatted(runTarget(), queryExpr);
    }

    private String runTarget() {
        return agentVarName + (BALLERINA_ORG.equals(agentOrgName) ? "." : "->") + "run";
    }

    private String chatChannel() {
        String channel = formValue(CHAT_CHANNEL_PROPERTY).strip();
        return channel.isEmpty() ? DEFAULT_CHAT_CHANNEL : channel;
    }

    // The members a durable chat service needs, or nothing: the template's slot line then disappears.
    public String durableHelpers() {
        if (!isDurable()) {
            return "";
        }
        return DURABLE_HELPERS.replace("{{agent}}", agentVarName).replace("{{channel}}", chatChannel());
    }

    /** Fills the placeholders every channel template shares. */
    public String fill(String template) {
        String helpers = durableHelpers();
        return template.replace("{{alias}}", emitAlias)
                .replace("{{listener}}", listenerVarName)
                .replace(DURABLE_HELPERS_SLOT, helpers.isEmpty() ? "\n" : "\n" + helpers);
    }

    public String formValue(String key) {
        return formValues.getOrDefault(key, "");
    }

    public TriggerUISchemaModel.ServiceTypeModel serviceType() {
        return SchemaDrivenSourceGenerator.selectServiceType(initForm, triggerModel);
    }

    public String serviceDescriptor() {
        return SchemaDrivenSourceGenerator.resolveServiceDescriptor(initForm, triggerModel, emitAlias);
    }

    /** The service base path, or empty when the channel ships no base-path field. */
    public String basePath() {
        return SchemaDrivenSourceGenerator.resolveBasePath(initForm);
    }

    public String servicePath(String key, String fallback) {
        String path = formValue(key).strip();
        if (path.isEmpty()) {
            path = fallback;
        }
        String absolute = path.startsWith("/") ? path : "/" + path;
        return absolute.replace("\\", "").replace("-", "\\-").replace(".", "\\.");
    }

    public List<String> serviceAnnotations() {
        return SchemaDrivenSourceGenerator.buildServiceAnnotations(initForm, emitAlias);
    }

    public List<SchemaDrivenSourceGenerator.HandlerParameter> parametersOf(
            TriggerUISchemaModel.FunctionModel handler) {
        return SchemaDrivenSourceGenerator.emittedParameters(handler, initForm.getModuleName(), emitAlias);
    }

    public String qualify(String typeText) {
        return SchemaDrivenSourceGenerator.rewriteSelfPrefix(typeText, initForm.getModuleName(), emitAlias);
    }
}
