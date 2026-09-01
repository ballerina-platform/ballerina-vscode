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

import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.modelgenerator.commons.ModuleInfo;
import io.ballerina.modelgenerator.commons.trigger.LibraryMetadataReader;
import io.ballerina.projects.PackageManifest;
import io.ballerina.projects.Project;
import io.ballerina.projects.SemanticVersion;
import io.ballerina.servicemodelgenerator.extension.model.TriggerProperty;
import io.ballerina.servicemodelgenerator.extension.model.response.ModelResolutionIssue;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Decides, for one project, which connectors it actually uses as a {@code service ... on <module>:Listener}
 * are resolved to a version that predates schema-driven trigger support -- the set a "your connectors need
 * an update" prompt should be built from.
 *
 * <p>Deliberately narrower than "every resolved dependency": a connector used only as a client (e.g. a
 * Salesforce client with no trigger) is never flagged, since {@link ServiceListenerUsageScanner} only
 * reports modules a real {@code service} declaration attaches to.
 *
 * @since 1.3.0
 */
public final class ConnectorUpgradeAdvisor {

    private static final Logger LOGGER = Logger.getLogger(ConnectorUpgradeAdvisor.class.getName());
    private static final String LOCAL_REPOSITORY = "local";

    private ConnectorUpgradeAdvisor() {
    }

    /**
     * @param orgName            the connector's organization
     * @param moduleName         the connector's module name
     * @param packageName        the connector's package name (equal to {@code moduleName} for a
     *                           single-module package, which every connector here is)
     * @param currentVersion     the version this project actually resolves, per
     *                           {@link ConnectorVersionResolver}
     * @param minSupportedVersion the lowest version known to ship schema-driven trigger resources
     * @param breaking           whether {@code currentVersion}'s (major, minor) differs from
     *                           {@code minSupportedVersion}'s -- crossing a boundary that may carry a
     *                           breaking API change, and so is never bundled into a one-click update
     * @param explicitlyPinned   whether {@code Ballerina.toml} declares an explicit, non-local
     *                           {@code [[dependency]]} entry for this connector (a bump must edit it,
     *                           since {@code bal build} alone would keep re-resolving to the pin)
     * @param usedInFile         one file (relative to the package root) where the connector is used as
     *                           a service/listener, for the prompt's copy
     */
    public record ConnectorUpgradeAdvice(String orgName, String moduleName, String packageName,
                                         String currentVersion, String minSupportedVersion, boolean breaking,
                                         boolean explicitlyPinned, String usedInFile) {
    }

    /** The affected-connector list for {@code project}, or an empty list if none are affected. */
    public static List<ConnectorUpgradeAdvice> analyze(Project project, SemanticModel semanticModel) {
        List<ConnectorUpgradeAdvice> advice = new ArrayList<>();
        Map<ModuleInfo, String> usedModules;
        try {
            usedModules = ServiceListenerUsageScanner.findUsedListenerModules(project, semanticModel);
        } catch (Throwable e) {
            LOGGER.log(Level.FINE, "Connector-upgrade usage scan failed", e);
            return advice;
        }
        LibraryMetadataReader metadataReader = LibraryMetadataReader.getInstance();
        for (Map.Entry<ModuleInfo, String> entry : usedModules.entrySet()) {
            ModuleInfo used = entry.getKey();
            String usedInFile = entry.getValue();
            String orgName = used.org();
            String moduleName = used.moduleName();

            if (isLocalRepositoryDependency(project, orgName, moduleName)) {
                continue;
            }

            TriggerPropertiesRegistry.getInstance().forModule(orgName, moduleName).ifPresent(property -> {
                String minSupportedVersion = property.minSupportedVersion();
                if (minSupportedVersion == null) {
                    return;
                }
                String currentVersion = ConnectorVersionResolver.resolve(project, orgName, moduleName, null);
                if (currentVersion == null) {
                    return;
                }
                if (alreadySupported(metadataReader, orgName, moduleName, currentVersion, minSupportedVersion)) {
                    return;
                }
                boolean breaking = crossesMinorBoundary(currentVersion, minSupportedVersion);
                boolean explicitlyPinned = isExplicitlyPinned(project, orgName, moduleName);
                advice.add(new ConnectorUpgradeAdvice(orgName, moduleName, property.packageName(), currentVersion,
                        minSupportedVersion, breaking, explicitlyPinned, usedInFile));
            });
        }
        return advice;
    }

