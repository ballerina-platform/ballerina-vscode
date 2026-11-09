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
 * @param agentKind       {@code "durable"} for a {@code workflow:DurableAgent}, else {@code null}
 * @param formValues      the filled creation form, flattened to leaf key -> value
 * @param initForm        the filled creation form itself
 * @param triggerModel    the connector's schema
 * @param auxiliaryTypes   type definitions the channel produced, destined for {@code types.bal}
 * @param auxiliaryImports imports those definitions need, keyed by module name
 * @param runShape        how the agent's {@code run} is declared
 * @since 1.9.0
 */
public record AgentTriggerContext(String emitAlias, String listenerVarName, String agentVarName,
                                  String agentOrgName, String agentKind, Map<String, String> formValues,
                                  ServiceInitModel initForm, TriggerUISchemaModel triggerModel,
                                  List<String> auxiliaryTypes, Map<String, String> auxiliaryImports,
                                  AgentRunShape runShape) {

    public static final String DURABLE_KIND = "durable";
    public static final String CHAT_CHANNEL = "chat";
    public static final String EVENT_CHANNEL_PROPERTY = "eventChannel";
    public static final String EVENT_RESPONSE_PROPERTY = "eventResponse";
    private static final String BALLERINA_ORG = "ballerina";
    private static final String TEXT_ANSWER = "string";
    private static final String RUN_SLOT = "{{agentRun}}";
    private static final String ANSWER_TYPE_SLOT = "{{agentAnswerType}}";
    private static final String AS_TEXT_SLOT = "{{asText}}";
    private static final String DURABLE_HELPERS_SLOT = "\n{{durableHelpers}}\n";

    private static final String DURABLE_HELPERS = """
                private map<string> durableSessions = {};

                function durableTurn(string sessionKey, string text) returns string|error {
                    string instanceId = check self.instanceFor(sessionKey);
                    string token = check {{agent}}.sendData(instanceId, "{{channel}}", text);
                    return {{agent}}.waitForDataResult(instanceId, token);
                }

                function instanceFor(string sessionKey) returns string|error {
                    // Serializes every session's first turn; a slow `run` here delays other sessions too.
                    lock {
                        string? existing = self.durableSessions[sessionKey];
                        // A conversation the agent closed or that timed out gets a new instance.
                        if existing is string && {{agent}}.getResult(existing, string) is workflow:AgentBusyError {
                            return existing;
                        }
                        string id = check {{agent}}.run("");
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
                triggerModel, AgentRunShape.UNKNOWN);
    }

    public AgentTriggerContext(String emitAlias, String listenerVarName, String agentVarName, String agentOrgName,
                               String agentKind, Map<String, String> formValues, ServiceInitModel initForm,
                               TriggerUISchemaModel triggerModel, AgentRunShape runShape) {
        this(emitAlias, listenerVarName, agentVarName, agentOrgName, agentKind, formValues, initForm,
                triggerModel, new ArrayList<>(), new LinkedHashMap<>(), runShape);
    }

    public boolean isDurable() {
        return DURABLE_KIND.equals(agentKind);
    }

    public boolean isEventTrigger() {
        return isDurable() && !eventChannel().isEmpty();
    }

    public String eventChannel() {
        return formValue(EVENT_CHANNEL_PROPERTY).strip();
    }

    public String eventResponse() {
        return formValue(EVENT_RESPONSE_PROPERTY).strip();
    }

    /** Fills {@code source}'s agent slots for one turn of a session. */
    public String withAgentRun(String source, String queryExpr, String sessionExpr) {
        String run = isDurable() ? "self.durableTurn(%s, %s)".formatted(sessionExpr, queryExpr)
                : "%s(%s, sessionId = %s)".formatted(runTarget(), queryExpr, sessionExpr);
        return withAnswerSlots(source.replace(RUN_SLOT, run));
    }

    /** Fills {@code source}'s agent slots for one request. */
    public String withAgentAnswer(String source, String queryExpr) {
        return withAnswerSlots(source.replace(RUN_SLOT, "%s(%s)".formatted(runTarget(), queryExpr)));
    }

    /** Whether the answer has a fixed type other than {@code string}, as a typed agent definition declares. */
    public boolean typedAnswer() {
        return !isDurable() && runShape.answer() == AgentRunShape.Answer.VALUE;
    }

    // A typed answer keeps its own type, so the call stays a plain agent call; only a reply turns it into text.
    private String withAnswerSlots(String source) {
        return source.replace(ANSWER_TYPE_SLOT, typedAnswer() ? runShape.answerType() : TEXT_ANSWER)
                .replace(AS_TEXT_SLOT, typedAnswer() ? ".toString()" : "");
    }

    private String runTarget() {
        boolean remote = runShape.remote() != null ? runShape.remote() : !BALLERINA_ORG.equals(agentOrgName);
        return agentVarName + (remote ? "->" : ".") + "run";
    }

    private String durableHelpers(boolean isolatedService) {
        if (!isDurable()) {
            return "";
        }
        String helpers = DURABLE_HELPERS.replace("{{agent}}", agentVarName).replace("{{channel}}", CHAT_CHANNEL);
        return isolatedService ? helpers.replace("    function ", "    isolated function ") : helpers;
    }

    /** Fills the placeholders every channel template shares. */
    public String fill(String template) {
        return fill(template, false);
    }

    /** As {@link #fill(String)}, for an {@code isolated} service, whose methods must be isolated too. */
    public String fill(String template, boolean isolatedService) {
        String helpers = durableHelpers(isolatedService);
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
