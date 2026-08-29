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
import com.google.gson.GsonBuilder;
import com.google.gson.JsonDeserializer;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.reflect.TypeToken;
import io.ballerina.modelgenerator.commons.trigger.models.TriggerMetadataModel;
import io.ballerina.modelgenerator.commons.trigger.models.TypeRef;

import java.lang.reflect.Type;
import java.util.ArrayList;
import java.util.List;

/**
 * The {@link Gson} instance for {@link TriggerMetadataModel}. Hand-parses {@link TypeRef} trees
 * (recursively, since {@code elementType}/{@code completionType} nest) instead of using Gson's record
 * reflection -- reentering the deserialization context mid-populate corrupts its record buffer.
 *
 * @since 1.10.0
 */
public final class TriggerMetadataGson {

    private static final Type TYPE_REF_LIST = new TypeToken<List<TypeRef>>() { }.getType();
    private static final Gson PACKAGE_INFO_GSON = new Gson();

    private static final JsonDeserializer<List<TypeRef>> TYPE_REF_LIST_DESERIALIZER =
            (json, type, ctx) -> parseTypeRefList(json);
    private static final JsonDeserializer<TypeRef> TYPE_REF_DESERIALIZER =
            (json, type, ctx) -> parseTypeRef(json);

    private static final Gson INSTANCE = new GsonBuilder()
            .registerTypeAdapter(TYPE_REF_LIST, TYPE_REF_LIST_DESERIALIZER)
            .registerTypeAdapter(TypeRef.class, TYPE_REF_DESERIALIZER)
            .create();

    private TriggerMetadataGson() {
    }

    public static Gson instance() {
        return INSTANCE;
    }

    private static List<TypeRef> parseTypeRefList(JsonElement json) {
        if (json == null || json.isJsonNull()) {
            return null;
        }
        if (json.isJsonArray()) {
            List<TypeRef> result = new ArrayList<>();
            for (JsonElement element : json.getAsJsonArray()) {
                result.add(parseTypeRef(element));
            }
            return result;
        }
        return List.of(parseTypeRef(json));
    }

    private static TypeRef parseTypeRef(JsonElement json) {
        if (json == null || json.isJsonNull()) {
            return null;
        }
        JsonObject obj = json.getAsJsonObject();
        String name = asString(obj, "name");
        TypeRef.PackageInfo packageInfo =
                PACKAGE_INFO_GSON.fromJson(member(obj, "packageInfo"), TypeRef.PackageInfo.class);
        Boolean builtin = asBoolean(obj, "builtin");
        Boolean subtypeFamily = asBoolean(obj, "subtypeFamily");
        String shape = asString(obj, "shape");
        List<TypeRef> elementType = parseTypeRefList(member(obj, "elementType"));
        List<TypeRef> completionType = parseTypeRefList(member(obj, "completionType"));
        return new TypeRef(name, packageInfo, builtin, subtypeFamily, shape, elementType, completionType);
    }

    /**
     * The member under {@code key}, or {@code null} when it is absent <em>or</em> explicitly
     * {@code null} -- {@code has} alone is true for {@code "key": null}, whose accessors then throw an
     * {@link UnsupportedOperationException} that no {@code JsonParseException} handler would catch.
     */
    private static JsonElement member(JsonObject obj, String key) {
        JsonElement element = obj.get(key);
        return element == null || element.isJsonNull() ? null : element;
    }

    private static String asString(JsonObject obj, String key) {
        JsonElement element = member(obj, key);
        return element == null ? null : element.getAsString();
    }

    private static Boolean asBoolean(JsonObject obj, String key) {
        JsonElement element = member(obj, key);
        return element == null ? null : element.getAsBoolean();
    }
}