    /**
     * Whether the given resolved org/module/version needs surfacing as a {@link ModelResolutionIssue} --
     * called from the single-connector resolution RPCs ({@code getServiceInitModel}, {@code
     * getListenerModel}) exactly when their own schema-driven/legacy resolution already came back empty,
     * so a genuinely unsupported connector version gets a diagnosable reason instead of a response that's
     * indistinguishable from "legitimately nothing to show".
     */
    public static Optional<ModelResolutionIssue> checkResolvedVersion(String orgName, String moduleName,
                                                                      String version) {
        if (orgName == null || moduleName == null) {
            return Optional.empty();
        }
        Optional<TriggerProperty> property = TriggerPropertiesRegistry.getInstance().forModule(orgName,
                moduleName);
        if (property.isEmpty()) {
            return Optional.empty();
        }
        String minSupportedVersion = property.get().minSupportedVersion();
        LibraryMetadataReader metadataReader = LibraryMetadataReader.getInstance();
        if (minSupportedVersion != null) {
            if (version != null && alreadySupported(metadataReader, orgName, moduleName, version,
                    minSupportedVersion)) {
                return Optional.empty();
            }
            return Optional.of(new ModelResolutionIssue(ModelResolutionIssue.UNSUPPORTED_CONNECTOR_VERSION,
                    orgName, moduleName, version, minSupportedVersion));
        }
        if (version != null) {
            ModuleInfo moduleInfo = new ModuleInfo(orgName, moduleName, moduleName, version);
            if (metadataReader.isLocallyResolvable(moduleInfo)
                    && metadataReader.getTriggerMetadataModel(moduleInfo).isPresent()) {
                return Optional.empty();
            }
        }
        return Optional.of(new ModelResolutionIssue(ModelResolutionIssue.NO_SUPPORTED_VERSION_AVAILABLE,
                orgName, moduleName, version, null));
    }

    /**
     * True when the resolved version already has L1/L2 -- checked directly via
     * {@link LibraryMetadataReader} rather than trusting the version-string comparison alone, since a
     * user may have manually pinned above {@code minSupportedVersion} while a corrupted/incomplete local
     * cache still lacks the resource.
     */
    private static boolean alreadySupported(LibraryMetadataReader metadataReader, String orgName,
                                            String moduleName, String currentVersion, String minSupportedVersion) {
        try {
            if (SemanticVersion.from(currentVersion).lessThan(SemanticVersion.from(minSupportedVersion))) {
                return false;
            }
        } catch (RuntimeException e) {
            LOGGER.log(Level.FINE, "Could not compare connector versions", e);
        }
        ModuleInfo moduleInfo = new ModuleInfo(orgName, moduleName, moduleName, currentVersion);
        return metadataReader.isLocallyResolvable(moduleInfo)
                && metadataReader.getTriggerMetadataModel(moduleInfo).isPresent();
    }

    private static boolean crossesMinorBoundary(String currentVersion, String minSupportedVersion) {
        try {
            SemanticVersion current = SemanticVersion.from(currentVersion);
            SemanticVersion required = SemanticVersion.from(minSupportedVersion);
            return current.major() != required.major() || current.minor() != required.minor();
        } catch (RuntimeException e) {
            return true;
        }
    }

    private static boolean isLocalRepositoryDependency(Project project, String orgName, String moduleName) {
        return declaredDependency(project, orgName, moduleName)
                .filter(dependency -> LOCAL_REPOSITORY.equals(dependency.repository()))
                .isPresent();
    }

    private static boolean isExplicitlyPinned(Project project, String orgName, String moduleName) {
        return declaredDependency(project, orgName, moduleName)
                .filter(dependency -> !LOCAL_REPOSITORY.equals(dependency.repository()))
                .isPresent();
    }

    private static Optional<PackageManifest.Dependency> declaredDependency(Project project,
                                                                                      String orgName,
                                                                                      String moduleName) {
        if (project == null || orgName == null || moduleName == null) {
            return Optional.empty();
        }
        PackageManifest manifest = project.currentPackage().manifest();
        if (manifest == null || manifest.dependencies() == null) {
            return Optional.empty();
        }
        for (PackageManifest.Dependency dependency : manifest.dependencies()) {
            if (orgName.equals(dependency.org().value()) && moduleName.equals(dependency.name().value())) {
                return Optional.of(dependency);
            }
        }
        return Optional.empty();
    }
}
