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

import com.google.gson.Gson;
import io.ballerina.modelgenerator.commons.ModuleAliasResolver;
import io.ballerina.modelgenerator.commons.trigger.models.IdentifierSpec;
import io.ballerina.modelgenerator.commons.trigger.models.TriggerLibraryFacts;
import io.ballerina.modelgenerator.commons.trigger.models.TriggerMetadataModel;
import io.ballerina.modelgenerator.commons.trigger.models.TriggerUISchemaModel;
import io.ballerina.modelgenerator.commons.trigger.models.TypeRef;
import io.ballerina.modelgenerator.commons.trigger.utils.TypeRefRenderer;
import io.ballerina.servicemodelgenerator.extension.model.Listener;
import io.ballerina.servicemodelgenerator.extension.model.Value;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import static io.ballerina.servicemodelgenerator.extension.util.Constants.ARG_TYPE_SERVICE_TYPE_DESCRIPTOR;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.CD_TYPE_ANNOTATION_ATTACHMENT;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.CD_TYPE_EXISTING_LISTENER;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.CD_TYPE_LISTENER_CONFIG;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.CD_TYPE_LISTENER_VAR_NAME;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.CD_TYPE_PAYLOAD_MODIFIER;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.CD_TYPE_PAYLOAD_TYPE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.CD_TYPE_PAYLOAD_TYPE_INCLUDED_RECORD;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.CD_TYPE_SERVICE_ANNOTATION;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.DATA_BINDING;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.DB_KIND_OPTIONAL;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.FIELD_TYPE_FLAG;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.KIND_REQUIRED;

/**
 * Synthesizes a {@link TriggerUISchemaModel} at request time from a connector's own
 * {@link TriggerMetadataModel} ({@code resources/trigger-metadata.json}), {@link TriggerLibraryFacts}
 * introspected from its compiled {@code SemanticModel}, and a listener init-form template resolved by
 * {@code ListenerUtil#getListenerModelByName}.
 *
 * <p>The output is the same {@link TriggerUISchemaModel} class hand-authored connectors use, so it
 * flows through {@code SchemaDrivenServiceBuilder}, {@code SchemaDrivenFunctionBuilder},
 * {@code TriggerServiceAdapter}, {@code TriggerSourceMerger}, and {@link SchemaDrivenSourceGenerator}
 * unmodified.
 *
 * <p>Notably does not attempt: listener init-param widget selection (delegated to
 * {@code ListenerUtil#getListenerModelByName}), copy-quality labels/descriptions (identifiers are
 * humanized instead), granular per-field annotation composition (rendered as one
 * {@code RECORD_MAP_EXPRESSION} field), or the general {@code oneOf} choice UX (only the preferred
 * member is rendered).
 *
 * @since 1.10.0
 */
public final class TriggerModelSynthesizer {

    private static final String SCHEMA_VERSION = "1.0";
    private static final String LISTENER_KEY = "listener";
    private static final String LISTENER_VAR_NAME_KEY = "listenerVarName";
    private static final String SERVICE_TYPE_KEY = "serviceType";
    private static final String IDENTIFIER_KEY = "identifier";
    private static final String ERROR_TYPE = "error";
    private static final Gson GSON = new Gson();

    private TriggerModelSynthesizer() {
    }

    /**
     * Synthesizes a {@link TriggerUISchemaModel} for one connector. Returns {@link Optional#empty()}
     * if the authoring model declares no listeners or no service types. A {@code null} listenerModel
     * still renders the listener choice, just with no init params beyond its name.
     */
    public static Optional<TriggerUISchemaModel> synthesize(TriggerMetadataModel authoring, TriggerLibraryFacts facts,
                                                     Listener listenerModel,
                                                     String id, String displayName, String icon, String kind,
                                                     String orgName, String packageName, String moduleName,
                                                     String version) {
        return synthesize(authoring, facts, Map.of(), listenerModel, id, displayName, icon, kind, orgName,
                packageName, moduleName, version);
    }

    /**
     * As the other overload, but {@code crossModuleFacts} supplies introspected facts for annotations
     * declared outside the connector's own module, keyed by {@code "<org>/<packageName>"}.
     */
    public static Optional<TriggerUISchemaModel> synthesize(TriggerMetadataModel authoring, TriggerLibraryFacts facts,
                                                     Map<String, TriggerLibraryFacts> crossModuleFacts,
                                                     Listener listenerModel,
                                                     String id, String displayName, String icon, String kind,
                                                     String orgName, String packageName, String moduleName,
                                                     String version) {
        if (authoring == null || facts == null
                || authoring.listeners() == null || authoring.listeners().isEmpty()
                || authoring.serviceTypes() == null || authoring.serviceTypes().isEmpty()) {
            return Optional.empty();
        }
        Map<String, TriggerLibraryFacts> crossFacts = crossModuleFacts == null ? Map.of() : crossModuleFacts;

        List<TriggerMetadataModel.ServiceType> serviceTypes = authoring.serviceTypes();
        boolean multiType = serviceTypes.size() > 1;
        TriggerMetadataModel.ServiceType primary = serviceTypes.get(0);
        ConnectorIdentity identity = new ConnectorIdentity(orgName, packageName, moduleName, version);

        TriggerMetadataModel.Listener primaryListener = authoring.listeners().get(0);
        TriggerLibraryFacts.Listener listenerFacts = findListener(primaryListener, facts);
        String listenerTypeName = primaryListener.type() == null || primaryListener.type().name() == null
                ? "Listener" : primaryListener.type().name();
        Map<String, TriggerUISchemaModel.Property> initProperties = new LinkedHashMap<>();
        buildListenerChoice(listenerFacts, listenerModel, moduleName, listenerTypeName, initProperties);
        buildInitServiceAnnotations(primary, authoring, facts, crossFacts, identity, initProperties);
        buildIdentifierField(primary, initProperties);
        if (multiType) {
            initProperties.put(SERVICE_TYPE_KEY, buildServiceTypeSelector(serviceTypes));
        }

        List<TriggerUISchemaModel.ServiceTypeModel> serviceTypeModels = new ArrayList<>();
        for (int i = 0; i < serviceTypes.size(); i++) {
            TriggerMetadataModel.ServiceType st = serviceTypes.get(i);
            serviceTypeModels.add(buildServiceType(st, facts, crossFacts, authoring, identity, i == 0, multiType));
        }

        String listenerKind = primary.multipleListenersAllowed()
                ? "MULTIPLE_SELECT_LISTENER" : "SINGLE_SELECT_LISTENER";
        List<String> importStatements = collectImportStatements(authoring, identity);

        return Optional.of(new TriggerUISchemaModel(
                SCHEMA_VERSION, id, displayName, null, "", orgName, packageName, moduleName, version,
                kind, icon, kind, listenerKind, initProperties, serviceTypeModels, List.of(),
                importStatements, null));
    }

