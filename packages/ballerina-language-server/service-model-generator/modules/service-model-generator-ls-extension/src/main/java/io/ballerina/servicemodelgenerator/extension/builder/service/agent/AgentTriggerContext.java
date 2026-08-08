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

import java.util.Map;

/**
 * Everything a channel needs to render one service block.
 *
 * @param emitAlias       the prefix the connector's own module is imported under, so a dotted module
 *                        name (e.g. {@code whatsapp.business}) is referenced the same way the rest of
 *                        the generated block references it
 * @param listenerVarName the listener the service attaches to
 * @param agentVarName    the agent variable the trigger is being wired to
 * @param agentOrgName    the agent's publishing org, which decides {@code .run} vs {@code ->run}
 * @param formValues      the filled creation form, flattened to leaf key -> value
 * @since 1.9.0
 */
public record AgentTriggerContext(String emitAlias, String listenerVarName, String agentVarName,
                                  String agentOrgName, Map<String, String> formValues) {

    private static final String BALLERINA_ORG = "ballerina";

    public String agentRun(String queryExpr, String sessionExpr) {
        String operator = BALLERINA_ORG.equals(agentOrgName) ? "." : "->";
        return "%s%srun(%s, sessionId = %s)".formatted(agentVarName, operator, queryExpr, sessionExpr);
    }

    public String formValue(String key) {
        return formValues.getOrDefault(key, "");
    }
}
