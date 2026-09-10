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

package io.ballerina.servicemodelgenerator.extension.connector;

import io.ballerina.modelgenerator.commons.trigger.models.TriggerUISchemaModel;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static io.ballerina.servicemodelgenerator.extension.util.Constants.CD_TYPE_EXISTING_LISTENER;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.CD_TYPE_LISTENER_CONFIG;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.CD_TYPE_LISTENER_TYPE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.PROP_KEY_LISTENER_TYPE;

/**
 * Builds the init form's listener field from a connector's declared
 * {@link TriggerUISchemaModel.ListenerModel}s.
 *
 * <pre>
 * listener                        CHOICE (LISTENER_CONFIG)
 *   [0] Create New Listener
 *         listenerType            CHOICE (LISTENER_TYPE) — only when there is more than one listener
 *           [i] &lt;listener&gt;
 *                 listenerConfig  GROUP_SECTION — what constructs the listener
 *                 &lt;service&gt;       this listener's own service-level fields, after the section
 *   [1] Use Existing Listener
 *         listener                the existing-listener selector
 * </pre>
 *
 * <p>With one listener no {@code listenerType} level is emitted at all, so the result is what a
 * single-listener connector produced before this existed.
 *
 * @since 1.10.0
 */
public final class ListenerChoiceDeriver {

    /** Reserved: an entry's {@code initProperties} may not use this key. */
    static final String LISTENER_CONFIG_GROUP_KEY = "listenerConfig";

    /** The widget for the use-existing selector when a model states none. */
    static final String DEFAULT_EXISTING_LISTENER_FIELD_TYPE = "SINGLE_SELECT_LISTENER";

    private ListenerChoiceDeriver() {
    }

    /**
     * The {@code LISTENER_CONFIG} choice for {@code listeners}, or empty when there are none to describe.
     * Equivalent to {@link #derive(List, String, boolean, TriggerUISchemaModel.ListenerFormModel)} with
     * {@code reusable = false} -- the legacy/bundled-fixture derivation path, which has no L1 to read a
     * reusability signal from.
     *
     * @param listeners                 the connector's declared listeners, in declaration order
     * @param existingListenerFieldType the widget for the use-existing selector; null falls back to
     *                                  {@link #DEFAULT_EXISTING_LISTENER_FIELD_TYPE}
     * @param form                      presentation text for the section and the switch; null takes the
     *                                  generic defaults
     */
    public static Optional<TriggerUISchemaModel.Property> derive(
            List<TriggerUISchemaModel.ListenerModel> listeners, String existingListenerFieldType,
            TriggerUISchemaModel.ListenerFormModel form) {
        return derive(listeners, existingListenerFieldType, false, form);
    }

    /**
     * As the other overload, with a signal for whether the use-existing branch should be directly
     * usable by default (an L1 {@code multipleServicesAllowed: true} listener, or several declared
     * listeners) rather than requiring the connector's L2 to opt it in via {@code useExistingEditable}.
     *
     * @param listeners                 the connector's declared listeners, in declaration order
     * @param existingListenerFieldType the widget for the use-existing selector; null falls back to
     *                                  {@link #DEFAULT_EXISTING_LISTENER_FIELD_TYPE}
     * @param reusable                  the use-existing branch's default {@code editable}, absent an
     *                                  explicit {@code useExistingEditable} override
     * @param form                      presentation text for the section and the switch; null takes the
     *                                  generic defaults
     */
    public static Optional<TriggerUISchemaModel.Property> derive(
            List<TriggerUISchemaModel.ListenerModel> listeners, String existingListenerFieldType,
            boolean reusable, TriggerUISchemaModel.ListenerFormModel form) {
        if (listeners == null || listeners.isEmpty()) {
            return Optional.empty();
        }
        List<TriggerUISchemaModel.ListenerModel> ordered = deprecatedLast(listeners);
        int defaultIndex = defaultIndex(ordered);

        Map<String, TriggerUISchemaModel.Property> createNewProps = new LinkedHashMap<>();
        if (ordered.size() == 1) {
            createNewProps.putAll(branchProperties(ordered.get(0), form));
        } else {
            createNewProps.put(PROP_KEY_LISTENER_TYPE, listenerTypeChoice(ordered, defaultIndex, form));
        }

        Map<String, TriggerUISchemaModel.Property> useExistingProps = new LinkedHashMap<>();
        // The model's own widget (e.g. a per-listener SINGLE_SELECT_LISTENER) wins over the caller's
        // default; a single declared listener's own qualified type is the ballerinaType default.
        String resolvedFieldType = form != null && form.existingListenerWidget() != null
                ? form.existingListenerWidget() : existingListenerFieldType;
        String defaultBallerinaType = ordered.size() == 1 ? ordered.get(0).ballerinaType() : null;
        useExistingProps.put("existingListener",
                existingListenerSelector(resolvedFieldType, defaultBallerinaType, form));

        boolean useExistingEditable = form != null && form.useExistingEditable() != null
                ? form.useExistingEditable() : reusable;

        TriggerUISchemaModel.Property createNew = formBranch(
                orDefault(form == null ? null : form.createNew(),
                "Create New Listener", "Create a new listener"), true, true, createNewProps,
                hasExtendedForm(form));
        TriggerUISchemaModel.Property useExisting = formBranch(
                orDefault(form == null ? null : form.useExisting(),
                        "Use Existing Listener", "Attach to an already-declared listener"),
                form != null && Boolean.TRUE.equals(form.useExistingEnabled()),
                useExistingEditable,
                useExistingProps, hasExtendedForm(form));

        return Optional.of(new TriggerUISchemaModel.Property(
                orDefault(hasExtendedForm(form) ? form.section() : null,
                        "Listener", "The listener this service attaches to"),
                true, true, false, false, null, "createNew", List.of(choiceType()), null,
                List.of(createNew, useExisting), null, codedata(CD_TYPE_LISTENER_CONFIG), null));
    }

