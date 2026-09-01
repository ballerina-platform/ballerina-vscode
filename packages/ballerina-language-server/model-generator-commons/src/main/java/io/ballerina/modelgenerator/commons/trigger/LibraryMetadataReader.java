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

package io.ballerina.modelgenerator.commons.trigger;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParseException;
import com.google.gson.JsonParser;
import com.google.gson.stream.JsonReader;
import io.ballerina.modelgenerator.commons.ModuleInfo;
import io.ballerina.modelgenerator.commons.PackageUtil;
import io.ballerina.modelgenerator.commons.trigger.models.ArtifactInfo;
import io.ballerina.modelgenerator.commons.trigger.models.ArtifactMetadata;
import io.ballerina.modelgenerator.commons.trigger.models.TriggerMetadataModel;
import io.ballerina.modelgenerator.commons.trigger.models.TriggerUIMetadataModel;
import io.ballerina.modelgenerator.commons.trigger.utils.TriggerMetadataGson;
import io.ballerina.modelgenerator.commons.trigger.utils.TriggerUIAuthoringParser;
import io.ballerina.projects.Package;
import io.ballerina.projects.PackageDescriptor;
import io.ballerina.projects.PackageName;
import io.ballerina.projects.PackageOrg;
import io.ballerina.projects.PackageVersion;
import io.ballerina.projects.SemanticVersion;
import io.ballerina.projects.environment.PackageRepository;
import io.ballerina.projects.environment.ResolutionOptions;
import io.ballerina.projects.environment.ResolutionRequest;
import io.ballerina.projects.internal.environment.BallerinaUserHome;

import java.io.IOException;
import java.io.Reader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.InvalidPathException;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;
import java.util.logging.Level;
import java.util.logging.Logger;
import java.util.regex.Pattern;

/**
 * Connector-agnostic entry point for reading the trigger model family, shared by every LS extension.
 */
public final class LibraryMetadataReader {

    private static final Logger LOGGER = Logger.getLogger(LibraryMetadataReader.class.getName());

    private static final String TRIGGER_METADATA_RESOURCE_PATH = "resources/trigger-metadata.json";
    private static final String TRIGGER_UI_METADATA_RESOURCE_PATH = "resources/trigger-ui-metadata.json";
    /** Sized for the designer, which resolves one connector at a time. */
    private static final int MAX_CACHE_SIZE = 2;
    private static final Pattern SUPPORTED_VERSION = Pattern.compile("^v1\\.\\d+$");
    private static final Set<String> TRIGGER_KINDS = Set.of("event", "mcp", "graphql", "http", "file", "ai");

    private static final Duration PACKAGE_ROOT_CACHE_TTL = Duration.ofSeconds(60);

    private static final LibraryMetadataReader INSTANCE = new LibraryMetadataReader();

    private final Cache<String, Optional<Path>> packageRootCache =
            Caffeine.newBuilder().maximumSize(MAX_CACHE_SIZE).expireAfterWrite(PACKAGE_ROOT_CACHE_TTL).build();

    private final Gson plainGson = new Gson();

    private LibraryMetadataReader() {
    }

    public static LibraryMetadataReader getInstance() {
        return INSTANCE;
    }

    /** The connector's own {@code resources/trigger-metadata.json}, resolved from its {@code .bala}. */
    public Optional<TriggerMetadataModel> getTriggerMetadataModel(ModuleInfo moduleInfo) {
        return packageRoot(moduleInfo).flatMap(this::readTriggerMetadataModel);
    }

    /** The connector's sparse {@code resources/trigger-ui-metadata.json}, resolved from its {@code .bala}. */
    public Optional<TriggerUIMetadataModel> getTriggerUIMetadataModel(ModuleInfo moduleInfo) {
        return packageRoot(moduleInfo)
                .flatMap(root -> readTriggerUIMetadataModel(root, moduleInfo == null ? null : moduleInfo.version()));
    }

    /** Reads the artifact-tree projection without materializing or caching the complete L2 document. */
    public Optional<ArtifactMetadata> getArtifactMetadata(ModuleInfo moduleInfo) {
        return packageRoot(moduleInfo)
                .flatMap(root -> readArtifactMetadata(root, moduleInfo == null ? null : moduleInfo.version()));
    }

    /** Compatibility accessor for callers interested only in presentation metadata. */
    public Optional<ArtifactInfo.Resolved> getArtifactInfo(ModuleInfo moduleInfo) {
        return getArtifactMetadata(moduleInfo).flatMap(metadata -> Optional.ofNullable(metadata.artifactInfo()));
    }

