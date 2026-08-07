/*
 *  Copyright (c) 2025, WSO2 LLC. (http://www.wso2.com)
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

package io.ballerina.flowmodelgenerator.core;

import com.google.gson.Gson;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import io.ballerina.centralconnector.RemoteCentral;
import io.ballerina.centralconnector.response.DependentPackage;
import io.ballerina.compiler.api.ModuleID;
import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.api.symbols.AnnotationAttachmentSymbol;
import io.ballerina.compiler.api.symbols.ClassSymbol;
import io.ballerina.compiler.api.symbols.Documentation;
import io.ballerina.compiler.api.symbols.FunctionTypeSymbol;
import io.ballerina.compiler.api.symbols.ModuleSymbol;
import io.ballerina.compiler.api.symbols.ParameterSymbol;
import io.ballerina.compiler.api.symbols.Qualifier;
import io.ballerina.compiler.api.symbols.StreamTypeSymbol;
import io.ballerina.compiler.api.symbols.TypeDescKind;
import io.ballerina.compiler.api.symbols.TypeSymbol;
import io.ballerina.compiler.api.symbols.UnionTypeSymbol;
import io.ballerina.compiler.api.values.ConstantValue;
import io.ballerina.flowmodelgenerator.core.model.AvailableNode;
import io.ballerina.flowmodelgenerator.core.model.Codedata;
import io.ballerina.flowmodelgenerator.core.model.FlowNode;
import io.ballerina.flowmodelgenerator.core.model.Metadata;
import io.ballerina.flowmodelgenerator.core.model.NodeBuilder;
import io.ballerina.flowmodelgenerator.core.model.NodeKind;
import io.ballerina.flowmodelgenerator.core.model.Option;
import io.ballerina.flowmodelgenerator.core.model.Property;
import io.ballerina.flowmodelgenerator.core.model.PropertyType;
import io.ballerina.flowmodelgenerator.core.model.SourceBuilder;
import io.ballerina.modelgenerator.commons.CommonUtils;
import io.ballerina.modelgenerator.commons.ModuleInfo;
import io.ballerina.modelgenerator.commons.PackageUtil;
import io.ballerina.projects.DependenciesToml;
import io.ballerina.projects.PackageDescriptor;
import io.ballerina.projects.PackageName;
import io.ballerina.projects.PackageOrg;
import io.ballerina.projects.Project;
import io.ballerina.projects.TomlDocument;
import io.ballerina.projects.environment.PackageMetadataResponse;
import io.ballerina.projects.environment.PackageResolver;
import io.ballerina.projects.environment.ResolutionOptions;
import io.ballerina.projects.environment.ResolutionRequest;
import io.ballerina.projects.environment.ResolutionResponse;

import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.logging.Level;
import java.util.logging.Logger;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import static io.ballerina.flowmodelgenerator.core.Constants.AI;
import static io.ballerina.flowmodelgenerator.core.Constants.Ai;
import static io.ballerina.flowmodelgenerator.core.Constants.BALLERINA;
import static io.ballerina.flowmodelgenerator.core.Constants.BALLERINAX;
import static io.ballerina.flowmodelgenerator.core.model.NodeKind.CHUNKER;
import static io.ballerina.flowmodelgenerator.core.model.NodeKind.CHUNKERS;
import static io.ballerina.flowmodelgenerator.core.model.NodeKind.CLASS_INIT;
import static io.ballerina.flowmodelgenerator.core.model.NodeKind.DATA_LOADER;
import static io.ballerina.flowmodelgenerator.core.model.NodeKind.DATA_LOADERS;
import static io.ballerina.flowmodelgenerator.core.model.NodeKind.EMBEDDING_PROVIDER;
import static io.ballerina.flowmodelgenerator.core.model.NodeKind.EMBEDDING_PROVIDERS;
import static io.ballerina.flowmodelgenerator.core.model.NodeKind.KNOWLEDGE_BASE;
import static io.ballerina.flowmodelgenerator.core.model.NodeKind.KNOWLEDGE_BASES;
import static io.ballerina.flowmodelgenerator.core.model.NodeKind.MODEL_PROVIDER;
import static io.ballerina.flowmodelgenerator.core.model.NodeKind.MODEL_PROVIDERS;
import static io.ballerina.flowmodelgenerator.core.model.NodeKind.SHORT_TERM_MEMORY_STORE;
import static io.ballerina.flowmodelgenerator.core.model.NodeKind.VECTOR_STORE;
import static io.ballerina.flowmodelgenerator.core.model.NodeKind.VECTOR_STORES;

/**
 * Utility class for resolving Ballerina AI module versions, their dependent modules, and supported features.
 * <p>
 * Dependent modules are resolved dynamically from Ballerina Central at runtime. A hardcoded fallback map is maintained
 * for offline scenarios. The {@code versionToFeatures} mapping must be updated when new {@code ballerina/ai} versions
 * introduce new feature categories.
 *
 * @since 1.2.0
 */
public class AiUtils {

    private static final Logger LOGGER = Logger.getLogger(AiUtils.class.getName());

    private static final Map<String, Set<NodeKind>> versionToFeatures = new HashMap<>();
    private static final Map<String, List<Module>> dependentModules = new HashMap<>();
    private static final Map<String, List<AvailableNode>> cachedModelProviderMap = new HashMap<>();
    private static final Map<String, List<AvailableNode>> cachedEmbeddingProviderMap = new HashMap<>();
    private static final Map<String, List<AvailableNode>> cachedVectorStoreMap = new HashMap<>();
    private static final Map<String, List<AvailableNode>> cachedChunkerMap = new HashMap<>();
    private static final Map<String, List<AvailableNode>> cachedDataLoaderMap = new HashMap<>();
    private static final Map<String, List<AvailableNode>> cachedShortTermMemoryStoreMap = new HashMap<>();
    private static final Map<String, List<AvailableNode>> cachedKnowledgeBaseMap = new HashMap<>();

    // Tracks which categories have been fully built for each AI version
    private static final Map<String, Set<NodeKind>> completedCategories = new HashMap<>();

    // Whether dynamic resolution from Ballerina Central has been attempted
    private static volatile boolean dependentModulesResolved = false;

    // Keyword cache: "org:name:version" -> list of keywords from Central
    private static final Map<String, List<String>> moduleKeywordsCache = new HashMap<>();

