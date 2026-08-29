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

package io.ballerina.flowmodelgenerator.core.copilot.service;

import io.ballerina.modelgenerator.commons.trigger.models.IdentifierSpec;
import io.ballerina.modelgenerator.commons.trigger.models.TriggerMetadataModel;
import io.ballerina.modelgenerator.commons.trigger.models.TypeRef;
import io.ballerina.modelgenerator.commons.trigger.utils.TypeRefResolver;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * Service-tier resolution: what a document says about cardinality, the identifier slot, required imports and
 * platform dependencies. Pure functions of the document, read by {@link ServiceAspects}.
 *
 * <p>Held apart from {@link ServiceAspects} because that class carries per-library state (a memoized
 * listener object) while everything here is stateless.
 *
 * @since 1.7.0
 */
final class ServiceRules {

    /** A required import exists for its side effect only, so it is always aliased to {@code _}. */
    static final String SIDE_EFFECT_IMPORT_ALIAS = "_";

    private ServiceRules() {
        // Prevent instantiation
    }

    // ---- cardinality ------------------------------------------------------------------------------

    /**
     * @param multipleListeners          this service type may attach to more than one listener
     * @param multipleServices           one listener may host more than one service, of any type
     * @param multipleServicesOfSameType one listener may host more than one service of this type
     */
    record Cardinality(boolean multipleListeners, boolean multipleServices,
                       boolean multipleServicesOfSameType) {
    }

    /**
     * Reads the three cardinality flags. Each is permissive unless the document explicitly forbids it, so an
     * absent key states no restriction rather than the strictest one.
     */
    static Cardinality resolveCardinality(TriggerMetadataModel.ServiceType serviceType,
                                          TriggerMetadataModel.Listener listener) {
        boolean multipleServices = listener == null
                || permissiveUnlessForbidden(listener.multipleServicesAllowed());
        boolean sameType = multipleServices
                && (listener == null
                        || permissiveUnlessForbidden(listener.multipleServicesOfSameTypeAllowed()));
        return new Cardinality(
                serviceType == null || permissiveUnlessForbidden(serviceType.multipleListenersAllowed()),
                multipleServices,
                sameType);
    }

    private static boolean permissiveUnlessForbidden(Boolean declared) {
        return !Boolean.FALSE.equals(declared);
    }

    // ---- identifier slot --------------------------------------------------------------------------

    /**
     * @param required whether the slot must be written
     * @param forms    the legal syntactic forms; never empty
     */
    record IdentifierSlot(boolean required, List<String> forms) {
    }

    /**
     * The identifier slot between {@code service} and {@code on new …}, or empty when the connector does
     * not consult it — which is what a document stating no usable form means.
     */
    static Optional<IdentifierSlot> resolveIdentifier(IdentifierSpec identifier) {
        if (identifier == null) {
            return Optional.empty();
        }
        List<String> forms = identifier.form() == null ? List.of()
                : identifier.form().stream()
                        .filter(form -> form != null && !form.isBlank())
                        .toList();
        if (forms.isEmpty()) {
            return Optional.empty();
        }
        return Optional.of(new IdentifierSlot(
                IdentifierSpec.PRESENCE_REQUIRED.equals(identifier.presence()), forms));
    }

    // ---- required imports -------------------------------------------------------------------------

    /**
     * @param module the {@code org/module} to import
     * @param alias  always {@link #SIDE_EFFECT_IMPORT_ALIAS}
     */
    record ImportDirective(String module, String alias) {
    }

    /** The side-effect-only imports a listener needs. An entry missing org or module is skipped. */
    static List<ImportDirective> resolveRequiredImports(TriggerMetadataModel.Listener listener) {
        List<ImportDirective> directives = new ArrayList<>();
        if (listener == null || listener.requiredImports() == null) {
            return directives;
        }
        for (TriggerMetadataModel.RequiredImport required : listener.requiredImports()) {
            if (required == null || required.packageInfo() == null) {
                continue;
            }
            String org = required.packageInfo().org();
            String module = TypeRefResolver.moduleOf(new TypeRef(null, required.packageInfo()));
            if (org == null || org.isEmpty() || module == null) {
                continue;
            }
            directives.add(new ImportDirective(org + "/" + module, SIDE_EFFECT_IMPORT_ALIAS));
        }
        return directives;
    }

    // ---- platform dependencies --------------------------------------------------------------------

    /**
     * @param coordinate      Maven {@code group:artifact[:version]}
     * @param provided        the build will not fetch it, so the consuming project must supply it
     * @param acquisitionUrl  where to obtain it; may be {@code null}
     * @param acquisitionNote licensing or download caveats; may be {@code null}
     * @param nativeLibraries native artifacts that must be on the loader path
     */
    record PlatformDependency(String coordinate,
                              boolean provided,
                              String acquisitionUrl,
                              String acquisitionNote,
                              List<NativeLibrary> nativeLibraries) {
    }

    /**
     * @param os       the OS this artifact is for
     * @param file     the artifact file name
     * @param variable the OS loader-path variable, or {@code null} for an OS with no known one
     */
    record NativeLibrary(String os, String file, String variable) {
    }

    /** The native artifacts a listener needs. A dependency without a usable coordinate is skipped. */
    static List<PlatformDependency> resolvePlatformDependencies(TriggerMetadataModel.Listener listener) {
        List<PlatformDependency> resolved = new ArrayList<>();
        if (listener == null || listener.platformDependencies() == null) {
            return resolved;
        }
        for (TriggerMetadataModel.PlatformDependency dependency : listener.platformDependencies()) {
            if (dependency == null) {
                continue;
            }
            String coordinate = coordinate(dependency);
            if (coordinate == null) {
                continue;
            }
            TriggerMetadataModel.Acquisition acquisition = dependency.acquisition();
            resolved.add(new PlatformDependency(
                    coordinate,
                    TriggerMetadataModel.PlatformDependency.SCOPE_PROVIDED.equals(dependency.scope()),
                    acquisition == null ? null : blankToNull(acquisition.url()),
                    acquisition == null ? null : blankToNull(acquisition.note()),
                    nativeLibraries(dependency)));
        }
        return resolved;
    }

    private static List<NativeLibrary> nativeLibraries(
            TriggerMetadataModel.PlatformDependency dependency) {
        List<NativeLibrary> libraries = new ArrayList<>();
        if (dependency.nativeLibraries() == null) {
            return libraries;
        }
        for (TriggerMetadataModel.NativeLibrary library : dependency.nativeLibraries()) {
            if (library == null || library.os() == null || library.file() == null) {
                continue;
            }
            libraries.add(new NativeLibrary(library.os(), library.file(), discoveryVariable(library.os())));
        }
        return libraries;
    }

    private static String discoveryVariable(String os) {
        return switch (os) {
            case TriggerMetadataModel.NativeLibrary.OS_LINUX -> "LD_LIBRARY_PATH";
            case TriggerMetadataModel.NativeLibrary.OS_WINDOWS -> "PATH";
            case TriggerMetadataModel.NativeLibrary.OS_MACOS -> "DYLD_LIBRARY_PATH";
            default -> null;
        };
    }

    private static String coordinate(TriggerMetadataModel.PlatformDependency dependency) {
        String group = blankToNull(dependency.groupId());
        String artifact = blankToNull(dependency.artifactId());
        if (group == null || artifact == null) {
            return null;
        }
        String version = blankToNull(dependency.version());
        return version == null ? group + ":" + artifact : group + ":" + artifact + ":" + version;
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }
}
