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
import io.ballerina.flowmodelgenerator.core.model.NodeKind;

import java.io.IOException;
import java.io.Reader;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Disk-backed cache for AI component type information discovered from semantic model analysis.
 * <p>
 * For a given module version (e.g., {@code ballerinax/ai.openai@1.4.0}), the AI component types it exposes are
 * immutable. This cache persists the analysis results so that subsequent LS sessions can skip the expensive semantic
 * model loading and compilation step.
 * <p>
 * Cache files are stored as JSON in a temporary directory. On I/O failure, the cache degrades gracefully — the system
 * falls back to loading semantic models as before.
 *
 * @since 1.7.0
 */
class AiComponentDiskCache {

    private static final Logger LOGGER = Logger.getLogger(AiComponentDiskCache.class.getName());
    private static final int SCHEMA_VERSION = 2;
    private static final String CACHE_DIR_NAME = "ballerina-ls-ai-component-cache";

    private final Path cacheDirectory;
    private final Gson gson;
    private final AtomicBoolean diskAvailable;

    AiComponentDiskCache() {
        this(Path.of(System.getProperty("java.io.tmpdir"), CACHE_DIR_NAME));
    }

    AiComponentDiskCache(Path cacheDirectory) {
        this.cacheDirectory = cacheDirectory;
        this.gson = new Gson();
        this.diskAvailable = new AtomicBoolean(true);
    }

    /**
     * Loads cached component data for a module version.
     *
     * @param org     the module organization (e.g., "ballerinax")
     * @param name    the module name (e.g., "ai.openai")
     * @param version the module version (e.g., "1.4.0")
     * @return the cached components, or empty if not cached, corrupt, or schema mismatch
     */
    Optional<List<CachedComponent>> load(String org, String name, String version) {
        if (!diskAvailable.get() || version == null) {
            return Optional.empty();
        }
        try {
            Path file = cacheDirectory.resolve(toFileName(org, name, version));
            if (!Files.exists(file)) {
                return Optional.empty();
            }
            try (Reader reader = Files.newBufferedReader(file, StandardCharsets.UTF_8)) {
                ModuleCache moduleCache = gson.fromJson(reader, ModuleCache.class);
                if (moduleCache == null || moduleCache.schemaVersion != SCHEMA_VERSION
                        || moduleCache.components == null) {
                    return Optional.empty();
                }
                for (CachedComponent c : moduleCache.components) {
                    if (!isValid(c)) {
                        return Optional.empty();
                    }
                }
                return Optional.of(moduleCache.components);
            }
        } catch (IOException | RuntimeException e) {
            LOGGER.log(Level.FINE, "Failed to read AI component cache for " + org + ":" + name + ":" + version, e);
            return Optional.empty();
        }
    }

    /**
     * Saves component data for a module version to disk. Writes atomically via temp file + rename. Saves even if the
     * components list is empty (caches "no AI components found").
     *
     * @param org        the module organization
     * @param name       the module name
     * @param version    the module version
     * @param components the discovered components (may be empty)
     */
    void save(String org, String name, String version, List<CachedComponent> components) {
        if (!diskAvailable.get() || version == null) {
            return;
        }
        Path temp = null;
        try {
            Files.createDirectories(cacheDirectory);
            Path target = cacheDirectory.resolve(toFileName(org, name, version));
            temp = Files.createTempFile(cacheDirectory, "tmp_", ".json");
            try (Writer writer = Files.newBufferedWriter(temp, StandardCharsets.UTF_8)) {
                gson.toJson(new ModuleCache(SCHEMA_VERSION, components), writer);
            }
            try {
                Files.move(temp, target, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            } catch (java.nio.file.AtomicMoveNotSupportedException e) {
                // ATOMIC_MOVE not supported (e.g., some Windows filesystems) — fall back to plain replace
                Files.move(temp, target, StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (IOException | RuntimeException e) {
            LOGGER.log(Level.WARNING, "Failed to write AI component cache, disabling disk cache", e);
            diskAvailable.set(false);
            if (temp != null) {
                try {
                    Files.deleteIfExists(temp);
                } catch (IOException ignored) {
                    // best-effort cleanup
                }
            }
        }
    }

    private static String toFileName(String org, String name, String version) {
        return (org + "_" + name + "_" + version).replace(".", "-") + ".json";
    }

    private static boolean isValid(CachedComponent c) {
        if (c == null || c.className() == null || c.label() == null
                || c.description() == null || c.category() == null || c.symbol() == null) {
            return false;
        }
        try {
            NodeKind.valueOf(c.category());
            return true;
        } catch (IllegalArgumentException e) {
            return false;
        }
    }

    record CachedComponent(String className, String label, String description,
                           String category, String symbol, String icon) {
    }

    private record ModuleCache(int schemaVersion, List<CachedComponent> components) {
    }
}
