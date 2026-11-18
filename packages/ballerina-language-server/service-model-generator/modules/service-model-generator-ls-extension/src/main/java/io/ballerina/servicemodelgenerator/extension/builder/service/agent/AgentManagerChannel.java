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

import io.ballerina.compiler.syntax.tree.ExplicitNewExpressionNode;
import io.ballerina.compiler.syntax.tree.FunctionArgumentNode;
import io.ballerina.compiler.syntax.tree.ImplicitNewExpressionNode;
import io.ballerina.compiler.syntax.tree.ImportDeclarationNode;
import io.ballerina.compiler.syntax.tree.ListenerDeclarationNode;
import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.compiler.syntax.tree.NamedArgumentNode;
import io.ballerina.compiler.syntax.tree.Node;
import io.ballerina.compiler.syntax.tree.ParenthesizedArgList;
import io.ballerina.compiler.syntax.tree.PositionalArgumentNode;
import io.ballerina.compiler.syntax.tree.SeparatedNodeList;
import io.ballerina.compiler.syntax.tree.ServiceDeclarationNode;
import io.ballerina.servicemodelgenerator.extension.connector.SchemaDrivenSourceGenerator;
import io.ballerina.servicemodelgenerator.extension.validation.GenerationRefusedException;
import org.eclipse.lsp4j.TextEdit;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

/**
 * Exposes an agent to Choreo Agent Manager through the chat service of {@code ballerinax/amp}. The Agent Manager
 * console calls {@code POST /chat} at the root of the agent's endpoint with a session ID and the user's message,
 * so each session keeps its own conversation. Agent Manager runs one agent per integration, on one listener, so
 * the service is always attached at the root base path and a second Agent Manager trigger in the same
 * integration is refused. The form (synthesized from the package's trigger metadata) asks only for the listener's
 * name and port.
 *
 * <p>The trigger itself always writes a typed listener and the service to the file it is added from, so the
 * module-wide search and the untyped-listener match below are not needed for integrations built in the designer.
 * They are kept for hand-written code, or code an AI assistant wrote without following those conventions: missing
 * such a listener would add a second one on the same port, which fails at startup.
 *
 * @since 1.9.0
 */
public class AgentManagerChannel implements AgentTriggerChannel {

    static final String ORG_NAME = "ballerinax";
    static final String MODULE_NAME = "amp";

    private static final String SERVICE_TYPE = "ChatService";
    private static final String LISTENER_TYPE = "Listener";
    private static final String LISTEN_ON = "listenOn";
    /** The port {@code amp:Listener} listens on when none is given, and the one Agent Manager calls. */
    private static final String DEFAULT_PORT = "8000";

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

    @Override
    public Optional<SchemaDrivenSourceGenerator.ResolvedListener> listener(ModulePartNode rootNode, String alias,
                                                                          Map<String, String> formValues) {
        return listener(rootNode, List.of(rootNode), alias, formValues);
    }

    /**
     * Serves on the integration's {@code amp:Listener} when any file of the module already declares one, rather
     * than a second one on the same port. A port the user entered that differs from that listener's is refused,
     * since the service would otherwise be served on a port other than the one they asked for.
     */
    @Override
    public Optional<SchemaDrivenSourceGenerator.ResolvedListener> listener(ModulePartNode rootNode,
                                                                          List<ModulePartNode> moduleRoots,
                                                                          String alias,
                                                                          Map<String, String> formValues) {
        for (ModulePartNode root : moduleRoots) {
            Optional<String> fileAlias = ampAlias(root, root == rootNode ? alias : null);
            if (fileAlias.isEmpty()) {
                continue;
            }
            for (Node member : root.members()) {
                if (member instanceof ListenerDeclarationNode declaration
                        && isAmpListener(declaration, fileAlias.get())) {
                    String name = declaration.variableName().text().strip();
                    refuseAnotherPort(name, port(declaration), formValues.get(LISTEN_ON));
                    return Optional.of(new SchemaDrivenSourceGenerator.ResolvedListener(name, null));
                }
            }
        }
        return Optional.empty();
    }

    @Override
    public Optional<List<TextEdit>> appendToExistingService(ModulePartNode rootNode, AgentTriggerContext context) {
        return appendToExistingService(rootNode, List.of(rootNode), context);
    }

