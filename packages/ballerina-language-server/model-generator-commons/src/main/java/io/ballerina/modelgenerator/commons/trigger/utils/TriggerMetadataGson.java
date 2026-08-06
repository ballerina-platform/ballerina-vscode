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
import com.google.gson.JsonArray;
import com.google.gson.JsonDeserializationContext;
import com.google.gson.JsonDeserializer;
import com.google.gson.JsonElement;
import com.google.gson.JsonParseException;
import com.google.gson.reflect.TypeToken;
import io.ballerina.modelgenerator.commons.trigger.models.TriggerMetadataModel;
import io.ballerina.modelgenerator.commons.trigger.models.TypeRef;

import java.lang.reflect.Type;
import java.util.ArrayList;
import java.util.List;

/**
 * The {@link Gson} instance for deserializing a {@code trigger-metadata.json} document into a
 * {@link TriggerMetadataModel}. Registers an adapter that normalizes a type-or-union slot (a bare
 * object for the single case, a JSON array for the union) onto {@code List<TypeRef>}, so every such
 * field in the model shares one rule.
 *
 * @since 1.10.0
 */
public final class TriggerMetadataGson {

    private static final Type TYPE_REF_LIST = new TypeToken<List<TypeRef>>() { }.getType();

    // Separate Gson instance: reentering INSTANCE's own adapter graph via JsonDeserializationContext
    // while an ancestor record is still mid-populate corrupts Gson's per-adapter record buffer
    // (observed as a ClassCastException between TypeRef and TypeRef[]).
    private static final Gson TYPE_REF_GSON = new Gson();

    private static final Gson INSTANCE = new GsonBuilder()
            .registerTypeAdapter(TYPE_REF_LIST, new TypeRefListDeserializer())
            .create();

    private TriggerMetadataGson() {
    }

    /** The shared, preconfigured {@link Gson} instance for {@code trigger-metadata.json} documents. */
    public static Gson instance() {
        return INSTANCE;
    }

    /**
     * Normalizes a {@code TypeRef}-or-union slot onto {@code List<TypeRef>}: a bare JSON object
     * deserializes to a singleton list; a JSON array deserializes element-by-element as
     * {@link TypeRef}. Leaves are parsed via {@link #TYPE_REF_GSON} rather than the deserialization
     * {@code context} -- see that field's doc comment for why.
     */
    private static final class TypeRefListDeserializer implements JsonDeserializer<List<TypeRef>> {

        @Override
        public List<TypeRef> deserialize(JsonElement json, Type typeOfT, JsonDeserializationContext context)
                throws JsonParseException {
            if (json == null || json.isJsonNull()) {
                return null;
            }
            if (json.isJsonArray()) {
                JsonArray array = json.getAsJsonArray();
                List<TypeRef> result = new ArrayList<>(array.size());
                for (JsonElement element : array) {
                    result.add(TYPE_REF_GSON.fromJson(element, TypeRef.class));
                }
                return result;
            }
            return List.of(TYPE_REF_GSON.fromJson(json, TypeRef.class));
        }
    }
}
