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

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.flowmodelgenerator.core.InstructionLoader;
import io.ballerina.flowmodelgenerator.core.copilot.model.Service;
import io.ballerina.projects.Package;

import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.logging.Logger;

/**
 * Service loader for loading library service definitions.
 * Loads trigger services from service-index.sqlite and generic services from generic-services.json.
 *
 * @since 1.7.0
 */
public class ServiceLoader {

    private static final Logger LOGGER = Logger.getLogger(ServiceLoader.class.getName());
    private static final String GENERIC_SERVICES_JSON_PATH = "/copilot/generic-services.json";
    /**
     * System property that forces the trigger-service source: {@code "index"} pins every library to
     * the SQLite service-index path; anything else (including unset) lets schema-driven libraries be
     * served from trigger metadata + the semantic model.
     */
    static final String TRIGGER_SOURCE_PROPERTY = "ballerina.copilot.triggerSource";

    private static final Gson GSON = new Gson();

    /**
     * Lazily cached generic-services entries keyed by library name, held as <b>parsed JSON rather than
     * {@link Service} objects</b>.
     *
     * <p>The cache is static and process-wide, while the entries it hands out are mutated downstream: the
     * two enrichers write onto whatever services they are given, and the schema-derived merge writes an
     * {@code instructions} string onto a colliding entry. Caching the objects themselves would let one
     * library's load permanently alter what every later load sees. Deserializing per call is what keeps each
     * caller's entries its own, which is exactly the guarantee the old {@code GSON.fromJson} hop provided.
     */
    private static volatile Map<String, JsonArray> genericServicesCache;

    private ServiceLoader() {
        // Prevent instantiation
    }

    /**
     * Loads all services for a given library from the service-index DB and generic services.
     * Index-sourced entries carry a {@code name} (the service-type name); callers that want deprecation
     * flags should pass the result through
     * {@link CopilotDeprecationEnricher#enrich(java.util.List, java.util.List)} before consuming.
     *
     * <p>If a generic-services.json entry shares its {@code name} with an index-sourced fixed
     * entry, the generic entry takes precedence and the fixed one is dropped. This lets curated
     * generic definitions (e.g. a hand-written {@code http:Listener} listener spec) override the
     * raw shape produced by the SQLite index.
     *
     * @param libraryName the library name (e.g., "ballerina/http", "ballerinax/kafka")
     * @return all services for this library
     */
    public static List<Service> loadAllServices(String libraryName) {
        return mergeWithGenericServices(libraryName, ServiceIndexLoader.loadFromServiceIndex(libraryName),
                false);
    }

    /**
     * Loads all services for a library, preferring the schema-driven path (trigger metadata + semantic
     * model) whenever a metadata document resolves for the library. Setting the system property
     * {@value #TRIGGER_SOURCE_PROPERTY} to {@code "index"} pins everything to the SQLite path.
     *
     * <p>The schema path is attempted for every library, not a fixed set: it returns empty for anything with
     * no metadata document, which is the overwhelming majority and costs one {@code stat} against the
     * already-resolved package. Falling through is therefore the normal case and is not logged.
     *
     * <p>Empty is two different outcomes, and only one of them falls back:
     * <ul>
     *   <li><b>No document</b> — the library is not schema-driven, so the service index is its only source
     *       and is used silently, exactly as before.</li>
     *   <li><b>Document resolved, produced nothing</b> — the index is <i>not</i> consulted. Everything it
     *       holds for a schema-driven library is a subset of what the document describes, so it cannot repair
     *       this outcome, only disguise it by substituting a thinner catalog for a real defect. An obvious
     *       absence is preferred over a confident-looking downgrade.</li>
     * </ul>
     *
     * @param libraryName   the library name (e.g., "ballerinax/kafka")
     * @param pkg           the resolved package the caller already compiled (may be null)
     * @param semanticModel the package's semantic model (may be null)
     * @return all services for this library
     */
    public static List<Service> loadAllServices(String libraryName, Package pkg,
                                                SemanticModel semanticModel) {
        if (!"index".equals(System.getProperty(TRIGGER_SOURCE_PROPERTY))) {
            TriggerSchemaServiceLoader.LoadResult result =
                    TriggerSchemaServiceLoader.load(libraryName, pkg, semanticModel);
            if (!result.services().isEmpty()) {
                return mergeWithGenericServices(libraryName, result.services(), true);
            }
            if (result.documentResolved()) {
                LOGGER.warning("Trigger metadata resolved for " + libraryName + " but produced no"
                        + " services. Not falling back to the service index: the index catalog is a"
                        + " strict subset of what this document describes, so substituting it would"
                        + " hide the failure behind a poorer answer. Check the veto report — the usual"
                        + " cause is a package release the document no longer matches.");
                // The curated overlay is still emitted. It is not a fallback for the document: it
                // states project conventions the document never carried, so it stands whether or not
                // the metadata path produced anything, and dropping it here would lose ballerina/http
                // and ballerina/graphql their hand-written guidance over an unrelated failure.
                return mergeWithGenericServices(libraryName, List.of(), false);
            }
        }
        return loadAllServices(libraryName);
    }