    /** The key {@code crossModuleFacts} is looked up by, for a {@link TypeRef.PackageInfo}. */
    static String crossModuleFactsKey(TypeRef.PackageInfo packageInfo) {
        return packageInfo.org() + "/" + packageInfo.packageName();
    }

    /**
     * Extra imports a synthesized model needs beyond the connector's own primary import: each service
     * type's own module (e.g. CDC's shared {@code ballerinax/cdc}, distinct from a connector like
     * {@code ballerinax/mssql.cdc}) plus every listener's declared {@code requiredImports} (e.g. a
     * driver package needed only for its side effect). The connector's own org/module is excluded --
     * {@code SchemaDrivenSourceGenerator} already emits that import separately.
     */
    private static List<String> collectImportStatements(TriggerMetadataModel authoring, ConnectorIdentity identity) {
        Set<String> imports = new LinkedHashSet<>();
        for (TriggerMetadataModel.ServiceType serviceType : authoring.serviceTypes()) {
            addImportIfCrossModule(imports, serviceType.type() == null ? null : serviceType.type().packageInfo(),
                    identity, false);
        }
        for (TriggerMetadataModel.Listener listener : authoring.listeners()) {
            if (listener.requiredImports() == null) {
                continue;
            }
            for (TriggerMetadataModel.RequiredImport required : listener.requiredImports()) {
                boolean sideEffectOnly =
                        TriggerMetadataModel.RequiredImport.IMPORT_TYPE_DRIVER.equals(required.importType());
                addImportIfCrossModule(imports, required.packageInfo(), identity, sideEffectOnly);
            }
        }
        return List.copyOf(imports);
    }

    /**
     * {@code sideEffectOnly} emits {@code as _} (e.g. a JDBC driver a CDC listener never references by
     * name, only loaded for its registration side effect) instead of a bare import.
     */
    private static void addImportIfCrossModule(Set<String> imports, TypeRef.PackageInfo packageInfo,
                                               ConnectorIdentity identity, boolean sideEffectOnly) {
        if (packageInfo == null || packageInfo.org() == null || packageInfo.packageName() == null) {
            return;
        }
        if (packageInfo.org().equals(identity.orgName()) && packageInfo.packageName().equals(identity.packageName())) {
            return;
        }
        String module = packageInfo.moduleName() != null && !packageInfo.moduleName().isBlank()
                ? packageInfo.moduleName() : packageInfo.packageName();
        String moduleRef = packageInfo.org() + "/" + module;
        imports.add(sideEffectOnly ? moduleRef + " as _" : moduleRef);
    }

    /**
     * The connector's own coordinates, threaded to wherever a same-module type/annotation needs qualifying.
     *
     * @param orgName     the connector's organization name
     * @param packageName the connector's package name
     * @param moduleName  the connector's module name
     * @param version     the connector's version
     */
    private record ConnectorIdentity(String orgName, String packageName, String moduleName, String version) {
    }

    // Codedata is a 25-field record; these factories are centralized here so every call site is counted once.
    private static TriggerUISchemaModel.Codedata cd() {
        return TriggerUISchemaModel.Codedata.builder().build();
    }

    private static TriggerUISchemaModel.Codedata cdType(String type) {
        return TriggerUISchemaModel.Codedata.builder().type(type).build();
    }

    private static TriggerUISchemaModel.Codedata cdListenerParam(String argType, Integer position, String path) {
        return TriggerUISchemaModel.Codedata.builder().argType(argType).position(position).path(path).build();
    }

    private static TriggerUISchemaModel.Codedata cdFunction(String originalName, String moduleName) {
        return TriggerUISchemaModel.Codedata.builder().type("FUNCTION").originalName(originalName)
                .moduleName(moduleName).build();
    }

    private static TriggerUISchemaModel.Codedata cdServiceType(String originalName, String moduleName,
                                                        String orgName, String packageName) {
        return TriggerUISchemaModel.Codedata.builder().type(ARG_TYPE_SERVICE_TYPE_DESCRIPTOR)
                .originalName(originalName).moduleName(moduleName).orgName(orgName).packageName(packageName).build();
    }

    private static TriggerUISchemaModel.Codedata cdAnnotation(String codedataType, String originalName,
                                                       String moduleName, String orgName, String packageName,
                                                       boolean optional) {
        return TriggerUISchemaModel.Codedata.builder().type(codedataType).originalName(originalName)
                .moduleName(moduleName).orgName(orgName).packageName(packageName).optional(optional).build();
    }

    private static TriggerUISchemaModel.Codedata cdPayload(String type, String defaultType, String template,
                                                    String field, String typeConstraint) {
        return TriggerUISchemaModel.Codedata.builder().type(type).defaultType(defaultType).boundType("")
                .bindable(true).bindingKind("USER_SELECTED").typeConstraint(typeConstraint).template(template)
                .field(field).nameEditable(true).build();
    }

    private static final String LISTENER_CONFIG_GROUP_KEY = "listenerConfig";

    /**
     * Builds the {@code listener} CHOICE (create-new / use-existing); always includes both branches.
     * Every create-new field is nested inside one {@code listenerConfig} {@code GROUP_SECTION}. Each
     * field's widget is looked up by name from {@code listenerModel} (see {@link #enrichListenerParam})
     * rather than rebuilt; {@code listenerFacts} supplies only the structure needed to assign correct
     * {@code argType}/position codedata (see {@link #walkListenerParams}).
     */
    private static void buildListenerChoice(TriggerLibraryFacts.Listener listenerFacts, Listener listenerModel,
                                            String moduleName, String listenerTypeName,
                                            Map<String, TriggerUISchemaModel.Property> initProperties) {
        Map<String, TriggerUISchemaModel.Property> groupProps = new LinkedHashMap<>();
        groupProps.put(LISTENER_VAR_NAME_KEY, listenerVarNameProperty(moduleName, listenerTypeName));
        if (listenerFacts != null && listenerModel != null && listenerModel.getProperties() != null) {
            walkListenerParams(listenerFacts.initParams(), listenerModel, 1, groupProps);
        }
        TriggerUISchemaModel.Property configGroup = groupSectionProperty("Listener Configuration",
                "Configure the listener.", groupProps);

        Map<String, TriggerUISchemaModel.Property> createNewProps = new LinkedHashMap<>();
        createNewProps.put(LISTENER_CONFIG_GROUP_KEY, configGroup);
        TriggerUISchemaModel.Property createNew = new TriggerUISchemaModel.Property(
                new TriggerUISchemaModel.Metadata("Create New Listener", "Create a new listener", null, null,
                        null, null, null, null, null, null),
                true, true, false, false, null, null, null, null, null, createNewProps, cd(), null);

        Map<String, TriggerUISchemaModel.Property> useExistingProps = new LinkedHashMap<>();
        useExistingProps.put(LISTENER_KEY, existingListenerSelector());
        TriggerUISchemaModel.Property useExisting = new TriggerUISchemaModel.Property(
                new TriggerUISchemaModel.Metadata("Use Existing Listener", "Attach to an already-declared listener",
                        null, null, null, null, null, null, null, null),
                false, false, false, false, null, null, null, null, null, useExistingProps, cd(), null);

        TriggerUISchemaModel.PropertyType choiceType = new TriggerUISchemaModel.PropertyType(
                "CHOICE", true, null, null, null, null, null, null);
        TriggerUISchemaModel.Property choice = new TriggerUISchemaModel.Property(
                new TriggerUISchemaModel.Metadata("Listener", "The listener this service attaches to", null, null, null,
                        null, null, null, null, null),
                true, true, false, false, null, null, List.of(choiceType), null,
                List.of(createNew, useExisting), null, cdType(CD_TYPE_LISTENER_CONFIG), null);
        initProperties.put(LISTENER_KEY, choice);
    }

