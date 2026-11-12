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

package io.ballerina.flowmodelgenerator.core.copilot.model;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonSerializationContext;
import com.google.gson.JsonSerializer;

import java.lang.reflect.Type;
import java.util.List;

/**
 * Utility class to convert model POJOs to JSON at the API boundary.
 *
 * @since 1.7.0
 */
public class ModelToJsonConverter {

    private static final Gson GSON = new GsonBuilder()
            .registerTypeAdapter(Library.class, new LibrarySerializer())
            .create();

    private ModelToJsonConverter() {
        // Prevent instantiation
    }

    /**
     * Converts a list of libraries to JsonArray.
     *
     * @param libraries the list of libraries
     * @return JsonArray representation
     */
    public static JsonArray librariesToJson(List<Library> libraries) {
        JsonArray result = new JsonArray();
        for (Library library : libraries) {
            result.add(libraryToJson(library));
        }
        return result;
    }

    /**
     * Converts a single library to JsonElement.
     *
     * @param library the library
     * @return JsonElement representation
     */
    public static JsonElement libraryToJson(Library library) {
        return GSON.toJsonTree(library);
    }

    /**
     * Custom serializer for Library that omits null and empty collections.
     */
    private static class LibrarySerializer implements JsonSerializer<Library> {
        @Override
        public JsonElement serialize(Library library, Type typeOfSrc, JsonSerializationContext context) {
            JsonObject json = new JsonObject();

            // Always include name and description
            if (library.getName() != null) {
                json.addProperty("name", library.getName());
            }
            if (library.getDescription() != null) {
                json.addProperty("description", library.getDescription());
            }
            if (library.getInstructions() != null) {
                json.addProperty("instructions", library.getInstructions());
            }
            if (library.getReadme() != null) {
                json.addProperty("readme", library.getReadme());
            }
            if (library.getSiblingModules() != null && !library.getSiblingModules().isEmpty()) {
                json.add("siblingModules", context.serialize(library.getSiblingModules()));
            }

            // Always include collections (empty array if null or empty)
            json.add("typeDefs", library.getTypeDefs() != null
                    ? context.serialize(library.getTypeDefs()) : new JsonArray());
            json.add("clients", library.getClients() != null
                    ? context.serialize(library.getClients()) : new JsonArray());
            json.add("functions", library.getFunctions() != null
                    ? context.serialize(library.getFunctions()) : new JsonArray());
            json.add("services", library.getServices() != null
                    ? context.serialize(library.getServices()) : new JsonArray());
            json.add("annotations", library.getAnnotations() != null
                    ? context.serialize(library.getAnnotations()) : new JsonArray());

            return json;
        }
    }
}
