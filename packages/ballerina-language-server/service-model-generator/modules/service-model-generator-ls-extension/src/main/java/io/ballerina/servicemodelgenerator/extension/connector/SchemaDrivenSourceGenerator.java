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

import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.modelgenerator.commons.ImportPrefixReader;
import io.ballerina.modelgenerator.commons.ModuleAliasResolver;
import io.ballerina.modelgenerator.commons.trigger.models.TriggerUISchemaModel;
import io.ballerina.servicemodelgenerator.extension.model.Codedata;
import io.ballerina.servicemodelgenerator.extension.model.PropertyType;
import io.ballerina.servicemodelgenerator.extension.model.ServiceInitModel;
import io.ballerina.servicemodelgenerator.extension.model.Value;
import io.ballerina.servicemodelgenerator.extension.util.Utils;
import org.eclipse.lsp4j.TextEdit;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TreeMap;

import static io.ballerina.servicemodelgenerator.extension.connector.ValueTreeUtils.argName;
import static io.ballerina.servicemodelgenerator.extension.connector.ValueTreeUtils.fieldName;
import static io.ballerina.servicemodelgenerator.extension.connector.ValueTreeUtils.isChoice;
import static io.ballerina.servicemodelgenerator.extension.connector.ValueTreeUtils.isGroup;
import static io.ballerina.servicemodelgenerator.extension.model.ServiceInitModel.KEY_EXISTING_LISTENER;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.ARG_TYPE_CDC_OPERATION_ENABLE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.ARG_TYPE_LISTENER_PARAM_CONFIG_FIELD;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.ARG_TYPE_LISTENER_PARAM_INCLUDED_DEFAULTABLE_FIELD;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.ARG_TYPE_LISTENER_PARAM_INCLUDED_FIELD;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.ARG_TYPE_LISTENER_PARAM_REQUIRED;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.ARG_TYPE_LISTENER_VAR_NAME;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.ARG_TYPE_SERVICE_BASE_PATH;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.ARG_TYPE_SERVICE_TYPE_DESCRIPTOR;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.CD_TYPE_ENUM_VALUE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.CD_TYPE_EXISTING_LISTENER;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.CD_TYPE_LISTENER_VAR_NAME;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.CD_TYPE_SERVICE_ANNOTATION;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.CD_TYPE_STRING_LITERAL;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.CLOSE_BRACE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.COLON;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.FIELD_TYPE_FLAG;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.FIELD_TYPE_VARIATION_SELECTOR;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.KIND_COMPLEX_REMOTE_FUNCTION;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.KIND_MUTATION;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.KIND_QUERY;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.KIND_REMOTE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.KIND_RESOURCE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.KIND_SUBSCRIPTION;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.NEW_LINE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.NEW_LINE_WITH_TAB;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.ON;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.OPEN_BRACE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.REMOTE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.RESOURCE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.SERVICE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.SPACE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.TAB;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.TWO_NEW_LINES;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.TYPE_SERVICE;
import static io.ballerina.servicemodelgenerator.extension.util.ServiceModelUtils.getProtocol;

/**
 * Generates Ballerina source (text edits) for adding a connector-shipped trigger/service, driven
 * entirely by the {@code codedata} on the connector models — no per-connector branches.
 *
 * <p>The creation form is walked recursively: a CHOICE descends into its enabled (or first) branch, a
 * GROUP_SECTION carrying a listener {@code argType} becomes one record argument from its
 * {@code CONFIG_FIELD} children, and leaves are placed by {@code argType} (positional, included,
 * config-field, or enum-qualified). The service type descriptor is resolved from the
 * {@code SERVICE_TYPE_DESCRIPTOR} field wherever it sits. Output stays format-compatible with
 * {@code AbstractServiceBuilder.getServiceDeclarationEdits}.
 *
 * @since 1.8.0
 */
public final class SchemaDrivenSourceGenerator {

    private static final String LISTENER = "listener";
    private static final String LISTENER_TYPE = "Listener";
    private static final String NEW = "new";
    private static final String ERROR = "error";
    // Default target for a CDC operation flag with no explicit `path` (the cdc convention).
    private static final String CDC_OPTIONS_FIELD = "options";
    private static final String CDC_SKIPPED_OPERATIONS_FIELD = "skippedOperations";

    private SchemaDrivenSourceGenerator() {
    }

    /**
     * Builds the {@code listener <proto>:Listener &lt;var&gt; = new (...);} declaration from the filled
     * creation model (CHOICE/GROUP_SECTION aware).
     */
    public static String buildListenerDeclaration(ServiceInitModel creationModel) {
        String emitAlias = defaultEmitAlias(creationModel.getModuleName());
        requalifyValueQualifiers(creationModel.getProperties(),
                getProtocol(creationModel.getModuleName()), emitAlias);
        return renderListenerDeclaration(emitAlias, collectListenerArgs(creationModel));
    }

    /**
     * The {@code \nimport <org>/<module>;\n} statement for the connector, under its natural prefix (see
     * {@link #defaultEmitAlias}); has no target file to check for a collision, so never falls back to
     * an alias.
     */
    public static String buildImport(ServiceInitModel creationModel) {
        return Utils.getImportStmt(creationModel.getOrgName(), creationModel.getModuleName(),
                defaultEmitAlias(creationModel.getModuleName()));
    }

    // The listener-arg walk below is shared across service descriptor resolution; the service descriptor
    // and function block are sourced from the TriggerUISchemaModel.
    /** {@code addServiceAndListener} for the unified model: import (if missing) + listener/service block. */
    public static Map<String, List<TextEdit>> buildAddServiceEditsForTrigger(ServiceInitModel filledInitForm,
                                                                   TriggerUISchemaModel triggerModel,
                                                                   ModulePartNode rootNode, String filePath) {
        List<TextEdit> edits = new ArrayList<>();
        String emitAlias = resolveEmitAlias(rootNode, filledInitForm, triggerModel);
        String imports = buildImports(filledInitForm, triggerModel, rootNode, emitAlias);
        if (!imports.isEmpty()) {
            edits.add(new TextEdit(Utils.toRange(rootNode.lineRange().startLine()), imports));
        }
        edits.add(new TextEdit(Utils.toRange(rootNode.lineRange().endLine()),
                buildServiceBlockForTrigger(filledInitForm, triggerModel, emitAlias)));
        return Map.of(filePath, edits);
    }

