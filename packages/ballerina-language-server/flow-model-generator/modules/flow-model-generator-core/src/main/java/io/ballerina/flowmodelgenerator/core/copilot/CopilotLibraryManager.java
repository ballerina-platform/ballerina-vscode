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

package io.ballerina.flowmodelgenerator.core.copilot;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.reflect.TypeToken;
import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.api.symbols.Symbol;
import io.ballerina.flowmodelgenerator.core.InstructionLoader;
import io.ballerina.flowmodelgenerator.core.copilot.database.LibraryDatabaseAccessor;
import io.ballerina.flowmodelgenerator.core.copilot.model.Annotation;
import io.ballerina.flowmodelgenerator.core.copilot.model.Client;
import io.ballerina.flowmodelgenerator.core.copilot.model.Library;
import io.ballerina.flowmodelgenerator.core.copilot.model.Service;
import io.ballerina.flowmodelgenerator.core.copilot.service.AnnotationLoader;
import io.ballerina.flowmodelgenerator.core.copilot.service.CopilotDeprecationEnricher;
import io.ballerina.flowmodelgenerator.core.copilot.service.CopilotListenerNameEnricher;
import io.ballerina.flowmodelgenerator.core.copilot.service.ServiceLoader;
import io.ballerina.flowmodelgenerator.core.copilot.util.SymbolProcessor;
import io.ballerina.modelgenerator.commons.ModuleInfo;
import io.ballerina.modelgenerator.commons.PackageUtil;
import io.ballerina.projects.Package;

import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.lang.reflect.Type;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Core orchestrator for Copilot library operations.
 * Coordinates between database access, symbol processing, and service loading.
 *
 * @since 1.7.0
 */
public class CopilotLibraryManager {

    private static final Gson GSON = new Gson();
    private static final String EXCLUSION_JSON_PATH = "/copilot/exclusion.json";
    private static final String TYPE_GENERIC = "generic";
    // Attachment points owned by the curated service-index catalog (kept as-is; not supplemented
    // from the Semantic Model).
    private static final String SERVICE_ATTACH_POINT = "SERVICE";
    private static final String OBJECT_METHOD_ATTACH_POINT = "OBJECT_METHOD";

    // Libraries for which README content should be included in the filtered response.
    private static final Set<String> README_WHITELIST = Set.of(
            "ballerinax/salesforce",
            "ballerina/ai",
            "ballerinax/cdc",
            "ballerinax/mysql",
            "ballerinax/postgresql",
            "ballerina/ftp",
            "ballerina/file"
    );

    /**
     * Loads all libraries from the database.
     * Returns a list of libraries with name and description only.
     *
     * @return List of Library objects containing name and description
     */
    public List<Library> loadLibrariesFromDatabase(String mode) {
        List<Library> libraries = new ArrayList<>();

        try {
            Map<String, String> packageToDescriptionMap = LibraryDatabaseAccessor.loadAllPackages(mode);

            for (Map.Entry<String, String> entry : packageToDescriptionMap.entrySet()) {
                Library library = new Library(entry.getKey(), entry.getValue());
                libraries.add(library);
            }
        } catch (SQLException e) {
            throw new RuntimeException("Failed to load libraries from database: " + e.getMessage(), e);
        }

        applyLibraryExclusions(libraries);
        return libraries;
    }

