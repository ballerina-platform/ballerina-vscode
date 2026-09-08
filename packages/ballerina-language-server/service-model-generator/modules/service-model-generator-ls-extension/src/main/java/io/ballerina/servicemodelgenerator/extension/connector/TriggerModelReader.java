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

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.google.gson.Gson;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParseException;
import com.google.gson.JsonParser;
import com.google.gson.reflect.TypeToken;
import com.google.gson.stream.JsonReader;
import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.modelgenerator.commons.CommonUtils;
import io.ballerina.modelgenerator.commons.ModuleInfo;
import io.ballerina.modelgenerator.commons.PackageUtil;
import io.ballerina.modelgenerator.commons.trigger.LibraryMetadataReader;
import io.ballerina.modelgenerator.commons.trigger.models.TriggerLibraryFacts;
import io.ballerina.modelgenerator.commons.trigger.models.TriggerMetadataModel;
import io.ballerina.modelgenerator.commons.trigger.models.TriggerUISchemaModel;
import io.ballerina.modelgenerator.commons.trigger.models.TypeRef;
import io.ballerina.modelgenerator.commons.trigger.utils.TriggerLibraryIntrospector;
import io.ballerina.projects.Package;
import io.ballerina.projects.PackageDescriptor;
import io.ballerina.projects.SemanticVersion;
import io.ballerina.servicemodelgenerator.extension.model.Codedata;
import io.ballerina.servicemodelgenerator.extension.model.Listener;
import io.ballerina.servicemodelgenerator.extension.model.ServiceInitModel;
import io.ballerina.servicemodelgenerator.extension.util.ListenerUtil;

import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.lang.reflect.Type;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Reads the unified {@code trigger-ui-schema.json} for a connector, bundled, shipped, or synthesized.
 */
public class TriggerModelReader {

    private static final Logger LOGGER = Logger.getLogger(TriggerModelReader.class.getName());

    private static final TriggerModelReader INSTANCE = new TriggerModelReader();

    private static final List<String> INIT_IDENTITY_KEYS = List.of(
            "id", "displayName", "description", "orgName", "packageName", "moduleName", "version", "type", "icon");

    private static final String BUNDLED_TRIGGER_MODEL_REGISTRY_RESOURCE = "bundled_trigger_models.json";
    private static final Type BUNDLED_REGISTRY_TYPE = new TypeToken<Map<String, JsonElement>>() { }.getType();
    private static final String KEY_MIN_VERSION = "minVersion";
    private static final String KEY_RESOURCE = "resource";

    /** Modules for which a {@code trigger-ui-schema.json} is bundled as a classpath resource. */
    private static final Map<String, List<ModelVariant>> BUNDLED_TRIGGER_MODEL_RESOURCES =
            loadBundledTriggerModelRegistry();

    private static final int MAX_CACHE_SIZE = 2;

    /**
     * One version-gated variant of a connector's bundled schema.
     *
     * @param minVersion the lowest connector version this variant applies to
     * @param resource   the classpath resource holding this variant's schema
     */
    private record ModelVariant(String minVersion, String resource) {

        boolean matches(String version) {
            if (minVersion == null || minVersion.isBlank()) {
                return true;
            }
            try {
                return SemanticVersion.from(version).greaterThanOrEqualTo(SemanticVersion.from(minVersion));
            } catch (RuntimeException e) {
                return true;
            }
        }
    }

    private static Map<String, List<ModelVariant>> loadBundledTriggerModelRegistry() {
        try (InputStream is = TriggerModelReader.class.getClassLoader()
                .getResourceAsStream(BUNDLED_TRIGGER_MODEL_REGISTRY_RESOURCE)) {
            if (is == null) {
                return Map.of();
            }
            try (JsonReader reader = new JsonReader(new InputStreamReader(is, StandardCharsets.UTF_8))) {
                Map<String, JsonElement> loaded = new Gson().fromJson(reader, BUNDLED_REGISTRY_TYPE);
                if (loaded == null) {
                    return Map.of();
                }
                Map<String, List<ModelVariant>> registry = new LinkedHashMap<>();
                loaded.forEach((moduleName, entry) -> {
                    List<ModelVariant> variants = parseVariants(entry);
                    if (!variants.isEmpty()) {
                        registry.put(moduleName, variants);
                    }
                });
                return Map.copyOf(registry);
            }
        } catch (IOException | JsonParseException e) {
            return Map.of();
        }
    }

