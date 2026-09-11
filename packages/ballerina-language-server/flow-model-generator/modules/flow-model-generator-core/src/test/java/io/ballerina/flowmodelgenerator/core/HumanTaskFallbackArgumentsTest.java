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
 * workflow module does not resolve, so the form is built from the call's arguments alone. The call
 * may follow the 0.9.0 layout (task name, task input, definition fields by name) or the older one
 * (task name, user roles, payload), and both must land in the same form fields.
 * (product-integrator#2109)
 *
 * @since 1.7.0
 */
public class HumanTaskFallbackArgumentsTest {

    @Test(description = "0.9.0 layout: the record literal after the name is the task input, and the "
            + "definition fields are read by name")
    public void testCurrentLayout() {
        Map<String, String> values = CodeAnalyzer.fallbackHumanTaskArgumentValues(arguments(
                "ctx->awaitHumanTask(\"approve\", {amount: 1200}, userRoles = \"manager\", title = \"Approve\", "
                        + "description = \"Please review\", timeout = {hours: 4})"));
        Assert.assertEquals(values.get(HumanTaskBuilder.TASK_NAME_KEY), "\"approve\"");
        Assert.assertEquals(values.get(HumanTaskBuilder.TASK_INPUT_KEY), "{amount: 1200}");
        Assert.assertEquals(values.get(HumanTaskBuilder.USER_ROLES_KEY), "\"manager\"");
        Assert.assertEquals(values.get(HumanTaskBuilder.TITLE_KEY), "\"Approve\"");
        Assert.assertEquals(values.get(HumanTaskBuilder.DESCRIPTION_KEY), "\"Please review\"");
        Assert.assertEquals(values.get(HumanTaskBuilder.TIMEOUT_KEY), "{hours: 4}");
    }

    @Test(description = "Legacy three-argument layout: a string in the second position is the roles, and the "
            + "third positional argument is the payload — it does not become the title, and the roles are "
            + "not mistaken for the input")
    public void testLegacyPositionalLayout() {
        Map<String, String> values = CodeAnalyzer.fallbackHumanTaskArgumentValues(arguments(
                "ctx->awaitHumanTask(\"approve\", \"manager\", {title: \"in the payload\"})"));
        Assert.assertEquals(values.get(HumanTaskBuilder.TASK_NAME_KEY), "\"approve\"");
        Assert.assertEquals(values.get(HumanTaskBuilder.USER_ROLES_KEY), "\"manager\"");
        Assert.assertEquals(values.get(HumanTaskBuilder.TASK_INPUT_KEY), "{title: \"in the payload\"}");
        Assert.assertNull(values.get(HumanTaskBuilder.TITLE_KEY));
        Assert.assertNull(values.get(HumanTaskBuilder.DESCRIPTION_KEY));
        Assert.assertNull(values.get(HumanTaskBuilder.TIMEOUT_KEY));
    }

    @Test(description = "Legacy layout with a role list and the payload by its old name: the list is the roles "
            + "and `payload` lands in the task input field")
    public void testLegacyRoleListAndNamedPayload() {
        Map<String, String> values = CodeAnalyzer.fallbackHumanTaskArgumentValues(arguments(
                "ctx->awaitHumanTask(\"approve\", [\"finance\", \"manager\"], payload = {amount: 1200}, "
                        + "title = \"Approve\")"));
        Assert.assertEquals(values.get(HumanTaskBuilder.USER_ROLES_KEY), "[\"finance\", \"manager\"]");
        Assert.assertEquals(values.get(HumanTaskBuilder.TASK_INPUT_KEY), "{amount: 1200}");
        Assert.assertEquals(values.get(HumanTaskBuilder.TITLE_KEY), "\"Approve\"");
    }

    @Test(description = "A call that names every argument reads the same under either spelling of the input")
    public void testAllNamed() {
        Map<String, String> current = CodeAnalyzer.fallbackHumanTaskArgumentValues(arguments(
                "ctx->awaitHumanTask(userRoles = \"ops\", taskName = \"signoff\", taskInput = {})"));
        Assert.assertEquals(current.get(HumanTaskBuilder.TASK_NAME_KEY), "\"signoff\"");
        Assert.assertEquals(current.get(HumanTaskBuilder.USER_ROLES_KEY), "\"ops\"");
        Assert.assertEquals(current.get(HumanTaskBuilder.TASK_INPUT_KEY), "{}");

        Map<String, String> legacy = CodeAnalyzer.fallbackHumanTaskArgumentValues(arguments(
                "ctx->awaitHumanTask(taskName = \"signoff\", userRoles = \"ops\", payload = {})"));
        Assert.assertEquals(legacy.get(HumanTaskBuilder.TASK_INPUT_KEY), "{}");
    }

    @Test(description = "Named arguments are read by name, in any order, and mixed with positional ones")
    public void testNamedArgumentsInAnyOrder() {
        Map<String, String> values = CodeAnalyzer.fallbackHumanTaskArgumentValues(arguments(
                "ctx->awaitHumanTask(\"approve\", \"manager\", timeout = {days: 1}, description = \"Why\", "
                        + "title = \"Approve\")"));
        Assert.assertEquals(values.get(HumanTaskBuilder.TASK_NAME_KEY), "\"approve\"");
        Assert.assertEquals(values.get(HumanTaskBuilder.USER_ROLES_KEY), "\"manager\"");
        Assert.assertNull(values.get(HumanTaskBuilder.TASK_INPUT_KEY));
        Assert.assertEquals(values.get(HumanTaskBuilder.TITLE_KEY), "\"Approve\"");
        Assert.assertEquals(values.get(HumanTaskBuilder.DESCRIPTION_KEY), "\"Why\"");
        Assert.assertEquals(values.get(HumanTaskBuilder.TIMEOUT_KEY), "{days: 1}");
    }

    @Test(description = "With the roles named, the positional argument after the name is the task input "
            + "whatever its shape: a variable holding the input is not dropped for the form's `{}`")
    public void testNamedRolesMakePositionalInputTheInput() {
        Map<String, String> values = CodeAnalyzer.fallbackHumanTaskArgumentValues(arguments(
                "ctx->awaitHumanTask(\"approve\", requestData, userRoles = \"manager\")"));
        Assert.assertEquals(values.get(HumanTaskBuilder.TASK_NAME_KEY), "\"approve\"");
        Assert.assertEquals(values.get(HumanTaskBuilder.USER_ROLES_KEY), "\"manager\"");
        Assert.assertEquals(values.get(HumanTaskBuilder.TASK_INPUT_KEY), "requestData",
                "the input must survive the read, or the next save replaces it with {}");

        // A call on a function result reads the same way — the shape of the expression says nothing.
        Assert.assertEquals(CodeAnalyzer.fallbackHumanTaskArgumentValues(arguments(
                        "ctx->awaitHumanTask(\"approve\", buildInput(), userRoles = [\"finance\", \"manager\"], "
                                + "title = \"Approve\")"))
                .get(HumanTaskBuilder.TASK_INPUT_KEY), "buildInput()");
    }

    @Test(description = "A call that omits the input leaves the field unset — the form fills `{}` — and does "
            + "not read a role string as the input")
    public void testOmittedInput() {
        Map<String, String> values = CodeAnalyzer.fallbackHumanTaskArgumentValues(arguments(
                "ctx->awaitHumanTask(\"approve\", \"manager\")"));
        Assert.assertEquals(values.get(HumanTaskBuilder.USER_ROLES_KEY), "\"manager\"");
        Assert.assertNull(values.get(HumanTaskBuilder.TASK_INPUT_KEY));
    }

    // The arguments of a remote call, parsed from source the way CodeAnalyzer sees them.
    private static SeparatedNodeList<FunctionArgumentNode> arguments(String call) {
        VariableDeclarationNode statement =
                (VariableDeclarationNode) NodeParser.parseStatement("anydata result = check " + call + ";");
        CheckExpressionNode check = (CheckExpressionNode) statement.initializer().orElseThrow();
        return ((RemoteMethodCallActionNode) check.expression()).arguments();
    }
}
