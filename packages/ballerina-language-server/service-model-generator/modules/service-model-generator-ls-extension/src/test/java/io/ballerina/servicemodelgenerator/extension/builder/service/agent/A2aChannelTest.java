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

import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.compiler.syntax.tree.SyntaxTree;
import io.ballerina.servicemodelgenerator.extension.builder.service.AgentTriggerServiceBuilder;
import io.ballerina.servicemodelgenerator.extension.model.ServiceInitModel;
import io.ballerina.servicemodelgenerator.extension.model.Value;
import io.ballerina.servicemodelgenerator.extension.model.context.GetServiceInitModelContext;
import io.ballerina.tools.text.TextDocuments;
import org.eclipse.lsp4j.TextEdit;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.util.List;
import java.util.Map;

/**
 * Covers {@link A2aChannel} and {@link A2aAgentCard}.
 *
 * @since 1.9.0
 */
public class A2aChannelTest {

    private static final String AGENTS = """
            import ballerina/ai;

            final ai:Agent tripPlanner = check new (
                systemPrompt = {role: "Trip Planner",
                    instructions: string `Plan a short, one-day itinerary for the city the user names. Be brief.`},
                model = check ai:getDefaultModelProvider(),
                tools = [weatherAgentTool]
            );

            # Delegates a query to weatherAgent.
            # + query - The request to send.
            @ai:AgentTool
            isolated function weatherAgentTool(string query) returns string|error {
                return "ok";
            }
            """;

    private final A2aChannel channel = new A2aChannel();

    private GetServiceInitModelContext context(String agent, String agentOrg, String agentKind) {
        return new GetServiceInitModelContext("ballerina", "a2a", "a2a", "0.1.0", null, null, null, false,
                agent, agentOrg, agentKind);
    }

    private ServiceInitModel form(String agent, List<String> sources) {
        ServiceInitModel model = channel.buildInitModel(context(agent, "ballerina", null), sources);
        model.addProperty("agentName", new Value.ValueBuilder().enabled(true).editable(false).setHidden(true)
                .value(agent).build());
        return model;
    }

    private static void set(ServiceInitModel model, String key, String value) {
        model.getProperties().get(key).setValue(value);
    }

    private static String render(Map<String, List<TextEdit>> edits) {
        StringBuilder source = new StringBuilder();
        edits.values().forEach(fileEdits -> fileEdits.forEach(edit -> source.append(edit.getNewText())));
        return source.toString().replace("\r\n", "\n");
    }

    private String generate(ServiceInitModel model, String existing) {
        ModulePartNode root = (ModulePartNode) SyntaxTree.from(TextDocuments.from(existing)).rootNode();
        return render(AgentTriggerServiceBuilder.buildEdits(model, null, channel, root, "main.bal"));
    }

    @Test
    public void testTheFormIsMadeOfTheFieldsOtherTriggersUse() {
        Map<String, Value> properties = form("tripPlanner", List.of(AGENTS)).getProperties();
        Assert.assertEquals(properties.get(A2aChannel.STREAMING).getTypes().getFirst().fieldType(),
                Value.FieldType.FLAG);
        Assert.assertEquals(properties.get(A2aChannel.PUSH_NOTIFICATIONS).getTypes().getFirst().fieldType(),
                Value.FieldType.FLAG);
        Assert.assertEquals(properties.get(A2aChannel.PORT).getTypes().getFirst().fieldType(),
                Value.FieldType.NUMBER);
        Value skills = properties.get(A2aChannel.SKILLS);
        Assert.assertEquals(skills.getTypes().getFirst().fieldType(), Value.FieldType.TEXT_SET);
        Assert.assertTrue(skills.isEditable());
        Assert.assertFalse(skills.isHidden());
        for (String key : List.of(A2aChannel.PROVIDER, A2aChannel.PROVIDER_URL, A2aChannel.PROVIDER_EMAIL,
                A2aChannel.DOCUMENTATION_URL, A2aChannel.ICON_URL, A2aChannel.PUBLIC_URL)) {
            Assert.assertTrue(properties.get(key).isAdvanced(), key + " is an advanced option");
        }
        Assert.assertFalse(properties.get(A2aChannel.CARD_NAME).isAdvanced());
        Assert.assertFalse(properties.get(A2aChannel.PORT).isAdvanced());
    }