    /** Normalizes both registry entry forms (a bare resource path, or an ordered variant array). */
    private static List<ModelVariant> parseVariants(JsonElement entry) {
        if (entry == null || entry.isJsonNull()) {
            return List.of();
        }
        if (entry.isJsonPrimitive()) {
            return List.of(new ModelVariant(null, entry.getAsString()));
        }
        if (!entry.isJsonArray()) {
            return List.of();
        }
        List<ModelVariant> variants = new ArrayList<>();
        for (JsonElement element : entry.getAsJsonArray()) {
            if (!element.isJsonObject()) {
                continue;
            }
            JsonObject variant = element.getAsJsonObject();
            JsonElement resource = variant.get(KEY_RESOURCE);
            if (resource == null || !resource.isJsonPrimitive()) {
                continue;
            }
            JsonElement minVersion = variant.get(KEY_MIN_VERSION);
            variants.add(new ModelVariant(
                    minVersion != null && minVersion.isJsonPrimitive() ? minVersion.getAsString() : null,
                    resource.getAsString()));
        }
        return List.copyOf(variants);
    }

    private final Gson gson = new Gson();
    private final Cache<String, Optional<TriggerUISchemaModel>> bundledTriggerCache =
            Caffeine.newBuilder().maximumSize(MAX_CACHE_SIZE).build();
    private final Cache<String, Optional<JsonObject>> bundledInitJsonCache =
            Caffeine.newBuilder().maximumSize(MAX_CACHE_SIZE).build();
    private final Cache<String, Optional<TriggerUISchemaModel>> schemaDrivenTriggerCache =
            Caffeine.newBuilder().maximumSize(MAX_CACHE_SIZE).build();

    private TriggerModelReader() {
    }

    public static TriggerModelReader getInstance() {
        return INSTANCE;
    }

    /** Derives the add-trigger init form by remapping {@code initProperties -> properties} at the JSON level. */
    private static Optional<JsonObject> initFormJson(JsonElement parsed) {
        if (!parsed.isJsonObject()) {
            return Optional.empty();
        }
        JsonObject root = parsed.getAsJsonObject();
        JsonElement initProperties = root.get("initProperties");
        if (initProperties == null || !initProperties.isJsonObject()) {
            return Optional.empty();
        }
        JsonObject remapped = new JsonObject();
        for (String key : INIT_IDENTITY_KEYS) {
            if (root.has(key)) {
                remapped.add(key, root.get(key));
            }
        }
        remapped.add("properties", initProperties);
        return Optional.of(remapped);
    }

    /** A fresh {@link ServiceInitModel} bound from {@link #initFormJson}; never a shared instance. */
    private Optional<ServiceInitModel> buildServiceInitModelFromJson(JsonElement parsed) {
        return initFormJson(parsed).map(json -> gson.fromJson(json, ServiceInitModel.class));
    }

    /** Cheap presence check for a bundled schema, used by the routers at dispatch time. */
    public boolean hasBundledTriggerModel(String moduleName) {
        return getBundledTriggerModel(moduleName).isPresent();
    }

    /** Reads and caches the newest bundled {@code trigger-ui-schema.json} variant for {@code moduleName}. */
    public Optional<TriggerUISchemaModel> getBundledTriggerModel(String moduleName) {
        return getBundledTriggerModel(moduleName, null);
    }

    /** Reads and caches the bundled {@code trigger-ui-schema.json} variant for {@code moduleName}/{@code version}. */
    public Optional<TriggerUISchemaModel> getBundledTriggerModel(String moduleName, String version) {
        return resolveResource(moduleName, version).flatMap(resource ->
                bundledTriggerCache.get(resource, r ->
                        parseBundledResource(r).map(json -> gson.fromJson(json, TriggerUISchemaModel.class))));
    }

    /** Reads and caches the newest bundled model's init form for {@code moduleName}, if any. */
    public Optional<ServiceInitModel> getBundledServiceInitModel(String moduleName) {
        return getBundledServiceInitModel(moduleName, null);
    }

    /** Reads the init form of the bundled model variant for {@code moduleName}/{@code version}. */
    public Optional<ServiceInitModel> getBundledServiceInitModel(String moduleName, String version) {
        return resolveResource(moduleName, version)
                .flatMap(resource -> bundledInitJsonCache.get(resource,
                        r -> parseBundledResource(r).flatMap(TriggerModelReader::initFormJson)))
                .map(json -> gson.fromJson(json, ServiceInitModel.class));
    }

