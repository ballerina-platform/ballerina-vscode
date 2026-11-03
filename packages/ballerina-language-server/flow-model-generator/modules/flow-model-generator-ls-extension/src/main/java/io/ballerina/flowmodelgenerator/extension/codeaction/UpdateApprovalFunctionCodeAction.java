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

package io.ballerina.flowmodelgenerator.extension.codeaction;

import io.ballerina.compiler.syntax.tree.FunctionDefinitionNode;
import io.ballerina.compiler.syntax.tree.Node;
import io.ballerina.compiler.syntax.tree.SyntaxKind;
import io.ballerina.modelgenerator.commons.ApprovalFunctionSync;
import io.ballerina.tools.diagnostics.Diagnostic;
import org.ballerinalang.annotation.JavaSPIService;
import org.ballerinalang.langserver.commons.CodeActionContext;
import org.ballerinalang.langserver.commons.codeaction.spi.DiagBasedPositionDetails;
import org.ballerinalang.langserver.commons.codeaction.spi.DiagnosticBasedCodeActionProvider;
import org.eclipse.lsp4j.CodeAction;
import org.eclipse.lsp4j.CodeActionKind;
import org.eclipse.lsp4j.TextEdit;
import org.eclipse.lsp4j.WorkspaceEdit;

import java.nio.file.Path;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Quick fix for the {@code ai} compiler plugin's AI_111 error, raised when an {@code @ai:AgentTool}
 * {@code requiresApproval} function's parameters don't match the tool's. Rewrites the approval function's parameter
 * list to match the tool, unless that function is also referenced elsewhere.
 *
 * @since 2.0.0
 */
@JavaSPIService("org.ballerinalang.langserver.commons.codeaction.spi.LSCodeActionProvider")
public class UpdateApprovalFunctionCodeAction implements DiagnosticBasedCodeActionProvider {

    private static final String NAME = "Update approval function to match tool";
    private static final String DIAGNOSTIC_CODE = "AI_111";

    @Override
    public boolean validate(Diagnostic diagnostic, DiagBasedPositionDetails positionDetails,
                            CodeActionContext context) {
        return DIAGNOSTIC_CODE.equals(diagnostic.diagnosticInfo().code());
    }

    @Override
    public List<CodeAction> getCodeActions(Diagnostic diagnostic, DiagBasedPositionDetails positionDetails,
                                           CodeActionContext context) {
        Optional<FunctionDefinitionNode> tool = enclosingFunction(positionDetails.matchedNode());
        if (tool.isEmpty()) {
            return List.of();
        }
        Optional<String> approvalFunction = ApprovalFunctionSync.approvalFunctionName(tool.get().metadata());
        if (approvalFunction.isEmpty()) {
            return List.of();
        }
        Map<Path, List<TextEdit>> edits = ApprovalFunctionSync.sync(context.workspace(), context.filePath(),
                approvalFunction.get(), ApprovalFunctionSync.params(tool.get()), tool.get().lineRange(), false);
        if (edits.isEmpty()) {
            return List.of();
        }
        Map<String, List<TextEdit>> changes = new HashMap<>();
        edits.forEach((path, fileEdits) -> changes.put(path.toUri().toString(), fileEdits));

        String toolName = tool.get().functionName().text().trim();
        CodeAction codeAction = new CodeAction(
                String.format("Update '%s' to match '%s'", approvalFunction.get(), toolName));
        codeAction.setKind(CodeActionKind.QuickFix);
        codeAction.setEdit(new WorkspaceEdit(changes));
        return List.of(codeAction);
    }

    private static Optional<FunctionDefinitionNode> enclosingFunction(Node node) {
        Node current = node;
        while (current != null) {
            if (current.kind() == SyntaxKind.FUNCTION_DEFINITION
                    || current.kind() == SyntaxKind.OBJECT_METHOD_DEFINITION) {
                return Optional.of((FunctionDefinitionNode) current);
            }
            current = current.parent();
        }
        return Optional.empty();
    }

    @Override
    public String getName() {
        return NAME;
    }
}
