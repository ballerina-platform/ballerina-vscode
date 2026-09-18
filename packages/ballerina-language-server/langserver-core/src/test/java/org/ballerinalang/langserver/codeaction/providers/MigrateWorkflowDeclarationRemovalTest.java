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
import io.ballerina.compiler.syntax.tree.NodeParser;
import io.ballerina.compiler.syntax.tree.SpecificFieldNode;
import io.ballerina.tools.text.TextDocument;
import io.ballerina.tools.text.TextDocuments;
import io.ballerina.tools.text.TextEdit;
import io.ballerina.tools.text.TextRange;
import org.eclipse.lsp4j.Position;
import org.eclipse.lsp4j.Range;
import org.testng.Assert;
import org.testng.annotations.DataProvider;
import org.testng.annotations.Test;

import java.util.List;

/**
 * The field-removal edit of the workflow declaration migration: a removed field takes the comma
 * that separated it, whether it is first, in the middle, or the only field of the mapping.
 *
 * @since 1.0.0
 */
public class MigrateWorkflowDeclarationRemovalTest {

    @DataProvider(name = "removals")
    public Object[][] removals() {
        return new Object[][]{
                {"{requiresApproval: true, activity: a, userRoles: \"m\"}", "requiresApproval",
                        "{activity: a, userRoles: \"m\"}"},
                {"{activity: a, requiresApproval: true, userRoles: \"m\"}", "requiresApproval",
                        "{activity: a, userRoles: \"m\"}"},
                {"{activity: a, userRoles: \"m\", requiresApproval: true}", "requiresApproval",
                        "{activity: a, userRoles: \"m\"}"},
                {"{requiresApproval: true}", "requiresApproval", "{}"},
                {"{\n    activity: a,\n    'wait: true\n}", "wait", "{\n    activity: a\n}"},
        };
    }

    @Test(dataProvider = "removals")
    public void removingAFieldKeepsTheMappingWellFormed(String source, String field, String expected) {
        MappingConstructorExpressionNode mapping =
                (MappingConstructorExpressionNode) NodeParser.parseExpression(source);
        SpecificFieldNode target = null;
        for (MappingFieldNode f : mapping.fields()) {
            if (f instanceof SpecificFieldNode sf
                    && sf.fieldName().toSourceCode().trim().replace("'", "").equals(field)) {
                target = sf;
            }
        }
        Assert.assertNotNull(target, "fixture names a field of the mapping");
        org.eclipse.lsp4j.TextEdit edit = MigrateWorkflowDeclarationCodeAction.removal(mapping, target);
        Assert.assertEquals(apply(source, edit.getRange()), expected);
    }

    @DataProvider(name = "migrations")
    public Object[][] migrations() {
        return new Object[][]{
                // The diagnostic may sit on the flag or on the roles; either way the pair becomes the policy.
                {"{activity: a, requiresApproval: true, userRoles: \"manager\"}", "requiresApproval",
                        "Replace with 'approvalPolicy'", "{activity: a, approvalPolicy: {userRoles: \"manager\"}}"},
                {"{activity: a, requiresApproval: true, userRoles: [\"finance\", \"manager\"]}", "userRoles",
                        "Replace with 'approvalPolicy'",
                        "{activity: a, approvalPolicy: {userRoles: [\"finance\", \"manager\"]}}"},
                // No roles beside the flag: the policy names nobody, which the compiler then reports.
                {"{activity: a, requiresApproval: true}", "requiresApproval",
                        "Replace with 'approvalPolicy'", "{activity: a, approvalPolicy: {userRoles: ()}}"},
                // A flag that was false gated nothing, so it is simply dropped.
                {"{activity: a, requiresApproval: false, userRoles: \"m\"}", "requiresApproval",
                        "Remove 'requiresApproval'", "{activity: a, userRoles: \"m\"}"},
                {"{agent: b, 'wait: true}", "wait", "Remove 'wait'", "{agent: b}"},
        };
    }

    @Test(dataProvider = "migrations")
    public void migratingAFieldRewritesTheMapping(String source, String field, String title, String expected) {
        MappingConstructorExpressionNode mapping =
                (MappingConstructorExpressionNode) NodeParser.parseExpression(source);
        SpecificFieldNode target = field(mapping, field);
        MigrateWorkflowDeclarationCodeAction.Migration migration =
                MigrateWorkflowDeclarationCodeAction.migrate(mapping, target);
        Assert.assertEquals(migration.title(), title);
        Assert.assertEquals(apply(source, migration.edits()), expected);
    }

    private static SpecificFieldNode field(MappingConstructorExpressionNode mapping, String name) {
        for (MappingFieldNode f : mapping.fields()) {
            if (f instanceof SpecificFieldNode sf
                    && sf.fieldName().toSourceCode().trim().replace("'", "").equals(name)) {
                return sf;
            }
        }
        Assert.fail("fixture names a field of the mapping: " + name);
        return null;
    }

    // Applies a deleting range to the source the way the client would.
    private static String apply(String source, Range range) {
        return apply(source, List.of(new org.eclipse.lsp4j.TextEdit(range, "")));
    }

    // Applies the edits the way the client would, whatever order they were produced in.
    private static String apply(String source, List<org.eclipse.lsp4j.TextEdit> edits) {
        TextDocument doc = TextDocuments.from(source);
        TextEdit[] changes = edits.stream().map(edit -> {
            int start = doc.textPositionFrom(toLinePosition(edit.getRange().getStart()));
            int end = doc.textPositionFrom(toLinePosition(edit.getRange().getEnd()));
            return TextEdit.from(TextRange.from(start, end - start), edit.getNewText());
        }).toArray(TextEdit[]::new);
        return doc.apply(io.ballerina.tools.text.TextDocumentChange.from(changes)).toString();
    }

    private static io.ballerina.tools.text.LinePosition toLinePosition(Position position) {
        return io.ballerina.tools.text.LinePosition.from(position.getLine(), position.getCharacter());
    }
}
