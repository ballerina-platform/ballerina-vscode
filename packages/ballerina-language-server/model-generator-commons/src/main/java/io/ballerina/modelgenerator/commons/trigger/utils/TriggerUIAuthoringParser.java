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
package io.ballerina.modelgenerator.commons.trigger.utils;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import io.ballerina.modelgenerator.commons.trigger.models.TriggerUIMetadataModel;

/** Parses the canonical v1.0 authoring syntax and normalizes it to the compiler model. */
public final class TriggerUIAuthoringParser {
    private static final Gson GSON = new Gson();
    private TriggerUIAuthoringParser() { }

    public static TriggerUIMetadataModel parse(String json) {
        JsonElement element = JsonParser.parseString(json);
        if (!element.isJsonObject()) {
            throw new IllegalArgumentException("Trigger UI metadata must be a JSON object");
        }
        return GSON.fromJson(normalize(element.getAsJsonObject()), TriggerUIMetadataModel.class);
    }

    /** Converts author-friendly discriminators and flattened source records to the internal overlay form. */
    public static JsonObject normalize(JsonObject root) {
        JsonObject copy = root.deepCopy();
        validateExtensions(copy);
        normalizeCollection(copy, "listeners");
        normalizeCollection(copy, "serviceTypes");
        JsonObject init = object(copy, "initForm");
        if (init != null) {
            normalizeCollection(init, "fields");
        }
        return copy;
    }

    private static void validateExtensions(JsonElement element) {
        if (element == null || element.isJsonNull()) {
            return;
        }
        if (element.isJsonArray()) {
            for (JsonElement child : element.getAsJsonArray()) {
                validateExtensions(child);
            }
            return;
        }
        if (!element.isJsonObject()) {
            return;
        }
        JsonObject object = element.getAsJsonObject();
        if (object.has("extensions") && object.get("extensions").isJsonObject()) {
            for (var entry : object.getAsJsonObject("extensions").entrySet()) {
                TriggerUIExtensionRegistry.validate(entry.getKey(), entry.getValue());
            }
        }
        for (var entry : object.entrySet()) {
            validateExtensions(entry.getValue());
        }
    }

    private static void normalizeCollection(JsonObject parent, String key) {
        JsonArray values = parent.has(key) && parent.get(key).isJsonArray() ? parent.getAsJsonArray(key) : null;
        if (values == null) {
            return;
        }
        for (JsonElement value : values) {
            if (value.isJsonObject()) {
                normalizeNode(value.getAsJsonObject(), key);
            }
        }
    }

    private static void normalizeNode(JsonObject node, String context) {
        normalizeTarget(node);
        normalizeSource(node);
        // Canonical entries inline contextual records. Keep the internal names only at the boundary.
        if ("listeners".equals(context) && !node.has("listener") && hasAny(node, "form", "formFields",
                "serviceProperties", "enabledByDefault")) {
            move(node, "listener", "form", "formFields", "serviceProperties", "enabledByDefault");
        }
        if (node.has("listener") && node.get("listener").isJsonObject()) {
            normalizeNode(node.getAsJsonObject("listener"), "listener");
        }
        if ("serviceTypes".equals(context) && !node.has("service") && hasAny(node, "name", "description",
                "properties")) {
            move(node, "service", "name", "description", "properties");
        }
        if (node.has("service") && node.get("service").isJsonObject()) {
            normalizeNode(node.getAsJsonObject("service"), "service");
        }
        if ("handlers".equals(context) && !node.has("function") && hasAny(node, "name", "included", "repeatable",
                "layout", "documentation", "canAddParameters", "nameMetadata")) {
            move(node, "function", "included", "name", "nameEditable", "nameMetadata", "repeatable",
                    "canAddParameters", "variantLabel", "group", "documentation", "layout", "properties");
        }
        if (node.has("function") && node.get("function").isJsonObject()) {
            normalizeNode(node.getAsJsonObject("function"), "function");
        }
        if (!node.has("field") && ("fields".equals(context) || "parameters".equals(context)
                || "parameterSchema".equals(context) || "returnType".equals(context)
                || "choices".equals(context)) && hasAny(node,
                "key", "metadata", "source", "state", "placeholder", "default", "widget", "items", "choices",
                "properties", "validations", "binding", "literal")) {
            JsonObject field = new JsonObject();
            String[] names = {"key", "metadata", "placeholder", "default", "widget", "items", "choices",
                    "properties", "validations", "binding", "state", "source", "literal"};
            for (String name : names) {
                if (node.has(name)) {
                    field.add(name, node.remove(name));
                }
            }
            node.add("field", field);
        }
        normalizeNested(node, "fields");
        normalizeNested(node, "handlers");
        normalizeNested(node, "parameters");
        normalizeNested(node, "parameterSchema");
        normalizeMap(node, "formFields");
        normalizeMap(node, "serviceProperties");
        normalizeMap(node, "properties");
        if (node.has("returnType") && node.get("returnType").isJsonObject()) {
            normalizeNode(node.getAsJsonObject("returnType"), "returnType");
        }
        JsonObject field = object(node, "field");
        if (field != null) {
            normalizeField(field);
        }
        normalizeWidget(node);
    }

    private static void normalizeNested(JsonObject node, String key) {
        if (!node.has(key)) {
            return;
        }
        JsonElement e = node.get(key);
        if (e.isJsonArray()) {
            for (JsonElement child : e.getAsJsonArray()) {
                if (child.isJsonObject()) {
                    normalizeNode(child.getAsJsonObject(), key);
                }
            }
        }
    }
    private static void normalizeMap(JsonObject node, String key) {
        JsonObject map = object(node, key);
        if (map == null) {
            return;
        }
        for (var entry : map.entrySet()) {
            if (entry.getValue().isJsonObject()) {
                JsonObject child = entry.getValue().getAsJsonObject();
                if (!child.has("key")) {
                    child.addProperty("key", entry.getKey());
                }
                normalizeField(child);
            }
        }
    }

