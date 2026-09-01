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
import io.ballerina.modelgenerator.commons.trigger.models.TriggerUISchemaModel;
import io.ballerina.servicemodelgenerator.extension.util.ModuleAliasResolver;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Normalizes a {@link TriggerUISchemaModel} into a comparable JSON tree and diffs two such trees.
 * Shared by {@link TriggerUIMetadataGenerationTest} (a handful of connectors) and
 * {@link TriggerParityTest} (all 26 bundled connectors), so both read the same notion of "equal".
 *
 * <p>Content and container order are reported as separate gap kinds. {@code TriggerUIMetadataCompiler}
 * rebuilds {@code initProperties}/{@code serviceTypes}/{@code functions}/{@code parameters}/
 * {@code choices} from the L2 authoring order, so a single field reordered ahead of another would
 * otherwise surface as a value mismatch at every key in the container instead of the one thing that
 * actually changed.
 */
final class TriggerParityDiff {

    private static final Gson GSON = new Gson();

    /** Containers whose entry order is user-visible and tracked as its own {@code ORDER} gap. */
    private static final Set<String> ORDERED_MAP_KEYS = Set.of("initProperties");
    private static final Set<String> ORDERED_ARRAY_KEYS =
            Set.of("serviceTypes", "functions", "schemaFunctions", "parameters", "choices");

    private TriggerParityDiff() {
    }

    /**
     * One point of divergence between the expected (bundled) and actual (generated) runtime model.
     *
     * @param path   a JSONPath-ish label locating the divergence
     * @param kind   {@code MISSING}/{@code UNEXPECTED}/{@code VALUE}/{@code ARRAY_SIZE}/{@code ORDER}
     * @param detail a human-readable description included in allow-list equality, so a changed expected
     *               or actual value at the same path cannot pass against a stale baseline
     */
    record Gap(String path, String kind, String detail) {

        static Gap missing(String path, JsonElement expected) {
            return new Gap(path, "MISSING", "expected " + expected + " but it is absent");
        }

        static Gap unexpected(String path, JsonElement actual) {
            return new Gap(path, "UNEXPECTED", "found unexpected " + actual);
        }

        static Gap value(String path, JsonElement expected, JsonElement actual) {
            return new Gap(path, "VALUE", "expected " + expected + " but found " + actual);
        }

        static Gap arraySize(String path, int expectedSize, int actualSize) {
            return new Gap(path, "ARRAY_SIZE", "expected " + expectedSize + " elements but found " + actualSize);
        }

        static Gap order(String path, List<String> expectedOrder, List<String> actualOrder) {
            return new Gap(path, "ORDER", "expected order " + expectedOrder + " but found " + actualOrder);
        }
    }

    /**
     * Materializes the derived listener choice into {@code initProperties.listener} (mirroring
     * {@link TriggerModelReader#withDerivedListenerField}), drops identity noise ({@code id}, an
     * authoring-only {@code $comment}, a no-op {@code importPrefix}), and prunes blank values so a
     * bundled {@code null} and a generated {@code []}/{@code {}} read as equal. Deliberately keeps
     * {@code schemaVersion}/{@code orgName}/{@code packageName}/{@code moduleName}/{@code version}/
     * {@code icon}/{@code importStatements} in the tree -- those are real identity and derivation
     * checks, not comparison noise.
     */
    static JsonObject normalize(TriggerUISchemaModel model) {
        JsonObject root = GSON.toJsonTree(model).getAsJsonObject();
        if (model.listeners() != null && !model.listeners().isEmpty()
                && (!root.has("initProperties") || !root.getAsJsonObject("initProperties").has("listener"))) {
            ListenerChoiceDeriver.derive(model.listeners(), model.listenerKind(), model.listenerForm())
                    .ifPresent(listener -> {
                        JsonObject existing = root.has("initProperties")
                                ? root.getAsJsonObject("initProperties") : new JsonObject();
                        JsonObject ordered = new JsonObject();
                        ordered.add("listener", GSON.toJsonTree(listener));
                        existing.entrySet().forEach(entry -> ordered.add(entry.getKey(), entry.getValue()));
                        root.add("initProperties", ordered);
                    });
        }
        root.remove("listeners");
        root.remove("listenerForm");
        root.remove("id");
        root.remove("$comment");
        // triggerKind is the canonical spelling of the legacy kind. Legacy bundled models predate
        // the compatibility field, so an equal pair is not a semantic parity gap.
        if (root.has("triggerKind") && root.has("kind") && root.get("triggerKind").equals(root.get("kind"))) {
            root.remove("triggerKind");
        }
        String moduleName = model.moduleName() == null ? "" : model.moduleName();
        if (root.has("importPrefix") && root.get("importPrefix").isJsonPrimitive()
                && root.get("importPrefix").getAsString().equals(ModuleAliasResolver.selfPrefix(moduleName))) {
            root.remove("importPrefix");
        }
        pruneBlanks(root);
        return root;
    }

