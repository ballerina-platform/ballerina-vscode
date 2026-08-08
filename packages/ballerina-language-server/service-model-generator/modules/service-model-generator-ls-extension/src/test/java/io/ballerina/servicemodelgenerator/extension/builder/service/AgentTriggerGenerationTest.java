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

package io.ballerina.servicemodelgenerator.extension.builder.service;

import com.google.gson.Gson;
import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.compiler.syntax.tree.SyntaxTree;
import io.ballerina.modelgenerator.commons.trigger.models.TriggerUISchemaModel;
import io.ballerina.servicemodelgenerator.extension.builder.service.agent.AgentTriggerChannel;
import io.ballerina.servicemodelgenerator.extension.builder.service.agent.AgentTriggerChannels;
import io.ballerina.servicemodelgenerator.extension.connector.SchemaDrivenSourceGenerator;
import io.ballerina.servicemodelgenerator.extension.connector.TriggerModelReader;
import io.ballerina.servicemodelgenerator.extension.model.ServiceInitModel;
import io.ballerina.servicemodelgenerator.extension.model.Value;
import io.ballerina.tools.text.TextDocuments;
import org.eclipse.lsp4j.TextEdit;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.util.List;
import java.util.Map;

/**
 * Covers {@link AgentTriggerServiceBuilder}.
 *
 * @since 1.9.0
 */
public class AgentTriggerGenerationTest {

    private static final String AGENT_NAME_PROPERTY = "agentName";
    private final Gson gson = new Gson();

    private ServiceInitModel initForm(String moduleName) {
        ServiceInitModel cached = TriggerModelReader.getInstance().getBundledServiceInitModel(moduleName)
                .orElseThrow();
        return gson.fromJson(gson.toJsonTree(cached), ServiceInitModel.class);
    }

    private TriggerUISchemaModel triggerModel(String moduleName) {
        return TriggerModelReader.getInstance().getBundledTriggerModel(moduleName).orElseThrow();
    }

    private ModulePartNode rootOf(String source) {
        return (ModulePartNode) SyntaxTree.from(TextDocuments.from(source)).rootNode();
    }

    private String render(Map<String, List<TextEdit>> edits) {
        StringBuilder source = new StringBuilder();
        edits.values().forEach(fileEdits -> fileEdits.forEach(edit -> source.append(edit.getNewText())));
        return source.toString();
    }

    private String generateForAgent(String moduleName, String agentVarName, String agentOrgName) {
        ServiceInitModel form = initForm(moduleName);
        form.addProperty(AGENT_NAME_PROPERTY, new Value.ValueBuilder()
                .enabled(true).editable(false).value(agentVarName).build());
        if (agentOrgName != null) {
            form.addProperty("agentOrg", new Value.ValueBuilder()
                    .enabled(true).editable(false).value(agentOrgName).build());
        }
        AgentTriggerChannel channel = AgentTriggerChannels.forModule(moduleName).orElseThrow();
        return render(AgentTriggerServiceBuilder.buildEdits(form, triggerModel(moduleName), channel,
                rootOf("\n"), "main.bal"));
    }

    @Test
    public void testWhatsAppServiceIsWiredToTheAgent() {
        String src = generateForAgent("whatsapp.business", "mathTutorAgent", null);

        Assert.assertTrue(src.contains("remote function onMessages(whatsapp:MessagesNotification notification)"),
                "the handler must be emitted, not left to an off-by-default schema function: " + src);
        Assert.assertTrue(src.contains("_ = start self.replyToWhatsAppMessages(notification);"),
                "handler should offload rather than block the webhook: " + src);
        Assert.assertTrue(src.contains("mathTutorAgent.run(text, sessionId = \"whatsapp:\" + message.'from)"),
                "agent call should use the bound agent, its ballerina/ai operator and a namespaced session: " + src);
    }

    @Test
    public void testWhatsAppServiceOwnsItsClientAndReplyMethod() {
        String src = generateForAgent("whatsapp.business", "mathTutorAgent", null);

        int serviceStart = src.indexOf("service whatsapp:WhatsAppService");
        Assert.assertTrue(serviceStart >= 0, "expected a WhatsApp service: " + src);
        Assert.assertTrue(src.indexOf("final whatsapp:Client whatsappClient;") > serviceStart,
                "the reply client should be a service field, not a module-level variable: " + src);
        Assert.assertTrue(src.contains("self.whatsappClient = check new "),
                "the client should be initialised in the service's init(): " + src);
        Assert.assertTrue(src.indexOf("function replyToWhatsAppMessages(") > serviceStart,
                "the reply logic should be a service method, not a module-level function: " + src);
        Assert.assertTrue(src.contains("self.whatsappClient->sendMessage(notification.phoneNumberId, payload)"),
                "the reply should go back out through the service's own client: " + src);
    }

    @Test
    public void testTelegramServiceIsWiredToTheAgent() {
        String src = generateForAgent("telegram", "supportAgent", null);

        Assert.assertTrue(src.contains("_ = start self.replyToTelegramMessage(message);"),
                "handler should offload: " + src);
        Assert.assertTrue(src.contains("supportAgent.run(text, sessionId = \"telegram:\" "
                        + "+ message.chat.id.toString())"),
                "session should key on the conversation: " + src);
        Assert.assertTrue(src.contains("self.telegramClient->sendMessage(message.chat.id, replyText)"),
                "reply should go back out through the service's own client: " + src);
    }

    @Test
    public void testWhatsAppProcessesABatchSerially() {
        String src = generateForAgent("whatsapp.business", "mathTutorAgent", null);

        Assert.assertEquals(src.split("start self.replyToWhatsAppMessages", -1).length - 1, 1,
                "exactly one strand should be spawned per notification: " + src);
        Assert.assertTrue(src.indexOf("foreach whatsapp:InboundMessage") > src.indexOf("function replyTo"),
                "the per-message loop belongs inside the reply method, not the handler: " + src);
    }

    @Test
    public void testAgentOrgDecidesTheInvocationOperator() {
        String src = generateForAgent("telegram", "typedAgent", "ballerinax");

        Assert.assertTrue(src.contains("typedAgent->run(text"),
                "a non-ballerina agent should be called remotely: " + src);
    }

    @Test
    public void testChannelImportsAreEmitted() {
        String src = generateForAgent("whatsapp.business", "mathTutorAgent", null);
        Assert.assertTrue(src.contains("import ballerina/log;"),
                "the channel's own imports should be added: " + src);
    }

    @Test
    public void testNoAgentLeavesTheTriggerUntouched() {
        ServiceInitModel form = initForm("whatsapp.business");
        Assert.assertFalse(AgentTriggerServiceBuilder.handles(form),
                "a form with no agent must not route to the agent-trigger builder");

        String src = render(SchemaDrivenSourceGenerator.buildAddServiceEditsForTrigger(
                form, triggerModel("whatsapp.business"), rootOf("\n"), "main.bal"));
        Assert.assertFalse(src.contains("start "), "no agent bound -> no reply strand: " + src);
        Assert.assertFalse(src.contains("whatsappClient"), "no agent bound -> no reply client: " + src);
        Assert.assertFalse(src.contains(".run("), "no agent bound -> no agent call: " + src);
    }
}
