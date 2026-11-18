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
import io.ballerina.compiler.syntax.tree.Node;
import io.ballerina.compiler.syntax.tree.ServiceDeclarationNode;
import io.ballerina.servicemodelgenerator.extension.connector.SchemaDrivenSourceGenerator;
import io.ballerina.servicemodelgenerator.extension.model.ServiceInitModel;
import io.ballerina.servicemodelgenerator.extension.validation.GenerationRefusedException;
import org.eclipse.lsp4j.TextEdit;

import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Exposes an agent to Choreo Agent Manager through the chat service of {@code ballerinax/amp}. The Agent Manager
 * console calls {@code POST /chat} at the root of the agent's endpoint with a session ID and the user's message,
 * so each session keeps its own conversation. Agent Manager runs one agent per integration, on one listener, so
 * the service is always attached at the root base path and a second Agent Manager trigger in the same
 * integration is refused. The form (synthesized from the package's trigger metadata) asks only for the listener's
 * name and port.
 *
 * @since 1.9.0
 */
public class AgentManagerChannel implements AgentTriggerChannel {

    static final String ORG_NAME = "ballerinax";
    static final String MODULE_NAME = "amp";

    private static final String SERVICE_TYPE = "ChatService";

    private static final String SERVICE_BLOCK = """
            service {{alias}}:ChatService / on {{listener}} {
            {{durableHelpers}}
                resource function post chat(@http:Payload {{alias}}:ChatRequest request)
                        returns {{alias}}:ChatResponse|error {
                    {{agentAnswerType}} reply = check {{agentRun}};
                    return {response: reply{{asText}}};
                }
            }
            """;

    @Override
    public AgentTriggerKind kind() {
        return AgentTriggerKind.AI_PLATFORM;
    }

    @Override
    public List<String> imports() {
        return List.of("ballerina/http");
    }

    /** Serves on the integration's {@code amp:Listener} when it already declares one, rather than a second one. */
    @Override
    public Optional<SchemaDrivenSourceGenerator.ResolvedListener> listener(ModulePartNode rootNode, String alias,
                                                                          Map<String, String> formValues) {
        String listenerType = alias + ":Listener";
        for (ModuleMemberDeclarationNode member : rootNode.members()) {
            if (member instanceof ListenerDeclarationNode declaration
                    && declaration.typeDescriptor().map(Node::toSourceCode).orElse("").strip().equals(listenerType)) {
                return Optional.of(new SchemaDrivenSourceGenerator.ResolvedListener(
                        declaration.variableName().text().strip(), null));
            }
        }
        return Optional.empty();
    }

    /** Refuses a second Agent Manager chat service: Agent Manager runs one agent per integration. */
    @Override
    public Optional<List<TextEdit>> appendToExistingService(ModulePartNode rootNode, AgentTriggerContext context) {
        String serviceType = context.emitAlias() + ":" + SERVICE_TYPE;
        boolean exists = rootNode.members().stream()
                .filter(ServiceDeclarationNode.class::isInstance)
                .map(ServiceDeclarationNode.class::cast)
                .anyMatch(service -> service.typeDescriptor().map(Node::toSourceCode).orElse("").strip()
                        .equals(serviceType));
        if (exists) {
            throw new GenerationRefusedException(ServiceInitModel.KEY_LISTENER_VAR_NAME,
                    "Choreo Agent Manager runs one agent per integration, and this integration already has an "
                            + "Agent Manager chat service. Add the trigger to the agent in a separate integration.");
        }
        return Optional.empty();
    }

    @Override
    public String serviceBlock(AgentTriggerContext context) {
        return context.withAgentRun(context.fill(SERVICE_BLOCK), "request.message", "request.sessionId");
    }
}
