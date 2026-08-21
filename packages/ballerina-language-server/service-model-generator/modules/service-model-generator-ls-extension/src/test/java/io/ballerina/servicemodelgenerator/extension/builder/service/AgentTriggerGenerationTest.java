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
import io.ballerina.servicemodelgenerator.extension.model.Option;
import io.ballerina.servicemodelgenerator.extension.model.ServiceInitModel;
import io.ballerina.servicemodelgenerator.extension.model.Value;
import io.ballerina.servicemodelgenerator.extension.model.context.GetServiceInitModelContext;
import io.ballerina.tools.text.TextDocuments;
import org.eclipse.lsp4j.TextEdit;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;

/**
 * Covers {@link AgentTriggerServiceBuilder}.
 *
 * @since 1.9.0
 */
public class AgentTriggerGenerationTest {

    private static final String AGENT_NAME_PROPERTY = "agentName";
    private static final String SERVICE_TYPE_PROPERTY = "serviceType";
    private static final String HANDLER_PROPERTY = "agentEventHandler";
    private final Gson gson = new Gson();

    private ServiceInitModel initForm(String moduleName) {
        ServiceInitModel cached = TriggerModelReader.getInstance().getBundledServiceInitModel(moduleName)
                .orElseThrow();
        return gson.fromJson(gson.toJsonTree(cached), ServiceInitModel.class);
    }

    private TriggerUISchemaModel triggerModel(String moduleName) {
        return TriggerModelReader.getInstance().getBundledTriggerModel(moduleName).orElseThrow();
    }

    private AgentTriggerChannel channel(String moduleName) {
        String orgName = TriggerModelReader.getInstance().getBundledTriggerModel(moduleName)
                .map(TriggerUISchemaModel::orgName).orElse(null);
        return channel(orgName, moduleName);
    }

    private AgentTriggerChannel channel(String orgName, String moduleName) {
        return AgentTriggerChannels.forModule(orgName, moduleName).orElseThrow();
    }

    private ModulePartNode rootOf(String source) {
        return (ModulePartNode) SyntaxTree.from(TextDocuments.from(source)).rootNode();
    }

    private String render(Map<String, List<TextEdit>> edits) {
        StringBuilder source = new StringBuilder();
        edits.values().forEach(fileEdits -> fileEdits.forEach(edit -> source.append(edit.getNewText())));
        return normalized(source.toString());
    }