    /** Whether the connector's {@code .bala} is present in the local repository. */
    public boolean isLocallyResolvable(ModuleInfo moduleInfo) {
        return packageRoot(moduleInfo).isPresent();
    }

    /**
     * The connector's own {@code resources/trigger-metadata.json}, resolved from the Ballerina
     * <b>local</b> repository rather than Central.
     */
    public Optional<TriggerMetadataModel> getTriggerMetadataModelFromLocalRepository(ModuleInfo moduleInfo) {
        return localPackageRoot(moduleInfo).flatMap(this::readTriggerMetadataModel);
    }

    /** The connector's sparse UI metadata, resolved from the Ballerina local repository. */
    public Optional<TriggerUIMetadataModel> getTriggerUIMetadataModelFromLocalRepository(ModuleInfo moduleInfo) {
        return localPackageRoot(moduleInfo)
                .flatMap(root -> readTriggerUIMetadataModel(root, moduleInfo == null ? null : moduleInfo.version()));
    }

    /** Artifact-tree L2 read from the Ballerina local repository. */
    public Optional<ArtifactMetadata> getArtifactMetadataFromLocalRepository(ModuleInfo moduleInfo) {
        return localPackageRoot(moduleInfo)
                .flatMap(root -> readArtifactMetadata(root, moduleInfo == null ? null : moduleInfo.version()));
    }

    /** Compatibility accessor for callers interested only in presentation metadata. */
    public Optional<ArtifactInfo.Resolved> getArtifactInfoFromLocalRepository(ModuleInfo moduleInfo) {
        return getArtifactMetadataFromLocalRepository(moduleInfo)
                .flatMap(metadata -> Optional.ofNullable(metadata.artifactInfo()));
    }

    /** Every {@code org/name/version} present in the Ballerina local repository, as {@link ModuleInfo}. */
    public List<ModuleInfo> listLocalRepositoryModules() {
        List<ModuleInfo> modules = new ArrayList<>();
        try {
            Map<String, List<String>> packagesByOrg = localRepository().getPackages();
            for (Map.Entry<String, List<String>> entry : packagesByOrg.entrySet()) {
                String org = entry.getKey();
                for (String nameAndVersion : entry.getValue()) {
                    String[] parts = nameAndVersion.split(":");
                    if (parts.length != 2) {
                        continue;
                    }
                    modules.add(new ModuleInfo(org, parts[0], parts[0], parts[1]));
                }
            }
        } catch (Throwable e) {
            LOGGER.log(Level.FINE, "Listing local-repository modules failed", e);
            return List.of();
        }
        return modules;
    }

    /**
     * The connector's compiled {@link Package}, resolved via the local repository. Deliberately not
     * cached, unlike {@link #packageRoot}.
     */
    public Optional<Package> getCompiledPackageFromLocalRepository(ModuleInfo moduleInfo) {
        if (moduleInfo == null || !moduleInfo.isComplete()) {
            return Optional.empty();
        }
        try {
            PackageDescriptor descriptor = PackageDescriptor.from(
                    PackageOrg.from(moduleInfo.org()), PackageName.from(moduleInfo.packageName()),
                    PackageVersion.from(moduleInfo.version()));
            ResolutionRequest request = ResolutionRequest.from(descriptor);
            return localRepository().getPackage(request, ResolutionOptions.builder().setOffline(true).build());
        } catch (Throwable e) {
            LOGGER.log(Level.FINE, "Compiling local-repository package failed for "
                    + moduleInfo.org() + "/" + moduleInfo.packageName(), e);
            return Optional.empty();
        }
    }

    /** {@code Path}-rooted counterpart of {@link #getCompiledPackageFromLocalRepository}. */
    private Optional<Path> localPackageRoot(ModuleInfo moduleInfo) {
        return getCompiledPackageFromLocalRepository(moduleInfo).map(pkg -> pkg.project().sourceRoot());
    }

    /** The Ballerina local repository handle, resolved once and cached. */
    private PackageRepository localRepository() {
        return LocalRepositoryHolder.INSTANCE;
    }

    private static final class LocalRepositoryHolder {
        private static final PackageRepository INSTANCE = BallerinaUserHome.from(
                PackageUtil.getSampleProject().projectEnvironmentContext().environment()).localPackageRepository();
    }

