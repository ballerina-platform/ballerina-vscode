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
import io.ballerina.modelgenerator.commons.ModuleInfo;
import io.ballerina.modelgenerator.commons.PackageUtil;
import io.ballerina.modelgenerator.commons.trigger.models.TriggerMetadataModel;
import io.ballerina.modelgenerator.commons.trigger.models.TriggerUISchemaModel;
import io.ballerina.modelgenerator.commons.trigger.utils.TriggerMetadataGson;
import io.ballerina.projects.Package;
import io.ballerina.projects.PackageDescriptor;
import io.ballerina.projects.PackageName;
import io.ballerina.projects.PackageOrg;
import io.ballerina.projects.PackageVersion;
import io.ballerina.projects.environment.PackageRepository;
import io.ballerina.projects.environment.ResolutionOptions;
import io.ballerina.projects.environment.ResolutionRequest;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.logging.Level;
import java.util.logging.Logger;
import java.util.regex.Pattern;

/**
 * Connector-agnostic entry point for reading the trigger model family, shared by every LS extension.
 */
public final class LibraryMetadataReader {

    private static final Logger LOGGER = Logger.getLogger(LibraryMetadataReader.class.getName());

    private static final String TRIGGER_METADATA_RESOURCE_PATH = "resources/trigger-metadata.json";
    private static final String TRIGGER_UI_SCHEMA_RESOURCE_PATH = "resources/trigger-ui-schema.json";
    private static final String PACKAGED_TRIGGER_METADATA_ROOT = "trigger-metadata-models";
    private static final String PACKAGED_TRIGGER_METADATA_FILE = "trigger-metadata.json";
    /** Sized for the designer, which resolves one connector at a time. */
    private static final int MAX_CACHE_SIZE = 2;

    /**
     * Sized for the Copilot, which walks every library in one request. At the designer's bound of 2, the
     * corpus's 14 bundled documents evicted each other and nearly every request re-parsed the same JSON.
     */
    private static final int PACKAGED_METADATA_CACHE_SIZE = 20;
    private static final Pattern SUPPORTED_VERSION = Pattern.compile("^v1\\.\\d+$");

    private static final Duration PACKAGE_ROOT_CACHE_TTL = Duration.ofSeconds(60);

    private static final LibraryMetadataReader INSTANCE = new LibraryMetadataReader();

    private final Cache<String, Optional<Path>> packageRootCache =
            Caffeine.newBuilder().maximumSize(MAX_CACHE_SIZE).expireAfterWrite(PACKAGE_ROOT_CACHE_TTL).build();
    private final Cache<String, Optional<TriggerMetadataModel>> packagedMetadataCache =
            Caffeine.newBuilder().maximumSize(PACKAGED_METADATA_CACHE_SIZE).build();

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

    /** The connector's own {@code resources/trigger-ui-schema.json}, resolved from its {@code .bala}. */
    public Optional<TriggerUISchemaModel> getTriggerUISchemaModel(ModuleInfo moduleInfo) {
        return packageRoot(moduleInfo).flatMap(this::readTriggerUISchemaModel);
    }

    /** Whether the connector's {@code .bala} is present in the local repository. */
    public boolean isLocallyResolvable(ModuleInfo moduleInfo) {
        return packageRoot(moduleInfo).isPresent();
    }

    /**
     * The LS's bundled {@code trigger-metadata-models/<moduleName>/trigger-metadata.json} classpath
     * resource, if any.
     */
    public Optional<TriggerMetadataModel> getPackagedTriggerMetadataModel(ModuleInfo moduleInfo) {
        if (moduleInfo == null || moduleInfo.moduleName() == null) {
            return Optional.empty();
        }
        return packagedMetadataCache.get(moduleInfo.moduleName(), this::readPackagedMetadata);
    }

    /**
     * The connector's own {@code resources/trigger-metadata.json}, resolved from the Ballerina
     * <b>local</b> repository rather than Central.
     */
    public Optional<TriggerMetadataModel> getTriggerMetadataModelFromLocalRepository(ModuleInfo moduleInfo) {
        return localPackageRoot(moduleInfo).flatMap(this::readTriggerMetadataModel);
    }

    /** The connector's own {@code resources/trigger-ui-schema.json}, resolved from the local repository. */
    public Optional<TriggerUISchemaModel> getTriggerUISchemaModelFromLocalRepository(ModuleInfo moduleInfo) {
        return localPackageRoot(moduleInfo).flatMap(this::readTriggerUISchemaModel);
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

    private Optional<TriggerMetadataModel> readPackagedMetadata(String moduleName) {
        String resourcePath = PACKAGED_TRIGGER_METADATA_ROOT + "/" + moduleName + "/"
                + PACKAGED_TRIGGER_METADATA_FILE;
        try (InputStream is = getClass().getClassLoader().getResourceAsStream(resourcePath)) {
            if (is == null) {
                return Optional.empty();
            }
            String json = new String(is.readAllBytes(), StandardCharsets.UTF_8);
            TriggerMetadataModel model = TriggerMetadataGson.instance().fromJson(json, TriggerMetadataModel.class);
            return requireSupportedVersion(model, resourcePath);
        } catch (IOException | JsonParseException e) {
            // A bundled document is this repo's own, so a failure here is a build defect. Logged all the
            // same: silence is what made the shipped-document equivalent undiagnosable.
            LOGGER.warning("Ignoring bundled " + resourcePath + ": " + e);
            return Optional.empty();
        }
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

    /** Refuses a {@code null}/absent/unsupported-major version, logging why. */
    private Optional<TriggerMetadataModel> requireSupportedVersion(TriggerMetadataModel model, String source) {
        if (model != null && model.version() != null && SUPPORTED_VERSION.matcher(model.version()).matches()) {
            return Optional.of(model);
        }
        LOGGER.log(Level.WARNING, "Unsupported trigger-metadata.json version \""
                + (model == null ? null : model.version()) + "\" in " + source + "; expected v1.x");
        return Optional.empty();
    }

    private Optional<TriggerUISchemaModel> readTriggerUISchemaModel(Path packageRoot) {
        return readResourceFile(packageRoot, TRIGGER_UI_SCHEMA_RESOURCE_PATH).flatMap(json -> {
            try {
                return Optional.ofNullable(plainGson.fromJson(json, TriggerUISchemaModel.class));
            } catch (JsonParseException e) {
                return Optional.empty();
            }
        });
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
            Optional<Package> pkg = PackageUtil.getModulePackageOffline(
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