    /**
     * The connector import plus any additional imports the model declares in {@code importStatements}
     * (each an {@code org/module} reference). Each is emitted only when not already present in the file.
     */
    private static String buildImports(ServiceInitModel filledInitForm, TriggerUISchemaModel triggerModel,
                                       ModulePartNode rootNode, String emitAlias) {
        StringBuilder imports = new StringBuilder();
        if (!Utils.importExists(rootNode, filledInitForm.getOrgName(), filledInitForm.getModuleName())) {
            imports.append(Utils.getImportStmt(filledInitForm.getOrgName(), filledInitForm.getModuleName(),
                    emitAlias));
        }
        if (triggerModel != null && triggerModel.importStatements() != null) {
            for (String moduleRef : triggerModel.importStatements()) {
                if (moduleRef == null) {
                    continue;
                }
                int slash = moduleRef.indexOf('/');
                if (slash <= 0 || slash == moduleRef.length() - 1) {
                    continue;
                }
                String org = moduleRef.substring(0, slash);
                String rest = moduleRef.substring(slash + 1).trim();
                String module = rest;
                String alias = null;
                int asIndex = rest.lastIndexOf(" as ");
                if (asIndex > 0) {
                    module = rest.substring(0, asIndex).trim();
                    alias = rest.substring(asIndex + 4).trim();
                }
                if (!Utils.importExists(rootNode, org, module)) {
                    imports.append(alias == null ? Utils.getImportStmt(org, module)
                            : Utils.getImportStmt(org, module, alias));
                }
            }
        }
        return imports.toString();
    }

    /**
     * Full add-trigger block from the unified model: listener declaration (create-new branch only) +
     * {@code service <descriptor> on &lt;var&gt; { <present functions> }}.
     */
    public static String buildServiceBlockForTrigger(ServiceInitModel filledInitForm,
                                                      TriggerUISchemaModel triggerModel) {
        return buildServiceBlockForTrigger(filledInitForm, triggerModel,
                modelAliasOrDefault(triggerModel, filledInitForm.getModuleName()));
    }

    /**
     * As {@link #buildServiceBlockForTrigger(ServiceInitModel, TriggerUISchemaModel)}, but referencing the
     * connector's own module under {@code emitAlias} — the prefix its import is (or will be) bound to.
     * Every self-module reference is emitted under it; for a single-segment module the alias equals the
     * natural prefix and every rewrite below is a no-op.
     */
    public static String buildServiceBlockForTrigger(ServiceInitModel filledInitForm, TriggerUISchemaModel triggerModel,
                                                     String emitAlias) {
        String selfPrefix = getProtocol(filledInitForm.getModuleName());
        requalifyValueQualifiers(filledInitForm.getProperties(), selfPrefix, emitAlias);
        ListenerArgs collected = collectListenerArgs(filledInitForm);
        String descriptor = resolveServiceDescriptor(filledInitForm, triggerModel, selfPrefix, emitAlias);
        String basePath = resolveBasePath(filledInitForm);
        List<String> functions = buildRequiredFunctionSources(filledInitForm, triggerModel, selfPrefix, emitAlias);

        StringBuilder builder = new StringBuilder(NEW_LINE);
        if (collected.declareListener) {
            builder.append(renderListenerDeclaration(emitAlias, collected)).append(NEW_LINE);
        }
        for (String annotation : buildServiceAnnotations(filledInitForm, selfPrefix, emitAlias)) {
            builder.append(annotation).append(NEW_LINE);
        }
        builder.append(SERVICE).append(SPACE).append(descriptor).append(SPACE);
        if (!basePath.isEmpty()) {
            builder.append(basePath).append(SPACE);
        }
        builder.append(ON).append(SPACE)
                .append(collected.varName).append(SPACE).append(OPEN_BRACE)
                .append(NEW_LINE)
                .append(String.join(TWO_NEW_LINES, functions)).append(NEW_LINE)
                .append(CLOSE_BRACE).append(NEW_LINE);
        return builder.toString();
    }

    /**
     * The service-level annotation attachments (e.g. {@code @rabbitmq:ServiceConfig {...}}), built
     * entirely from {@code SERVICE_ANNOTATION} fields present in the filled {@code ServiceInitModel}.
     * Fields are grouped by annotation identity ({@code moduleName}/{@code originalName}) and merged
     * into one {@code @module:Name {...}} attachment.
     */
    private static List<String> buildServiceAnnotations(ServiceInitModel filledInitForm, String selfPrefix,
                                                        String emitAlias) {
        Map<String, AnnotationFields> byAnnotation = new LinkedHashMap<>();
        collectAnnotationFields(filledInitForm.getProperties(), byAnnotation);
        List<String> annotations = new ArrayList<>();
        for (AnnotationFields annotation : byAnnotation.values()) {
            if (annotation.wholeValue != null || !annotation.fields.isEmpty()) {
                annotations.add(annotation.render(selfPrefix, emitAlias));
            }
        }
        return annotations;
    }

    /**
     * Recursively collects {@code SERVICE_ANNOTATION} fields from a filled form, grouping same-annotation
     * fields together. A {@code path}-carrying leaf contributes one field to a per-field mapping tree; a
     * synthesized whole-record field (no {@code path}) supplies its raw value as the entire attachment
     * body directly.
     */
    private static void collectAnnotationFields(Map<String, Value> properties,
                                                Map<String, AnnotationFields> byAnnotation) {
        if (properties == null) {
            return;
        }
        for (Value field : properties.values()) {
            if (isChoice(field)) {
                Value branch = enabledOrFirstChoice(field.getChoices());
                if (branch != null) {
                    collectAnnotationFields(branch.getProperties(), byAnnotation);
                }
                continue;
            }
            Codedata codedata = field.getCodedata();
            if (codedata != null && CD_TYPE_SERVICE_ANNOTATION.equals(codedata.getType())
                    && field.isEnabledWithValue()) {
                String rendered = qualifiedValue(field);
                if (!rendered.isEmpty()) {
                    String key = codedata.getModuleName() + COLON + codedata.getOriginalName();
                    AnnotationFields annotation = byAnnotation.computeIfAbsent(key,
                            k -> new AnnotationFields(codedata.getModuleName(), codedata.getOriginalName()));
                    if (codedata.getPath() == null || codedata.getPath().isBlank()) {
                        annotation.wholeValue = rendered;
                    } else {
                        annotation.fields.add(Map.entry(codedata.getPath(), rendered));
                    }
                }
            }
            if (isGroup(field)) {
                collectAnnotationFields(field.getProperties(), byAnnotation);
            }
        }
    }

    /** Accumulates the fields of one {@code @moduleName:originalName {...}} service annotation. */
    private static final class AnnotationFields {
        private final String moduleName;
        private final String originalName;
        private final List<Map.Entry<String, String>> fields = new ArrayList<>();
        // Set for a synthesized whole-record annotation field (no per-field `path`): its raw value IS
        // the attachment body.
        private String wholeValue;