    /**
     * The generator joins lines with {@code System.lineSeparator()}, so on Windows every assertion
     * spanning a line break would have to spell {@code \r\n}. Assert the shape, not the host.
     */
    private static String normalized(String source) {
        return source.replace("\r\n", "\n");
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
        AgentTriggerChannel channel = channel(moduleName);
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

    private String generateForGitHubEvent(String serviceType, String handlerName) {
        return generateForEvent(GITHUB, "triageAgent", serviceType, handlerName, false);
    }

    private String generateForEvent(String moduleName, String agentVarName, String serviceType,
                                    String handlerName, boolean selectChannel) {
        ServiceInitModel form = initForm(moduleName);
        AgentTriggerChannel channel = channel(moduleName);
        channel.customizeInitModel(form, triggerModel(moduleName));
        form.addProperty(AGENT_NAME_PROPERTY, new Value.ValueBuilder()
                .enabled(true).editable(false).value(agentVarName).build());
        form.addProperty("instructions", new Value.ValueBuilder()
                .enabled(true).editable(true).value(INSTRUCTIONS).build());
        selectEvent(form, serviceType, handlerName, selectChannel);
        return render(AgentTriggerServiceBuilder.buildEdits(form, triggerModel(moduleName), channel,
                rootOf("\n"), "main.bal"));
    }

    private void selectEvent(ServiceInitModel form, String serviceType, String handlerName,
                             boolean selectChannel) {
        Value descriptor = form.getProperties().get(SERVICE_TYPE_PROPERTY);
        if (descriptor == null || descriptor.getProperties() == null
                || !descriptor.getProperties().containsKey(serviceType)) {
            form.getProperties().get(HANDLER_PROPERTY).setValue(handlerName);
            return;
        }
        if (selectChannel) {
            descriptor.setValue(serviceType);
        }
        descriptor.getProperties().get(serviceType).getProperties().get(HANDLER_PROPERTY).setValue(handlerName);
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

        Assert.assertTrue(src.contains("Use ${\"`\"}code${\"`\"} and ${\"$\"}{placeholders} verbatim."),
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
    public void testTheChosenEventRunsTheAgentInsteadOfTheFirst() {
        String src = generateForGitHubEvent("github:IssuesService", "onClosed");

        Assert.assertTrue(src.contains("remote function onClosed(github:IssuesEvent payload) returns error? {\n"
                        + "        _ = start self.runAgentOnClosed(payload);"),
                "the chosen handler should offload to the agent: " + src);
        Assert.assertTrue(src.contains("function runAgentOnClosed(github:IssuesEvent payload)"),
                "the reply method should be named for the chosen handler: " + src);
        Assert.assertEquals(src.split("start self\\.runAgent", -1).length - 1, 1,
                "only the chosen handler should call the agent: " + src);
        Assert.assertTrue(src.contains("remote function onOpened(github:IssuesEvent payload) returns error? {\n    }"),
                "the schema's first handler should now be emitted empty: " + src);
        Assert.assertEquals(src.split("remote function ", -1).length - 1, 7,
                "the channel's whole handler surface should still be emitted: " + src);
    }

    @Test
    public void testAnEventChosenUnderAnotherChannelIsIgnored() {
        String src = generateForGitHubEvent("github:PushService", "onPush");

        Assert.assertTrue(src.contains("_ = start self.runAgentOnOpened(payload);"),
                "only the selected channel's branch may be read, or every branch races to supply the event: " + src);
    }

    @Test
    public void testAnUnknownEventFallsBackToTheChannelsPrimary() {
        String src = generateForAgent(GITHUB, "triageAgent", null,
                Map.of("instructions", INSTRUCTIONS, "agentEventHandler", "onNoSuchEvent"));

        Assert.assertTrue(src.contains("_ = start self.runAgentOnOpened(payload);"),
                "an unrecognised handler must not produce a service that calls nothing: " + src);
    }

    @Test
    public void testTheFormTheWizardAsksForCarriesTheEventChoice() {
        ServiceInitModel form = initForm(GITHUB);
        TriggerUISchemaModel resolved = TriggerModelReader.getInstance()
                .getSchemaDrivenTriggerModel(form.getOrgName(), form.getModuleName(), form.getVersion(),
                        form.isLocalRepository())
                .orElse(null);
        Assert.assertNotNull(resolved, "the builder resolves the schema off the init form's own identity; "
                + "a miss here silently leaves the form without its event choice");

        channel(GITHUB).customizeInitModel(form, resolved);
        Value descriptor = form.getProperties().get("serviceType");
        Assert.assertNotNull(descriptor.getProperties(),
                "the event channel dropdown reached the wizard without its per-channel events");
        Assert.assertTrue(descriptor.getProperties().containsKey("github:IssuesService"),
                "expected a branch per event channel: " + descriptor.getProperties().keySet());
    }



    @Test
    public void testEachEventChannelOffersItsOwnEvents() {
        ServiceInitModel form = initForm(GITHUB);
        channel(GITHUB).customizeInitModel(form, triggerModel(GITHUB));

        Value descriptor = form.getProperties().get("serviceType");
        Map<String, Value> perChannel = descriptor.getProperties();
        Assert.assertNotNull(perChannel, "the event channel dropdown should carry a branch per channel");

        Value issues = perChannel.get("github:IssuesService").getProperties().get("agentEventHandler");
        List<Option> options = issues.getTypes().getFirst().options();
        Assert.assertEquals(options.stream().map(Option::value).toList(),
                List.of("onOpened", "onClosed", "onReopened", "onAssigned", "onUnassigned", "onLabeled",
                        "onUnlabeled"),
                "Issues should offer exactly its own events: " + options);
        Assert.assertEquals(issues.getValue(), "onOpened", "the channel's primary event should be preselected");

        Value push = perChannel.get("github:PushService").getProperties().get("agentEventHandler");
        Assert.assertEquals(push.getTypes().getFirst().options().stream().map(Option::value).toList(),
                List.of("onPush"), "Push has one event, and must not be offered the Issues events");
    }

    private String existingIssuesService() {
        return generateForGitHubEvent("github:IssuesService", "onOpened");
    }

    private String mergeIntoExisting(String serviceType, String handlerName, String existingSource) {
        return mergeIntoExisting(GITHUB, "triageAgent", serviceType, handlerName, "githubListener", existingSource);
    }

    private String mergeIntoExisting(String moduleName, String agentVarName, String serviceType,
                                     String handlerName, String listenerVarName, String existingSource) {
        ServiceInitModel form = initForm(moduleName);
        AgentTriggerChannel channel = channel(moduleName);
        channel.customizeInitModel(form, triggerModel(moduleName));
        form.addProperty(AGENT_NAME_PROPERTY, new Value.ValueBuilder()
                .enabled(true).editable(false).value(agentVarName).build());
        form.addProperty("instructions", new Value.ValueBuilder()
                .enabled(true).editable(true).value(INSTRUCTIONS).build());
        selectEvent(form, serviceType, handlerName, true);
        List<Value> choices = form.getProperties().get("listener").getChoices();
        choices.forEach(choice -> choice.setEnabled(false));
        Value existingBranch = choices.get(1);
        existingBranch.setEnabled(true);
        existingBranch.getProperties().get("existingListener").setValue(listenerVarName);
        return applyEdits(existingSource, AgentTriggerServiceBuilder.buildEdits(form, triggerModel(moduleName),
                channel, rootOf(existingSource), "main.bal"));
    }

    private String applyEdits(String source, Map<String, List<TextEdit>> edits) {
        List<TextEdit> ordered = new ArrayList<>(edits.values().iterator().next());
        ordered.sort(Comparator
                .comparingInt((TextEdit edit) -> edit.getRange().getStart().getLine())
                .thenComparingInt(edit -> edit.getRange().getStart().getCharacter())
                .reversed());
        List<String> lines = new ArrayList<>(List.of(source.split("\n", -1)));
        for (TextEdit edit : ordered) {
            int line = edit.getRange().getStart().getLine();
            int character = edit.getRange().getStart().getCharacter();
            String target = lines.get(line);
            lines.set(line, target.substring(0, character) + edit.getNewText() + target.substring(character));
        }
        return normalized(String.join("\n", lines));
    }


    @Test
    public void testASecondEventIsWiredIntoTheServiceThatAlreadyExists() {
        String src = mergeIntoExisting("github:IssuesService", "onAssigned", existingIssuesService());

        Assert.assertEquals(src.split("service github:IssuesService", -1).length - 1, 1,
                "a second service on the listener would never be dispatched to: " + src);
        Assert.assertTrue(src.contains("    remote function onAssigned(github:IssuesEvent payload) returns error? {"
                        + "\n        _ = start self.runAgentOnAssigned(payload);\n    }"),
                "the chosen handler should offload to the agent, indented into its body: " + src);
        Assert.assertTrue(src.contains("    function runAgentOnAssigned(github:IssuesEvent payload) {"),
                "the reply method should join the service it is called from: " + src);
        Assert.assertTrue(src.contains("_ = start self.runAgentOnOpened(payload);"),
                "the event that was already wired must survive: " + src);
    }

    @Test
    public void testWiringTheSameEventTwiceChangesNothing() {
        String src = mergeIntoExisting("github:IssuesService", "onOpened", existingIssuesService());

        Assert.assertEquals(src, existingIssuesService(),
                "the event already runs the agent, so there is nothing to add: " + src);
    }

    @Test
    public void testAnEventChannelWithNoServiceYetStillGetsOne() {
        String src = mergeIntoExisting("github:PushService", "onPush", existingIssuesService());

        Assert.assertTrue(src.contains("service github:PushService on githubListener"),
                "a different event channel needs its own service on the same listener: " + src);
    }

    @Test
    public void testTwilioRunsOnItsPrimaryEvent() {
        String src = generateForAgent("trigger.twilio", "callAgent", null,
                Map.of("instructions", "Summarise the call status change."));

        Assert.assertTrue(src.contains("service twilio:CallStatusService on twilioListener"),
                "the default event channel should be the service type: " + src);
        Assert.assertTrue(src.contains("_ = start self.runAgentOnQueued(event);"),
                "the primary handler should offload: " + src);
        Assert.assertTrue(src.contains("function runAgentOnQueued(twilio:CallStatusEventWrapper event)"),
                "the reply method should take the handler's own payload type: " + src);
        Assert.assertEquals(src.split("start self\\.runAgent", -1).length - 1, 1,
                "only the primary handler should call the agent: " + src);
    }

    private String generateForGoogleChat(String agentVarName, String agentOrgName) {
        return generateForAgent("googleapis.chat", agentVarName, agentOrgName);
    }

    @Test
    public void testGoogleChatServiceIsWiredToTheAgent() {
        String src = generateForGoogleChat("mathTutorAgent", null);

        Assert.assertTrue(src.contains("service chat:ChatService on chatListener"),
                "the chat service should be attached to the channel's listener: " + src);
        Assert.assertTrue(src.contains("remote function onMessage(chat:MessageEvent event, "
                        + "chat:MessageCaller caller)"),
                "the handler must be emitted, not left to an off-by-default schema function: " + src);
        Assert.assertTrue(src.contains("mathTutorAgent.run(text, sessionId = \"googlechat:\" "
                        + "+ (event.space?.name ?: \"unknown\"))"),
                "session should key on the space so a conversation keeps its memory: " + src);
    }

    @Test
    public void testGoogleChatReleasesTheWebhookBeforeRunningTheAgent() {
        String src = generateForGoogleChat("mathTutorAgent", null);

        int respond = src.indexOf("check caller->respond();");
        int offload = src.indexOf("_ = start self.replyToChatMessage(event, caller);");
        Assert.assertTrue(respond >= 0 && offload > respond,
                "the dispatcher blocks up to 28s for respond(), so it must be released first: " + src);
        Assert.assertTrue(src.indexOf("caller->sendMessage(reply)") > offload,
                "the reply belongs on the offloaded strand, not the handler: " + src);
    }

    @Test
    public void testGoogleChatRepliesInTheOriginatingThread() {
        String src = generateForGoogleChat("mathTutorAgent", null);

        Assert.assertTrue(src.contains("chat:ChatThread? thread = event.message.thread;")
                        && src.contains("if thread is chat:ChatThread {"),
                "thread is an optional field, so it cannot be set unconditionally: " + src);
        Assert.assertTrue(src.contains("reply.thread = thread;"),
                "the answer should land under the question, not loose in the space: " + src);
    }

    private String generateForAgentChat(String basePath, String existingSource) {
        AgentTriggerChannel channel = channel("ballerina", "ai");
        ServiceInitModel form = channel.initModel(new GetServiceInitModelContext("ballerina", "ai", "ai",
                "1.0.0", null, null, null, false, "mathTutorAgent", null)).orElseThrow();
        form.addProperty(AGENT_NAME_PROPERTY, new Value.ValueBuilder()
                .enabled(true).editable(false).value("mathTutorAgent").build());
        form.getProperties().get("basePath").setValue(basePath);
        return render(AgentTriggerServiceBuilder.buildEdits(form, null, channel,
                rootOf(existingSource), "main.bal"));
    }

    @Test
    public void testAgentChatServiceIsWiredToTheAgent() {
        String src = generateForAgentChat("/math", "\n");

        Assert.assertTrue(src.contains("service /math on agentChatListener"),
                "the user's path should be the service path: " + src);
        Assert.assertTrue(src.contains("resource function post chat(@http:Payload ai:ChatReqMessage request)"),
                "the chat endpoint should be the built-in ai:ChatReqMessage contract: " + src);
        Assert.assertTrue(src.contains("check mathTutorAgent.run(request.message, sessionId = request.sessionId)"),
                "the agent should be called with the request's own message and session: " + src);
        Assert.assertTrue(src.contains("import ballerina/ai;") && src.contains("import ballerina/http;"),
                "both modules the chat service needs should be imported: " + src);
    }

    @Test
    public void testAgentChatEscapesHyphensInThePath() {
        String src = generateForAgentChat("/math-tutor-agent", "\n");

        Assert.assertTrue(src.contains("service /math\\-tutor\\-agent on agentChatListener"),
                "'-' is not an identifier character in Ballerina, so the path must escape it: " + src);
    }

    @Test
    public void testAgentChatDeclaresAListenerWhenTheProjectHasNone() {
        String src = generateForAgentChat("/math", "\n");

        Assert.assertTrue(src.contains(
                        "listener ai:Listener agentChatListener = new (listenOn = check http:getDefaultListener());"),
                "the first chat service should bring its own listener: " + src);
    }

    @Test
    public void testAgentChatReusesTheProjectsExistingListener() {
        String src = generateForAgentChat("/support", """
                import ballerina/ai;

                listener ai:Listener sharedChatListener = new (listenOn = check http:getDefaultListener());
                """);

        Assert.assertTrue(src.contains("service /support on sharedChatListener"),
                "every chat service shares one listener: " + src);
        Assert.assertFalse(src.contains("listener ai:Listener agentChatListener"),
                "a second listener would take a second port for no reason: " + src);
    }

    @Test
    public void testAgentChatPathIsAlwaysAbsolute() {
        Assert.assertTrue(generateForAgentChat("support", "\n").contains("service /support on"),
                "a path typed without a leading slash must not emit invalid source");
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

    @Test
    public void testACatalogOnlyConnectorReachesTheAgent() {
        String src = generateForEvent("kafka", "streamAgent", "Service", "onConsumerRecord", true);

        Assert.assertTrue(src.contains("service kafka:Service on kafkaListener"),
                "a connector with a single service type should still name it: " + src);
        Assert.assertTrue(src.contains("remote function onConsumerRecord(kafka:AnydataConsumerRecord[] records)"),
                "the payload type is composed from the schema's binding template, not left as anydata: " + src);
        Assert.assertTrue(src.contains("_ = start self.runAgentOnConsumerRecord(records);"),
                "the handler should offload rather than block the consumer: " + src);
        Assert.assertTrue(src.contains("function runAgentOnConsumerRecord(kafka:AnydataConsumerRecord[] records)"),
                "the reply method should take the handler's own parameters: " + src);
    }

    @Test
    public void testACatalogHandlerNobodyChoseIsNotEmitted() {
        String src = generateForEvent("kafka", "streamAgent", "Service", "onConsumerRecord", true);

        Assert.assertEquals(src.split("remote function ", -1).length - 1, 1,
                "a catalog handler is opt-in, so emitting the siblings would turn on behaviour "
                        + "the connector deliberately leaves off: " + src);
        Assert.assertFalse(src.contains("onError"), "onError was not chosen: " + src);
    }

    @Test
    public void testABrokerServiceKeepsItsQueueBinding() {
        String src = generateForEvent("rabbitmq", "orderAgent", "Service", "onMessage", true);

        Assert.assertTrue(src.contains("@rabbitmq:ServiceConfig"),
                "a broker binds its queue through a service annotation; without it the service "
                        + "compiles and consumes nothing: " + src);
        Assert.assertTrue(src.contains("queueName"), "the queue the form asked for should reach the source: " + src);
        Assert.assertTrue(src.indexOf("@rabbitmq:ServiceConfig") < src.indexOf("service rabbitmq:Service"),
                "an annotation attaches above the declaration it annotates: " + src);
    }

    @Test
    public void testChangeDataCapturePreselectsACreate() {
        ServiceInitModel form = initForm("mysql");
        channel("mysql").customizeInitModel(form, triggerModel("mysql"));

        Value handler = form.getProperties().get(HANDLER_PROPERTY);
        Assert.assertNotNull(handler, "a connector with one service type has no channel dropdown to nest "
                + "the event choice under, so it belongs on the form itself");
        Assert.assertEquals(handler.getValue(), "onCreate",
                "onRead fires once per pre-existing row of the initial snapshot -- an agent run per row "
                        + "of the table, on the first start");
        Assert.assertEquals(handler.getTypes().getFirst().options().stream().map(Option::value).toList(),
                List.of("onRead", "onCreate", "onUpdate", "onDelete", "onError"),
                "only the default moves; every event stays on offer");
    }

    @Test
    public void testEveryPayloadTheHandlerCarriesReachesThePrompt() {
        String src = generateForEvent("mysql", "auditAgent", "cdc:Service", "onUpdate", true);

        Assert.assertTrue(src.contains("_ = start self.runAgentOnUpdate(before, after);"),
                "a row update hands over both versions of the row: " + src);
        Assert.assertTrue(src.contains("${before.toJsonString()}") && src.contains("${after.toJsonString()}"),
                "a prompt built from the first parameter alone would silently drop half the event: " + src);
    }

    @Test
    public void testAListenerSuppliedHandleIsPassedOnButNotPrompted() {
        String src = generateForEvent("solace", "queueAgent", "Service", "onMessage", true);

        Assert.assertTrue(src.contains("_ = start self.runAgentOnMessage(message, caller);"),
                "the reply method has to be callable with what the handler was given: " + src);
        Assert.assertTrue(src.contains("function runAgentOnMessage(solace:Message message, solace:Caller caller)"),
                "a caller the listener supplies stays in the signature: " + src);
        Assert.assertFalse(src.contains("${caller"),
                "a caller carries no event, so there is nothing in it for the agent to read: " + src);
    }

    @Test
    public void testAPayloadThatIsNotAnydataIsRenderedAsText() {
        String src = generateForEvent("sap.jco", "idocAgent", "jco:IDocService", "onReceive", true);

        Assert.assertTrue(src.contains("${iDoc.toString()}"),
                "xml is not anydata, so toJsonString would not compile: " + src);
    }

    @Test
    public void testAnEventSourceIsOfferedToAnAgentWithoutBeingRegistered() {
        Assert.assertEquals(AgentTriggerChannels.kindOf("ballerinax", "kafka", "event"), "EVENT",
                "every event source is served by the generic channel; naming them one by one is what "
                        + "kept the picker to a curated few");
        Assert.assertEquals(AgentTriggerChannels.kindOf("ballerinax", "whatsapp.business", "event"), "CHAT",
                "a chat channel owns its reply path, so it keeps its own implementation");
    }

    @Test
    public void testAConnectorThatIsNotAnEventSourceIsNotOffered() {
        Assert.assertNull(AgentTriggerChannels.kindOf("ballerina", "ftp", "file"),
                "file integration is a separate surface and has not been taken on");
        Assert.assertTrue(AgentTriggerChannels.forModule("ballerina", "ftp").isEmpty(),
                "the listing and the builder must agree on what is offerable");
    }

    @Test
    public void testASecondEventJoinsACatalogOnlyServiceAsANewHandler() {
        String existing = generateForEvent("mysql", "auditAgent", "cdc:Service", "onCreate", true);
        String src = mergeIntoExisting("mysql", "auditAgent", "cdc:Service", "onDelete", "mysqlCdcListener",
                existing);

        Assert.assertTrue(src.contains("remote function onDelete("),
                "a connector that emits no empty siblings has nothing to splice into, so the second "
                        + "event has to arrive as a whole handler: " + src);
        Assert.assertTrue(src.contains("_ = start self.runAgentOnDelete("),
                "the added handler should offload like the first: " + src);
        Assert.assertTrue(src.contains("_ = start self.runAgentOnCreate("),
                "the event already wired must survive: " + src);
        Assert.assertEquals(src.split("service cdc:Service", -1).length - 1, 1,
                "a second service on the same listener fails to start: " + src);
    }
}
