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

import com.google.gson.JsonElement;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/** Registry for connector-specific, namespaced authoring extensions. */
public final class TriggerUIExtensionRegistry {
    @FunctionalInterface public interface Validator { void validate(JsonElement payload); }
    @FunctionalInterface public interface Compiler { JsonElement compile(JsonElement payload); }
    private static final Map<String, Entry> ENTRIES = new ConcurrentHashMap<>();
    private TriggerUIExtensionRegistry() { }
    public static void register(String id, Validator validator, Compiler compiler) {
        if (id == null || !id.matches("[A-Za-z0-9_.-]+:[A-Za-z0-9_.-]+")) {
            throw new IllegalArgumentException("Extension identifiers must be namespaced: " + id);
        }
        ENTRIES.put(id, new Entry(validator, compiler));
    }
    public static void validate(String id, JsonElement payload) {
        Entry entry = ENTRIES.get(id);
        if (entry == null) {
            throw new IllegalArgumentException("Unsupported trigger UI extension: " + id);
        }
        if (entry.validator != null) {
            entry.validator.validate(payload);
        }
    }
    public static JsonElement compile(String id, JsonElement payload) {
        validate(id, payload);
        return ENTRIES.get(id).compiler == null ? payload : ENTRIES.get(id).compiler.compile(payload);
    }
    private record Entry(Validator validator, Compiler compiler) { }
}
