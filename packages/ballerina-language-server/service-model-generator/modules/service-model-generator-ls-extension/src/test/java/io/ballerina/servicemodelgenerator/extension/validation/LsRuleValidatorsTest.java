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

package io.ballerina.servicemodelgenerator.extension.validation;

import io.ballerina.servicemodelgenerator.extension.model.PropertyType;
import io.ballerina.servicemodelgenerator.extension.model.ValidationRule;
import io.ballerina.servicemodelgenerator.extension.model.Value;
import io.ballerina.servicemodelgenerator.extension.validation.rules.LsRuleValidators;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.util.List;
import java.util.Map;

/**
 * Contract tests for the {@code ls.*} validators.
 *
 * <p>The symbol-lookup paths need a loaded project and are exercised by the LS integration suites.
 * What is pinned here is the property that makes those validators safe to ship: <b>they fail toward
 * passing</b>. Without a semantic model, without an enclosing service, or against a type expression
 * they cannot resolve, they must stay silent rather than block generation — a false ERROR is
 * unworkaroundable for the user, so this is the behaviour most worth regression-proofing.
 *
 * @since 1.8.0
 */
public class LsRuleValidatorsTest {

    private static final ValidationEngine ENGINE = ValidationEngine.withAllRules();

    private static Value node(String label, Object value, ValidationRule... rules) {
        return new Value.ValueBuilder()
                .metadata(label, label)
                .value(value)
                .types(List.of(new PropertyType.Builder()
                        .fieldType(Value.FieldType.TEXT)
                        .selected(true)
                        .validations(List.of(rules))
                        .build()))
                .editable(true)
                .enabled(true)
                .build();
    }

    private static ValidationRule rule(String id) {
        return new ValidationRule(id);
    }

    private static ValidationRule rule(String id, Map<String, Object> args) {
        ValidationRule validationRule = new ValidationRule(id);
        validationRule.setArgs(args);
        return validationRule;
    }

    /** Runs with no project context at all — the degradation path. */
    private static List<ValidationResult> runWithoutContext(Value node) {
        return ENGINE.validateNode(node, "field", ValidationContext.empty());
    }

    @Test
    public void testAllLsRulesAreRegisteredOnTheFullEngine() {
        // A rule the engine does not know is silently skipped, so a registration regression would
        // otherwise look exactly like "the value is fine".
        Assert.assertTrue(LsRuleValidators.validators().containsKey("ls.validate.unique.listener.name"));
        Assert.assertTrue(LsRuleValidators.validators().containsKey("ls.validate.unique.function.name"));
        Assert.assertTrue(LsRuleValidators.validators().containsKey("ls.validate.listener.compatible"));
        Assert.assertTrue(LsRuleValidators.validators().containsKey("ls.validate.valid.type"));
        Assert.assertTrue(LsRuleValidators.validators().containsKey("ls.validate.subtype"));
        Assert.assertTrue(LsRuleValidators.validators().containsKey("ls.validate.identifier"));
    }

    @Test
    public void testUnimplementedRulesStayUnregistered() {
        // These are documented as not-yet-implemented; they must degrade to the unknown-rule skip
        // rather than silently resolving to some other validator.
        Assert.assertFalse(LsRuleValidators.validators().containsKey("ls.validate.unique.service.name"));
        Assert.assertFalse(LsRuleValidators.validators().containsKey("ls.validate.expression"));
        Assert.assertEquals(runWithoutContext(node("Path", "", rule("ls.validate.unique.service.name"))), List.of());
    }

    @Test
    public void testSymbolRulesSkipWithoutSemanticModel() {
        Assert.assertEquals(
                runWithoutContext(node("Listener Name", "kafkaListener", rule("ls.validate.unique.listener.name"))),
                List.of(), "no semantic model must mean no verdict");
        Assert.assertEquals(
                runWithoutContext(node("Listener", "myListener", rule("ls.validate.listener.compatible"))),
                List.of());
        Assert.assertEquals(
                runWithoutContext(node("Payload", "Order", rule("ls.validate.valid.type"))),
                List.of());
    }

    @Test
    public void testUniqueFunctionNameSkipsWithoutEnclosingService() {
        Assert.assertEquals(
                runWithoutContext(node("Handler", "onMessage", rule("ls.validate.unique.function.name"))),
                List.of(), "uniqueness is service-scoped; with no service there is nothing to compare against");
    }

    @Test
    public void testSubtypeSkipsWhenConstraintIsAbsent() {
        Assert.assertEquals(runWithoutContext(node("Payload", "Order", rule("ls.validate.subtype"))), List.of());
    }

    @Test
    public void testSubtypeSkipsComplexTypeExpressions() {
        // Resolving these by name is not possible without a compile; reporting them as invalid would
        // block legitimate models (stream/array/union payloads are ordinary in trigger schemas).
        List<String> complexTypes = List.of("stream<Order, error?>", "Order|Cancellation", "map<json>",
                "record {| string id; |}", "[string, int]");
        for (String type : complexTypes) {
            Assert.assertEquals(
                    runWithoutContext(node("Payload", type,
                            rule("ls.validate.subtype", Map.of("typeConstraint", "anydata")))),
                    List.of(), "must skip the unresolvable type expression: " + type);
        }
    }

    @Test
    public void testValidTypeSkipsComplexTypeExpressions() {
        Assert.assertEquals(
                runWithoutContext(node("Payload", "stream<Order, error?>", rule("ls.validate.valid.type"))),
                List.of());
    }

    @Test
    public void testEmptyValueIsNeverJudgedByLsRules() {
        // Emptiness is `common.validate.required`'s call, not any ls.* rule's.
        Assert.assertEquals(runWithoutContext(node("Listener Name", "", rule("ls.validate.unique.listener.name"))),
                List.of());
        Assert.assertEquals(runWithoutContext(node("Payload", "", rule("ls.validate.valid.type"))), List.of());
        Assert.assertEquals(runWithoutContext(node("Handler", "", rule("ls.validate.identifier"))), List.of());
    }

    @Test
    public void testLsIdentifierRejectsReservedWordWithoutAnyContext() {
        // The one ls.* rule that is genuinely pure — it needs no project to reach a verdict.
        List<ValidationResult> results =
                runWithoutContext(node("Handler", "function", rule("ls.validate.identifier")));
        Assert.assertEquals(results.size(), 1);
        Assert.assertEquals(results.getFirst().message(), "Handler is not a valid Ballerina identifier");
        Assert.assertEquals(results.getFirst().severity(), ValidationSeverity.ERROR);
    }

    @Test
    public void testReadOnlyNodeIsExemptFromLsRulesToo() {
        Value readOnly = new Value.ValueBuilder()
                .metadata("Listener Name", "Listener Name")
                .value("kafkaListener")
                .types(List.of(new PropertyType.Builder()
                        .fieldType(Value.FieldType.IDENTIFIER)
                        .selected(true)
                        .validations(List.of(rule("ls.validate.identifier")))
                        .build()))
                .editable(false)
                .enabled(true)
                .build();
        Assert.assertEquals(runWithoutContext(readOnly), List.of());
    }

    @Test
    public void testCommonAndLsRulesCoexistOnOneNode() {
        // The full engine must run both catalogs over the same node in one pass.
        List<ValidationResult> results = runWithoutContext(node("Handler", "function",
                rule("common.validate.identifier"), rule("ls.validate.identifier")));
        Assert.assertEquals(results.size(), 2, "expected both catalogs to fire but got " + results);
        Assert.assertEquals(results.get(0).rule(), "common.validate.identifier");
        Assert.assertEquals(results.get(1).rule(), "ls.validate.identifier");
    }
}