    private static void pruneBlanks(JsonElement element) {
        if (element.isJsonObject()) {
            JsonObject object = element.getAsJsonObject();
            List<String> blank = new ArrayList<>();
            for (Map.Entry<String, JsonElement> entry : object.entrySet()) {
                pruneBlanks(entry.getValue());
                if (isBlank(entry.getValue())) {
                    blank.add(entry.getKey());
                }
            }
            blank.forEach(object::remove);
        } else if (element.isJsonArray()) {
            element.getAsJsonArray().forEach(TriggerParityDiff::pruneBlanks);
        }
    }

    private static boolean isBlank(JsonElement value) {
        if (value == null || value.isJsonNull()) {
            return true;
        }
        if (value.isJsonPrimitive() && value.getAsJsonPrimitive().isString()) {
            return value.getAsString().isEmpty();
        }
        if (value.isJsonArray()) {
            return value.getAsJsonArray().isEmpty();
        }
        if (value.isJsonObject()) {
            return value.getAsJsonObject().isEmpty();
        }
        return false;
    }

    /** Recursively diffs two normalized trees. {@code path} is a JSONPath-ish label for reporting. */
    static List<Gap> compare(JsonElement expected, JsonElement actual, String path) {
        List<Gap> gaps = new ArrayList<>();
        compare(null, expected, actual, path, gaps);
        return gaps;
    }

    /** {@code key} is this element's own key in its parent object/array, used only to decide whether
     * this container's entry order is tracked ({@link #ORDERED_MAP_KEYS}/{@link #ORDERED_ARRAY_KEYS}). */
    private static void compare(String key, JsonElement expected, JsonElement actual, String path,
                                List<Gap> gaps) {
        boolean expectedBlank = expected == null || isBlank(expected);
        boolean actualBlank = actual == null || isBlank(actual);
        if (expectedBlank && actualBlank) {
            return;
        }
        if (expectedBlank) {
            gaps.add(Gap.unexpected(path, actual));
            return;
        }
        if (actualBlank) {
            gaps.add(Gap.missing(path, expected));
            return;
        }
        if (expected.isJsonObject() && actual.isJsonObject()) {
            compareObjects(key, expected.getAsJsonObject(), actual.getAsJsonObject(), path, gaps);
            return;
        }
        if (expected.isJsonArray() && actual.isJsonArray()) {
            compareArrays(key, expected.getAsJsonArray(), actual.getAsJsonArray(), path, gaps);
            return;
        }
        if (!expected.equals(actual)) {
            gaps.add(Gap.value(path, expected, actual));
        }
    }

    private static void compareObjects(String key, JsonObject expected, JsonObject actual, String path,
                                       List<Gap> gaps) {
        for (Map.Entry<String, JsonElement> entry : expected.entrySet()) {
            compare(entry.getKey(), entry.getValue(), actual.get(entry.getKey()),
                    path + "." + entry.getKey(), gaps);
        }
        for (String childKey : actual.keySet()) {
            if (!expected.has(childKey)) {
                compare(childKey, null, actual.get(childKey), path + "." + childKey, gaps);
            }
        }
        if (key != null && ORDERED_MAP_KEYS.contains(key)) {
            List<String> expectedShared = expected.keySet().stream().filter(actual::has).toList();
            List<String> actualShared = actual.keySet().stream().filter(expected::has).toList();
            if (!expectedShared.equals(actualShared)) {
                gaps.add(Gap.order(path, expectedShared, actualShared));
            }
        }
    }

