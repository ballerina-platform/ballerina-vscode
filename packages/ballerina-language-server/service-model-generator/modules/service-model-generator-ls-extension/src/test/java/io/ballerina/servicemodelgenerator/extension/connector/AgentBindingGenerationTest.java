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

package io.ballerina.servicemodelgenerator.extension.connector;

import com.google.gson.Gson;
import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.compiler.syntax.tree.SyntaxTree;
import io.ballerina.modelgenerator.commons.trigger.models.TriggerUISchemaModel;
import io.ballerina.servicemodelgenerator.extension.model.ServiceInitModel;
import io.ballerina.servicemodelgenerator.extension.model.Value;
import io.ballerina.tools.text.TextDocuments;
import org.eclipse.lsp4j.TextEdit;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.util.List;
import java.util.Map;

/**
 * Covers the agent-binding path of {@link SchemaDrivenSourceGenerator}.
 *
 * @since 1.9.0
 */
public class AgentBindingGenerationTest {

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

    private String generateForAgent(String moduleName, String agentVarName, String existingSource) {
        ServiceInitModel form = initForm(moduleName);
        form.addProperty(AGENT_NAME_PROPERTY, new Value.ValueBuilder()
                .enabled(true).editable(false).value(agentVarName).build());
        Map<String, List<TextEdit>> edits = SchemaDrivenSourceGenerator.buildAddServiceEditsForTrigger(
                form, triggerModel(moduleName), rootOf(existingSource), "main.bal");
        StringBuilder source = new StringBuilder();
        edits.values().forEach(fileEdits -> fileEdits.forEach(edit -> source.append(edit.getNewText())));
        return source.toString();
    }

    @Test
    public void testWhatsAppHandlerIsWiredToTheAgent() {
        String src = generateForAgent("whatsapp.business", "mathTutorAgent", "\n");

        Assert.assertTrue(src.contains("_ = start replyToWhatsAppMessages(notification);"),
                "handler should offload rather than block the webhook: " + src);
        Assert.assertTrue(src.contains("function replyToWhatsAppMessages(whatsapp:Messages notification)"),
                "reply function should be emitted at module level: " + src);
        Assert.assertTrue(src.contains("mathTutorAgent.run(text, sessionId = \"whatsapp:\" + message.'from)"),
                "agent call should use the bound agent, its ballerina/ai operator and a namespaced session: " + src);
        Assert.assertTrue(src.contains("final whatsapp:Client whatsappClient = check new "),
                "the out-of-band reply client should be declared: " + src);
    }

    @Test
    public void testTelegramHandlerIsWiredToTheAgent() {
        String src = generateForAgent("telegram", "supportAgent", "\n");

        Assert.assertTrue(src.contains("_ = start replyToTelegramMessage(message);"),
                "handler should offload: " + src);
        Assert.assertTrue(src.contains("supportAgent.run(text, sessionId = \"telegram:\" "
                        + "+ message.chat.id.toString())"),
                "session should key on the conversation: " + src);
        Assert.assertTrue(src.contains("telegramClient->sendMessage(message.chat.id, replyText)"),
                "reply should go back out through the client: " + src);
    }

    @Test
    public void testWhatsAppProcessesABatchSerially() {
        String src = generateForAgent("whatsapp.business", "mathTutorAgent", "\n");

        Assert.assertEquals(src.split("start replyToWhatsAppMessages", -1).length - 1, 1,
                "exactly one strand should be spawned per notification: " + src);
        Assert.assertTrue(src.indexOf("foreach whatsapp:InboundMessage") > src.indexOf("function replyTo"),
                "the per-message loop belongs inside the reply function, not the handler: " + src);
    }

    @Test
    public void testNoAgentLeavesTheHandlerEmpty() {
        Map<String, List<TextEdit>> edits = SchemaDrivenSourceGenerator.buildAddServiceEditsForTrigger(
                initForm("whatsapp.business"), triggerModel("whatsapp.business"), rootOf("\n"), "main.bal");
        StringBuilder source = new StringBuilder();
        edits.values().forEach(fileEdits -> fileEdits.forEach(edit -> source.append(edit.getNewText())));
        String src = source.toString();

        Assert.assertFalse(src.contains("start "), "no agent bound -> no reply strand: " + src);
        Assert.assertFalse(src.contains("whatsappClient"), "no agent bound -> no reply client: " + src);
        Assert.assertFalse(src.contains(".run("), "no agent bound -> no agent call: " + src);
    }

    @Test
    public void testReplyFunctionNameAvoidsCollision() {
        String existing = """
                function replyToWhatsAppMessages() {
                }
                """;
        String src = generateForAgent("whatsapp.business", "mathTutorAgent", existing);

        Assert.assertFalse(src.contains("function replyToWhatsAppMessages("),
                "should not redeclare a name the module already binds: " + src);
        Assert.assertTrue(src.contains("start replyToWhatsAppMessages1(")
                        || src.contains("start replyToWhatsAppMessages2("),
                "handler must call the uniqued name it actually declared: " + src);
    }

    @Test
    public void testAgentOrgDecidesTheInvocationOperator() {
        ServiceInitModel form = initForm("telegram");
        form.addProperty(AGENT_NAME_PROPERTY, new Value.ValueBuilder()
                .enabled(true).editable(false).value("typedAgent").build());
        form.addProperty("agentOrg", new Value.ValueBuilder()
                .enabled(true).editable(false).value("ballerinax").build());
        Map<String, List<TextEdit>> edits = SchemaDrivenSourceGenerator.buildAddServiceEditsForTrigger(
                form, triggerModel("telegram"), rootOf("\n"), "main.bal");
        StringBuilder source = new StringBuilder();
        edits.values().forEach(fileEdits -> fileEdits.forEach(edit -> source.append(edit.getNewText())));

        Assert.assertTrue(source.toString().contains("typedAgent->run(text"),
                "a non-ballerina agent should be called remotely: " + source);
    }

    @Test
    public void testBindingImportsAreEmitted() {
        String src = generateForAgent("whatsapp.business", "mathTutorAgent", "\n");
        Assert.assertTrue(src.contains("import ballerina/log;"),
                "the binding's own imports should be added: " + src);
    }
}