    /** The resource path of the variant describing {@code moduleName} at {@code version}. */
    private static Optional<String> resolveResource(String moduleName, String version) {
        if (moduleName == null) {
            return Optional.empty();
        }
        List<ModelVariant> variants = BUNDLED_TRIGGER_MODEL_RESOURCES.get(moduleName);
        if (variants == null || variants.isEmpty()) {
            return Optional.empty();
        }
        if (version == null || version.isBlank()) {
            return Optional.of(variants.getFirst().resource());
        }
        return Optional.of(variants.stream()
                .filter(variant -> variant.matches(version))
                .findFirst()
                .orElseGet(variants::getLast)
                .resource());
    }

    private Optional<JsonElement> parseBundledResource(String resourcePath) {
        try (InputStream is = getClass().getClassLoader().getResourceAsStream(resourcePath)) {
            if (is == null) {
                return Optional.empty();
            }
            String json = new String(is.readAllBytes(), StandardCharsets.UTF_8);
            return Optional.of(JsonParser.parseString(json));
        } catch (IOException | JsonParseException e) {
            return Optional.empty();
        }
    }

    /** Cheap presence check across all tiers: bundled, connector-shipped, or synthesized. */
    public boolean hasSchemaDrivenModel(String orgName, String moduleName) {
        return getSchemaDrivenTriggerModel(orgName, moduleName, null, false).isPresent();
    }

    /** {@code isLocalRepository} variant of {@link #hasSchemaDrivenModel(String, String)}. */
    public boolean hasSchemaDrivenModel(String orgName, String moduleName, String version,
                                        boolean isLocalRepository) {
        return getSchemaDrivenTriggerModel(orgName, moduleName, version, isLocalRepository).isPresent();
    }

    /** The connector's {@link TriggerUISchemaModel}: bundled, shipped, or synthesized. */
    public Optional<TriggerUISchemaModel> getSchemaDrivenTriggerModel(String orgName, String moduleName) {
        return getSchemaDrivenTriggerModel(orgName, moduleName, null);
    }

    /** Version-aware counterpart of {@link #getSchemaDrivenTriggerModel(String, String)}. */
    public Optional<TriggerUISchemaModel> getSchemaDrivenTriggerModel(String orgName, String moduleName,
                                                                       String version) {
        return getSchemaDrivenTriggerModel(orgName, moduleName, version, false);
    }

    /** {@code isLocalRepository} variant, resolving via the Ballerina local repository. Not cached. */
    public Optional<TriggerUISchemaModel> getSchemaDrivenTriggerModel(String orgName, String moduleName,
                                                                       String version, boolean isLocalRepository) {
        if (isLocalRepository) {
            return resolveSchemaDrivenTriggerModelFromLocalRepository(orgName, moduleName, version);
        }
        Optional<TriggerUISchemaModel> bundled = getBundledTriggerModel(moduleName, version);
        if (bundled.isPresent() || orgName == null || moduleName == null) {
            return bundled;
        }
        String key = orgName + "/" + moduleName;
        Optional<TriggerUISchemaModel> cached = schemaDrivenTriggerCache.getIfPresent(key);
        if (cached != null) {
            return cached;
        }
        Resolution resolution = resolveSchemaDrivenTriggerModel(orgName, moduleName);
        if (resolution.cacheable()) {
            schemaDrivenTriggerCache.put(key, resolution.model());
        }
        return resolution.model();
    }

    /**
     * One resolution attempt.
     *
     * @param model     the resolved model, if any
     * @param cacheable whether the outcome may be memoized; {@code false} when the connector is simply
     *                  not in the local repository yet, so a later pull is picked up instead of being
     *                  masked by a memoized miss
     */
    private record Resolution(Optional<TriggerUISchemaModel> model, boolean cacheable) {

        private static final Resolution UNRESOLVED = new Resolution(Optional.empty(), false);
        private static final Resolution ABSENT = new Resolution(Optional.empty(), true);

        static Resolution of(Optional<TriggerUISchemaModel> model) {
            return model.isEmpty() ? ABSENT : new Resolution(model, true);
        }
    }

    /** The connector's add-trigger init form. */
    public Optional<ServiceInitModel> getSchemaDrivenServiceInitModel(String orgName, String moduleName) {
        return getSchemaDrivenServiceInitModel(orgName, moduleName, null);
    }