    // Interim keyword filter map — maps each category to keywords that identify relevant packages.
    private static final Map<NodeKind, List<String>> CATEGORY_KEYWORD_FILTERS = Map.of(
            MODEL_PROVIDER, List.of("Model Provider", "model", "llm"),
            EMBEDDING_PROVIDER, List.of("Embedding Provider", "embedding", "openai", "openrouter", "azure"),
            VECTOR_STORE, List.of("Vector Store", "vector"),
            CHUNKER, List.of("Chunker", "devant"),
            DATA_LOADER, List.of("Data Loader", "loader", "devant"),
            SHORT_TERM_MEMORY_STORE, List.of("Short Term Memory Store", "memory"),
            KNOWLEDGE_BASE, List.of("Knowledge Base", "knowledge", "azure")
    );

    private static final String PACKAGE = "package";
    private static final String ORG = "org";
    private static final String NAME = "name";
    private static final String VERSION = "version";
    private static final String INIT_METHOD = "init";
    private static final AiComponentDiskCache diskCache = new AiComponentDiskCache();

    public static final String MEMORY_DEFAULT_VALUE = "10";
    public static final String AI_PROMPT_TYPE = "ai:Prompt";

    static {
        versionToFeatures.put("1.0.0",
                Set.of(MODEL_PROVIDERS, EMBEDDING_PROVIDERS, VECTOR_STORES, KNOWLEDGE_BASES));
        versionToFeatures.put("1.3.0", Set.of(CHUNKERS, DATA_LOADERS));
        versionToFeatures.put("1.6.0", Set.of(SHORT_TERM_MEMORY_STORE));
        initFallbackDependentModules();
    }

    private static void initFallbackDependentModules() {
        InputStream is = AiUtils.class.getClassLoader()
                .getResourceAsStream("dependent_modules_fallback.json");
        if (is == null) {
            LOGGER.log(Level.WARNING, "dependent_modules_fallback.json not found on classpath");
            return;
        }
        try (InputStreamReader reader = new InputStreamReader(is, StandardCharsets.UTF_8)) {
            JsonObject json = new Gson().fromJson(reader, JsonObject.class);
            for (Map.Entry<String, JsonElement> entry : json.entrySet()) {
                List<Module> modules = new ArrayList<>();
                for (JsonElement elem : entry.getValue().getAsJsonArray()) {
                    JsonObject obj = elem.getAsJsonObject();
                    modules.add(new Module(
                            obj.get("org").getAsString(),
                            obj.get("name").getAsString(),
                            obj.get("version").getAsString()
                    ));
                }
                dependentModules.put(entry.getKey(), List.copyOf(modules));
            }
        } catch (IOException | RuntimeException e) {
            LOGGER.log(Level.WARNING, "Failed to load dependent_modules_fallback.json", e);
        }
    }

    /**
     * Copies a property value from one FlowNode to another.
     *
     * @param targetNode        the node to update
     * @param sourceNode        the node to copy from
     * @param targetPropertyKey the property key in the target node
     * @param sourcePropertyKey the property key in the source node
     */
    public static void copyPropertyValue(FlowNode targetNode, FlowNode sourceNode, String targetPropertyKey,
                                         String sourcePropertyKey) {
        Property targetProperty = targetNode.properties().get(targetPropertyKey);
        Optional<Property> sourceProperty = sourceNode.getProperty(sourcePropertyKey);

        if (targetProperty == null || sourceProperty.isEmpty() ||
                sourceProperty.get().value() == null) {
            return;
        }

        Property updatedProperty = createUpdatedProperty(targetProperty, sourceProperty.get().value());
        targetNode.properties().put(targetPropertyKey, updatedProperty);
    }

    /**
     * Creates an updated property with a new value while preserving all other fields.
     *
     * @param <T>              the type of the new value
     * @param originalProperty the original property
     * @param newValue         the new value to set
     * @return the updated property
     */
    public static <T> Property createUpdatedProperty(Property originalProperty, T newValue) {
        if (originalProperty == null) {
            throw new IllegalArgumentException("Original property cannot be null");
        }

        return new Property(
                originalProperty.metadata(),
                originalProperty.types(),
                newValue,
                originalProperty.oldValue(),
                originalProperty.placeholder(),
                originalProperty.optional(),
                originalProperty.editable(),
                originalProperty.advanced(),
                originalProperty.hidden(),
                originalProperty.modified(),
                originalProperty.diagnostics(),
                originalProperty.codedata(),
                originalProperty.advancedValue(),
                originalProperty.imports(),
                originalProperty.defaultValue(),
                originalProperty.comment(),
                originalProperty.dynamicFormFields(),
                originalProperty.itemOptions()
        );
    }

    /**
     * Creates a copy of a property marked as optional and advanced. All other fields are preserved from the original
     * property.
     *
     * @param original the property to copy from
     * @return the new property with optional=true and advanced=true
     */
    public static Property copyAsOptionalAdvanced(Property original) {
        if (original == null) {
            throw new IllegalArgumentException("Original property cannot be null");
        }
        return new Property(
                original.metadata(),
                original.types(),
                original.value(),
                original.oldValue(),
                original.placeholder(),
                true,  // optional
                original.editable(),
                true,  // advanced
                original.hidden(),
                original.modified(),
                original.diagnostics(),
                original.codedata(),
                original.advancedValue(),
                original.imports(),
                original.defaultValue(),
                original.comment(),
                original.dynamicFormFields(),
                original.itemOptions()
        );
    }

    /**
     * Creates a copy of a property with updated metadata label while preserving all other fields.
     *
     * @param original the property to copy from
     * @param newLabel the new label to set in metadata
     * @return the new property with updated metadata label
     */
    public static Property createPropertyWithUpdatedLabel(Property original, String newLabel) {
        if (original == null) {
            throw new IllegalArgumentException("Original property cannot be null");
        }
        if (original.metadata() == null) {
            throw new IllegalArgumentException("Original property metadata cannot be null");
        }

        Metadata updatedMetadata = new Metadata(
                newLabel,
                original.metadata().description(),
                original.metadata().keywords(),
                original.metadata().icon(),
                original.metadata().functionKind(),
                original.metadata().data(),
                original.metadata().connectors()
        );

        return new Property(
                updatedMetadata,
                original.types(),
                original.value(),
                original.oldValue(),
                original.placeholder(),
                original.optional(),
                original.editable(),
                original.advanced(),
                original.hidden(),
                original.modified(),
                original.diagnostics(),
                original.codedata(),
                original.advancedValue(),
                original.imports(),
                original.defaultValue(),
                original.comment(),
                original.dynamicFormFields(),
                original.itemOptions()
        );
    }

