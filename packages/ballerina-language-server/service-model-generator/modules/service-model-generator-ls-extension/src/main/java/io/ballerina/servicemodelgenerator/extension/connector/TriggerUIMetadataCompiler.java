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
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.reflect.TypeToken;
import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.modelgenerator.commons.ModuleInfo;
import io.ballerina.modelgenerator.commons.trigger.models.TriggerLibraryFacts;
import io.ballerina.modelgenerator.commons.trigger.models.TriggerMetadataModel;
import io.ballerina.modelgenerator.commons.trigger.models.TriggerUIMetadataModel;
import io.ballerina.modelgenerator.commons.trigger.models.TriggerUISchemaModel;
import io.ballerina.servicemodelgenerator.extension.model.PropertyType;
import io.ballerina.servicemodelgenerator.extension.model.Value;
import io.ballerina.servicemodelgenerator.extension.util.ModuleAliasResolver;

import java.lang.reflect.Type;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static io.ballerina.servicemodelgenerator.extension.util.Constants.CD_TYPE_PAYLOAD_TYPE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.CD_TYPE_PAYLOAD_TYPE_INCLUDED_RECORD;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.DATA_BINDING;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.PROP_KEY_IDENTIFIER;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.PROP_KEY_LISTENER;

/** Applies sparse L2 UI metadata over a runtime model derived from L1 and semantic facts. */
final class TriggerUIMetadataCompiler {

    private static final Gson GSON = new Gson();
    private static final List<String> METADATA_FIELDS = List.of("label", "description", "notice", "subLabel",
            "addLabel", "addDescription", "groupName", "badge", "deprecated");
    private static final Set<String> TRIGGER_KINDS = Set.of("event", "mcp", "graphql", "http", "file", "ai");

    private TriggerUIMetadataCompiler() {
    }

    static TriggerUISchemaModel apply(TriggerUISchemaModel derived, TriggerMetadataModel l1,
                                      TriggerLibraryFacts facts,
                                      Map<String, TriggerLibraryFacts> crossModuleFacts,
                                      SemanticModel semanticModel, TriggerUIMetadataModel l2) {
        if (derived == null || l2 == null) {
            return derived;
        }
        JsonObject root = GSON.toJsonTree(derived).getAsJsonObject();
        applyTrigger(root, l2);
        Index index = new Index(l1, root);
        JsonObject listenerForm = applyListeners(root, l1, facts, semanticModel, l2, index);
        refreshListenerChoice(root, l1);
        if (listenerForm != null) {
            applyExistingListenerMetadata(root, listenerForm);
        }
        flattenListenerWhenUnauthored(root, l1, l2);
        applyInitForm(root, l1, facts, crossModuleFacts, semanticModel, l2, index);
        promoteListenerServiceProperties(root, l1);
        finalizeListenerOwnership(root, l1, l2);
        applyServiceTypes(root, l2, index);
        applyImportPrefix(root, l2);
        return GSON.fromJson(root, TriggerUISchemaModel.class);
    }

    private static final Type LISTENER_MODEL_LIST_TYPE =
            new TypeToken<List<TriggerUISchemaModel.ListenerModel>>() { }.getType();

    /**
     * {@code initProperties.listener} was built at synthesis time from the pre-L2 listener list; by now
     * {@link #applyListeners} has overlaid each listener's own {@code formFields}/{@code form} onto
     * {@code root.listeners}/{@code root.listenerForm}, so the choice must be re-derived from those,
     * not left stale. Mirrors {@link TriggerModelSynthesizer}'s own reusability rule: a listener
     * survives {@link #finalizeListenerOwnership}'s later fold exactly when it is directly usable.
     */
    private static void refreshListenerChoice(JsonObject root, TriggerMetadataModel l1) {
        if (!root.has("listeners") || !root.get("listeners").isJsonArray()
                || root.getAsJsonArray("listeners").isEmpty()) {
            return;
        }
        List<TriggerUISchemaModel.ListenerModel> listeners =
                GSON.fromJson(root.get("listeners"), LISTENER_MODEL_LIST_TYPE);
        TriggerUISchemaModel.ListenerFormModel form = root.has("listenerForm")
                ? GSON.fromJson(root.get("listenerForm"), TriggerUISchemaModel.ListenerFormModel.class) : null;
        // Several declared listener *types* is a different UI concern (which kind to create) and
        // carries no reuse signal of its own -- see TriggerModelSynthesizer's matching computation.
        boolean reusable = l1.listeners() != null && l1.listeners().size() == 1
                && l1.listeners().getFirst().multipleServicesAllowed();
        ListenerChoiceDeriver.derive(listeners, null, reusable, form).ifPresent(listener -> {
            JsonObject initProperties = root.has("initProperties")
                    ? root.getAsJsonObject("initProperties") : new JsonObject();
            initProperties.add(PROP_KEY_LISTENER, GSON.toJsonTree(listener));
            root.add("initProperties", initProperties);
        });
    }

    /**
     * A listener that cannot host multiple services cannot be reused. Its constructor fields therefore
     * remain direct init fields; reusable listeners stay under {@code listeners} and are choice-derived.
     */
    private static void finalizeListenerOwnership(JsonObject root, TriggerMetadataModel l1,
                                                  TriggerUIMetadataModel l2) {
        if (l1.listeners() == null || l1.listeners().size() != 1
                || l1.listeners().getFirst().multipleServicesAllowed()) {
            return;
        }
        flattenSingleListener(root);
    }

    /**
     * When L2 authors an {@code initForm} but no {@code listeners} overlay, it has chosen to describe the
     * connector as a flat form rather than decorate a create-new/use-existing choice -- that choice exists
     * only to let L2 customize a listener's own construction, so with no L2 listener content and an
     * initForm doing the describing instead, presenting the bare, undecorated choice would just be
     * redundant with (and inconsistent with) what the initForm already says. Fold the one declared
     * listener's own fields (derived at synthesis time purely from L1 + semantic facts, so they already
     * carry correct types/codedata with no L2 input) directly into {@code initProperties}, before
     * {@link #applyInitForm} runs, so an initForm field targeting one of them (e.g. {@code path}) finds it
     * as a real template instead of falling back to a type-less default. Runs regardless of
     * {@code multipleServicesAllowed} -- unlike {@link #finalizeListenerOwnership}, this is not about
     * whether the listener can be reused, only about whether L2 chose to offer that choice at all. Gated on
     * an authored initForm specifically (not just an absent {@code listeners}) so a true skeleton L2 --
     * neither section authored -- keeps falling back to the untouched derived baseline, per
     * {@link #applyInitForm}'s own null-initForm branch.
     */
    private static void flattenListenerWhenUnauthored(JsonObject root, TriggerMetadataModel l1,
                                                       TriggerUIMetadataModel l2) {
        if (l2.listeners() != null || l2.initForm() == null || l2.initForm().fields() == null
                || l2.initForm().fields().isEmpty() || l1.listeners() == null || l1.listeners().size() != 1) {
            return;
        }
        flattenSingleListener(root);
    }

    private static void flattenSingleListener(JsonObject root) {
        if (!root.has("listeners") || !root.get("listeners").isJsonArray()
                || root.getAsJsonArray("listeners").isEmpty()) {
            return;
        }
        JsonObject direct = new JsonObject();
        JsonObject listener = root.getAsJsonArray("listeners").get(0).getAsJsonObject();
        if (listener.has("initProperties")) {
            listener.getAsJsonObject("initProperties").entrySet()
                    .forEach(entry -> direct.add(entry.getKey(), entry.getValue()));
        }
        if (listener.has("serviceProperties")) {
            listener.getAsJsonObject("serviceProperties").entrySet()
                    .forEach(entry -> direct.add(entry.getKey(), entry.getValue()));
        }
        if (root.has("initProperties")) {
            // Excludes the derived "listener" CHOICE: it is being replaced by the flattened ctor
            // fields above, not carried forward alongside them.
            root.getAsJsonObject("initProperties").entrySet().stream()
                    .filter(entry -> !PROP_KEY_LISTENER.equals(entry.getKey()))
                    .forEach(entry -> direct.add(entry.getKey(), entry.getValue()));
        }
        root.add("initProperties", direct);
        root.remove("listeners");
        root.remove("listenerForm");
    }