    private static TriggerUISchemaModel.Property groupSectionProperty(String label, String description,
                                                              Map<String, TriggerUISchemaModel.Property> properties) {
        TriggerUISchemaModel.PropertyType type = new TriggerUISchemaModel.PropertyType(
                "GROUP_SECTION", true, null, null, null, null, null, null);
        return new TriggerUISchemaModel.Property(
                new TriggerUISchemaModel.Metadata(label, description, null, null, null, null, null, null, null, null),
                true, true, false, false, null, null, List.of(type), null, null, properties, null, null);
    }

    private static TriggerUISchemaModel.Property listenerVarNameProperty(String moduleName, String listenerTypeName) {
        TriggerUISchemaModel.PropertyType type = new TriggerUISchemaModel.PropertyType(
                "IDENTIFIER", true, moduleName + ":" + listenerTypeName, null, null, null, null, null);
        // camelCase a dotted module name so the default variable name stays a legal identifier.
        String varNamePrefix = ModuleAliasResolver.defaultAlias(moduleName);
        return new TriggerUISchemaModel.Property(
                new TriggerUISchemaModel.Metadata("Listener Name", "Provide a name for the listener being created",
                        null, null, null, null, null, null, null, null),
                true, true, false, false, null, varNamePrefix + "Listener", List.of(type), null, null, null,
                cdType(CD_TYPE_LISTENER_VAR_NAME), null);
    }

    /**
     * Walks the listener's init params in declaration order, assigning each the {@code argType}/
     * position codedata {@link SchemaDrivenSourceGenerator} needs to place it as a constructor
     * argument. An {@code INCLUDED_RECORD} spread consumes no positional slot (its fields are already
     * flattened into named top-level entries by {@code ListenerUtil}); any other param occupies one
     * positional/named slot.
     */
    private static void walkListenerParams(List<TriggerLibraryFacts.Param> initParams, Listener listenerModel,
                                           int startPosition,
                                           Map<String, TriggerUISchemaModel.Property> createNewProps) {
        int position = startPosition;
        for (TriggerLibraryFacts.Param param : initParams) {
            if ("INCLUDED_RECORD".equals(param.kind())) {
                for (TriggerLibraryFacts.Param field : param.fields()) {
                    Value fieldValue = listenerModel.getProperty(field.name());
                    if (fieldValue == null) {
                        continue;
                    }
                    String argType = field.optional()
                            ? "LISTENER_PARAM_INCLUDED_DEFAULTABLE_FIELD" : "LISTENER_PARAM_INCLUDED_FIELD";
                    createNewProps.put(field.name(), enrichListenerParam(fieldValue, argType, null));
                }
                continue;
            }
            Value paramValue = listenerModel.getProperty(param.name());
            if (paramValue == null) {
                continue;
            }
            createNewProps.put(param.name(), enrichListenerParam(paramValue, "LISTENER_PARAM_REQUIRED", position));
            position++;
        }
    }

    /**
     * Converts one listener init-param {@link Value} into a {@link TriggerUISchemaModel.Property} via
     * a JSON round-trip, keeping its resolved {@code metadata}/{@code types}/{@code placeholder}/
     * {@code value}/{@code optional} as-is and only replacing {@code codedata} (with the
     * {@code argType}/{@code position} pair {@link SchemaDrivenSourceGenerator} reads) and forcing
     * {@code advanced} to {@code false}.
     */
    private static TriggerUISchemaModel.Property enrichListenerParam(Value value, String argType, Integer position) {
        TriggerUISchemaModel.Property property = GSON.fromJson(GSON.toJsonTree(value),
                TriggerUISchemaModel.Property.class);
        return new TriggerUISchemaModel.Property(property.metadata(), property.enabled(), property.editable(),
                property.optional(), false, property.placeholder(), property.value(),
                property.types(), property.items(), property.choices(), property.properties(),
                cdListenerParam(argType, position, null), property.validations());
    }

    /** The "use existing" branch's selector; the LS injects the project's existing listeners at request time. */
    private static TriggerUISchemaModel.Property existingListenerSelector() {
        TriggerUISchemaModel.PropertyType type = new TriggerUISchemaModel.PropertyType(
                "SINGLE_SELECT_LISTENER", true, null, null, null, null, null, null);
        return new TriggerUISchemaModel.Property(
                new TriggerUISchemaModel.Metadata("Listener", "The existing listener to attach to", null, null,
                        null, null, null, null, null, null),
                true, true, false, false, null, null, List.of(type), null, null, null,
                cdType(CD_TYPE_EXISTING_LISTENER), null);
    }

    /**
     * Adds an {@code identifier}/base-path field when the primary service type declares one and it is
     * not already resolved by a preferred annotation-field alternative (a {@code structure.exactlyOne}
     * rule over the identifier and one or more annotation fields).
     */
    private static void buildIdentifierField(TriggerMetadataModel.ServiceType serviceType,
                                             Map<String, TriggerUISchemaModel.Property> initProperties) {
        IdentifierSpec identifier = serviceType.identifier();
        if (identifier == null) {
            return;
        }
        if (isSupersededByPreferredAnnotation(serviceType)) {
            return;
        }
        boolean isBasePath = identifier.form() != null && identifier.form().contains(IdentifierSpec.FORM_BASE_PATH);
        String fieldType = isBasePath ? "SERVICE_PATH" : "IDENTIFIER";
        boolean optional = IdentifierSpec.PRESENCE_OPTIONAL.equals(identifier.presence());
        TriggerUISchemaModel.PropertyType type = new TriggerUISchemaModel.PropertyType(
                fieldType, true, "string", null, null, null, null, null);
        TriggerUISchemaModel.Property property = new TriggerUISchemaModel.Property(
                new TriggerUISchemaModel.Metadata(isBasePath ? "Service Path" : "Identifier",
                        isBasePath ? "The base path this service is exposed on"
                                : "The identifier for this service", null, null, null, null, null, null, null, null),
                true, true, optional, false, isBasePath ? "/" : null, null, List.of(type), null, null, null,
                cdType("SERVICE_ID"), null);
        initProperties.put(IDENTIFIER_KEY, property);
    }