        private AnnotationFields(String moduleName, String originalName) {
            this.moduleName = moduleName;
            this.originalName = originalName;
        }

        /** Renders the attachment, mapping a self-module qualifier onto the emitted import alias. */
        private String render(String selfPrefix, String emitAlias) {
            String module = moduleName == null || moduleName.isBlank() ? null : aliasOf(moduleName);
            String qualifier = module == null ? null : mapSelfModule(module, selfPrefix, emitAlias);
            String body = wholeValue != null ? wholeValue : renderFieldTree(buildFieldTree(fields));
            String prefix = qualifier == null || qualifier.isBlank()
                    ? "@" + originalName : "@" + qualifier + COLON + originalName;
            return prefix + " " + body;
        }
    }

    /**
     * Groups dot-separated {@code path}s (e.g. {@code info.name}) into a nested {field -> value |
     * nested-map} tree, so a record-typed sub-field emits as a nested mapping constructor rather than
     * an invalid literal dotted key.
     */
    private static LinkedHashMap<String, Object> buildFieldTree(List<Map.Entry<String, String>> fields) {
        LinkedHashMap<String, Object> root = new LinkedHashMap<>();
        for (Map.Entry<String, String> field : fields) {
            String[] segments = field.getKey().split("\\.");
            Map<String, Object> node = root;
            for (int i = 0; i < segments.length - 1; i++) {
                node = childMap(node, segments[i]);
            }
            node.put(segments[segments.length - 1], field.getValue());
        }
        return root;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> childMap(Map<String, Object> node, String key) {
        return (Map<String, Object>) node.computeIfAbsent(key, k -> new LinkedHashMap<String, Object>());
    }

    /** Renders a field tree built by {@link #buildFieldTree} as a mapping-constructor body. */
    @SuppressWarnings("unchecked")
    private static String renderFieldTree(Map<String, Object> node) {
        List<String> parts = new ArrayList<>();
        for (Map.Entry<String, Object> entry : node.entrySet()) {
            Object value = entry.getValue();
            String rendered = value instanceof Map ? renderFieldTree((Map<String, Object>) value) : (String) value;
            parts.add(entry.getKey() + ": " + rendered);
        }
        return "{" + String.join(", ", parts) + "}";
    }

    /**
     * Resolves {@code <module>:<ServiceType>}. Prefers a SERVICE_TYPE_DESCRIPTOR field in the init
     * form (ftp/github carry an already-qualified value); otherwise reads the selected/first
     * {@code serviceTypes[]} entry (kafka carries the descriptor on the type, not the init form).
     */
    private static String resolveServiceDescriptor(ServiceInitModel filledInitForm, TriggerUISchemaModel triggerModel,
                                                   String selfPrefix, String emitAlias) {
        String fromForm = findServiceType(filledInitForm.getProperties());
        if (fromForm != null && !fromForm.isEmpty()) {
            return qualify(fromForm, selfPrefix, emitAlias);
        }
        TriggerUISchemaModel.ServiceTypeModel serviceType = selectServiceType(filledInitForm, triggerModel);
        if (serviceType != null) {
            TriggerUISchemaModel.Codedata cd = serviceType.codedata();
            if (cd != null && cd.originalName() != null && !cd.originalName().isBlank()) {
                String module = cd.moduleName() != null && !cd.moduleName().isBlank()
                        ? aliasOf(cd.moduleName()) : selfPrefix;
                return mapSelfModule(module, selfPrefix, emitAlias) + COLON + cd.originalName();
            }
            if (serviceType.name() != null && !serviceType.name().isBlank()) {
                return qualify(serviceType.name(), selfPrefix, emitAlias);
            }
        }
        return emitAlias + COLON + TYPE_SERVICE;
    }

    /**
     * Qualifies a service type. An unqualified name is the connector's own type and takes the emitted
     * import alias; an already-qualified one keeps its declared module (normalized to that module's
     * import alias), since the type need not live in the connector's own module (e.g. CDC connectors
     * declare theirs in {@code ballerinax/cdc}).
     */
    private static String qualify(String typeName, String selfPrefix, String emitAlias) {
        if (!typeName.contains(COLON)) {
            return emitAlias + COLON + typeName;
        }
        String module = aliasOf(typeName.substring(0, typeName.indexOf(COLON)));
        return mapSelfModule(module, selfPrefix, emitAlias) + COLON + simpleName(typeName);
    }

    /** The prefix to emit for a module alias: the connector's own becomes its (possibly aliased) import prefix. */
    private static String mapSelfModule(String module, String selfPrefix, String emitAlias) {
        return selfPrefix.equals(module) ? emitAlias : module;
    }

    /** @see ModuleAliasResolver#selfPrefix(String) */
    private static String aliasOf(String moduleName) {
        return ModuleAliasResolver.selfPrefix(moduleName);
    }

    /** @see TriggerModelSynthesizer#simpleName(String) */
    private static String simpleName(String typeName) {
        return TriggerModelSynthesizer.simpleName(typeName);
    }

    /**
     * The alias the connector's module is referenced under: {@code TriggerUISchemaModel.importPrefix}, else the
     * generated default.
     */
    private static String modelAliasOrDefault(TriggerUISchemaModel triggerModel, String moduleName) {
        if (triggerModel != null && triggerModel.importPrefix() != null
                && !triggerModel.importPrefix().isBlank()) {
            return triggerModel.importPrefix();
        }
        return defaultEmitAlias(moduleName);
    }

    /** @see ModuleAliasResolver#selfPrefix(String) */
    private static String defaultEmitAlias(String moduleName) {
        return ModuleAliasResolver.selfPrefix(moduleName);
    }

    /**
     * The alias to emit for the connector's module in the context of an actual file — an existing
     * import's prefix, else the model/default alias disambiguated against the prefixes the file has
     * already claimed. See {@link ImportPrefixReader#resolve}.
     */
    private static String resolveEmitAlias(ModulePartNode rootNode, ServiceInitModel filledInitForm,
                                           TriggerUISchemaModel triggerModel) {
        String moduleName = filledInitForm.getModuleName();
        String override = triggerModel != null && triggerModel.importPrefix() != null
                && !triggerModel.importPrefix().isBlank() ? triggerModel.importPrefix() : null;
        return ImportPrefixReader.resolve(rootNode, filledInitForm.getOrgName(), moduleName, override);
    }

    /** @see ModuleAliasResolver#rewriteSelfPrefix(String, String, String) */
    private static String rewriteSelfPrefix(String typeText, String selfPrefix, String emitAlias) {
        return ModuleAliasResolver.rewriteSelfPrefix(typeText, selfPrefix, emitAlias);
    }

    /**
     * Rewrites, in place, every {@code valueQualifier} naming the connector's own module onto the prefix
     * it is emitted under. Recurses through nested properties and choice branches; a no-op when the
     * connector is not aliased.
     */
    private static void requalifyValueQualifiers(Map<String, Value> properties, String selfPrefix,
                                                 String emitAlias) {
        if (properties == null || selfPrefix == null || selfPrefix.equals(emitAlias)) {
            return;
        }
        for (Value field : properties.values()) {
            requalifyValueQualifier(field, selfPrefix, emitAlias);
        }
    }

    private static void requalifyValueQualifier(Value field, String selfPrefix, String emitAlias) {
        if (field == null) {
            return;
        }
        Codedata codedata = field.getCodedata();
        if (codedata != null && selfPrefix.equals(codedata.getValueQualifier())) {
            codedata.setValueQualifier(emitAlias);
        }
        requalifyValueQualifiers(field.getProperties(), selfPrefix, emitAlias);
        if (field.getChoices() != null) {
            for (Value choice : field.getChoices()) {
                requalifyValueQualifier(choice, selfPrefix, emitAlias);
            }
        }
    }

    /** Picks the service type matching the init-form selection; else the enabled one; else the first. */
    private static TriggerUISchemaModel.ServiceTypeModel selectServiceType(ServiceInitModel filledInitForm,
                                                                   TriggerUISchemaModel triggerModel) {
        if (triggerModel == null || triggerModel.serviceTypes() == null
                || triggerModel.serviceTypes().isEmpty()) {
            return null;
        }
        String selected = findServiceType(filledInitForm.getProperties());
        if (selected != null && !selected.isEmpty()) {
            for (TriggerUISchemaModel.ServiceTypeModel st : triggerModel.serviceTypes()) {
                if (selected.equals(st.name())) {
                    return st;
                }
            }
        }
        for (TriggerUISchemaModel.ServiceTypeModel st : triggerModel.serviceTypes()) {
            if (Boolean.TRUE.equals(st.enabled())) {
                return st;
            }
        }
        return triggerModel.serviceTypes().getFirst();
    }

    /** Emits the present (enabled, non-optional) handlers of the selected service type. */
    private static List<String> buildRequiredFunctionSources(ServiceInitModel filledInitForm,
                                                             TriggerUISchemaModel triggerModel, String selfPrefix,
                                                             String emitAlias) {
        List<String> functions = new ArrayList<>();
        TriggerUISchemaModel.ServiceTypeModel serviceType = selectServiceType(filledInitForm, triggerModel);
        if (serviceType == null || serviceType.functions() == null) {
            return functions;
        }
        for (TriggerUISchemaModel.FunctionModel function : serviceType.functions()) {
            if (function.enabled() && !Boolean.TRUE.equals(function.optional())) {
                functions.add(TAB + buildFunctionSource(function, selfPrefix, emitAlias)
                        .replace(NEW_LINE, NEW_LINE_WITH_TAB));
            }
        }
        return functions;
    }

    /** Renders one handler, leaving module-qualified types exactly as the model authored them. */
    static String buildFunctionSource(TriggerUISchemaModel.FunctionModel function) {
        return buildFunctionSource(function, "", "");
    }

    /**
     * Renders one handler from the unified {@code FunctionModel} (params carry type/name as Property),
     * re-qualifying self-module references in parameter and return types onto {@code emitAlias}.
     */
    private static String buildFunctionSource(TriggerUISchemaModel.FunctionModel function, String selfPrefix,
                                              String emitAlias) {
        StringBuilder builder = new StringBuilder();
        for (String annotation : AnnotationEmitter.annotationsOf(function.properties())) {
            builder.append(annotation).append(NEW_LINE);
        }
        builder.append(qualifiers(function)).append("function").append(SPACE);
        if (RESOURCE.equals(qualifierKeyword(function.kind())) && function.accessor() != null
                && !function.accessor().isBlank()) {
            builder.append(function.accessor()).append(SPACE);
        }
        builder.append(effectiveFunctionName(function)).append("(")
                .append(buildParameterList(function, selfPrefix, emitAlias)).append(")");
        String returnClause = buildReturnType(function.returnType(), selfPrefix, emitAlias);
        if (!returnClause.isEmpty()) {
            builder.append(SPACE).append(returnClause);
        }
        builder.append(SPACE).append(OPEN_BRACE).append(NEW_LINE).append(CLOSE_BRACE);
        return builder.toString();
    }

    /** The emitted function name: a format-variant handler fans out to the selected variant's name. */
    private static String effectiveFunctionName(TriggerUISchemaModel.FunctionModel function) {
        if (function.parameters() != null) {
            for (TriggerUISchemaModel.Parameter parameter : function.parameters()) {
                String variantName = selectedVariantOriginalName(parameter.type());
                if (variantName != null && !variantName.isBlank()) {
                    return variantName;
                }
            }
        }
        return function.name();
    }

    private static String selectedVariantOriginalName(TriggerUISchemaModel.Property typeProp) {
        if (typeProp == null || !FIELD_TYPE_VARIATION_SELECTOR.equals(PayloadComposer.selectedFieldType(typeProp))) {
            return null;
        }
        Map<String, TriggerUISchemaModel.Property> variants = typeProp.properties();
        if (variants == null || variants.isEmpty()) {
            return null;
        }
        TriggerUISchemaModel.Property selected = null;
        Object value = typeProp.value();
        if (value != null && variants.containsKey(String.valueOf(value))) {
            selected = variants.get(String.valueOf(value));
        }
        if (selected == null) {
            for (TriggerUISchemaModel.Property variant : variants.values()) {
                if (variant.enabled()) {
                    selected = variant;
                    break;
                }
            }
        }
        return selected == null || selected.codedata() == null ? null : selected.codedata().originalName();
    }

    private static String qualifiers(TriggerUISchemaModel.FunctionModel function) {
        if (function.qualifiers() != null && !function.qualifiers().isEmpty()) {
            return String.join(SPACE, function.qualifiers()) + SPACE;
        }
        String keyword = qualifierKeyword(function.kind());
        return keyword.isEmpty() ? "" : keyword + SPACE;
    }

    private static String qualifierKeyword(String kind) {
        String normalized = kind == null ? "" : kind.toUpperCase(Locale.US);
        return switch (normalized) {
            case KIND_REMOTE, KIND_COMPLEX_REMOTE_FUNCTION -> REMOTE;
            case KIND_RESOURCE, KIND_QUERY, KIND_MUTATION, KIND_SUBSCRIPTION -> RESOURCE;
            default -> "";
        };
    }

    private static String buildParameterList(TriggerUISchemaModel.FunctionModel function, String selfPrefix,
                                             String emitAlias) {
        if (function.parameters() == null) {
            return "";
        }
        List<String> params = new ArrayList<>();
        for (TriggerUISchemaModel.Parameter parameter : function.parameters()) {
            if (FIELD_TYPE_FLAG.equals(PayloadComposer.selectedFieldType(parameter.type()))) {
                if (!isFlagOn(parameter)) {
                    continue;
                }
            } else if (Boolean.TRUE.equals(parameter.optional())) {
                continue;
            }
            String type = rewriteSelfPrefix(PayloadComposer.effectiveType(parameter.type()), selfPrefix, emitAlias);
            String name = paramName(parameter);
            if (!type.isEmpty() && !name.isEmpty()) {
                params.add(type + SPACE + name);
            }
        }
        return String.join(", ", params);
    }

    private static boolean isFlagOn(TriggerUISchemaModel.Parameter parameter) {
        Object value = parameter.type() == null ? null : parameter.type().value();
        return Boolean.TRUE.equals(value) || "true".equalsIgnoreCase(String.valueOf(value));
    }

    private static String paramName(TriggerUISchemaModel.Parameter parameter) {
        TriggerUISchemaModel.Property nameProp = parameter.name();
        if (nameProp == null || nameProp.value() == null) {
            return "";
        }
        return String.valueOf(nameProp.value());
    }

    private static String buildReturnType(TriggerUISchemaModel.ReturnType returnType, String selfPrefix,
                                           String emitAlias) {
        if (returnType == null || !returnType.enabled() || returnType.type() == null
                || returnType.type().isBlank()) {
            return "";
        }
        String type = rewriteSelfPrefix(returnType.type(), selfPrefix, emitAlias);
        if (Boolean.TRUE.equals(returnType.hasError()) && !type.contains(ERROR)) {
            type = type + "|" + ERROR;
        }
        if (Boolean.TRUE.equals(returnType.optional()) && !type.endsWith("?")) {
            type = type + "?";
        }
        return "returns" + SPACE + type;
    }

    private static String renderListenerDeclaration(String emitAlias, ListenerArgs args) {
        String listenerType;
        if (args.listenerType != null && !args.listenerType.isBlank()) {
            // The hint's type name is not always "Listener" (e.g. CdcListener); only its simple name is
            // kept so the emitted prefix is the import alias, not a full dotted module path.
            listenerType = emitAlias + COLON + simpleName(args.listenerType);
        } else {
            listenerType = emitAlias + COLON + LISTENER_TYPE;
        }
        return String.format("%s %s %s = %s (%s);", LISTENER, listenerType, args.varName, NEW, args.render());
    }

    private static ListenerArgs collectListenerArgs(ServiceInitModel creationModel) {
        ListenerArgs args = new ListenerArgs();
        collect(creationModel.getProperties(), args);
        return args;
    }

    private static void collect(Map<String, Value> properties, ListenerArgs args) {
        if (properties == null) {
            return;
        }
        for (Map.Entry<String, Value> entry : properties.entrySet()) {
            Value field = entry.getValue();
            if (isChoice(field)) {
                Value branch = enabledOrFirstChoice(field.getChoices());
                if (branch != null && isEnumValueChoice(branch)) {
                    // A literal enum value branch: render from the branch but place it at the parent
                    // CHOICE's arg slot, since the parent's own `value` is not reliably echoed back.
                    String rendered = qualifiedValue(branch);
                    if (!rendered.isEmpty()) {
                        placeArg(field.getCodedata(), entry.getKey(), rendered, args);
                    }
                }
                if (branch != null) {
                    Codedata branchCodedata = branch.getCodedata();
                    if (branchCodedata != null && branchCodedata.getCastType() != null
                            && branchCodedata.getPosition() != null) {
                        args.addCast(branchCodedata.getPosition(), branchCodedata.getCastType());
                    }
                    collect(branch.getProperties(), args);
                }
                continue;
            }
            if (isExistingListener(entry.getKey(), field)) {
                // "Use existing" branch: attach to the selected listener(s), no new declaration.
                String existing = existingListenerAttach(field);
                if (!existing.isEmpty()) {
                    args.varName = existing;
                }
                continue;
            }
            Codedata codedata = field.getCodedata();
            if (isVarName(codedata)) {
                // Presence of this field is itself the "create new listener" signal, so a declaration
                // must always be emitted (`new ()`) even when every listener param was left blank.
                args.declareListener = true;
                String varName = value(field);
                if (!varName.isEmpty()) {
                    args.varName = varName;
                }
                String listenerType = listenerTypeOf(field);
                if (listenerType != null) {
                    args.listenerType = listenerType;
                }
                continue;
            }
            if (isCdcOperationFlag(codedata)) {
                collectCdcOperationFlag(field, codedata, args);
                continue;
            }
            if (isGroup(field)) {
                collectGroup(entry.getKey(), field, args);
                continue;
            }
            placeLeaf(entry.getKey(), field, codedata, args);
        }
    }

    private static boolean isCdcOperationFlag(Codedata codedata) {
        return codedata != null && ARG_TYPE_CDC_OPERATION_ENABLE.equals(codedata.getArgType());
    }

    /**
     * A CDC operation checkbox toggles membership of a record-field list rather than emitting its own
     * arg: deselecting it (value {@code false}) adds its op-code to the target list (the flag's dotted
     * {@code path}, defaulting to {@code options.skippedOperations}), folded in at render time
     * ({@link ListenerArgs#render()}).
     */
    private static void collectCdcOperationFlag(Value field, Codedata codedata, ListenerArgs args) {
        boolean enabled = !"false".equalsIgnoreCase(value(field));
        if (enabled) {
            return;
        }
        String code = codedata.getOriginalName();
        if (code == null || code.isBlank()) {
            return;
        }
        List<String> segments = dottedPathSegments(codedata);
        String recordField = segments.size() >= 2 ? segments.get(0) : CDC_OPTIONS_FIELD;
        String listField = segments.size() >= 2 ? segments.get(1) : CDC_SKIPPED_OPERATIONS_FIELD;
        args.addSkippedOperation(recordField, listField, "\"" + code + "\"");
    }

    /**
     * A GROUP_SECTION may be a plain UI-only container, or occupy a positional slot itself (a
     * record-typed listener param's fields flattened into it). When it has a slot, its
     * {@code CONFIG_FIELD} children form one record argument; otherwise each child keeps its own
     * position, with position-less fields falling back to a trailing loose record.
     */
    private static void collectGroup(String key, Value group, ListenerArgs args) {
        Codedata groupCodedata = group.getCodedata();
        boolean groupHasSlot = groupCodedata != null
                && ARG_TYPE_LISTENER_PARAM_REQUIRED.equals(groupCodedata.getArgType());
        Map<String, Object> recordFields = new LinkedHashMap<>();
        Map<String, Value> rest = new LinkedHashMap<>();
        if (group.getProperties() != null) {
            for (Map.Entry<String, Value> child : group.getProperties().entrySet()) {
                Codedata childCodedata = child.getValue().getCodedata();
                if (childCodedata != null
                        && ARG_TYPE_LISTENER_PARAM_CONFIG_FIELD.equals(childCodedata.getArgType())) {
                    String rendered = qualifiedValue(child.getValue());
                    if (rendered.isEmpty()) {
                        continue;
                    }
                    List<String> segments = fieldNameSegments(childCodedata, child.getKey());
                    if (groupHasSlot) {
                        ListenerArgs.insertNested(recordFields, segments, rendered);
                    } else {
                        args.addConfigField(childCodedata.getPosition(), segments, rendered);
                    }
                } else {
                    rest.put(child.getKey(), child.getValue());
                }
            }
        }
        if (groupHasSlot && !recordFields.isEmpty()) {
            args.addPositional(groupCodedata.getPosition(), ListenerArgs.renderIncludedValue(recordFields));
        }
        collect(rest, args);
    }

    private static void placeLeaf(String key, Value field, Codedata codedata, ListenerArgs args) {
        if (codedata == null) {
            return;
        }
        String rendered = qualifiedValue(field);
        if (rendered.isEmpty()) {
            return;
        }
        String argType = codedata.getArgType();
        if (ARG_TYPE_LISTENER_PARAM_CONFIG_FIELD.equals(argType)) {
            args.addConfigField(codedata.getPosition(), fieldNameSegments(codedata, key), rendered);
            return;
        }
        placeArg(codedata, key, rendered, args);
    }

    /** Places a rendered value (leaf or group record) as positional / included per its argType. */
    private static void placeArg(Codedata codedata, String key, String rendered, ListenerArgs args) {
        String argType = codedata == null ? null : codedata.getArgType();
        if (ARG_TYPE_LISTENER_PARAM_REQUIRED.equals(argType)) {
            args.addPositional(codedata.getPosition(), rendered);
        } else if (ARG_TYPE_LISTENER_PARAM_INCLUDED_FIELD.equals(argType)
                || ARG_TYPE_LISTENER_PARAM_INCLUDED_DEFAULTABLE_FIELD.equals(argType)) {
            List<String> pathSegments = dottedPathSegments(codedata);
            if (pathSegments.size() > 1) {
                // Path crosses into a nested record field: nest into a record literal at the
                // top-level segment instead of a bogus flat named arg.
                args.addIncludedPath(pathSegments, rendered);
            } else {
                args.addIncludedArg(argName(codedata, key), rendered);
            }
        } else if (ARG_TYPE_LISTENER_PARAM_CONFIG_FIELD.equals(argType)) {
            args.addConfigField(codedata.getPosition(), fieldNameSegments(codedata, key), rendered);
        }
    }

    private static List<String> dottedPathSegments(Codedata codedata) {
        if (codedata == null || codedata.getPath() == null || codedata.getPath().isBlank()) {
            return List.of();
        }
        return List.of(codedata.getPath().split("\\."));
    }

    private static String findServiceType(Map<String, Value> properties) {
        if (properties == null) {
            return null;
        }
        for (Value field : properties.values()) {
            if (isChoice(field)) {
                Value branch = enabledOrFirstChoice(field.getChoices());
                String nested = branch == null ? null : findServiceType(branch.getProperties());
                if (nested != null) {
                    return nested;
                }
                continue;
            }
            Codedata codedata = field.getCodedata();
            // v1 tags the descriptor field with argType; the unified model uses codedata.type.
            if (codedata != null && field.isEnabledWithValue()
                    && (ARG_TYPE_SERVICE_TYPE_DESCRIPTOR.equals(codedata.getArgType())
                        || ARG_TYPE_SERVICE_TYPE_DESCRIPTOR.equals(codedata.getType()))) {
                return value(field);
            }
            if (isGroup(field)) {
                String nested = findServiceType(field.getProperties());
                if (nested != null) {
                    return nested;
                }
            }
        }
        return null;
    }

    /**
     * The service base path — the value of a {@code SERVICE_BASE_PATH} or {@code STRING_LITERAL} field
     * anywhere in the filled init form, emitted between the service descriptor and {@code on}. Empty
     * when the model ships no base-path field.
     */
    private static String resolveBasePath(ServiceInitModel filledInitForm) {
        return findBasePath(filledInitForm.getProperties());
    }

    private static String findBasePath(Map<String, Value> properties) {
        if (properties == null) {
            return "";
        }
        for (Value field : properties.values()) {
            if (isChoice(field)) {
                Value branch = enabledOrFirstChoice(field.getChoices());
                String nested = branch == null ? "" : findBasePath(branch.getProperties());
                if (!nested.isEmpty()) {
                    return nested;
                }
                continue;
            }
            Codedata codedata = field.getCodedata();
            if (codedata != null && field.isEnabledWithValue()
                    && (ARG_TYPE_SERVICE_BASE_PATH.equals(codedata.getType())
                        || ARG_TYPE_SERVICE_BASE_PATH.equals(codedata.getArgType())
                        || CD_TYPE_STRING_LITERAL.equals(codedata.getType())
                        || CD_TYPE_STRING_LITERAL.equals(codedata.getArgType()))) {
                return value(field);
            }
            if (isGroup(field)) {
                String nested = findBasePath(field.getProperties());
                if (!nested.isEmpty()) {
                    return nested;
                }
            }
        }
        return "";
    }

    private static boolean isVarName(Codedata codedata) {
        if (codedata == null) {
            return false;
        }
        return CD_TYPE_LISTENER_VAR_NAME.equals(codedata.getType())
                || ARG_TYPE_LISTENER_VAR_NAME.equals(codedata.getArgType());
    }

    /**
     * The listener's actual Ballerina type (e.g. {@code mssql:CdcListener}), read off the field's
     * {@code ballerinaType}. Falls back to {@code null} (caller defaults to {@code <protocol>:Listener})
     * for manifests authored before this hint existed.
     */
    private static String listenerTypeOf(Value field) {
        if (field.getTypes() == null) {
            return null;
        }
        for (PropertyType type : field.getTypes()) {
            if (type.ballerinaType() != null && !type.ballerinaType().isBlank()) {
                return type.ballerinaType();
            }
        }
        return null;
    }

    private static boolean isEnumValueChoice(Value branch) {
        Codedata branchCodedata = branch.getCodedata();
        return branchCodedata != null && CD_TYPE_ENUM_VALUE.equals(branchCodedata.getType());
    }

    private static Value enabledOrFirstChoice(List<Value> choices) {
        if (choices == null || choices.isEmpty()) {
            return null;
        }
        return choices.stream().filter(Value::isEnabled).findFirst().orElse(choices.getFirst());
    }

    /** The record-field name split into its dotted segments, so a nested-record {@code path} nests correctly. */
    private static List<String> fieldNameSegments(Codedata codedata, String key) {
        return List.of(fieldName(codedata, key).split("\\."));
    }

    private static String qualifiedValue(Value field) {
        String rendered = value(field);
        if (rendered.isEmpty()) {
            return "";
        }
        Codedata codedata = field.getCodedata();
        if (codedata != null && codedata.getValueQualifier() != null && !codedata.getValueQualifier().isBlank()) {
            return codedata.getValueQualifier() + COLON + rendered;
        }
        return rendered;
    }

    private static String value(Value field) {
        if (field == null) {
            return "";
        }
        String rendered = field.getValue();
        if (rendered != null && !rendered.isEmpty()) {
            return rendered;
        }
        // Multi-valued fields (TEXT_SET / EXPRESSION_SET / MULTIPLE_SELECT) carry entries in `values`.
        List<String> values = field.getValues();
        if (values != null && !values.isEmpty()) {
            return "[" + String.join(", ", values) + "]";
        }
        return "";
    }

    /**
     * The "use existing" selector — by property map key ({@link ServiceInitModel#KEY_EXISTING_LISTENER},
     * {@code "existingListener"}) or by {@code codedata.type} ({@code Constants.CD_TYPE_EXISTING_LISTENER},
     * {@code "KEY_EXISTING_LISTENER"} -- an unrelated value that is coincidentally similar text).
     */
    private static boolean isExistingListener(String key, Value field) {
        if (KEY_EXISTING_LISTENER.equals(key)) {
            return true;
        }
        Codedata codedata = field == null ? null : field.getCodedata();
        return codedata != null && CD_TYPE_EXISTING_LISTENER.equals(codedata.getType());
    }

    /** The listener name(s) to attach to; a {@code MULTIPLE_SELECT_LISTENER} yields several, joined. */
    private static String existingListenerAttach(Value field) {
        if (field == null) {
            return "";
        }
        List<String> values = field.getValues();
        if (values != null && !values.isEmpty()) {
            return String.join(", ", values);
        }
        return value(field);
    }

    /** Accumulates listener arguments: positional (by position, then unordered), included, loose config. */
    static final class ListenerArgs {
        private final TreeMap<Integer, String> byPosition = new TreeMap<>();
        private final TreeMap<Integer, Map<String, Object>> configFieldsByPosition = new TreeMap<>();
        private final Map<Integer, String> castByPosition = new LinkedHashMap<>();
        private final List<String> noPosition = new ArrayList<>();
        private final List<IncludedArg> included = new ArrayList<>();
        private final Map<String, Object> looseConfig = new LinkedHashMap<>();
        private final Map<String, Object> includedTree = new LinkedHashMap<>();
        // Aggregated CDC-style skip lists: record-field arg -> list field name -> collected op-codes.
        private final Map<String, LinkedHashMap<String, List<String>>> skipLists = new LinkedHashMap<>();
        private String varName = "";
        private String listenerType;
        // Set only when the walk enters the "create new listener" branch (its LISTENER_VAR_NAME field
        // is unique to that form). Must key off this, not "were any args collected" — a connector whose
        // listener config is entirely optional and blank still needs `new ()` emitted.
        private boolean declareListener;

        /**
         * One {@code <name> = <valueText>} constructor argument, kept apart until render time so
         * {@link #mergeSkipLists} can fold a skip list into {@code valueText} by exact name instead of
         * string-prefix matching over an already-joined {@code "name = value"} string.
         *
         * @param name      the argument's name
         * @param valueText the argument's rendered value -- a scalar, or (for a CDC operations-style
         *                  record) a user-authored record-literal string that {@link #insertListField}
         *                  parses to fold a skip list into
         */
        private record IncludedArg(String name, String valueText) {
            String render() {
                return name + " = " + valueText;
            }
        }

        void addSkippedOperation(String recordField, String listField, String code) {
            skipLists.computeIfAbsent(recordField, ignored -> new LinkedHashMap<>())
                    .computeIfAbsent(listField, ignored -> new ArrayList<>())
                    .add(code);
        }

        // Package-private (not private): exercised directly by ListenerArgsTest's skip-list merge
        // regression suite.
        void addIncludedArg(String name, String valueText) {
            included.add(new IncludedArg(name, valueText));
        }

        private void addPositional(Integer position, String rendered) {
            if (position != null) {
                byPosition.put(position, rendered);
            } else {
                noPosition.add(rendered);
            }
        }

        /** Records a cast to apply to whatever value ends up at this positional slot (see field doc). */
        private void addCast(Integer position, String castType) {
            if (position != null && castType != null && !castType.isBlank()) {
                castByPosition.put(position, castType);
            }
        }

        /**
         * Adds a flat {@code LISTENER_PARAM_CONFIG_FIELD} (no enclosing GROUP_SECTION). Fields sharing
         * the same {@code position} are merged into one record literal at that slot; a field with no
         * position falls back to a trailing loose record. A dotted {@code path} nests into a record
         * literal at its top-level segment.
         */
        private void addConfigField(Integer position, List<String> pathSegments, String rendered) {
            if (position != null) {
                insertNested(configFieldsByPosition.computeIfAbsent(position, ignored -> new LinkedHashMap<>()),
                        pathSegments, rendered);
            } else {
                insertNested(looseConfig, pathSegments, rendered);
            }
        }

        /** Merges a rendered value into the nested-record tree at a dotted path. */
        private void addIncludedPath(List<String> segments, String renderedValue) {
            insertNested(includedTree, segments, renderedValue);
        }

        /** Merges a rendered value into a nested-record tree at a dotted path (shared by both callers above). */
        @SuppressWarnings("unchecked")
        private static void insertNested(Map<String, Object> tree, List<String> segments, String renderedValue) {
            Map<String, Object> node = tree;
            for (int i = 0; i < segments.size() - 1; i++) {
                node = (Map<String, Object>) node.computeIfAbsent(segments.get(i), ignored -> new LinkedHashMap<>());
            }
            node.put(segments.getLast(), renderedValue);
        }

        @SuppressWarnings("unchecked")
        private static String renderIncludedValue(Object value) {
            if (value instanceof String rendered) {
                return rendered;
            }
            Map<String, Object> nested = (Map<String, Object>) value;
            List<String> fields = new ArrayList<>();
            for (Map.Entry<String, Object> entry : nested.entrySet()) {
                fields.add(entry.getKey() + ": " + renderIncludedValue(entry.getValue()));
            }
            return "{" + String.join(", ", fields) + "}";
        }

        String render() {
            TreeMap<Integer, String> positional = new TreeMap<>(byPosition);
            for (Map.Entry<Integer, Map<String, Object>> entry : configFieldsByPosition.entrySet()) {
                positional.put(entry.getKey(), renderIncludedValue(entry.getValue()));
            }
            for (Map.Entry<Integer, String> cast : castByPosition.entrySet()) {
                positional.computeIfPresent(cast.getKey(), (position, rendered) -> "<" + cast.getValue() + ">"
                        + rendered);
            }
            List<String> args = new ArrayList<>(positional.values());
            args.addAll(noPosition);
            if (!looseConfig.isEmpty()) {
                args.add(renderIncludedValue(looseConfig));
            }
            // Order: user-provided included args first, then dotted-path record args, then
            // freshly-created skip-list args last (mirrors the hand-written CDC builder's ordering).
            List<IncludedArg> newSkipArgs = new ArrayList<>();
            for (IncludedArg arg : mergeSkipLists(newSkipArgs)) {
                args.add(arg.render());
            }
            for (Map.Entry<String, Object> entry : includedTree.entrySet()) {
                args.add(entry.getKey() + " = " + renderIncludedValue(entry.getValue()));
            }
            for (IncludedArg arg : newSkipArgs) {
                args.add(arg.render());
            }
            return String.join(", ", args);
        }

        /**
         * Folds each aggregated skip list into the matching included record argument, in place if
         * already present, else into a fresh {@code <record> = {...}} argument collected into
         * {@code newSkipArgs} for the caller to append last. Matches by exact argument name -- no
         * string-prefix scanning, since {@link IncludedArg} keeps the name apart from its value text.
         */
        private List<IncludedArg> mergeSkipLists(List<IncludedArg> newSkipArgs) {
            List<IncludedArg> result = new ArrayList<>(included);
            for (Map.Entry<String, LinkedHashMap<String, List<String>>> entry : skipLists.entrySet()) {
                String recordField = entry.getKey();
                for (Map.Entry<String, List<String>> listEntry : entry.getValue().entrySet()) {
                    List<String> codes = listEntry.getValue();
                    if (codes.isEmpty()) {
                        continue;
                    }
                    String listField = listEntry.getKey();
                    String listAssignment = listField + ": [" + String.join(", ", codes) + "]";
                    int index = indexOfIncludedArg(result, recordField);
                    if (index >= 0) {
                        String patched = insertListField(result.get(index).valueText(), listField, listAssignment);
                        result.set(index, new IncludedArg(recordField, patched));
                        continue;
                    }
                    int freshIndex = indexOfIncludedArg(newSkipArgs, recordField);
                    if (freshIndex < 0) {
                        newSkipArgs.add(new IncludedArg(recordField, "{" + listAssignment + "}"));
                    } else {
                        String patched = insertListField(newSkipArgs.get(freshIndex).valueText(), listField,
                                listAssignment);
                        newSkipArgs.set(freshIndex, new IncludedArg(recordField, patched));
                    }
                }
            }
            return result;
        }

        /** Index of the entry named {@code recordField}, or -1. */
        private static int indexOfIncludedArg(List<IncludedArg> args, String recordField) {
            for (int i = 0; i < args.size(); i++) {
                if (recordField.equals(args.get(i).name())) {
                    return i;
                }
            }
            return -1;
        }

        /**
         * Inserts (or replaces) a {@code <listField>: [...]} field inside an existing {@code {...}}
         * record-literal value text. Falls back to leaving it untouched when it is not a record literal
         * -- an opaque, user-authored scalar, which a skip list cannot be folded into.
         */
        static String insertListField(String valueText, String listField, String listAssignment) {
            int brace = valueText.indexOf('{');
            if (brace < 0 || !valueText.trim().endsWith("}")) {
                return valueText;
            }
            int close = valueText.lastIndexOf('}');
            String inner = valueText.substring(brace + 1, close).trim();
            List<String> fields = new ArrayList<>(splitTopLevelFields(inner));
            int existingIndex = -1;
            for (int i = 0; i < fields.size(); i++) {
                if (listField.equals(topLevelFieldName(fields.get(i)))) {
                    existingIndex = i;
                    break;
                }
            }
            if (existingIndex >= 0) {
                fields.set(existingIndex, listAssignment);
            } else {
                fields.add(listAssignment);
            }
            return valueText.substring(0, brace + 1) + String.join(", ", fields) + "}";
        }

        /**
         * Splits a record literal's inner content into its top-level {@code field: value} entries.
         * Tracks brace/bracket/paren depth and quoted-string state so a comma inside a nested value
         * never splits early.
         */
        static List<String> splitTopLevelFields(String inner) {
            List<String> fields = new ArrayList<>();
            if (inner.isEmpty()) {
                return fields;
            }
            int depth = 0;
            boolean inString = false;
            int start = 0;
            for (int i = 0; i < inner.length(); i++) {
                char c = inner.charAt(i);
                if (inString) {
                    if (c == '\\') {
                        i++; // skip the escaped character (e.g. \")
                    } else if (c == '"') {
                        inString = false;
                    }
                    continue;
                }
                switch (c) {
                    case '"' -> inString = true;
                    case '{', '[', '(' -> depth++;
                    case '}', ']', ')' -> depth--;
                    case ',' -> {
                        if (depth == 0) {
                            fields.add(inner.substring(start, i).trim());
                            start = i + 1;
                        }
                    }
                    default -> { }
                }
            }
            fields.add(inner.substring(start).trim());
            return fields;
        }

        /** The field name of a top-level {@code name: value} record entry, or null if malformed. */
        private static String topLevelFieldName(String field) {
            int colon = field.indexOf(':');
            return colon < 0 ? null : field.substring(0, colon).trim();
        }
    }
}