    /**
     * Creates a copy of a property with its types replaced by a single SINGLE_SELECT type with the given options. All
     * other fields are preserved from the original property.
     *
     * @param original the property to copy from
     * @param options  the list of option values to show in the select box
     * @return the new property with SINGLE_SELECT type
     */
    public static Property convertToSingleSelect(Property original, List<String> options) {
        List<PropertyType> selectTypes = List.of(
                new PropertyType(Property.ValueType.SINGLE_SELECT, null, null, Option.of(options),
                        null, null, null, true)
        );
        return new Property(
                original.metadata(),
                selectTypes,
                original.value(),
                original.oldValue(),
                original.placeholder(),
                original.optional(),
                original.editable(),
                original.advanced(),
                original.hidden(),
                original.modified(),
                original.diagnostics(),
                original.codedata(),
                original.advancedValue(),
                original.imports(),
                original.defaultValue(),
                original.comment(),
                original.dynamicFormFields(),
                original.itemOptions()
        );
    }

    /**
     * Adds a property to a NodeBuilder by copying all attributes from an existing property with an optional custom
     * value.
     *
     * @param nodeBuilder the node builder to add the property to
     * @param key         the property key
     * @param property    the existing property to copy from
     * @param customValue the custom value to use instead of the property's original value, or null to use original
     * @param isHidden    whether to mark the property as hidden
     */
    public static void addPropertyFromTemplate(NodeBuilder nodeBuilder, String key, Property property,
                                               String customValue, boolean isHidden) {
        if (nodeBuilder == null || key == null || property == null) {
            throw new IllegalArgumentException("NodeBuilder, key, and property cannot be null");
        }

        if (property.metadata() == null) {
            throw new IllegalArgumentException("Property metadata cannot be null");
        }

        Object valueToUse = customValue != null ? customValue : property.value();
        boolean hidden = isHidden || property.hidden();

        // When a property from a template is flagged as hidden it is an internal default
        // that should not be user-visible.  If the node builder has already set this key
        // from its own authoritative data (e.g. AGENT_CALL sets type/variable from the
        // function's return type), do not replace those correct values with the template
        // defaults (e.g. ai:Agent / aiAgent from the AGENT template).
        if (hidden && nodeBuilder.properties().build().containsKey(key)) {
            return;
        }

        Property copied = new Property(
                property.metadata(),
                property.types(),
                valueToUse,
                property.oldValue(),
                property.placeholder(),
                property.optional(),
                property.editable(),
                property.advanced(),
                hidden,
                property.modified(),
                property.diagnostics(),
                property.codedata(),
                property.advancedValue(),
                property.imports(),
                property.defaultValue(),
                property.comment(),
                property.dynamicFormFields(),
                property.itemOptions()
        );
        nodeBuilder.properties().build().put(key, copied);
    }

    /**
     * Adds a simple string property to a NodeBuilder with the specified configuration.
     *
     * @param nodeBuilder  the node builder to add the property to
     * @param key          the property key
     * @param label        the property label
     * @param description  the property description
     * @param placeholder  the placeholder text
     * @param value        the property value
     * @param selectedType the selected field type (PROMPT or EXPRESSION)
     */
    public static void addStringProperty(NodeBuilder nodeBuilder, String key, String label, String description,
                                         String placeholder, String value, Property.ValueType selectedType) {
        if (nodeBuilder == null || key == null) {
            throw new IllegalArgumentException("NodeBuilder and key cannot be null");
        }

        boolean isPromptSelected = selectedType == Property.ValueType.PROMPT;

        nodeBuilder.properties().custom()
                .metadata()
                    .label(label != null ? label : "")
                    .description(description != null ? description : "")
                    .stepOut()
                .value(value != null && !value.isEmpty() ? value : "")
                .defaultValue("")
                .type()
                    .fieldType(Property.ValueType.PROMPT)
                    .ballerinaType("string")
                    .selected(isPromptSelected)
                    .stepOut()
                .type()
                    .fieldType(Property.ValueType.EXPRESSION)
                    .ballerinaType("string")
                    .selected(!isPromptSelected)
                    .stepOut()
                .placeholder(placeholder != null ? placeholder : "")
                .optional(true)
                .editable()
                .codedata()
                    .kind("REQUIRED")
                    .stepOut()
                .stepOut()
                .addProperty(key);
    }

    /**
     * Creates a default template context for node builders with the specified codedata.
     *
     * @param sourceBuilder the source builder containing workspace and file information
     * @param codedata      the codedata to use for the template context
     * @return the created template context
     */
    public static NodeBuilder.TemplateContext createDefaultTemplateContext(SourceBuilder sourceBuilder,
                                                                           Codedata codedata) {
        if (sourceBuilder == null || codedata == null) {
            throw new IllegalArgumentException("SourceBuilder and codedata cannot be null");
        }

        if (sourceBuilder.flowNode == null || sourceBuilder.flowNode.codedata() == null ||
                sourceBuilder.flowNode.codedata().lineRange() == null) {
            throw new IllegalArgumentException("SourceBuilder must have valid flowNode with codedata and lineRange");
        }

        return new NodeBuilder.TemplateContext(
                sourceBuilder.workspaceManager,
                sourceBuilder.filePath,
                sourceBuilder.flowNode.codedata().lineRange().startLine(),
                codedata,
                null
        );
    }