    /**
     * True when a {@code structure.exactlyOne} rule over the identifier prefers an annotation field.
     * Any other rule kind is irrelevant here and simply skipped, per the spec's skip-unknown policy.
     */
    private static boolean isSupersededByPreferredAnnotation(TriggerMetadataModel.ServiceType serviceType) {
        return preferredAnnotationFieldId(serviceType) != null;
    }

    /** The id of the annotation a {@code structure.exactlyOne} rule prefers over the identifier, or null. */
    private static String preferredAnnotationFieldId(TriggerMetadataModel.ServiceType serviceType) {
        if (serviceType.rules() == null) {
            return null;
        }
        for (TriggerMetadataModel.Rule rule : serviceType.rules()) {
            if (!TriggerMetadataModel.Rule.RULE_EXACTLY_ONE.equals(rule.rule())) {
                continue;
            }
            if (rule.subjects() == null) {
                continue;
            }
            boolean hasIdentifierSubject = rule.subjects().stream()
                    .anyMatch(s -> TriggerMetadataModel.Subject.KIND_IDENTIFIER.equals(s.kind()));
            if (!hasIdentifierSubject) {
                continue;
            }
            TriggerMetadataModel.Subject preferred = preferredSubject(rule);
            if (preferred != null && TriggerMetadataModel.Subject.KIND_ANNOTATION_FIELD.equals(preferred.kind())) {
                return preferred.annotation();
            }
        }
        return null;
    }

    /** The subject named by {@code prefer} (matched on {@code role}), or the first subject if absent. */
    private static TriggerMetadataModel.Subject preferredSubject(TriggerMetadataModel.Rule rule) {
        if (rule.subjects() == null || rule.subjects().isEmpty()) {
            return null;
        }
        if (rule.prefer() == null) {
            return rule.subjects().get(0);
        }
        return rule.subjects().stream()
                .filter(s -> rule.prefer().equals(s.role()))
                .findFirst()
                .orElse(rule.subjects().get(0));
    }

    /**
     * The option value (and default) must be the service type's name, not its schema id: this is
     * what {@code SchemaDrivenSourceGenerator#selectServiceType} matches the user's choice against,
     * since {@code ServiceTypeModel} carries no other stable identifier.
     */
    private static TriggerUISchemaModel.Property buildServiceTypeSelector(
            List<TriggerMetadataModel.ServiceType> serviceTypes) {
        List<TriggerUISchemaModel.Option> options = new ArrayList<>();
        for (TriggerMetadataModel.ServiceType st : serviceTypes) {
            String name = st.type() == null ? "" : st.type().name();
            options.add(new TriggerUISchemaModel.Option(humanize(stripId(st.id())), name, null));
        }
        TriggerUISchemaModel.PropertyType type = new TriggerUISchemaModel.PropertyType(
                "SINGLE_SELECT", true, null, options, null, null, null, null);
        TypeRef firstType = serviceTypes.get(0).type();
        return new TriggerUISchemaModel.Property(
                new TriggerUISchemaModel.Metadata("Service Type", "The kind of service to create", null, null,
                        null, null, null, null, null, null),
                true, true, false, false, null, firstType == null ? "" : firstType.name(), List.of(type), null, null,
                null, cdType(ARG_TYPE_SERVICE_TYPE_DESCRIPTOR), null);
    }

    private static TriggerUISchemaModel.ServiceTypeModel buildServiceType(TriggerMetadataModel.ServiceType serviceType,
                                                                  TriggerLibraryFacts facts,
                                                                  Map<String, TriggerLibraryFacts> crossModuleFacts,
                                                                  TriggerMetadataModel authoring,
                                                                  ConnectorIdentity identity, boolean isFirst,
                                                                  boolean multiType) {
        String moduleName = identity.moduleName();
        String typeName = serviceType.type() == null ? "" : serviceType.type().name();
        Map<String, TriggerUISchemaModel.Property> properties = buildServiceAnnotations(serviceType, authoring, facts,
                crossModuleFacts, identity);

        TypeRef.PackageInfo servicePkg = serviceType.type() == null ? null : serviceType.type().packageInfo();
        String serviceTypeOrg = servicePkg != null && servicePkg.org() != null ? servicePkg.org() : identity.orgName();
        String serviceTypePackage = servicePkg != null && servicePkg.packageName() != null
                ? servicePkg.packageName() : identity.packageName();
        String serviceTypeModule = servicePkg != null && servicePkg.moduleName() != null
                ? servicePkg.moduleName() : moduleName;

        List<TriggerUISchemaModel.FunctionModel> functions = new ArrayList<>();
        List<TriggerUISchemaModel.FunctionModel> schemaFunctions = new ArrayList<>();
        TriggerMetadataModel.ServiceType.Handlers handlers = serviceType.handlers();
        if (handlers != null && handlers.backedByConcreteType()) {
            TriggerLibraryFacts.ServiceType stFacts = findServiceType(typeName, facts);
            if (stFacts != null) {
                for (TriggerLibraryFacts.Function fn : stFacts.functions()) {
                    functions.add(buildFunctionFromFacts(fn, moduleName));
                }
            }
        } else if (handlers != null && handlers.options() != null) {
            for (TriggerMetadataModel.ServiceType.HandlerOption option : handlers.options()) {
                schemaFunctions.add(buildFunctionFromAuthoring(option, authoring, moduleName, facts, crossModuleFacts,
                        identity));
            }
        }

        String description = serviceType.doc() == null || serviceType.doc().isBlank() ? null : serviceType.doc();
        return new TriggerUISchemaModel.ServiceTypeModel(
                new TriggerUISchemaModel.Metadata(humanize(stripId(serviceType.id())), description,
                        serviceType.deprecated(), null, null, null, null, null, serviceType.deprecated() != null,
                        null),
                typeName, null, isFirst, multiType, properties, functions, schemaFunctions,
                cdServiceType(typeName, serviceTypeModule, serviceTypeOrg, serviceTypePackage));
    }

    private static TriggerLibraryFacts.ServiceType findServiceType(String name, TriggerLibraryFacts facts) {
        for (TriggerLibraryFacts.ServiceType st : facts.serviceTypes()) {
            if (st.name().equals(name)) {
                return st;
            }
        }
        return null;
    }