    /** Version-aware counterpart of {@link #getSchemaDrivenServiceInitModel(String, String)}. */
    public Optional<ServiceInitModel> getSchemaDrivenServiceInitModel(String orgName, String moduleName,
                                                                       String version) {
        return getSchemaDrivenServiceInitModel(orgName, moduleName, version, false);
    }

    /** {@code isLocalRepository} variant; the returned model has {@link ServiceInitModel#setLocalRepository} set. */
    public Optional<ServiceInitModel> getSchemaDrivenServiceInitModel(String orgName, String moduleName,
                                                                       String version, boolean isLocalRepository) {
        if (isLocalRepository) {
            return getSchemaDrivenTriggerModel(orgName, moduleName, version, true)
                    .flatMap(model -> buildServiceInitModelFromJson(gson.toJsonTree(model)))
                    .map(initModel -> {
                        initModel.setLocalRepository(true);
                        return initModel;
                    });
        }
        Optional<ServiceInitModel> bundled = getBundledServiceInitModel(moduleName, version);
        if (bundled.isPresent() || orgName == null || moduleName == null) {
            return bundled;
        }
        return getSchemaDrivenTriggerModel(orgName, moduleName, version)
                .flatMap(model -> buildServiceInitModelFromJson(gson.toJsonTree(model)));
    }

    /** Resolves a {@link TriggerUISchemaModel} for a connector via the Ballerina local repository. */
    private Optional<TriggerUISchemaModel> resolveSchemaDrivenTriggerModelFromLocalRepository(
            String orgName, String moduleName, String version) {
        try {
            ModuleInfo moduleInfo = new ModuleInfo(orgName, moduleName, moduleName, version);
            LibraryMetadataReader metadataReader = LibraryMetadataReader.getInstance();

            Optional<TriggerUISchemaModel> shipped = metadataReader
                    .getTriggerUISchemaModelFromLocalRepository(moduleInfo);
            if (shipped.isPresent()) {
                return shipped;
            }

            Optional<TriggerMetadataModel> metadata = metadataReader
                    .getTriggerMetadataModelFromLocalRepository(moduleInfo);
            if (metadata.isEmpty()) {
                return Optional.empty();
            }
            Optional<Package> pkg = metadataReader.getCompiledPackageFromLocalRepository(moduleInfo);
            if (pkg.isEmpty()) {
                return Optional.empty();
            }
            return synthesizeTriggerModel(metadata.get(), pkg.get(), moduleName);
        } catch (Throwable e) {
            LOGGER.log(Level.FINE, "Local-repository trigger model resolution failed for "
                    + orgName + "/" + moduleName, e);
            return Optional.empty();
        }
    }

    /** Resolves a {@link TriggerUISchemaModel} for a non-bundled module via {@link LibraryMetadataReader}. */
    private Resolution resolveSchemaDrivenTriggerModel(String orgName, String moduleName) {
        try {
            return doResolveSchemaDrivenTriggerModel(orgName, moduleName);
        } catch (Throwable e) {
            return Resolution.UNRESOLVED;
        }
    }

    private Resolution doResolveSchemaDrivenTriggerModel(String orgName, String moduleName) {
        ModuleInfo moduleInfo = new ModuleInfo(orgName, moduleName, moduleName, null);
        LibraryMetadataReader metadataReader = LibraryMetadataReader.getInstance();

        Optional<TriggerUISchemaModel> shipped = metadataReader.getTriggerUISchemaModel(moduleInfo);
        if (shipped.isPresent()) {
            return Resolution.of(shipped);
        }

        Optional<TriggerMetadataModel> metadata = metadataReader.getTriggerMetadataModel(moduleInfo);
        if (metadata.isEmpty()) {
            return metadataReader.isLocallyResolvable(moduleInfo) ? Resolution.ABSENT : Resolution.UNRESOLVED;
        }
        Optional<Package> pkg = PackageUtil.getModulePackageOffline(orgName, moduleName);
        if (pkg.isEmpty()) {
            return Resolution.UNRESOLVED;
        }
        return Resolution.of(synthesizeTriggerModel(metadata.get(), pkg.get(), moduleName));
    }