    /**
     * Copies common properties from source FlowNode to target FlowNode, excluding variable and type properties. Only
     * copies properties that have non-null and non-empty values in the source node.
     *
     * @param targetNode the node to copy properties to
     * @param sourceNode the node to copy properties from
     */
    public static void copyCommonProperties(FlowNode targetNode, FlowNode sourceNode) {
        if (targetNode.properties() == null || sourceNode.properties() == null) {
            return;
        }

        Iterator<Map.Entry<String, Property>> iterator = targetNode.properties().entrySet().iterator();
        while (iterator.hasNext()) {
            Map.Entry<String, Property> targetPropertyEntry = iterator.next();
            String propertyName = targetPropertyEntry.getKey();

            // Skip copying variable and type properties
            if (Property.VARIABLE_KEY.equals(propertyName) || Property.TYPE_KEY.equals(propertyName)) {
                continue;
            }

            Optional<Property> sourceProperty = sourceNode.getProperty(propertyName);

            if (sourceProperty.isPresent()) {
                Property srcProp = sourceProperty.get();
                if (srcProp.value() != null && !srcProp.value().toString().isEmpty()) {
                    // Copy non-empty source values to the target
                    copyPropertyValue(targetNode, sourceNode, propertyName, propertyName);
                } else if (targetPropertyEntry.getValue().optional()) {
                    // Remove optional properties that have been cleared
                    iterator.remove();
                }
            }
        }
    }

    public record Module(String org, String name, String version) {
    }

    public record AgentPropertyValue(String value, Property.ValueType selectedType) {
    }

    public static String getBallerinaAiModuleVersion(Project project) {
        return project.currentPackage().dependenciesToml().map(DependenciesToml::tomlDocument).map(TomlDocument::toml)
                .map(toml -> toml.getTables(PACKAGE)).orElse(List.of()).stream()
                .filter(pkg -> BALLERINA.equals(pkg.get(ORG).map(Object::toString).orElse(""))
                        && AI.equals(pkg.get(NAME).map(Object::toString).orElse("")))
                .findFirst().flatMap(aiPackage -> aiPackage.get(VERSION).map(Objects::toString))
                .orElse(null);
    }

    /**
     * Resolves the AI module version for internal use (Central API calls, keyword fetching). Falls back to local
     * distribution if not in Dependencies.toml.
     */
    private static String resolveAiModuleVersion(Project project) {
        String version = getBallerinaAiModuleVersion(project);
        if (version != null) {
            return version;
        }
        return resolvePackageVersion(BALLERINA, AI).orElse(null);
    }

    public static Optional<String> resolvePackageVersion(String org, String packageName) {
        try {
            PackageResolver resolver = PackageUtil.getSampleProject()
                    .projectEnvironmentContext().getService(PackageResolver.class);
            ResolutionRequest resolutionRequest = ResolutionRequest.from(
                    PackageDescriptor.from(PackageOrg.from(org), PackageName.from(packageName)));
            Collection<PackageMetadataResponse> metadataResponses = resolver.resolvePackageMetadata(
                    Collections.singletonList(resolutionRequest),
                    ResolutionOptions.builder().setOffline(true).build());
            return metadataResponses.stream().findFirst()
                    .filter(meta -> meta.resolutionStatus() != ResolutionResponse.ResolutionStatus.UNRESOLVED)
                    .map(PackageMetadataResponse::resolvedDescriptor)
                    .map(descriptor -> descriptor.version().value().toString());
        } catch (RuntimeException e) {
            return Optional.empty();
        }
    }

    private static synchronized void ensureDependentModulesResolved() {
        if (dependentModulesResolved) {
            return;
        }
        try {
            loadDependentModulesFromCentral();
        } catch (RuntimeException e) {
            LOGGER.log(Level.WARNING,
                    "Failed to resolve dependent modules from Ballerina Central, using hardcoded fallback", e);
        } finally {
            dependentModulesResolved = true;
        }
    }

    private static void loadDependentModulesFromCentral() {
        List<String> allVersions = RemoteCentral.getInstance().allPackageVersions(BALLERINA, AI);
        if (allVersions.isEmpty()) {
            return;
        }

        Map<String, List<DependentPackage>> allDeps =
                RemoteCentral.getInstance().dependentPackages(BALLERINA, AI, allVersions);

        Map<String, List<Module>> resolved = new HashMap<>();
        for (Map.Entry<String, List<DependentPackage>> entry : allDeps.entrySet()) {
            List<Module> modules = entry.getValue().stream()
                    .filter(dep -> BALLERINAX.equals(dep.organization()) && dep.name().startsWith("ai."))
                    .map(dep -> new Module(dep.organization(), dep.name(), dep.version()))
                    .toList();
            if (!modules.isEmpty()) {
                resolved.put(entry.getKey(), modules);
            }
        }

        // Replace the fallback map with fresh data from Central
        dependentModules.clear();
        dependentModules.putAll(resolved);
    }

    public static List<Module> getLatestCompatibleModules(String version) {
        ensureDependentModulesResolved();
        Collection<List<Module>> candidateModules = (version == null)
                ? dependentModules.values()
                : dependentModules.entrySet().stream()
                .filter(entry -> compareMajorMinor(version, entry.getKey()) >= 0)
                .map(Map.Entry::getValue)
                .toList();

        Map<String, Module> latestModules = candidateModules.stream()
                .flatMap(Collection::stream)
                .collect(Collectors.toMap(
                        module -> module.org + ":" + module.name,
                        module -> module,
                        (existing, candidate) ->
                                compareSemver(candidate.version, existing.version) >= 0 ? candidate : existing
                ));
        latestModules.put(AI, new Module(BALLERINA, AI, version));

        // If version is null, set all dependent module versions to null
        // so the latest compatible modules will be pulled
        return latestModules.values().stream()
                .map(module -> version == null ? new Module(module.org, module.name, null) : module)
                .toList();
    }

    public static Set<NodeKind> getSupportedFeatures(String version) {
        Stream<Set<NodeKind>> featureSets = (version == null) ? versionToFeatures.values().stream()
                : versionToFeatures.entrySet().stream()
                .filter(entry -> compareSemver(version, entry.getKey()) >= 0)
                .map(Map.Entry::getValue);
        return featureSets.flatMap(Collection::stream).collect(Collectors.toSet());
    }

    public static int compareSemver(String version1, String version2) {
        String[] parts1 = version1.split("\\.");
        String[] parts2 = version2.split("\\.");
        int length = Math.max(parts1.length, parts2.length);

        for (int i = 0; i < length; i++) {
            int num1 = i < parts1.length ? Integer.parseInt(parts1[i]) : 0;
            int num2 = i < parts2.length ? Integer.parseInt(parts2[i]) : 0;
            if (num1 != num2) {
                return Integer.compare(num1, num2);
            }
        }
        return 0;
    }