    /**
     * The introspected listener matching the authoring schema's declared type, or the first one on a
     * miss (including when the authoring schema declares no type at all).
     */
    private static TriggerLibraryFacts.Listener findListener(TriggerMetadataModel.Listener listener,
                                                              TriggerLibraryFacts facts) {
        if (facts.listeners() == null || facts.listeners().isEmpty()) {
            return null;
        }
        String name = listener.type() == null ? null : listener.type().name();
        if (name != null) {
            int colon = name.lastIndexOf(':');
            String simpleName = colon < 0 ? name : name.substring(colon + 1);
            for (TriggerLibraryFacts.Listener candidate : facts.listeners()) {
                if (candidate.type().equals(simpleName)) {
                    return candidate;
                }
            }
        }
        return facts.listeners().get(0);
    }

    /** A locked handler for a {@code backedByConcreteType} service type -- entirely from introspection. */
    private static TriggerUISchemaModel.FunctionModel buildFunctionFromFacts(TriggerLibraryFacts.Function fn,
                                                                     String moduleName) {
        List<TriggerUISchemaModel.Parameter> parameters = new ArrayList<>();
        for (TriggerLibraryFacts.Param param : fn.parameters()) {
            parameters.add(buildParameterFromFacts(param));
        }
        TriggerUISchemaModel.ReturnType returnType = buildReturnType(fn.returnType(), fn.returnsError());
        String description = fn.doc() == null || fn.doc().isBlank() ? "The `" + fn.name() + "` handler." : fn.doc();
        return new TriggerUISchemaModel.FunctionModel(
                new TriggerUISchemaModel.Metadata(fn.name(), description, null, null, null, null, null, null,
                        null, null),
                fn.name(), false, null, fn.kind(), null, fn.qualifiers(), null, null, true, false, false, false,
                null, null, null, parameters, null, Map.of(), returnType, null,
                cdFunction(fn.name(), moduleName), null);
    }

    private static TriggerUISchemaModel.Parameter buildParameterFromFacts(TriggerLibraryFacts.Param param) {
        TriggerUISchemaModel.Property typeProperty = plainTypeProperty(param.type());
        TriggerUISchemaModel.Property nameProperty = identifierProperty(param.name(), true);
        return new TriggerUISchemaModel.Parameter(
                new TriggerUISchemaModel.Metadata(humanize(param.name()),
                        param.doc() == null || param.doc().isBlank() ? null : param.doc(), null, null, null, null,
                        null, null, null, null),
                KIND_REQUIRED, typeProperty, nameProperty, null, null, null, null, true, false, param.optional(),
                false, false, cdType("FUNCTION_PARAM"), null);
    }

    private static TriggerUISchemaModel.Property identifierProperty(String name, boolean editable) {
        TriggerUISchemaModel.PropertyType type = new TriggerUISchemaModel.PropertyType(
                "IDENTIFIER", true, null, null, null, null, null, null);
        return new TriggerUISchemaModel.Property(
                new TriggerUISchemaModel.Metadata(name, null, null, null, null, null, null, null, null, null),
                true, editable, false, false, name, name, List.of(type), null, null, null, null, null);
    }

    /** An addable/locked handler built entirely from the authoring schema's own {@code HandlerOption}. */
    private static TriggerUISchemaModel.FunctionModel buildFunctionFromAuthoring(
            TriggerMetadataModel.ServiceType.HandlerOption option, TriggerMetadataModel authoring, String moduleName,
            TriggerLibraryFacts facts, Map<String, TriggerLibraryFacts> crossModuleFacts, ConnectorIdentity identity) {
        boolean many = TriggerMetadataModel.ServiceType.HandlerOption.ADD_MODE_MANY.equals(option.addMode());
        boolean required = "required".equals(option.presence());

        List<TriggerUISchemaModel.Parameter> parameters = new ArrayList<>();
        if (option.params() != null) {
            for (TriggerMetadataModel.ServiceType.Param param : option.params()) {
                parameters.add(buildParameterFromAuthoring(param, moduleName));
            }
        }
        TriggerUISchemaModel.ReturnType returnType = buildReturnTypeFromRefs(
                option.returns() == null ? null : option.returns().type(), moduleName);
        Map<String, TriggerUISchemaModel.Property> properties = buildFunctionAnnotations(option.annotations(),
                authoring, facts, crossModuleFacts, identity);

        String name = many ? "" : option.name();
        String label = many ? "Handler" : option.name();
        String description = option.doc() == null || option.doc().isBlank()
                ? "The `" + option.name() + "` handler." : option.doc();
        return new TriggerUISchemaModel.FunctionModel(
                new TriggerUISchemaModel.Metadata(label, description, option.deprecated(), null, null,
                        many ? "Add Handler" : null, null, null, option.deprecated() != null, null),
                name, many, null, option.kind() == null ? null : option.kind().toUpperCase(Locale.ROOT),
                null, option.kind() == null ? null : List.of(option.kind()), null, null, false, true, !required,
                false, null, null, null, parameters, null, properties, returnType, null,
                cdFunction(option.name(), moduleName), null);
    }

    /**
     * Renders each of a handler's {@code attachPoint: "function"} annotations the same way a
     * service-level one renders (see {@link #buildAnnotationProperty}), keyed by schema id.
     */
    private static Map<String, TriggerUISchemaModel.Property> buildFunctionAnnotations(List<String> annotationIds,
                                                                                TriggerMetadataModel authoring,
                                                                                TriggerLibraryFacts facts,
                                                                                Map<String, TriggerLibraryFacts>
                                                                                        crossModuleFacts,
                                                                                ConnectorIdentity identity) {
        Map<String, TriggerUISchemaModel.Property> properties = new LinkedHashMap<>();
        if (annotationIds == null || annotationIds.isEmpty() || authoring.annotations() == null) {
            return properties;
        }
        for (String id : annotationIds) {
            findAnnotationDeclaration(id, authoring)
                    .ifPresent(annotation -> properties.put(stripId(id),
                            buildAnnotationProperty(annotation, facts, crossModuleFacts, identity,
                                    CD_TYPE_ANNOTATION_ATTACHMENT, false)));
        }
        return properties;
    }

    private static Optional<TriggerMetadataModel.Annotation> findAnnotationDeclaration(
            String id, TriggerMetadataModel authoring) {
        return authoring.annotations().stream().filter(a -> id.equals(a.id())).findFirst();
    }