    @Test
    public void testTheSkillsStartEmptyBecauseTheyCannotBeReadFromTheAgent() {
        Value skills = form("tripPlanner", List.of(AGENTS)).getProperties().get(A2aChannel.SKILLS);
        Assert.assertTrue(skills.getValuesAsObjects().isEmpty());
        String code = generate(form("tripPlanner", List.of(AGENTS)), "import ballerina/ai;\n");
        Assert.assertTrue(code.contains("skills: []"), code);
    }

    @Test
    public void testTheSkillsTheUserWroteGoOnTheCard() {
        ServiceInitModel model = form("tripPlanner", List.of(AGENTS));
        model.getProperties().get(A2aChannel.SKILLS).setValues(List.of(
                "Trip planning: Plans a one-day itinerary, with meals, for a city you name",
                "  ",
                "Weather check"));
        String code = generate(model, "import ballerina/ai;\n");
        Assert.assertTrue(code.contains("id: \"trip-planning\""), code);
        Assert.assertTrue(code.contains("name: \"Trip planning\""), code);
        Assert.assertTrue(code.contains(
                "description: \"Plans a one-day itinerary, with meals, for a city you name\""), code);
        Assert.assertTrue(code.contains("id: \"weather-check\""), code);
        Assert.assertEquals(code.split("id: \"").length - 1, 2, "the blank entry is skipped: " + code);
    }

    @Test
    public void testTheSkillsAreReadFromTheExpressionsTheFormKeeps() {
        List<A2aAgentCard.Skill> skills = A2aAgentCard.skillsFromLines(List.of(
                "string `Weekend planning: Plans a weekend`",
                "`Weather: Forecasts for a city`",
                "\"Greeting: Says \\\"hi\\\"\"",
                "string `Quotes: Handles ${\"`\"}ticks${\"`\"}`"));
        Assert.assertEquals(skills.size(), 4);
        Assert.assertEquals(skills.get(0).name(), "Weekend planning");
        Assert.assertEquals(skills.get(0).description(), "Plans a weekend");
        Assert.assertEquals(skills.get(1).name(), "Weather");
        Assert.assertEquals(skills.get(2).description(), "Says \"hi\"");
        Assert.assertEquals(skills.get(3).description(), "Handles `ticks`");
    }

    @Test
    public void testASkillLineIsNameThenDescriptionAtTheFirstColon() {
        List<A2aAgentCard.Skill> skills = A2aAgentCard.skillsFromLines(List.of(
                "Currency: converts: USD to EUR, at today's rate", "Greeting", ": no name", ""));
        Assert.assertEquals(skills.size(), 2);
        Assert.assertEquals(skills.get(0).name(), "Currency");
        Assert.assertEquals(skills.get(0).description(), "converts: USD to EUR, at today's rate");
        Assert.assertEquals(skills.get(1).name(), "Greeting");
        Assert.assertEquals(skills.get(1).description(), "Greeting");
    }

    @Test
    public void testInputAndOutputModesAreDropdownsOfWhatTheAgentSupports() {
        Map<String, Value> properties = form("tripPlanner", List.of(AGENTS)).getProperties();
        for (String key : List.of(A2aChannel.INPUT_MODES, A2aChannel.OUTPUT_MODES)) {
            Value modes = properties.get(key);
            Assert.assertTrue(modes.isEditable(), key);
            Assert.assertFalse(modes.isHidden(), key);
            Assert.assertEquals(modes.getTypes().getFirst().fieldType(), Value.FieldType.SINGLE_SELECT);
            Assert.assertEquals(modes.getItems(), List.of("text"));
            Assert.assertEquals(modes.getValue(), "text");
        }
        String code = generate(form("tripPlanner", List.of(AGENTS)), "import ballerina/ai;\n");
        Assert.assertTrue(code.contains("defaultInputModes: [\"text\"]"), code);
        Assert.assertTrue(code.contains("defaultOutputModes: [\"text\"]"), code);
    }

    @Test
    public void testTheContactEmailGoesWithTheProviderOnTheCard() {
        ServiceInitModel model = form("tripPlanner", List.of(AGENTS));
        set(model, A2aChannel.PROVIDER, "Example Co");
        set(model, A2aChannel.PROVIDER_URL, "https://example.com");
        set(model, A2aChannel.PROVIDER_EMAIL, "agents@example.com");
        String code = generate(model, "import ballerina/ai;\n");
        Assert.assertTrue(code.contains(
                "provider: {organization: \"Example Co\", url: \"https://example.com\", "
                        + "contactEmail: \"agents@example.com\"},"), code);
    }