    // Package-private rather than private: both public reads funnel through here, so the tests
    // exercise the shared tail directly instead of once per entry point.
    Optional<TriggerMetadataModel> readTriggerMetadataModel(Path packageRoot) {
        return readResourceFile(packageRoot, TRIGGER_METADATA_RESOURCE_PATH).flatMap(json -> {
            try {
                TriggerMetadataModel model = TriggerMetadataGson.instance().fromJson(json, TriggerMetadataModel.class);
                return requireSupportedVersion(model, packageRoot.resolve(TRIGGER_METADATA_RESOURCE_PATH).toString());
            } catch (JsonParseException e) {
                return Optional.empty();
            }
        });
    }

    Optional<TriggerUIMetadataModel> readTriggerUIMetadataModel(Path packageRoot, String version) {
        return readResourceFile(packageRoot, TRIGGER_UI_METADATA_RESOURCE_PATH)
                .flatMap(json -> parseTriggerUIMetadata(json, version,
                        packageRoot.resolve(TRIGGER_UI_METADATA_RESOURCE_PATH).toString()));
    }

    Optional<ArtifactInfo.Resolved> readArtifactInfo(Path packageRoot, String version) {
        return readArtifactMetadata(packageRoot, version)
                .flatMap(metadata -> Optional.ofNullable(metadata.artifactInfo()));
    }

    Optional<ArtifactMetadata> readArtifactMetadata(Path packageRoot, String version) {
        Path metadataFile = packageRoot.resolve(TRIGGER_UI_METADATA_RESOURCE_PATH).normalize();
        if (!metadataFile.startsWith(packageRoot) || !Files.isRegularFile(metadataFile)) {
            return Optional.empty();
        }
        Path resourceRoot = metadataFile.getParent();
        try (Reader reader = Files.newBufferedReader(metadataFile, StandardCharsets.UTF_8)) {
            return parseArtifactMetadata(reader, version, metadataFile.toString(),
                    relative -> readRelativeAsset(resourceRoot, relative));
        } catch (IOException | JsonParseException | IllegalStateException e) {
            LOGGER.log(Level.WARNING, "Ignoring artifactInfo in " + metadataFile, e);
            return Optional.empty();
        }
    }

    private Optional<ArtifactMetadata> parseArtifactMetadata(Reader sourceReader, String requestedVersion,
                                                              String source,
                                                              Function<String, Optional<String>> assetReader)
            throws IOException {
        try (JsonReader reader = new JsonReader(sourceReader)) {
            ArtifactDocument root = readArtifactDocument(reader, null);
            ArtifactDocument selected = root;
            if (root.variants() != null && !root.variants().isEmpty()) {
                selected = selectArtifactVariant(root.variants(), requestedVersion);
            }
            if (selected == null || selected.version() == null
                    || !SUPPORTED_VERSION.matcher(selected.version()).matches()) {
                return Optional.empty();
            }
            ArtifactInfo info = selected.artifactInfo();
            ArtifactInfo.Resolved resolved = null;
            if (info != null && info.icon() != null) {
                Optional<String> light = assetReader.apply(info.icon().lightPath());
                Optional<String> dark = assetReader.apply(info.icon().darkPath());
                if (light.isPresent() && dark.isPresent() && isSafeSvg(light.get()) && isSafeSvg(dark.get())) {
                    resolved = new ArtifactInfo.Resolved(info.displayLabel(), info.displayLabelOverrides(),
                            new ArtifactInfo.ResolvedIcon(light.get(), dark.get(), info.icon().color()),
                            info.identifier());
                } else {
                    LOGGER.warning("Ignoring incomplete or unsafe artifact icon in " + source);
                }
            }
            String triggerKind = selected.triggerKind() != null && TRIGGER_KINDS.contains(selected.triggerKind())
                    ? selected.triggerKind() : null;
            if (resolved == null && triggerKind == null) {
                return Optional.empty();
            }
            return Optional.of(new ArtifactMetadata(resolved, triggerKind));
        }
    }

    private ArtifactDocument readArtifactDocument(JsonReader reader, String minVersion) throws IOException {
        String version = null;
        String triggerKind = null;
        ArtifactInfo artifactInfo = null;
        List<ArtifactDocument> variants = null;
        reader.beginObject();
        while (reader.hasNext()) {
            switch (reader.nextName()) {
                case "version" -> version = reader.nextString();
                case "metadata" -> triggerKind = readTriggerKind(reader);
                case "artifactInfo" -> artifactInfo = plainGson.fromJson(reader, ArtifactInfo.class);
                case "variants" -> {
                    variants = new ArrayList<>();
                    reader.beginArray();
                    while (reader.hasNext()) {
                        variants.add(readVariant(reader));
                    }
                    reader.endArray();
                }
                default -> reader.skipValue();
            }
        }
        reader.endObject();
        return new ArtifactDocument(minVersion, version, triggerKind, artifactInfo, variants);
    }