    /**
     * Loads filtered libraries using the semantic model.
     * Returns libraries with full details including clients, functions, typedefs, and services.
     * Applies exclusions and augments with instructions before returning.
     * README content is included only for libraries in {@link #README_WHITELIST}.
     *
     * @param libraryNames Array of library names in "org/package_name" format to filter
     * @return List of Library objects with complete information
     */
    public List<Library> loadFilteredLibraries(String[] libraryNames) {
        List<Library> libraries = new ArrayList<>();

        for (String libraryName : libraryNames) {
            // Parse library name "org/package_name"
            String[] parts = libraryName.split("/");
            if (parts.length != 2) {
                continue; // Skip invalid format
            }
            String org = parts[0];
            String packageName = parts[1];

            // Create module info (use latest version by passing null)
            ModuleInfo moduleInfo = new ModuleInfo(org, packageName, org + "/" +
                    packageName, null);

            // Resolve the package once; the README loader below reuses this same Package
            // to avoid a second (potentially network-bound) resolution.
            Optional<Package> optPackage = PackageUtil.getModulePackage(
                    PackageUtil.getSampleProject(), org, packageName);
            if (optPackage.isEmpty()) {
                continue;
            }
            Package pkg = optPackage.get();
            SemanticModel semanticModel = PackageUtil.getCompilation(pkg)
                    .getSemanticModel(pkg.getDefaultModule().moduleId());

            // Get the package description from database
            String description = LibraryDatabaseAccessor.getPackageDescription(org, packageName).orElse("");

            // Create library object
            Library library = new Library(libraryName, description);

            // Process module symbols to extract clients, functions, and typedefs
            SymbolProcessor.SymbolProcessingResult symbolResult = SymbolProcessor.processModuleSymbols(
                    semanticModel,
                    moduleInfo,
                    org,
                    packageName
            );

            library.setClients(symbolResult.getClients());
            library.setFunctions(symbolResult.getFunctions());
            library.setTypeDefs(symbolResult.getTypeDefs());

            JsonArray servicesJson = ServiceLoader.loadAllServices(libraryName);
            List<Symbol> moduleSymbols = semanticModel.moduleSymbols();
            CopilotDeprecationEnricher.enrich(servicesJson, moduleSymbols);
            CopilotListenerNameEnricher.enrich(servicesJson, moduleSymbols);
            List<Service> services = new ArrayList<>();
            for (JsonElement serviceElement : servicesJson) {
                Service service = GSON.fromJson(serviceElement, Service.class);
                services.add(service);
            }
            library.setServices(services);

            JsonArray annotationsJson = AnnotationLoader.loadFromServiceIndex(libraryName);
            List<Annotation> annotations = new ArrayList<>();
            Set<String> seenAnnotations = new HashSet<>();
            for (JsonElement annotationElement : annotationsJson) {
                Annotation annotation = GSON.fromJson(annotationElement, Annotation.class);
                annotations.add(annotation);
                seenAnnotations.add(annotation.getName() + "::" + annotation.getAttachmentPoint());
            }
            // Supplement the curated service-index catalog with Semantic-Model annotation
            // definitions for the remaining attachment points. The service-index owns the
            // SERVICE and OBJECT_METHOD points, so those are left untouched here.
            for (Annotation annotation : symbolResult.getAnnotations()) {
                String attachmentPoint = annotation.getAttachmentPoint();
                if (SERVICE_ATTACH_POINT.equals(attachmentPoint)
                        || OBJECT_METHOD_ATTACH_POINT.equals(attachmentPoint)) {
                    continue;
                }
                if (seenAnnotations.add(annotation.getName() + "::" + attachmentPoint)) {
                    annotations.add(annotation);
                }
            }
            library.setAnnotations(annotations);

            if (README_WHITELIST.contains(libraryName)) {
                readPackageReadme(pkg).ifPresent(library::setReadme);
            }

            libraries.add(library);
        }

        applyLibraryExclusions(libraries);
        augmentLibrariesWithInstructions(libraries);

        return libraries;
    }

    /**
     * Searches libraries by keywords across packages, types, connectors, and functions.
     *
     * @param keywords Array of search keywords
     * @return List of Library objects containing name and description (up to 20 results)
     */
    public List<Library> getLibrariesBySearch(String[] keywords) {
        List<Library> libraries = new ArrayList<>();

        try {
            Map<String, String> packageToDescriptionMap = LibraryDatabaseAccessor.searchLibrariesByKeywords(keywords);

            for (Map.Entry<String, String> entry : packageToDescriptionMap.entrySet()) {
                Library library = new Library(entry.getKey(), entry.getValue());
                libraries.add(library);
            }
        } catch (SQLException e) {
            throw new RuntimeException("Failed to search libraries by keywords: " + e.getMessage(), e);
        }

        applyLibraryExclusions(libraries);
        return libraries;
    }

    /**
     * Reads the README.md content from the docs directory of a resolved .bala package.
     *
     * @param pkg the resolved package
     * @return an Optional containing the README content if present
     */
    private Optional<String> readPackageReadme(Package pkg) {
        Path readmePath = pkg.project().sourceRoot().resolve("docs").resolve("README.md");
        try {
            return Optional.of(Files.readString(readmePath, StandardCharsets.UTF_8));
        } catch (IOException e) {
            // README is optional — absent or unreadable yields an empty result.
            return Optional.empty();
        }
    }

