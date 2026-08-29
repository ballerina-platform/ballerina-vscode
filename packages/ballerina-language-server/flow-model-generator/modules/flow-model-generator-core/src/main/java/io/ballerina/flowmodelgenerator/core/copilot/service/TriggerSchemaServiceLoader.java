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

import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.flowmodelgenerator.core.copilot.model.Service;
import io.ballerina.modelgenerator.commons.ModuleInfo;
import io.ballerina.modelgenerator.commons.trigger.LibraryMetadataReader;
import io.ballerina.modelgenerator.commons.trigger.models.TriggerMetadataModel;
import io.ballerina.modelgenerator.commons.trigger.models.TypeRef;
import io.ballerina.projects.Package;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.function.BiConsumer;
import java.util.logging.Logger;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Schema-driven Copilot service loader: builds a library's {@code services} JSON from two read-only
 * sources instead of the SQLite service-index —
 * <ol>
 *   <li><b>{@code trigger-metadata.json}</b>, the authoring metadata: which service types exist, the
 *       handler vocabulary of marker types, parameter types/optionality, and return types;</li>
 *   <li><b>the semantic model</b> of the same resolved package the manager already compiles: listener
 *       class and init parameters, the declared methods and doc comments of concrete service types, and
 *       validation that every metadata claim exists in the resolved package version.</li>
 * </ol>
 *
 * <p><b>Structure.</b> This class only orchestrates: it resolves the document, builds the facts once,
 * pairs service types with listeners, then runs an ordered list of components over each pair. A component
 * maps a read-only scope to a mutable draft and owns exactly one spec construct, so a spec change edits one
 * component, and no component can depend on another except through {@link TriggerScope}. See
 * {@link AspectRegistry} for the ordered list.
 *
 * <p><b>Failure model.</b> Three distinct outcomes, deliberately not merged:
 * <ul>
 *   <li><b>Not a trigger library</b> — no document resolves at either tier, so an empty array is returned
 *       and the caller uses the SQLite service index. The majority of libraries; not logged.</li>
 *   <li><b>Library-level abort</b> — a document was found but nothing could be built from it: it declares
 *       no listener or service type, or no listener resolves against the package. An empty array is
 *       returned with {@code documentResolved == true}, which tells the caller <b>not</b> to substitute the
 *       index, since a poorer catalog presented as authoritative hides the defect. Always logged.</li>
 *   <li><b>Entry-level veto</b> — one service type or one handler is dropped with an attributable
 *       reason while the rest of the library is served normally.</li>
 * </ul>
 *
 * <p>A document declaring a spec <b>major</b> this build does not implement is refused rather than
 * misread — see {@link #supportsSpecMajor}.
 *
 * <p>A marker service type declares no methods in the library source — its handler contract is enforced by
 * a compiler plugin at user-code compile time — so no symbol carries a doc comment for a handler or its
 * parameters, and the metadata document does not model descriptions. Handler and handler-parameter
 * descriptions are therefore omitted for marker service types, never fabricated.
 *
 * @since 1.7.0
 */
final class TriggerSchemaServiceLoader {

    private static final Logger LOGGER = Logger.getLogger(TriggerSchemaServiceLoader.class.getName());

    private static final String DEFAULT_ORG = "ballerinax";

    /** The spec major this build implements. A new major is structural, so it cannot be read as this one. */
    private static final int SUPPORTED_SPEC_MAJOR = 1;

    private static final Pattern SPEC_VERSION = Pattern.compile("^v(\\d+)\\.\\d+$");

    private TriggerSchemaServiceLoader() {
        // Prevent instantiation
    }

    /**
     * Whether this build can read a document declaring {@code version}.
     *
     * <p>Only a <b>recognised</b> major it does not implement is refused. A minor is additive, so any
     * {@code v1.x} is read; an absent or unparseable version is also read, because it says nothing about
     * structure and refusing on it would invent a failure mode for documents that are otherwise fine — the
     * gate exists to stop a <i>known</i> newer structure being parsed as this one, not to enforce the
     * schema.
     *
     * @param version the document's declared spec version; may be {@code null}
     * @return whether the document may be read
     */
    static boolean supportsSpecMajor(String version) {
        if (version == null) {
            return true;
        }
        Matcher matcher = SPEC_VERSION.matcher(version.trim());
        if (!matcher.matches()) {
            return true;
        }
        return Integer.parseInt(matcher.group(1)) == SUPPORTED_SPEC_MAJOR;
    }

    /**
     * The outcome of one library load.
     *
     * @param services         the emitted service entries, in document order
     * @param documentResolved whether a metadata document was found for this library at all, which differs
     *                         from whether it produced anything. Empty-with-no-document means "not a
     *                         trigger library"; empty-with-a-document means the document is there and
     *                         yielded nothing, which is a defect. Only the caller can act on the
     *                         distinction, so it is reported rather than collapsed into an empty list
     */
    record LoadResult(List<Service> services, boolean documentResolved) {
    }

    /**
     * Loads services for a trigger library.
     *
     * <p>Returns an empty list when inputs are missing, no metadata document resolves for the library, or
     * anything throws. Reasons an entry was dropped are logged, naming the library and the subject.
     *
     * @param libraryName   the library name, e.g. {@code "ballerinax/kafka"}
     * @param pkg           the resolved package the caller already compiled; may be {@code null}
     * @param semanticModel the package's semantic model; may be {@code null}
     * @return the services and whether a document was found
     */
    static LoadResult load(String libraryName, Package pkg, SemanticModel semanticModel) {
        if (pkg == null || semanticModel == null) {
            return empty(false);
        }

        String packageName = ServiceIndexLoader.stripOrg(libraryName);
        String org = libraryName.contains("/")
                ? libraryName.substring(0, libraryName.indexOf('/'))
                : DEFAULT_ORG;

        // Flipped the moment a document is in hand, and read by the catch below: an exception thrown
        // after that point is a failure to *process* a document that exists, not an absence of metadata.
        boolean documentResolved = false;
        try {
            Optional<TriggerMetadataModel> resolution = resolveMetadata(org, packageName);
            documentResolved = resolution.isPresent();
            if (resolution.isEmpty()) {
                return empty(false);
            }
            TriggerMetadataModel metadata = resolution.get();
            if (!supportsSpecMajor(metadata.version())) {
                // documentResolved stays true: the library HAS metadata, this build just cannot read it.
                // Falling back to the service index would answer a structurally newer document with an
                // older, thinner catalog and present it as authoritative.
                LOGGER.warning("Ignoring trigger metadata for " + libraryName + ": it declares spec version "
                        + metadata.version() + ", and this build implements major v" + SUPPORTED_SPEC_MAJOR
                        + ". A new major is structural, so the document cannot be read as v"
                        + SUPPORTED_SPEC_MAJOR + ".");
                return empty(true);
            }
            if (metadata.listeners() == null || metadata.listeners().isEmpty()
                    || metadata.serviceTypes() == null || metadata.serviceTypes().isEmpty()) {
                return empty(true);
            }

            TriggerSemanticFacts facts = new TriggerSemanticFacts(semanticModel, pkg);
            ListenerPairingResolver.Pairings paired = ListenerPairingResolver.resolveWithDiagnostics(
                    metadata.listeners(), metadata.serviceTypes(), facts);
            List<ListenerPairingResolver.ListenerPairing> pairings = paired.pairings();
            if (pairings.isEmpty()) {
                // An unresolvable listener means the resolved package no longer matches the metadata's
                // world view — abort the library so the caller falls back, rather than emitting a
                // listener the generated code could not instantiate.
                TypeRef declared = metadata.listeners().get(0).type();
                LOGGER.warning("No listener class resolvable for " + libraryName
                        + " (metadata declared: " + (declared == null ? null : declared.name()) + ")");
                paired.vetoes().forEach(v -> LOGGER.warning("Dropped for " + libraryName + ": " + v));
                return new LoadResult(List.of(), true);
            }

            AspectRegistry registry = new AspectRegistry();
            // The spec's registry is built once per library: it is shared by every service type, and by
            // every attach point once the later phases land.
            AnnotationRegistry annotations = AnnotationRegistry.of(metadata);
            List<Service> services = new ArrayList<>();
            // Seeded with the pairing tier's own drops: a service type whose listener did not resolve never
            // reaches `buildService`, and the log line above fires only when every pairing fails.
            List<String> vetoes = new ArrayList<>(paired.vetoes());

            for (ListenerPairingResolver.ListenerPairing pairing : pairings) {
                ServiceDraft draft = buildService(libraryName, org, packageName, metadata, annotations,
                        pairing, facts, registry);
                vetoes.addAll(draft.vetoes());
                if (draft.isVetoed()) {
                    continue;
                }
                services.add(draft.toModel());
            }

            for (String veto : vetoes) {
                LOGGER.warning("Dropped for " + libraryName + ": " + veto);
            }
            return new LoadResult(services, true);
        } catch (RuntimeException e) {
            LOGGER.warning("Failed to load schema-driven services for " + libraryName + ": " + e.getMessage());
            return empty(documentResolved);
        }
    }

    /** Runs the ordered service components over one (service type × listener) pair. */
    private static ServiceDraft buildService(String libraryName, String org, String packageName,
                                             TriggerMetadataModel metadata, AnnotationRegistry annotations,
                                             ListenerPairingResolver.ListenerPairing pairing,
                                             TriggerSemanticFacts facts, AspectRegistry registry) {
        TriggerScope scope = new TriggerScope(
                libraryName,
                org,
                packageName,
                ServiceIdentityResolver.homeModule(pairing.listener(), packageName),
                metadata,
                annotations,
                pairing.serviceType(),
                pairing.listener(),
                pairing.listenerClass(),
                facts,
                facts::declaresType);

        ServiceDraft draft = new ServiceDraft();
        for (BiConsumer<TriggerScope, ServiceDraft> aspect : registry.serviceAspects()) {
            aspect.accept(scope, draft);
            if (draft.isVetoed()) {
                // A vetoed entry is dropped whole; running the remaining components would build output
                // nothing will read.
                break;
            }
        }
        return draft;
    }

    private static LoadResult empty(boolean documentResolved) {
        return new LoadResult(List.of(), documentResolved);
    }

    /**
     * Resolves the trigger metadata document for a library, preferring the one the connector ships itself
     * over the LS-bundled copy.
     *
     * <p>The connector's own document is versioned with the connector, so it can never describe a release
     * the resolved package predates, and a connector published after this LS is served without an LS
     * release. The bundled tier covers the libraries that do not ship a document yet — which is all of them
     * today.
     *
     * <p>The two tiers are ordered here rather than inside {@link LibraryMetadataReader}, so that the reader
     * answers exactly one question ("does this root hold a readable document?") and the precedence stays
     * with the consumer that has an opinion about it. {@code TriggerModelReader} orders its own tiers the
     * same way, over different documents.
     *
     * <p>Both tiers are keyed by name off one {@link ModuleInfo}: the shipped tier resolves the
     * connector's {@code .bala}, the bundled tier the LS's classpath copy.
     *
     * <p><b>A bundled document is filed under the library's own package name</b>, with no indirection.
     * There used to be a per-library override map, needed by exactly one entry: the CDC document for
     * {@code ballerinax/mssql} was filed as {@code mssql.cdc}, after the module its listener lives in
     * rather than after the package a caller asks for. The 2026-08-19 corpus refiled it — and its three
     * new siblings, {@code mysql}, {@code postgresql} and {@code oracledb} — under the package name, so
     * every document now resolves by the default and the map had nothing left to say. The documents are
     * still validated against the actually resolved package before use, which is what makes filing a
     * cross-module listener under the parent package safe.
     */
    private static Optional<TriggerMetadataModel> resolveMetadata(String org, String packageName) {
        LibraryMetadataReader reader = LibraryMetadataReader.getInstance();
        ModuleInfo moduleInfo = new ModuleInfo(org, packageName, packageName, null);
        return reader.getTriggerMetadataModel(moduleInfo)
                .or(() -> reader.getPackagedTriggerMetadataModel(moduleInfo));
    }

}