    /**
     * Applies the generic-services overlay. What a {@code name} collision means depends on where the fixed
     * entry came from.
     *
     * <p><b>Index-derived ({@code schemaDerived == false}) — replace.</b> The curated entry wins and the
     * index entry is dropped, exactly as before: an index row carries a listener and a method list and
     * nothing else, which is why the curated prose was written in the first place.
     *
     * <p><b>Schema-derived ({@code schemaDerived == true}) — <i>merge</i>.</b> The metadata-derived entry
     * survives and absorbs the curated guidance. This case was silently destroying work:
     * {@code ballerina/http} and {@code ballerina/graphql} both declare {@code type.name = "Service"} and
     * both have a curated entry named {@code Service}, so their entire trigger-metadata documents rendered
     * nothing at all.
     *
     * <p>The two sources are not substitutes: the document states the <i>facts</i> (types, presence,
     * annotations, binding), while the curated file states the <i>conventions</i> a document deliberately
     * cannot carry. Merging keeps both; the old behaviour kept only the second.
     *
     * @param libraryName   the library being loaded
     * @param fixedServices the non-generic entries
     * @param schemaDerived whether {@code fixedServices} came from the trigger-metadata pipeline
     * @return the merged service list
     */
    private static List<Service> mergeWithGenericServices(String libraryName, List<Service> fixedServices,
                                                      boolean schemaDerived) {
        List<Service> genericServices = getGenericServices(libraryName);

        Set<String> genericNames = new HashSet<>();
        for (Service svc : genericServices) {
            if (svc.getName() != null) {
                genericNames.add(svc.getName());
            }
        }

        Set<String> absorbed = new HashSet<>();
        List<Service> services = new ArrayList<>();
        for (Service svc : fixedServices) {
            String name = svc.getName();
            if (name != null && genericNames.contains(name)) {
                if (!schemaDerived) {
                    continue;
                }
                absorbed.add(name);
                InstructionLoader.loadServiceInstruction(libraryName)
                        .ifPresent(svc::setInstructions);
            }
            services.add(svc);
        }
        // Document order is preserved for whatever was not absorbed, so the index path emits exactly the
        // list it emitted before.
        for (Service svc : genericServices) {
            if (svc.getName() != null && absorbed.contains(svc.getName())) {
                continue;
            }
            services.add(svc);
        }
        return services;
    }

    /**
     * Returns cached generic services for a specific library from the generic-services.json resource.
     *
     * @param libraryName the library name (e.g., "ballerina/http")
     * @return freshly deserialized services for this library, or an empty list if not found
     */
    private static List<Service> getGenericServices(String libraryName) {
        Map<String, JsonArray> cache = genericServicesCache;
        if (cache == null) {
            synchronized (ServiceLoader.class) {
                cache = genericServicesCache;
                if (cache == null) {
                    cache = loadGenericServicesMap();
                    genericServicesCache = cache;
                }
            }
        }
        JsonArray entries = cache.get(libraryName);
        if (entries == null) {
            return new ArrayList<>();
        }
        // Deserialized per call, never cached as objects — see genericServicesCache.
        List<Service> services = new ArrayList<>();
        for (JsonElement entry : entries) {
            services.add(GSON.fromJson(entry, Service.class));
        }
        return services;
    }

    /**
     * Parses generic-services.json once and indexes entries by library name.
     */
    private static Map<String, JsonArray> loadGenericServicesMap() {
        Map<String, JsonArray> map = new HashMap<>();

        try (InputStream inputStream = ServiceLoader.class.getResourceAsStream(GENERIC_SERVICES_JSON_PATH)) {
            if (inputStream == null) {
                LOGGER.warning("Generic services resource not found: " + GENERIC_SERVICES_JSON_PATH);
                return map;
            }

            try (InputStreamReader reader = new InputStreamReader(inputStream, StandardCharsets.UTF_8)) {
                JsonObject genericServicesData = JsonParser.parseReader(reader).getAsJsonObject();

                JsonArray allServices = genericServicesData.getAsJsonArray("services");
                if (allServices == null || allServices.isEmpty()) {
                    return map;
                }

                for (JsonElement serviceElement : allServices) {
                    JsonObject service = serviceElement.getAsJsonObject();

                    if (service.has("libraryName")) {
                        String libName = service.get("libraryName").getAsString();

                        JsonObject serviceObj = new JsonObject();
                        serviceObj.addProperty("type", service.get("type").getAsString());
                        if (service.has("name")) {
                            serviceObj.addProperty("name", service.get("name").getAsString());
                        }
                        serviceObj.addProperty("instructions", service.get("instructions").getAsString());

                        if (service.has("listener")) {
                            serviceObj.add("listener", service.get("listener"));
                        }

                        map.computeIfAbsent(libName, k -> new JsonArray()).add(serviceObj);
                    }
                }
            }
        } catch (IOException e) {
            LOGGER.warning("Failed to load generic services: " + e.getMessage());
        }

        return map;
    }
}