    /** The per-listener selector; its branches carry whatever deprecation each listener declares. */
    private static TriggerUISchemaModel.Property listenerTypeChoice(
            List<TriggerUISchemaModel.ListenerModel> ordered, int defaultIndex,
            TriggerUISchemaModel.ListenerFormModel form) {
        List<TriggerUISchemaModel.Property> branches = new ArrayList<>();
        for (int i = 0; i < ordered.size(); i++) {
            TriggerUISchemaModel.ListenerModel listener = ordered.get(i);
            branches.add(formBranch(branchMetadata(listener), i == defaultIndex, true,
                    branchProperties(listener, form), hasExtendedForm(form)));
        }
        return new TriggerUISchemaModel.Property(
                orDefault(form == null ? null : form.typeSelector(),
                        "Listener Type", "The type of listener to create"),
                true, true, false, false, null, String.valueOf(defaultIndex), List.of(choiceType()), null,
                branches, null, codedata(CD_TYPE_LISTENER_TYPE), null);
    }

    /**
     * The section that constructs one listener, then any service-level fields it alone gives meaning to.
     * Those sit outside the section: they configure the service, not the listener. When there is only
     * one declared listener type, {@link TriggerUIMetadataCompiler} promotes these out of this branch
     * into the top-level {@code initProperties} -- they must show regardless of whether the user creates
     * a new listener or reuses an existing one. With several listener types they stay right here, since
     * a field one type alone gives meaning to (e.g. a base path that only applies to an HTTP-shaped
     * transport) must not show while a different type is selected.
     */
    private static Map<String, TriggerUISchemaModel.Property> branchProperties(
            TriggerUISchemaModel.ListenerModel listener, TriggerUISchemaModel.ListenerFormModel form) {
        Map<String, TriggerUISchemaModel.Property> properties = new LinkedHashMap<>();
        properties.put(LISTENER_CONFIG_GROUP_KEY, section(
                listener.initProperties() == null ? Map.of() : listener.initProperties(), form));
        if (listener.serviceProperties() != null) {
            properties.putAll(listener.serviceProperties());
        }
        return properties;
    }

    /** The section a listener's constructor fields are presented in. */
    private static TriggerUISchemaModel.Property section(
            Map<String, TriggerUISchemaModel.Property> fields, TriggerUISchemaModel.ListenerFormModel form) {
        TriggerUISchemaModel.PropertyType type = new TriggerUISchemaModel.PropertyType(
                "GROUP_SECTION", true, null, null, null, null, null, null);
        return new TriggerUISchemaModel.Property(
                orDefault(form == null ? null
                                : form.listenerConfig() == null ? form.section() : form.listenerConfig(),
                        "Listener Configuration", "Configure the listener."),
                true, true, false, false, null, null, List.of(type), null, null,
                new LinkedHashMap<>(fields), null, null);
    }

    private static boolean hasExtendedForm(TriggerUISchemaModel.ListenerFormModel form) {
        return form != null && (form.createNew() != null || form.useExisting() != null
                || form.listenerConfig() != null);
    }