    // Compares only major.minor (ignores patch) — patch bumps within the same minor are backward-compatible.
    static int compareMajorMinor(String version1, String version2) {
        String[] parts1 = version1.split("\\.");
        String[] parts2 = version2.split("\\.");
        for (int i = 0; i < 2; i++) {
            int num1 = i < parts1.length ? Integer.parseInt(parts1[i]) : 0;
            int num2 = i < parts2.length ? Integer.parseInt(parts2[i]) : 0;
            if (num1 != num2) {
                return Integer.compare(num1, num2);
            }
        }
        return 0;
    }

    public static List<AvailableNode> getModelProviders(Project project) {
        buildCategoryCache(project, MODEL_PROVIDER);
        return cachedModelProviderMap.getOrDefault(getProjectCacheKey(project), List.of());
    }

    public static List<AvailableNode> getEmbeddingProviders(Project project) {
        buildCategoryCache(project, EMBEDDING_PROVIDER);
        return cachedEmbeddingProviderMap.getOrDefault(getProjectCacheKey(project), List.of());
    }

    public static List<AvailableNode> getVectorStores(Project project) {
        buildCategoryCache(project, VECTOR_STORE);
        return cachedVectorStoreMap.getOrDefault(getProjectCacheKey(project), List.of());
    }

    public static List<AvailableNode> getChunkers(Project project) {
        buildCategoryCache(project, CHUNKER);
        return cachedChunkerMap.getOrDefault(getProjectCacheKey(project), List.of());
    }

    public static List<AvailableNode> getDataLoaders(Project project) {
        buildCategoryCache(project, DATA_LOADER);
        return cachedDataLoaderMap.getOrDefault(getProjectCacheKey(project), List.of());
    }

    public static List<AvailableNode> getShortTermMemoryStores(Project project) {
        buildCategoryCache(project, SHORT_TERM_MEMORY_STORE);
        return cachedShortTermMemoryStoreMap.getOrDefault(getProjectCacheKey(project), List.of());
    }

    public static List<AvailableNode> getKnowledgeBases(Project project) {
        buildCategoryCache(project, KNOWLEDGE_BASE);
        return cachedKnowledgeBaseMap.getOrDefault(getProjectCacheKey(project), List.of());
    }

    private static String getProjectCacheKey(Project project) {
        return project.sourceRoot().toAbsolutePath().toString();
    }

    /**
     * Checks if an available node matches the search query by comparing against both the module name and the display
     * label (case-insensitive).
     */
    public static boolean matchesQuery(AvailableNode node, String query) {
        String lowerQuery = query.toLowerCase(Locale.ROOT);
        String module = node.codedata().module();
        String label = node.metadata() != null ? node.metadata().label() : null;
        return (module != null && module.toLowerCase(Locale.ROOT).contains(lowerQuery))
                || (label != null && label.toLowerCase(Locale.ROOT).contains(lowerQuery));
    }

    private static List<Module> pinUserDeclaredVersions(Project project, List<Module> modules) {
        Map<String, String> userVersions = project.currentPackage().dependenciesToml()
                .map(DependenciesToml::tomlDocument).map(TomlDocument::toml)
                .map(toml -> toml.getTables(PACKAGE)).orElse(List.of()).stream()
                .collect(Collectors.toMap(
                        pkg -> pkg.get(ORG).map(Object::toString).orElse("") + ":"
                                + pkg.get(NAME).map(Object::toString).orElse(""),
                        pkg -> pkg.get(VERSION).map(Objects::toString).orElse(""),
                        (v1, v2) -> v1
                ));

        return modules.stream()
                .map(m -> {
                    String key = m.org() + ":" + m.name();
                    String userVersion = userVersions.get(key);
                    return (userVersion != null && !userVersion.isEmpty())
                            ? new Module(m.org(), m.name(), userVersion) : m;
                })
                .toList();
    }

    private static synchronized void buildCategoryCache(Project project, NodeKind category) {
        String cacheKey = getProjectCacheKey(project);
        // Use resolveAiModuleVersion for internal resolution (falls back to local distribution)
        String aiModuleVersion = resolveAiModuleVersion(project);
        Set<NodeKind> completed = completedCategories.computeIfAbsent(cacheKey, k -> new HashSet<>());
        if (completed.contains(category)) {
            return;
        }

        List<Module> allModules = getLatestCompatibleModules(aiModuleVersion);
        boolean hasDependenciesToml = project.currentPackage().dependenciesToml().isPresent();
        allModules = pinUserDeclaredVersions(project, allModules);
        ensureKeywordsLoaded(allModules);

        List<ModuleInfo> modules = allModules.stream()
                .filter(m -> moduleMatchesCategory(m, category))
                .map(m -> new ModuleInfo(m.org(), m.name(), m.name(), m.version()))
                .toList();

        List<AvailableNode> categoryNodes = new ArrayList<>();

        for (ModuleInfo module : modules) {
            // Include version in codedata only if the project has a Dependencies.toml.
            // Omitting version (null) means "use latest from Central".
            String codedataVersion = hasDependenciesToml ? module.version() : null;

            // Try disk cache first — avoids expensive semantic model loading
            Optional<List<AiComponentDiskCache.CachedComponent>> cached =
                    diskCache.load(module.org(), module.packageName(), module.version());
            if (cached.isPresent()) {
                for (AiComponentDiskCache.CachedComponent comp : cached.get()) {
                    if (!category.name().equals(comp.category())) {
                        continue;
                    }
                    categoryNodes.add(reconstructFromCache(comp, module, codedataVersion));
                }
                continue;
            }

            // Cache miss — load semantic model (expensive)
            Optional<SemanticModel> semanticModel;
            try {
                semanticModel = getSemanticModel(module);
            } catch (Exception e) {
                continue;
            }
            if (semanticModel.isEmpty()) {
                continue;
            }

            List<AiComponentDiskCache.CachedComponent> toCache = new ArrayList<>();
            Stream<ClassSymbol> classSymbols = semanticModel.get().moduleSymbols().stream()
                    .filter(ClassSymbol.class::isInstance).map(ClassSymbol.class::cast);

            for (var classSymbol : classSymbols.toList()) {
                NodeKind classKind = classifyComponent(classSymbol);
                if (classKind == null) {
                    continue;
                }
                AvailableNode node = buildAvailableNode(classSymbol, module, codedataVersion, classKind);
                toCache.add(toCachedComponent(classSymbol, node, classKind));
                if (classKind == category) {
                    categoryNodes.add(node);
                }
            }

            // Persist ALL discovered components to disk (even if empty — caches "no components")
            diskCache.save(module.org(), module.packageName(), module.version(), toCache);
        }

        mergeIntoCache(getCategoryCache(category), cacheKey, categoryNodes);
        completed.add(category);
    }