    /**
     * Refuses a second Agent Manager chat service in any file of the module: Agent Manager runs one agent per
     * integration. No field value can change that, so the refusal is raised for the whole form rather than on a
     * field.
     */
    @Override
    public Optional<List<TextEdit>> appendToExistingService(ModulePartNode rootNode,
                                                            List<ModulePartNode> moduleRoots,
                                                            AgentTriggerContext context) {
        for (ModulePartNode root : moduleRoots) {
            Optional<String> fileAlias = ampAlias(root, root == rootNode ? context.emitAlias() : null);
            if (fileAlias.isEmpty()) {
                continue;
            }
            String serviceType = fileAlias.get() + ":" + SERVICE_TYPE;
            boolean exists = root.members().stream()
                    .filter(ServiceDeclarationNode.class::isInstance)
                    .map(ServiceDeclarationNode.class::cast)
                    .anyMatch(service -> sourceOf(service.typeDescriptor()).equals(serviceType));
            if (exists) {
                throw new GenerationRefusedException("Choreo Agent Manager runs one agent per integration, and "
                        + "this integration already has an Agent Manager chat service. Add the trigger to the "
                        + "agent in a separate integration.");
            }
        }
        return Optional.empty();
    }

    @Override
    public String serviceBlock(AgentTriggerContext context) {
        return context.withAgentRun(context.fill(SERVICE_BLOCK), "request.message", "request.sessionId");
    }

    /**
     * The prefix a file refers to {@code ballerinax/amp} by, or empty when it does not import it. The edited
     * file's prefix is already resolved by the caller.
     */
    private static Optional<String> ampAlias(ModulePartNode root, String resolved) {
        if (resolved != null) {
            return Optional.of(resolved);
        }
        for (ImportDeclarationNode imported : root.imports()) {
            String orgName = imported.orgName().map(name -> name.orgName().text().strip()).orElse("");
            String moduleName = imported.moduleName().stream().map(name -> name.text().strip())
                    .collect(Collectors.joining("."));
            if (ORG_NAME.equals(orgName) && MODULE_NAME.equals(moduleName)) {
                return Optional.of(imported.prefix().map(prefix -> prefix.prefix().text().strip())
                        .orElse(MODULE_NAME));
            }
        }
        return Optional.empty();
    }

    /** Whether a listener is an {@code amp:Listener}, by its declared type or, when untyped, its constructor. */
    private static boolean isAmpListener(ListenerDeclarationNode declaration, String alias) {
        String listenerType = alias + ":" + LISTENER_TYPE;
        if (sourceOf(declaration.typeDescriptor()).equals(listenerType)) {
            return true;
        }
        return declaration.typeDescriptor().isEmpty()
                && declaration.initializer() instanceof ExplicitNewExpressionNode explicitNew
                && explicitNew.typeDescriptor().toSourceCode().strip().equals(listenerType);
    }

    /** The port a listener is declared on, when it is written as a number or left to the default. */
    private static Optional<String> port(ListenerDeclarationNode declaration) {
        Optional<ParenthesizedArgList> args = switch (declaration.initializer()) {
            case ImplicitNewExpressionNode implicitNew -> implicitNew.parenthesizedArgList();
            case ExplicitNewExpressionNode explicitNew -> Optional.of(explicitNew.parenthesizedArgList());
            default -> Optional.empty();
        };
        if (args.isEmpty() || args.get().arguments().isEmpty()) {
            return Optional.of(DEFAULT_PORT);
        }
        SeparatedNodeList<FunctionArgumentNode> arguments = args.get().arguments();
        Node listenOn = switch (arguments.get(0)) {
            case PositionalArgumentNode positional -> positional.expression();
            case NamedArgumentNode named when LISTEN_ON.equals(named.argumentName().name().text().strip()) ->
                    named.expression();
            default -> null;
        };
        return Optional.ofNullable(listenOn).map(node -> node.toSourceCode().strip())
                .filter(AgentManagerChannel::isPort);
    }

    /** Refuses a port the user entered that differs from the port of the listener the service is added to. */
    private static void refuseAnotherPort(String listenerName, Optional<String> listenerPort, String enteredPort) {
        if (enteredPort == null || !isPort(enteredPort.strip()) || listenerPort.isEmpty()
                || listenerPort.get().equals(enteredPort.strip())) {
            return;
        }
        throw new GenerationRefusedException(LISTEN_ON, "This integration already has an Agent Manager listener, '"
                + listenerName + "', on port " + listenerPort.get() + ", and the chat service is added to it. "
                + "Clear the port to use " + listenerName + " as it is, or change its port to "
                + enteredPort.strip() + " first.");
    }

    private static boolean isPort(String text) {
        return text.matches("\\d+");
    }

    private static String sourceOf(Optional<? extends Node> node) {
        return node.map(Node::toSourceCode).orElse("").strip();
    }
}