    /** Normalizes a field stored as a map value; map values are fields directly, not wrapped nodes. */
    private static void normalizeField(JsonObject field) {
        normalizeSource(field);
        normalizeWidget(field);
        normalizeNestedFields(field, "choices");
        normalizeMap(field, "properties");
    }

    private static void normalizeNestedFields(JsonObject node, String key) {
        if (!node.has(key) || !node.get(key).isJsonArray()) {
            return;
        }
        for (JsonElement child : node.getAsJsonArray(key)) {
            if (child.isJsonObject()) {
                normalizeField(child.getAsJsonObject());
            }
        }
    }
    private static void normalizeTarget(JsonObject node) {
        if (!node.has("target")) {
            return;
        }
        JsonElement target = node.get("target");
        if (target.isJsonPrimitive() && target.getAsJsonPrimitive().isString()) {
            JsonObject t = new JsonObject();
            t.addProperty("via", "l1");
            t.addProperty("id", target.getAsString());
            node.add("target", t);
        } else if (target.isJsonObject() && !target.getAsJsonObject().has("via")) {
            JsonObject t = target.getAsJsonObject(); t.addProperty("via", "semantic");
            if (t.has("owner") && !t.has("path") && t.has("kind")
                    && "recordField".equals(t.get("kind").getAsString())) {
                t.addProperty("path", "type");
            }
        }
    }
    private static void normalizeSource(JsonObject node) {
        if (!node.has("source") || !node.get("source").isJsonObject()) {
            return;
        }
        JsonObject source = node.getAsJsonObject("source");
        if (source.has("construct") || source.has("argument") || source.has("module")
                || source.has("value") || source.has("payload")) {
            JsonObject codedata = source.has("codedata") && source.get("codedata").isJsonObject()
                    ? source.getAsJsonObject("codedata") : new JsonObject();
            copy(source, "construct", "kind", codedata, "type");
            copy(source, "argument", "kind", codedata, "argType");
            copy(source, "argument", "position", codedata, "position");
            copy(source, "argument", "originalName", codedata, "originalName");
            copy(source, "argument", "targetParam", codedata, "targetParam");
            copy(source, "module", "name", codedata, "moduleName");
            copy(source, "module", "org", codedata, "orgName");
            copy(source, "module", "packageName", codedata, "packageName");
            copy(source, "value", "kind", codedata, "valueKind");
            copy(source, "value", "literal", codedata, "value");
            copy(source, "value", "qualifier", codedata, "valueQualifier");
            copy(source, "value", "preserve", codedata, "preserveValue");
            for (String key : new String[]{"defaultType", "boundType", "template", "typeConstraint", "modifier",
                    "supersedes", "modifiers"}) {
                copy(source, "payload", key, codedata, key);
            }
            for (var entry : source.entrySet()) {
                String key = entry.getKey();
                if (!java.util.Set.of("construct", "argument", "module", "value", "payload", "codedata",
                        "extensions").contains(key) && !codedata.has(key)) {
                    codedata.add(key, entry.getValue());
                }
            }
            source.add("codedata", codedata);
            node.add("source", source);
            return;
        }
        if (!source.has("codedata")) {
            JsonObject codedata = source.deepCopy();
            JsonElement extensions = codedata.remove("extensions");
            source = new JsonObject();
            source.add("codedata", codedata);
            if (extensions != null) {
                source.add("extensions", extensions);
            }
            node.add("source", source);
        }
    }
    private static void copy(JsonObject source, String group, String key, JsonObject target, String targetKey) {
        if (source.has(group) && source.get(group).isJsonObject() && source.getAsJsonObject(group).has(key)) {
            target.add(targetKey, source.getAsJsonObject(group).get(key));
        }
    }
    private static void normalizeWidget(JsonObject node) {
        if (!node.has("widget") || !node.get("widget").isJsonObject()) {
            return;
        }
        JsonObject widget = node.getAsJsonObject("widget");
        if (widget.has("alternatives") && !widget.has("overrides")) {
            widget.add("overrides", widget.remove("alternatives"));
            if (widget.has("selectedIndex")) {
                int selected = widget.remove("selectedIndex").getAsInt();
                JsonArray a = widget.getAsJsonArray("overrides");
                for (int i = 0; i < a.size(); i++) {
                    if (a.get(i).isJsonObject()) {
                        a.get(i).getAsJsonObject().addProperty("selected", i == selected);
                    }
                }
            }
        }
        if (widget.has("widgetKind")) {
            JsonObject policy = new JsonObject();
            policy.add("overrides", new JsonArray());
            policy.getAsJsonArray("overrides").add(widget);
            node.add("widget", policy);
        }
    }
    private static boolean hasAny(JsonObject o, String... keys) {
        for (String k : keys) {
            if (o.has(k)) {
                return true;
            }
        }
        return false;
    }

    private static void move(JsonObject o, String target, String... keys) {
        JsonObject n = new JsonObject();
        for (String k : keys) {
            if (o.has(k)) {
                n.add(k, o.remove(k));
            }
        }
        o.add(target, n);
    }

    private static JsonObject object(JsonObject o, String key) {
        return o.has(key) && o.get(key).isJsonObject() ? o.getAsJsonObject(key) : null;
    }
}
