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

import java.util.List;
import java.util.Map;

/**
 * Deserialization target for a connector-shipped Trigger UI Schema
 * ({@code resources/trigger-ui-schema.json}), unifying the add-trigger init form with the service
 * type(s) and their handler functions.
 *
 * @param schemaVersion    the trigger UI schema format version
 * @param id               the trigger's unique identifier
 * @param displayName      the trigger's human-readable name
 * @param shortDisplayName a compact name for space-constrained surfaces such as the listener list
 *                         (e.g. {@code Azure Files} for {@code azure.storage.files}); absent -> callers
 *                         fall back to a package-name-derived label
 * @param description      a short summary of the trigger
 * @param orgName          the organization publishing the connector
 * @param packageName      the connector's package name
 * @param moduleName       the connector's module name
 * @param version          the connector's version
 * @param type         the entry-point kind bucket used for icon/category fallback (e.g.
 *                     {@code event}/{@code file}/{@code http}/{@code graphql}/{@code ai})
 * @param icon             the icon reference shown for this trigger
 * @param kind             the legacy trigger category retained for compatibility
 * @param triggerKind      the canonical integration kind derived from L2 metadata
 * @param listenerKind the listener property's widget (a {@code Value.FieldType} name, e.g.
 *                     {@code SINGLE_SELECT_LISTENER} / {@code MULTIPLE_SELECT_LISTENER}); defaults to
 *                     {@code SINGLE_SELECT_LISTENER} when a model omits it
 * @param initProperties   the init/listener form fields, keyed by property name
 * @param listenerForm presentation text for the derived listener field; absent → generic defaults
 * @param listeners    the listener(s) a service may attach to, each with its own configuration set. The
 *                     init form's listener field is derived from this rather than authored. Absent → the
 *                     connector authored that field directly under {@code initProperties}
 * @param serviceTypes     the service type(s) this trigger offers
 * @param readOnlyMetadata read-only summary chips shown on the service card
 * @param importStatements extra import statements required by generated code
 * @param importPrefix optional override for the import prefix the connector's own module is
 *                     referenced under. Absent/blank -> the generator computes one (a camelCase join
 *                     of a dotted module name, e.g. {@code trigger.twilio} -> {@code triggerTwilio})
 * @since 1.9.0
 */
