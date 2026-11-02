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

package io.ballerina.servicemodelgenerator.extension.settings;

import com.google.gson.Gson;
import com.google.gson.JsonParseException;
import com.google.gson.stream.JsonReader;

import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * The curated service settings of each service module, read from {@code service-settings/<module>.json}.
 *
 * <p>
 * A curated setting is a field of the module's service config annotation that the designer edits with an editor of
 * its own. Supporting another service type, or another field, is a change to these resources rather than to code.
 * </p>
 */
public final class ServiceSettingDescriptors {

    private static final String LOCATION = "service-settings/%s.json";
    private static final Map<String, Optional<Definition>> CACHE = new ConcurrentHashMap<>();

    private ServiceSettingDescriptors() {
    }

    /**
     * The settings of one service module.
     *
     * @param annotation the service config annotation the settings are fields of, such as {@code ServiceConfig}
     * @param settings   the curated fields, in the order the designer lists them
     */
    public record Definition(String annotation, List<Descriptor> settings) {
    }

    /**
     * One curated field.
     *
     * @param field        the field name in the annotation's record type
     * @param label        the name the designer shows
     * @param description  one line on what the field does
     * @param editorKind   the editor the designer uses: {@code toggle}, {@code number}, {@code text} or a dedicated
     *                     kind such as {@code contextInit}
     * @param defaultValue the value the module uses when the field is absent, as a Ballerina expression; may be null
     * @param placeholder  an example value for an empty editor; may be null
     */
    public record Descriptor(String field, String label, String description, String editorKind, String defaultValue,
                             String placeholder) {
    }

    /**
     * The settings of the given module, empty when the module has none.
     */
    public static Optional<Definition> forModule(String moduleName) {
        if (moduleName == null || !moduleName.matches("[A-Za-z0-9_.]+")) {
            return Optional.empty();
        }
        return CACHE.computeIfAbsent(moduleName, ServiceSettingDescriptors::load);
    }

    private static Optional<Definition> load(String moduleName) {
        InputStream stream = ServiceSettingDescriptors.class.getClassLoader()
                .getResourceAsStream(String.format(LOCATION, moduleName));
        if (stream == null) {
            return Optional.empty();
        }
        try (JsonReader reader = new JsonReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            Definition definition = new Gson().fromJson(reader, Definition.class);
            if (definition == null || definition.annotation() == null || definition.settings() == null) {
                return Optional.empty();
            }
            return Optional.of(definition);
        } catch (IOException | JsonParseException e) {
            return Optional.empty();
        }
    }
}
