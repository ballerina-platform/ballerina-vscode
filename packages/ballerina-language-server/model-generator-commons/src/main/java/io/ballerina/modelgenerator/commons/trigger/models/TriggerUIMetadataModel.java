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

package io.ballerina.modelgenerator.commons.trigger.models;

import com.google.gson.annotations.SerializedName;

import java.util.List;
import java.util.Map;

/**
 * Sparse, author-facing UI metadata applied over an L1 {@link TriggerMetadataModel} and semantic facts.
 * Every targeted node is an overlay: structural and source information omitted here is derived by the LS.
 *
 * @param version          the L2 spec version this document conforms to, e.g. {@code "v1.0"}
 * @param metadata         root catalog metadata, e.g. {@code kind}
 * @param trigger          catalog/presentation strings for the trigger itself
 * @param readOnlyMetadata summary chips shown on the service card
 * @param initForm         the trigger-level add/edit form overlay
 * @param listeners        overlays targeting the connector's declared listeners
 * @param serviceTypes     overlays targeting the connector's declared service types
 * @param importPrefix     optional override for the import prefix the connector's own module is
 *                         referenced under; absent -> the LS derives one from the dotted module name
 *                         (see {@code ModuleAliasResolver#selfPrefix}). Needed when a connector's actual
 *                         published usage aliases its module to something other than that derived
 *                         default (e.g. {@code whatsapp.business} imported as {@code whatsapp}, not the
 *                         derived {@code business})
 * @param artifactInfo     optional artifact-tree presentation and identifier metadata
 * @since 1.10.0
 */