    private static NodeKind classifyComponent(ClassSymbol classSymbol) {
        if (isModelProviderClass(classSymbol)) {
            return MODEL_PROVIDER;
        }
        if (isEmbeddingProviderClass(classSymbol)) {
            return EMBEDDING_PROVIDER;
        }
        if (isVectorStoreClass(classSymbol)) {
            return VECTOR_STORE;
        }
        if (isChunkerClass(classSymbol)) {
            return CHUNKER;
        }
        if (isDataLoaderClass(classSymbol)) {
            return DATA_LOADER;
        }
        if (isShortTermMemoryStoreClass(classSymbol)) {
            return SHORT_TERM_MEMORY_STORE;
        }
        if (isKnowledgeBaseClass(classSymbol)) {
            return KNOWLEDGE_BASE;
        }
        return null;
    }

    private static Map<String, List<AvailableNode>> getCategoryCache(NodeKind category) {
        return switch (category) {
            case MODEL_PROVIDER -> cachedModelProviderMap;
            case EMBEDDING_PROVIDER -> cachedEmbeddingProviderMap;
            case VECTOR_STORE -> cachedVectorStoreMap;
            case CHUNKER -> cachedChunkerMap;
            case DATA_LOADER -> cachedDataLoaderMap;
            case SHORT_TERM_MEMORY_STORE -> cachedShortTermMemoryStoreMap;
            case KNOWLEDGE_BASE -> cachedKnowledgeBaseMap;
            default -> throw new IllegalArgumentException("Unsupported AI component category: " + category);
        };
    }

    private static void mergeIntoCache(Map<String, List<AvailableNode>> cacheMap,
                                       String version, List<AvailableNode> newNodes) {
        if (newNodes.isEmpty()) {
            return;
        }
        List<AvailableNode> sorted = newNodes.stream()
                .sorted(Comparator.comparing(n -> n.codedata().module())).toList();
        cacheMap.merge(version, sorted,
                (existing, incoming) -> Stream.concat(existing.stream(), incoming.stream())
                        .distinct()
                        .sorted(Comparator.comparing(n -> n.codedata().module()))
                        .toList());
    }

    private static synchronized void ensureKeywordsLoaded(List<Module> allModules) {
        try {
            // Only fetch keywords for modules not already in the cache
            List<DependentPackage> modulesToFetch = allModules.stream()
                    .filter(m -> BALLERINAX.equals(m.org()) && m.version() != null)
                    .filter(m -> !moduleKeywordsCache.containsKey(
                            m.org() + ":" + m.name() + ":" + m.version()))
                    .map(m -> new DependentPackage(m.org(), m.name(), m.version()))
                    .toList();
            if (!modulesToFetch.isEmpty()) {
                Map<String, List<String>> keywords =
                        RemoteCentral.getInstance().packageKeywords(modulesToFetch);
                moduleKeywordsCache.putAll(keywords);
            }
        } catch (RuntimeException e) {
            LOGGER.log(Level.WARNING, "Failed to fetch package keywords from Central, skipping keyword filtering", e);
        }
    }

    private static boolean moduleMatchesCategory(Module module, NodeKind category) {
        // ballerina/ai is always included — it's the core module
        if (BALLERINA.equals(module.org()) && AI.equals(module.name())) {
            return true;
        }

        List<String> filterKeywords = CATEGORY_KEYWORD_FILTERS.get(category);
        if (filterKeywords == null || filterKeywords.isEmpty()) {
            // No filter defined for this category — include all modules
            return true;
        }

        String key = module.org() + ":" + module.name() + ":" + module.version();
        List<String> moduleKeywords = moduleKeywordsCache.get(key);
        if (moduleKeywords == null || moduleKeywords.isEmpty()) {
            // No keywords available (offline or not fetched) — include the module to be safe
            return true;
        }

        // Case-insensitive substring match: does any module keyword contain any filter keyword?
        return moduleKeywords.stream().anyMatch(kw ->
                filterKeywords.stream().anyMatch(filter ->
                        kw.toLowerCase(Locale.ROOT).contains(filter.toLowerCase(Locale.ROOT))));
    }

    private static Optional<SemanticModel> getSemanticModel(ModuleInfo module) {
        return module.version() == null ? PackageUtil.getSemanticModel(module.org(), module.moduleName())
                : PackageUtil.getSemanticModel(module);
    }

    private static boolean isModelProviderClass(ClassSymbol classSymbol) {
        return classSymbol.getName().isPresent()
                && classSymbol.typeInclusions().stream()
                .anyMatch(inclusion -> inclusion.nameEquals(Ai.MODEL_PROVIDER_TYPE_NAME));
    }

    private static boolean isEmbeddingProviderClass(ClassSymbol classSymbol) {
        return classSymbol.getName().isPresent()
                && classSymbol.typeInclusions().stream()
                .anyMatch(inclusion -> inclusion.nameEquals(Ai.EMBEDDING_PROVIDER_TYPE_NAME));
    }

    private static boolean isVectorStoreClass(ClassSymbol classSymbol) {
        return classSymbol.getName().isPresent()
                && classSymbol.typeInclusions().stream()
                .anyMatch(inclusion -> inclusion.nameEquals(Ai.VECTOR_STORE_TYPE_NAME));
    }

    private static boolean isChunkerClass(ClassSymbol classSymbol) {
        return classSymbol.getName().isPresent()
                && classSymbol.typeInclusions().stream()
                .anyMatch(inclusion -> inclusion.nameEquals(Ai.CHUNKER_TYPE_NAME));
    }

    private static boolean isDataLoaderClass(ClassSymbol classSymbol) {
        return classSymbol.getName().isPresent()
                && classSymbol.typeInclusions().stream()
                .anyMatch(inclusion -> inclusion.nameEquals(Ai.DATA_LOADER_TYPE_NAME));
    }

