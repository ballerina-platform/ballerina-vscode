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

package io.ballerina.flowmodelgenerator.core.model.node;

import io.ballerina.compiler.syntax.tree.CheckExpressionNode;
import io.ballerina.compiler.syntax.tree.FunctionArgumentNode;
import io.ballerina.compiler.syntax.tree.NodeParser;
import io.ballerina.compiler.syntax.tree.RemoteMethodCallActionNode;
import io.ballerina.compiler.syntax.tree.SeparatedNodeList;
import io.ballerina.compiler.syntax.tree.VariableDeclarationNode;
import io.ballerina.flowmodelgenerator.core.model.Property;
import io.ballerina.modelgenerator.commons.ParameterData;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Tests for the human task form's property rules in {@link HumanTaskBuilder}: what survives the
 * relabel pass, how the fallback form fills the task input, and which call argument the options
 * overlay reads.
 *
 * @since 1.7.0
 */
public class HumanTaskFormTest {

    @Test(description = "A step id read from source stays in the form — hidden and not editable — so a save "
            + "re-emits the name the call already had")
    public void testStepIdIsHiddenNotRemoved() {
        Map<String, Property> properties = new LinkedHashMap<>();
        properties.put(HumanTaskBuilder.TASK_NAME_KEY, property("\"approve\"", ParameterData.Kind.REQUIRED));
        properties.put(HumanTaskBuilder.STEP_ID_KEY, property("\"charge-card\"", ParameterData.Kind.DEFAULTABLE));

        HumanTaskBuilder.relabelHumanTaskFormProperties(properties);

        Property stepId = properties.get(HumanTaskBuilder.STEP_ID_KEY);
        Assert.assertNotNull(stepId, "stepId must survive the relabel pass");
        Assert.assertEquals(stepId.value(), "\"charge-card\"");
        Assert.assertTrue(stepId.hidden(), "stepId is not offered in the form");
        Assert.assertFalse(stepId.editable(), "stepId is not edited in the form");
        Assert.assertEquals(stepId.codedata().kind(), ParameterData.Kind.DEFAULTABLE.name(),
                "the parameter's own metadata is kept, so the emitter names the argument");
    }

    @Test(description = "A form without a step id — the template, or an older module — is left as it is")
    public void testRelabelWithoutStepId() {
        Map<String, Property> properties = new LinkedHashMap<>();
        properties.put(HumanTaskBuilder.TASK_NAME_KEY, property("", ParameterData.Kind.REQUIRED));
        HumanTaskBuilder.relabelHumanTaskFormProperties(properties);
        Assert.assertFalse(properties.containsKey(HumanTaskBuilder.STEP_ID_KEY));
    }

    @Test(description = "A call that omits the task input, read back as a mapped null, gets the explicit empty input")
    public void testFallbackInputDefaultsWhenMappedNull() {
        Map<String, String> values = new HashMap<>();
        values.put(HumanTaskBuilder.TASK_NAME_KEY, "\"approve\"");
        values.put(HumanTaskBuilder.TASK_INPUT_KEY, null);

        HumanTaskBuilder builder = new HumanTaskBuilder();
        HumanTaskBuilder.addFallbackHumanTaskParameters(builder, values);

        Property input = builder.properties().build().get(HumanTaskBuilder.TASK_INPUT_KEY);
        Assert.assertEquals(input.value(), "{}");
        Assert.assertEquals(input.codedata().kind(), ParameterData.Kind.REQUIRED.name());
        Assert.assertFalse(input.optional());
    }

    @Test(description = "The template's empty value map and a stated input both come through as expected")
    public void testFallbackInputAbsentAndExplicit() {
        HumanTaskBuilder fromTemplate = new HumanTaskBuilder();
        HumanTaskBuilder.addFallbackHumanTaskParameters(fromTemplate, Map.of());
        Assert.assertEquals(fromTemplate.properties().build().get(HumanTaskBuilder.TASK_INPUT_KEY).value(), "{}");

        HumanTaskBuilder fromSource = new HumanTaskBuilder();
        HumanTaskBuilder.addFallbackHumanTaskParameters(fromSource,
                Map.of(HumanTaskBuilder.TASK_INPUT_KEY, "{\"amount\": 1200}"));
        Assert.assertEquals(fromSource.properties().build().get(HumanTaskBuilder.TASK_INPUT_KEY).value(),
                "{\"amount\": 1200}");
    }

