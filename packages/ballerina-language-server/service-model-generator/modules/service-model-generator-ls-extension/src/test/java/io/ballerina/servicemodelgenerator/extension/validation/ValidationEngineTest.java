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
import org.testng.Assert;
import org.testng.annotations.Test;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Unit tests for the {@code common.*} rule catalog and the tree walk that drives it. Every case runs
 * without a language server: the pure validators need only a {@link Value} and its args.
 *
 * @since 1.8.0
 */
public class ValidationEngineTest {

    private static final ValidationEngine ENGINE = ValidationEngine.withCommonRules();

    // ---- helpers ----------------------------------------------------------------------------

    /** A type member carrying the given rules, marked selected so the engine treats it as active. */
    private static PropertyType selectedTypeWith(Value.FieldType fieldType, ValidationRule... rules) {
        return new PropertyType.Builder()
                .fieldType(fieldType)
                .selected(true)
                .validations(List.of(rules))
                .build();
    }

    private static Value node(String label, Object value, ValidationRule... rules) {
        Value.ValueBuilder builder = new Value.ValueBuilder();
        builder.metadata(label, label)
                .value(value)
                .types(List.of(selectedTypeWith(Value.FieldType.TEXT, rules)))
                .editable(true)
                .enabled(true);
        return builder.build();
    }