    private static void applyTrigger(JsonObject root, TriggerUIMetadataModel l2) {
        if (l2.trigger() != null) {
            put(root, "displayName", l2.trigger().displayName());
            put(root, "shortDisplayName", l2.trigger().shortDisplayName());
            put(root, "description", l2.trigger().description());
            put(root, "type", l2.trigger().type());
            if (l2.trigger().listenerKind() != null) {
                if (l2.trigger().listenerKind().isEmpty()) {
                    root.remove("listenerKind");
                } else {
                    root.addProperty("listenerKind", l2.trigger().listenerKind());
                }
            }
        }
        if (l2.metadata() != null) {
            String triggerKind = l2.metadata().effectiveTriggerKind();
            put(root, "kind", l2.metadata().kind() == null ? triggerKind : l2.metadata().kind());
            if (TRIGGER_KINDS.contains(triggerKind)) {
                root.addProperty("triggerKind", triggerKind);
            }
        }
        if (l2.readOnlyMetadata() != null) {
            JsonArray values = new JsonArray();
            for (TriggerUIMetadataModel.ReadOnlyMetadata item : l2.readOnlyMetadata()) {
                JsonObject value = new JsonObject();
                put(value, "key", item.key());
                put(value, "displayName", item.displayName());
                put(value, "kind", item.extractor());
                put(value, "paramKind", item.paramKind());
                put(value, "path", item.path());
                values.add(value);
            }
            root.add("readOnlyMetadata", values);
        }
    }

    /** @return the listener form overlay to apply once {@link #refreshListenerChoice} has run, or null */
    private static JsonObject applyListeners(JsonObject root, TriggerMetadataModel l1, TriggerLibraryFacts facts,
                                             SemanticModel semanticModel, TriggerUIMetadataModel l2, Index index) {
        if (l2.listeners() == null) {
            return null;
        }
        JsonArray runtimeListeners = root.has("listeners") && root.get("listeners").isJsonArray()
                ? root.getAsJsonArray("listeners") : new JsonArray();
        JsonArray ordered = new JsonArray();
        JsonObject listenerForm = null;
        for (TriggerUIMetadataModel.TargetedNode overlay : l2.listeners()) {
            JsonObject runtime = index.listener(overlay.target());
            if (runtime == null) {
                continue;
            }
            if (overlay.listener() != null) {
                TriggerUIMetadataModel.ListenerNode listener = overlay.listener();
                overlayMetadata(runtime, listener.metadata());
                put(runtime, "enabled", listener.enabledByDefault());

                Map<String, JsonObject> templates = propertyTemplates(runtime.getAsJsonObject("initProperties"));
                if (root.has("initProperties")) {
                    Map<String, JsonObject> derivedTemplates = propertyTemplatesDeep(
                            root.getAsJsonObject("initProperties"));
                    derivedTemplates.forEach(templates::putIfAbsent);
                }
                if (listener.formFields() != null) {
                    enrichListenerTemplatesFromFacts(listener.formFields(), templates,
                            listenerFacts(l1, facts, index.l1Listener(overlay.target())), root, semanticModel);
                    runtime.add("initProperties", compileFieldMap(listener.formFields(), templates, null));
                }
                if (listener.serviceProperties() != null) {
                    runtime.add("serviceProperties", compileFieldMap(listener.serviceProperties(), Map.of(), null));
                }
                if (listener.form() != null && listenerForm == null) {
                    listenerForm = GSON.toJsonTree(listener.form()).getAsJsonObject();
                }
            }
            ordered.add(runtime);
        }
        if (!ordered.isEmpty()) {
            root.add("listeners", ordered);
        } else if (!runtimeListeners.isEmpty()) {
            root.add("listeners", runtimeListeners);
        }
        if (listenerForm != null) {
            root.add("listenerForm", listenerForm);
        }
        return listenerForm;
    }

    private static void applyExistingListenerMetadata(JsonObject root, JsonObject listenerForm) {
        if (!root.has("initProperties") || !root.getAsJsonObject("initProperties").has(PROP_KEY_LISTENER)) {
            return;
        }
        JsonObject choice = root.getAsJsonObject("initProperties").getAsJsonObject(PROP_KEY_LISTENER);
        if (!choice.has("choices") || choice.getAsJsonArray("choices").size() < 2) {
            return;
        }
        JsonObject existing = choice.getAsJsonArray("choices").get(1).getAsJsonObject();
        // The branch's enabled/editable already carry ListenerChoiceDeriver's own defaults (editable
        // true when the listener is reusable per L1); an explicit L2 override still wins.
        if (listenerForm.has("useExistingEnabled")) {
            existing.add("enabled", listenerForm.get("useExistingEnabled"));
        }
        if (listenerForm.has("useExistingEditable")) {
            existing.add("editable", listenerForm.get("useExistingEditable"));
        }
        if (!existing.has("properties") || !existing.getAsJsonObject("properties").has("existingListener")) {
            return;
        }
        JsonObject selector = existing.getAsJsonObject("properties").getAsJsonObject("existingListener");
        if (listenerForm.has("existingListener")) {
            selector.add("metadata", listenerForm.get("existingListener"));
        }
        if (selector.has("types") && !selector.getAsJsonArray("types").isEmpty()) {
            JsonObject type = selector.getAsJsonArray("types").get(0).getAsJsonObject();
            if (listenerForm.has("existingListenerWidget")) {
                type.addProperty("fieldType", listenerForm.get("existingListenerWidget").getAsString());
            }
            if (listenerForm.has("existingListenerBallerinaType")) {
                type.addProperty("ballerinaType", listenerForm.get("existingListenerBallerinaType").getAsString());
            }
        }
        if (listenerForm.has("existingListenerItems")) {
            selector.add("items", listenerForm.get("existingListenerItems"));
        }
        if (listenerForm.has("existingListenerValue")) {
            selector.add("value", listenerForm.get("existingListenerValue"));
        }
    }

    private static void applyInitForm(JsonObject root, TriggerMetadataModel l1, TriggerLibraryFacts facts,
                                      Map<String, TriggerLibraryFacts> crossModuleFacts,
                                      SemanticModel semanticModel, TriggerUIMetadataModel l2, Index index) {
        if (l2.initForm() == null || l2.initForm().fields() == null) {
            // Leave the derived initProperties untouched rather than dropping it: an L2 surface that
            // doesn't author an init form (a skeleton authored before the connector's runtime UI
            // existed, e.g. graphql/grpc/http/tcp/websocket/websub/trigger.google.calendar) should fall
            // back to whatever L1 + semantic facts alone produced, not lose its init form outright.
            // The one exception is an *optional* identifier/base path: L1 marking it optional means
            // the connector doesn't need it filled in by default, and with no initForm at all L2 has
            // no way to explicitly restate it back in, unlike the authored-initForm path below.
            removeOptionalIdentifier(root);
            return;
        }
        JsonObject existing = root.has("initProperties") ? root.getAsJsonObject("initProperties") : new JsonObject();
        JsonObject compiled = new JsonObject();
        // The derived "listener" CHOICE survives an L2 initForm that never mentions it (an L2 typically
        // restates "serviceType"/annotation fields but not this one) -- same principle as the
        // null-initForm guard above, just extended to a present-but-partial one. Every other derived
        // field (annotations, the identifier) is authored-or-nothing: L2 must restate a field to keep
        // it, matching how the synthesizer's own baseline is meant to be pared down by a sparse L2.
        if (existing.has(PROP_KEY_LISTENER)) {
            compiled.add(PROP_KEY_LISTENER, existing.get(PROP_KEY_LISTENER));
        }
        for (TriggerUIMetadataModel.TargetedNode node : l2.initForm().fields()) {
            if (node.field() == null || node.field().key() == null) {
                continue;
            }
            String key = node.field().key();
            JsonObject template = existing.has(key) ? existing.getAsJsonObject(key) : null;
            if (isServiceAnnotationField(node.target())) {
                template = semanticAnnotationField(root, l1, facts, crossModuleFacts, semanticModel, node, index);
            }
            JsonObject field = applyField(node.field(), template, Map.of(), source(node), null, 0);
            overlayMetadata(field, node.metadata());
            overlayState(field, node.state());
            mergeCodedata(field, source(node));
            if ("driverDependencies".equals(key)) {
                enrichDriverDependencies(field, l1);
            }
            compiled.add(key, field);
        }
        root.add("initProperties", compiled);
    }

