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
import com.google.gson.reflect.TypeToken;
import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.api.symbols.Symbol;
import io.ballerina.flowmodelgenerator.core.InstructionLoader;
import io.ballerina.flowmodelgenerator.core.copilot.central.CentralLibrarySearchAccessor;
import io.ballerina.flowmodelgenerator.core.copilot.database.LibraryDatabaseAccessor;
import io.ballerina.flowmodelgenerator.core.copilot.model.Client;
import io.ballerina.flowmodelgenerator.core.copilot.model.Library;
import io.ballerina.flowmodelgenerator.core.copilot.model.Service;
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
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.logging.Level;
import java.util.logging.Logger;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * Core orchestrator for Copilot library operations.
 * Coordinates between database access, symbol processing, and service loading.
 *
 * @since 1.7.0
 */
public class CopilotLibraryManager {

    private static final Logger LOGGER = Logger.getLogger(CopilotLibraryManager.class.getName());
    private static final Gson GSON = new Gson();
    private static final String EXCLUSION_JSON_PATH = "/copilot/exclusion.json";
    private static final String TYPE_GENERIC = "generic";

    // Maximum number of libraries a keyword search hands back, applied after exclusions.
    private static final int MAX_SEARCH_RESULTS = 10;

    // When set to "true", keyword search skips Ballerina Central and queries the bundled index only.
    private static final String USE_LOCAL_INDEX_PROPERTY = "ballerina.copilot.librarySearch.useLocalIndex";

    // Organizations whose packages have their documentation included in the filtered response.
    // Documentation is trusted for these orgs, so it is whitelisted at the organization level
    // rather than per package.
    private static final Set<String> DOC_WHITELIST_ORGS = Set.of("ballerina", "ballerinax");

    private static final String DOCS_DIR = "docs";
    private static final String MODULES_DIR = "modules";

    // Package-level documentation file names, in order of preference. Newer packages ship
    // README.md; older ones ship Package.md.
    private static final List<String> PACKAGE_DOC_NAMES = List.of("README.md", "Package.md");

    // Module-level documentation file names, in order of preference.
    private static final List<String> MODULE_DOC_NAMES = List.of("README.md", "Module.md");

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
     * Documentation is included only for packages of the organizations listed in
     * {@link #DOC_WHITELIST_ORGS}.
     *
     * @param libraryNames Array of library names in "org/package_name" format to filter
     * @return List of Library objects with complete information
     */
    public List<Library> loadFilteredLibraries(String[] libraryNames) {
        return loadFilteredLibraries(libraryNames, Map.of());
    }

    /**
     * {@link #loadFilteredLibraries(String[])} against explicitly pinned package versions.
     *
     * <p>The no-pin overload resolves whatever the local repository serves as latest, which is right at
     * request time and wrong whenever two runs have to be compared: a release landing between them shows up
     * as a catalog difference no code change caused. Pinning makes a render reproducible.
     *
     * @param libraryNames   the libraries to load, in {@code "org/package"} form
     * @param pinnedVersions the version to resolve per library name; a library absent from the map resolves
     *                       latest, exactly as before
     * @return the loaded libraries
     */
    public List<Library> loadFilteredLibraries(String[] libraryNames, Map<String, String> pinnedVersions) {
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
            String pinned = pinnedVersions == null ? null : pinnedVersions.get(libraryName);
            Optional<Package> optPackage = pinned == null || pinned.isBlank()
                    ? PackageUtil.getModulePackage(PackageUtil.getSampleProject(), org, packageName)
                    : PackageUtil.getModulePackage(PackageUtil.getSampleProject(), org, packageName, pinned);
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
                    packageName,
                    pkg
            );

            library.setClients(symbolResult.getClients());
            library.setFunctions(symbolResult.getFunctions());
            library.setTypeDefs(symbolResult.getTypeDefs());

            List<Service> services = ServiceLoader.loadAllServices(libraryName, pkg, semanticModel);
            List<Symbol> moduleSymbols = semanticModel.moduleSymbols();
            CopilotDeprecationEnricher.enrich(services, moduleSymbols);
            CopilotListenerNameEnricher.enrich(services, moduleSymbols);
            library.setServices(services);

            // Annotations come from the Semantic Model alone: the compiler is authoritative for
            // attachment points and type constraints, and it reports every annotation the module
            // declares at every point it declares them (service, object function, type, record
            // field, parameter, return, listener, ...). The curated service-index catalog covered
            // only SERVICE/OBJECT_METHOD for six packages, and every row it holds is either
            // reproduced by the compiler or contradicted by it (ftp's FunctionConfig, filed as
            // OBJECT_METHOD where the compiler reports RESOURCE), so it is no longer consulted.
            library.setAnnotations(symbolResult.getAnnotations());

            if (DOC_WHITELIST_ORGS.contains(org)) {
                readPackageDocumentation(pkg).ifPresent(library::setReadme);
            }

            libraries.add(library);
        }

        applyLibraryExclusions(libraries);
        augmentLibrariesWithInstructions(libraries);

