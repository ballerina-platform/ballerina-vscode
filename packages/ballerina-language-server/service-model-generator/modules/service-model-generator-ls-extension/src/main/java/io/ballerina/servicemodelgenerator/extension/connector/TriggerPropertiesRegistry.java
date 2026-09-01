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
import com.google.gson.reflect.TypeToken;
import com.google.gson.stream.JsonReader;
import io.ballerina.servicemodelgenerator.extension.model.TriggerProperty;

import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.lang.reflect.Type;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

/**
 * The single loader of {@code trigger_properties.json}, shared by {@code ServiceModelGeneratorService}
 * (the trigger picker) and {@link ConnectorUpgradeAdvisor} (the min-supported-version check), so the
 * Gson/classpath-read boilerplate exists exactly once.
 *
 * @since 1.3.0
 */
public final class TriggerPropertiesRegistry {

    private static final String RESOURCE_NAME = "trigger_properties.json";
    private static final Type PROPERTY_MAP_TYPE = new TypeToken<Map<String, TriggerProperty>>() { }.getType();

    private static final TriggerPropertiesRegistry INSTANCE = new TriggerPropertiesRegistry();

    private final Map<String, TriggerProperty> byId;
    /** Keyed by {@code orgName + "/" + packageName}, the identity a resolved dependency is known by. */
    private final Map<String, TriggerProperty> byModule;

    private TriggerPropertiesRegistry() {
        this.byId = load();
        Map<String, TriggerProperty> moduleIndex = new HashMap<>();
        for (TriggerProperty property : byId.values()) {
            if (property.orgName() != null && property.packageName() != null) {
                moduleIndex.put(property.orgName() + "/" + property.packageName(), property);
            }
        }
        this.byModule = Map.copyOf(moduleIndex);
    }

    public static TriggerPropertiesRegistry getInstance() {
        return INSTANCE;
    }

    /**
     * The full id-keyed registry, exactly as {@code trigger_properties.json} declares it -- iteration
     * order matches the file's own entry order (the trigger picker's display order), preserved via
     * {@link LinkedHashMap} rather than {@code Map.copyOf}, whose iteration order is explicitly
     * unspecified per its Javadoc.
     */
    public Map<String, TriggerProperty> byId() {
        return byId;
    }

    /** The entry for {@code orgName/packageName}, if this connector is in the trigger picker at all. */
    public Optional<TriggerProperty> forModule(String orgName, String packageName) {
        if (orgName == null || packageName == null) {
            return Optional.empty();
        }
        return Optional.ofNullable(byModule.get(orgName + "/" + packageName));
    }

    private static Map<String, TriggerProperty> load() {
        InputStream stream = TriggerPropertiesRegistry.class.getClassLoader().getResourceAsStream(RESOURCE_NAME);
        if (stream == null) {
            return Map.of();
        }
        try (JsonReader reader = new JsonReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            Map<String, TriggerProperty> loaded = new Gson().fromJson(reader, PROPERTY_MAP_TYPE);
            return loaded == null ? Map.of() : Collections.unmodifiableMap(new LinkedHashMap<>(loaded));
        } catch (IOException e) {
            return Map.of();
        }
    }
}