    @Test(description = "The overlay reads the options record, not the task input: a payload field named like an "
            + "option is business data and stays out of the form's options")
    public void testOverlayReadsOnlyTheOptionsArgument() {
        Map<String, Property> properties = new LinkedHashMap<>();
        properties.put(HumanTaskBuilder.TASK_NAME_KEY, property("\"approve\"", ParameterData.Kind.REQUIRED));
        properties.put(HumanTaskBuilder.TASK_INPUT_KEY,
                property("{title: \"Invoice 42\", amount: 1200}", ParameterData.Kind.REQUIRED));
        properties.put(HumanTaskBuilder.USER_ROLES_KEY, property("", ParameterData.Kind.INCLUDED_FIELD));
        properties.put(HumanTaskBuilder.TITLE_KEY, property("", ParameterData.Kind.INCLUDED_FIELD));
        properties.put(HumanTaskBuilder.TIMEOUT_KEY, property("", ParameterData.Kind.INCLUDED_FIELD));

        HumanTaskBuilder.overlayOptionsLiteral(properties, arguments(
                "ctx->awaitHumanTask(\"approve\", {title: \"Invoice 42\", amount: 1200}, "
                        + "{userRoles: \"manager\", timeout: {hours: 1}})"));

        Assert.assertEquals(properties.get(HumanTaskBuilder.USER_ROLES_KEY).value(), "\"manager\"");
        Assert.assertEquals(properties.get(HumanTaskBuilder.TIMEOUT_KEY).value(), "{hours: 1}");
        Assert.assertEquals(properties.get(HumanTaskBuilder.TITLE_KEY).value(), "",
                "the payload's title is not the task's title");
        Assert.assertEquals(properties.get(HumanTaskBuilder.TASK_INPUT_KEY).value(),
                "{title: \"Invoice 42\", amount: 1200}", "the task input is not rewritten");
    }

    @Test(description = "A signature with no options record has nothing to overlay: a positional payload carrying "
            + "option-named fields is left alone")
    public void testOverlayIsInertWithoutAnOptionsRecord() {
        Map<String, Property> properties = new LinkedHashMap<>();
        properties.put(HumanTaskBuilder.TASK_NAME_KEY, property("\"approve\"", ParameterData.Kind.REQUIRED));
        properties.put(HumanTaskBuilder.USER_ROLES_KEY, property("\"manager\"", ParameterData.Kind.REQUIRED));
        // An older release names the input `payload` and declares it defaultable; the key is what
        // the resolved signature would produce, not a constant this builder needs to know.
        properties.put("payload", property("", ParameterData.Kind.DEFAULTABLE));
        properties.put(HumanTaskBuilder.TITLE_KEY, property("", ParameterData.Kind.DEFAULTABLE));

        HumanTaskBuilder.overlayOptionsLiteral(properties, arguments(
                "ctx->awaitHumanTask(\"approve\", \"manager\", {title: \"in the payload\"})"));

        Assert.assertEquals(properties.get(HumanTaskBuilder.TITLE_KEY).value(), "");
        Assert.assertEquals(properties.get("payload").value(), "");
    }

    @Test(description = "An option the form already holds is not overwritten by the literal, and a named "
            + "argument is not mistaken for the options record")
    public void testOverlayKeepsExistingValuesAndSkipsNamedArguments() {
        Map<String, Property> properties = new LinkedHashMap<>();
        properties.put(HumanTaskBuilder.TASK_NAME_KEY, property("\"approve\"", ParameterData.Kind.REQUIRED));
        properties.put(HumanTaskBuilder.TASK_INPUT_KEY, property("{}", ParameterData.Kind.REQUIRED));
        properties.put(HumanTaskBuilder.TITLE_KEY, property("\"Already set\"", ParameterData.Kind.INCLUDED_FIELD));
        properties.put(HumanTaskBuilder.DESCRIPTION_KEY, property("", ParameterData.Kind.INCLUDED_FIELD));

        HumanTaskBuilder.overlayOptionsLiteral(properties, arguments(
                "ctx->awaitHumanTask(\"approve\", {}, {title: \"From literal\"}, description = \"named\")"));

        Assert.assertEquals(properties.get(HumanTaskBuilder.TITLE_KEY).value(), "\"Already set\"");
        Assert.assertEquals(properties.get(HumanTaskBuilder.DESCRIPTION_KEY).value(), "",
                "named arguments are read by the signature path, not the overlay");
    }

