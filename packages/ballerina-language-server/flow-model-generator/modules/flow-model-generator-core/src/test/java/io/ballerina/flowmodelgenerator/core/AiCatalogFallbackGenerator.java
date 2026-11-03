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

package io.ballerina.flowmodelgenerator.core;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import io.ballerina.flowmodelgenerator.core.AiComponentDiskCache.CachedComponent;
import io.ballerina.modelgenerator.commons.ModuleInfo;

import java.io.IOException;
import java.io.Reader;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.logging.Logger;

/**
 * Fills in the components of the AI catalog bundled with the LS, for every module version the catalog can select.
 * Runs as the {@code generateAiCatalogFallback} Gradle task, through {@code scripts/update_ai_catalog_fallback.py}.
 *
 * @since 1.7.0
 */
public final class AiCatalogFallbackGenerator {

    private static final Logger LOGGER = Logger.getLogger(AiCatalogFallbackGenerator.class.getName());
    private static final Path CATALOG = Paths.get("src", "main", "resources", AiUtils.CATALOG_FALLBACK_FILE);

    private AiCatalogFallbackGenerator() {
    }

    public static void main(String[] args) throws IOException {
        Gson gson = new GsonBuilder().setPrettyPrinting().disableHtmlEscaping().create();
        AiUtils.CatalogFallback catalog;
        try (Reader reader = Files.newBufferedReader(CATALOG, StandardCharsets.UTF_8)) {
            catalog = gson.fromJson(reader, AiUtils.CatalogFallback.class);
        }
        Map<String, List<CachedComponent>> existing = Objects.requireNonNullElse(catalog.components(), Map.of());

        Map<String, List<CachedComponent>> components = new TreeMap<>();
        Set<String> failed = new TreeSet<>();
        for (AiUtils.Module module : selectableModules(catalog.modules())) {
            String key = AiUtils.componentKey(module.org(), module.name(), module.version());
            Optional.ofNullable(existing.get(key))
                    .or(() -> AiUtils.scanModule(
                            new ModuleInfo(module.org(), module.name(), module.name(), module.version())))
                    .ifPresentOrElse(found -> components.put(key, found), () -> failed.add(key));
        }

        try (Writer writer = Files.newBufferedWriter(CATALOG, StandardCharsets.UTF_8)) {
            gson.toJson(new AiUtils.CatalogFallback(catalog.modules(), components), writer);
            writer.write("\n");
        }
        if (!failed.isEmpty()) {
            LOGGER.severe("Could not scan " + failed.size() + " module versions: " + failed);
        }
        // The compiler leaves non-daemon threads behind, which would keep the JVM alive.
        System.exit(failed.isEmpty() ? 0 : 1);
    }

    private static Set<AiUtils.Module> selectableModules(Map<String, List<AiUtils.Module>> modules) {
        Set<AiUtils.Module> selectable = new LinkedHashSet<>();
        for (String aiVersion : modules.keySet()) {
            selectable.addAll(AiUtils.latestCompatibleModules(aiVersion, modules));
        }
        return selectable;
    }
}
