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

import io.ballerina.flowmodelgenerator.core.model.ItemOption;
import io.ballerina.flowmodelgenerator.core.model.NodeBuilder;
import io.ballerina.flowmodelgenerator.core.model.Option;
import io.ballerina.flowmodelgenerator.core.model.Property;
import io.ballerina.flowmodelgenerator.core.model.node.ActivityCallBuilder.ReviewFormValues;
import io.ballerina.flowmodelgenerator.core.model.node.ActivityCallBuilder.ReviewKeys;
import io.ballerina.flowmodelgenerator.core.model.node.ActivityCallBuilder.ReviewText;
import io.ballerina.flowmodelgenerator.core.utils.WorkflowUtil;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * The approval-policy dropdown a gated activity or tool form carries: no approval, or a human
 * approval whose review fields render under the dropdown. Built the way the retry-policy dropdown
 * is, with the review fields stored in hidden root properties under approval-prefixed keys.
 *
 * @since 1.8.0
 */
public final class ApprovalPolicyForm {

    public static final String KEY = WorkflowUtil.APPROVAL_POLICY_FIELD;
    public static final String NO_APPROVAL_VALUE = "NoApproval";
    public static final String NIL_VALUE = "()";
    public static final String HUMAN_APPROVAL_VALUE = "HumanApproval";
    private static final String LABEL = "Approval Policy";
    private static final String DOC = "Whether a person approves before this runs: no approval, or a review "
            + "a reviewer proceeds with (optionally editing the arguments) or rejects";
    private static final String TITLE_DOC = "Short summary shown in the reviewer's inbox. Defaults to a phrase "
            + "naming what is being approved.";
    private static final String DESCRIPTION_DOC = "Context shown with the decision. Defaults to a description "
            + "of the call and its arguments.";

    public static final String USER_ROLES_KEY = "approvalUserRoles";
    public static final String USERS_KEY = "approvalUsers";
    public static final String EXCLUDED_USERS_KEY = "approvalExcludedUsers";
    public static final String EXCLUDED_ROLES_KEY = "approvalExcludedRoles";
    public static final String ADMINISTRATOR_ROLES_KEY = "approvalAdministratorRoles";
    public static final String ADMINISTRATOR_USERS_KEY = "approvalAdministratorUsers";
    public static final ReviewKeys REVIEW_KEYS = new ReviewKeys(USER_ROLES_KEY, USERS_KEY, EXCLUDED_USERS_KEY,
            EXCLUDED_ROLES_KEY, ADMINISTRATOR_ROLES_KEY, ADMINISTRATOR_USERS_KEY, WorkflowUtil.APPROVAL_TITLE_KEY,
            WorkflowUtil.APPROVAL_DESCRIPTION_KEY, WorkflowUtil.APPROVAL_TIMEOUT_KEY);
    /** Every property key the form owns: the dropdown and its hidden review fields. */
    public static final Set<String> PROPERTY_KEYS = propertyKeys();

    private static final String USER_ROLES_FIELD = "userRoles";

    private ApprovalPolicyForm() {
    }

    /**
     * The dropdown's decomposition of an {@code approvalPolicy} source value.
     *
     * @param dropdownValue the selected option, or the source itself when the form cannot edit it
     * @param review        the review fields, empty unless a review definition was read
     */
    public record Form(String dropdownValue, ReviewFormValues review) {
    }

    private static Set<String> propertyKeys() {
        Set<String> keys = new LinkedHashSet<>();
        keys.add(KEY);
        keys.addAll(REVIEW_KEYS.all());
        return Set.copyOf(keys);
    }

    /**
     * Adds the dropdown, its per-option review fields and the hidden root properties that hold
     * their values.
     *
     * @param nodeBuilder   the form being built
     * @param dropdownValue the selected option
     * @param review        the review fields to seed
     */
    public static void addFormProperties(NodeBuilder nodeBuilder, String dropdownValue, ReviewFormValues review) {
        addFormProperties(nodeBuilder, dropdownValue, review, true);
    }