    private String readTriggerKind(JsonReader reader) throws IOException {
        String kind = null;
        String triggerKind = null;
        reader.beginObject();
        while (reader.hasNext()) {
            switch (reader.nextName()) {
                case "triggerKind" -> triggerKind = reader.nextString();
                case "kind" -> kind = reader.nextString();
                default -> reader.skipValue();
            }
        }
        reader.endObject();
        return triggerKind == null ? kind : triggerKind;
    }

    private ArtifactDocument readVariant(JsonReader reader) throws IOException {
        String minVersion = null;
        ArtifactDocument model = null;
        reader.beginObject();
        while (reader.hasNext()) {
            switch (reader.nextName()) {
                case "minVersion" -> minVersion = reader.nextString();
                case "model" -> model = readArtifactDocument(reader, minVersion);
                default -> reader.skipValue();
            }
        }
        reader.endObject();
        if (model == null) {
            return new ArtifactDocument(minVersion, null, null, null, null);
        }
        return new ArtifactDocument(minVersion, model.version(), model.triggerKind(), model.artifactInfo(),
                model.variants());
    }

    private ArtifactDocument selectArtifactVariant(List<ArtifactDocument> variants, String version) {
        ArtifactDocument fallback = null;
        for (ArtifactDocument variant : variants) {
            fallback = variant;
            if (variant.minVersion() == null || variant.minVersion().isBlank()
                    || version == null || version.isBlank() || versionAtLeast(version, variant.minVersion())) {
                return variant;
            }
        }
        return fallback;
    }

    private Optional<String> readRelativeAsset(Path root, String relative) {
        if (!isSafeRelativePath(relative)) {
            return Optional.empty();
        }
        Path path = root.resolve(relative).normalize();
        if (!path.startsWith(root) || !Files.isRegularFile(path)) {
            return Optional.empty();
        }
        try {
            return Optional.of(Files.readString(path, StandardCharsets.UTF_8));
        } catch (IOException e) {
            return Optional.empty();
        }
    }

    private static boolean isSafeRelativePath(String path) {
        if (path == null || path.isBlank() || path.startsWith("/") || path.contains("\\")) {
            return false;
        }
        try {
            return !Path.of(path).normalize().startsWith("..");
        } catch (InvalidPathException e) {
            return false;
        }
    }

    private static boolean isSafeSvg(String svg) {
        String value = svg.toLowerCase(Locale.ROOT);
        return value.contains("<svg") && !value.contains("<script") && !value.contains("<foreignobject")
                && !value.contains("<image") && !value.contains("javascript:")
                && !value.contains("href=\"http") && !value.contains("href='http");
    }

    private record ArtifactDocument(String minVersion, String version, String triggerKind, ArtifactInfo artifactInfo,
                                    List<ArtifactDocument> variants) {
    }

    private Optional<TriggerUIMetadataModel> parseTriggerUIMetadata(String json, String version, String source) {
        try {
            JsonElement parsed = JsonParser.parseString(json);
            if (!parsed.isJsonObject()) {
                return Optional.empty();
            }
            JsonObject document = selectUIMetadataVariant(parsed.getAsJsonObject(), version);
            TriggerUIMetadataModel model = TriggerUIAuthoringParser.parse(document.toString());
            if (model != null && model.version() != null && SUPPORTED_VERSION.matcher(model.version()).matches()) {
                return Optional.of(model);
            }
            LOGGER.log(Level.WARNING, "Unsupported trigger-ui-metadata.json version \""
                    + (model == null ? null : model.version()) + "\" in " + source + "; expected v1.x");
            return Optional.empty();
        } catch (JsonParseException | IllegalStateException e) {
            LOGGER.log(Level.WARNING, "Ignoring invalid trigger-ui-metadata.json in " + source, e);
            return Optional.empty();
        }
    }

