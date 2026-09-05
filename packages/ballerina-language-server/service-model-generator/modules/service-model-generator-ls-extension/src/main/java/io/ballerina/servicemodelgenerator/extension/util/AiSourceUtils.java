/*
 *  Copyright (c) 2025, WSO2 LLC. (http://www.wso2.com)
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

package io.ballerina.servicemodelgenerator.extension.util;

import io.ballerina.compiler.syntax.tree.FunctionDefinitionNode;
import io.ballerina.compiler.syntax.tree.MethodCallExpressionNode;
import io.ballerina.compiler.syntax.tree.Node;
import io.ballerina.compiler.syntax.tree.NonTerminalNode;
import io.ballerina.compiler.syntax.tree.RemoteMethodCallActionNode;
import io.ballerina.compiler.syntax.tree.ServiceDeclarationNode;
import io.ballerina.servicemodelgenerator.extension.model.Codedata;
import io.ballerina.servicemodelgenerator.extension.model.Function;
import io.ballerina.servicemodelgenerator.extension.model.FunctionReturnType;
import io.ballerina.servicemodelgenerator.extension.model.MetaData;
import io.ballerina.servicemodelgenerator.extension.model.Parameter;
import io.ballerina.servicemodelgenerator.extension.model.PropertyType;
import io.ballerina.servicemodelgenerator.extension.model.Value;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import static io.ballerina.servicemodelgenerator.extension.util.Constants.AI;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.BALLERINA;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.KIND_REQUIRED;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.KIND_RESOURCE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.NEW_LINE;

/**
 * Source templates and syntax-tree helpers shared by the AI chat agent service and function
 * builders.
 *
 * <p>A chat agent service exposes two fixed resources. {@code chat} is the agent's entry point and
 * is emitted whenever the service is created. {@code decision} resumes a paused run once a human
 * has approved or rejected a tool call the agent proposed, and is added on demand — a service
 * without it compiles and serves chat perfectly well, and only fails at the moment someone clicks
 * Approve.
 *
 * @since 1.2.0
 */
public final class AiSourceUtils {

    public static final String CHAT_RESOURCE_NAME = "chat";
    public static final String DECISION_RESOURCE_NAME = "decision";
    private static final String RUN_METHOD = "run";
    private static final String POST_ACCESSOR = "post";
    private static final String REQUEST_PARAM = "request";
    private static final String DECISION_MESSAGE_TYPE = "ai:DecisionMessage";
    private static final String CHAT_RESPONSE_TYPE = "ai:ChatRespMessage|error";

    private AiSourceUtils() {
    }

    /**
     * The call operator an agent variable of the given org is invoked through: {@code ballerina/ai}
     * agents expose {@code run} as an object method, {@code ballerinax/ai} agents as a remote method.
     *
     * @param orgName the organization owning the ai module
     * @return {@code "."} or {@code "->"}
     */
    public static String runOperator(String orgName) {
        return BALLERINA.equals(orgName) ? "." : "->";
    }

    /**
     * The {@code chat} resource: one conversational turn against the agent.
     *
     * @param agentVarName the agent variable to invoke
     * @param operator     the call operator, from {@link #runOperator(String)}
     * @return the resource source, indented one level for a service body
     */
    public static String agentChatResourceSource(String agentVarName, String operator) {
        return String.format(
                "    resource function post chat(@http:Payload ai:ChatReqMessage request) " +
                        "returns ai:ChatRespMessage|error {%s" +
                        "        string stringResult = check %s%srun(request.message, request.sessionId);%s" +
                        "        return {message: stringResult};%s" +
                        "    }",
                NEW_LINE, agentVarName, operator, NEW_LINE, NEW_LINE
        );
    }

    /**
     * The {@code decision} resource: the human-in-the-loop resume path.
     *
     * <p>Passing decisions rather than a query is what tells {@code run} to continue the paused run
     * instead of starting a new turn. The raw pause error is returned as-is so the listener's
     * dispatcher can turn it into the response shape the chat panel looks for.
     *
     * @param agentVarName the agent variable to invoke
     * @param operator     the call operator, from {@link #runOperator(String)}
     * @return the resource source, indented one level for a service body
     */
    public static String agentDecisionResourceSource(String agentVarName, String operator) {
        return String.format(
                "    resource function post decision(@http:Payload ai:DecisionMessage request) " +
                        "returns ai:ChatRespMessage|error {%s" +
                        "        string result = check %s%srun({decisions: request.decisions}, " +
                        "request.sessionId);%s" +
                        "        return {message: result};%s" +
                        "    }",
                NEW_LINE, agentVarName, operator, NEW_LINE, NEW_LINE
        );
    }