    private static boolean isShortTermMemoryStoreClass(ClassSymbol classSymbol) {
        return classSymbol.getName().isPresent()
                && classSymbol.typeInclusions().stream()
                .anyMatch(inclusion -> inclusion.nameEquals(Ai.SHORT_TERM_MEMORY_STORE_TYPE_NAME));
    }

    private static boolean isKnowledgeBaseClass(ClassSymbol classSymbol) {
        return classSymbol.getName().isPresent()
                && classSymbol.typeInclusions().stream()
                .anyMatch(inclusion -> inclusion.nameEquals(Ai.KNOWLEDGE_BASE_TYPE_NAME));
    }

    private static AvailableNode buildAvailableNode(ClassSymbol classSymbol, ModuleInfo moduleInfo,
                                                    String codedataVersion, NodeKind kind) {
        String className = classSymbol.getName().orElse("");
        String label = getDisplayLabel(classSymbol)
                .orElseGet(() -> buildLabel(moduleInfo.moduleName(), className));
        String description = classSymbol.documentation()
                .flatMap(Documentation::description)
                .orElse(getDefaultNodeLabel(kind, label.split(" ")[0]));

        String icon = CommonUtils.generateIcon(moduleInfo.org(), moduleInfo.packageName(), moduleInfo.version());
        Metadata metadata = new Metadata.Builder<>(null).label(label).description(description).icon(icon).build();
        Codedata.Builder<Object> codedataBuilder = new Codedata.Builder<>(null).version(codedataVersion)
                .packageName(moduleInfo.packageName()).module(moduleInfo.moduleName()).org(moduleInfo.org())
                .node(kind);

        switch (className) {
            case Ai.WSO2_MODEL_PROVIDER_NAME -> codedataBuilder.symbol(Ai.GET_DEFAULT_MODEL_PROVIDER_METHOD);
            case Ai.WSO2_EMBEDDING_PROVIDER_NAME -> codedataBuilder.symbol(Ai.GET_DEFAULT_EMBEDDING_PROVIDER_METHOD);
            default -> codedataBuilder.object(className).symbol(INIT_METHOD);
        }
        return new AvailableNode(metadata, codedataBuilder.build(), true);
    }

    private static AvailableNode reconstructFromCache(AiComponentDiskCache.CachedComponent comp,
                                                      ModuleInfo moduleInfo, String codedataVersion) {
        String icon = CommonUtils.generateIcon(moduleInfo.org(), moduleInfo.packageName(), moduleInfo.version());
        Metadata metadata = new Metadata.Builder<>(null).label(comp.label()).description(comp.description())
                .icon(icon).build();
        NodeKind kind = NodeKind.valueOf(comp.category());
        Codedata.Builder<Object> codedataBuilder = new Codedata.Builder<>(null).version(codedataVersion)
                .packageName(moduleInfo.packageName()).module(moduleInfo.moduleName()).org(moduleInfo.org())
                .node(kind);
        if (INIT_METHOD.equals(comp.symbol())) {
            codedataBuilder.object(comp.className()).symbol(INIT_METHOD);
        } else {
            codedataBuilder.symbol(comp.symbol());
        }
        return new AvailableNode(metadata, codedataBuilder.build(), true);
    }

    private static AiComponentDiskCache.CachedComponent toCachedComponent(ClassSymbol classSymbol,
                                                                          AvailableNode node, NodeKind category) {
        String className = classSymbol.getName().orElse("");
        return new AiComponentDiskCache.CachedComponent(className, node.metadata().label(),
                node.metadata().description(), category.name(), node.codedata().symbol());
    }

    private static Optional<String> getDisplayLabel(ClassSymbol classSymbol) {
        return classSymbol.annotAttachments().stream()
                .filter(a -> a.typeDescriptor().getName().map("display"::equals).orElse(false))
                .findFirst()
                .flatMap(AnnotationAttachmentSymbol::attachmentValue)
                .filter(v -> v.value() instanceof Map)
                .map(v -> ((Map<?, ?>) v.value()).get("label"))
                .filter(ConstantValue.class::isInstance)
                .map(v -> ((ConstantValue) v).value().toString())
                .filter(label -> !label.isEmpty());
    }

    private static String buildLabel(String moduleName, String className) {
        if (Ai.WSO2_MODEL_PROVIDER_NAME.equals(className)) {
            return "Default Model Provider (WSO2)";
        }
        if (Ai.WSO2_EMBEDDING_PROVIDER_NAME.equals(className)) {
            return "Default Embedding Provider (WSO2)";
        }

        int lastDot = moduleName.lastIndexOf('.');
        String rawProviderName = lastDot >= 0 ? moduleName.substring(lastDot + 1) : moduleName.replaceAll("^ai", "");
        String providerName = splitPascalCase(capitalizeFirstChar(rawProviderName));
        String splitClassName = splitPascalCase(className);
        String label = (providerName + " " + splitClassName)
                .replaceAll("(?i)openai", "OpenAI")
                .replaceAll("(?i)mssql", "MSSQL")
                .replaceAll("(?i)\\bai\\b", "AI")
                .replace("Open AI", "OpenAI")
                .replace("Openrouter", "OpenRouter")
                .trim().replaceAll("\\s+", " ");
        return label;
    }

    private static String splitPascalCase(String input) {
        if (input == null || input.isEmpty()) {
            return input;
        }
        return input.replaceAll("(?<=[a-z0-9])(?=[A-Z])", " ");
    }

    private static String capitalizeFirstChar(String word) {
        if (word == null || word.isEmpty()) {
            return word;
        }
        return Character.toUpperCase(word.charAt(0)) + word.substring(1);
    }

    private static String getDefaultNodeLabel(NodeKind kind, String providerName) {
        return switch (kind) {
            case MODEL_PROVIDER -> "Provides an interface to interact with " + providerName + " LLMs.";
            case EMBEDDING_PROVIDER -> "Provides an interface to interact with " + providerName + " embedding models.";
            case VECTOR_STORE -> "Vector store implementation to connect with " + providerName + " vector database.";
            case CHUNKER -> "Splits the provided document.";
            case DATA_LOADER -> "Loads documents from specified data source.";
            case SHORT_TERM_MEMORY_STORE -> "Short-term memory store for " + providerName + " chat messages.";
            case KNOWLEDGE_BASE -> "Knowledge base for semantic retrieval and RAG workflows.";
            default -> null;
        };
    }

