/*
 * Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package org.ballerinalang.langserver.codeaction.providers;

import io.ballerina.compiler.syntax.tree.MappingConstructorExpressionNode;
import io.ballerina.compiler.syntax.tree.MappingFieldNode;
import io.ballerina.compiler.syntax.tree.NonTerminalNode;
import io.ballerina.compiler.syntax.tree.SeparatedNodeList;
import io.ballerina.compiler.syntax.tree.SpecificFieldNode;
import io.ballerina.compiler.syntax.tree.SyntaxKind;
import io.ballerina.tools.diagnostics.Diagnostic;
import org.ballerinalang.annotation.JavaSPIService;
import org.ballerinalang.langserver.codeaction.CodeActionUtil;
import org.ballerinalang.langserver.common.utils.PositionUtil;
import org.ballerinalang.langserver.commons.CodeActionContext;
import org.ballerinalang.langserver.commons.codeaction.spi.DiagBasedPositionDetails;
import org.ballerinalang.langserver.commons.codeaction.spi.DiagnosticBasedCodeActionProvider;
import org.eclipse.lsp4j.CodeAction;
import org.eclipse.lsp4j.CodeActionKind;
import org.eclipse.lsp4j.Range;
import org.eclipse.lsp4j.TextEdit;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * Migrates a durable-agent declaration field the workflow module no longer accepts (WORKFLOW_163):
 * {@code requiresApproval} and its {@code userRoles} become an {@code approvalPolicy}; a peer's
 * {@code name}, {@code 'wait} and {@code callbackChannel} are removed.
 *
 * @since 1.9.0
 */
@JavaSPIService("org.ballerinalang.langserver.commons.codeaction.spi.LSCodeActionProvider")
public class MigrateWorkflowDeclarationCodeAction implements DiagnosticBasedCodeActionProvider {

    private static final String CODE_ACTION_NAME = "MIGRATE_WORKFLOW_DECLARATION";
    private static final String REMOVED_FIELD_CODE = "WORKFLOW_163";
    private static final String REQUIRES_APPROVAL = "requiresApproval";
    private static final String USER_ROLES = "userRoles";
    private static final String APPROVAL_POLICY = "approvalPolicy";
    private static final String REPLACE_TITLE = "Replace with 'approvalPolicy'";
    private static final String REMOVE_TITLE = "Remove '%s'";

    @Override
    public boolean validate(Diagnostic diagnostic, DiagBasedPositionDetails positionDetails,
                            CodeActionContext context) {
        return REMOVED_FIELD_CODE.equals(diagnostic.diagnosticInfo().code())
                && enclosingField(positionDetails.matchedNode()).isPresent();
    }

    @Override
    public List<CodeAction> getCodeActions(Diagnostic diagnostic, DiagBasedPositionDetails positionDetails,
                                           CodeActionContext context) {
        Optional<SpecificFieldNode> fieldOpt = enclosingField(positionDetails.matchedNode());
        if (fieldOpt.isEmpty() || !(fieldOpt.get().parent() instanceof MappingConstructorExpressionNode mapping)) {
            return List.of();
        }
        Migration migration = migrate(mapping, fieldOpt.get());
        return List.of(CodeActionUtil.createCodeAction(migration.title(), migration.edits(), context.fileUri(),
                CodeActionKind.QuickFix));
    }

    /**
     * The quick fix for one removed field: its title and the edits that rewrite the mapping.
     *
     * @param title the code action title
     * @param edits the text edits, in no particular order
     */
    record Migration(String title, List<TextEdit> edits) {
    }

    // A `requiresApproval: true` becomes an approvalPolicy carrying the roles beside it; any other
    // removed field, the flag when false included, is dropped.
    static Migration migrate(MappingConstructorExpressionNode mapping, SpecificFieldNode field) {
        String name = fieldName(field);
        List<TextEdit> edits = new ArrayList<>();
        if (REQUIRES_APPROVAL.equals(name) || USER_ROLES.equals(name)) {
            Optional<SpecificFieldNode> flag = sibling(mapping, REQUIRES_APPROVAL);
            Optional<SpecificFieldNode> roles = sibling(mapping, USER_ROLES);
            boolean gated = flag.isPresent() && "true".equals(valueSource(flag.get()));
            if (gated) {
                // The flag becomes the policy; the roles it named travel inside it.
                String audience = roles.map(MigrateWorkflowDeclarationCodeAction::valueSource).orElse("()");
                edits.add(new TextEdit(PositionUtil.toRange(flag.get().lineRange()),
                        APPROVAL_POLICY + ": {" + USER_ROLES + ": " + audience + "}"));
                roles.ifPresent(r -> edits.add(removal(mapping, r)));
                return new Migration(REPLACE_TITLE, edits);
            }
        }
        edits.add(removal(mapping, field));
        return new Migration(String.format(REMOVE_TITLE, name), edits);
    }

    @Override
    public String getName() {
        return CODE_ACTION_NAME;
    }

    private static Optional<SpecificFieldNode> enclosingField(NonTerminalNode node) {
        NonTerminalNode current = node;
        while (current != null && current.kind() != SyntaxKind.MAPPING_CONSTRUCTOR) {
            if (current instanceof SpecificFieldNode specificField) {
                return Optional.of(specificField);
            }
            current = current.parent();
        }
        return Optional.empty();
    }

    private static Optional<SpecificFieldNode> sibling(MappingConstructorExpressionNode mapping, String name) {
        for (MappingFieldNode field : mapping.fields()) {
            if (field instanceof SpecificFieldNode specificField && name.equals(fieldName(specificField))) {
                return Optional.of(specificField);
            }
        }
        return Optional.empty();
    }

    private static String fieldName(SpecificFieldNode field) {
        String name = field.fieldName().toSourceCode().trim();
        return name.startsWith("'") ? name.substring(1) : name;
    }

    private static String valueSource(SpecificFieldNode field) {
        return field.valueExpr().map(expr -> expr.toSourceCode().trim()).orElse("");
    }

    // Removes the field with the comma that separated it, so the mapping stays well-formed.
    static TextEdit removal(MappingConstructorExpressionNode mapping, SpecificFieldNode field) {
        SeparatedNodeList<MappingFieldNode> fields = mapping.fields();
        int index = 0;
        while (index < fields.size() && fields.get(index) != field) {
            index++;
        }
        Range range;
        if (index > 0) {
            range = new Range(PositionUtil.toRange(fields.getSeparator(index - 1).lineRange()).getStart(),
                    PositionUtil.toRange(field.lineRange()).getEnd());
        } else if (fields.size() > 1) {
            range = new Range(PositionUtil.toRange(field.lineRange()).getStart(),
                    PositionUtil.toRange(fields.get(1).lineRange()).getStart());
        } else {
            range = PositionUtil.toRange(field.lineRange());
        }
        return new TextEdit(range, "");
    }
}