    /**
     * The addable {@code decision} handler shown in the service designer.
     *
     * <p>The service index has no {@code decision} row, and a generated agent service carries no
     * type descriptor, so the service-type lookup could never surface one anyway. This stands in for
     * the database-backed template a service type would otherwise provide, letting the ordinary
     * merge in {@link ServiceModelUtils#updateServiceInfoNew} enable it when the source has it and
     * leave it disabled — that is, offered as addable — when it does not.
     *
     * @param orgName the organization owning the ai module, stamped onto the codedata so an add
     *                routes back to the AI function builder rather than the generic one
     * @return a disabled, optional resource function model
     */
    public static Function decisionResourceTemplate(String orgName) {
        String org = orgName == null ? BALLERINA : orgName;

        Value accessor = new Value.ValueBuilder()
                .metadata("Accessor", "The HTTP accessor of the resource")
                .value(POST_ACCESSOR)
                .types(List.of(PropertyType.types(Value.FieldType.IDENTIFIER)))
                .enabled(true)
                .editable(false)
                .build();

        Value name = new Value.ValueBuilder()
                .metadata(DECISION_RESOURCE_NAME, "The resource path")
                .value(DECISION_RESOURCE_NAME)
                .types(List.of(PropertyType.types(Value.FieldType.IDENTIFIER)))
                .setPlaceholder(DECISION_RESOURCE_NAME)
                .enabled(true)
                .editable(false)
                .build();

        Value returnValue = new Value.ValueBuilder()
                .metadata("Return Type", "The return type of the resource")
                .value(CHAT_RESPONSE_TYPE)
                .types(List.of(PropertyType.types(Value.FieldType.TYPE)))
                .setPlaceholder(CHAT_RESPONSE_TYPE)
                .enabled(true)
                .editable(false)
                .optional(true)
                .build();
        FunctionReturnType returnType = new FunctionReturnType(returnValue);
        returnType.setHasError(true);

        List<Parameter> parameters = new ArrayList<>();
        parameters.add(decisionPayloadParameter());

        Codedata codedata = new Codedata.Builder()
                .setOrgName(org)
                .setPackageName(AI)
                .setModuleName(AI)
                .build();

        return new Function.FunctionBuilder()
                .setMetadata(new MetaData("Human Decision",
                        "Resumes a paused agent run with the human's approve/reject decisions."))
                .kind(KIND_RESOURCE)
                .accessor(accessor)
                .name(name)
                .parameters(parameters)
                .returnType(returnType)
                .setCodedata(codedata)
                .enabled(false)
                .optional(true)
                .editable(false)
                .build();
    }

    private static Parameter decisionPayloadParameter() {
        Value paramType = new Value.ValueBuilder()
                .metadata("Type", "The type of the parameter")
                .value(DECISION_MESSAGE_TYPE)
                .types(List.of(PropertyType.types(Value.FieldType.TYPE)))
                .enabled(true)
                .editable(false)
                .build();

        Value paramName = new Value.ValueBuilder()
                .metadata("Name", "The name of the parameter")
                .value(REQUEST_PARAM)
                .types(List.of(PropertyType.types(Value.FieldType.IDENTIFIER)))
                .enabled(true)
                .editable(false)
                .build();

        return new Parameter.Builder()
                .metadata(new MetaData(REQUEST_PARAM, "The human's decisions for the pending tool calls"))
                .kind(KIND_REQUIRED)
                .type(paramType)
                .name(paramName)
                .httpParamType(Constants.HTTP_PARAM_TYPE_PAYLOAD)
                .enabled(true)
                .editable(false)
                .optional(false)
                .build();
    }

    /**
     * The agent variable and call operator this service's existing resources already use.
     *
     * <p>Read off the source rather than re-derived from the organization, so a generated
     * {@code decision} matches whatever the {@code chat} resource actually does even if it was
     * hand-edited. The agent is commonly declared in a different file from the service, so the only
     * reliable place to find its name is the call inside a resource body.
     *
     * @param serviceNode the service to inspect
     * @return the resolved agent call, or empty when no {@code run} call can be found
     */
    public static Optional<AgentCall> resolveAgentCall(ServiceDeclarationNode serviceNode) {
        List<FunctionDefinitionNode> resources = serviceNode.members().stream()
                .filter(FunctionDefinitionNode.class::isInstance)
                .map(FunctionDefinitionNode.class::cast)
                .toList();

        // Prefer the chat resource: it is the one the generator wrote, so it is the most faithful
        // record of how this service calls its agent.
        Optional<AgentCall> fromChat = resources.stream()
                .filter(resource -> CHAT_RESOURCE_NAME.equals(Utils.getPath(resource.relativeResourcePath())))
                .map(resource -> findRunCall(resource.functionBody()))
                .flatMap(Optional::stream)
                .findFirst();
        if (fromChat.isPresent()) {
            return fromChat;
        }

        return resources.stream()
                .map(resource -> findRunCall(resource.functionBody()))
                .flatMap(Optional::stream)
                .findFirst();
    }

    private static Optional<AgentCall> findRunCall(Node node) {
        if (node instanceof MethodCallExpressionNode call
                && RUN_METHOD.equals(call.methodName().toSourceCode().trim())) {
            return Optional.of(new AgentCall(call.expression().toSourceCode().trim(), "."));
        }
        if (node instanceof RemoteMethodCallActionNode call
                && RUN_METHOD.equals(call.methodName().toSourceCode().trim())) {
            return Optional.of(new AgentCall(call.expression().toSourceCode().trim(), "->"));
        }
        if (node instanceof NonTerminalNode nonTerminal) {
            for (Node child : nonTerminal.children()) {
                Optional<AgentCall> found = findRunCall(child);
                if (found.isPresent()) {
                    return found;
                }
            }
        }
        return Optional.empty();
    }

    /**
     * An agent variable together with the operator it is invoked through.
     *
     * @param agentVarName the agent variable name
     * @param operator     {@code "."} for an object method, {@code "->"} for a remote method
     */
    public record AgentCall(String agentVarName, String operator) {
    }
}
