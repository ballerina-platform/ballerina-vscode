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
import io.ballerina.tools.text.TextDocuments;
import org.eclipse.lsp4j.TextEdit;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.util.List;
import java.util.Map;

/**
 * Unit test for the import emission of {@link SchemaDrivenSourceGenerator}: the connector import plus
 * the model's {@code importStatements} (additional {@code org/module} imports a listener param or
 * handler payload needs, e.g. {@code ballerina/http}).
 *
 * @since 1.9.0
 */
public class TriggerImportTest {

    private final Gson gson = new Gson();

    private ModulePartNode emptyRoot() {
        return (ModulePartNode) SyntaxTree.from(TextDocuments.from("\n")).rootNode();
    }

    private ModulePartNode rootOf(String source) {
        return (ModulePartNode) SyntaxTree.from(TextDocuments.from(source)).rootNode();
    }

    /** An init form + trigger model for a connector, parameterised by org/module and service type. */
    private ServiceInitModel initFor(String org, String module) {
        return gson.fromJson(("""
                { "moduleName":"%s","orgName":"%s","type":"t",
                  "properties":{"listenerVarName":{"enabled":true,"editable":true,"optional":false,
                    "advanced":false,"value":"evtListener",
                    "types":[{"fieldType":"IDENTIFIER","selected":true}],
                    "codedata":{"type":"LISTENER_VAR_NAME"}},
                    "listenOn":{"enabled":true,"editable":true,"optional":false,"advanced":false,
                      "value":"8090","types":[{"fieldType":"NUMBER","selected":true}],
                      "codedata":{"argType":"LISTENER_PARAM_REQUIRED","originalName":"listenOn",
                        "position":1}}}}""").formatted(module, org),
                ServiceInitModel.class);
    }

    private TriggerUISchemaModel triggerFor(String org, String module, String qualifiedServiceType,
                                    String qualifiedParamType) {
        return gson.fromJson(("""
                { "schemaVersion":"1.0","displayName":"T","description":"d","orgName":"%s",
                  "packageName":"%s","moduleName":"%s","version":"1.0.0","type":"t","icon":"i",
                  "serviceTypes":[{"name":"%s","enabled":true,"schemaFunctions":[],
                    "codedata":{"type":"SERVICE_TYPE_DESCRIPTOR"},
                    "functions":[{"name":"onEvent","kind":"REMOTE","enabled":true,"optional":false,
                      "qualifiers":["remote"],
                      "codedata":{"type":"FUNCTION","originalName":"onEvent"},
                      "parameters":[{"kind":"REQUIRED",
                        "type":{"value":"%s","types":[{"fieldType":"TYPE","selected":true}],
                          "enabled":true,"editable":false,"optional":true,"advanced":false},
                        "name":{"value":"event","types":[{"fieldType":"IDENTIFIER","selected":true}],
                          "enabled":true,"editable":false,"optional":false,"advanced":false},
                        "enabled":true,"editable":false,"optional":false,"advanced":false}],
                      "returnType":{"type":"error?","enabled":true,"hasError":true,"optional":true}}]}]}""")
                .formatted(org, module, module, qualifiedServiceType, qualifiedParamType),
                TriggerUISchemaModel.class);
    }

    private String generate(ModulePartNode root, String org, String module, String serviceType,
                            String paramType) {
        Map<String, List<TextEdit>> edits = SchemaDrivenSourceGenerator.buildAddServiceEditsForTrigger(
                initFor(org, module), triggerFor(org, module, serviceType, paramType), root, "svc.bal");
        return edits.get("svc.bal").stream().map(TextEdit::getNewText).reduce("", String::concat);
    }

    @Test
    public void testDottedModuleIsAliasedAndAllSelfReferencesRewritten() {
        // `ballerinax/trigger.twilio` would default to the prefix `twilio`, clashing with a base
        // `ballerinax/twilio` client already in the file. It must import under a generated alias and
        // reference EVERY self-module symbol through it: listener type, service descriptor, and the
        // handler's parameter type (which the model authored as `twilio:...`).
        String src = generate(rootOf("import ballerinax/twilio;\n"), "ballerinax", "trigger.twilio",
                "twilio:CallStatusService", "twilio:CallStatusEventWrapper");

        Assert.assertTrue(src.contains("import ballerinax/trigger.twilio as triggerTwilio;"),
                "dotted module must be imported under a safe alias: " + src);
        Assert.assertTrue(src.contains("listener triggerTwilio:Listener"),
                "listener type must use the alias: " + src);
        Assert.assertTrue(src.contains("service triggerTwilio:CallStatusService on "),
                "service descriptor must use the alias: " + src);
        Assert.assertTrue(src.contains("onEvent(triggerTwilio:CallStatusEventWrapper event)"),
                "handler param type baked into the model must be re-qualified onto the alias: " + src);
        Assert.assertFalse(src.contains("twilio:CallStatusEventWrapper event"),
                "no self-reference may keep the clashing bare prefix: " + src);
    }