    private static void compareArrays(String key, JsonArray expected, JsonArray actual, String path,
                                      List<Gap> gaps) {
        if (key == null || !ORDERED_ARRAY_KEYS.contains(key) || !allIdentifiable(expected)
                || !allIdentifiable(actual)) {
            comparePositionally(expected, actual, path, gaps);
            return;
        }
        Map<String, JsonElement> expectedByIdentity = byIdentity(expected);
        Map<String, JsonElement> actualByIdentity = byIdentity(actual);
        if (expectedByIdentity.size() != expected.size() || actualByIdentity.size() != actual.size()) {
            // A duplicate identity within one side defeats identity matching; fall back positionally.
            comparePositionally(expected, actual, path, gaps);
            return;
        }
        for (Map.Entry<String, JsonElement> entry : expectedByIdentity.entrySet()) {
            JsonElement actualElement = actualByIdentity.get(entry.getKey());
            if (actualElement == null) {
                gaps.add(Gap.missing(path + "[" + entry.getKey() + "]", entry.getValue()));
            } else {
                compare(null, entry.getValue(), actualElement, path + "[" + entry.getKey() + "]", gaps);
            }
        }
        for (Map.Entry<String, JsonElement> entry : actualByIdentity.entrySet()) {
            if (!expectedByIdentity.containsKey(entry.getKey())) {
                gaps.add(Gap.unexpected(path + "[" + entry.getKey() + "]", entry.getValue()));
            }
        }
        List<String> expectedShared = expectedByIdentity.keySet().stream()
                .filter(actualByIdentity::containsKey).toList();
        List<String> actualShared = actualByIdentity.keySet().stream()
                .filter(expectedByIdentity::containsKey).toList();
        if (!expectedShared.equals(actualShared)) {
            gaps.add(Gap.order(path, expectedShared, actualShared));
        }
    }

    private static void comparePositionally(JsonArray expected, JsonArray actual, String path, List<Gap> gaps) {
        if (expected.size() != actual.size()) {
            gaps.add(Gap.arraySize(path, expected.size(), actual.size()));
        }
        int shared = Math.min(expected.size(), actual.size());
        for (int i = 0; i < shared; i++) {
            compare(null, expected.get(i), actual.get(i), path + "[" + i + "]", gaps);
        }
        for (int i = shared; i < expected.size(); i++) {
            gaps.add(Gap.missing(path + "[" + i + "]", expected.get(i)));
        }
        for (int i = shared; i < actual.size(); i++) {
            gaps.add(Gap.unexpected(path + "[" + i + "]", actual.get(i)));
        }
    }

    /** Whether every element carries a usable identity (see {@link #identity}), so this array can be
     * matched by identity rather than position. */
    private static boolean allIdentifiable(JsonArray array) {
        for (JsonElement element : array) {
            if (identity(element) == null) {
                return false;
            }
        }
        return true;
    }

    private static Map<String, JsonElement> byIdentity(JsonArray array) {
        Map<String, JsonElement> byIdentity = new LinkedHashMap<>();
        for (JsonElement element : array) {
            byIdentity.put(identity(element), element);
        }
        return byIdentity;
    }

    /**
     * A stable identity for an array element, so two arrays of the same conceptually-named things can
     * be matched regardless of position. Covers {@code serviceTypes}/{@code functions}/
     * {@code schemaFunctions} (a bare string {@code name}) and {@code parameters} (a {@link
     * io.ballerina.modelgenerator.commons.trigger.models.TriggerUISchemaModel.Parameter#name} sub-node,
     * whose literal is under {@code name.value}) -- the same shape {@code TriggerUIMetadataCompiler}'s
     * own {@code Index} class matches L2 targets against. Returns {@code null} (no identity) for
     * {@code choices}, which are unnamed structural variants matched positionally instead.
     */
    private static String identity(JsonElement element) {
        if (!element.isJsonObject()) {
            return null;
        }
        JsonObject object = element.getAsJsonObject();
        JsonElement name = object.get("name");
        if (name == null) {
            return null;
        }
        if (name.isJsonPrimitive() && name.getAsJsonPrimitive().isString()) {
            return name.getAsString();
        }
        if (name.isJsonObject()) {
            JsonElement value = name.getAsJsonObject().get("value");
            if (value != null && value.isJsonPrimitive() && value.getAsJsonPrimitive().isString()) {
                return value.getAsString();
            }
        }
        return null;
    }
}
