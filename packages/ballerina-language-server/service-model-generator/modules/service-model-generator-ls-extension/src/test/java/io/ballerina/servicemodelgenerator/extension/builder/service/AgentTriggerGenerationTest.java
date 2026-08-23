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
import io.ballerina.servicemodelgenerator.extension.builder.service.agent.HttpAgentTriggerChannel;
import io.ballerina.servicemodelgenerator.extension.connector.SchemaDrivenSourceGenerator;
import io.ballerina.servicemodelgenerator.extension.connector.TriggerModelReader;
import io.ballerina.servicemodelgenerator.extension.model.Function;
import io.ballerina.servicemodelgenerator.extension.model.FunctionReturnType;
import io.ballerina.servicemodelgenerator.extension.model.HttpResponse;
import io.ballerina.servicemodelgenerator.extension.model.Option;
import io.ballerina.servicemodelgenerator.extension.model.Parameter;
import io.ballerina.servicemodelgenerator.extension.model.PropertyType;
import io.ballerina.servicemodelgenerator.extension.model.ServiceInitModel;
import io.ballerina.servicemodelgenerator.extension.model.TriggerBasicInfo;
import io.ballerina.servicemodelgenerator.extension.model.ValidationRule;
import io.ballerina.servicemodelgenerator.extension.model.Value;
import io.ballerina.servicemodelgenerator.extension.model.context.GetServiceInitModelContext;
import io.ballerina.servicemodelgenerator.extension.validation.GenerationRefusedException;
import io.ballerina.tools.text.TextDocuments;
import org.eclipse.lsp4j.TextEdit;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.util.ArrayList;
import java.util.Arrays;
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

        Assert.assertTrue(src.contains("triageAgent.run(string `" + INSTRUCTIONS),
                "the user's instructions should open the prompt, inline as the argument: " + src);
        Assert.assertTrue(src.contains("${payload.toJsonString()}`)"),
                "the whole event should be appended: " + src);
        Assert.assertFalse(src.contains("string prompt ="),
                "the prompt is not a separate declaration: " + src);
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
        Assert.assertTrue(src.contains("${event.toJsonString()}`)"),
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

    private ServiceInitModel httpForm(String basePath, String instructions) {
        AgentTriggerChannel channel = channel("ballerina", "http");
        ServiceInitModel form = channel.initModel(new GetServiceInitModelContext("ballerina", "http", "http",
                "2.14.1", null, null, null, false, "issueTriageAgent", null)).orElseThrow();
        form.addProperty(AGENT_NAME_PROPERTY, new Value.ValueBuilder()
                .enabled(true).editable(false).value("issueTriageAgent").build());
        channel.additionalProperties().forEach(form::addProperty);
        form.getProperties().get("basePath").setValue(basePath);
        form.getProperties().get("instructions").setValue(instructions);
        return form;
    }

    private String generateForHttp(String basePath, String instructions, String existingSource) {
        return render(AgentTriggerServiceBuilder.buildEdits(httpForm(basePath, instructions), null,
                channel("ballerina", "http"), rootOf(existingSource), "main.bal"));
    }

    private static final String ORDERS_SERVICE = """
            listener http:Listener httpListener = new (9090);

            service /orders on httpListener {

                resource function get .() returns string|error {
                    return "ok";
                }
            }
            """;

    /** The form as the wizard submits it when the user picked "Use an existing service". */
    private ServiceInitModel reuseForm(String basePath) {
        ServiceInitModel form = httpForm("/ownService", "Triage this issue.");
        form.addProperty(ServiceInitModel.KEY_EXISTING_SERVICE,
                new Value.ValueBuilder().enabled(true).value(basePath).build());
        return form;
    }

    private String generateReusing(String basePath, String existingSource) {
        return render(AgentTriggerServiceBuilder.buildEdits(reuseForm(basePath), null,
                channel("ballerina", "http"), rootOf(existingSource), "main.bal"));
    }

    @Test
    public void testHttpEndpointJoinsTheSelectedService() {
        String src = generateReusing("/orders", ORDERS_SERVICE);

        Assert.assertFalse(src.contains("service /orders"),
                "the service is already there; a second one on the same path compiles and then fails to "
                        + "start: " + src);
        Assert.assertTrue(src.contains("resource function post ."),
                "the endpoint should arrive as a member of the service that exists: " + src);
        Assert.assertTrue(src.contains("issueTriageAgent.run("),
                "a joined resource still has to call the agent: " + src);
    }

    @Test
    public void testSelectingAServiceOverridesTheListenerChooser() {
        ServiceInitModel form = reuseForm("/orders");
        form.addProperty("port", new Value.ValueBuilder().enabled(true).value("8080").build());
        form.addProperty(ServiceInitModel.KEY_LISTENER_VAR_NAME,
                new Value.ValueBuilder().enabled(true).value("ordersListener").build());

        String src = render(AgentTriggerServiceBuilder.buildEdits(form, null, channel("ballerina", "http"),
                rootOf(ORDERS_SERVICE), "main.bal"));

        Assert.assertFalse(src.contains("ordersListener"),
                "naming a service names its listener too, so a stale listener choice must not split the "
                        + "endpoint into a second service: " + src);
        Assert.assertTrue(src.contains("resource function post ."),
                "the endpoint should join the selected service: " + src);
    }

    @Test
    public void testHttpEndpointDeclaresItsOwnServiceWhenCreatingNew() {
        String src = generateForHttp("/triage", "Triage this issue.", ORDERS_SERVICE);

        Assert.assertTrue(src.contains("service /triage on"),
                "a path nothing serves yet should still get its own service: " + src);
    }

    @Test
    public void testJoiningRefusesToDuplicateAResourceThatExists() {
        String source = """
                listener http:Listener httpListener = new (9090);

                service /orders on httpListener {

                    resource function post .(@http:Payload string payload) returns string|error {
                        return "ok";
                    }
                }
                """;

        GenerationRefusedException thrown = Assert.expectThrows(GenerationRefusedException.class,
                () -> AgentTriggerServiceBuilder.buildEdits(reuseForm("/orders"), null,
                        channel("ballerina", "http"), rootOf(source), "main.bal"));

        Assert.assertTrue(thrown.getMessage().contains("post ."),
                "two resources with the same accessor and path do not compile, so the message has to name "
                        + "the one that clashes: " + thrown.getMessage());
        Assert.assertEquals(thrown.toValidationResult().propertyPath(), "existingService",
                "the failure has to land on a field the user can see, or the form closes on a submit that "
                        + "wrote nothing");
        Assert.assertTrue(thrown.toValidationResult().isError(),
                "a warning would not stop generation");
    }

    @Test
    public void testJoiningAllowsADifferentMethodOnTheSamePath() {
        String source = """
                listener http:Listener httpListener = new (9090);

                service /orders on httpListener {

                    resource function get .() returns string|error {
                        return "ok";
                    }
                }
                """;

        Assert.assertTrue(render(AgentTriggerServiceBuilder.buildEdits(reuseForm("/orders"), null,
                        channel("ballerina", "http"), rootOf(source), "main.bal"))
                        .contains("resource function post ."),
                "only the accessor and path together identify a resource");
    }

    @Test
    public void testHttpEndpointJoinsAKebabPathThroughItsEscape() {
        String src = generateReusing("/order-tracker", """
                listener http:Listener httpListener = new (9090);

                service /order\\-tracker on httpListener {
                }
                """);

        Assert.assertFalse(src.contains("service /order"),
                "the escape is source syntax, so the typed URL and the declared path are the same "
                        + "service: " + src);
        Assert.assertTrue(src.contains("resource function post ."),
                "the endpoint should join it: " + src);
    }

    @Test
    public void testHttpEndpointDoesNotJoinAServiceOfAnotherKind() {
        String src = generateReusing("/orders", """
                service graphql:Service /orders on httpListener {
                }
                """);

        Assert.assertTrue(src.contains("service /ownService on"),
                "a service that declares a type descriptor is not somewhere an HTTP resource can go, so "
                        + "the endpoint falls back to declaring its own: " + src);
    }

    @Test
    public void testAnEmptyProjectIsNotAskedToChoose() {
        ServiceInitModel form = httpForm("/agent", "Triage this issue.");

        Assert.assertNull(form.getProperties().get(ServiceInitModel.KEY_CONFIGURE_ENDPOINT),
                "with nothing to reuse there is no choice to make, so the radio must not appear");
        Assert.assertNull(HttpAgentTriggerChannel.pathField(List.of()).getTypes().getFirst().validations(),
                "and the path carries no collision rule, because nothing can collide");
    }

    @Test
    public void testATakenPathIsRefusedWhenCreatingNew() {
        Value path = HttpAgentTriggerChannel.endpointChoice(List.of("/orders"), null)
                .getChoices().getFirst().getProperties().get("basePath");
        ValidationRule rule = path.getTypes().getFirst().validations().getFirst();

        Assert.assertEquals(rule.getRule(), "common.validate.not.one.of");
        Assert.assertEquals(rule.getArgs().get("values"), List.of("/orders"),
                "the rule has to carry the paths that are actually taken");
        Assert.assertNotNull(rule.getMessage(), "a generic rule message would not tell the user what to do");
    }

    @Test
    public void testReusingAServiceIsNotAskedAboutListeners() {
        Value chooser = new Value.ValueBuilder()
                .metadata("Listener Configuration", "")
                .types(List.of(PropertyType.types(Value.FieldType.CHOICE)))
                .enabled(true).editable(true).build();
        List<Value> branches = HttpAgentTriggerChannel.endpointChoice(List.of("/orders"), chooser).getChoices();

        Assert.assertTrue(branches.getFirst().getProperties()
                        .containsKey(ServiceInitModel.KEY_CONFIGURE_LISTENER),
                "creating a service is where the listener is decided");
        Assert.assertFalse(branches.get(1).getProperties()
                        .containsKey(ServiceInitModel.KEY_CONFIGURE_LISTENER),
                "the chosen service already has a listener, so the question does not apply");
    }

    @Test
    public void testAnExistingServiceIsOfferedForReuse() {
        List<Value> branches = HttpAgentTriggerChannel.endpointChoice(List.of("/orders"), null).getChoices();

        Assert.assertTrue(branches.getFirst().isEnabled(), "creating a new service stays the default");
        Assert.assertFalse(branches.get(1).isEnabled(), "reuse is opt-in");
        Value selector = branches.get(1).getProperties().get(ServiceInitModel.KEY_EXISTING_SERVICE);
        Assert.assertEquals(selector.getTypes().getFirst().fieldType(), Value.FieldType.SINGLE_SELECT,
                "reuse is a plain select box, not a free-text field");
        Assert.assertNull(selector.getTypes().getFirst().options(),
                "options route a SINGLE_SELECT to the expression editor, which renders it as an enum with "
                        + "a 'No Selection' entry instead of a plain dropdown");
        Assert.assertEquals(selector.getItems(), List.of("/orders"));
        Assert.assertEquals(selector.getValue(), "/orders", "the first service is preselected");
    }

    @Test
    public void testOnlyJoinableServicesAreOfferedAsPaths() {
        List<String> paths = HttpAgentTriggerChannel.servedPaths(rootOf("""
                service /orders on httpListener {
                }

                service /order\\-tracker on httpListener {
                }

                service graphql:Service /graph on httpListener {
                }

                service telegram:TelegramService on telegramListener {
                }
                """));

        Assert.assertEquals(paths, List.of("/orders", "/order-tracker"),
                "the list must offer exactly what appendToExistingService can join, and offer it as a URL "
                        + "rather than as source: " + paths);
    }

    @Test
    public void testNoDocumentOffersNoPaths() {
        Assert.assertTrue(HttpAgentTriggerChannel.servedPaths(null).isEmpty(),
                "a missing document must degrade to 'declare a new service', not fail");
    }

    @Test
    public void testHttpEndpointIsWiredToTheAgent() {
        String src = generateForHttp("/issue-triage", "Triage this issue.", "\n");

        Assert.assertTrue(src.contains("service /issue\\-triage on httpDefaultListener"),
                "the user's path should be the service path, with '-' escaped: " + src);
        Assert.assertTrue(src.contains("resource function post ."),
                "one endpoint should be one URL, so the resource sits on the base path: " + src);
        Assert.assertTrue(src.contains("issueTriageAgent.run(string `Triage this issue."),
                "the agent should be called with the assembled prompt, inline as the argument: " + src);
        Assert.assertFalse(src.contains("string prompt ="),
                "the prompt is not a separate declaration: " + src);
        Assert.assertTrue(src.contains("import ballerina/http;"),
                "the endpoint needs ballerina/http: " + src);
    }

    private String generateForShapedHttp(String accessor, String path, List<Parameter> parameters,
                                         String... responseBodyTypes) {
        return generateForHttpResponding(accessor, path, parameters, "200", responseBodyTypes);
    }

    /** The status code the creation form seeds, so nothing is wrapped in a status-code record. */
    private String generateForUnwrappedHttp(String accessor, String... responseBodyTypes) {
        return generateForHttpResponding(accessor, ".", List.of(),
                "post".equalsIgnoreCase(accessor) ? "201" : "200", responseBodyTypes);
    }

    private String generateForHttpResponding(String accessor, String path, List<Parameter> parameters,
                                             String statusCode, String... responseBodyTypes) {
        ServiceInitModel form = httpForm("/triage", "Triage it.");
        FunctionReturnType returnType = new FunctionReturnType(
                new Value.ValueBuilder().enabled(true).value("").build());
        returnType.setResponses(Arrays.stream(responseBodyTypes).map(body -> new HttpResponse(
                new Value.ValueBuilder().enabled(true).value(statusCode).build(),
                new Value.ValueBuilder().enabled(true).value(body).build(),
                null, null, new Value.ValueBuilder().enabled(false).value("").build(), null, true, true)).toList());
        Function shaped = new Function.FunctionBuilder()
                .kind("RESOURCE")
                .accessor(new Value.ValueBuilder().enabled(true).value(accessor).build())
                .name(new Value.ValueBuilder().enabled(true).value(path).build())
                .parameters(new ArrayList<>(parameters))
                .returnType(returnType)
                .enabled(true)
                .build();
        form.setResource(shaped);

        return render(AgentTriggerServiceBuilder.buildEdits(form, null, channel("ballerina", "http"),
                rootOf("\n"), "main.bal"));
    }

    private static Parameter param(String httpParamType, String type, String name) {
        return new Parameter(null, "REQUIRED",
                new Value.ValueBuilder().enabled(true).value(type).build(),
                new Value.ValueBuilder().enabled(true).value(name).build(),
                null, null, true, true, false, false, httpParamType, false, null, false);
    }

    @Test
    public void testShapedHttpEndpointKeepsTheUsersSignature() {
        String src = generateForShapedHttp("GET", "issues/[string owner]",
                List.of(param("QUERY", "string", "priority")), "string");

        Assert.assertTrue(src.contains("resource function get issues/[string owner]"),
                "the method and path the user chose should be the resource's own: " + src);
        Assert.assertTrue(src.contains("priority"),
                "a query parameter the user declared should reach the signature: " + src);
    }

    @Test
    public void testShapedHttpEndpointLeavesAnUndeliverableAnswerToTheUser() {
        String src = generateForShapedHttp("POST", ".", List.of(), "xml");

        Assert.assertTrue(src.contains("string result = check issueTriageAgent.run(string `Triage it.`);"),
                "xml is not a subtype of json, so run cannot bind it: " + src);
        Assert.assertTrue(src.contains("// TODO: map the agent's result to the declared response type"),
                "the mapping is the user's and has to be visible: " + src);
        Assert.assertTrue(src.contains("return error(\"response mapping not implemented\", result = result);"),
                "the placeholder still has to compile, so it returns an error rather than the answer: " + src);
        Assert.assertFalse(src.contains("return {body: result};"),
                "a body field the answer cannot fill must not be generated: " + src);
    }

    @Test
    public void testShapedHttpEndpointBindsTheAnswerToADeclaredRecordType() {
        String src = generateForShapedHttp("POST", ".", List.of(), "IssueSummary");

        Assert.assertTrue(src.contains("IssueSummary result = check issueTriageAgent.run(string `Triage it.`);"),
                "run is dependently typed, so a json-compatible record binds the answer directly: " + src);
        Assert.assertTrue(src.contains("return {body: result};"),
                "the bound answer fills the status code record's body: " + src);
        Assert.assertFalse(src.contains("// TODO:"),
                "nothing is left for the user to map: " + src);
    }

    @Test
    public void testShapedHttpEndpointBindsTheAnswerToADeclaredArrayType() {
        String src = generateForShapedHttp("POST", ".", List.of(), "IssueSummary[]");

        Assert.assertTrue(src.contains("IssueSummary[] result = check issueTriageAgent.run(string `Triage it.`);"),
                "an array of a json-compatible type binds too: " + src);
        Assert.assertFalse(src.contains("// TODO:"), src);
    }

    @Test
    public void testShapedHttpEndpointBindsTheUnionOfEverySuccessResponse() {
        String src = generateForUnwrappedHttp("POST", "OpportunityRecord", "AccountRecord");

        Assert.assertTrue(src.contains(
                        "OpportunityRecord|AccountRecord result = check issueTriageAgent.run(string `Triage it.`);"),
                "run derives an anyOf schema from a union, so every declared response is reachable: " + src);
        Assert.assertFalse(src.contains("// TODO:"), src);
    }

    @Test
    public void testACatchAllResponseYieldsToTheSpecificOnesItWouldSubsume() {
        String src = generateForUnwrappedHttp("POST", "json", "OpportunityRecord", "AccountRecord");

        Assert.assertTrue(src.contains(
                        "OpportunityRecord|AccountRecord result = check issueTriageAgent.run(string `Triage it.`);"),
                "json matches any payload first, so binding it would make the records unreachable: " + src);
        Assert.assertTrue(src.contains("returns error|json|OpportunityRecord|AccountRecord"),
                "the declared contract still offers every response the user added: " + src);
    }

    @Test
    public void testACatchAllResponseIsStillBoundWhenItIsTheOnlyKind() {
        String src = generateForUnwrappedHttp("POST", "json", "json");

        Assert.assertTrue(src.contains("json result = check issueTriageAgent.run(string `Triage it.`);"),
                "with nothing specific to yield to, the catch-all is the answer type: " + src);
    }

    @Test
    public void testAnUnbindableSiblingLeavesTheUnionAlone() {
        String src = generateForUnwrappedHttp("POST", "OpportunityRecord", "xml");

        Assert.assertTrue(src.contains("OpportunityRecord result = check issueTriageAgent.run(string `Triage it.`);"),
                "one member run cannot bind would poison the whole union, so the first response wins: " + src);
        Assert.assertFalse(src.contains("|xml result"), "xml must not reach the binding: " + src);
    }

    @Test
    public void testStatusCodeWrappedSuccessResponsesAreNotUnioned() {
        String src = generateForShapedHttp("POST", ".", List.of(), "OpportunityRecord", "AccountRecord");

        Assert.assertTrue(src.contains("OpportunityRecord result = check issueTriageAgent.run(string `Triage it.`);"),
                "a status code record carries http:Status, an object, so run cannot bind it: " + src);
        Assert.assertTrue(src.contains("return {body: result};"), src);
    }

    @Test
    public void testShapedHttpEndpointDoesNotBindAnydata() {
        String src = generateForShapedHttp("POST", ".", List.of(), "anydata");

        Assert.assertTrue(src.contains("string result = check issueTriageAgent.run(string `Triage it.`);"),
                "anydata admits xml and byte[], so it is not a json subtype and fails at request time: " + src);
        Assert.assertTrue(src.contains("// TODO: map the agent's result to the declared response type"), src);
    }

    @Test
    public void testShapedHttpEndpointDeliversTheAnswerWhenTheDeclaredTypeAcceptsIt() {
        String src = generateForShapedHttp("POST", ".", List.of(), "string");

        Assert.assertTrue(src.contains("string result = check issueTriageAgent.run(string `Triage it.`);"), src);
        Assert.assertTrue(src.contains("return {body: result};"),
                "a string body takes the answer directly, wrapped by the status code record: " + src);
        Assert.assertFalse(src.contains("// TODO:"),
                "nothing is left for the user to map: " + src);
    }

    @Test
    public void testHttpEndpointHandlesTheAgentFailureInsteadOfReturningIt() {
        String src = generateForShapedHttp("POST", ".", List.of(), "string");

        Assert.assertTrue(src.contains("do {"), "the resource wraps its body like every other http resource: " + src);
        Assert.assertTrue(src.contains("} on fail error err {"), src);
        Assert.assertTrue(src.contains("return error(\"unhandled error\", err);"),
                "the agent's own error must not reach the caller verbatim: " + src);
    }

    @Test
    public void testShapedHttpEndpointPromptsWithPathParameters() {
        String src = generateForShapedHttp("GET", "accounts/[string owner]/[int year]",
                List.of(param("QUERY", "string", "region")), "string");

        Assert.assertTrue(src.contains("resource function get accounts/[string owner]/[int year]"),
                "the path the user typed should be the resource path: " + src);
        Assert.assertTrue(src.contains("owner:") && src.contains("${owner}"),
                "a path parameter is request data and belongs in the prompt: " + src);
        Assert.assertTrue(src.contains("year:") && src.contains("${year.toJsonString()}"),
                "a non-string path parameter is rendered as json: " + src);
        Assert.assertTrue(src.indexOf("owner:") < src.indexOf("region:"),
                "path parameters come first, matching their order in the signature: " + src);
    }

    @Test
    public void testShapedHttpEndpointReturnsTheBodyWhenTheStatusCodeWrapsIt() {
        String src = generateForShapedHttp("POST", "process", List.of(), "json");

        Assert.assertTrue(src.contains("json result = check issueTriageAgent.run(string `Triage it.`);"), src);
        Assert.assertTrue(src.contains("return {body: result};"),
                "a wrapped return puts the answer in the body field: " + src);
    }

    @Test
    public void testShapedHttpEndpointPromptsWithEveryDeclaredParameter() {
        String src = generateForShapedHttp("POST", ".",
                List.of(param("QUERY", "string", "region"), param("PAYLOAD", "json", "issue")), "string");

        Assert.assertTrue(src.contains("region:") && src.contains("${region}"),
                "a string parameter interpolates as itself: " + src);
        Assert.assertTrue(src.contains("issue:") && src.contains("${issue.toJsonString()}"),
                "a non-string parameter is rendered as json: " + src);
    }

    @Test
    public void testShapedHttpEndpointExcludesHeadersFromThePrompt() {
        String src = generateForShapedHttp("POST", ".",
                List.of(param("HEADER", "string", "authorization"), param("QUERY", "string", "region")), "string");

        Assert.assertTrue(src.contains("@http:Header string authorization"),
                "the header should still reach the resource signature: " + src);
        Assert.assertFalse(src.contains("${authorization}"),
                "a header is transport metadata, not agent input, and must not reach the prompt: " + src);
        Assert.assertTrue(src.contains("${region}"),
                "a query parameter should still reach the prompt: " + src);
    }

    @Test
    public void testHttpEndpointDoesNotOffloadTheAgentCall() {
        String src = generateForHttp("/issue-triage", "Triage this issue.", "\n");

        Assert.assertFalse(src.contains("start self."),
                "a caller is waiting for the answer, so the run must not be offloaded: " + src);
        Assert.assertTrue(src.contains("return"),
                "the agent's answer is the HTTP response: " + src);
    }

    @Test
    public void testHttpEndpointCarriesTheUsersInstructions() {
        String src = generateForHttp("/triage", "Suggest a priority label.", "\n");

        Assert.assertTrue(src.contains("issueTriageAgent.run(string `Suggest a priority label."),
                "the instructions should open the prompt: " + src);
        Assert.assertTrue(src.contains("Request payload:"),
                "a single carried parameter gets a heading rather than its own name: " + src);
    }

    @Test
    public void testHttpEndpointReusesTheProjectsExistingListener() {
        String src = generateForHttp("/triage", "Triage.", """
                import ballerina/http;

                listener http:Listener sharedListener = http:getDefaultListener();
                """);

        Assert.assertTrue(src.contains("service /triage on sharedListener"),
                "endpoints should share one listener: " + src);
        Assert.assertFalse(src.contains("listener http:Listener httpDefaultListener"),
                "a second listener would take a second port for no reason: " + src);
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
    public void testOnlyAnHttpEndpointIsDeletableOnItsOwn() {
        Assert.assertEquals(stamped("ballerina", "http", "agent-http").deletionScope(), "ENTRY_POINT",
                "an http resource returns the answer inline, so it owns no reply method to orphan");
        Assert.assertEquals(stamped("ballerinax", "telegram", "event").deletionScope(), "SERVICE",
                "a chat channel's handler offloads to a reply method and a client field in the same service");
        Assert.assertEquals(stamped("ballerinax", "kafka", "event").deletionScope(), "ENTRY_POINT_BODY",
                "an event handler is required by its service type, so removing the agent empties it instead");
        Assert.assertEquals(stamped("ballerinax", "trigger.github", "event").deletionScope(), "ENTRY_POINT_BODY",
                "one wired handler among required siblings must not take the whole service with it");
        Assert.assertNull(stamped("ballerina", "ftp", "file").deletionScope(),
                "a trigger that cannot call an agent carries no scope to act on");
    }

    private static TriggerBasicInfo stamped(String orgName, String moduleName, String type) {
        return AgentTriggerChannels.withAgentKind(new TriggerBasicInfo(0, moduleName, orgName, moduleName,
                moduleName, "1.0.0", type, moduleName, "", moduleName, ""));
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
