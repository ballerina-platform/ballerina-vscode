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
        return generateForAgent(moduleName, agentVarName, agentOrgName, Map.of());
    }

    private String generateForAgent(String moduleName, String agentVarName, String agentOrgName,
                                    Map<String, String> channelValues) {
        ServiceInitModel form = initForm(moduleName);
        form.addProperty(AGENT_NAME_PROPERTY, new Value.ValueBuilder()
                .enabled(true).editable(false).value(agentVarName).build());
        if (agentOrgName != null) {
            form.addProperty("agentOrg", new Value.ValueBuilder()
                    .enabled(true).editable(false).value(agentOrgName).build());
        }
        channelValues.forEach((key, value) -> form.addProperty(key, new Value.ValueBuilder()
                .enabled(true).editable(true).value(value).build()));
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


    private static final String GITHUB = "trigger.github";
    private static final String INSTRUCTIONS = "Triage this issue and suggest a priority label.";

    private String generateForGitHub(String instructions) {
        return generateForAgent(GITHUB, "triageAgent", null, Map.of("instructions", instructions));
    }

    @Test
    public void testTheChannelsPrimaryEventRunsTheAgent() {
        String src = generateForGitHub(INSTRUCTIONS);

        Assert.assertTrue(src.contains("service github:IssuesService on githubListener"),
                "the selected event channel should be the service type: " + src);
        Assert.assertTrue(src.contains("_ = start self.runAgentOnOpened(payload);"),
                "the primary handler should offload to the agent: " + src);
        Assert.assertTrue(src.contains("function runAgentOnOpened(github:IssuesEvent payload)"),
                "the reply method should take the handler's own payload type: " + src);
    }

    @Test
    public void testTheRemainingHandlersAreEmitted() {
        String src = generateForGitHub(INSTRUCTIONS);

        Assert.assertTrue(src.contains("remote function onClosed(github:IssuesEvent payload) returns error? {"),
                "sibling handlers should be present: " + src);
        Assert.assertEquals(src.split("start self\\.runAgent", -1).length - 1, 1,
                "only the primary handler should call the agent: " + src);
        Assert.assertEquals(src.split("remote function ", -1).length - 1, 7,
                "the channel's whole handler surface should be emitted: " + src);
    }

    @Test
    public void testInstructionsAndTheEventBecomeThePrompt() {
        String src = generateForGitHub(INSTRUCTIONS);

        Assert.assertTrue(src.contains("string prompt = string `" + INSTRUCTIONS),
                "the user's instructions should open the prompt: " + src);
        Assert.assertTrue(src.contains("${payload.toJsonString()}`;"),
                "the whole event should be appended: " + src);
        Assert.assertTrue(src.contains("triageAgent.run(prompt)"),
                "the agent should be called with the composed prompt: " + src);
    }

    @Test
    public void testAnEventRunCarriesNoSession() {
        Assert.assertFalse(generateForGitHub(INSTRUCTIONS).contains("sessionId"),
                "an event trigger should not share a memory session across events");
    }

    @Test
    public void testInstructionsAreEscapedForTheTemplate() {
        String src = generateForGitHub("Use `code` and ${placeholders} verbatim.");

        Assert.assertTrue(src.contains("Use \\`code\\` and \\${placeholders} verbatim."),
                "backticks and interpolations should be escaped: " + src);
    }

    @Test
    public void testTheAgentsAnswerIsLeftToTheUser() {
        String src = generateForGitHub(INSTRUCTIONS);

        Assert.assertTrue(src.contains("// TODO: replace this with what should happen with the agent's answer"),
                "a comment renders as a note in the flow diagram, so the unfinished step is visible: " + src);
        Assert.assertTrue(src.contains("log:printInfo(\"Agent result\", result = result);"),
                "the placeholder should be worth keeping while a webhook is wired up: " + src);
    }

    @Test
    public void testShopifyRunsOnItsPrimaryEvent() {
        String src = generateForAgent("trigger.shopify", "orderAgent", null,
                Map.of("instructions", "Flag orders that look fraudulent."));

        Assert.assertTrue(src.contains("service shopify:OrdersService on shopifyListener"),
                "the default event channel should be the service type: " + src);
        Assert.assertTrue(src.contains("_ = start self.runAgentOnOrdersCreate(event);"),
                "the primary handler should offload, using the schema's own payload name: " + src);
        Assert.assertTrue(src.contains("function runAgentOnOrdersCreate(shopify:OrderEvent event)"),
                "the reply method should take the handler's own payload type: " + src);
        Assert.assertTrue(src.contains("${event.toJsonString()}`;"),
                "the whole event should be appended to the prompt: " + src);
    }

    @Test
    public void testHubSpotRunsOnItsPrimaryEvent() {
        String src = generateForAgent("trigger.hubspot", "crmAgent", null,
                Map.of("instructions", "Summarise the new company."));

        Assert.assertTrue(src.contains("service hubspot:CompanyService on hubspotListener"),
                "the default event channel should be the service type: " + src);
        Assert.assertTrue(src.contains("_ = start self.runAgentOnCompanyCreation(event);"),
                "the primary handler should offload: " + src);
        Assert.assertTrue(src.contains("function runAgentOnCompanyCreation(hubspot:WebhookEvent event)"),
                "the reply method should take the handler's own payload type: " + src);
        Assert.assertEquals(src.split("start self\\.runAgent", -1).length - 1, 1,
                "only the primary handler should call the agent: " + src);
    }

    @Test
    public void testSalesforceRunsOnItsPrimaryEvent() {
        String src = generateForAgent("salesforce", "cdcAgent", null,
                Map.of("instructions", "Explain what changed."));

        Assert.assertTrue(src.contains("_ = start self.runAgentOnCreate(payload);"),
                "the primary handler should offload: " + src);
        Assert.assertTrue(src.contains("function runAgentOnCreate(salesforce:EventData payload)"),
                "the reply method should take the handler's own payload type: " + src);
    }

    @Test
    public void testSalesforceKeepsItsChannelPath() {
        String src = generateForAgent("salesforce", "cdcAgent", null,
                Map.of("instructions", "Explain what changed."));

        Assert.assertTrue(src.contains("service salesforce:CdcService /data/ChangeEvents on salesforceListener"),
                "the subscribed channel path must survive, or the service listens to nothing: " + src);
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