    /** A multi-value node (TEXT_SET/EXPRESSION_SET) carrying the given entries. */
    private static Value multiValueNode(String label, List<Object> values, ValidationRule... rules) {
        return new Value.ValueBuilder()
                .metadata(label, label)
                .setValues(values)
                .types(List.of(selectedTypeWith(Value.FieldType.TEXT_SET, rules)))
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

    private static List<ValidationResult> run(Value node) {
        return ENGINE.validateNode(node, "field", ValidationContext.empty());
    }

    private static void assertPasses(Value node) {
        Assert.assertEquals(run(node), List.of(), "expected no failures");
    }

    private static ValidationResult assertFails(Value node) {
        List<ValidationResult> results = run(node);
        Assert.assertEquals(results.size(), 1, "expected exactly one failure but got " + results);
        return results.getFirst();
    }

    // ---- required ---------------------------------------------------------------------------

    @Test
    public void testRequiredFailsOnBlank() {
        ValidationResult result = assertFails(node("Client Secret", "", rule("common.validate.required")));
        Assert.assertEquals(result.message(), "Client Secret is required");
        Assert.assertEquals(result.severity(), ValidationSeverity.ERROR);
        Assert.assertEquals(result.propertyPath(), "field");
    }

    @Test
    public void testRequiredPassesOnValue() {
        assertPasses(node("Client Secret", "shhh", rule("common.validate.required")));
    }

    @Test
    public void testRequiredTreatsWhitespaceAsBlank() {
        assertFails(node("Client Secret", "   ", rule("common.validate.required")));
    }

    // ---- identifier -------------------------------------------------------------------------

    @Test
    public void testIdentifierAcceptsValidName() {
        assertPasses(node("Listener Name", "kafkaListener", rule("common.validate.identifier")));
    }

    @Test
    public void testIdentifierRejectsReservedWord() {
        assertFails(node("Listener Name", "service", rule("common.validate.identifier")));
    }

    @Test
    public void testIdentifierAcceptsQuotedReservedWord() {
        assertPasses(node("Listener Name", "'service", rule("common.validate.identifier")));
    }

    @Test
    public void testIdentifierRejectsLeadingDigit() {
        assertFails(node("Listener Name", "1listener", rule("common.validate.identifier")));
    }

    @Test
    public void testIdentifierDefersEmptinessToRequired() {
        // Emptiness is `required`'s concern — identifier alone must not fire on a blank value.
        assertPasses(node("Listener Name", "", rule("common.validate.identifier")));
    }

    // ---- number.range / port ----------------------------------------------------------------

    @Test
    public void testNumberRangeWithinBounds() {
        assertPasses(node("Port", "8080",
                rule("common.validate.number.range", Map.of("min", 1, "max", 65535))));
    }

    @Test
    public void testNumberRangeInterpolatesBothBounds() {
        ValidationResult result = assertFails(node("Port", "70000",
                rule("common.validate.number.range", Map.of("min", 1, "max", 65535))));
        Assert.assertEquals(result.message(), "Port must be between 1 and 65535");
    }

    @Test
    public void testNumberRangeOneSidedMessage() {
        ValidationResult result = assertFails(node("Retries", "-1",
                rule("common.validate.number.range", Map.of("min", 0))));
        Assert.assertEquals(result.message(), "Retries must be at least 0");
    }

    @Test
    public void testPortSkipsNonNumericValue() {
        // A listener expression is legal in this field, so the port rule must not judge it.
        assertPasses(node("Listen On", "httpListener", rule("common.validate.port")));
    }

    @Test
    public void testPortUsesDefaultBoundsAndWarns() {
        ValidationRule portRule = rule("common.validate.port");
        portRule.setSeverity("WARNING");
        ValidationResult result = assertFails(node("Listen On", "99999", portRule));
        Assert.assertEquals(result.severity(), ValidationSeverity.WARNING);
        Assert.assertEquals(result.message(), "Listen On must be a valid port (1–65535)");
    }

    // ---- regex / lengths --------------------------------------------------------------------

    @Test
    public void testRegexMatches() {
        assertPasses(node("Topic", "orders",
                rule("common.validate.regex", Map.of("pattern", "^[a-z]+$"))));
    }

    @Test
    public void testRegexRejectsMismatch() {
        assertFails(node("Topic", "Orders-1",
                rule("common.validate.regex", Map.of("pattern", "^[a-z]+$"))));
    }

    @Test
    public void testInvalidRegexPatternIsSkipped() {
        // An unparseable pattern is an authoring error and must never fail the user's input.
        assertPasses(node("Topic", "anything",
                rule("common.validate.regex", Map.of("pattern", "[unclosed"))));
    }

    @Test
    public void testMinLength() {
        ValidationResult result = assertFails(node("Secret", "abc",
                rule("common.validate.min.length", Map.of("min", 8))));
        Assert.assertEquals(result.message(), "Secret must be at least 8 characters");
    }

    @Test
    public void testMaxLength() {
        assertFails(node("Name", "abcdefghijk", rule("common.validate.max.length", Map.of("max", 5))));
    }

    @Test
    public void testMissingRequiredArgSkipsRule() {
        assertPasses(node("Secret", "abc", rule("common.validate.min.length")));
    }

    @Test
    public void testRegexChecksEachItemOfAMultiValueField() {
        // The MSSQL `databases` field ships exactly this rule; each entry must be a non-empty
        // quoted/backtick string. Joining the entries with a comma would never match, so a pass on
        // valid entries proves the check is per item, not on the joined form.
        ValidationRule regex = rule("common.validate.regex",
                Map.of("pattern", "^string `.+`$|^\".+\"$"));
        assertPasses(multiValueNode("Databases", List.of("\"db1\"", "\"db2\""), regex));

        List<ValidationResult> results = run(multiValueNode("Databases",
                List.of("\"db1\"", "notquoted"), regex));
        Assert.assertEquals(results.size(), 1, "one bad entry must fail the field: " + results);
        Assert.assertEquals(results.getFirst().message(), "Databases has an invalid format");
    }

    @Test
    public void testLengthRulesCheckEachItemOfAMultiValueField() {
        assertPasses(multiValueNode("Tags", List.of("ab", "cde"),
                rule("common.validate.min.length", Map.of("min", 2))));
        Assert.assertEquals(run(multiValueNode("Tags", List.of("ab", "c"),
                rule("common.validate.min.length", Map.of("min", 2)))).size(), 1);
        Assert.assertEquals(run(multiValueNode("Tags", List.of("ab", "cdef"),
                rule("common.validate.max.length", Map.of("max", 3)))).size(), 1);
    }

    // ---- url / service.path / enum / non.negative -------------------------------------------

    @Test
    public void testUrlAcceptsAbsoluteUrl() {
        assertPasses(node("Callback", "https://example.com/hook", rule("common.validate.url")));
    }

    @Test
    public void testUrlAcceptsQuotedLiteral() {
        // Models carry URL defaults as Ballerina string literals.
        assertPasses(node("Callback", "\"https://example.com/hook\"", rule("common.validate.url")));
    }

    @Test
    public void testUrlRejectsRelativePath() {
        assertFails(node("Callback", "/hook", rule("common.validate.url")));
    }

    @Test
    public void testUrlEnforcesSchemeAllowList() {
        assertFails(node("Callback", "http://example.com",
                rule("common.validate.url", Map.of("schemes", List.of("https")))));
    }

    @Test
    public void testServicePathAcceptsSegments() {
        assertPasses(node("Base Path", "/api/orders", rule("common.validate.service.path")));
    }

    @Test
    public void testServicePathRejectsSpaces() {
        assertFails(node("Base Path", "/api orders", rule("common.validate.service.path")));
    }

    @Test
    public void testEnumInterpolatesValuesList() {
        ValidationResult result = assertFails(node("Mode", "FAST",
                rule("common.validate.enum", Map.of("values", List.of("SAFE", "SLOW")))));
        Assert.assertEquals(result.message(), "Mode must be one of: SAFE, SLOW");
    }

    @Test
    public void testNonNegative() {
        assertFails(node("Retries", "-3", rule("common.validate.non.negative")));
        assertPasses(node("Retries", "0", rule("common.validate.non.negative")));
    }

    // ---- message override / interpolation ---------------------------------------------------

    @Test
    public void testModelSuppliedMessageWinsOverDefault() {
        ValidationRule portRule = rule("common.validate.number.range", Map.of("min", 1, "max", 65535));
        portRule.setMessage("Port must be between {min} and {max}");
        ValidationResult result = assertFails(node("Listen On", "0", portRule));
        Assert.assertEquals(result.message(), "Port must be between 1 and 65535");
    }

    @Test
    public void testMessageInterpolatesLabelAndValue() {
        ValidationRule identifierRule = rule("common.validate.identifier");
        identifierRule.setMessage("{label}: '{value}' is not usable");
        ValidationResult result = assertFails(node("Listener Name", "1bad", identifierRule));
        Assert.assertEquals(result.message(), "Listener Name: '1bad' is not usable");
    }

    @Test
    public void testUnmatchedPlaceholderIsLeftIntact() {
        // An authoring mistake stays visible rather than rendering as blank.
        ValidationRule requiredRule = rule("common.validate.required");
        requiredRule.setMessage("{label} needs {nonexistent}");
        Assert.assertEquals(assertFails(node("Secret", "", requiredRule)).message(),
                "Secret needs {nonexistent}");
    }

    // ---- degradation ------------------------------------------------------------------------

    @Test
    public void testUnknownRuleIsSkipped() {
        assertPasses(node("Secret", "", rule("common.validate.from.the.future")));
    }

    @Test
    public void testLsRulesAreNotRunByTheCommonEngine() {
        assertPasses(node("Listener Name", "", rule("ls.validate.unique.listener.name")));
    }

    @Test
    public void testReadOnlyNodeIsNeverValidated() {
        Value readOnly = new Value.ValueBuilder()
                .metadata("Resolved Type", "Resolved Type")
                .value("")
                .types(List.of(selectedTypeWith(Value.FieldType.TEXT, rule("common.validate.required"))))
                .editable(false)
                .enabled(true)
                .build();
        Assert.assertEquals(run(readOnly), List.of());
    }

    @Test
    public void testDisabledOptionalNodeIsNeverValidated() {
        Value disabled = new Value.ValueBuilder()
                .metadata("Auth", "Auth")
                .value("")
                .types(List.of(selectedTypeWith(Value.FieldType.TEXT, rule("common.validate.required"))))
                .editable(true)
                .enabled(false)
                .optional(true)
                .build();
        Assert.assertEquals(run(disabled), List.of());
    }

    // ---- tree walk --------------------------------------------------------------------------

    @Test
    public void testWalkDescendsIntoNestedProperties() {
        Value child = node("Client Secret", "", rule("common.validate.required"));
        Value parent = new Value.ValueBuilder()
                .metadata("Auth", "Auth")
                .editable(true)
                .enabled(true)
                .setProperties(new LinkedHashMap<>(Map.of("clientSecret", child)))
                .build();

        List<ValidationResult> results = ENGINE.validate(Map.of("auth", parent), ValidationContext.empty());
        Assert.assertEquals(results.size(), 1);
        Assert.assertEquals(results.getFirst().propertyPath(), "auth.clientSecret");
    }

    @Test
    public void testWalkVisitsOnlyTheEnabledChoiceBranch() {
        Value selectedLeaf = node("Private Key", "", rule("common.validate.required"));
        Value unselectedLeaf = node("Password", "", rule("common.validate.required"));

        Value selected = new Value.ValueBuilder()
                .metadata("Key Auth", "Key Auth").editable(true).enabled(true)
                .setProperties(new LinkedHashMap<>(Map.of("privateKey", selectedLeaf))).build();
        Value unselected = new Value.ValueBuilder()
                .metadata("Basic Auth", "Basic Auth").editable(true).enabled(false)
                .setProperties(new LinkedHashMap<>(Map.of("password", unselectedLeaf))).build();

        Value choice = new Value.ValueBuilder()
                .metadata("Auth", "Auth").editable(true).enabled(true).build();
        choice.setChoices(List.of(selected, unselected));

        List<ValidationResult> results = ENGINE.validate(Map.of("auth", choice), ValidationContext.empty());
        Assert.assertEquals(results.size(), 1, "only the selected branch may fail but got " + results);
        Assert.assertEquals(results.getFirst().propertyPath(), "auth.choices.0.privateKey");
    }

    @Test
    public void testBlocksGenerationIgnoresWarnings() {
        ValidationRule warningRule = rule("common.validate.port");
        warningRule.setSeverity("WARNING");
        List<ValidationResult> warnings = run(node("Listen On", "99999", warningRule));
        Assert.assertFalse(SaveTimeValidator.blocksGeneration(warnings));

        List<ValidationResult> errors = run(node("Secret", "", rule("common.validate.required")));
        Assert.assertTrue(SaveTimeValidator.blocksGeneration(errors));
    }
}