    @Test(description = "The record's two type fields are hidden, and the form keeps its pre-record order: "
            + "name, roles, input, details, completion type")
    public void testRecordFormIsFlatAndOrderedAsBefore() {
        Map<String, Property> properties = new LinkedHashMap<>();
        // Signature order at 0.9.0: positional parameters, inferred type, then the record's fields.
        properties.put(HumanTaskBuilder.TASK_NAME_KEY, property("\"approve\"", ParameterData.Kind.REQUIRED));
        properties.put(HumanTaskBuilder.TASK_INPUT_KEY, property("{}", ParameterData.Kind.REQUIRED));
        properties.put(HumanTaskBuilder.STEP_ID_KEY, property("", ParameterData.Kind.DEFAULTABLE));
        properties.put(HumanTaskBuilder.USER_ROLES_KEY,
                property("\"manager\"", ParameterData.Kind.INCLUDED_FIELD));
        properties.put(HumanTaskBuilder.TITLE_KEY, property("", ParameterData.Kind.INCLUDED_FIELD));
        properties.put("$description", property("", ParameterData.Kind.INCLUDED_FIELD));
        properties.put(HumanTaskBuilder.TIMEOUT_KEY, property("", ParameterData.Kind.INCLUDED_FIELD));
        properties.put(HumanTaskBuilder.TASK_INPUT_TYPE_KEY, property("", ParameterData.Kind.INCLUDED_FIELD));
        properties.put(HumanTaskBuilder.RESULT_TYPE_KEY, property("Decision", ParameterData.Kind.INCLUDED_FIELD));
        properties.put(HumanTaskBuilder.DATABINDING_TYPE_KEY,
                property("Decision", ParameterData.Kind.PARAM_FOR_TYPE_INFER));
        properties.put(Property.VARIABLE_KEY, property("result", null));

        HumanTaskBuilder.relabelHumanTaskFormProperties(properties);

        Assert.assertEquals(new ArrayList<>(properties.keySet()), List.of(
                HumanTaskBuilder.TASK_NAME_KEY, HumanTaskBuilder.USER_ROLES_KEY, HumanTaskBuilder.TASK_INPUT_KEY,
                HumanTaskBuilder.TITLE_KEY, "$description", HumanTaskBuilder.TIMEOUT_KEY,
                HumanTaskBuilder.DATABINDING_TYPE_KEY,
                HumanTaskBuilder.STEP_ID_KEY, HumanTaskBuilder.TASK_INPUT_TYPE_KEY, HumanTaskBuilder.RESULT_TYPE_KEY,
                Property.VARIABLE_KEY));
        for (String hidden : List.of(HumanTaskBuilder.RESULT_TYPE_KEY, HumanTaskBuilder.TASK_INPUT_TYPE_KEY)) {
            Assert.assertTrue(properties.get(hidden).hidden(), hidden + " is not offered in the form");
            Assert.assertFalse(properties.get(hidden).editable(), hidden + " is not edited in the form");
        }
        Assert.assertEquals(properties.get(HumanTaskBuilder.RESULT_TYPE_KEY).value(), "Decision",
                "a stated resultType is kept, so a save writes it back");
        Assert.assertFalse(properties.get(HumanTaskBuilder.USER_ROLES_KEY).hidden());
        // `description` is a reserved property key, so the signature-derived form carries it under
        // `$description` — the relabel has to find it there too, or the field alone keeps the
        // module's own wording while Title and Timeout get the form's.
        Assert.assertEquals(properties.get("$description").metadata().label(), "Description",
                "the escaped key is relabelled like every other field");
        Assert.assertEquals(properties.get("$description").metadata().description(),
                "Additional context shown alongside the form");
        Assert.assertEquals(properties.get(HumanTaskBuilder.TITLE_KEY).metadata().label(), "Title");
    }

    @Test(description = "A pre-0.9 form — payload, no record fields — keeps its own order untouched")
    public void testPreRecordFormOrderIsStable() {
        Map<String, Property> properties = new LinkedHashMap<>();
        properties.put(HumanTaskBuilder.TASK_NAME_KEY, property("\"approve\"", ParameterData.Kind.REQUIRED));
        properties.put(HumanTaskBuilder.USER_ROLES_KEY, property("\"manager\"", ParameterData.Kind.REQUIRED));
        properties.put(HumanTaskBuilder.PAYLOAD_KEY, property("", ParameterData.Kind.DEFAULTABLE));
        properties.put(HumanTaskBuilder.TITLE_KEY, property("", ParameterData.Kind.DEFAULTABLE));
        properties.put(HumanTaskBuilder.DATABINDING_TYPE_KEY,
                property("anydata", ParameterData.Kind.PARAM_FOR_TYPE_INFER));

        HumanTaskBuilder.relabelHumanTaskFormProperties(properties);

        Assert.assertEquals(new ArrayList<>(properties.keySet()), List.of(
                HumanTaskBuilder.TASK_NAME_KEY, HumanTaskBuilder.USER_ROLES_KEY, HumanTaskBuilder.PAYLOAD_KEY,
                HumanTaskBuilder.TITLE_KEY, HumanTaskBuilder.DATABINDING_TYPE_KEY));
    }

    private static Property property(String value, ParameterData.Kind kind) {
        Property.Builder<Void> builder = new Property.Builder<>(null);
        if (kind != null) {
            builder.codedata().kind(kind.name()).stepOut();
        }
        return builder.value(value).editable(true).build();
    }

    // The arguments of a remote call, parsed from source the way CodeAnalyzer sees them.
    private static SeparatedNodeList<FunctionArgumentNode> arguments(String call) {
        VariableDeclarationNode statement =
                (VariableDeclarationNode) NodeParser.parseStatement("anydata result = check " + call + ";");
        CheckExpressionNode check = (CheckExpressionNode) statement.initializer().orElseThrow();
        return ((RemoteMethodCallActionNode) check.expression()).arguments();
    }
}
