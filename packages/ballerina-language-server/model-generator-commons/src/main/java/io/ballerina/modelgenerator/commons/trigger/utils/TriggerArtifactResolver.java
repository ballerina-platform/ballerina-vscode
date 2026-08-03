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

import io.ballerina.compiler.api.ModuleID;
import io.ballerina.modelgenerator.commons.CommonUtils;
import io.ballerina.modelgenerator.commons.IconDescriptor;
import io.ballerina.modelgenerator.commons.PackageUtil;
import io.ballerina.modelgenerator.commons.trigger.models.TriggerArtifactModel;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Resolves the display-label data — icon, display name, and instance-label annotation fields — for an
 * entry-point artifact (a trigger/service module), replacing a hardcoded per-connector map. Only the
 * LS's bundled classpath metadata is consulted; a non-bundled connector has none.
 *
 * @since 1.9.0
 */
public final class TriggerArtifactResolver {

    // Package roots are resolved lazily (only on a bundled-metadata miss) and cached by module
    // coordinates so the artifact-tree hot path pays the bala-cache resolution at most once per module.
    private static final Map<String, Optional<Path>> PACKAGE_ROOT_CACHE = new ConcurrentHashMap<>();

    private TriggerArtifactResolver() {
    }

    private static Optional<TriggerArtifactModel> metadata(ModuleID moduleId) {
        return moduleId == null ? Optional.empty()
                : metadata(moduleId.orgName(), moduleId.packageName(), moduleId.moduleName(), moduleId.version());
    }

    /**
     * The trigger metadata for a module: the LS's bundled classpath resource only. A non-bundled
     * connector's own shipped {@code resources/trigger-artifact.json} is not read in this phase.
     */
    private static Optional<TriggerArtifactModel> metadata(String orgName, String packageName, String moduleName,
                                                      String version) {
        if (moduleName == null) {
            return Optional.empty();
        }
        return TriggerArtifactReader.getInstance().getBundledMetadata(moduleName);
    }

    /** The resolved package root of the module (its bala source root), if it can be resolved locally. */
    private static Optional<Path> resolvePackageRoot(String orgName, String packageName, String version) {
        String key = orgName + "/" + packageName + ":" + version;
        return PACKAGE_ROOT_CACHE.computeIfAbsent(key, ignored -> {
            try {
                return PackageUtil.getModulePackage(PackageUtil.getSampleProject(), orgName, packageName, version)
                        .map(pkg -> pkg.project().sourceRoot());
            } catch (Throwable e) {
                return Optional.empty();
            }
        });
    }


    /** The display label for a module, e.g. {@code "RabbitMQ Event Integration"}; empty if unknown. */
    public static Optional<String> resolveDisplayName(ModuleID moduleId) {
        return metadata(moduleId).map(TriggerArtifactModel::displayName);
    }

    /**
     * The service-annotation field names to try, in order, for the instance-label suffix (e.g.
     * {@code ["queueName", "topicName"]}); empty when the module has no metadata or no such fields.
     */
    public static List<String> resolveLabelFields(ModuleID moduleId) {
        return metadata(moduleId)
                .map(TriggerArtifactModel::labelFields)
                .filter(Objects::nonNull)
                .orElse(List.of());
    }

    /**
     * Resolves the {@link IconDescriptor} for a module. The {@code url} comes from (1) a declared
     * absolute URL, (2) a declared package-relative resource served as a {@code data:} URI, or (3) the
     * derived Ballerina Central PNG. Declared {@code glyph}/{@code color}/{@code kind} pass through;
     * the IDE completes any missing ones from its brand-icon registry.
     */
    public static IconDescriptor resolveIcon(ModuleID moduleId) {
        return resolveIcon(moduleId.orgName(), moduleId.packageName(), moduleId.moduleName(), moduleId.version());
    }

    /**
     * Coordinate-based overload of {@link #resolveIcon(ModuleID)} for callers that hold package
     * coordinates directly (e.g. the service-designer catalog) rather than a compiler {@code ModuleID}.
     */
    public static IconDescriptor resolveIcon(String orgName, String packageName, String moduleName, String version) {
        IconDescriptor declared = metadata(orgName, packageName, moduleName, version)
                .map(TriggerArtifactModel::icon).orElse(null);
        String glyph = declared == null ? null : trimToNull(declared.glyph());
        String color = declared == null ? null : trimToNull(declared.color());
        String kind = declared == null ? null : trimToNull(declared.kind());
        // Theme-specific pair (a connector-shipped light/dark image); resolved to data: URIs so a surface
        // can switch per active theme.
        String light = resolveImageRef(orgName, packageName, version, declared == null ? null : declared.light());
        String dark = resolveImageRef(orgName, packageName, version, declared == null ? null : declared.dark());
        String declaredUrl = declared == null ? null : trimToNull(declared.url());

        if (declaredUrl != null) {
            if (isAbsoluteUri(declaredUrl)) {
                return new IconDescriptor(declaredUrl, glyph, color, kind, IconDescriptor.SOURCE_DECLARED, light, dark);
            }
            String dataUri = resolvePackageResource(orgName, packageName, version, declaredUrl);
            if (dataUri != null) {
                return new IconDescriptor(dataUri, glyph, color, kind, IconDescriptor.SOURCE_PACKAGE, light, dark);
            }
        }
        // No single url declared: fall back to the Central PNG for the `url` slot, but a declared
        // light/dark pair still marks the icon as package-sourced for theme-aware surfaces.
        String centralUrl = CommonUtils.generateIcon(orgName, packageName, version);
        String source = (light != null || dark != null) ? IconDescriptor.SOURCE_PACKAGE : IconDescriptor.SOURCE_CENTRAL;
        return new IconDescriptor(centralUrl, glyph, color, kind, source, light, dark);
    }

    /**
     * Resolves a connector-declared image reference: an absolute URL is kept verbatim; a package-relative
     * path is served from the {@code .bala} as a {@code data:} URI; blank/unresolvable yields {@code null}.
     */
    private static String resolveImageRef(String orgName, String packageName, String version, String ref) {
        String value = trimToNull(ref);
        if (value == null) {
            return null;
        }
        return isAbsoluteUri(value) ? value : resolvePackageResource(orgName, packageName, version, value);
    }

    private static boolean isAbsoluteUri(String value) {
        String lower = value.toLowerCase(Locale.ROOT);
        return lower.startsWith("http://") || lower.startsWith("https://") || lower.startsWith("data:");
    }

    /**
     * Reads a package-relative icon resource (e.g. {@code resources/icon.svg}) from the module's
     * resolved {@code .bala} and encodes it as a {@code data:} URI. Returns {@code null} if the package
     * root cannot be resolved or the file is missing/unreadable.
     */
    private static String resolvePackageResource(String orgName, String packageName, String version,
                                                 String relativePath) {
        return resolvePackageRoot(orgName, packageName, version).map(root -> {
            try {
                Path file = root.resolve(relativePath).normalize();
                if (!file.startsWith(root) || !Files.isRegularFile(file)) {
                    return null;
                }
                byte[] bytes = Files.readAllBytes(file);
                String encoded = Base64.getEncoder().encodeToString(bytes);
                return "data:" + mimeType(relativePath) + ";base64," + encoded;
            } catch (IOException e) {
                return null;
            }
        }).orElse(null);
    }

    private static String mimeType(String path) {
        String lower = path.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".svg")) {
            return "image/svg+xml";
        }
        if (lower.endsWith(".png")) {
            return "image/png";
        }
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
            return "image/jpeg";
        }
        return "application/octet-stream";
    }

    private static String trimToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }
}