public record TriggerUIMetadataModel(
        String version,
        Metadata metadata,
        Trigger trigger,
        List<ReadOnlyMetadata> readOnlyMetadata,
        InitForm initForm,
        List<TargetedNode> listeners,
        List<TargetedNode> serviceTypes,
        String importPrefix,
        ArtifactInfo artifactInfo) {

    /** Source-compatible constructor for callers that do not author artifact metadata. */
    public TriggerUIMetadataModel(String version, Metadata metadata, Trigger trigger,
                                  List<ReadOnlyMetadata> readOnlyMetadata, InitForm initForm,
                                  List<TargetedNode> listeners, List<TargetedNode> serviceTypes,
                                  String importPrefix) {
        this(version, metadata, trigger, readOnlyMetadata, initForm, listeners, serviceTypes, importPrefix, null);
    }

    public record Metadata(
            String label,
            String description,
            String notice,
            String subLabel,
            String addLabel,
            String addDescription,
            String groupName,
            String badge,
            Boolean deprecated,
            Boolean derived,
            String kind,
            String triggerKind) {

        /** Source-compatible constructor for metadata written before {@code triggerKind} was introduced. */
        public Metadata(String label, String description, String notice, String subLabel, String addLabel,
                        String addDescription, String groupName, String badge, Boolean deprecated, Boolean derived,
                        String kind) {
            this(label, description, notice, subLabel, addLabel, addDescription, groupName, badge, deprecated,
                    derived, kind, null);
        }

        /** Uses the newer canonical field when present and otherwise accepts legacy {@code kind}. */
        public String effectiveTriggerKind() {
            return triggerKind == null ? kind : triggerKind;
        }
    }

    /**
     * @param displayName      overrides the synthesized root {@code displayName}; absent leaves it
     *                         untouched
     * @param shortDisplayName overrides the synthesized root {@code shortDisplayName}; absent leaves it
     *                         untouched
     * @param description      overrides the synthesized root {@code description}; absent leaves it
     *                         untouched
     * @param type             overrides the synthesized root {@code type}; absent leaves it untouched
     * @param listenerKind overrides the synthesized root {@code listenerKind}; an empty string removes
     *                      the key entirely (e.g. a connector whose real UI has nothing to select among,
     *                      so the synthesizer's always-populated default doesn't belong in its schema),
     *                      a non-empty one restates a different value, and {@code null} (the default)
     *                      leaves the synthesized value untouched
     */
    public record Trigger(
            String displayName,
            String shortDisplayName,
            String description,
            String type,
            String listenerKind) {
    }

    public record ReadOnlyMetadata(
            String key,
            String displayName,
            String extractor,
            String paramKind,
            String path) {
    }

    public record InitForm(
            Metadata metadata,
            List<TargetedNode> fields) {
    }

    public record TargetedNode(
            Target target,
            Source source,
            Metadata metadata,
            State state,
            Field field,
            FunctionNode function,
            ServiceNode service,
            ListenerNode listener,
            List<TargetedNode> fields,
            List<TargetedNode> handlers,
            List<TargetedNode> parameters,
            List<TargetedNode> parameterSchema,
            TargetedNode returnType) {
    }

    /**
     * One normalized target shape covering both L1 ids and semantic joins.
     *
     * @param via         {@code "l1"} (resolved by {@code id}) or {@code "semantic"} (resolved by
     *                    {@code kind} plus the other join fields below)
     * @param id          the L1 construct id this overlay targets, when {@code via} is {@code "l1"}
     * @param kind         the semantic join kind, e.g. {@code serviceAnnotationField}, when {@code via}
     *                    is {@code "semantic"}
     * @param path        a dotted semantic path (e.g. an annotation field path), when applicable
     * @param listener    the L1 listener id this join is scoped to, when applicable
     * @param serviceType the L1 service type id this join is scoped to, when applicable
     * @param annotation  the L1 annotation id this join is scoped to, when applicable
     * @param handler     the handler name this join is scoped to, when applicable
     * @param param       the parameter name this join is scoped to, when applicable
     * @param name        a bare identifier join (e.g. a handler or parameter name), when applicable
     * @param owner       the owning construct's identifier, for a {@code recordField} join
     */
    public record Target(
            String via,
            String id,
            String kind,
            String path,
            String listener,
            String serviceType,
            String annotation,
            String handler,
            String param,
            String name,
            String owner) {
    }

    public record Source(Codedata codedata, Construct construct, Argument argument, Module module,
                         Value value, Payload payload, Map<String, Object> extensions) {
        public Source(Codedata codedata) {
            this(codedata, null, null, null, null, null, null);
        }
        public Source(Construct construct, Argument argument, Module module, Value value, Payload payload,
                      Map<String, Object> extensions) {
            this(null, construct, argument, module, value, payload, extensions);
        }
    }

    /**
     * The kind of Ballerina construct to which source metadata belongs.
     * @param kind construct kind
     */
    public record Construct(String kind) {
    }
    /**
     * Argument location and role within the construct.
     * @param kind argument kind
     * @param position argument position
     * @param originalName original argument name
     * @param targetParam target parameter name
     */
    public record Argument(String kind, Integer position, String originalName, String targetParam) {
    }
    /**
     * Module/package identity used when rendering a source reference.
     * @param name module name
     * @param org organization name
     * @param packageName package name
     */
    public record Module(String name, String org, String packageName) {
    }
    /**
     * Literal/value representation controls.
     * @param kind value kind
     * @param literal literal value
     * @param qualifier value qualifier
     * @param preserve whether the value should be preserved
     */
    public record Value(String kind, Object literal, String qualifier, Boolean preserve) {
    }
    /**
     * Payload binding and transformation controls.
     * @param defaultType default payload type
     * @param boundType bound payload type
     * @param template payload template
     * @param typeConstraint payload type constraint
     * @param modifier payload modifier
     * @param supersedes modifiers superseded by this modifier
     * @param modifiers additional modifier data
     */
    public record Payload(String defaultType, String boundType, String template, String typeConstraint,
                          String modifier, List<String> supersedes, Object modifiers) {
    }

    /**
     * Open codedata override. Unknown fields are intentionally ignored by Gson for forward compatibility.
     *
     * @param type            the node's structural role/type discriminator (e.g. {@code SERVICE_ANNOTATION})
     * @param argType         the parameter/argument kind this node maps to (e.g. {@code CDC_OPERATION_ENABLE})
     * @param originalName    the field/annotation's real name in the underlying Ballerina API, when it
     *                        differs from the display key
     * @param moduleName      the module this reference resolves against, when it differs from the
     *                        connector's own
     * @param orgName         the organization this reference resolves against, when applicable
     * @param packageName     the package this reference resolves against, when applicable
     * @param position        the positional index among a listener's constructor arguments, when applicable
     * @param path            a dotted path into the underlying value (e.g. an annotation field path)
     * @param defaultType     the default Ballerina type this field binds to, when overridden
     * @param boundType       the bound Ballerina type, when overridden
     * @param bindable        whether this node participates in data binding
     * @param bindingKind     the data-binding widget kind, e.g. {@code RECORD_MAP_EXPRESSION}
     * @param typeConstraint  a type constraint narrowing {@code boundType}
     * @param template        a composition template applied to the bound value (e.g. {@code "{{type}}[]"})
     * @param modifier        a payload modifier role (e.g. {@code stream})
     * @param supersedes      the modifier roles this one replaces
     * @param targetParam     the parameter this modifier applies to
     * @param modifiers       open, role-specific extra data
     * @param field           the underlying field name, when it differs from the display key
     * @param optional        whether the underlying construct is optional
     * @param value           a literal value override
     * @param valueQualifier  a qualifier on {@code value}'s interpretation
     * @param group           the logical group this node's construct is listed under
     * @param variantLabel    the label shown when this node is one of several variants
     * @param nameEditable    whether the construct's name may be renamed
     * @param bindingGroup    the data-binding group this node participates in
     * @param driverDependency Maven coordinates for a native driver dependency this field selects
     * @param valueKind value kind override
     * @param castType type cast override
     * @param preserveValue whether to preserve the value override
     */
    public record Codedata(
            String type,
            String argType,
            String originalName,
            String moduleName,
            String orgName,
            String packageName,
            Integer position,
            String path,
            String defaultType,
            String boundType,
            Boolean bindable,
            String bindingKind,
            String typeConstraint,
            String template,
            String modifier,
            List<String> supersedes,
            String targetParam,
            Object modifiers,
            String field,
            Boolean optional,
            String value,
            String valueQualifier,
            String group,
            String variantLabel,
            Boolean nameEditable,
            String bindingGroup,
            Object driverDependency,
            String valueKind,
            String castType,
            Boolean preserveValue) {
        public Codedata(String type, String argType, String originalName, String moduleName, String orgName,
                        String packageName, Integer position, String path, String defaultType, String boundType,
                        Boolean bindable, String bindingKind, String typeConstraint, String template,
                        String modifier, List<String> supersedes, String targetParam, Object modifiers,
                        String field, Boolean optional, String value, String valueQualifier, String group,
                        String variantLabel, Boolean nameEditable, String bindingGroup, Object driverDependency) {
            this(type, argType, originalName, moduleName, orgName, packageName, position, path, defaultType,
                    boundType, bindable, bindingKind, typeConstraint, template, modifier, supersedes, targetParam,
                    modifiers, field, optional, value, valueQualifier, group, variantLabel, nameEditable,
                    bindingGroup, driverDependency, null, null, null);
        }
    }

    public record State(
            Boolean enabled,
            Boolean editable,
            Boolean optional,
            Boolean advanced,
            Boolean hidden,
            Boolean typeEditable) {
    }

    /**
     * @param key         the overlaid field's key within its parent's {@code properties}/{@code choices}
     * @param metadata    display metadata overlay for this field
     * @param placeholder placeholder text overlay shown when the field is empty
     * @param defaultValue the field's default value override
     * @param widget      the widget policy overlay applied to this field's rendering candidates
     * @param items       fixed item values overlay, when applicable
     * @param choices     the selectable sub-field overlays, for a choice field
     * @param properties  the nested sub-field overlays, for a container field
     * @param validations the validation rule overlays applied to this field
     * @param binding     the data-binding overlay applied to this field
     * @param state       the enabled/editable/optional/advanced/hidden state overlay for this field
     * @param source      the codedata source overlay for this field
     * @param literal when true, this field compiles to its bare {@code default} value (e.g. a plain
     *                marker string like an {@code httpParamType} discriminator) instead of the usual
     *                Property-object shape built from the other properties here, which are ignored
     * @param extensions additional connector-specific field metadata
     */
    public record Field(
            String key,
            Metadata metadata,
            String placeholder,
            @SerializedName("default") Object defaultValue,
            WidgetPolicy widget,
            List<String> items,
            List<Field> choices,
            Map<String, Field> properties,
            List<Validation> validations,
            Binding binding,
            State state,
            Source source,
            Boolean literal,
            Map<String, Object> extensions) {
        public Field(String key, Metadata metadata, String placeholder, Object defaultValue, WidgetPolicy widget,
                     List<String> items, List<Field> choices, Map<String, Field> properties,
                     List<Validation> validations, Binding binding, State state, Source source, Boolean literal) {
            this(key, metadata, placeholder, defaultValue, widget, items, choices, properties, validations, binding,
                    state, source, literal, null);
        }
    }

    public record WidgetPolicy(
            Boolean derived,
            List<Widget> overrides) {
    }

    public record Widget(
            String widgetKind,
            Boolean selected,
            String ballerinaType,
            List<Option> options,
            List<TypeMember> typeMembers,
            Object template,
            String itemLabel,
            List<PayloadFormat> formats,
            List<Validation> validations,
            Map<String, Object> extensions) {
        public Widget(String widgetKind, Boolean selected, String ballerinaType, List<Option> options,
                      List<TypeMember> typeMembers, Object template, String itemLabel, List<PayloadFormat> formats,
                      List<Validation> validations) {
            this(widgetKind, selected, ballerinaType, options, typeMembers, template, itemLabel, formats,
                    validations, null);
        }
    }

    public record Option(String label, String value, String helperText) {
    }

    public record TypeMember(
            String type,
            String packageInfo,
            String packageName,
            String kind,
            Boolean selected) {
    }

    public record PayloadFormat(List<String> supported, String defaultFormat) {
    }

    public record Validation(
            String rule,
            Map<String, Object> args,
            String message,
            String severity) {
    }

    public record Binding(
            String label,
            String description,
            PayloadFormat formats,
            Boolean nameEditable,
            String bindingKind,
            String defaultTypeLabel) {
    }

    public record ListenerNode(
            Metadata metadata,
            Map<String, Field> formFields,
            ListenerForm form,
            Map<String, Field> serviceProperties,
            Boolean enabledByDefault) {
    }

    /**
     * @param section                 the group a listener's constructor fields sit in; defaults to
     *                                 "Listener Configuration"
     * @param typeSelector             the switch between listener kinds; defaults to "Listener Type"
     * @param createNew                the create-new-listener branch's presentation text; defaults to
     *                                 generic wording
     * @param useExisting              the use-existing-listener branch's presentation text; defaults to
     *                                 generic wording
     * @param listenerConfig           the group a listener's own constructor fields sit in, when named
     *                                 independently of {@code section}
     * @param existingListener         the use-existing selector's own presentation text, when it is
     *                                 shown under its own {@code existingListener} key instead of the
     *                                 generic {@code listener} key
     * @param existingListenerWidget   the use-existing selector's widget kind; defaults to
     *                                 {@code SINGLE_SELECT_LISTENER}/{@code MULTIPLE_SELECT_LISTENER}
     *                                 depending on whether the connector allows multiple listeners
     * @param useExistingEnabled      overrides the "Use Existing Listener" branch's own {@code enabled};
     *                                 the synthesizer defaults to {@code false} when absent
     * @param useExistingEditable     overrides the branch's own {@code editable}; defaults to
     *                                 {@code false} when absent
     * @param existingListenerBallerinaType the selector's {@code ballerinaType}, e.g. {@code "ftp:Listener"}
     * @param existingListenerItems   example already-declared listener variable names shown before the
     *                                 selector is populated from the user's actual source
     * @param existingListenerValue   the selector's initial value -- a plain {@code String} for a
     *                                single-select widget, or a {@code List<String>} for a multi-select one
     */
    public record ListenerForm(
            Metadata section,
            Metadata typeSelector,
            Metadata createNew,
            Metadata useExisting,
            Metadata listenerConfig,
            Metadata existingListener,
            String existingListenerWidget,
            Boolean useExistingEnabled,
            Boolean useExistingEditable,
            String existingListenerBallerinaType,
            List<String> existingListenerItems,
            Object existingListenerValue) {

        public ListenerForm(Metadata section, Metadata typeSelector, Metadata createNew,
                            Metadata useExisting, Metadata listenerConfig) {
            this(section, typeSelector, createNew, useExisting, listenerConfig, null, null, null, null, null, null,
                    null);
        }
    }

    /**
     * @param name        overrides the runtime {@code ServiceTypeModel.name} identity (e.g. a same-module,
     *                    multi-type connector whose real API resolves each type by its bare name rather
     *                    than the module-qualified form the synthesizer defaults a multi-type connector to)
     * @param description the service type's own catalog description, distinct from {@code metadata.description}
     * @param properties  service-level field overlays, keyed by the runtime property name
     */
    public record ServiceNode(String name, String description, Map<String, Field> properties) {
    }

    /**
     * @param included         whether the targeted L1 handler is exposed; absent defaults to included
     * @param name             a default/starting name for an addable handler (e.g. {@code "newTool"});
     *                         distinct from {@code nameEditable}, which only controls whether the user
     *                         may change it afterward
     * @param nameEditable     whether the handler's name may be renamed
     * @param nameMetadata     presentation text for the name field
     * @param repeatable       whether this handler may be declared more than once, e.g. {@code "TRUE"}
     * @param canAddParameters whether the author may add extra parameters beyond the declared ones
     * @param variantLabel     the label shown when this handler is one of several variants
     * @param group            the logical group this handler is listed under
     * @param documentation    the handler's documentation field overlay
     * @param layout           the handler's parameter layout sections
     * @param properties a full replacement for the handler's own derived {@code properties} map (e.g.
     *                   decomposing an auto-derived annotation-attachment property into structured
     *                   sub-fields); present only when L2 wants to override what L1 + semantic facts
     *                   alone produced, keyed by the runtime property name
     */
    public record FunctionNode(
            Boolean included,
            String name,
            Boolean nameEditable,
            Metadata nameMetadata,
            String repeatable,
            Boolean canAddParameters,
            String variantLabel,
            String group,
            Documentation documentation,
            List<LayoutSection> layout,
            Map<String, Field> properties) {
    }

    public record Documentation(
            Boolean editable,
            String placeholder,
            @SerializedName("default") String defaultValue,
            Metadata metadata) {
    }

    public record LayoutSection(
            String id,
            Metadata metadata,
            String label,
            String description,
            Boolean advanced,
            List<String> fields) {
    }
}
