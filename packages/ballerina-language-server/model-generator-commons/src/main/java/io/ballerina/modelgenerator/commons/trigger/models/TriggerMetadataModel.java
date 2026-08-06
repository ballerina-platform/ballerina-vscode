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

/**
 * Deserialization target for a connector's {@code resources/trigger-metadata.json} — the
 * authoring-rules overlay above the syntax tree and semantic model, combined at request time with
 * semantic-API introspection of the referenced types to synthesize a {@code TriggerUISchemaModel}.
 *
 * @param listeners the listener kinds this trigger can be attached to
 * @param serviceTypes exactly one entry means it's the only required type; more than one means each
 *                     is individually optional
 * @param annotations annotation types referenced elsewhere in this document
 * @param dataBindingRules data-binding projections available to handler params
 * @since 1.10.0
 */
public record TriggerMetadataModel(
        List<Listener> listeners,
        List<ServiceType> serviceTypes,
        List<Annotation> annotations,
        List<DataBindingRule> dataBindingRules) {

    /**
     * No init fields modeled here — a listener's init signature is introspectable from the library itself.
     *
     * @param type the listener type
     * @param services service type ids that may be attached to this listener
     * @param requiredImports packages that must be imported for their side effect
     */
    public record Listener(TypeRef type, List<String> services, List<RequiredImport> requiredImports) {
    }

    /**
     * A package that must be imported for its side effect, even though nothing references it by name.
     *
     * @param importType the kind of required import
     * @param packageInfo the package to import
     */
    public record RequiredImport(String importType, TypeRef.PackageInfo packageInfo) {

        public static final String IMPORT_TYPE_DRIVER = "driver";
    }

    public record ServiceType(
            String id,
            TypeRef type,
            boolean concrete,
            boolean multipleListenersAllowed,
            boolean multipleServicesPerListenerAllowed,
            PresenceForm identifier,
            Handlers handlers,
            List<Rule> rules) {

        /**
         * @param backedByConcreteType {@code true} means the declared methods are the handlers and
         *                             {@code options} is empty/absent; {@code false} means
         *                             {@code options} is the only source of truth
         * @param addMode whether the option set is a fixed subset or an open-ended set
         * @param options the handler options themselves
         */
        public record Handlers(boolean backedByConcreteType, String addMode, List<HandlerOption> options) {

            /** Fixed, named vocabulary; each option carries its own {@code presence}. */
            public static final String ADD_MODE_SUBSET = "subset";
            /** Open-ended, user-named set; represented as a single option named {@link HandlerOption#WILDCARD_NAME}. */
            public static final String ADD_MODE_MANY = "many";
        }

        /**
         * {@code method}/{@code path}/{@code accessor}/{@code fieldName}/{@code graphqlOperation} are
         * resource-kind extras, {@code null} for a remote-kind handler.
         *
         * @param name the handler's name
         * @param kind remote or resource
         * @param presence whether this handler is required or optional
         * @param annotations annotations applicable to this handler
         * @param params the handler's parameters
         * @param returns the handler's possible return types
         * @param method the resource method, for a resource-kind handler
         * @param path the resource path, for a resource-kind handler
         * @param accessor the resource accessor, for a resource-kind handler
         * @param fieldName the resource field name, for a resource-kind handler
         * @param graphqlOperation the GraphQL operation kind, for a resource-kind handler
         */
        public record HandlerOption(
                String name,
                String kind,
                String presence,
                List<String> annotations,
                List<Param> params,
                List<TypeRef> returns,
                PresenceValues method,
                PresenceForm path,
                PresenceValues accessor,
                PresenceForm fieldName,
                String graphqlOperation) {

            public static final String KIND_REMOTE = "remote";
            public static final String KIND_RESOURCE = "resource";
            public static final String WILDCARD_NAME = "*";
        }

        /**
         * Order in the array is meaningful and is trusted to convey positional constraints.
         *
         * @param name the parameter's name
         * @param type the parameter's possible types
         * @param presence whether this parameter is required or optional
         * @param addMode how this parameter may be added
         * @param dataBinding the data-binding rule id applicable to this parameter
         * @param annotations annotations applicable to this parameter
         */
        public record Param(
                String name,
                List<TypeRef> type,
                String presence,
                String addMode,
                String dataBinding,
                List<String> annotations) {
        }

        /**
         * {@code type} lets new rule kinds be added later; {@link #TYPE_ONE_OF} is the only value today.
         *
         * @param id the rule's id
         * @param type the rule kind
         * @param members the rule's members
         */
        public record Rule(String id, String type, List<RuleMember> members) {

            public static final String TYPE_ONE_OF = "oneOf";

            /**
             * Exactly one of {@code annotation}+{@code field}, {@code part}, or {@code handler} is populated.
             *
             * @param annotation the annotation id, when this member refers to an annotation
             * @param field the annotation field, when this member refers to an annotation field
             * @param preferred whether this member is the preferred choice among siblings
             * @param part the well-known part name, when this member refers to a part
             * @param handler the handler name, when this member refers to a handler
             */
            public record RuleMember(String annotation, String field, Boolean preferred, String part,
                                      String handler) {

                public static final String PART_IDENTIFIER = "identifier";
            }
        }
    }

    /**
     * An annotation type referenced elsewhere in the document, defined once here rather than restated
     * at each attachment point.
     *
     * @param id the annotation's id
     * @param type the annotation's type
     * @param attachPoint where this annotation may be attached
     * @param appliesTo ids into {@link TriggerMetadataModel#serviceTypes()}; included only when no more
     *                  precise reference already links this annotation to a service type
     * @param presence whether this annotation is required or optional
     * @since 1.10.0
     */
    public record Annotation(String id, TypeRef type, String attachPoint, List<String> appliesTo,
                              String presence) {

        public static final String ATTACH_POINT_SERVICE = "service";
        public static final String ATTACH_POINT_FUNCTION = "function";
        public static final String ATTACH_POINT_PARAMETER = "parameter";
        public static final String ATTACH_POINT_RETURN = "return";

        public static final String PRESENCE_REQUIRED = "required";
        public static final String PRESENCE_OPTIONAL = "optional";
    }

    /**
     * The legal ways a handler parameter's raw value can be projected into a different, user-defined
     * type. Referenced from {@link ServiceType.Param#dataBinding()}.
     *
     * @param id the rule's id
     * @param envelopeType present only when {@code supportedModes} includes a
     *                     {@link SupportedMode#MODE_INCLUDED_RECORD} entry
     * @param cardinality  {@link #CARDINALITY_ARRAY} for an array/batch binding, {@code null} for scalar
     * @param supportedModes the projection modes this rule supports
     * @since 1.10.0
     */
    public record DataBindingRule(String id, TypeRef envelopeType, String cardinality,
                                   List<SupportedMode> supportedModes) {

        public static final String CARDINALITY_ARRAY = "array";

        /**
         * {@code includes}/{@code bindableFields} are set only for {@link #MODE_INCLUDED_RECORD}.
         *
         * @param mode the projection mode
         * @param typeConstraint the types this mode is constrained to
         * @param excludes types excluded from this mode
         * @param includes the type whose fields are included, for {@link #MODE_INCLUDED_RECORD}
         * @param bindableFields the fields that may be bound, for {@link #MODE_INCLUDED_RECORD}
         */
        public record SupportedMode(
                String mode,
                List<TypeRef> typeConstraint,
                List<TypeRef> excludes,
                TypeRef includes,
                List<String> bindableFields) {

            /** The param's type directly is the target type — no wrapping. */
            public static final String MODE_DIRECT = "direct";
            /** A user-defined record that does {@code *EnvelopeType;} plus overrides only {@code bindableFields}. */
            public static final String MODE_INCLUDED_RECORD = "includedRecord";
            /** Same as {@link #MODE_DIRECT}, but the param is a {@code stream<...>} over the target type. */
            public static final String MODE_STREAMABLE = "streamable";
        }
    }
}
