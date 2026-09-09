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

import io.ballerina.compiler.syntax.tree.CheckExpressionNode;
import io.ballerina.compiler.syntax.tree.FunctionArgumentNode;
import io.ballerina.compiler.syntax.tree.NodeParser;
import io.ballerina.compiler.syntax.tree.RemoteMethodCallActionNode;
import io.ballerina.compiler.syntax.tree.SeparatedNodeList;
import io.ballerina.compiler.syntax.tree.VariableDeclarationNode;
import io.ballerina.flowmodelgenerator.core.model.node.HumanTaskBuilder;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.util.Map;

/**
 * Tests for the {@code awaitHumanTask} fallback read in {@link CodeAnalyzer} — the path taken when the
 * workflow module does not resolve, so the form is built from the call's arguments alone. Each of
 * the six parameters may be written positionally, in the signature's order, or by name, and a
 * parameter the call leaves out must come through as an empty field rather than a wrong one.
 * (product-integrator#2109)
 *
 * @since 1.7.0
 */
public class HumanTaskFallbackArgumentsTest {

    @Test(description = "Positional arguments map by the signature's order: taskName, userRoles, payload, title, "
            + "description, timeout")
    public void testPositionalArgumentsFollowTheSignature() {
        Map<String, String> values = CodeAnalyzer.fallbackHumanTaskArgumentValues(arguments(
                "ctx->awaitHumanTask(\"approve\", \"manager\", {amount: 1200}, \"Approve\", \"Please review\", "
                        + "{hours: 4})"));
        Assert.assertEquals(values.get(HumanTaskBuilder.TASK_NAME_KEY), "\"approve\"");
        Assert.assertEquals(values.get(HumanTaskBuilder.USER_ROLES_KEY), "\"manager\"");
        Assert.assertEquals(values.get(HumanTaskBuilder.PAYLOAD_KEY), "{amount: 1200}");
        Assert.assertEquals(values.get(HumanTaskBuilder.TITLE_KEY), "\"Approve\"");
        Assert.assertEquals(values.get(HumanTaskBuilder.DESCRIPTION_KEY), "\"Please review\"");
        Assert.assertEquals(values.get(HumanTaskBuilder.TIMEOUT_KEY), "{hours: 4}");
    }

    @Test(description = "A partially positional call: the third positional argument is the payload, not the "
            + "description, and the parameters not written are empty")
    public void testPartialPositionalCall() {
        Map<String, String> values = CodeAnalyzer.fallbackHumanTaskArgumentValues(arguments(
                "ctx->awaitHumanTask(\"approve\", [\"finance\", \"manager\"], {amount: 1200})"));
        Assert.assertEquals(values.get(HumanTaskBuilder.USER_ROLES_KEY), "[\"finance\", \"manager\"]");
        Assert.assertEquals(values.get(HumanTaskBuilder.PAYLOAD_KEY), "{amount: 1200}");
        Assert.assertNull(values.get(HumanTaskBuilder.TITLE_KEY));
        Assert.assertNull(values.get(HumanTaskBuilder.DESCRIPTION_KEY));
        Assert.assertNull(values.get(HumanTaskBuilder.TIMEOUT_KEY));
    }

    @Test(description = "Named arguments are read by name, in any order, and mixed with positional ones")
    public void testNamedArgumentsInAnyOrder() {
        Map<String, String> values = CodeAnalyzer.fallbackHumanTaskArgumentValues(arguments(
                "ctx->awaitHumanTask(\"approve\", \"manager\", timeout = {days: 1}, description = \"Why\", "
                        + "title = \"Approve\")"));
        Assert.assertEquals(values.get(HumanTaskBuilder.TASK_NAME_KEY), "\"approve\"");
        Assert.assertEquals(values.get(HumanTaskBuilder.USER_ROLES_KEY), "\"manager\"");
        Assert.assertNull(values.get(HumanTaskBuilder.PAYLOAD_KEY));
        Assert.assertEquals(values.get(HumanTaskBuilder.TITLE_KEY), "\"Approve\"");
        Assert.assertEquals(values.get(HumanTaskBuilder.DESCRIPTION_KEY), "\"Why\"");
        Assert.assertEquals(values.get(HumanTaskBuilder.TIMEOUT_KEY), "{days: 1}");
    }

    @Test(description = "Even the required parameters may be named")
    public void testAllNamed() {
        Map<String, String> values = CodeAnalyzer.fallbackHumanTaskArgumentValues(arguments(
                "ctx->awaitHumanTask(userRoles = \"ops\", taskName = \"signoff\", payload = {})"));
        Assert.assertEquals(values.get(HumanTaskBuilder.TASK_NAME_KEY), "\"signoff\"");
        Assert.assertEquals(values.get(HumanTaskBuilder.USER_ROLES_KEY), "\"ops\"");
        Assert.assertEquals(values.get(HumanTaskBuilder.PAYLOAD_KEY), "{}");
    }

    // The arguments of a remote call, parsed from source the way CodeAnalyzer sees them.
    private static SeparatedNodeList<FunctionArgumentNode> arguments(String call) {
        VariableDeclarationNode statement =
                (VariableDeclarationNode) NodeParser.parseStatement("anydata result = check " + call + ";");
        CheckExpressionNode check = (CheckExpressionNode) statement.initializer().orElseThrow();
        return ((RemoteMethodCallActionNode) check.expression()).arguments();
    }
}