    /**
     * Drops {@code initProperties.identifier} (the L1-derived identifier/base-path field built by
     * {@code TriggerModelSynthesizer#buildIdentifierField}) when L1 marked it optional. A connector
     * that genuinely needs it filled in declares it non-optional; one that doesn't shouldn't force
     * every service through a field it has no use for by default.
     */
    private static void removeOptionalIdentifier(JsonObject root) {
        if (!root.has("initProperties")) {
            return;
        }
        JsonObject initProperties = root.getAsJsonObject("initProperties");
        if (!initProperties.has(PROP_KEY_IDENTIFIER)) {
            return;
        }
        JsonObject identifier = initProperties.getAsJsonObject(PROP_KEY_IDENTIFIER);
        if (identifier.has("optional") && identifier.get("optional").getAsBoolean()) {
            initProperties.remove(PROP_KEY_IDENTIFIER);
        }
    }

    /**
     * Moves a lone listener's service-level fields (see {@link ListenerChoiceDeriver#derive}, e.g. a
     * channel/base-path field) out of the create-new branch and into the top-level {@code
     * initProperties}, as a sibling of {@code listener}: with only one declared listener type there is
     * no other branch for them to conditionally apply to, so they describe the service being configured
     * as a whole and must be visible regardless of whether the user creates a new listener or reuses an
     * existing one. Several listener types leave them where {@link ListenerChoiceDeriver} put them,
     * scoped to their own branch -- a field one type alone gives meaning to (e.g. a base path that only
     * applies to an HTTP-shaped transport) must not show while a different type is selected. Runs after
     * {@link #applyInitForm} so its authored-or-nothing rebuild (when L2 declares an {@code initForm})
     * doesn't drop them -- an L2 {@code initForm} restates trigger-level semantic fields, not
     * listener-owned service properties, so there is no field for it to restate this under.
     */
    private static void promoteListenerServiceProperties(JsonObject root, TriggerMetadataModel l1) {
        if (l1.listeners() == null || l1.listeners().size() != 1 || !root.has("initProperties")) {
            return;
        }
        JsonObject initProperties = root.getAsJsonObject("initProperties");
        if (!initProperties.has(PROP_KEY_LISTENER)) {
            return;
        }
        JsonObject choice = initProperties.getAsJsonObject(PROP_KEY_LISTENER);
        if (!choice.has("choices") || !choice.get("choices").isJsonArray() || choice.getAsJsonArray("choices")
                .isEmpty()) {
            return;
        }
        JsonElement createNew = choice.getAsJsonArray("choices").get(0);
        if (!createNew.isJsonObject() || !createNew.getAsJsonObject().has("properties")) {
            return;
        }
        JsonObject branchProperties = createNew.getAsJsonObject().getAsJsonObject("properties");
        for (String key : List.copyOf(branchProperties.keySet())) {
            if (ListenerChoiceDeriver.LISTENER_CONFIG_GROUP_KEY.equals(key)) {
                continue;
            }
            if (!initProperties.has(key)) {
                initProperties.add(key, branchProperties.get(key));
            }
            branchProperties.remove(key);
        }
    }

    /**
     * Records an L2-authored {@code importPrefix} override and re-qualifies every {@code codedata.moduleName}
     * that was derived under the default alias (see {@link TriggerModelSynthesizer}'s {@code aliasOf}) so the
     * two stay consistent -- a connector whose actual published usage aliases its own module to something
     * other than the derived default (e.g. {@code whatsapp.business} imported as {@code whatsapp}, not the
     * last-dot-segment default {@code business}) would otherwise have its service types/functions qualified
     * under an alias nothing in the generated source ever imports.
     */
    private static void applyImportPrefix(JsonObject root, TriggerUIMetadataModel l2) {
        String prefix = l2.importPrefix();
        if (prefix == null || prefix.isBlank()) {
            return;
        }
        root.addProperty("importPrefix", prefix);
        String moduleName = string(root, "moduleName");
        if (moduleName == null) {
            return;
        }
        String defaultAlias = ModuleAliasResolver.selfPrefix(moduleName);
        if (defaultAlias.equals(prefix)) {
            return;
        }
        requalifyModuleNameAlias(root, defaultAlias, prefix);
    }

    private static void requalifyModuleNameAlias(JsonElement element, String from, String to) {
        if (element == null || !element.isJsonObject() && !element.isJsonArray()) {
            return;
        }
        if (element.isJsonArray()) {
            for (JsonElement item : element.getAsJsonArray()) {
                requalifyModuleNameAlias(item, from, to);
            }
            return;
        }
        JsonObject object = element.getAsJsonObject();
        for (String key : List.copyOf(object.keySet())) {
            JsonElement value = object.get(key);
            if ("moduleName".equals(key) && value.isJsonPrimitive() && from.equals(value.getAsString())) {
                object.addProperty(key, to);
            } else {
                requalifyModuleNameAlias(value, from, to);
            }
        }
    }

    private static JsonObject semanticAnnotationField(JsonObject root, TriggerMetadataModel l1,
                                                       TriggerLibraryFacts facts,
                                                       Map<String, TriggerLibraryFacts> crossModuleFacts,
                                                       SemanticModel semanticModel,
                                                       TriggerUIMetadataModel.TargetedNode node, Index index) {
        TriggerUIMetadataModel.Target target = node.target();
        TriggerMetadataModel.Annotation annotation = index.annotation(target.annotation());
        TriggerLibraryFacts.Annotation annotationFacts = findAnnotationFacts(annotation, facts, crossModuleFacts);
        TriggerLibraryFacts.Param param = findParam(annotationFacts == null ? null : annotationFacts.fields(),
                target.path());
        JsonObject field = param == null ? defaultProperty() : propertyForParam(root, param, semanticModel);

        JsonObject codedata = new JsonObject();
        codedata.addProperty("type", "SERVICE_ANNOTATION");
        JsonObject authoredCodedata = source(node);
        if (authoredCodedata != null) {
            mergeNonNull(codedata, authoredCodedata);
        }
        if (annotation != null && annotation.type() != null) {
            if (!codedata.has("originalName")) {
                codedata.addProperty("originalName", annotation.type().name());
            }
            String module = codedata.has("moduleName") ? string(codedata, "moduleName")
                    : annotation.type().packageInfo() == null
                    ? string(root, "moduleName") : annotation.type().packageInfo().moduleName();
            if (module != null) {
                codedata.addProperty("moduleName", module);
            }
        }
        codedata.addProperty("path", target.path());
        field.add("codedata", codedata);
        return field;
    }

    private static JsonObject propertyForParam(JsonObject root, TriggerLibraryFacts.Param param,
                                               SemanticModel semanticModel) {
        Value.ValueBuilder builder = new Value.ValueBuilder()
                .value("").enabled(true).editable(true).optional(param.optional()).setAdvanced(false);
        ModuleInfo moduleInfo = new ModuleInfo(string(root, "orgName"), string(root, "packageName"),
                string(root, "moduleName"), string(root, "version"));
        PropertyType.typeWithExpression(builder, param.typeSymbol(), moduleInfo, null, semanticModel);
        JsonObject property = GSON.toJsonTree(builder.build()).getAsJsonObject();
        property.remove("metadata");
        property.remove("codedata");
        return property;
    }

    /**
     * The listener's own facts, for resolving an L2 listener field's {@code source.codedata.path}
     * against real type info (see {@link #enrichListenerTemplatesFromFacts}). Mirrors
     * {@link TriggerModelSynthesizer#findListener}'s single-listener fallback.
     */
    private static TriggerLibraryFacts.Listener listenerFacts(TriggerMetadataModel l1, TriggerLibraryFacts facts,
                                                               TriggerMetadataModel.Listener l1Listener) {
        if (l1Listener == null || facts == null) {
            return null;
        }
        int declaredCount = l1.listeners() == null ? 0 : l1.listeners().size();
        return TriggerModelSynthesizer.findListener(l1Listener, facts, declaredCount);
    }