    @Test
    public void testTheCardIsDerivedFromTheAgent() {
        A2aAgentCard.Defaults defaults = A2aAgentCard.derive("tripPlanner", List.of(AGENTS));
        Assert.assertEquals(defaults.name(), "Trip Planner Agent");
        Assert.assertEquals(defaults.description(), "Plan a short, one-day itinerary for the city the user names.");
    }

    @Test
    public void testAnAgentWeCannotReadStillGetsACard() {
        A2aAgentCard.Defaults defaults = A2aAgentCard.derive("assistantAgent", List.of());
        Assert.assertEquals(defaults.name(), "Assistant Agent");
    }

    @Test
    public void testThePortSkipsPortsTheProjectUses() {
        Assert.assertEquals(A2aAgentCard.freePort(List.of()), 9096);
        Assert.assertEquals(A2aAgentCard.freePort(
                List.of("listener http:Listener l = new (9096);", "configurable int p = 9097;")), 9098);
    }

    @Test
    public void testTheGeneratedServerHasTheVerifiedShape() {
        String code = generate(form("tripPlanner", List.of(AGENTS)), "import ballerina/ai;\n");
        Assert.assertTrue(code.contains("import ballerina/a2a;"), code);
        Assert.assertTrue(code.contains("configurable int tripPlannerA2aPort = 9096;"), code);
        Assert.assertTrue(code.contains(
                "listener a2a:RestListener tripPlannerA2aListener = new (tripPlannerA2aPort);"), code);
        Assert.assertTrue(code.contains("isolated class TripPlannerA2aExecutor {"), code);
        Assert.assertFalse(code.contains("A2aRun"), "no separate run function: " + code);
        Assert.assertTrue(code.contains("check updater.working();"), code);
        Assert.assertTrue(code.contains("tripPlanner.run(query, sessionId = updater.getContextId())"), code);
        Assert.assertTrue(code.contains("check updater.addArtifact([{text: reply}]);"), code);
        Assert.assertTrue(code.contains("check updater.complete();"), code);
        Assert.assertTrue(code.contains("final a2a:InMemoryTaskStore tripPlannerA2aTaskStore = new;"), code);
        Assert.assertTrue(code.contains(
                "new (new TripPlannerA2aExecutor(), taskStore = tripPlannerA2aTaskStore);"), code);
        Assert.assertTrue(code.contains("@a2a:ServiceConfig {"), code);
        Assert.assertTrue(code.contains("name: \"Trip Planner Agent\""), code);
        Assert.assertTrue(code.contains("isolated service on tripPlannerA2aListener {"), code);
        Assert.assertTrue(code.contains("post message\\:send("), code);
        Assert.assertTrue(code.contains("post message\\:stream("), code);
        Assert.assertTrue(code.contains("get tasks/[string id]/subscribe("), code);
        Assert.assertTrue(code.contains("handleCancelTask"), code);
    }

    @Test
    public void testEachResourceCallsTheHandlerThenReturnsItsResult() {
        String code = generate(form("tripPlanner", List.of(AGENTS)), "import ballerina/ai;\n");
        Assert.assertTrue(code.contains("var response = self.handler.handleSendMessage(context, request);\n"
                + "        return response;"), code);
        Assert.assertEquals(code.split("var response = self\\.handler\\.handle").length - 1,
                code.split("return response;").length - 1, code);
        Assert.assertFalse(code.contains("return self.handler."), code);
    }

    @Test
    public void testTheGeneratedCodeParsesCleanly() {
        String code = generate(form("tripPlanner", List.of(AGENTS)), "import ballerina/ai;\n");
        SyntaxTree tree = SyntaxTree.from(TextDocuments.from("import ballerina/ai;\n" + code));
        Assert.assertFalse(tree.hasDiagnostics(), code);
    }

