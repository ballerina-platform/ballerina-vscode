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
import io.ballerina.servicemodelgenerator.extension.model.ValidationRule;
import io.ballerina.servicemodelgenerator.extension.model.Value;
import io.ballerina.servicemodelgenerator.extension.model.context.GetServiceInitModelContext;

import java.util.List;
import java.util.Optional;

/**
 * The built-in chat endpoint, which has no connector schema behind it.
 *
 * @since 1.9.0
 */
public class AiChatChannel implements AgentTriggerChannel {

    static final String MODULE_NAME = "ai";
    static final String BASE_PATH = "basePath";
    static final String LISTENER_VAR_NAME = "agentChatListener";

    private static final String DEFAULT_BASE_PATH = "/chat";
    private static final String LISTENER_DECLARATION =
            "listener {{alias}}:Listener " + LISTENER_VAR_NAME + " = new (listenOn = check http:getDefaultListener());";

    private static final String SERVICE_BLOCK = """
            service {{basePath}} on {{listener}} {
                resource function post chat(@http:Payload {{alias}}:ChatReqMessage request)
                        returns {{alias}}:ChatRespMessage|error {
                    string stringResult = check {{agentRun}};
                    return {message: stringResult};
                }
            }
            """;

    @Override
    public String moduleName() {
        return MODULE_NAME;
    }

    @Override
    public AgentTriggerKind kind() {
        return AgentTriggerKind.CHAT;
    }

    @Override
    public List<String> imports() {
        return List.of("ballerina/http");
    }

    @Override
    public boolean isSchemaDriven() {
        return false;
    }

    @Override
    public Optional<ServiceInitModel> initModel(GetServiceInitModelContext context) {
        ServiceInitModel model = new ServiceInitModel("ai-chat", "Chat Service",
                "Expose the agent over HTTP, so a chat client can talk to it.",
                context.orgName(), context.packageName(), MODULE_NAME, context.version(), "agent-chat", "");
        model.addProperty(BASE_PATH, new Value.ValueBuilder()
                .metadata("Service Path", "The HTTP path this chat endpoint is served on.")
                .types(List.of(PropertyType.types(Value.FieldType.SERVICE_PATH, "string")))
                .enabled(true)
                .editable(true)
                .optional(false)
                .value(DEFAULT_BASE_PATH)
                .setValidations(List.of(new ValidationRule("common.validate.required")))
                .build());
        return Optional.of(model);
    }

    @Override
    public Optional<SchemaDrivenSourceGenerator.ResolvedListener> listener(ModulePartNode rootNode, String alias) {
        String listenerType = alias + ":Listener";
        for (ModuleMemberDeclarationNode member : rootNode.members()) {
            if (member instanceof ListenerDeclarationNode declaration
                    && declaration.toSourceCode().contains(listenerType)) {
                return Optional.of(new SchemaDrivenSourceGenerator.ResolvedListener(
                        declaration.variableName().text().strip(), null));
            }
        }
        return Optional.of(new SchemaDrivenSourceGenerator.ResolvedListener(LISTENER_VAR_NAME,
                LISTENER_DECLARATION.replace("{{alias}}", alias)));
    }

    @Override
    public String serviceBlock(AgentTriggerContext context) {
        return SERVICE_BLOCK
                .replace("{{alias}}", context.emitAlias())
                .replace("{{listener}}", context.listenerVarName())
                .replace("{{basePath}}", escapePath(basePath(context)))
                .replace("{{agentRun}}", context.agentRun("request.message", "request.sessionId"));
    }

    private static String basePath(AgentTriggerContext context) {
        String path = context.formValue(BASE_PATH).strip();
        if (path.isEmpty()) {
            return DEFAULT_BASE_PATH;
        }
        return path.startsWith("/") ? path : "/" + path;
    }

    private static String escapePath(String path) {
        return path.replace("-", "\\-");
    }
}