    /**
     * Fills in a template for any authored listener field whose key has no match in {@code templates}
     * but whose {@code source.codedata.path} resolves against the listener's own facts -- e.g. a field
     * nested inside an included record (a database connection's {@code hostname}) that the generic
     * {@link io.ballerina.servicemodelgenerator.extension.model.Listener} model never exposed on its
     * own, so it would otherwise fall back to a bare text-guess widget with no real type info. Reuses
     * the same {@link #propertyForParam} construction {@link #semanticAnnotationField} uses for
     * annotation fields with no matching param.
     */
    private static void enrichListenerTemplatesFromFacts(Map<String, TriggerUIMetadataModel.Field> formFields,
                                                          Map<String, JsonObject> templates,
                                                          TriggerLibraryFacts.Listener listenerFacts, JsonObject root,
                                                          SemanticModel semanticModel) {
        if (listenerFacts == null || semanticModel == null) {
            return;
        }
        List<TriggerLibraryFacts.Param> configFields = listenerConfigFields(listenerFacts);
        for (Map.Entry<String, TriggerUIMetadataModel.Field> entry : formFields.entrySet()) {
            TriggerUIMetadataModel.Field field = entry.getValue();
            TriggerUIMetadataModel.Codedata source = field.source() == null ? null : field.source().codedata();
            String argType = source == null ? null : source.argType();
            // Scoped to a field that addresses one included-record leaf directly: a synthetic field
            // whose path only aggregates into a shared facts record (e.g. CDC_OPERATION_ENABLE's shared
            // "skippedOperations") isn't this field's own type and must not overwrite its own template.
            if (source == null || source.path() == null
                    || !("LISTENER_PARAM_INCLUDED_FIELD".equals(argType)
                            || "LISTENER_PARAM_INCLUDED_DEFAULTABLE_FIELD".equals(argType))) {
                continue;
            }
            TriggerLibraryFacts.Param param = findParam(configFields, source.path());
            if (param == null || param.typeSymbol() == null) {
                continue;
            }
            JsonObject template = propertyForParam(root, param, semanticModel);
            template.addProperty("optional", param.optional());
            templates.put(entry.getKey(), template);
        }
    }

    /**
     * A listener's init params, with any {@code INCLUDED_RECORD} spread (e.g. {@code *X:ListenerConfig})
     * replaced by its own fields -- the same flattening {@code ListenerUtil} applies before a connector's
     * {@link io.ballerina.servicemodelgenerator.extension.model.Listener} model is built, so a dotted
     * {@code source.codedata.path} can address a field by the name it's actually declared under.
     */
    private static List<TriggerLibraryFacts.Param> listenerConfigFields(TriggerLibraryFacts.Listener listenerFacts) {
        List<TriggerLibraryFacts.Param> fields = new ArrayList<>();
        if (listenerFacts.initParams() == null) {
            return fields;
        }
        for (TriggerLibraryFacts.Param param : listenerFacts.initParams()) {
            if ("INCLUDED_RECORD".equals(param.kind()) && param.fields() != null) {
                fields.addAll(param.fields());
            } else {
                fields.add(param);
            }
        }
        return fields;
    }

    private static TriggerLibraryFacts.Annotation findAnnotationFacts(TriggerMetadataModel.Annotation annotation,
                                                                        TriggerLibraryFacts facts,
                                                                        Map<String, TriggerLibraryFacts> crossFacts) {
        if (annotation == null || annotation.type() == null) {
            return null;
        }
        List<TriggerLibraryFacts> candidates = new ArrayList<>();
        candidates.add(facts);
        if (crossFacts != null) {
            candidates.addAll(crossFacts.values());
        }
        for (TriggerLibraryFacts candidate : candidates) {
            if (candidate == null || candidate.annotations() == null) {
                continue;
            }
            for (TriggerLibraryFacts.Annotation item : candidate.annotations()) {
                if (annotation.type().name().equals(item.name())) {
                    return item;
                }
            }
        }
        return null;
    }

    private static TriggerLibraryFacts.Param findParam(List<TriggerLibraryFacts.Param> params, String path) {
        if (params == null || path == null) {
            return null;
        }
        List<TriggerLibraryFacts.Param> current = params;
        TriggerLibraryFacts.Param found = null;
        for (String part : path.split("\\.")) {
            found = null;
            for (TriggerLibraryFacts.Param candidate : current) {
                if (part.equals(candidate.name())) {
                    found = candidate;
                    break;
                }
            }
            if (found == null) {
                return null;
            }
            current = found.fields() == null ? List.of() : found.fields();
        }
        return found;
    }

    private static void enrichDriverDependencies(JsonObject group, TriggerMetadataModel l1) {
        if (!group.has("properties") || l1 == null || l1.listeners() == null || l1.listeners().isEmpty()) {
            return;
        }
        List<TriggerMetadataModel.PlatformDependency> dependencies = l1.listeners().getFirst().platformDependencies();
        if (dependencies == null) {
            return;
        }
        group.add("types", types("GROUP_SECTION", null));
        int index = 0;
        for (Map.Entry<String, JsonElement> entry : group.getAsJsonObject("properties").entrySet()) {
            if (index >= dependencies.size() || !entry.getValue().isJsonObject()) {
                break;
            }
            JsonObject field = entry.getValue().getAsJsonObject();
            JsonObject type = type("PROJECT_FILE_SELECT", true, null);
            JsonArray extensions = new JsonArray();
            extensions.add("jar");
            type.add("extensions", extensions);
            JsonArray types = new JsonArray();
            types.add(type);
            field.add("types", types);

            TriggerMetadataModel.PlatformDependency dependency = dependencies.get(index++);
            JsonObject coordinates = new JsonObject();
            put(coordinates, "groupId", dependency.groupId());
            put(coordinates, "artifactId", dependency.artifactId());
            put(coordinates, "version", dependency.version());
            put(coordinates, "scope", dependency.scope());
            JsonObject codedata = field.has("codedata") ? field.getAsJsonObject("codedata") : new JsonObject();
            codedata.add("driverDependency", coordinates);
            field.add("codedata", codedata);
        }
    }

    private static void applyServiceTypes(JsonObject root, TriggerUIMetadataModel l2, Index index) {
        if (l2.serviceTypes() == null || !root.has("serviceTypes")) {
            return;
        }
        JsonArray ordered = new JsonArray();
        Map<String, String> labelsByName = new LinkedHashMap<>();
        for (TriggerUIMetadataModel.TargetedNode overlay : l2.serviceTypes()) {
            JsonObject runtime = index.serviceType(overlay.target());
            if (runtime == null) {
                continue;
            }
            overlayMetadata(runtime, overlay.metadata());
            overlayState(runtime, overlay.state());
            if (overlay.service() != null && overlay.service().name() != null) {
                put(runtime, "name", overlay.service().name());
            }
            if (overlay.service() != null && overlay.service().description() != null) {
                put(runtime, "description", overlay.service().description());
            }
            if (overlay.service() != null && overlay.service().properties() != null) {
                if (overlay.service().properties().isEmpty()) {
                    // An explicit empty map means L2 wants the auto-derived properties (e.g. a service
                    // annotation the synthesizer always attaches) dropped entirely, not restated as {}.
                    runtime.remove("properties");
                } else {
                    JsonObject existing = runtime.has("properties")
                            ? runtime.getAsJsonObject("properties") : new JsonObject();
                    runtime.add("properties",
                            compileFieldMap(overlay.service().properties(), propertyTemplates(existing), null));
                }
            }
            if (overlay.handlers() != null) {
                for (TriggerUIMetadataModel.TargetedNode handler : overlay.handlers()) {
                    List<JsonObject> functions = index.functions(runtime, handler.target());
                    if (handler.function() != null && Boolean.FALSE.equals(handler.function().included())) {
                        removeFunctions(runtime, functions);
                        continue;
                    }
                    for (JsonObject function : functions) {
                        applyFunction(function, handler, index);
                    }
                }
            }
            if (runtime.has("name") && runtime.has("metadata") && runtime.getAsJsonObject("metadata").has("label")) {
                labelsByName.put(string(runtime, "name"), string(runtime.getAsJsonObject("metadata"), "label"));
            }
            ordered.add(runtime);
        }
        if (!ordered.isEmpty()) {
            root.add("serviceTypes", ordered);
        }
        syncServiceTypeSelectorLabels(root, labelsByName);
    }

    private static void removeFunctions(JsonObject service, List<JsonObject> excluded) {
        for (String key : List.of("functions", "schemaFunctions")) {
            if (!service.has(key)) {
                continue;
            }
            JsonArray retained = new JsonArray();
            for (JsonElement item : service.getAsJsonArray(key)) {
                if (!excluded.contains(item.getAsJsonObject())) {
                    retained.add(item);
                }
            }
            service.add(key, retained);
        }
    }

