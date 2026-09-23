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

package io.ballerina.flowmodelgenerator.core;

import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.api.symbols.TypeSymbol;
import io.ballerina.compiler.syntax.tree.NamedArgumentNode;
import io.ballerina.compiler.syntax.tree.Node;
import io.ballerina.compiler.syntax.tree.NonTerminalNode;
import io.ballerina.compiler.syntax.tree.SyntaxKind;
import io.ballerina.flowmodelgenerator.core.model.node.ActivityCallBuilder;
import io.ballerina.flowmodelgenerator.core.model.node.FromExpressionOption;
import io.ballerina.modelgenerator.commons.PackageUtil;
import io.ballerina.projects.BuildOptions;
import io.ballerina.projects.DocumentId;
import io.ballerina.projects.Project;
import io.ballerina.projects.directory.SingleFileProject;
import org.testng.Assert;
import org.testng.annotations.BeforeClass;
import org.testng.annotations.Test;

import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Tests that the retry-policy form takes the union member from the compiler rather than guessing it
 * from the fields a literal carries. The first test pins what the semantic model reports, so a
 * change in the language that stopped naming the member would be caught here rather than showing up
 * as a form quietly filing policies under the wrong option.
 *
 * @since 1.9.0
 */
public class RetryPolicyTypeResolutionTest {

    private static final Path RES_DIR = Paths.get("src", "test", "resources", "ballerina", "workflow_policies")
            .toAbsolutePath();

    private final Map<String, String> resolvedTypes = new LinkedHashMap<>();
    private final Map<String, String> invalidTypes = new LinkedHashMap<>();

    @BeforeClass
    public void setup() {
        collectFrom("retry_policies.bal", resolvedTypes);
        collectFrom("retry_policies_invalid.bal", invalidTypes);
    }

    private void collectFrom(String fixture, Map<String, String> into) {
        Project project = SingleFileProject.load(RES_DIR.resolve(fixture),
                BuildOptions.builder().setOffline(true).build());
        SemanticModel model = PackageUtil.getCompilation(project)
                .getSemanticModel(project.currentPackage().getDefaultModule().moduleId());
        for (DocumentId documentId : project.currentPackage().getDefaultModule().documentIds()) {
            collect(project.currentPackage().getDefaultModule().document(documentId).syntaxTree().rootNode(), model,
                    into);
        }
    }

    private void collect(Node node, SemanticModel model, Map<String, String> into) {
        if (node instanceof NamedArgumentNode named
                && ActivityCallBuilder.RETRY_POLICY_PARAM.equals(named.argumentName().name().text())
                && named.expression().kind() == SyntaxKind.MAPPING_CONSTRUCTOR) {
            into.put(named.expression().toSourceCode().trim(),
                    model.typeOf(named.expression()).flatMap(TypeSymbol::getName).orElse(null));
        }
        if (node instanceof NonTerminalNode nonTerminal) {
            nonTerminal.children().forEach(child -> {
                if (child != null) {
                    collect(child, model, into);
                }
            });
        }
    }

    @Test(description = "The compiler names the union member each policy literal declares")
    public void testCompilerNamesTheMember() {
        Assert.assertEquals(resolvedTypes.get("{maxRetries: 3}"), "AutoRetry");
        Assert.assertEquals(resolvedTypes.get("{userRoles: \"ops\"}"), "ReviewTaskDefinition");
        Assert.assertEquals(resolvedTypes.get("{maxRetries: 2, userRoles: \"ops\"}"), "RetryBeforeReview");
        Assert.assertEquals(resolvedTypes.get("{}"), "AutoRetry",
                "an empty literal is an AutoRetry of all defaults, which the fields alone cannot say");
    }

    @Test(description = "The resolved member picks the option, not the fields the literal carries")
    public void testResolvedMemberPicksTheOption() {
        // The fields say review; the compiler says AutoRetry, and the compiler wins.
        Assert.assertEquals(
                CodeAnalyzer.normalizeRetryPolicy("{maxRetries: 3}", "ReviewTaskDefinition").dropdownValue(),
                ActivityCallBuilder.MANUAL_RETRY_VALUE);
        Assert.assertEquals(
                CodeAnalyzer.normalizeRetryPolicy("{userRoles: \"ops\"}", "AutoRetry").dropdownValue(),
                ActivityCallBuilder.AUTO_RETRY_VALUE);
    }

    @Test(description = "Without a resolved member the fields decide, as they did before")
    public void testFallsBackToTheFields() {
        Assert.assertEquals(CodeAnalyzer.normalizeRetryPolicy("{maxRetries: 3}", null).dropdownValue(),
                ActivityCallBuilder.AUTO_RETRY_VALUE);
        Assert.assertEquals(CodeAnalyzer.normalizeRetryPolicy("{userRoles: \"ops\"}", null).dropdownValue(),
                ActivityCallBuilder.MANUAL_RETRY_VALUE);
        Assert.assertEquals(
                CodeAnalyzer.normalizeRetryPolicy("{maxRetries: 2, userRoles: \"ops\"}", null).dropdownValue(),
                ActivityCallBuilder.RETRY_BEFORE_REVIEW_VALUE);
    }

    @Test(description = "A literal that does not type-check leaves the form where it was: the compiler names "
            + "nothing for it, so the fields decide as they did before")
    public void testInvalidLiteralFallsBackToTheFields() {
        // The compiler answers with no name at all for a literal that matches no member — not with
        // the union's own name — so this does not reach the unknown-member path below, and the
        // form reads the literal from its fields exactly as it did before the member was consulted.
        String resolved = invalidTypes.get("{budget: 5}");
        Assert.assertNull(resolved, "the compiler names no member for a literal that does not type-check");

        CodeAnalyzer.RetryPolicyForm form = CodeAnalyzer.normalizeRetryPolicy("{budget: 5}", resolved);
        Assert.assertEquals(form.dropdownValue(), ActivityCallBuilder.AUTO_RETRY_VALUE,
                "no audience in the literal, so the fields read it as an automatic retry, unchanged");
    }

    @Test(description = "A member the form has no option for is carried as source, not filed under the "
            + "nearest option the fields happen to match")
    public void testUnknownMemberIsCarriedAsSource() {
        CodeAnalyzer.RetryPolicyForm form =
                CodeAnalyzer.normalizeRetryPolicy("{maxRetries: 3, budget: 5}", "RetryWithinBudget");
        Assert.assertEquals(form.dropdownValue(), FromExpressionOption.VALUE);
        Assert.assertEquals(form.expression(), "{maxRetries: 3, budget: 5}");
        Assert.assertEquals(form.maxRetries(), "", "nothing is lifted out of a shape the form cannot edit");
    }
}
