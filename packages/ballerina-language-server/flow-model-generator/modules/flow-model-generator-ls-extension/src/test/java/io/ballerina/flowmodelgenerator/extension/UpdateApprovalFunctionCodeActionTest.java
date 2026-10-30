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

import io.ballerina.compiler.syntax.tree.FunctionDefinitionNode;
import io.ballerina.compiler.syntax.tree.ModuleMemberDeclarationNode;
import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.flowmodelgenerator.extension.codeaction.UpdateApprovalFunctionCodeAction;
import io.ballerina.projects.Document;
import io.ballerina.tools.diagnostics.Diagnostic;
import io.ballerina.tools.diagnostics.DiagnosticFactory;
import io.ballerina.tools.diagnostics.DiagnosticInfo;
import io.ballerina.tools.diagnostics.DiagnosticSeverity;
import org.ballerinalang.langserver.codeaction.DiagBasedPositionDetailsImpl;
import org.ballerinalang.langserver.commons.CodeActionContext;
import org.ballerinalang.langserver.commons.codeaction.spi.DiagBasedPositionDetails;
import org.ballerinalang.langserver.contexts.ContextBuilder;
import org.ballerinalang.langserver.contexts.LanguageServerContextImpl;
import org.ballerinalang.langserver.workspace.BallerinaWorkspaceManager;
import org.eclipse.lsp4j.CodeAction;
import org.eclipse.lsp4j.CodeActionKind;
import org.eclipse.lsp4j.CodeActionParams;
import org.eclipse.lsp4j.Position;
import org.eclipse.lsp4j.Range;
import org.eclipse.lsp4j.TextDocumentIdentifier;
import org.eclipse.lsp4j.TextEdit;
import org.testng.Assert;
import org.testng.annotations.BeforeClass;
import org.testng.annotations.Test;

import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Tests the AI_111 quick fix, which rewrites an agent tool's approval function to take the tool's parameters.
 *
 * @since 2.0.0
 */
public class UpdateApprovalFunctionCodeActionTest {

    private static final Path PROJECT = Paths.get("src/test/resources/approval_quick_fix/project")
            .toAbsolutePath();
    private static final Path TOOLS = PROJECT.resolve("tools.bal");
    private static final Path APPROVAL = PROJECT.resolve("approval.bal");

    private final UpdateApprovalFunctionCodeAction codeAction = new UpdateApprovalFunctionCodeAction();
    private LanguageServerContextImpl serverContext;
    private BallerinaWorkspaceManager workspaceManager;

    @BeforeClass
    public void init() throws Exception {
        serverContext = new LanguageServerContextImpl();
        workspaceManager = new BallerinaWorkspaceManager(serverContext);
        workspaceManager.loadProject(TOOLS);
    }

    @Test
    public void testOfferedOnlyForAi111() {
        FunctionDefinitionNode tool = tool("search");
        Assert.assertTrue(codeAction.validate(diagnostic("AI_111", tool), positionDetails("AI_111", tool),
                context()));
        Assert.assertFalse(codeAction.validate(diagnostic("AI_110", tool), positionDetails("AI_110", tool),
                context()));
    }

    @Test
    public void testDefaultableParameterIsMirroredWithoutItsDefault() {
        FunctionDefinitionNode tool = tool("search");
        List<CodeAction> actions = codeAction.getCodeActions(diagnostic("AI_111", tool),
                positionDetails("AI_111", tool), context());

        Assert.assertEquals(actions.size(), 1);
        CodeAction action = actions.get(0);
        Assert.assertEquals(action.getTitle(), "Update 'searchApproval' to match 'search'");
        Assert.assertEquals(action.getKind(), CodeActionKind.QuickFix);
        Map<String, List<TextEdit>> changes = action.getEdit().getChanges();
        Assert.assertEquals(changes.keySet(), Set.of(APPROVAL.toUri().toString()));
        Assert.assertEquals(changes.get(APPROVAL.toUri().toString()).get(0).getNewText(),
                "string query, int 'limit");
    }

    @Test
    public void testSharedApprovalFunctionIsNotOffered() {
        FunctionDefinitionNode tool = tool("refundTool");
        Assert.assertEquals(codeAction.getCodeActions(diagnostic("AI_111", tool), positionDetails("AI_111", tool),
                context()), List.of());
    }

    private FunctionDefinitionNode tool(String name) {
        Document document = workspaceManager.document(TOOLS).orElseThrow();
        ModulePartNode root = document.syntaxTree().rootNode();
        for (ModuleMemberDeclarationNode member : root.members()) {
            if (member instanceof FunctionDefinitionNode function && function.functionName().text().equals(name)) {
                return function;
            }
        }
        throw new IllegalStateException("Tool not found: " + name);
    }

    private static Diagnostic diagnostic(String code, FunctionDefinitionNode tool) {
        return DiagnosticFactory.createDiagnostic(
                new DiagnosticInfo(code, "approval function doesn't match the tool", DiagnosticSeverity.ERROR),
                tool.location());
    }

    private static DiagBasedPositionDetails positionDetails(String code, FunctionDefinitionNode tool) {
        return DiagBasedPositionDetailsImpl.from(tool, null, diagnostic(code, tool));
    }

    private CodeActionContext context() {
        String uri = TOOLS.toUri().toString();
        CodeActionParams params = new CodeActionParams(new TextDocumentIdentifier(uri),
                new Range(new Position(0, 0), new Position(0, 0)),
                new org.eclipse.lsp4j.CodeActionContext(List.of()));
        return ContextBuilder.buildCodeActionContext(uri, workspaceManager, serverContext, params, () -> { });
    }
}