    /**
     * The multi-service-type selector's own options are built once, in {@code TriggerModelSynthesizer},
     * from each service type's L1 id humanized -- the only label it can see at that point, since L2
     * hasn't been overlaid yet. Once a service type's own {@code metadata.label} is authored (or
     * derived above from L1's own richer wording), its selector option should say the same thing
     * rather than a separately-humanized guess of the same concept.
     */
    private static void syncServiceTypeSelectorLabels(JsonObject root, Map<String, String> labelsByName) {
        if (labelsByName.isEmpty() || !root.has("initProperties")) {
            return;
        }
        JsonObject initProperties = root.getAsJsonObject("initProperties");
        if (!initProperties.has("serviceType")) {
            return;
        }
        JsonObject selector = initProperties.getAsJsonObject("serviceType");
        if (!selector.has("types") || !selector.get("types").isJsonArray()) {
            return;
        }
        for (JsonElement typeElement : selector.getAsJsonArray("types")) {
            if (!typeElement.isJsonObject()) {
                continue;
            }
            JsonObject type = typeElement.getAsJsonObject();
            if (!type.has("options") || !type.get("options").isJsonArray()) {
                continue;
            }
            for (JsonElement optionElement : type.getAsJsonArray("options")) {
                if (!optionElement.isJsonObject()) {
                    continue;
                }
                JsonObject option = optionElement.getAsJsonObject();
                String value = option.has("value") ? string(option, "value") : null;
                String label = value == null ? null : labelsByName.get(value);
                if (label != null) {
                    option.addProperty("label", label);
                }
            }
        }
    }

    private static void applyFunction(JsonObject function, TriggerUIMetadataModel.TargetedNode overlay, Index index) {
        overlayMetadata(function, overlay.metadata());
        overlayState(function, overlay.state());
        mergeCodedata(function, source(overlay));
        if (overlay.function() != null) {
            TriggerUIMetadataModel.FunctionNode authored = overlay.function();
            put(function, "name", authored.name());
            put(function, "nameEditable", authored.nameEditable());
            if (authored.nameMetadata() != null) {
                function.add("nameMetadata", runtimeMetadata(authored.nameMetadata()));
            }
            put(function, "repeatable", authored.repeatable());
            put(function, "canAddParameters", authored.canAddParameters());
            put(function, "variantLabel", authored.variantLabel());
            put(function, "group", authored.group());
            if (authored.properties() != null) {
                if (authored.properties().isEmpty()) {
                    // An explicit empty map means L2 wants the auto-derived properties (e.g. a handler
                    // annotation the synthesizer always attaches) dropped entirely, not restated as {}.
                    function.remove("properties");
                } else {
                    // A full replacement, not a merge: L2 decomposing an auto-derived annotation
                    // property (e.g. functionConfig) into structured sub-fields (e.g.
                    // afterFileProcessing) means the derived key no longer belongs in the output.
                    JsonObject existing = function.has("properties")
                            ? function.getAsJsonObject("properties") : new JsonObject();
                    function.add("properties",
                            compileFieldMap(authored.properties(), propertyTemplates(existing), null));
                }
            }
            if (authored.layout() != null) {
                function.add("layout", GSON.toJsonTree(authored.layout()));
            }
            applyDocumentation(function, authored.documentation());
        }
        if (overlay.parameters() != null && function.has("parameters")) {
            JsonArray params = function.getAsJsonArray("parameters");
            JsonArray ordered = new JsonArray();
            for (int parameterIndex = 0; parameterIndex < overlay.parameters().size(); parameterIndex++) {
                TriggerUIMetadataModel.TargetedNode parameter = overlay.parameters().get(parameterIndex);
                JsonObject runtime = index.parameter(params, parameter.target(), parameterIndex);
                if (runtime != null) {
                    applyParameter(runtime, parameter);
                    ordered.add(runtime);
                }
            }
            if (!ordered.isEmpty()) {
                function.add("parameters", ordered);
            }
        }
        if (overlay.parameterSchema() != null) {
            JsonObject schemas = function.has("parameterSchema")
                    ? function.getAsJsonObject("parameterSchema") : new JsonObject();
            for (TriggerUIMetadataModel.TargetedNode parameter : overlay.parameterSchema()) {
                String key = parameter.target() == null ? null : parameter.target().path();
                if (key == null) {
                    continue;
                }
                JsonObject runtime = schemas.has(key) && schemas.get(key).isJsonObject()
                        ? schemas.getAsJsonObject(key) : parameterSchema(key, parameter.metadata());
                applyParameter(runtime, parameter, false);
                schemas.add(key, runtime);
            }
            if (!schemas.isEmpty()) {
                function.add("parameterSchema", schemas);
            }
        }
        if (overlay.returnType() != null && function.has("returnType")) {
            JsonObject returnType = function.getAsJsonObject("returnType");
            overlayMetadata(returnType, overlay.returnType().metadata());
            overlayState(returnType, overlay.returnType().state());
            TriggerUIMetadataModel.Field authored = overlay.returnType().field();
            if (authored != null) {
                Object value = authored.defaultValue();
                if (value != null) {
                    putObject(returnType, "type", value);
                    returnType.addProperty("hasError", hasErrorMember(String.valueOf(value)));
                } else if (authored.state() != null && Boolean.TRUE.equals(authored.state().typeEditable())) {
                    // A handler L2 marks a return as user-editable without restating a fixed type
                    // (e.g. an addable handler whose real return type is the author's choice, not one
                    // the synthesizer could derive) -- the synthesized placeholder type/hasError no
                    // longer describes anything and shouldn't survive onto the editable field.
                    returnType.remove("type");
                    returnType.addProperty("hasError", false);
                }
                if (authored.state() != null) {
                    put(returnType, "editable", authored.state().editable());
                    put(returnType, "optional", authored.state().optional());
                    put(returnType, "enabled", authored.state().enabled());
                    put(returnType, "typeEditable", authored.state().typeEditable());
                }
                JsonObject codedata = authored.source() == null ? null : json(authored.source().codedata());
                if (codedata != null && !codedata.isEmpty()) {
                    returnType.add("codedata", codedata);
                } else if (!returnType.has("codedata")) {
                    JsonObject derived = new JsonObject();
                    derived.addProperty("type", "FUNCTION_RETURN");
                    returnType.add("codedata", derived);
                }
            }
        }
    }

    private static void applyDocumentation(JsonObject function,
                                           TriggerUIMetadataModel.Documentation documentation) {
        if (documentation == null) {
            return;
        }
        if (!Boolean.TRUE.equals(documentation.editable())) {
            put(function, "documentation", documentation.defaultValue());
            return;
        }
        JsonObject schema = defaultProperty();
        if (documentation.metadata() != null) {
            schema.add("metadata", runtimeMetadata(documentation.metadata()));
        }
        put(schema, "placeholder", documentation.placeholder());
        put(schema, "value", documentation.defaultValue() == null ? "" : documentation.defaultValue());
        schema.add("types", types("DOC_TEXT", null));
        schema.addProperty("optional", true);
        function.add("documentationSchema", schema);
        function.remove("documentation");
    }

    private static void applyParameter(JsonObject runtime, TriggerUIMetadataModel.TargetedNode overlay) {
        applyParameter(runtime, overlay, true);
    }

