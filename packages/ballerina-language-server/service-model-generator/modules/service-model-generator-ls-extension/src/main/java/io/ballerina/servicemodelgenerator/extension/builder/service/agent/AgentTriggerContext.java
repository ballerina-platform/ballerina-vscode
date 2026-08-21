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

import java.util.List;
import java.util.Map;

/**
 * Everything a channel needs to render one service block.
 *
 * @param emitAlias       the prefix the connector's module is imported under
 * @param listenerVarName the listener the service attaches to
 * @param agentVarName    the agent variable the trigger is wired to
 * @param agentOrgName    the agent's publishing org, deciding {@code .run} vs {@code ->run}
 * @param formValues      the filled creation form, flattened to leaf key -> value
 * @param initForm        the filled creation form itself
 * @param triggerModel    the connector's schema
 * @since 1.9.0
 */
public record AgentTriggerContext(String emitAlias, String listenerVarName, String agentVarName,
                                  String agentOrgName, Map<String, String> formValues,
                                  ServiceInitModel initForm, TriggerUISchemaModel triggerModel) {

    private static final String BALLERINA_ORG = "ballerina";

    public String agentRun(String queryExpr, String sessionExpr) {
        return "%s(%s, sessionId = %s)".formatted(runTarget(), queryExpr, sessionExpr);
    }

    public String agentRun(String queryExpr) {
        return "%s(%s)".formatted(runTarget(), queryExpr);
    }

    private String runTarget() {
        return agentVarName + (BALLERINA_ORG.equals(agentOrgName) ? "." : "->") + "run";
    }

    /** Fills the placeholders every channel template shares. */
    public String fill(String template) {
        return template.replace("{{alias}}", emitAlias).replace("{{listener}}", listenerVarName);
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
