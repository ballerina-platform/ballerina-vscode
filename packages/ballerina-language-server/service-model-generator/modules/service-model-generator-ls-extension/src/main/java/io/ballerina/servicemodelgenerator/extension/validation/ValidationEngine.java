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

import io.ballerina.servicemodelgenerator.extension.model.MetaData;
import io.ballerina.servicemodelgenerator.extension.model.PropertyType;
import io.ballerina.servicemodelgenerator.extension.model.ValidationRule;
import io.ballerina.servicemodelgenerator.extension.model.Value;
import io.ballerina.servicemodelgenerator.extension.validation.rules.CommonRuleValidators;
import io.ballerina.servicemodelgenerator.extension.validation.rules.LsRuleValidators;
import io.ballerina.servicemodelgenerator.extension.validation.rules.RuleValidator;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.logging.Level;
import java.util.logging.Logger;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Walks a {@link Value} tree and evaluates the {@code validations[]} each editable node carries,
 * mirroring the source generator's own walk (only enabled {@code choices} branches, no read-only or
 * unchecked-optional nodes) so a rule never fails on a node that won't contribute to generated source.
 * An unknown rule id is logged and skipped rather than failing generation.
 *
 * @since 1.8.0
 */
public class ValidationEngine {

    private static final Logger LOGGER = Logger.getLogger(ValidationEngine.class.getName());
    private static final Pattern PLACEHOLDER_PATTERN = Pattern.compile("\\{(\\w+)}");

    private final Map<String, RuleValidator> registry;

    public ValidationEngine(Map<String, RuleValidator> registry) {
        this.registry = Map.copyOf(registry);
    }

    /** An engine with the {@code common.*} catalog registered — the save-time re-check. */
    public static ValidationEngine withCommonRules() {
        return new ValidationEngine(CommonRuleValidators.validators());
    }

    /**
     * An engine with both catalogs registered. {@code ls.*} validators skip themselves without a
     * semantic model, so this is safe to use even when no project is loaded.
     */
    public static ValidationEngine withAllRules() {
        Map<String, RuleValidator> registry = new HashMap<>(CommonRuleValidators.validators());
        registry.putAll(LsRuleValidators.validators());
        return new ValidationEngine(registry);
    }

    /** Validates a whole model; {@code context} may be {@link ValidationContext#empty()}. */
    public List<ValidationResult> validate(Map<String, Value> properties, ValidationContext context) {
        List<ValidationResult> results = new ArrayList<>();
        if (properties == null || properties.isEmpty()) {
            return results;
        }
        walkProperties(properties, "", context, results);
        return results;
    }

    /** Validates a single node — the per-field path used by on-demand validation. */
    public List<ValidationResult> validateNode(Value node, String propertyPath, ValidationContext context) {
        List<ValidationResult> results = new ArrayList<>();
        validateSingleNode(node, propertyPath, context, results);
        return results;
    }

    private void walkProperties(Map<String, Value> properties, String parentPath, ValidationContext context,
                                List<ValidationResult> results) {
        for (Map.Entry<String, Value> entry : properties.entrySet()) {
            walkNode(entry.getValue(), childPath(parentPath, entry.getKey()), context, results);
        }
    }

    private void walkNode(Value node, String path, ValidationContext context, List<ValidationResult> results) {
        if (node == null || isExemptFromValidation(node)) {
            return;
        }

        validateSingleNode(node, path, context, results);

        if (node.getProperties() != null) {
            walkProperties(node.getProperties(), path, context, results);
        }

        List<Value> choices = node.getChoices();
        if (choices != null) {
            // Only the selected branch will be generated, so only it can legitimately fail.
            for (int index = 0; index < choices.size(); index++) {
                Value choice = choices.get(index);
                if (choice != null && choice.isEnabled()) {
                    walkNode(choice, path + ".choices." + index, context, results);
                }
            }
        }
    }