    /**
     * Builds one handler parameter. A non-data-bound, optional, named parameter (e.g. FTP's
     * {@code caller}) is a framework-injected object rendered as a {@code FLAG} checkbox; every other
     * parameter renders as a normal typed field.
     */
    private static TriggerUISchemaModel.Parameter buildParameterFromAuthoring(
            TriggerMetadataModel.ServiceType.Param param, String moduleName) {
        boolean optional = "optional".equals(param.presence());
        String name = param.name() == null ? "" : param.name();
        TriggerMetadataModel.ServiceType.DataBinding binding = param.dataBinding();

        String typeName = renderTypeRef(param.type(), moduleName);
        if (binding == null && optional && !name.isEmpty()) {
            return buildFlagParameter(name, typeName);
        }

        TriggerUISchemaModel.Property typeProperty = binding == null
                ? plainTypeProperty(typeName)
                : dataBindingTypeProperty(binding, typeName, moduleName, name.isEmpty() ? "value" : name);
        TriggerUISchemaModel.Property nameProperty = identifierProperty(name.isEmpty() ? "value" : name, true);
        String kind = binding != null ? DATA_BINDING : (optional ? DB_KIND_OPTIONAL : KIND_REQUIRED);
        return new TriggerUISchemaModel.Parameter(
                new TriggerUISchemaModel.Metadata(humanize(name.isEmpty() ? "value" : name), param.doc(),
                        param.deprecated(), null, null, null, null, null, param.deprecated() != null, null),
                kind, typeProperty, nameProperty, null, null, null, null, true, true,
                optional, false, false, cdType("FUNCTION_PARAM"), null);
    }

    /** A framework-injected opt-in parameter (e.g. {@code Caller}): a checkbox plus a fixed identifier. */
    private static TriggerUISchemaModel.Parameter buildFlagParameter(String name, String qualifiedType) {
        String label = humanize(name);
        TriggerUISchemaModel.PropertyType flagType = new TriggerUISchemaModel.PropertyType(
                FIELD_TYPE_FLAG, true, qualifiedType, null, null, null, null, null);
        TriggerUISchemaModel.Property typeProperty = new TriggerUISchemaModel.Property(
                new TriggerUISchemaModel.Metadata("Include " + label,
                        "Tick to include the " + label.toLowerCase(Locale.ROOT) + " parameter in the handler "
                                + "signature.", null, null, null, null, null, null, null, null),
                true, true, true, false, null, false, List.of(flagType), null, null, null, cd(), null);
        TriggerUISchemaModel.Property nameProperty = identifierProperty(name, false);
        return new TriggerUISchemaModel.Parameter(
                new TriggerUISchemaModel.Metadata(label, "The " + label.toLowerCase(Locale.ROOT) + " object.", null,
                        null, null, null, null, null, null, null),
                DB_KIND_OPTIONAL, typeProperty, nameProperty, null, null, null, null, false, true, true, true, false,
                cdType("FUNCTION_PARAM"), null);
    }

    private static TriggerUISchemaModel.Property plainTypeProperty(String typeName) {
        TriggerUISchemaModel.PropertyType type = new TriggerUISchemaModel.PropertyType(
                "TYPE", true, typeName, null, null, null, null, null);
        return new TriggerUISchemaModel.Property(
                new TriggerUISchemaModel.Metadata("Parameter Type", "The type of the parameter", null, null, null, null,
                        null, null, null, null),
                true, false, false, false, null, typeName, List.of(type), null, null, null, cd(), null);
    }

    /**
     * The {@code PAYLOAD_TYPE}/{@code PAYLOAD_TYPE_INCLUDED_RECORD} composition for a data-bound
     * parameter, over the {@code included} vs. plain (bare/array) shapes carried by the param's own
     * {@link TriggerMetadataModel.ServiceType.DataBinding}. A binding with a {@code stream} shape
     * anywhere nests the payload under a {@code COMPLEX_PAYLOAD} container alongside a {@code stream}
     * {@code PAYLOAD_MODIFIER} toggle (see {@link PayloadComposer}); that toggle's own template is
     * fixed and unrelated to the shape's {@code completionType}.
     */
    private static TriggerUISchemaModel.Property dataBindingTypeProperty(
            TriggerMetadataModel.ServiceType.DataBinding binding, String typeName, String moduleName,
            String paramName) {
        List<TriggerMetadataModel.ServiceType.TypedescVariant> variants = binding.typedescs();
        ShapeMatch included = findIncludedShape(variants);

        String cdType;
        String defaultType;
        String template;
        String field = null;
        String typeConstraint = null;
        if (included != null) {
            cdType = CD_TYPE_PAYLOAD_TYPE_INCLUDED_RECORD;
            defaultType = included.shape().envelope() == null ? typeName
                    : renderTypeRef(included.shape().envelope(), moduleName);
            List<String> bindableFields = included.shape().bindableFields();
            field = bindableFields == null || bindableFields.isEmpty() ? null : bindableFields.get(0);
            template = TriggerMetadataModel.ServiceType.Shape.FORM_ARRAY.equals(included.shape().form())
                    ? "{{type}}[]" : "{{type}}";
        } else {
            cdType = CD_TYPE_PAYLOAD_TYPE;
            ShapeMatch declared = findDeclaredShape(variants);
            if (declared != null) {
                defaultType = renderTypeRef(declared.variant().constraint(), moduleName);
                template = TriggerMetadataModel.ServiceType.Shape.FORM_ARRAY.equals(declared.shape().form())
                        ? "{{type}}[]" : "{{type}}";
                typeConstraint = defaultType;
            } else {
                defaultType = typeName;
                template = "{{type}}";
            }
        }

        TriggerUISchemaModel.PropertyType propertyType = new TriggerUISchemaModel.PropertyType(
                CD_TYPE_PAYLOAD_TYPE, true, null, null, null, null,
                List.of(new TriggerUISchemaModel.PayloadFormat(List.of("schema", "browse", "json", "xml"), "json")),
                null);
        TriggerUISchemaModel.Property payload = new TriggerUISchemaModel.Property(
                new TriggerUISchemaModel.Metadata("Payload", "The shape of the received payload", null, null,
                        null, null, null, null, null, null),
                true, true, false, false, null, "", List.of(propertyType), null, null, null,
                cdPayload(cdType, defaultType, template, field, typeConstraint), null);

        if (!hasStreamShape(variants)) {
            return payload;
        }
        Map<String, TriggerUISchemaModel.Property> children = new LinkedHashMap<>();
        children.put("payload", payload);
        children.put("stream", buildStreamModifierProperty(paramName));
        TriggerUISchemaModel.PropertyType complexType = new TriggerUISchemaModel.PropertyType(
                "COMPLEX_PAYLOAD", true, null, null, null, null, null, null);
        return new TriggerUISchemaModel.Property(payload.metadata(), true, true, false, false, null, "",
                List.of(complexType), null, null, children, cd(), null);
    }

    private record ShapeMatch(TriggerMetadataModel.ServiceType.TypedescVariant variant,
                              TriggerMetadataModel.ServiceType.Shape shape) {
    }