    @Test
    public void testDottedModuleAliasIsNotTriggerSpecific() {
        // The alias is a camelCase join of the module's segments, not a "trigger" special case:
        // `ballerinax/solace.jms` (prefix `jms`) clashes with `ballerina/jms` and aliases to `solaceJms`.
        String src = generate(rootOf("import ballerina/jms;\n"), "ballerinax", "solace.jms",
                "jms:MessageService", "jms:Message");

        Assert.assertTrue(src.contains("import ballerinax/solace.jms as solaceJms;"),
                "camelCase join of all segments: " + src);
        Assert.assertTrue(src.contains("service solaceJms:MessageService on "), "descriptor: " + src);
        Assert.assertTrue(src.contains("onEvent(solaceJms:Message event)"), "param type: " + src);
    }

    @Test
    public void testAliasIsSuffixedWhenAlreadyClaimed() {
        // The generated alias itself can be taken by an unrelated import -> disambiguate numerically
        // rather than emitting a second import that re-clashes.
        String src = generate(rootOf("import ballerinax/twilio;\nimport foo/bar as triggerTwilio;\n"),
                "ballerinax", "trigger.twilio", "twilio:CallStatusService", "twilio:CallStatusEventWrapper");

        Assert.assertTrue(src.contains("import ballerinax/trigger.twilio as triggerTwilio2;"),
                "claimed alias must be suffixed: " + src);
        Assert.assertTrue(src.contains("service triggerTwilio2:CallStatusService on "),
                "references must follow the suffixed alias: " + src);
    }

    @Test
    public void testExistingImportAliasIsReused() {
        // Adding a second service for a module already imported must reuse that import's prefix (here a
        // hand-edited one) instead of minting a new alias the existing import would not match.
        String src = generate(rootOf("import ballerinax/trigger.twilio as tw;\n"),
                "ballerinax", "trigger.twilio", "twilio:CallStatusService", "twilio:CallStatusEventWrapper");

        Assert.assertFalse(src.contains("import ballerinax/trigger.twilio"),
                "module already imported -> no second import: " + src);
        Assert.assertTrue(src.contains("service tw:CallStatusService on "),
                "references must reuse the existing import's alias: " + src);
        Assert.assertTrue(src.contains("onEvent(tw:CallStatusEventWrapper event)"),
                "param types must reuse the existing import's alias too: " + src);
    }

    @Test
    public void testSingleSegmentModuleIsNotAliased() {
        // Regression guard: a plain module has no clash risk and must keep its unaliased import and
        // bare prefix, so existing connectors' output is unchanged.
        String src = generate(emptyRoot(), "ballerinax", "kafka", "kafka:Service", "kafka:Message");

        Assert.assertTrue(src.contains("import ballerinax/kafka;"), "plain import: " + src);
        Assert.assertFalse(src.contains(" as "), "no alias clause for a single-segment module: " + src);
        Assert.assertTrue(src.contains("service kafka:Service on "), "bare prefix retained: " + src);
    }

    @Test
    public void testConnectorAndAdditionalImportsEmitted() {
        String initJson = """
                { "moduleName":"kafka","orgName":"ballerinax","type":"kafka",
                  "properties":{"listener":{"enabled":true,"editable":true,"optional":false,"advanced":false,
                    "types":[{"fieldType":"CHOICE","selected":true}],"codedata":{"type":"LISTENER_CONFIG"},
                    "choices":[{"enabled":true,"editable":true,"optional":false,"advanced":false,
                      "properties":{"listenerVarName":{"enabled":true,"editable":true,"optional":false,
                        "advanced":false,"value":"kafkaListener",
                        "types":[{"fieldType":"IDENTIFIER","selected":true}],
                        "codedata":{"type":"LISTENER_VAR_NAME"}}}}]}}}""";
        String triggerJson = """
                { "schemaVersion":"1.0","displayName":"Kafka","description":"d","orgName":"ballerinax",
                  "packageName":"kafka","moduleName":"kafka","version":"1.0.0","type":"kafka","icon":"i",
                  "importStatements":["ballerina/http"],
                  "serviceTypes":[{"name":"Service","enabled":true,"functions":[],"schemaFunctions":[],
                    "codedata":{"type":"SERVICE_TYPE_DESCRIPTOR","moduleName":"kafka","originalName":"Service"}}]}""";
        ServiceInitModel init = gson.fromJson(initJson, ServiceInitModel.class);
        TriggerUISchemaModel trigger = gson.fromJson(triggerJson, TriggerUISchemaModel.class);

        Map<String, List<TextEdit>> edits = SchemaDrivenSourceGenerator.buildAddServiceEditsForTrigger(
                init, trigger, emptyRoot(), "svc.bal");
        String allText = edits.get("svc.bal").stream().map(TextEdit::getNewText).reduce("", String::concat);

        Assert.assertTrue(allText.contains("import ballerinax/kafka;"),
                "connector import should be emitted: " + allText);
        Assert.assertTrue(allText.contains("import ballerina/http;"),
                "additional import from importStatements should be emitted: " + allText);
    }
}
