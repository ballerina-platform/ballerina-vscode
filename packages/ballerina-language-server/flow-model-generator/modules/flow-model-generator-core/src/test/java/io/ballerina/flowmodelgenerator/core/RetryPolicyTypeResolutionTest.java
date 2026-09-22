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

    @BeforeClass
    public void setup() {
        Project project = SingleFileProject.load(RES_DIR.resolve("retry_policies.bal"),
                BuildOptions.builder().setOffline(true).build());
        SemanticModel model = PackageUtil.getCompilation(project)
                .getSemanticModel(project.currentPackage().getDefaultModule().moduleId());
        for (DocumentId documentId : project.currentPackage().getDefaultModule().documentIds()) {
            collect(project.currentPackage().getDefaultModule().document(documentId).syntaxTree().rootNode(), model);
        }
    }

    private void collect(Node node, SemanticModel model) {
        if (node instanceof NamedArgumentNode named
                && ActivityCallBuilder.RETRY_POLICY_PARAM.equals(named.argumentName().name().text())
                && named.expression().kind() == SyntaxKind.MAPPING_CONSTRUCTOR) {
            resolvedTypes.put(named.expression().toSourceCode().trim(),
                    model.typeOf(named.expression()).flatMap(TypeSymbol::getName).orElse(null));
        }
        if (node instanceof NonTerminalNode nonTerminal) {
            nonTerminal.children().forEach(child -> {
                if (child != null) {
                    collect(child, model);
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
