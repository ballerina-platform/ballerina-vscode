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

package io.ballerina.modelgenerator.commons;

import io.ballerina.compiler.syntax.tree.FunctionDefinitionNode;
import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.compiler.syntax.tree.SyntaxTree;
import io.ballerina.modelgenerator.commons.ApprovalFunctionSync.Param;
import io.ballerina.tools.text.TextDocuments;
import org.eclipse.lsp4j.TextEdit;
import org.testng.Assert;
import org.testng.annotations.DataProvider;
import org.testng.annotations.Test;

import java.util.List;
import java.util.Optional;

/**
 * Syntax-level tests for keeping an agent tool's {@code requiresApproval} function in step with the tool.
 *
 * @since 2.0.0
 */
public class ApprovalFunctionSyncTest {

    private static final Param TO = new Param("string", "to");
    private static final Param SUBJECT = new Param("string", "subject");

    private static FunctionDefinitionNode function(String source) {
        ModulePartNode root = (ModulePartNode) SyntaxTree.from(TextDocuments.from(source)).rootNode();
        return (FunctionDefinitionNode) root.members().get(0);
    }

    @DataProvider(name = "annotations")
    public Object[][] annotations() {
        return new Object[][]{
                {"@ai:AgentTool {\n    requiresApproval: sendEmailApproval\n}", "sendEmailApproval"},
                {"@ai:AgentTool {requiresApproval: isHigh, auth: {clientId: \"x\"}}", "isHigh"},
                {"@ai:AgentTool {auth: {clientId: \"x\"}, requiresApproval: 'type}", "'type"},
                {"@ai:AgentTool {requiresApproval: true}", null},
                {"@ai:AgentTool {requiresApproval: false}", null},
                {"@ai:AgentTool {requiresApproval: rules:isHigh}", null},
                {"@ai:AgentTool", null},
                {"@ai:AgentTool {requiresApproval: isolated function (string to) returns boolean => true}", null},
                {"@display {label: \"x\"}", null},
                {null, null},
                // A commented-out field is trivia, never the real field
                {"@ai:AgentTool {\n    // requiresApproval: oldFn,\n    requiresApproval: newFn\n}", "newFn"},
                {"@ai:AgentTool {\n    requiresApproval: newFn // requiresApproval: oldFn\n}", "newFn"},
                {"@ai:AgentTool {\n    // requiresApproval: oldFn\n}", null},
                {"@display {label: \"x\"}\n@ai:AgentTool {requiresApproval: gate}", "gate"},
        };
    }

    @Test(dataProvider = "annotations")
    public void testApprovalFunctionName(String annotations, String expected) {
        Assert.assertEquals(ApprovalFunctionSync.approvalFunctionName(annotations).orElse(null), expected);
        if (annotations != null) {
            // The syntax-node reading of a parsed tool gives the same answer as the text overload
            FunctionDefinitionNode tool = function(annotations + "\nisolated function tool() returns string => \"\";");
            Assert.assertEquals(ApprovalFunctionSync.approvalFunctionName(tool.metadata()).orElse(null), expected);
        }
    }

    @DataProvider(name = "gates")
    public Object[][] gates() {
        return new Object[][]{
                {"@ai:AgentTool {requiresApproval: true}", true},
                {"@ai:AgentTool {requiresApproval: sendEmailApproval}", true},
                {"@ai:AgentTool {requiresApproval: rules:isHigh}", true},
                {"@ai:AgentTool {requiresApproval: false}", false},
                {"@ai:AgentTool {\n    // requiresApproval: true,\n    requiresApproval: false\n}", false},
                {"@ai:AgentTool {\n    // requiresApproval: true\n}", false},
                {"@ai:AgentTool", false},
                {"@display {label: \"x\"}", false},
        };
    }

    @Test(dataProvider = "gates")
    public void testRequiresApproval(String annotations, boolean expected) {
        FunctionDefinitionNode tool = function(annotations + "\nisolated function tool() returns string => \"\";");
        Assert.assertEquals(ApprovalFunctionSync.requiresApproval(tool.metadata()), expected);
    }

    private static ModulePartNode root(String source) {
        return (ModulePartNode) SyntaxTree.from(TextDocuments.from(source)).rootNode();
    }