    /** The first shape (declaration order) across all variants that splices into an envelope. */
    private static ShapeMatch findIncludedShape(List<TriggerMetadataModel.ServiceType.TypedescVariant> variants) {
        if (variants == null) {
            return null;
        }
        for (TriggerMetadataModel.ServiceType.TypedescVariant variant : variants) {
            if (variant.shapes() == null) {
                continue;
            }
            for (TriggerMetadataModel.ServiceType.Shape shape : variant.shapes()) {
                if (isIncluded(shape)) {
                    return new ShapeMatch(variant, shape);
                }
            }
        }
        return null;
    }

    /** The first variant's first directly-declared shape (skipping {@code included} and {@code stream}). */
    private static ShapeMatch findDeclaredShape(List<TriggerMetadataModel.ServiceType.TypedescVariant> variants) {
        if (variants == null || variants.isEmpty()) {
            return null;
        }
        TriggerMetadataModel.ServiceType.TypedescVariant first = variants.get(0);
        if (first.shapes() == null) {
            return null;
        }
        for (TriggerMetadataModel.ServiceType.Shape shape : first.shapes()) {
            if (!isIncluded(shape) && !TriggerMetadataModel.ServiceType.Shape.FORM_STREAM.equals(shape.form())) {
                return new ShapeMatch(first, shape);
            }
        }
        return null;
    }

    private static boolean isIncluded(TriggerMetadataModel.ServiceType.Shape shape) {
        return TriggerMetadataModel.ServiceType.Shape.FORM_INCLUDED.equals(shape.form())
                || TriggerMetadataModel.ServiceType.Shape.ELEMENT_INCLUDED.equals(shape.element());
    }

    /** A {@code stream} shape is presence-only: {@link #buildStreamModifierProperty} owns its template. */
    private static boolean hasStreamShape(List<TriggerMetadataModel.ServiceType.TypedescVariant> variants) {
        if (variants == null) {
            return false;
        }
        for (TriggerMetadataModel.ServiceType.TypedescVariant variant : variants) {
            if (variant.shapes() == null) {
                continue;
            }
            for (TriggerMetadataModel.ServiceType.Shape shape : variant.shapes()) {
                if (TriggerMetadataModel.ServiceType.Shape.FORM_STREAM.equals(shape.form())) {
                    return true;
                }
            }
        }
        return false;
    }

    /** The {@code stream} toggle that switches a bound payload's wrap from {@code T[]} to {@code stream<T, error?>}. */
    private static TriggerUISchemaModel.Property buildStreamModifierProperty(String targetParam) {
        String template = "stream<{{type}}, error?>";
        TriggerUISchemaModel.PropertyType flagType = new TriggerUISchemaModel.PropertyType(
                FIELD_TYPE_FLAG, true, null, null, null, template, null, null);
        TriggerUISchemaModel.Codedata modifierCodedata = TriggerUISchemaModel.Codedata.builder()
                .type(CD_TYPE_PAYLOAD_MODIFIER).template(template).modifier("stream").supersedes(List.of("base"))
                .targetParam(targetParam).build();
        return new TriggerUISchemaModel.Property(
                new TriggerUISchemaModel.Metadata("Stream (Large Files)", "Process the file content in chunks", null,
                        null, null, null, null, null, null, null),
                true, true, false, false, null, false, List.of(flagType), null, null, null, modifierCodedata, null);
    }

    private static TriggerUISchemaModel.ReturnType buildReturnType(String type, boolean hasError) {
        boolean enabled = type != null && !"()".equals(type);
        return new TriggerUISchemaModel.ReturnType(
                new TriggerUISchemaModel.Metadata("Return Type", "The return type of the function.", null, null, null,
                        null, null, null, null, null),
                type, false, null, enabled, false, enabled, hasError, "", cd(), null);
    }

    private static TriggerUISchemaModel.ReturnType buildReturnTypeFromRefs(List<TypeRef> refs, String moduleName) {
        if (refs == null || refs.isEmpty()) {
            return buildReturnType(null, false);
        }
        return buildReturnType(renderTypeRef(refs, moduleName), hasErrorMember(refs));
    }

    /**
     * Whether the returned union has an {@code error} member of its own. Only the union's top-level
     * members count: a substring scan of the rendered signature would also match an {@code error} that
     * is merely a stream's completion type (e.g. {@code stream<anydata, error|()>}, a union with no
     * error member) and would misfire on any type name that embeds the word. A module's own distinct
     * error (e.g. {@code tcp:Error}) is deliberately not counted it is already spelled out in the
     * rendered type, and {@code hasError} only drives appending a further {@code |error} to it.
     */
    private static boolean hasErrorMember(List<TypeRef> refs) {
        for (TypeRef ref : refs) {
            if (ref != null && ref.isNamed() && ERROR_TYPE.equals(ref.name())) {
                return true;
            }
        }
        // TODO: handle sub type of error type using semantic api
        return false;
    }

    /**
     * Every {@code service}-attached annotation applicable to {@code serviceType}; shared by
     * {@link #buildInitServiceAnnotations} and {@link #buildServiceAnnotations} so the two stay in
     * lockstep.
     */
    private static List<TriggerMetadataModel.Annotation> applicableServiceAnnotations(
            TriggerMetadataModel.ServiceType serviceType, TriggerMetadataModel authoring) {
        if (serviceType.annotations() == null || authoring.annotations() == null) {
            return List.of();
        }
        List<TriggerMetadataModel.Annotation> applicable = new ArrayList<>();
        for (String id : serviceType.annotations()) {
            findAnnotationDeclaration(id, authoring).ifPresent(applicable::add);
        }
        return applicable;
    }

    /**
     * Renders every {@code service}-attached annotation applicable to {@code serviceType} as a single
     * {@code RECORD_MAP_EXPRESSION} field, on the service type's own {@code properties} (consulted by
     * the view/update-service path). Distinct from the add-time copy {@link #buildInitServiceAnnotations}
     * places in the init form.
     */
    private static Map<String, TriggerUISchemaModel.Property> buildServiceAnnotations(
            TriggerMetadataModel.ServiceType serviceType, TriggerMetadataModel authoring, TriggerLibraryFacts facts,
            Map<String, TriggerLibraryFacts> crossModuleFacts, ConnectorIdentity identity) {
        Map<String, TriggerUISchemaModel.Property> properties = new LinkedHashMap<>();
        for (TriggerMetadataModel.Annotation annotation : applicableServiceAnnotations(serviceType, authoring)) {
            properties.put(stripId(annotation.id()), buildAnnotationProperty(annotation, facts, crossModuleFacts,
                    identity, CD_TYPE_ANNOTATION_ATTACHMENT, false));
        }
        return properties;
    }