        return libraries;
    }

    /**
     * Searches libraries by keywords against the Ballerina Central registry, falling back to the
     * bundled search index when Central cannot be reached.
     *
     * @param keywords Array of search keywords
     * @return List of Library objects containing name and description (up to
     *         {@value #MAX_SEARCH_RESULTS} results)
     */
    public List<Library> getLibrariesBySearch(String[] keywords) {
        List<Library> libraries = toLibraries(searchPackageDescriptions(keywords));

        // Exclusions run before truncation so that an excluded library does not consume a result slot.
        applyLibraryExclusions(libraries);
        return libraries.size() > MAX_SEARCH_RESULTS
                ? new ArrayList<>(libraries.subList(0, MAX_SEARCH_RESULTS))
                : libraries;
    }

    /**
     * Resolves keyword matches to a package name to description map, preferring Ballerina Central and
     * degrading to the bundled search index when the Central lookup fails.
     *
     * @param keywords Array of search keywords
     * @return map of package names to descriptions, in relevance order
     */
    private Map<String, String> searchPackageDescriptions(String[] keywords) {
        if (Boolean.parseBoolean(System.getProperty(USE_LOCAL_INDEX_PROPERTY))) {
            return searchLocalIndex(keywords);
        }

        try {
            return new CentralLibrarySearchAccessor().searchLibrariesByKeywords(keywords);
        } catch (Exception e) {
            LOGGER.log(Level.WARNING,
                    "Ballerina Central library search failed; falling back to the bundled search index", e);
            return searchLocalIndex(keywords);
        }
    }

    private Map<String, String> searchLocalIndex(String[] keywords) {
        try {
            return LibraryDatabaseAccessor.searchLibrariesByKeywords(keywords);
        } catch (SQLException e) {
            throw new RuntimeException("Failed to search libraries by keywords: " + e.getMessage(), e);
        }
    }

    private static List<Library> toLibraries(Map<String, String> packageToDescriptionMap) {
        List<Library> libraries = new ArrayList<>();
        for (Map.Entry<String, String> entry : packageToDescriptionMap.entrySet()) {
            libraries.add(new Library(entry.getKey(), entry.getValue()));
        }
        return libraries;
    }

    /**
     * Reads the documentation of a resolved .bala package from its docs directory.
     * <p>
     * The package-level document is taken from the first available of
     * {@link #PACKAGE_DOC_NAMES}, so packages that ship {@code Package.md} instead of
     * {@code README.md} are still covered. Documentation of any submodules is appended
     * after it, each under its own heading.
     *
     * @param pkg the resolved package
     * @return an Optional containing the documentation if any was found
     */
    private Optional<String> readPackageDocumentation(Package pkg) {
        Path docsDir = pkg.project().sourceRoot().resolve(DOCS_DIR);
        StringBuilder content = new StringBuilder();
        readFirstAvailableDoc(docsDir, PACKAGE_DOC_NAMES).ifPresent(content::append);
        appendModuleDocumentation(docsDir, content);
        return content.isEmpty() ? Optional.empty() : Optional.of(content.toString());
    }

    /**
     * Reads the first readable, non-blank file among the given candidate names.
     *
     * @param dir            the directory to look in
     * @param candidateNames candidate file names, in order of preference
     * @return an Optional containing the content of the first available candidate
     */
    private Optional<String> readFirstAvailableDoc(Path dir, List<String> candidateNames) {
        for (String candidateName : candidateNames) {
            Path docPath = dir.resolve(candidateName);
            if (!Files.isRegularFile(docPath)) {
                continue;
            }
            try {
                String content = Files.readString(docPath, StandardCharsets.UTF_8);
                if (!content.isBlank()) {
                    return Optional.of(content);
                }
            } catch (IOException e) {
                // Unreadable document — fall through to the next candidate.
            }
        }
        return Optional.empty();
    }

    /**
     * Appends the documentation of each submodule to the given content, if present.
     * Modules are processed in a stable order so the result does not vary between runs.
     *
     * @param docsDir the docs directory of the package
     * @param content the content to append to
     */
    private void appendModuleDocumentation(Path docsDir, StringBuilder content) {
        Path modulesDir = docsDir.resolve(MODULES_DIR);
        if (!Files.isDirectory(modulesDir)) {
            return;
        }

        List<Path> moduleDirs;
        try (Stream<Path> paths = Files.list(modulesDir)) {
            // Sorted by the full path, which orders by module directory name since they
            // all share the same parent.
            moduleDirs = paths.filter(Files::isDirectory)
                    .sorted(Comparator.comparing(Path::toString))
                    .toList();
        } catch (IOException e) {
            // Module documentation is optional — an unreadable directory is not an error.
            return;
        }

        for (Path moduleDir : moduleDirs) {
            Path moduleName = moduleDir.getFileName();
            if (moduleName == null) {
                continue;
            }
            Optional<String> moduleDoc = readFirstAvailableDoc(moduleDir, MODULE_DOC_NAMES);
            if (moduleDoc.isEmpty()) {
                continue;
            }
            if (!content.isEmpty()) {
                content.append(System.lineSeparator()).append(System.lineSeparator());
            }
            content.append("## Module: ").append(moduleName)
                    .append(System.lineSeparator()).append(System.lineSeparator())
                    .append(moduleDoc.get());
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
     * Adds library-level instructions and service instructions for generic services.
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

    /**
     * Attaches the curated {@code service.md} to a library's generic services.
     *
     * <p>The file is read <b>once per library</b>, not once per service. It used to be loaded inside the
     * loop, which re-read the same classpath resource for every service a library declares — ten times for
     * {@code ballerinax/trigger.github}. The {@code test.md} channel that shared that loop was retired: no
     * instance had existed since the curated corpus was removed, and test conventions live in
     * {@code ballerina/test}'s own {@code library.md}.
     */
    private void augmentServicesWithInstructions(List<Service> services, String libraryName) {
        Optional<String> serviceInstruction = InstructionLoader.loadServiceInstruction(libraryName);
        if (serviceInstruction.isEmpty()) {
            return;
        }
        for (Service service : services) {
            if (TYPE_GENERIC.equals(service.getType())) {
                service.setInstructions(serviceInstruction.get());
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
