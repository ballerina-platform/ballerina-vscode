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

package io.ballerina.flowmodelgenerator.extension;

import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.syntax.tree.FunctionDefinitionNode;
import io.ballerina.compiler.syntax.tree.ModuleMemberDeclarationNode;
import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.modelgenerator.commons.ApprovalFunctionSync;
import io.ballerina.modelgenerator.commons.ApprovalFunctionSync.Param;
import io.ballerina.projects.Document;
import io.ballerina.tools.text.LineRange;
import org.ballerinalang.langserver.contexts.LanguageServerContextImpl;
import org.ballerinalang.langserver.workspace.BallerinaWorkspaceManager;
import org.eclipse.lsp4j.TextEdit;
import org.testng.Assert;
import org.testng.annotations.BeforeClass;
import org.testng.annotations.Test;

import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * Workspace-level tests for keeping an agent tool's {@code requiresApproval} function in step with the tool's
 * parameters: cross-file edits, shared functions and generation. Syntax-level cases are in model-generator-commons.
 *
 * @since 2.0.0
 */
public class ApprovalFunctionSyncTest {

    private static final Path PROJECT = Paths.get("src/test/resources/approval_function_sync/project")
            .toAbsolutePath();
    private static final Path TOOLS = PROJECT.resolve("tools.bal");
    private static final Path APPROVAL = PROJECT.resolve("approval.bal");
    private static final Param TO = new Param("string", "to");
    private static final Param SUBJECT = new Param("string", "subject");

    private BallerinaWorkspaceManager workspaceManager;

    @BeforeClass
    public void init() throws Exception {
        workspaceManager = new BallerinaWorkspaceManager(new LanguageServerContextImpl());
        workspaceManager.loadProject(TOOLS);
    }

    @Test
    public void testAddedParameterRewritesApprovalFunctionInItsOwnFile() {
        Map<Path, List<TextEdit>> edits = sync("sendEmailApproval", "sendEmailTool",
                List.of(TO, SUBJECT, new Param("string[]", "cc")), false);

        Assert.assertEquals(edits.keySet(), Set.of(APPROVAL));
        TextEdit edit = edits.get(APPROVAL).get(0);
        Assert.assertEquals(edit.getNewText(), "string to, string subject, string[] cc");
        // Only the parameter list is replaced; the name, return type and body are kept.
        Assert.assertEquals(edit.getRange().getStart().getLine(), 0);
        Assert.assertEquals(edit.getRange().getStart().getCharacter(), "isolated function sendEmailApproval(".length());
        Assert.assertEquals(edit.getRange().getEnd().getCharacter(),
                "isolated function sendEmailApproval(string to, string subject".length());
    }

    @Test
    public void testReorderedParametersRewriteApprovalFunction() {
        Map<Path, List<TextEdit>> edits = sync("sendEmailApproval", "sendEmailTool", List.of(SUBJECT, TO), false);
        Assert.assertEquals(edits.get(APPROVAL).get(0).getNewText(), "string subject, string to");
    }

    @Test
    public void testLeadingAiContextIsNotMirrored() {
        Map<Path, List<TextEdit>> edits = sync("sendEmailApproval", "sendEmailTool",
                List.of(new Param("ai:Context", "ctx"), TO, SUBJECT), false);
        Assert.assertTrue(edits.isEmpty(), "Matching parameters must produce no edit: " + edits);
    }

    @Test
    public void testSharedApprovalFunctionIsLeftAlone() {
        Map<Path, List<TextEdit>> edits = sync("sharedApproval", "refundTool",
                List.of(new Param("string", "orderId"), new Param("decimal", "amount")), true);
        Assert.assertTrue(edits.isEmpty(), "A function used by another tool must not be rewritten: " + edits);
    }

    @Test
    public void testMissingApprovalFunctionIsGenerated() {
        Map<Path, List<TextEdit>> edits = sync("newApproval", "sendEmailTool", List.of(TO, SUBJECT), true);

        Assert.assertEquals(edits.keySet(), Set.of(TOOLS));
        String text = edits.get(TOOLS).get(0).getNewText();
        Assert.assertTrue(text.contains("isolated function newApproval(string to, string subject) returns boolean {"),
                text);
        Assert.assertTrue(text.contains("return true;"), text);
    }

    @Test
    public void testMissingApprovalFunctionIsNotGeneratedUnlessAsked() {
        Assert.assertTrue(sync("newApproval", "sendEmailTool", List.of(TO), false).isEmpty());
    }

    @Test
    public void testApprovalReferencesAloneDoNotCountAsOtherUses() {
        Assert.assertFalse(referencedOutsideApprovals("sendEmailApproval", 1));
        Assert.assertFalse(referencedOutsideApprovals("sharedApproval", 2));
    }

    @Test
    public void testOtherReferencesCount() {
        // auditCheck calls calledApproval; no tool annotation names it.
        Assert.assertTrue(referencedOutsideApprovals("calledApproval", 0));
        // Once its tool is gone, the remaining annotation reference is something else using it.
        Assert.assertTrue(referencedOutsideApprovals("sendEmailApproval", 0));
    }

    private boolean referencedOutsideApprovals(String function, int approvalUses) {
        Optional<Document> document = workspaceManager.document(APPROVAL);
        Optional<SemanticModel> semanticModel = workspaceManager.semanticModel(APPROVAL);
        Assert.assertTrue(document.isPresent() && semanticModel.isPresent());
        ModulePartNode root = document.get().syntaxTree().rootNode();
        for (ModuleMemberDeclarationNode member : root.members()) {
            if (member instanceof FunctionDefinitionNode node && node.functionName().text().equals(function)) {
                return ApprovalFunctionSync.referencedOutsideApprovals(semanticModel.get(), node, approvalUses);
            }
        }
        Assert.fail("No function named " + function);
        return false;
    }

    private Map<Path, List<TextEdit>> sync(String approvalFunction, String tool, List<Param> params,
                                           boolean generateIfMissing) {
        return ApprovalFunctionSync.sync(workspaceManager, TOOLS, approvalFunction, params, toolRange(tool),
                generateIfMissing);
    }

    private LineRange toolRange(String tool) {
        Optional<Document> document = workspaceManager.document(TOOLS);
        Assert.assertTrue(document.isPresent());
        ModulePartNode root = document.get().syntaxTree().rootNode();
        for (ModuleMemberDeclarationNode member : root.members()) {
            if (member instanceof FunctionDefinitionNode function && function.functionName().text().equals(tool)) {
                return function.lineRange();
            }
        }
        Assert.fail("No tool named " + tool);
        return null;
    }
}