    @Test
    public void testStreamingOffLeavesOutTheStreamingResources() {
        ServiceInitModel model = form("tripPlanner", List.of(AGENTS));
        set(model, A2aChannel.STREAMING, "false");
        String code = generate(model, "import ballerina/ai;\n");
        Assert.assertTrue(code.contains("post message\\:send("), code);
        Assert.assertFalse(code.contains("message\\:stream"), code);
        Assert.assertFalse(code.contains("/subscribe"), code);
    }

    @Test
    public void testPushNotificationsAddTheWholeGroupOfFourResources() {
        String code = generate(form("tripPlanner", List.of(AGENTS)), "import ballerina/ai;\n");
        Assert.assertTrue(code.contains("post tasks/[string id]/pushNotificationConfigs("), code);
        Assert.assertTrue(code.contains("get tasks/[string id]/pushNotificationConfigs/[string configId]("), code);
        Assert.assertTrue(code.contains("get tasks/[string id]/pushNotificationConfigs("), code);
        Assert.assertTrue(code.contains("delete tasks/[string id]/pushNotificationConfigs/[string configId]("), code);
        Assert.assertEquals(code.split("pushNotificationConfigs", -1).length - 1, 4, code);
    }

    @Test
    public void testPushNotificationsOffLeavesOutAllFour() {
        ServiceInitModel model = form("tripPlanner", List.of(AGENTS));
        set(model, A2aChannel.PUSH_NOTIFICATIONS, "false");
        String code = generate(model, "import ballerina/ai;\n");
        Assert.assertFalse(code.contains("pushNotificationConfigs"), code);
        Assert.assertTrue(code.contains("get tasks/[string id]("), code);
    }

    @Test
    public void testTheGeneratedCodeWithPushStillParsesCleanly() {
        String code = generate(form("tripPlanner", List.of(AGENTS)), "import ballerina/ai;\n");
        SyntaxTree tree = SyntaxTree.from(TextDocuments.from("import ballerina/ai;\n" + code));
        Assert.assertFalse(tree.hasDiagnostics(), code);
    }

    @Test
    public void testInputModesDefaultToTextAndFollowTheForm() {
        ServiceInitModel model = form("tripPlanner", List.of(AGENTS));
        String plain = generate(model, "import ballerina/ai;\n");
        Assert.assertTrue(plain.contains("defaultInputModes: [\"text\"]"), plain);
        set(model, A2aChannel.INPUT_MODES, "text, application/json");
        String both = generate(model, "import ballerina/ai;\n");
        Assert.assertTrue(both.contains("defaultInputModes: [\"text\", \"application/json\"]"), both);
    }

    @Test
    public void testProviderAndLinksAppearOnTheCardOnlyWhenGiven() {
        ServiceInitModel model = form("tripPlanner", List.of(AGENTS));
        String plain = generate(model, "import ballerina/ai;\n");
        Assert.assertFalse(plain.contains("provider:"), plain);
        Assert.assertFalse(plain.contains("documentationUrl"), plain);
        set(model, A2aChannel.PROVIDER, "Example Co");
        set(model, A2aChannel.PROVIDER_URL, "https://example.com");
        set(model, A2aChannel.DOCUMENTATION_URL, "https://example.com/docs");
        set(model, A2aChannel.ICON_URL, "https://example.com/icon.png");
        String code = generate(model, "import ballerina/ai;\n");
        Assert.assertTrue(code.contains(
                "provider: {organization: \"Example Co\", url: \"https://example.com\"}"), code);
        Assert.assertTrue(code.contains("documentationUrl: \"https://example.com/docs\""), code);
        Assert.assertTrue(code.contains("iconUrl: \"https://example.com/icon.png\""), code);
    }

    @Test
    public void testThePublicUrlGoesOnTheListener() {
        ServiceInitModel model = form("tripPlanner", List.of(AGENTS));
        set(model, A2aChannel.PUBLIC_URL, "https://agents.example.com/trip");
        String code = generate(model, "import ballerina/ai;\n");
        Assert.assertTrue(code.contains(
                "new (tripPlannerA2aPort, publicUrl = \"https://agents.example.com/trip\");"), code);
    }

    @Test
    public void testQuotesAndBackslashesInTheCardAreEscaped() {
        ServiceInitModel model = form("tripPlanner", List.of(AGENTS));
        set(model, A2aChannel.CARD_NAME, "Say \"hi\" \\ bye");
        String code = generate(model, "import ballerina/ai;\n");
        Assert.assertTrue(code.contains("name: \"Say \\\"hi\\\" \\\\ bye\""), code);
    }