    /**
     * Adds the dropdown, its per-option review fields and the hidden root properties that hold
     * their values.
     *
     * @param nodeBuilder   the form being built
     * @param dropdownValue the selected option
     * @param review        the review fields to seed
     * @param dualModeText  whether the title and description offer a text box beside the expression
     *                      editor. A capability's values reach the form as plain strings with no
     *                      mode beside them, so its wording fields are expressions only: a
     *                      reference carried as text would be quoted into a literal on save.
     */
    public static void addFormProperties(NodeBuilder nodeBuilder, String dropdownValue, ReviewFormValues review,
                                         boolean dualModeText) {
        String selectedValue = dropdownValue == null || dropdownValue.isBlank() ? NO_APPROVAL_VALUE : dropdownValue;
        List<Option> options = new ArrayList<>(List.of(
                new Option("No Approval", NO_APPROVAL_VALUE),
                new Option("Human Approval", HUMAN_APPROVAL_VALUE)));
        // A policy the form cannot represent (a const or variable) is carried as its own option, so it
        // renders as the selection and is written back verbatim on save.
        boolean opaquePolicy = options.stream().noneMatch(option -> selectedValue.equals(option.value()));
        if (opaquePolicy) {
            options.add(new Option(selectedValue, selectedValue));
        }
        Map<String, Map<String, Property>> dynamicFields = new LinkedHashMap<>();
        dynamicFields.put(NO_APPROVAL_VALUE, Map.of());
        dynamicFields.put(HUMAN_APPROVAL_VALUE,
                ActivityCallBuilder.reviewSubProperties(REVIEW_KEYS, TITLE_DOC, DESCRIPTION_DOC, dualModeText));
        if (opaquePolicy) {
            dynamicFields.put(selectedValue, Map.of());
        }
        nodeBuilder.properties().custom()
                .metadata()
                    .label(LABEL)
                    .description(DOC)
                    .stepOut()
                .type()
                    .fieldType(Property.ValueType.DROPDOWN_CHOICE)
                    .options(options)
                    .selected(true)
                    .stepOut()
                .value(selectedValue)
                .editable(true)
                .itemOptions(ItemOption.from(options))
                .dynamicFormFields(dynamicFields)
                .stepOut()
                .addProperty(KEY);
        ActivityCallBuilder.addHiddenReviewProperties(nodeBuilder, REVIEW_KEYS, review, TITLE_DOC, DESCRIPTION_DOC,
                dualModeText);
    }

    /**
     * The {@code approvalPolicy} value the form declares, or {@code null} for no approval (the
     * default, not emitted).
     *
     * @param properties the node's properties
     * @return the policy source or {@code null}
     */
    public static String literal(Map<String, Property> properties) {
        if (properties == null) {
            return null;
        }
        Property policy = properties.get(KEY);
        String value = policy == null || policy.value() == null ? "" : policy.value().toString().trim();
        if (value.isBlank() || NO_APPROVAL_VALUE.equals(value)) {
            return null;
        }
        if (HUMAN_APPROVAL_VALUE.equals(value)) {
            return "{" + String.join(", ", ActivityCallBuilder.reviewRecordFields(properties, REVIEW_KEYS)) + "}";
        }
        return value;
    }

    /**
     * Reads an {@code approvalPolicy} source value into the dropdown selection and review fields.
     *
     * @param rawValue the source, possibly {@code null}
     * @return the form's view of it
     */
    public static Form normalize(String rawValue) {
        if (rawValue == null || rawValue.isBlank()) {
            return new Form(NO_APPROVAL_VALUE, ReviewFormValues.empty());
        }
        String trimmed = rawValue.trim();
        if (trimmed.startsWith("{")) {
            Map<String, String> fields = WorkflowUtil.parseRecordLiteral(trimmed);
            return new Form(HUMAN_APPROVAL_VALUE, new ReviewFormValues(
                    nilAsBlank(fields.getOrDefault(USER_ROLES_FIELD, "")),
                    fields.getOrDefault(WorkflowUtil.USERS_KEY, ""),
                    fields.getOrDefault(WorkflowUtil.EXCLUDED_USERS_KEY, ""),
                    fields.getOrDefault(WorkflowUtil.EXCLUDED_ROLES_KEY, ""),
                    fields.getOrDefault(WorkflowUtil.ADMINISTRATOR_ROLES_KEY, ""),
                    fields.getOrDefault(WorkflowUtil.ADMINISTRATOR_USERS_KEY, ""),
                    ReviewText.fromSource(fields.get("title")),
                    ReviewText.fromSource(fields.get("description")),
                    fields.getOrDefault("timeout", "")));
        }
        // `NoApproval` is `()` in the module, so a declaration may hold either spelling and both
        // mean the same absence of a gate.
        if (NIL_VALUE.equals(trimmed) || WorkflowUtil.stripModulePrefix(trimmed).equals(NO_APPROVAL_VALUE)) {
            return new Form(NO_APPROVAL_VALUE, ReviewFormValues.empty());
        }
        return new Form(trimmed, ReviewFormValues.empty());
    }

    // `userRoles: ()` says the users alone decide; the form shows that as an empty roles field.
    private static String nilAsBlank(String value) {
        return "()".equals(value) ? "" : value;
    }
}