    /**
     * {@code normalizeKind} is false for a {@code parameterSchema} template entry: there, {@code kind}
     * describes whether the sub-field is required within the record the user fills in, a concept
     * unrelated to {@code state.optional} (which instead says whether the templated entry itself is
     * optional to add) -- the two must not be coupled the way an actual function parameter's are.
     */
    private static void applyParameter(JsonObject runtime, TriggerUIMetadataModel.TargetedNode overlay,
                                       boolean normalizeKind) {
        overlayMetadata(runtime, overlay.metadata());
        overlayState(runtime, overlay.state());
        mergeCodedata(runtime, source(overlay));
        if (overlay.fields() != null) {
            for (TriggerUIMetadataModel.TargetedNode child : overlay.fields()) {
                String key = child.target() == null ? null : child.target().path();
                if (key == null || child.field() == null) {
                    continue;
                }
                if (Boolean.TRUE.equals(child.field().literal())) {
                    // A bare marker value (e.g. an httpParamType discriminator) rather than the usual
                    // Property-object shape -- there is nothing to overlay metadata/state onto.
                    runtime.add(key, GSON.toJsonTree(child.field().defaultValue()));
                    continue;
                }
                // A key absent from the template (e.g. a parameterSchema entry's own companion field,
                // like a header's overridable wire name) is built fresh rather than skipped -- every
                // existing caller already targets a key the template has, so this only ever adds.
                JsonObject property = applyField(child.field(), runtime.has(key) ? runtime.getAsJsonObject(key)
                        : null, Map.of(),
                        source(child), null, 0);
                overlayMetadata(property, child.metadata());
                overlayState(property, child.state());
                runtime.add(key, property);
            }
        }
        if (overlay.field() != null) {
            JsonObject field = applyField(overlay.field(), runtime, Map.of(), source(overlay), null, 0);
            replace(runtime, field);
        }
        if (overlay.field() != null && overlay.field().binding() != null) {
            JsonObject codedata = runtime.has("codedata") ? runtime.getAsJsonObject("codedata") : new JsonObject();
            put(codedata, "nameEditable", overlay.field().binding().nameEditable());
            put(codedata, "bindingKind", overlay.field().binding().bindingKind());
            runtime.add("codedata", codedata);
        }
        if (!normalizeKind) {
            return;
        }
        String kind = normalizeParameterKind(string(runtime, "kind"),
                overlay.state() == null ? null : overlay.state().optional(), isPayloadParameter(runtime));
        if (kind != null) {
            runtime.addProperty("kind", kind);
        }
    }

    /**
     * Parameter kind is a runtime UI classification, not an L1 type-system fact. L2 may turn an ordinary
     * L1 parameter into a fixed payload field (for example, a non-bindable {@code string} file body), so
     * derive {@code DATA_BINDING} from the final overlaid field rather than requiring a false L1 binding.
     */
    static String normalizeParameterKind(String kind, Boolean optional, boolean payload) {
        if (DATA_BINDING.equals(kind) || payload) {
            return DATA_BINDING;
        }
        return Boolean.TRUE.equals(optional) ? "OPTIONAL" : kind;
    }

    private static boolean isPayloadParameter(JsonObject parameter) {
        return parameter.has("type") && parameter.get("type").isJsonObject()
                && containsPayloadField(parameter.getAsJsonObject("type"));
    }

    /** Finds payload leaves through COMPLEX_PAYLOAD/property and CHOICE shapes authored by L2. */
    private static boolean containsPayloadField(JsonObject field) {
        if (field.has("codedata") && field.get("codedata").isJsonObject()) {
            String type = string(field.getAsJsonObject("codedata"), "type");
            if (CD_TYPE_PAYLOAD_TYPE.equals(type) || CD_TYPE_PAYLOAD_TYPE_INCLUDED_RECORD.equals(type)) {
                return true;
            }
        }
        if (field.has("properties") && field.get("properties").isJsonObject()) {
            for (Map.Entry<String, JsonElement> entry : field.getAsJsonObject("properties").entrySet()) {
                if (entry.getValue().isJsonObject() && containsPayloadField(entry.getValue().getAsJsonObject())) {
                    return true;
                }
            }
        }
        if (field.has("choices") && field.get("choices").isJsonArray()) {
            for (JsonElement choice : field.getAsJsonArray("choices")) {
                if (choice.isJsonObject() && containsPayloadField(choice.getAsJsonObject())) {
                    return true;
                }
            }
        }
        return false;
    }

    private static boolean hasErrorMember(String type) {
        if (type == null) {
            return false;
        }
        for (String member : type.split("\\|")) {
            String normalized = member.strip();
            while (normalized.startsWith("(")) {
                normalized = normalized.substring(1).strip();
            }
            while (normalized.endsWith(")")) {
                normalized = normalized.substring(0, normalized.length() - 1).strip();
            }
            if ("error".equals(normalized) || "error?".equals(normalized)) {
                return true;
            }
        }
        return false;
    }

    /** Creates the stable common shape used by dynamically-defined MCP tool parameters. */
    private static JsonObject parameterSchema(String key, TriggerUIMetadataModel.Metadata metadata) {
        JsonObject schema = defaultProperty();
        // Only its inner type/name/defaultValue/documentation fields carry their own advanced flag --
        // the schema entry itself is never individually collapsible, so it doesn't restate one.
        schema.remove("advanced");
        if (metadata != null) {
            schema.add("metadata", runtimeMetadata(metadata));
        }
        schema.addProperty("kind", "REQUIRED");
        JsonObject type = schemaField("Type", "The type of the parameter", "string", "TYPE");
        type.addProperty("placeholder", "string");
        schema.add("type", type);
        schema.add("name", schemaField("Name", "The parameter's identifier", null, "IDENTIFIER"));
        JsonObject defaultValue = defaultProperty();
        defaultValue.add("metadata", metadata("Default Value", "The default value, if this parameter is optional"));
        defaultValue.add("types", types("EXPRESSION", null));
        defaultValue.addProperty("optional", true);
        defaultValue.addProperty("advanced", true);
        schema.add("defaultValue", defaultValue);
        JsonObject documentation = defaultProperty();
        documentation.add("metadata", metadata("Description", "The description of the parameter"));
        documentation.add("types", types("DOC_TEXT", null));
        documentation.addProperty("optional", true);
        schema.add("documentation", documentation);
        schema.addProperty("optional", true);
        return schema;
    }

    private static JsonObject schemaField(String label, String description, String value, String widgetKind) {
        JsonObject field = defaultProperty();
        field.add("metadata", metadata(label, description));
        put(field, "value", value);
        field.add("types", types(widgetKind, null));
        return field;
    }

    private static JsonObject metadata(String label, String description) {
        JsonObject metadata = new JsonObject();
        metadata.addProperty("label", label);
        metadata.addProperty("description", description);
        return metadata;
    }

    private static JsonObject compileFieldMap(Map<String, TriggerUIMetadataModel.Field> authored,
                                              Map<String, JsonObject> templates, JsonObject inheritedCodedata) {
        JsonObject result = new JsonObject();
        for (Map.Entry<String, TriggerUIMetadataModel.Field> entry : authored.entrySet()) {
            JsonObject template = templates.get(entry.getKey());
            result.add(entry.getKey(), applyField(entry.getValue(), template, templates, inheritedCodedata,
                    entry.getKey(), 0));
        }
        return result;
    }