    @Test
    public void testToolsUsingFindsModuleAndClassToolsAcrossDocuments() {
        ModulePartNode tools = root("""
                @ai:AgentTool {requiresApproval: sharedApproval}
                isolated function refundTool(string id) returns string => id;

                @ai:AgentTool {requiresApproval: true}
                isolated function pingTool() returns string => "";

                @ai:AgentTool
                isolated function plainTool() returns string => "";

                @ai:AgentTool {
                    // requiresApproval: sharedApproval,
                    requiresApproval: true
                }
                isolated function commentedTool() returns string => "";

                @ai:AgentTool {requiresApproval: rules:sharedApproval}
                isolated function qualifiedTool() returns string => "";

                isolated function sharedApproval(string id) returns boolean => true;
                """);
        ModulePartNode classTools = root("""
                isolated class Tools {
                    @ai:AgentTool {requiresApproval: sharedApproval}
                    isolated function cancelTool(string id) returns string => id;
                }
                """);

        Assert.assertEquals(ApprovalFunctionSync.toolsUsing(List.of(tools, classTools), "sharedApproval"),
                List.of("refundTool", "cancelTool"));
        Assert.assertEquals(ApprovalFunctionSync.toolsUsing(List.of(tools, classTools), "refundTool"), List.of());
        Assert.assertEquals(ApprovalFunctionSync.toolsUsing(List.of(), "sharedApproval"), List.of());
    }

    @Test
    public void testApprovalParamsDropLeadingAiContextOnly() {
        Param ctx = new Param("ai:Context", "ctx");
        Assert.assertEquals(ApprovalFunctionSync.approvalParams(List.of(ctx, TO)), List.of(TO));
        Assert.assertEquals(ApprovalFunctionSync.approvalParams(List.of(new Param("ai : Context", "c"), TO)),
                List.of(TO));
        Assert.assertEquals(ApprovalFunctionSync.approvalParams(List.of(TO, ctx)), List.of(TO, ctx));
        Assert.assertEquals(ApprovalFunctionSync.approvalParams(List.of()), List.of());
    }

    @Test
    public void testStubMatchesGeneratedApprovalFunction() {
        String stub = ApprovalFunctionSync.stubSource("sendEmailApproval", List.of(TO, SUBJECT));
        FunctionDefinitionNode parsed = function(stub);
        Assert.assertEquals(parsed.functionName().text(), "sendEmailApproval");
        Assert.assertEquals(ApprovalFunctionSync.params(parsed), List.of(TO, SUBJECT));
        Assert.assertTrue(stub.startsWith("isolated function sendEmailApproval(string to, string subject) "
                + "returns boolean {"), stub);
        Assert.assertTrue(stub.contains("return true;"), stub);
    }

    @Test
    public void testParamsReadDefaultableParametersWithoutTheDefault() {
        FunctionDefinitionNode tool = function(
                "isolated function search(string query, int 'limit = 10, string... tags) returns string => query;");
        // Rest parameters aren't read: the ai module doesn't allow them on agent tools.
        Assert.assertEquals(ApprovalFunctionSync.params(tool),
                List.of(new Param("string", "query"), new Param("int", "'limit")));
    }

    @Test
    public void testSignatureEditReplacesOnlyTheParameterList() {
        String source = "isolated function sendEmailApproval(string to, string subject) returns boolean {\n"
                + "    return !to.endsWith(\"@example.com\");\n"
                + "}\n";
        Optional<TextEdit> edit = ApprovalFunctionSync.signatureEdit(function(source),
                List.of(TO, SUBJECT, new Param("string[]", "cc")));

        Assert.assertTrue(edit.isPresent());
        Assert.assertEquals(edit.get().getNewText(), "string to, string subject, string[] cc");
        Assert.assertEquals(edit.get().getRange().getStart().getLine(), 0);
        Assert.assertEquals(edit.get().getRange().getStart().getCharacter(),
                "isolated function sendEmailApproval(".length());
        Assert.assertEquals(edit.get().getRange().getEnd().getCharacter(),
                "isolated function sendEmailApproval(string to, string subject".length());
    }

    @Test
    public void testSignatureEditHandlesReorderAndEmptyLists() {
        FunctionDefinitionNode approval = function("function f(string to, string subject) returns boolean => true;");
        Assert.assertEquals(ApprovalFunctionSync.signatureEdit(approval, List.of(SUBJECT, TO)).orElseThrow()
                .getNewText(), "string subject, string to");
        Assert.assertEquals(ApprovalFunctionSync.signatureEdit(approval, List.of()).orElseThrow().getNewText(), "");

        FunctionDefinitionNode empty = function("function g() returns boolean => true;");
        Assert.assertEquals(ApprovalFunctionSync.signatureEdit(empty, List.of(TO)).orElseThrow().getNewText(),
                "string to");
    }

    @Test
    public void testNoEditWhenParametersAlreadyMatch() {
        FunctionDefinitionNode approval =
                function("function f(string   to,\n    string subject) returns boolean => true;");
        Assert.assertTrue(ApprovalFunctionSync.signatureEdit(approval, List.of(TO, SUBJECT)).isEmpty());
    }
}
