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
import com.google.gson.JsonParseException;
import com.google.gson.stream.JsonReader;
import io.ballerina.modelgenerator.commons.ModuleInfo;
import io.ballerina.modelgenerator.commons.PackageUtil;
import io.ballerina.modelgenerator.commons.trigger.models.ArtifactInfo;
import io.ballerina.modelgenerator.commons.trigger.models.ArtifactMetadata;
import io.ballerina.modelgenerator.commons.trigger.models.TriggerKind;
import io.ballerina.modelgenerator.commons.trigger.models.TriggerMetadataModel;
import io.ballerina.modelgenerator.commons.trigger.models.TriggerUIMetadataModel;
import io.ballerina.modelgenerator.commons.trigger.utils.TriggerMetadataGson;
import io.ballerina.modelgenerator.commons.trigger.utils.TriggerUIAuthoringParser;
import io.ballerina.projects.Package;
import io.ballerina.projects.PackageDescriptor;
import io.ballerina.projects.PackageName;
import io.ballerina.projects.PackageOrg;
import io.ballerina.projects.PackageVersion;
import io.ballerina.projects.environment.PackageRepository;
import io.ballerina.projects.environment.ResolutionOptions;
import io.ballerina.projects.environment.ResolutionRequest;

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

    private static final String TRIGGER_METADATA_RESOURCE_PATH = "metadata/trigger-metadata.json";
    private static final String TRIGGER_UI_METADATA_RESOURCE_PATH = "metadata/trigger-ui-metadata.json";
    private static final int MAX_CACHE_SIZE = 2;
    private static final Pattern SUPPORTED_VERSION = Pattern.compile("^v1\\.\\d+$");
    private static final Set<String> SELF_NAMED_TRIGGER_KIND_MODULES = Set.of("http", "graphql", "mcp", "ai");
    private static final String BALLERINA_ORG = "ballerina";

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

    /** The connector's own {@code metadata/trigger-metadata.json}, resolved from its {@code .bala}. */
    public Optional<TriggerMetadataModel> getTriggerMetadataModel(ModuleInfo moduleInfo) {
        return packageRoot(moduleInfo).flatMap(this::readTriggerMetadataModel);
    }

    /** The connector's sparse {@code metadata/trigger-ui-metadata.json}, resolved from its {@code .bala}. */
    public Optional<TriggerUIMetadataModel> getTriggerUIMetadataModel(ModuleInfo moduleInfo) {
        return packageRoot(moduleInfo).flatMap(this::readTriggerUIMetadataModel);
    }

    /** Reads the artifact-tree projection without materializing or caching the complete L2 document. */
    public Optional<ArtifactMetadata> getArtifactMetadata(ModuleInfo moduleInfo) {
        Optional<ArtifactMetadata> metadata = packageRoot(moduleInfo).flatMap(this::readArtifactMetadata);
        if (metadata.isPresent() && metadata.get().triggerKind() != null) {
            return metadata;
        }
        return selfNamedTriggerKind(moduleInfo)
                .map(kind -> new ArtifactMetadata(metadata.map(ArtifactMetadata::artifactInfo).orElse(null), kind))
                .or(() -> metadata);
    }

    /**
     * The module's own name, when it is a {@linkplain #SELF_NAMED_TRIGGER_KIND_MODULES core module} whose
     * kind equals its module name.
     */
    private Optional<String> selfNamedTriggerKind(ModuleInfo moduleInfo) {
        if (moduleInfo == null || !BALLERINA_ORG.equals(moduleInfo.org())
                || !SELF_NAMED_TRIGGER_KIND_MODULES.contains(moduleInfo.moduleName())) {
            return Optional.empty();
        }
        return Optional.of(moduleInfo.moduleName());
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
     * The connector's own {@code metadata/trigger-metadata.json}, resolved from the Ballerina
     * <b>local</b> repository rather than Central.
     */
    public Optional<TriggerMetadataModel> getTriggerMetadataModelFromLocalRepository(ModuleInfo moduleInfo) {
        return localPackageRoot(moduleInfo).flatMap(this::readTriggerMetadataModel);
    }

    /** The connector's sparse UI metadata, resolved from the Ballerina local repository. */
    public Optional<TriggerUIMetadataModel> getTriggerUIMetadataModelFromLocalRepository(ModuleInfo moduleInfo) {
        return localPackageRoot(moduleInfo).flatMap(this::readTriggerUIMetadataModel);
    }

    /** Artifact-tree L2 read from the Ballerina local repository. */
    public Optional<ArtifactMetadata> getArtifactMetadataFromLocalRepository(ModuleInfo moduleInfo) {
        return localPackageRoot(moduleInfo).flatMap(this::readArtifactMetadata);
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

    /**
     * The Ballerina local repository handle for the calling thread. Delegates to
     * {@link PackageUtil#localPackageRepository()} rather than caching a single instance here: the
     * repository is backed by a sample-project environment whose package cache is not thread-safe,
     * so reading through a shared instance concurrently would corrupt that cache. Keeping it
     * per-thread is the same fix applied to the sample project itself (wso2/product-integrator#2193).
     */
    private PackageRepository localRepository() {
        return PackageUtil.localPackageRepository();
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

    Optional<TriggerUIMetadataModel> readTriggerUIMetadataModel(Path packageRoot) {
        return readResourceFile(packageRoot, TRIGGER_UI_METADATA_RESOURCE_PATH)
                .flatMap(json -> parseTriggerUIMetadata(json,
                        packageRoot.resolve(TRIGGER_UI_METADATA_RESOURCE_PATH).toString()));
    }

    Optional<ArtifactInfo.Resolved> readArtifactInfo(Path packageRoot) {
        return readArtifactMetadata(packageRoot)
                .flatMap(metadata -> Optional.ofNullable(metadata.artifactInfo()));
    }

    Optional<ArtifactMetadata> readArtifactMetadata(Path packageRoot) {
        Optional<Path> metadataFile = resolveSafeRelativePath(packageRoot, TRIGGER_UI_METADATA_RESOURCE_PATH);
        if (metadataFile.isEmpty()) {
            return Optional.empty();
        }
        Path file = metadataFile.get();
        Path resourceRoot = file.getParent();
        try (Reader reader = Files.newBufferedReader(file, StandardCharsets.UTF_8)) {
            return parseArtifactMetadata(reader, file.toString(),
                    relative -> readResourceFile(resourceRoot, relative));
        } catch (IOException | JsonParseException | IllegalStateException e) {
            LOGGER.log(Level.WARNING, "Ignoring artifactInfo in " + file, e);
            return Optional.empty();
        }
    }

    private Optional<ArtifactMetadata> parseArtifactMetadata(Reader sourceReader, String source,
                                                              Function<String, Optional<String>> assetReader)
            throws IOException {
        try (JsonReader reader = new JsonReader(sourceReader)) {
            ArtifactDocument document = readArtifactDocument(reader);
            if (document.version() == null || !SUPPORTED_VERSION.matcher(document.version()).matches()) {
                return Optional.empty();
            }
            ArtifactInfo info = document.artifactInfo();
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
            String triggerKind = TriggerKind.isValid(document.triggerKind()) ? document.triggerKind() : null;
            if (resolved == null && triggerKind == null) {
                return Optional.empty();
            }
            return Optional.of(new ArtifactMetadata(resolved, triggerKind));
        }
    }

    private ArtifactDocument readArtifactDocument(JsonReader reader) throws IOException {
        String version = null;
        String triggerKind = null;
        ArtifactInfo artifactInfo = null;
        reader.beginObject();
        while (reader.hasNext()) {
            switch (reader.nextName()) {
                case "version" -> version = reader.nextString();
                case "metadata" -> triggerKind = readTriggerKind(reader);
                case "artifactInfo" -> artifactInfo = plainGson.fromJson(reader, ArtifactInfo.class);
                default -> reader.skipValue();
            }
        }
        reader.endObject();
        return new ArtifactDocument(version, triggerKind, artifactInfo);
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
        return TriggerKind.coalesce(triggerKind, kind);
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

    private record ArtifactDocument(String version, String triggerKind, ArtifactInfo artifactInfo) {
    }

    private Optional<TriggerUIMetadataModel> parseTriggerUIMetadata(String json, String source) {
        try {
            TriggerUIMetadataModel model = TriggerUIAuthoringParser.parse(json);
            if (model != null && model.version() != null && SUPPORTED_VERSION.matcher(model.version()).matches()) {
                return Optional.of(model);
            }
            LOGGER.log(Level.WARNING, "Unsupported trigger-ui-metadata.json version \""
                    + (model == null ? null : model.version()) + "\" in " + source + "; expected v1.x");
            return Optional.empty();
        } catch (JsonParseException | IllegalArgumentException | IllegalStateException e) {
            LOGGER.log(Level.WARNING, "Ignoring invalid trigger-ui-metadata.json in " + source, e);
            return Optional.empty();
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
        String key = moduleInfo.org() + "/" + moduleInfo.moduleName() + ":"
                + (moduleInfo.version() == null ? "" : moduleInfo.version());
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
            Optional<Package> pkg = PackageUtil.getModulePackageOffline(
                    moduleInfo.org(), moduleInfo.moduleName(), moduleInfo.version());
            return pkg.map(aPackage -> aPackage.project().sourceRoot());
        } catch (Throwable e) {
            return Optional.empty();
        }
    }

    /**
     * Resolves {@code relativePath} against {@code root}, refusing anything that would land outside
     * of it. This is the single boundary guard for every connector-authored relative path read out of
     * a {@code .bala} -- a {@code trigger-metadata.json}/{@code trigger-ui-metadata.json} resource path,
     * or an icon path inside {@code artifactInfo} -- so the escape check only needs auditing once: a
     * syntactic pre-check ({@link #isSafeRelativePath}) followed by {@code resolve -> normalize ->
     * startsWith(root) -> isRegularFile}.
     */
    private Optional<Path> resolveSafeRelativePath(Path root, String relativePath) {
        if (!isSafeRelativePath(relativePath)) {
            return Optional.empty();
        }
        Path file = root.resolve(relativePath).normalize();
        if (!file.startsWith(root) || !Files.isRegularFile(file)) {
            return Optional.empty();
        }
        return Optional.of(file);
    }

    /** Reads a package-relative file as UTF-8 text, guarding against it escaping {@code root}. */
    private Optional<String> readResourceFile(Path root, String relativePath) {
        return resolveSafeRelativePath(root, relativePath).flatMap(file -> {
            try {
                return Optional.of(Files.readString(file, StandardCharsets.UTF_8));
            } catch (IOException e) {
                return Optional.empty();
            }
        });
    }
}