    @Test
    public void testPublishedAgentsListenerIsReusedNotDeclaredTwice() {
        String existing = "import ballerina/a2a;\nlistener a2a:RestListener tripPlannerA2aListener = new (9096);\n";
        String code = generate(form("tripPlanner", List.of(AGENTS)), existing);
        Assert.assertFalse(code.contains("listener a2a:RestListener"), code);
    }

    @Test
    public void testDurableAndLibraryAgentsAreRefused() {
        ServiceInitModel durable = channel.buildInitModel(context("flow", "ballerina", "durable"), List.of());
        Assert.assertTrue(durable.getProperties().containsKey(A2aChannel.UNSUPPORTED));
        ServiceInitModel library = channel.buildInitModel(context("shared", "acme", null), List.of());
        Assert.assertTrue(library.getProperties().containsKey(A2aChannel.UNSUPPORTED));
        ServiceInitModel plain = channel.buildInitModel(context("tripPlanner", "ballerina", null), List.of(AGENTS));
        Assert.assertFalse(plain.getProperties().containsKey(A2aChannel.UNSUPPORTED));
    }

    @Test
    public void testAnAgentAlreadyPublishedOverA2aIsRefusedASecondTime() {
        String published = generate(form("tripPlanner", List.of(AGENTS)), "import ballerina/ai;\n");
        ServiceInitModel again = channel.buildInitModel(context("tripPlanner", "ballerina", null),
                List.of(AGENTS, published));
        Assert.assertTrue(again.getProperties().containsKey(A2aChannel.UNSUPPORTED));
        Assert.assertTrue(again.getProperties().get(A2aChannel.UNSUPPORTED).getValue().contains("already attached"));
    }

    @Test
    public void testAddingTheTriggerAgainAfterADeleteReusesWhatWasLeftBehind() {
        String published = generate(form("tripPlanner", List.of(AGENTS)), "import ballerina/ai;\n");
        String leftover = published.substring(0, published.indexOf("@a2a:ServiceConfig"))
                .replaceAll("(?m)^listener .*\\n", "");
        Assert.assertTrue(leftover.contains("configurable int tripPlannerA2aPort"), leftover);
        Assert.assertTrue(leftover.contains("isolated class TripPlannerA2aExecutor"), leftover);

        ServiceInitModel again = form("tripPlanner", List.of(AGENTS, leftover));
        Assert.assertFalse(again.getProperties().containsKey(A2aChannel.UNSUPPORTED));
        Assert.assertEquals(again.getProperties().get(A2aChannel.EXISTING_EXECUTOR).getValue(), "true");
        Assert.assertEquals(again.getProperties().get(A2aChannel.EXISTING_PORT).getValue(), "true");

        String code = generate(again, "import ballerina/ai;\n" + leftover);
        Assert.assertFalse(code.contains("configurable int tripPlannerA2aPort"), code);
        Assert.assertFalse(code.contains("isolated class TripPlannerA2aExecutor"), code);
        Assert.assertFalse(code.contains("final a2a:InMemoryTaskStore"), "the store was left behind too: " + code);
        Assert.assertTrue(code.contains("listener a2a:RestListener tripPlannerA2aListener"), code);
        Assert.assertTrue(code.contains("isolated service on tripPlannerA2aListener"), code);
        SyntaxTree tree = SyntaxTree.from(TextDocuments.from("import ballerina/ai;\n" + leftover + code));
        Assert.assertFalse(tree.hasDiagnostics(), code);
    }

    @Test
    public void testAFreshAgentGetsEverythingGenerated() {
        ServiceInitModel model = form("tripPlanner", List.of(AGENTS));
        Assert.assertEquals(model.getProperties().get(A2aChannel.EXISTING_EXECUTOR).getValue(), "false");
        Assert.assertEquals(model.getProperties().get(A2aChannel.EXISTING_PORT).getValue(), "false");
    }

    @Test
    public void testTheChannelIsRegisteredAndListedAsA2a() {
        Assert.assertTrue(AgentTriggerChannels.forModule("ballerina", "a2a").isPresent());
        Assert.assertEquals(AgentTriggerChannels.kindOf("ballerina", "a2a", "agent-a2a"), "A2A");
    }
}
