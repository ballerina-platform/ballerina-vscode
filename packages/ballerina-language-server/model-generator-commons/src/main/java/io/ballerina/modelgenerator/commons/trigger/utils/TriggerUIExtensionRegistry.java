/* Copyright (c) 2026, WSO2 LLC. Licensed under the Apache License, Version 2.0. */
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