    /** {@code declared} where it states a label, else the generic wording. */
    private static TriggerUISchemaModel.Metadata orDefault(TriggerUISchemaModel.Metadata declared, String label,
                                                           String description) {
        if (declared == null || declared.label() == null || declared.label().isBlank()) {
            return metadata(label, description);
        }
        return declared;
    }

    private static TriggerUISchemaModel.Property existingListenerSelector(
            String fieldType, String defaultBallerinaType, TriggerUISchemaModel.ListenerFormModel form) {
        TriggerUISchemaModel.Metadata metadata = form == null ? null : form.existingListener();
        String ballerinaType = form != null && form.existingListenerBallerinaType() != null
                ? form.existingListenerBallerinaType() : defaultBallerinaType;
        List<String> items = form == null ? null : form.existingListenerItems();
        Object value = form == null ? null : form.existingListenerValue();
        TriggerUISchemaModel.PropertyType type = new TriggerUISchemaModel.PropertyType(
                fieldType == null || fieldType.isBlank() ? DEFAULT_EXISTING_LISTENER_FIELD_TYPE : fieldType,
                true, ballerinaType, null, null, null, null, null);
        return new TriggerUISchemaModel.Property(
                metadata == null ? metadata("Listener", "The existing listener to attach to") : metadata,
                true, true, false, false, null, null, value, List.of(type), items, null, null,
                codedata(CD_TYPE_EXISTING_LISTENER), null);
    }

    /** Non-deprecated listeners first, each group keeping its declaration order. */
    private static List<TriggerUISchemaModel.ListenerModel> deprecatedLast(
            List<TriggerUISchemaModel.ListenerModel> listeners) {
        List<TriggerUISchemaModel.ListenerModel> ordered = new ArrayList<>();
        listeners.stream().filter(listener -> !isDeprecated(listener)).forEach(ordered::add);
        listeners.stream().filter(ListenerChoiceDeriver::isDeprecated).forEach(ordered::add);
        return ordered;
    }

    /** The branch selected when the form opens: an explicit {@code enabled}, else the first entry. */
    private static int defaultIndex(List<TriggerUISchemaModel.ListenerModel> ordered) {
        for (int i = 0; i < ordered.size(); i++) {
            if (Boolean.TRUE.equals(ordered.get(i).enabled())) {
                return i;
            }
        }
        return 0;
    }

    private static boolean isDeprecated(TriggerUISchemaModel.ListenerModel listener) {
        return listener.metadata() != null && Boolean.TRUE.equals(listener.metadata().deprecated());
    }

    /** A branch's metadata, falling back to its humanised type name when it states no label. */
    private static TriggerUISchemaModel.Metadata branchMetadata(TriggerUISchemaModel.ListenerModel listener) {
        TriggerUISchemaModel.Metadata declared = listener.metadata();
        if (declared != null && declared.label() != null && !declared.label().isBlank()) {
            return declared;
        }
        String label = listener.name() == null || listener.name().isBlank()
                ? "Listener" : TriggerModelSynthesizer.humanize(listener.name());
        if (declared == null) {
            return metadata(label, null);
        }
        return new TriggerUISchemaModel.Metadata(label, declared.description(), declared.notice(),
                declared.icon(), declared.subLabel(), declared.addLabel(), declared.groupName(),
                declared.badge(), declared.deprecated(), declared.addDescription());
    }

    private static TriggerUISchemaModel.Property formBranch(TriggerUISchemaModel.Metadata metadata,
                                                           boolean enabled, boolean editable,
                                                           Map<String, TriggerUISchemaModel.Property> properties,
                                                           boolean includeFormType) {
        return new TriggerUISchemaModel.Property(metadata, enabled, editable, false, false, null, null,
                includeFormType ? List.of(new TriggerUISchemaModel.PropertyType(
                        "FORM", true, null, null, null, null, null, null)) : null,
                null, null, properties, codedata(null), null);
    }

    private static TriggerUISchemaModel.PropertyType choiceType() {
        return new TriggerUISchemaModel.PropertyType("CHOICE", true, null, null, null, null, null, null);
    }

    private static TriggerUISchemaModel.Metadata metadata(String label, String description) {
        return new TriggerUISchemaModel.Metadata(label, description, null, null, null, null, null, null, null,
                null);
    }

    private static TriggerUISchemaModel.Codedata codedata(String type) {
        return TriggerUISchemaModel.Codedata.builder().type(type).build();
    }
}