    /**
     * Applies library exclusions by removing excluded functions from libraries and clients.
     * Exclusions are loaded from the exclusion.json resource file.
     *
     * @param libraries the list of libraries to apply exclusions to
     */
    public void applyLibraryExclusions(List<Library> libraries) {
        List<ExclusionEntry> exclusions = loadExclusions();
        if (exclusions == null || exclusions.isEmpty()) {
            return;
        }

        Map<String, ExclusionEntry> exclusionMap = new LinkedHashMap<>();
        for (ExclusionEntry entry : exclusions) {
            if (entry.name != null) {
                exclusionMap.put(entry.name, entry);
            }
        }

        libraries.removeIf(library -> {
            String libraryName = library.getName();
            if (libraryName == null || !exclusionMap.containsKey(libraryName)) {
                return false;
            }

            ExclusionEntry exclusion = exclusionMap.get(libraryName);

            // If only the name is specified (no functions or clients), exclude the entire library
            boolean hasFunctionExclusions = exclusion.functions != null && !exclusion.functions.isEmpty();
            boolean hasClientExclusions = exclusion.clients != null && !exclusion.clients.isEmpty();
            if (!hasFunctionExclusions && !hasClientExclusions) {
                return true;
            }

            // Exclude module-level functions
            if (hasFunctionExclusions && library.getFunctions() != null) {
                Set<String> excludedNames = exclusion.functions.stream()
                        .map(f -> f.name)
                        .collect(Collectors.toSet());
                library.getFunctions().removeIf(f -> excludedNames.contains(f.getName()));
            }

            // Exclude client functions
            if (hasClientExclusions && library.getClients() != null) {
                applyClientExclusions(library.getClients(), exclusion.clients);
            }

            return false;
        });
    }

    private void applyClientExclusions(List<Client> clients, List<ExcludedClient> exclusionClients) {
        Map<String, Set<String>> clientExclusionMap = new LinkedHashMap<>();
        for (ExcludedClient clientExclusion : exclusionClients) {
            if (clientExclusion.name != null && clientExclusion.functions != null) {
                Set<String> funcNames = clientExclusion.functions.stream()
                        .map(f -> f.name)
                        .collect(Collectors.toSet());
                clientExclusionMap.put(clientExclusion.name, funcNames);
            }
        }

        for (Client client : clients) {
            String clientName = client.getName();
            if (clientName != null && clientExclusionMap.containsKey(clientName)
                    && client.getFunctions() != null) {
                Set<String> excludedFuncs = clientExclusionMap.get(clientName);
                client.getFunctions().removeIf(f -> excludedFuncs.contains(f.getName()));
            }
        }
    }

    private List<ExclusionEntry> loadExclusions() {
        try (InputStream inputStream = CopilotLibraryManager.class.getResourceAsStream(EXCLUSION_JSON_PATH)) {
            if (inputStream == null) {
                return null;
            }
            try (InputStreamReader reader = new InputStreamReader(inputStream, StandardCharsets.UTF_8)) {
                Type listType = new TypeToken<List<ExclusionEntry>>() { }.getType();
                return GSON.fromJson(reader, listType);
            }
        } catch (IOException e) {
            return null;
        }
    }

    /**
     * Augments libraries with custom instructions loaded from resource files.
     * Adds library-level instructions, service instructions for generic services,
     * and test generation instructions for all services.
     *
     * @param libraries the libraries to augment
     */
    public void augmentLibrariesWithInstructions(List<Library> libraries) {
        for (Library library : libraries) {
            String libraryName = library.getName();
            if (libraryName == null || libraryName.isEmpty()) {
                continue;
            }

            // Add library-level instructions
            InstructionLoader.loadLibraryInstruction(libraryName)
                    .ifPresent(library::setInstructions);

            // Process services for service and test instructions
            if (library.getServices() != null) {
                augmentServicesWithInstructions(library.getServices(), libraryName);
            }
        }
    }

    private void augmentServicesWithInstructions(List<Service> services, String libraryName) {
        for (Service service : services) {
            // Add test generation instruction to all services
            InstructionLoader.loadTestInstruction(libraryName)
                    .ifPresent(service::setTestGenerationInstruction);

            // Add service instruction only to generic services
            if (TYPE_GENERIC.equals(service.getType())) {
                InstructionLoader.loadServiceInstruction(libraryName)
                        .ifPresent(service::setInstructions);
            }
        }
    }

    // Exclusion model classes for deserializing exclusion.json
    private static class ExclusionEntry {
        String name = "";
        List<ExcludedFunction> functions = new ArrayList<>();
        List<ExcludedClient> clients = new ArrayList<>();
    }

    private static class ExcludedClient {
        String name = "";
        List<ExcludedFunction> functions = new ArrayList<>();
    }

    private static class ExcludedFunction {
        String name = "";
    }
}
