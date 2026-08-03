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
import com.google.gson.JsonParseException;
import com.google.gson.reflect.TypeToken;
import com.google.gson.stream.JsonReader;
import io.ballerina.modelgenerator.commons.trigger.models.TriggerArtifactModel;

import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.lang.reflect.Type;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.Optional;

/**
 * Reads the LS's bundled {@code trigger-artifact} metadata for its hardcoded entry-point modules — a
 * small, display-only sibling of {@code trigger-ui-schema.json}, keyed by module name. Only the LS's
 * own bundled classpath resource is consulted (a non-bundled connector has no metadata); this makes the
 * lookup safe to call from hot paths such as project-tree / artifact-tree generation.
 *
 * @since 1.9.0
 */
public final class TriggerArtifactReader {

    private static final String BUNDLED_RESOURCE = "bundled_trigger_artifact.json";
    private static final Type BUNDLED_METADATA_TYPE = new TypeToken<Map<String, TriggerArtifactModel>>() { }
            .getType();

    private static final TriggerArtifactReader INSTANCE = new TriggerArtifactReader();

    private final Map<String, TriggerArtifactModel> bundledMetadata = loadBundledMetadata();

    private TriggerArtifactReader() {
    }

    public static TriggerArtifactReader getInstance() {
        return INSTANCE;
    }

    private static Map<String, TriggerArtifactModel> loadBundledMetadata() {
        try (InputStream is = TriggerArtifactReader.class.getClassLoader().getResourceAsStream(BUNDLED_RESOURCE)) {
            if (is == null) {
                return Map.of();
            }
            try (JsonReader reader = new JsonReader(new InputStreamReader(is, StandardCharsets.UTF_8))) {
                Map<String, TriggerArtifactModel> loaded = new Gson().fromJson(reader, BUNDLED_METADATA_TYPE);
                return loaded == null ? Map.of() : Map.copyOf(loaded);
            }
        } catch (IOException | JsonParseException e) {
            return Map.of();
        }
    }

    /** Whether bundled trigger metadata is known for {@code moduleName}. A cheap map lookup. */
    public boolean isBundled(String moduleName) {
        return moduleName != null && bundledMetadata.containsKey(moduleName);
    }

    /** The bundled trigger metadata for {@code moduleName}, if any. */
    public Optional<TriggerArtifactModel> getBundledMetadata(String moduleName) {
        return moduleName == null ? Optional.empty() : Optional.ofNullable(bundledMetadata.get(moduleName));
    }
}