public record TriggerUISchemaModel(
        String schemaVersion,
        String id,
        String displayName,
        String shortDisplayName,
        String description,
        String orgName,
        String packageName,
        String moduleName,
        String version,
        String type,
        String icon,
        String kind,
        String triggerKind,
        String listenerKind,
        Map<String, Property> initProperties,
        ListenerFormModel listenerForm,
        List<ListenerModel> listeners,
        List<ServiceTypeModel> serviceTypes,
        List<ReadOnlyMetadata> readOnlyMetadata,
        List<String> importStatements,
        String importPrefix) {

    /**
     * Presentation text for the derived listener field, so a connector can name the section and the switch
     * in its own terms. Both optional, falling back to generic wording.
     *
     * @param section      the group a listener's constructor fields sit in; defaults to
     *                     "Listener Configuration"
     * @param typeSelector the switch between listener kinds. Its {@code description} is what the form
     *                     renders above the options; defaults to "Listener Type"
     * @param createNew    the create-new-listener branch's presentation text; defaults to generic wording
     * @param useExisting  the use-existing-listener branch's presentation text; defaults to generic wording
     * @param listenerConfig the group a listener's own constructor fields sit in, when named independently
     *                       of {@code section}; defaults to "Listener Configuration"
     * @param existingListener       the use-existing selector's own presentation text, when it is shown
     *                                under its own {@code existingListener} key instead of the generic
     *                                {@code listener} key
     * @param existingListenerWidget the use-existing selector's widget kind; defaults to
     *                                {@code SINGLE_SELECT_LISTENER}/{@code MULTIPLE_SELECT_LISTENER}
     *                                depending on whether the connector allows multiple listeners
     * @param useExistingEnabled     overrides the use-existing branch's own {@code enabled}; defaults to
     *                                {@code false}
     * @param useExistingEditable    overrides the use-existing branch's own {@code editable}; defaults to
     *                                {@code false}
     * @param existingListenerBallerinaType the selector's {@code ballerinaType}, e.g. {@code "ftp:Listener"}
     * @param existingListenerItems  example already-declared listener variable names shown before the
     *                                selector is populated from the user's actual source
     * @param existingListenerValue  the selector's initial value -- a plain {@code String} for a
     *                               single-select widget, or a {@code List<String>} for a multi-select one
     */
    public record ListenerFormModel(
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

        /** Compatibility constructor for existing models that only customized section/type selection. */
        public ListenerFormModel(Metadata section, Metadata typeSelector) {
            this(section, typeSelector, null, null, null, null, null, null, null, null, null, null);
        }

        public ListenerFormModel(Metadata section, Metadata typeSelector, Metadata createNew,
                                 Metadata useExisting, Metadata listenerConfig) {
            this(section, typeSelector, createNew, useExisting, listenerConfig, null, null, null, null, null, null,
                    null);
        }
    }

    /**
     * One listener a service may attach to, and the configuration set that listener alone takes. A connector
     * may declare more than one — {@code ballerina/mcp} offers a Streamable HTTP listener plus an older one
     * deprecated in favour of it — and the two need not take the same parameters.
     *
     * @param metadata         display metadata; {@code deprecated}/{@code notice} carry a deprecation
     *                         reason through to the form's badge
     * @param name             the listener type's simple name, e.g. {@code StreamableHttpListener}
     * @param ballerinaType    the module-qualified type, e.g. {@code mcp:StreamableHttpListener}. This is
     *                         what source generation emits and what identifies this listener among its
     *                         siblings, so it must be distinct across a connector's listeners
     * @param enabled          whether this is the listener offered by default; absent -> the first
     *                         non-deprecated entry
     * @param initProperties    what constructs this listener: its variable name and constructor arguments
     * @param serviceProperties service-level fields this listener alone gives meaning to, such as a base
     *                          path an HTTP transport has and one without a URL space does not. Offered,
     *                          emitted and validated only while this listener is selected. A field every
     *                          listener shares belongs in the model's {@code initProperties} instead
     * @param serviceTypes      names of the {@link ServiceTypeModel}s this listener can host; absent or
     *                          empty means all of them. Carried but not yet acted on
     */
    public record ListenerModel(
            Metadata metadata,
            String name,
            String ballerinaType,
            Boolean enabled,
            Map<String, Property> initProperties,
            Map<String, Property> serviceProperties,
            List<String> serviceTypes) {
    }

    /**
     * A service-object type and its handler functions. {@code functions} are present/locked handlers;
     * {@code schemaFunctions} are addable templates. For a multi-type connector, {@code enabled}
     * marks the selected type.
     *
     * @param metadata        display metadata for this service type
     * @param name            the service type's identifier
     * @param description     a short summary of this service type
     * @param enabled         whether this service type is the selected one
     * @param editable        whether this service type may be edited
     * @param properties      the service type's own configurable properties
     * @param functions       the present/locked handler functions
     * @param schemaFunctions the addable handler function templates
     * @param codedata        source-generation metadata for this service type
     */
    public record ServiceTypeModel(
            Metadata metadata,
            String name,
            String description,
            Boolean enabled,
            Boolean editable,
            Map<String, Property> properties,
            List<FunctionModel> functions,
            List<FunctionModel> schemaFunctions,
            Codedata codedata) {
    }

    /**
     * The recursive building block of every form. Leaves carry {@code types} + {@code value};
     * containers carry {@code properties}; choices carry {@code choices}.
     *
     * @param metadata    display metadata for this field
     * @param enabled     whether this field is currently active
     * @param editable    whether the user may change this field's value
     * @param optional    whether this field may be left unset
     * @param advanced    whether this field is hidden behind an advanced toggle
     * @param hidden      whether this field is hidden from the UI entirely
     * @param placeholder placeholder text shown when the field is empty
     * @param value       the field's current value
     * @param types       the candidate rendering descriptors for this field
     * @param items       fixed item values, when applicable
     * @param choices     the selectable sub-properties, for a choice field
     * @param properties  the nested sub-properties, for a container field
     * @param codedata    source-generation metadata for this field
     * @param validations the validation rules applied to this field
     */
    public record Property(
            Metadata metadata,
            boolean enabled,
            boolean editable,
            boolean optional,
            boolean advanced,
            Boolean hidden,
            String placeholder,
            Object value,
            List<PropertyType> types,
            List<String> items,
            List<Property> choices,
            Map<String, Property> properties,
            Codedata codedata,
            List<ValidationRule> validations) {

        /** Compatibility constructor for call sites predating the authored {@code hidden} state. */
        public Property(Metadata metadata, boolean enabled, boolean editable, boolean optional, boolean advanced,
                        String placeholder, Object value, List<PropertyType> types, List<String> items,
                        List<Property> choices, Map<String, Property> properties, Codedata codedata,
                        List<ValidationRule> validations) {
            this(metadata, enabled, editable, optional, advanced, null, placeholder, value, types, items, choices,
                    properties, codedata, validations);
        }
    }

    /**
     * A candidate rendering descriptor; the entry with {@code selected:true} is the active widget.
     * {@code template} is either a {@code Property} (REPEATABLE_LIST element clone) or a type-wrap
     * {@code String} (e.g. {@code "{{type}}[]"}), hence {@code Object}.
     *
     * @param fieldType     the widget kind used to render this candidate
     * @param selected      whether this candidate is the active widget
     * @param ballerinaType the Ballerina type this candidate binds to
     * @param options       the inline selectable options, when applicable
     * @param typeMembers   the selectable record/union members, when applicable
     * @param template      the composition template applied to the bound element
     * @param formats       the data-binding formats offered, when applicable
     * @param validations   the validation rules applied to this candidate
     * @param extensions    the file extensions offered by a FILE_SELECT/PROJECT_FILE_SELECT candidate
     *                      without a leading dot (e.g. {@code ["jar"]}), matching the
     *                      {@code showOpenDialog} filter format they are passed to, when applicable
     */
    public record PropertyType(
            String fieldType,
            boolean selected,
            String ballerinaType,
            List<Option> options,
            List<TypeMember> typeMembers,
            Object template,
            List<PayloadFormat> formats,
            List<ValidationRule> validations,
            List<String> extensions) {

        /** Compatibility constructor for existing call sites predating {@code extensions}. */
        public PropertyType(String fieldType, boolean selected, String ballerinaType, List<Option> options,
                             List<TypeMember> typeMembers, Object template, List<PayloadFormat> formats,
                             List<ValidationRule> validations) {
            this(fieldType, selected, ballerinaType, options, typeMembers, template, formats, validations, null);
        }
    }

    /**
     * A trigger handler / resource definition, rich enough to render the add/edit-function dialog and
     * generate the Ballerina function source.
     *
     * @param metadata            display metadata for this function
     * @param nameEditable        whether this function's name may be renamed
     * @param nameMetadata        display metadata for the name field when {@code nameEditable} is
     *                            {@code true}; falls back to {@code metadata} when absent
     * @param kind                this function's handler kind (e.g. resource/remote)
     * @param accessor            the resource accessor, when {@code kind} is resource-based
     * @param qualifiers          the function's qualifiers (e.g. {@code isolated}, {@code remote})
     * @param group               the logical group this function is listed under
     * @param variantLabel        the label shown when this function is one of several variants
     * @param enabled             whether this function is currently active
     * @param editable            whether this function's definition may be edited
     * @param optional            whether this function may be omitted from the service
     * @param canAddParameters    whether extra parameters may be appended beyond {@code parameterSchema}
     * @param repeatable          whether this function may be added more than once
     * @param documentationSchema when present, makes the doc-comment a user-editable field instead of
     *                            the fixed {@code documentation} string
     * @param parameters          this function's current parameter list
     * @param parameterSchema     the addable parameter template(s) offered when
     *                            {@code canAddParameters} is {@code true}, keyed by kind (e.g.
     *                            {@code header} for an individually bound {@code @http:Header}
     *                            parameter)
     * @param properties          additional configurable properties for this function
     * @param returnType          this function's return type descriptor
     * @param layout              optional presentation order/grouping for this handler's form inputs
     * @param codedata            source-generation metadata for this function
     * @param validations         the validation rules applied to this function
     */
    public record FunctionModel(
            Metadata metadata,
            String name,
            Boolean nameEditable,
            Metadata nameMetadata,
            String kind,
            String accessor,
            List<String> qualifiers,
            String group,
            String variantLabel,
            boolean enabled,
            Boolean editable,
            Boolean optional,
            Boolean canAddParameters,
            Repeatable repeatable,
            String documentation,
            Property documentationSchema,
            List<Parameter> parameters,
            Map<String, Parameter> parameterSchema,
            Map<String, Property> properties,
            ReturnType returnType,
            List<LayoutSection> layout,
            Codedata codedata,
            List<ValidationRule> validations) {
    }

    /**
     * One section of a handler form's authored layout. {@code fields} holds unit ids: an author's own
     * identifier (parameter name, {@code properties} key, payload {@code bindingGroup}), a reserved
     * {@code $}-prefixed built-in ({@code $variant}, {@code $description}, {@code $name},
     * {@code $documentation}, {@code $parameters}, {@code $returnType}, {@code $headers}), or
     * {@code *rest} for every unit no section claimed. An unresolved id is skipped.
     *
     * @param id          an identifier for this section
     * @param label       the heading rendered above this section; absent -> no heading
     * @param description explanatory text rendered under {@code label}
     * @param advanced    {@code true} renders this section inside the collapsed advanced box
     * @param fields      the ids of the units in this section, in render order
     */
    public record LayoutSection(
            String id,
            String label,
            String description,
            Boolean advanced,
            List<String> fields) {
    }

    /**
     * A function parameter whose {@code type} and {@code name} are {@link Property} sub-nodes. Also
     * doubles as an addable-parameter template under a {@link FunctionModel}'s
     * {@code parameterSchema}, where {@code defaultValue}/{@code documentation}/{@code headerName}
     * become meaningful.
     *
     * @param metadata      display metadata for this parameter
     * @param kind          this parameter's binding kind
     * @param type          the parameter's type sub-node
     * @param name          the parameter's name sub-node
     * @param defaultValue  the parameter's default value sub-node
     * @param documentation the parameter's doc-comment sub-node
     * @param headerName    the wire HTTP header name, when it differs from {@code name}'s identifier
     *                      (template use, pairs with {@code httpParamType == HEADER}); unset derives
     *                      the header name from the identifier at emit time
     * @param httpParamType marks this as an HTTP-bound parameter template ({@code HEADER} is the only
     *                      value currently emitted by the schema-driven path)
     * @param enabled       whether this parameter is currently active
     * @param editable      whether this parameter may be edited
     * @param optional      whether this parameter may be left unset
     * @param advanced      whether this parameter is hidden behind an advanced toggle
     * @param hidden        whether this parameter is hidden from the UI entirely
     * @param codedata      source-generation metadata for this parameter
     * @param validations   the validation rules applied to this parameter
     */
    public record Parameter(
            Metadata metadata,
            String kind,
            Property type,
            Property name,
            Property defaultValue,
            Property documentation,
            Property headerName,
            String httpParamType,
            Boolean enabled,
            Boolean editable,
            Boolean optional,
            Boolean advanced,
            Boolean hidden,
            Codedata codedata,
            List<ValidationRule> validations) {
    }

    /**
     * The return type of a handler. {@code enabled:false} = returns {@code ()}; {@code optional} =
     * nilable ({@code T?}); {@code hasError} = error union.
     *
     * @param metadata        display metadata for the return type field
     * @param type            the return type's Ballerina type
     * @param typeEditable    whether {@code type} may be changed by the user
     * @param typeConstraint  a type constraint narrowing {@code type}
     * @param enabled         whether the handler returns a value at all
     * @param editable        whether this return type may be edited
     * @param optional        whether the return type is nilable
     * @param hasError        whether the return type includes an error union member
     * @param importStatements extra import statements required by the return type
     * @param codedata        source-generation metadata for this return type
     * @param validations     the validation rules applied to this return type
     */
    public record ReturnType(
            Metadata metadata,
            String type,
            Boolean typeEditable,
            String typeConstraint,
            boolean enabled,
            Boolean editable,
            Boolean optional,
            Boolean hasError,
            String importStatements,
            Codedata codedata,
            List<ValidationRule> validations) {
    }

    /**
     * Source-generation semantics for a node. Fields are used selectively per {@code type} role;
     * {@code type}/{@code argType} are open strings interpreted per-role by the generator/adapters.
     *
     * @param type           the node's structural role/type discriminator (e.g. {@code PAYLOAD_MODIFIER})
     * @param argType        the parameter/argument kind this node maps to
     * @param originalName   the field/annotation's real name in the underlying Ballerina API, when it
     *                       differs from the display key
     * @param moduleName     the Ballerina module this construct belongs to
     * @param orgName        the organization publishing the module
     * @param packageName    the package containing the module
     * @param position       the zero-based positional index among siblings
     * @param path           a dotted path (e.g. {@code auth.credentials.username}) nesting this leaf
     *                       into a record literal at code-generation time
     * @param defaultType    the payload's default bound type when the user has not selected a custom
     *                       one
     * @param boundType      the payload's user-selected bound type, overriding {@code defaultType}
     * @param bindable       whether this node may be bound to a real Ballerina construct
     * @param bindingKind    how the bound type was determined (e.g. user-selected vs. schema-inferred)
     * @param typeConstraint a type constraint narrowing {@code type}/{@code boundType}
     * @param template       the composition template applied to the bound element (e.g.
     *                       {@code "{{type}}[]"}, {@code "stream<{{type}}, error?>"})
     * @param modifier       the PAYLOAD_MODIFIER's short name (e.g. {@code stream})
     * @param supersedes     the other PAYLOAD_MODIFIER names this modifier takes precedence over when
     *                       multiple are active
     * @param targetParam    the parameter this PAYLOAD_MODIFIER's composition applies to
     * @param modifiers      open payload-modifier metadata attached to this node
     * @param field          the underlying record field this node maps to
     * @param optional       whether this node's binding is optional
     * @param value          an open literal value used when rendering this node (e.g. an ENUM_LITERAL's
     *                       source text)
     * @param valueQualifier the module/type qualifier prefixed onto {@code value} when rendering (e.g.
     *                       {@code ftp} for {@code ftp:FTPS})
     * @param group          the logical group this node is rendered under
     * @param variantLabel   the label shown when this node is one of several variants
     * @param nameEditable   whether the bound parameter's identifier may be renamed in the edit UI;
     *                       some connectors bind to a fixed, structural identifier referred to by name
     *                       elsewhere, so only the bound type is user-selected. Defaults to editable
     *                       when unset.
     * @param bindingGroup   the binding-group id this parameter shares with any sibling parameters
     * @param driverDependency the Maven coordinates of a required-but-unbundled driver JAR this
     *                         PROJECT_FILE_SELECT field registers as a
     *                         {@code [[platform.java21.dependency]]} in Ballerina.toml. Kept as an
     *                         open {@code Object} (like {@code modifiers}) rather than a typed
     *                         {@code DriverDependency}, since this module is a dependency of, and so
     *                         cannot reference a type owned by, the service-model-generator module;
     *                         the shape survives the Gson round-trip into that module's own
     *                         {@code Codedata}.
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
            Object driverDependency) {

        /** Compatibility constructor for existing call sites predating {@code driverDependency}. */
        public Codedata(String type, String argType, String originalName, String moduleName, String orgName,
                         String packageName, Integer position, String path, String defaultType, String boundType,
                         Boolean bindable, String bindingKind, String typeConstraint, String template,
                         String modifier, List<String> supersedes, String targetParam, Object modifiers,
                         String field, Boolean optional, String value, String valueQualifier, String group,
                         String variantLabel, Boolean nameEditable, String bindingGroup) {
            this(type, argType, originalName, moduleName, orgName, packageName, position, path, defaultType,
                    boundType, bindable, bindingKind, typeConstraint, template, modifier, supersedes, targetParam,
                    modifiers, field, optional, value, valueQualifier, group, variantLabel, nameEditable,
                    bindingGroup, null);
        }

        public static Builder builder() {
            return new Builder();
        }

        /** Builds a {@link Codedata} field-by-field, leaving every unset field {@code null}. */
        public static final class Builder {
            private String type;
            private String argType;
            private String originalName;
            private String moduleName;
            private String orgName;
            private String packageName;
            private Integer position;
            private String path;
            private String defaultType;
            private String boundType;
            private Boolean bindable;
            private String bindingKind;
            private String typeConstraint;
            private String template;
            private String modifier;
            private List<String> supersedes;
            private String targetParam;
            private Object modifiers;
            private String field;
            private Boolean optional;
            private String value;
            private String valueQualifier;
            private String group;
            private String variantLabel;
            private Boolean nameEditable;
            private String bindingGroup;
            private Object driverDependency;

            private Builder() {
            }

            public Builder type(String type) {
                this.type = type;
                return this;
            }

            public Builder argType(String argType) {
                this.argType = argType;
                return this;
            }

            public Builder originalName(String originalName) {
                this.originalName = originalName;
                return this;
            }

            public Builder moduleName(String moduleName) {
                this.moduleName = moduleName;
                return this;
            }

            public Builder orgName(String orgName) {
                this.orgName = orgName;
                return this;
            }

            public Builder packageName(String packageName) {
                this.packageName = packageName;
                return this;
            }

            public Builder position(Integer position) {
                this.position = position;
                return this;
            }

            public Builder path(String path) {
                this.path = path;
                return this;
            }

            public Builder defaultType(String defaultType) {
                this.defaultType = defaultType;
                return this;
            }

            public Builder boundType(String boundType) {
                this.boundType = boundType;
                return this;
            }

            public Builder bindable(Boolean bindable) {
                this.bindable = bindable;
                return this;
            }

            public Builder bindingKind(String bindingKind) {
                this.bindingKind = bindingKind;
                return this;
            }

            public Builder typeConstraint(String typeConstraint) {
                this.typeConstraint = typeConstraint;
                return this;
            }

            public Builder template(String template) {
                this.template = template;
                return this;
            }

            public Builder modifier(String modifier) {
                this.modifier = modifier;
                return this;
            }

            public Builder supersedes(List<String> supersedes) {
                this.supersedes = supersedes;
                return this;
            }

            public Builder targetParam(String targetParam) {
                this.targetParam = targetParam;
                return this;
            }

            public Builder modifiers(Object modifiers) {
                this.modifiers = modifiers;
                return this;
            }

            public Builder field(String field) {
                this.field = field;
                return this;
            }

            public Builder optional(Boolean optional) {
                this.optional = optional;
                return this;
            }

            public Builder value(String value) {
                this.value = value;
                return this;
            }

            public Builder valueQualifier(String valueQualifier) {
                this.valueQualifier = valueQualifier;
                return this;
            }

            public Builder group(String group) {
                this.group = group;
                return this;
            }

            public Builder variantLabel(String variantLabel) {
                this.variantLabel = variantLabel;
                return this;
            }

            public Builder nameEditable(Boolean nameEditable) {
                this.nameEditable = nameEditable;
                return this;
            }

            public Builder bindingGroup(String bindingGroup) {
                this.bindingGroup = bindingGroup;
                return this;
            }

            public Builder driverDependency(Object driverDependency) {
                this.driverDependency = driverDependency;
                return this;
            }

            public Codedata build() {
                return new Codedata(type, argType, originalName, moduleName, orgName, packageName, position, path,
                        defaultType, boundType, bindable, bindingKind, typeConstraint, template, modifier, supersedes,
                        targetParam, modifiers, field, optional, value, valueQualifier, group, variantLabel,
                        nameEditable, bindingGroup, driverDependency);
            }
        }
    }

    /**
     * An inline selectable option for SINGLE_SELECT / ENUM / CHOICE / VARIATION_SELECTOR.
     *
     * @param label      the option's display text
     * @param value      the option's underlying value
     * @param helperText supplementary text shown alongside the option
     */
    public record Option(
            String label,
            String value,
            String helperText) {
    }

    /**
     * A selectable record/union member offered by a TYPE / RECORD_MAP_EXPRESSION field.
     *
     * @param type        the member's Ballerina type
     * @param packageInfo the member's declaring package, in {@code org:package:version} form
     * @param packageName the member's declaring package name
     * @param kind        the member's kind (e.g. record/union member)
     * @param selected    whether this member is currently selected
     */
    public record TypeMember(
            String type,
            String packageInfo,
            String packageName,
            String kind,
            Boolean selected) {
    }

    /**
     * How a data-binding type may be defined by the user (offered by a PAYLOAD_TYPE field).
     *
     * @param supported the definition formats offered (e.g. {@code schema}/{@code browse}/
     *                  {@code json}/{@code xml})
     * @param defaultFormat the format selected when the user has not chosen one
     */
    public record PayloadFormat(
            List<String> supported,
            String defaultFormat) {
    }

    /**
     * A read-only summary chip in the service-card header (derived from source).
     *
     * @param key         the metadata chip's unique identifier
     * @param displayName the metadata chip's display label
     * @param kind      how the value is extracted from the source (an open string; interpreted by
     *                  the matching extractor)
     * @param paramKind the source parameter kind to resolve the value from, when {@code kind} needs one
     * @param path      a dotted path narrowing the value within the resolved source construct
     */
    public record ReadOnlyMetadata(
            String key,
            String displayName,
            String kind,
            String paramKind,
            String path) {
    }

    /**
     * A reference to a named validation rule.
     *
     * @param rule     the validation rule's name
     * @param args     the arguments passed to the rule
     * @param message  the message shown when the rule fails
     * @param severity the failure's severity level
     */
    public record ValidationRule(
            String rule,
            Map<String, Object> args,
            String message,
            String severity) {
    }

    /**
     * Display metadata for any UI node.
     *
     * @param label       the node's display label
     * @param description a short summary of the node
     * @param notice      a callout message shown alongside the node
     * @param icon        the icon reference shown for the node
     * @param subLabel    secondary text shown under {@code label}
     * @param addLabel    the label used when offering to add this node
     * @param groupName   the logical group this node is listed under
     * @param badge       a short badge tag shown on the node, free for any use
     * @param deprecated  whether this node is deprecated; the reason, if any, is in {@code notice}
     * @param addDescription the description used when offering to add this node
     */
    public record Metadata(
            String label,
            String description,
            String notice,
            String icon,
            String subLabel,
            String addLabel,
            String groupName,
            String badge,
            Boolean deprecated,
            String addDescription) {
    }
}