    /**
     * Places a copy of every applicable service-level annotation directly in the add-trigger init form,
     * keyed by schema id, using the {@code SERVICE_ANNOTATION} codedata role that
     * {@code SchemaDrivenSourceGenerator#buildServiceAnnotations} scans for at add-time. The annotation
     * {@link #preferredAnnotationFieldId} names is forced required, since the identifier alternative
     * isn't shown here.
     */
    private static void buildInitServiceAnnotations(TriggerMetadataModel.ServiceType serviceType,
                                                    TriggerMetadataModel authoring, TriggerLibraryFacts facts,
                                                    Map<String, TriggerLibraryFacts> crossModuleFacts,
                                                    ConnectorIdentity identity,
                                                    Map<String, TriggerUISchemaModel.Property> initProperties) {
        String requiredId = preferredAnnotationFieldId(serviceType);
        for (TriggerMetadataModel.Annotation annotation : applicableServiceAnnotations(serviceType, authoring)) {
            boolean forceRequired = annotation.id().equals(requiredId);
            initProperties.put(stripId(annotation.id()), buildAnnotationProperty(annotation, facts, crossModuleFacts,
                    identity, CD_TYPE_SERVICE_ANNOTATION, forceRequired));
        }
    }

    /**
     * Looks up introspected annotation facts by the annotation's own name (not its backing record
     * type's name, which can legitimately differ, e.g. SMB's
     * {@code annotation SmbServiceConfig ServiceConfig on service;}).
     */
    private static TriggerLibraryFacts.Annotation findAnnotationFacts(String name, TriggerLibraryFacts facts) {
        if (facts.annotations() == null) {
            return null;
        }
        for (TriggerLibraryFacts.Annotation candidate : facts.annotations()) {
            if (candidate.name().equals(name)) {
                return candidate;
            }
        }
        return null;
    }

    /**
     * Builds one annotation attachment field, shared by every attachment point; only the emitted
     * {@code codedata.type} differs per caller. {@code forceRequired} overrides the annotation's own
     * declared presence (see {@link #preferredAnnotationFieldId}).
     */
    private static TriggerUISchemaModel.Property buildAnnotationProperty(TriggerMetadataModel.Annotation annotation,
                                                                  TriggerLibraryFacts facts,
                                                                  Map<String, TriggerLibraryFacts> crossModuleFacts,
                                                                  ConnectorIdentity identity,
                                                                  String codedataType, boolean forceRequired) {
        TypeRef annotationType = annotation.type();
        String annotationName = annotationType == null ? stripId(annotation.id()) : annotationType.name();
        TypeRef.PackageInfo annotationPkg = annotationType == null ? null : annotationType.packageInfo();
        boolean crossModule = annotationPkg != null;
        String pkgOrg = crossModule ? annotationPkg.org() : identity.orgName();
        String pkgName = crossModule ? annotationPkg.packageName() : identity.packageName();
        String pkgModule = crossModule ? annotationPkg.moduleName() : identity.moduleName();
        String pkgVersion = crossModule ? annotationPkg.version() : identity.version();
        String packageInfoStr = pkgOrg + ":" + pkgName + ":" + pkgVersion;

        // A cross-module annotation (e.g. CDC's shared ballerinax/cdc) needs facts from that other
        // package, not the connector's own -- falls back to facts if unresolved.
        TriggerLibraryFacts annotationFacts = crossModule
                ? crossModuleFacts.getOrDefault(crossModuleFactsKey(annotationPkg), facts) : facts;
        TriggerLibraryFacts.Annotation facted = findAnnotationFacts(annotationName, annotationFacts);
        String recordTypeName = facted != null && facted.typeConstraint() != null
                ? simpleName(facted.typeConstraint()) : annotationName;

        TriggerUISchemaModel.TypeMember member = new TriggerUISchemaModel.TypeMember(
                recordTypeName, packageInfoStr, pkgName, "RECORD_TYPE", true);
        TriggerUISchemaModel.PropertyType propertyType = new TriggerUISchemaModel.PropertyType(
                "RECORD_MAP_EXPRESSION", true, aliasOf(pkgModule) + ":" + recordTypeName, null, List.of(member),
                null, null, null);
        boolean optional = !forceRequired
                && TriggerMetadataModel.Annotation.PRESENCE_OPTIONAL.equals(annotation.presence());
        return new TriggerUISchemaModel.Property(
                new TriggerUISchemaModel.Metadata(humanize(stripId(annotation.id())),
                        "Configuration for this service", null, null, null, null, null, null, null, null),
                true, true, optional, false, "{}", null, List.of(propertyType), null, null, null,
                cdAnnotation(codedataType, annotationName, pkgModule, pkgOrg, pkgName, optional), null);
    }

    /** A union as {@code A|B}, qualified per {@link #aliasOf}. */
    private static String renderTypeRef(List<TypeRef> refs, String moduleName) {
        return TypeRefRenderer.render(refs, moduleName, TriggerModelSynthesizer::aliasOf);
    }

    /** One type, qualified per {@link #aliasOf}. */
    private static String renderTypeRef(TypeRef ref, String moduleName) {
        return TypeRefRenderer.render(ref, moduleName, TriggerModelSynthesizer::aliasOf);
    }

    /** The import prefix a module's own model strings are authored with. */
    private static String aliasOf(String moduleName) {
        return ModuleAliasResolver.selfPrefix(moduleName);
    }

    /** The unqualified suffix of a module-qualified name, e.g. {@code "smb:SmbServiceConfig" -> "SmbServiceConfig"}.
     *  Package-visible: shared with {@link SchemaDrivenSourceGenerator}. */
    static String simpleName(String qualified) {
        int colon = qualified.lastIndexOf(':');
        return colon < 0 ? qualified : qualified.substring(colon + 1);
    }

    /** Strips the spec's leading {@code $} from an id used as a user-facing label or map key. */
    private static String stripId(String id) {
        return id != null && id.startsWith("$") ? id.substring(1) : id;
    }

    /** {@code "bootstrapServers" -> "Bootstrap Servers"}; also splits on {@code _}/{@code -}/{@code .}. */
    static String humanize(String identifier) {
        if (identifier == null || identifier.isEmpty()) {
            return identifier;
        }
        StringBuilder result = new StringBuilder();
        char[] chars = identifier.replace('_', ' ').replace('-', ' ').replace('.', ' ').toCharArray();
        boolean capitalizeNext = true;
        for (int i = 0; i < chars.length; i++) {
            char c = chars[i];
            if (c == ' ') {
                result.append(' ');
                capitalizeNext = true;
                continue;
            }
            if (i > 0 && Character.isUpperCase(c) && Character.isLowerCase(chars[i - 1])) {
                result.append(' ');
            }
            result.append(capitalizeNext ? Character.toUpperCase(c) : c);
            capitalizeNext = false;
        }
        return result.toString();
    }
}