    private static JsonObject applyField(TriggerUIMetadataModel.Field authored, JsonObject template,
                                         Map<String, JsonObject> templates, JsonObject inheritedCodedata,
                                         String parentKey, int choiceIndex) {
        JsonObject field = template == null ? defaultProperty() : template.deepCopy();
        if (authored == null) {
            return field;
        }
        overlayMetadata(field, authored.metadata());
        if (authored.placeholder() == null) {
            field.remove("placeholder");
        } else {
            put(field, "placeholder", authored.placeholder());
        }
        putObject(field, "value", authored.defaultValue());
        overlayState(field, authored.state());
        if (authored.items() != null) {
            field.add("items", GSON.toJsonTree(authored.items()));
        }
        if (authored.validations() != null) {
            field.add("validations", GSON.toJsonTree(authored.validations()));
        }
        if (authored.source() != null) {
            // An explicit L2 source.codedata is authoritative for this field: it replaces whatever the
            // matched template carried rather than being merged on top of it, so a field the template
            // doesn't mention isn't left over from a shape L2 chose not to restate.
            field.remove("codedata");
        }
        mergeCodedata(field, authored.source() == null ? inheritedCodedata : json(authored.source().codedata()));

        if (authored.widget() != null && authored.widget().overrides() != null) {
            JsonArray widgets = new JsonArray();
            for (TriggerUIMetadataModel.Widget widget : authored.widget().overrides()) {
                JsonObject value = json(widget);
                JsonElement kind = value.remove("widgetKind");
                if (kind != null) {
                    value.add("fieldType", kind);
                }
                widgets.add(value);
            }
            field.add("types", widgets);
        }

        boolean hasWidgetOverride = authored.widget() != null && authored.widget().overrides() != null;
        if (authored.source() == null && authored.properties() != null && hasWidgetOverride) {
            // An explicit widget override plus a properties restructuring means this field is being
            // fully redefined by L2 (e.g. a plain payload type replaced by a COMPLEX_PAYLOAD container),
            // not incrementally decorated -- whatever codedata the matched template carried belonged to
            // the pre-restructuring shape and shouldn't survive onto the new one unless L2 restates it.
            field.remove("codedata");
        }
        if (authored.choices() != null) {
            if (authored.source() == null) {
                // A CHOICE container's substance comes from its authored choices, not from whatever
                // leaf-field codedata happened to be on the matched template -- a template is looked
                // up by bare property name (see the "properties" branch below), so a name that repeats
                // across sibling choices (e.g. an "auth" field appearing once per protocol variant)
                // would otherwise leak one sibling's codedata onto every other one.
                field.remove("codedata");
            }
            // A CHOICE field's own widget.overrides may carry authored data (e.g. a
            // ballerinaType/options enum widget) that the branch above already applied to types[];
            // only fall back to a bare CHOICE type when this field didn't author one.
            if (!hasWidgetOverride) {
                field.add("types", types("CHOICE", null));
            }
            JsonArray choices = new JsonArray();
            for (int i = 0; i < authored.choices().size(); i++) {
                TriggerUIMetadataModel.Field choice = authored.choices().get(i);
                // A choice is a nested form, so its runtime counterpart is the matching choice in
                // the template, rather than the template of the choice container itself. Keeping
                // that shape is important for sparse L2 metadata: listener fields such as auth and
                // destination branches still need the L1-derived optionality, widgets, and codedata
                // of their leaves.
                JsonObject branchTemplate = template != null && template.has("choices")
                        && template.get("choices").isJsonArray()
                        && i < template.getAsJsonArray("choices").size()
                        && template.getAsJsonArray("choices").get(i).isJsonObject()
                        ? template.getAsJsonArray("choices").get(i).getAsJsonObject() : null;
                // Only when this CHOICE field itself declares a source does it share one mapping target
                // with its branches (e.g. a listener field whose branches each build the same annotation
                // value). A CHOICE with no source of its own -- a plain value selector such as
                // Temporary/Durable -- had its own codedata removed just above precisely because it
                // isn't mapped to anything; falling back to the *ancestor's* codedata here would leak
                // that ancestor's annotation path onto every branch despite the branch selector itself
                // not being the thing written to it.
                JsonObject inheritedChoiceCodedata = field.has("codedata")
                        ? field.getAsJsonObject("codedata") : null;
                JsonObject branch = applyField(choice, branchTemplate, templates, inheritedChoiceCodedata,
                        parentKey, i);
                // Most choices are sub-forms with no widget of their own (e.g. FTP/SFTP/FTPS), so
                // default to FORM; a choice that authors its own widget (e.g. a literal ENUM value
                // choice like "Delete") keeps what it declared instead.
                boolean choiceHasWidgetOverride = choice.widget() != null && choice.widget().overrides() != null;
                if (!choiceHasWidgetOverride) {
                    branch.add("types", types("FORM", null));
                }
                branch.addProperty("enabled", i == 0);
                if (inheritedCodedata != null && "SERVICE_ANNOTATION".equals(string(inheritedCodedata, "type"))
                        && parentKey != null
                        && parentKey.equals(string(inheritedCodedata, "path"))) {
                    JsonObject mapping = new JsonObject();
                    mapping.addProperty("type", "MAPPING_CONSTRUCTOR");
                    branch.add("codedata", mapping);
                }
                choices.add(branch);
            }
            field.add("choices", choices);
        }
        if (authored.properties() != null) {
            JsonObject properties = new JsonObject();
            for (Map.Entry<String, TriggerUIMetadataModel.Field> entry : authored.properties().entrySet()) {
                // Nested overlays must inherit the matching nested runtime property. Looking only in the
                // sibling template map loses payload/widget metadata for structures such as
                // content.type.payload and content.type.stream.
                JsonObject childTemplate = field.has("properties")
                        && field.get("properties").isJsonObject()
                        && field.getAsJsonObject("properties").has(entry.getKey())
                        && field.getAsJsonObject("properties").get(entry.getKey()).isJsonObject()
                        ? field.getAsJsonObject("properties").getAsJsonObject(entry.getKey())
                        : templates.get(entry.getKey());
                JsonObject childCodedata = childTemplate == null && inheritedCodedata != null
                        ? serviceAnnotationChildCodedata(inheritedCodedata, entry.getKey(), parentKey) : null;
                properties.add(entry.getKey(), applyField(entry.getValue(), childTemplate, templates,
                        childCodedata, parentKey, choiceIndex));
            }
            field.add("properties", properties);
            if (!hasWidgetOverride && authored.choices() == null && (template == null || !template.has("types"))) {
                field.add("types", types("GROUP_SECTION", null));
            }
        }
        if (!field.has("types")) {
            field.add("types", inferTypes(authored.defaultValue()));
        }
        return field;
    }

    private static JsonObject serviceAnnotationChildCodedata(JsonObject parent, String key, String parentKey) {
        if (!"SERVICE_ANNOTATION".equals(string(parent, "type"))) {
            return null;
        }
        JsonObject child = parent.deepCopy();
        String path = key.endsWith("Value") && string(parent, "path") != null
                ? string(parent, "path") : key;
        child.addProperty("path", path);
        return child;
    }

    private static JsonArray inferTypes(Object value) {
        if (value instanceof Boolean || "true".equals(value) || "false".equals(value)) {
            return types("FLAG", "boolean");
        }
        String text = value == null ? "" : String.valueOf(value);
        if (text.matches("-?[0-9]+(?:\\.[0-9]+)?")) {
            return typesWithExpression("NUMBER", text.contains(".") ? "decimal" : "int");
        }
        return typesWithExpression("TEXT", "string");
    }

    private static JsonArray types(String fieldType, String ballerinaType) {
        JsonArray types = new JsonArray();
        types.add(type(fieldType, true, ballerinaType));
        return types;
    }

    private static JsonArray typesWithExpression(String fieldType, String ballerinaType) {
        JsonArray types = types(fieldType, ballerinaType);
        types.add(type("EXPRESSION", false, ballerinaType));
        return types;
    }

    private static JsonObject type(String fieldType, boolean selected, String ballerinaType) {
        JsonObject type = new JsonObject();
        type.addProperty("fieldType", fieldType);
        type.addProperty("selected", selected);
        put(type, "ballerinaType", ballerinaType);
        return type;
    }

    private static JsonObject defaultProperty() {
        JsonObject field = new JsonObject();
        field.addProperty("enabled", true);
        field.addProperty("editable", true);
        field.addProperty("optional", false);
        field.addProperty("advanced", false);
        return field;
    }

    private static Map<String, JsonObject> propertyTemplates(JsonObject properties) {
        if (properties == null) {
            return Map.of();
        }
        Map<String, JsonObject> templates = new LinkedHashMap<>();
        for (Map.Entry<String, JsonElement> entry : properties.entrySet()) {
            if (entry.getValue().isJsonObject()) {
                templates.put(entry.getKey(), entry.getValue().getAsJsonObject());
            }
        }
        return templates;
    }

    /** Collects field templates through listener choices and groups when the listener node is sparse. */
    private static Map<String, JsonObject> propertyTemplatesDeep(JsonObject object) {
        Map<String, JsonObject> templates = new LinkedHashMap<>();
        collectPropertyTemplates(object, templates);
        return templates;
    }

    private static void collectPropertyTemplates(JsonObject object, Map<String, JsonObject> templates) {
        if (object == null) {
            return;
        }
        for (Map.Entry<String, JsonElement> entry : object.entrySet()) {
            if (!entry.getValue().isJsonObject()) {
                continue;
            }
            JsonObject value = entry.getValue().getAsJsonObject();
            templates.putIfAbsent(entry.getKey(), value);
            if (value.has("properties")) {
                collectPropertyTemplates(value.getAsJsonObject("properties"), templates);
            }
            if (value.has("choices") && value.get("choices").isJsonArray()) {
                for (JsonElement choice : value.getAsJsonArray("choices")) {
                    if (choice.isJsonObject()) {
                        collectPropertyTemplates(choice.getAsJsonObject(), templates);
                    }
                }
            }
        }
    }