    public static Codedata getDefaultModelProviderCodedata(String orgName) {
        return new Codedata.Builder<>(null)
                .node(Objects.equals(orgName, BALLERINA) ? MODEL_PROVIDER : CLASS_INIT)
                .org(orgName)
                .module(AI)
                .packageName(AI)
                .object(Objects.equals(orgName, BALLERINA) ? null : Ai.OPEN_AI_PROVIDER)
                .symbol(Objects.equals(orgName, BALLERINA) ? Ai.GET_DEFAULT_MODEL_PROVIDER_METHOD : INIT_METHOD)
                .build();
    }

    public static Codedata getDefaultAgentCodedata(String orgName) {
        return new Codedata.Builder<>(null)
                .node(NodeKind.AGENT)
                .object(Ai.AGENT_TYPE_NAME)
                .org(orgName)
                .module(AI)
                .packageName(AI)
                .symbol(Ai.AGENT_SYMBOL_NAME)
                .build();
    }

    /**
     * Replaces backticks in a string with an expression that works in string template.
     *
     * @param input the string that may contain backticks
     * @return the string with backticks replaced by ${"`"} for safe use in string templates
     */
    public static String replaceBackticksForStringTemplate(String input) {
        if (input == null || input.isEmpty()) {
            return "string ``";
        }
        // Check if input is a string template
        if (input.matches("(?s)string\\s+`.*`")) {
            int firstBacktick = input.indexOf('`');
            String prefix = input.substring(0, firstBacktick + 1);
            String content = input.substring(firstBacktick + 1, input.length() - 1);
            String replacedContent = content.replace("`", "${\"`\"}");
            return prefix + replacedContent + "`";
        }
        String escaped = input.replace("`", "${\"`\"}");
        return "string `" + escaped + "`";
    }

    /**
     * Reverts template string interpolation expressions back to backticks.
     *
     * @param input the string that may contain ${"`"} expressions
     * @return the string with ${"`"} expressions replaced by backticks
     */
    public static String restoreBackticksFromStringTemplate(String input) {
        if (input == null) {
            return "";
        }
        return input.replace("${\"`\"}", "`");
    }

    /**
     * Result of a tool compatibility check.
     *
     * @param compatible whether the symbol is tool-compatible
     * @param reason     the reason for incompatibility, or {@code null} if compatible
     */
    public record AgentToolCompatibility(boolean compatible, String reason) {
    }

    /**
     * Checks whether a function or action is compatible for use as an agent tool. A symbol is tool-compatible if:
     * <ul>
     *   <li>It is isolated (remote methods always qualify)</li>
     *   <li>All parameters are subtypes of {@code anydata}</li>
     *   <li>The return type is a subtype of {@code anydata | stream&lt;subtype-of-anydata&gt; | http:Response}</li>
     * </ul>
     *
     * @param qualifiers         the qualifiers of the function/method
     * @param functionTypeSymbol the function type descriptor
     * @param semanticModel      the semantic model for type resolution
     * @return the compatibility result with a reason if incompatible
     */
    public static AgentToolCompatibility checkAgentToolCompatibility(List<Qualifier> qualifiers,
                                                                     FunctionTypeSymbol functionTypeSymbol,
                                                                     SemanticModel semanticModel) {
        // 1. Check isolation (remote methods are always isolated)
        if (!qualifiers.contains(Qualifier.REMOTE) && !qualifiers.contains(Qualifier.ISOLATED)) {
            return new AgentToolCompatibility(false, "Function must be isolated to be used as an agent tool");
        }

        TypeSymbol anydata = semanticModel.types().ANYDATA;

        // 2. Check all parameters are subtypes of anydata (skip typedesc params used for type inference)
        Optional<List<ParameterSymbol>> optParams = functionTypeSymbol.params();
        if (optParams.isPresent()) {
            for (ParameterSymbol param : optParams.get()) {
                if (CommonUtils.getRawType(param.typeDescriptor()).typeKind() == TypeDescKind.TYPEDESC) {
                    continue;
                }
                if (!CommonUtils.subTypeOf(param.typeDescriptor(), anydata)) {
                    return new AgentToolCompatibility(false,
                            "Parameter '" + param.getName().orElse("?") + "' of type '"
                                    + param.typeDescriptor().signature() + "' is not a subtype of anydata");
                }
            }
        }

        // 3. Check return type is subtype of anydata | stream<subtype-of-anydata> | http:Response
        Optional<TypeSymbol> optReturnType = functionTypeSymbol.returnTypeDescriptor();
        if (optReturnType.isPresent() && !isValidAgentToolReturnType(optReturnType.get(), anydata)) {
            return new AgentToolCompatibility(false,
                    "Return type must be a subtype of anydata, stream<anydata>, or http:Response");
        }

        return new AgentToolCompatibility(true, null);
    }

    private static boolean isValidAgentToolReturnType(TypeSymbol returnType, TypeSymbol anydata) {
        TypeSymbol rawType = CommonUtils.getRawType(returnType);

        if (rawType.typeKind() == TypeDescKind.UNION) {
            UnionTypeSymbol unionType = (UnionTypeSymbol) rawType;
            for (TypeSymbol memberType : unionType.memberTypeDescriptors()) {
                TypeSymbol rawMember = CommonUtils.getRawType(memberType);
                if (rawMember.typeKind() == TypeDescKind.ERROR) {
                    continue;
                }
                if (!isValidAgentToolReturnType(rawMember, anydata)) {
                    return false;
                }
            }
            return true;
        }

        if (rawType.typeKind() == TypeDescKind.STREAM) {
            return CommonUtils.subTypeOf(((StreamTypeSymbol) rawType).typeParameter(), anydata);
        }

        if (isHttpResponse(returnType)) {
            return true;
        }

        return CommonUtils.subTypeOf(rawType, anydata);
    }

    private static boolean isHttpResponse(TypeSymbol typeSymbol) {
        Optional<String> name = typeSymbol.getName();
        Optional<ModuleSymbol> module = typeSymbol.getModule();
        if (name.isPresent() && module.isPresent()) {
            ModuleID moduleId = module.get().id();
            return BALLERINA.equals(moduleId.orgName())
                    && "http".equals(moduleId.packageName())
                    && "Response".equals(name.get());
        }
        return false;
    }
}