    /** Synthesizes a {@link TriggerUISchemaModel} from a connector's metadata plus semantic introspection. */
    private Optional<TriggerUISchemaModel> synthesizeTriggerModel(TriggerMetadataModel metadata, Package pkg,
                                                                  String moduleName) {
        SemanticModel semanticModel = PackageUtil.getCompilation(pkg)
                .getSemanticModel(pkg.getDefaultModule().moduleId());

        PackageDescriptor descriptor = pkg.descriptor();
        String resolvedOrg = descriptor.org().value();
        String resolvedPackageName = descriptor.name().value();
        String resolvedVersion = descriptor.version().value().toString();
        TriggerLibraryFacts facts = TriggerLibraryIntrospector.introspect(semanticModel, null);
        Map<String, TriggerLibraryFacts> crossModuleFacts =
                resolveCrossModuleFacts(metadata, resolvedOrg, resolvedPackageName);

        Listener listenerModel = resolveListenerModel(metadata, semanticModel, resolvedOrg,
                resolvedPackageName, moduleName, resolvedVersion);

        String displayName = TriggerModelSynthesizer.humanize(moduleName);
        String icon = CommonUtils.generateIcon(resolvedOrg, resolvedPackageName, resolvedVersion);

        return TriggerModelSynthesizer.synthesize(metadata, facts, crossModuleFacts, listenerModel, moduleName,
                displayName, icon, "event", resolvedOrg, resolvedPackageName, moduleName, resolvedVersion);
    }

    /**
     * Introspects every distinct package a cross-module annotation is declared in (e.g. CDC's shared
     * {@code ballerinax/cdc}), so its real backing record type can be resolved. Best-effort: a package
     * that fails to resolve/compile is silently skipped.
     */
    private Map<String, TriggerLibraryFacts> resolveCrossModuleFacts(TriggerMetadataModel metadata, String ownOrg,
                                                                     String ownPackageName) {
        if (metadata.annotations() == null) {
            return Map.of();
        }
        Map<String, TriggerLibraryFacts> crossModuleFacts = new LinkedHashMap<>();
        for (TriggerMetadataModel.Annotation annotation : metadata.annotations()) {
            TypeRef.PackageInfo packageInfo = annotation.type() == null ? null : annotation.type().packageInfo();
            if (packageInfo == null || packageInfo.org() == null || packageInfo.packageName() == null
                    || (packageInfo.org().equals(ownOrg) && packageInfo.packageName().equals(ownPackageName))) {
                continue;
            }
            String key = TriggerModelSynthesizer.crossModuleFactsKey(packageInfo);
            if (crossModuleFacts.containsKey(key)) {
                continue;
            }
            introspectCrossModulePackage(packageInfo).ifPresent(facts -> crossModuleFacts.put(key, facts));
        }
        return crossModuleFacts;
    }

    private Optional<TriggerLibraryFacts> introspectCrossModulePackage(TypeRef.PackageInfo packageInfo) {
        try {
            String targetModule = packageInfo.moduleName() != null && !packageInfo.moduleName().isBlank()
                    ? packageInfo.moduleName() : packageInfo.packageName();
            Optional<Package> pkg = PackageUtil.getModulePackageOffline(packageInfo.org(), targetModule);
            if (pkg.isEmpty()) {
                return Optional.empty();
            }
            SemanticModel semanticModel = PackageUtil.getCompilation(pkg.get())
                    .getSemanticModel(pkg.get().getDefaultModule().moduleId());
            return Optional.of(TriggerLibraryIntrospector.introspect(semanticModel, null));
        } catch (Throwable e) {
            LOGGER.log(Level.FINE, "Cross-module introspection failed for "
                    + packageInfo.org() + "/" + packageInfo.packageName(), e);
            return Optional.empty();
        }
    }

    /** Resolves the listener init-form template via {@link ListenerUtil#getListenerModelFromConnectorPackage}. */
    private static Listener resolveListenerModel(TriggerMetadataModel metadata, SemanticModel semanticModel,
                                                 String orgName, String packageName, String moduleName,
                                                 String version) {
        try {
            String listenerType = metadata.listeners().get(0).type().name();
            Codedata codedata = new Codedata.Builder()
                    .setType(listenerType)
                    .setOrgName(orgName)
                    .setPackageName(packageName)
                    .setModuleName(moduleName)
                    .setVersion(version)
                    .build();
            return ListenerUtil.getListenerModelFromConnectorPackage(codedata, semanticModel, null).orElse(null);
        } catch (Throwable e) {
            return null;
        }
    }
}