    private void validateSingleNode(Value node, String path, ValidationContext context,
                                    List<ValidationResult> results) {
        if (node == null || isExemptFromValidation(node)) {
            return;
        }
        // Only the active type member's rules apply, e.g. a NUMBER member's rule must not run once the
        // field is switched to its EXPRESSION member.
        List<ValidationRule> rules = activeTypeValidations(node);
        if (rules == null || rules.isEmpty()) {
            return;
        }

        for (ValidationRule rule : rules) {
            if (rule == null || rule.getRule() == null || rule.getRule().isBlank()) {
                continue;
            }
            RuleValidator validator = registry.get(rule.getRule());
            if (validator == null) {
                LOGGER.log(Level.FINE, () ->
                        "Skipping unknown validation rule '%s' on '%s'".formatted(rule.getRule(), path));
                continue;
            }

            Map<String, Object> args = rule.getArgs() == null ? Map.of() : rule.getArgs();
            Optional<String> defaultMessage;
            try {
                defaultMessage = validator.validate(node, args, context);
            } catch (Exception e) {
                // A throwing validator must never block generation.
                LOGGER.log(Level.WARNING, e,
                        () -> "Validation rule '%s' failed on '%s'".formatted(rule.getRule(), path));
                continue;
            }
            if (defaultMessage.isEmpty()) {
                continue;
            }

            // A model-supplied message always wins over the rule's default.
            String template = rule.getMessage() == null || rule.getMessage().isBlank()
                    ? defaultMessage.get()
                    : rule.getMessage();
            results.add(new ValidationResult(path, rule.getRule(),
                    interpolate(template, args, node), ValidationSeverity.fromWire(rule.getSeverity())));
        }
    }

    /** Exempt: a read-only value is resolved by the server; an unchecked optional is simply absent. */
    private static boolean isExemptFromValidation(Value node) {
        if (!node.isEditable()) {
            return true;
        }
        return node.isOptional() && !node.isEnabled();
    }

    /**
     * The validations of the node's active type member (the {@code selected} one, else the first).
     * Save-time counterpart of the client's {@code resolveActiveValidations}.
     */
    private static List<ValidationRule> activeTypeValidations(Value node) {
        List<PropertyType> types = node.getTypes();
        if (types == null || types.isEmpty()) {
            return null;
        }
        PropertyType active = types.stream().filter(PropertyType::selected).findFirst().orElse(types.getFirst());
        return active.validations();
    }

    /**
     * Substitutes {@code {placeholder}} occurrences from the rule's args plus the built-ins
     * {@code {label}} and {@code {value}}. An unmatched placeholder is left as-is rather than blanked.
     */
    static String interpolate(String template, Map<String, Object> args, Value node) {
        Map<String, String> substitutions = new HashMap<>();
        args.forEach((key, arg) -> {
            String rendered = arg instanceof Iterable<?> iterable ? joinIterable(iterable)
                    : CommonRuleValidators.argToString(arg);
            if (rendered != null) {
                substitutions.put(key, rendered);
            }
        });
        substitutions.put("label", label(node));
        substitutions.put("value", CommonRuleValidators.text(node));

        Matcher matcher = PLACEHOLDER_PATTERN.matcher(template);
        StringBuilder rendered = new StringBuilder();
        while (matcher.find()) {
            String replacement = substitutions.getOrDefault(matcher.group(1), matcher.group());
            matcher.appendReplacement(rendered, Matcher.quoteReplacement(replacement));
        }
        matcher.appendTail(rendered);
        return rendered.toString();
    }

    private static String joinIterable(Iterable<?> iterable) {
        List<String> parts = new ArrayList<>();
        iterable.forEach(item -> parts.add(CommonRuleValidators.argToString(item)));
        return String.join(", ", parts);
    }

    private static String label(Value node) {
        MetaData metadata = node.getMetadata();
        if (metadata != null && metadata.label() != null && !metadata.label().isBlank()) {
            return metadata.label();
        }
        return "This field";
    }

    private static String childPath(String parentPath, String key) {
        return parentPath.isEmpty() ? key : parentPath + "." + key;
    }
}