    /**
     * Selects the first matching variant; resources are ordered newest to oldest.
     *
     * <p>The {@code variants} envelope is an LS packaging convention layered on top of the L2 spec, not
     * part of it: {@code spec.json}'s root has no {@code variants} property, because a single L2
     * document describes the version a connector <em>is</em>, not a version-selection policy -- that
     * policy only exists here, where the LS bundles several package-version surfaces of one connector
     * (today, only {@code mcp}) side by side. A packaged {@code trigger-ui-metadata.json} is therefore
     * either (a) a spec-valid L2 document on its own, or (b) {@code {"variants": [{"minVersion"?:
     * <semver>, "model": <spec-valid L2 document>}, ...]}}, ordered newest to oldest, where an omitted
     * {@code minVersion} means "matches anything" and must be the last entry. Each {@code model} payload
     * is independently spec-valid; only the wrapper itself is not an L2 document, so it is unmodeled by
     * {@link io.ballerina.modelgenerator.commons.trigger.models.TriggerUIMetadataModel} and is resolved
     * to a plain {@link JsonObject} at this layer, before Gson binds the selected variant.
     *
     * <p>A {@code null}/blank {@code version} -- no package version to compare against -- resolves to
     * the <em>first</em> (newest) variant rather than the fallback, matching {@code
     * getModulePackageOffline}'s own "no version means newest" convention elsewhere in this reader.
     */
    private JsonObject selectUIMetadataVariant(JsonObject root, String version) {
        JsonElement variantsElement = root.get("variants");
        if (variantsElement == null || !variantsElement.isJsonArray()) {
            return root;
        }
        JsonArray variants = variantsElement.getAsJsonArray();
        JsonObject fallback = null;
        for (JsonElement element : variants) {
            if (!element.isJsonObject()) {
                continue;
            }
            JsonObject variant = element.getAsJsonObject();
            JsonElement model = variant.get("model");
            if (model == null || !model.isJsonObject()) {
                continue;
            }
            fallback = model.getAsJsonObject();
            JsonElement minVersion = variant.get("minVersion");
            if (minVersion == null || minVersion.isJsonNull()
                    || version == null || version.isBlank()
                    || versionAtLeast(version, minVersion.getAsString())) {
                return model.getAsJsonObject();
            }
        }
        return fallback == null ? root : fallback;
    }

    private static boolean versionAtLeast(String version, String minimum) {
        try {
            return SemanticVersion.from(version).greaterThanOrEqualTo(SemanticVersion.from(minimum));
        } catch (RuntimeException e) {
            return true;
        }
    }

    /** Refuses a {@code null}/absent/unsupported-major version, logging why. */
    private Optional<TriggerMetadataModel> requireSupportedVersion(TriggerMetadataModel model, String source) {
        if (model != null && model.version() != null && SUPPORTED_VERSION.matcher(model.version()).matches()) {
            return Optional.of(model);
        }
        LOGGER.log(Level.WARNING, "Unsupported trigger-metadata.json version \""
                + (model == null ? null : model.version()) + "\" in " + source + "; expected v1.x");
        return Optional.empty();
    }

    /** The local {@code .bala} root of {@code moduleInfo}. Only a hit is memoized. */
    private Optional<Path> packageRoot(ModuleInfo moduleInfo) {
        if (moduleInfo == null || moduleInfo.org() == null || moduleInfo.moduleName() == null) {
            return Optional.empty();
        }
        String key = moduleInfo.org() + "/" + moduleInfo.moduleName();
        Optional<Path> cached = packageRootCache.getIfPresent(key);
        if (cached != null) {
            return cached;
        }
        Optional<Path> resolved = resolvePackageRoot(moduleInfo);
        if (resolved.isPresent()) {
            packageRootCache.put(key, resolved);
        }
        return resolved;
    }

    private Optional<Path> resolvePackageRoot(ModuleInfo moduleInfo) {
        try {
            Optional<Package> pkg = PackageUtil.getModulePackageOffline(PackageUtil.getSampleProject(),
                    moduleInfo.org(), moduleInfo.moduleName());
            return pkg.map(aPackage -> aPackage.project().sourceRoot());
        } catch (Throwable e) {
            return Optional.empty();
        }
    }

    /** Reads a package-relative file as UTF-8 text, guarding against it escaping {@code packageRoot}. */
    private Optional<String> readResourceFile(Path packageRoot, String relativePath) {
        Path file = packageRoot.resolve(relativePath).normalize();
        if (!file.startsWith(packageRoot) || !Files.isRegularFile(file)) {
            return Optional.empty();
        }
        try {
            return Optional.of(Files.readString(file, StandardCharsets.UTF_8));
        } catch (IOException e) {
            return Optional.empty();
        }
    }
}