    private static void overlayMetadata(JsonObject target, TriggerUIMetadataModel.Metadata authored) {
        if (authored == null) {
            return;
        }
        JsonObject metadata = target.has("metadata") && target.get("metadata").isJsonObject()
                ? target.getAsJsonObject("metadata") : new JsonObject();
        JsonObject source = runtimeMetadata(authored);
        mergeNonNull(metadata, source);
        target.add("metadata", metadata);
    }

    private static JsonObject runtimeMetadata(TriggerUIMetadataModel.Metadata authored) {
        JsonObject source = json(authored);
        JsonObject metadata = new JsonObject();
        for (String key : METADATA_FIELDS) {
            if (source.has(key)) {
                metadata.add(key, source.get(key));
            }
        }
        return metadata;
    }

    private static void overlayState(JsonObject target, TriggerUIMetadataModel.State state) {
        if (state == null) {
            return;
        }
        put(target, "enabled", state.enabled());
        put(target, "editable", state.editable());
        put(target, "optional", state.optional());
        put(target, "advanced", state.advanced());
        put(target, "hidden", state.hidden());
        put(target, "typeEditable", state.typeEditable());
    }

    private static JsonObject source(TriggerUIMetadataModel.TargetedNode node) {
        return node == null || node.source() == null ? null : json(node.source().codedata());
    }

    private static void mergeCodedata(JsonObject target, JsonObject authored) {
        if (authored == null || authored.isEmpty()) {
            return;
        }
        JsonObject codedata = target.has("codedata") && target.get("codedata").isJsonObject()
                ? target.getAsJsonObject("codedata") : new JsonObject();
        mergeNonNull(codedata, authored);
        target.add("codedata", codedata);
    }

    private static void mergeNonNull(JsonObject target, JsonObject source) {
        for (Map.Entry<String, JsonElement> entry : source.entrySet()) {
            if (!entry.getValue().isJsonNull()) {
                target.add(entry.getKey(), entry.getValue());
            }
        }
    }

    private static boolean isServiceAnnotationField(TriggerUIMetadataModel.Target target) {
        return target != null && "semantic".equals(target.via()) && "serviceAnnotationField".equals(target.kind());
    }

    private static JsonObject json(Object value) {
        return GSON.toJsonTree(value).getAsJsonObject();
    }

    private static void put(JsonObject object, String key, String value) {
        if (value != null) {
            object.addProperty(key, value);
        }
    }

    private static void put(JsonObject object, String key, Boolean value) {
        if (value != null) {
            object.addProperty(key, value);
        }
    }

    private static void putObject(JsonObject object, String key, Object value) {
        if (value != null) {
            object.add(key, GSON.toJsonTree(value));
        }
    }

    private static String string(JsonObject object, String key) {
        JsonElement value = object == null ? null : object.get(key);
        return value == null || value.isJsonNull() || !value.isJsonPrimitive() ? null : value.getAsString();
    }

    private static void replace(JsonObject target, JsonObject source) {
        List<String> keys = new ArrayList<>(target.keySet());
        keys.forEach(target::remove);
        source.entrySet().forEach(entry -> target.add(entry.getKey(), entry.getValue()));
    }

    private static final class Index {
        private final Map<String, TriggerMetadataModel.Listener> l1Listeners = new LinkedHashMap<>();
        private final Map<String, TriggerMetadataModel.ServiceType> l1Services = new LinkedHashMap<>();
        private final Map<String, TriggerMetadataModel.Annotation> l1Annotations = new LinkedHashMap<>();
        private final Map<String, TriggerMetadataModel.ServiceType.HandlerOption> l1Handlers = new LinkedHashMap<>();
        private final Map<String, TriggerMetadataModel.ServiceType.Param> l1Params = new LinkedHashMap<>();
        private final Map<String, JsonObject> runtimeListeners = new LinkedHashMap<>();
        private final Map<String, JsonObject> runtimeServices = new LinkedHashMap<>();

        private Index(TriggerMetadataModel l1, JsonObject runtime) {
            if (l1.listeners() != null) {
                l1.listeners().forEach(listener -> l1Listeners.put(listener.id(), listener));
            }
            if (l1.annotations() != null) {
                l1.annotations().forEach(annotation -> l1Annotations.put(annotation.id(), annotation));
            }
            if (l1.serviceTypes() != null) {
                for (TriggerMetadataModel.ServiceType service : l1.serviceTypes()) {
                    l1Services.put(service.id(), service);
                    if (service.handlers() != null && service.handlers().options() != null) {
                        for (TriggerMetadataModel.ServiceType.HandlerOption handler : service.handlers().options()) {
                            l1Handlers.put(handler.id(), handler);
                            if (handler.params() != null) {
                                handler.params().forEach(param -> l1Params.put(param.id(), param));
                            }
                        }
                    }
                }
            }
            if (runtime.has("listeners")) {
                for (JsonElement item : runtime.getAsJsonArray("listeners")) {
                    JsonObject listener = item.getAsJsonObject();
                    String name = string(listener, "name");
                    runtimeListeners.put(name, listener);
                    runtimeListeners.put(simpleName(name), listener);
                }
            }
            if (runtime.has("serviceTypes")) {
                for (JsonElement item : runtime.getAsJsonArray("serviceTypes")) {
                    JsonObject service = item.getAsJsonObject();
                    String name = string(service, "name");
                    runtimeServices.put(name, service);
                    runtimeServices.put(simpleName(name), service);
                }
            }
        }

        private JsonObject listener(TriggerUIMetadataModel.Target target) {
            TriggerMetadataModel.Listener listener = target == null ? null : l1Listeners.get(target.id());
            String name = listener == null || listener.type() == null ? null : listener.type().name();
            return runtimeListeners.get(simpleName(name));
        }

        private TriggerMetadataModel.Listener l1Listener(TriggerUIMetadataModel.Target target) {
            return target == null ? null : l1Listeners.get(target.id());
        }

        private JsonObject serviceType(TriggerUIMetadataModel.Target target) {
            TriggerMetadataModel.ServiceType service = target == null ? null : l1Services.get(target.id());
            String name = service == null || service.type() == null ? null : service.type().name();
            return runtimeServices.get(simpleName(name));
        }

        private TriggerMetadataModel.Annotation annotation(String id) {
            return l1Annotations.get(id);
        }

        private List<JsonObject> functions(JsonObject service, TriggerUIMetadataModel.Target target) {
            TriggerMetadataModel.ServiceType.HandlerOption handler =
                    target == null ? null : l1Handlers.get(target.id());
            String name = handler == null ? target == null ? null : target.name() : handler.name();
            List<JsonObject> matches = new ArrayList<>();
            for (String key : List.of("functions", "schemaFunctions")) {
                if (!service.has(key)) {
                    continue;
                }
                for (JsonElement item : service.getAsJsonArray(key)) {
                    JsonObject function = item.getAsJsonObject();
                    if (("*".equals(name) && Boolean.TRUE.equals(bool(function, "nameEditable")))
                            || name != null && name.equals(string(function, "name"))) {
                        matches.add(function);
                    }
                }
            }
            return matches;
        }

        private JsonObject parameter(JsonArray params, TriggerUIMetadataModel.Target target, int ordinal) {
            TriggerMetadataModel.ServiceType.Param param = target == null ? null : l1Params.get(target.id());
            String name = param == null ? target == null ? null : target.name() : param.name();
            for (JsonElement item : params) {
                JsonObject candidate = item.getAsJsonObject();
                if (name != null && (name.equals(string(candidate, "name"))
                        || candidate.has("name") && candidate.get("name").isJsonObject()
                        && name.equals(string(candidate.getAsJsonObject("name"), "value")))) {
                    return candidate;
                }
            }
            // A semantic target can describe the logical parameter name while the compiler's
            // concrete parameter name is connector-specific. L2 lists handler parameters in
            // declaration order, so the ordinal is an unambiguous fallback after identity lookup.
            if (ordinal >= 0 && ordinal < params.size()) {
                return params.get(ordinal).getAsJsonObject();
            }
            return null;
        }

        private static Boolean bool(JsonObject object, String key) {
            JsonElement value = object.get(key);
            return value == null || value.isJsonNull() ? null : value.getAsBoolean();
        }

        private static String simpleName(String value) {
            if (value == null) {
                return null;
            }
            int colon = value.lastIndexOf(':');
            return colon < 0 ? value : value.substring(colon + 1);
        }
    }
}
