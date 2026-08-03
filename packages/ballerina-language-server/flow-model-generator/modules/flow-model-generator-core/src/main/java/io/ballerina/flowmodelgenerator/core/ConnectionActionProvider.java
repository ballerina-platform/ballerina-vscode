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

package io.ballerina.flowmodelgenerator.core;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.github.benmanes.caffeine.cache.RemovalCause;
import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonArray;
import com.google.gson.JsonDeserializationContext;
import com.google.gson.JsonDeserializer;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParseException;
import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.api.symbols.ClassSymbol;
import io.ballerina.compiler.api.symbols.MethodSymbol;
import io.ballerina.flowmodelgenerator.core.model.AvailableNode;
import io.ballerina.flowmodelgenerator.core.model.Category;
import io.ballerina.flowmodelgenerator.core.model.Codedata;
import io.ballerina.flowmodelgenerator.core.model.Item;
import io.ballerina.flowmodelgenerator.core.model.Metadata;
import io.ballerina.flowmodelgenerator.core.model.NodeBuilder;
import io.ballerina.flowmodelgenerator.core.model.NodeKind;
import io.ballerina.modelgenerator.commons.CommonUtils;
import io.ballerina.modelgenerator.commons.FunctionData;
import io.ballerina.modelgenerator.commons.FunctionDataBuilder;
import io.ballerina.modelgenerator.commons.ModuleInfo;
import io.ballerina.modelgenerator.commons.PackageUtil;
import io.ballerina.projects.Module;
import io.ballerina.projects.Package;
import io.ballerina.projects.PackageDescriptor;
import io.ballerina.projects.Project;
import org.ballerinalang.langserver.commons.workspace.WorkspaceManager;

import java.io.IOException;
import java.io.Reader;
import java.io.Writer;
import java.lang.reflect.Type;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicBoolean;

import static io.ballerina.flowmodelgenerator.core.Constants.BALLERINA;
import static io.ballerina.flowmodelgenerator.core.Constants.BALLERINAX;
import static io.ballerina.modelgenerator.commons.CommonUtils.getPersistDatabaseIcon;
import static io.ballerina.modelgenerator.commons.CommonUtils.isAgentClass;
import static io.ballerina.modelgenerator.commons.CommonUtils.isAiKnowledgeBase;
import static io.ballerina.modelgenerator.commons.CommonUtils.isPersistClient;

/**
 * Provides connector action templates with memory and disk-backed caching.
 *
 * @since 1.7.0
 */
public class ConnectionActionProvider {

    private static final int MAX_CACHE_SIZE = 25;
    private static final String CACHE_DIR_NAME = "ballerina-ls-connector-cache";
    private static final String HTTP_MODULE = "http";
    private static final List<String> HTTP_REMOTE_METHOD_SKIP_LIST = List.of("get", "put", "post", "head",
            "delete", "patch", "options");

    private final Cache<String, List<Item>> cache;
    private final Path cacheDirectory;
    private final Gson gson;
    private final AtomicBoolean diskAvailable;

    public static ConnectionActionProvider getInstance() {
        return ProviderHolder.INSTANCE;
    }

    private ConnectionActionProvider() {
        this.cacheDirectory = Path.of(System.getProperty("java.io.tmpdir"), CACHE_DIR_NAME);
        this.diskAvailable = new AtomicBoolean(true);
        this.gson = new GsonBuilder()
                .registerTypeAdapter(Item.class, new ItemDeserializer())
                .registerTypeAdapter(Category.class, new CategoryDeserializer())
                .create();
        this.cache = Caffeine.newBuilder()
                .maximumSize(MAX_CACHE_SIZE)
                .executor(Runnable::run)
                .removalListener((String key, List<Item> value, RemovalCause cause) -> {
                    if (cause == RemovalCause.EXPLICIT && key != null) {
                        deleteFromDisk(key);
                    }
                })
                .build();
    }

    ConnectionActionProvider(Path cacheDirectory, long maxCacheSize) {
        this.cacheDirectory = cacheDirectory;
        this.diskAvailable = new AtomicBoolean(true);
        this.gson = new GsonBuilder()
                .registerTypeAdapter(Item.class, new ItemDeserializer())
                .registerTypeAdapter(Category.class, new CategoryDeserializer())
                .create();
        this.cache = Caffeine.newBuilder()
                .maximumSize(maxCacheSize)
                .executor(Runnable::run)
                .removalListener((String key, List<Item> value, RemovalCause cause) -> {
                    if (cause == RemovalCause.EXPLICIT && key != null) {
                        deleteFromDisk(key);
                    }
                })
                .build();
    }

    public List<Item> getActions(ClassSymbol classSymbol, String parentSymbolName, Project project,
                                 SemanticModel semanticModel, boolean includeAgentToolCompatibility) {
        ConnectorContext context = createContext(classSymbol, project, semanticModel);
        List<Item> cachedTemplates = getOrBuildTemplates(context);
        Map<String, Boolean> compatibilityMap = includeAgentToolCompatibility
                ? getAgentToolCompatibilityMap(classSymbol, semanticModel)
                : Map.of();
        Map<String, AiUtils.ReturnTypeInfo> returnInfoMap = includeAgentToolCompatibility
                ? getReturnTypeInfoMap(classSymbol, semanticModel)
                : Map.of();
        Map<String, List<String>> nonDataParamsMap = includeAgentToolCompatibility
                ? getNonDataParamsMap(classSymbol, semanticModel)
                : Map.of();
        return bindForParentSymbol(cachedTemplates, parentSymbolName, compatibilityMap, returnInfoMap,
                nonDataParamsMap);
    }

    public void populate(Codedata codedata, WorkspaceManager workspaceManager, Path filePath) {
        if (codedata == null || codedata.object() == null || codedata.org() == null || codedata.module() == null) {
            return;
        }

        Project project = PackageUtil.loadProject(workspaceManager, filePath);
        ConnectorContext context = createContext(codedata, project);
        if (context == null) {
            return;
        }
        getOrBuildTemplates(context);
    }

    public void invalidate(String cacheKey) {
        cache.invalidate(cacheKey);
        deleteFromDisk(cacheKey);
    }

    void clearAll() {
        cache.invalidateAll();
        diskAvailable.set(true);
    }

    void cleanUp() {
        cache.cleanUp();
    }

    Path cacheFilePath(String cacheKey) {
        return cacheDirectory.resolve(keyToFileName(cacheKey));
    }

    List<Item> bindForParentSymbol(List<Item> cachedMethods, String parentSymbolName,
                                   Map<String, Boolean> compatibilityMap,
                                   Map<String, AiUtils.ReturnTypeInfo> returnInfoMap,
                                   Map<String, List<String>> nonDataParamsMap) {
        return bindParentSymbol(cachedMethods, parentSymbolName, compatibilityMap, returnInfoMap,
                nonDataParamsMap);
    }

    List<Item> getOrBuild(String cacheKey, SupplierFn<List<Item>> supplier) {
        return cache.get(cacheKey, key -> {
            List<Item> fromDisk = loadFromDisk(key);
            if (fromDisk != null) {
                return List.copyOf(fromDisk);
            }
            List<Item> built = supplier.get();
            if (built == null) {
                return List.of();
            }
            List<Item> immutable = List.copyOf(built);
            persistToDisk(key, immutable);
            return immutable;
        });
    }

    public static String generateKey(String org, String packageName, String moduleName, String className,
                                     String version) {
        return String.join(":",
                sanitizeSegment(org),
                sanitizeSegment(packageName),
                sanitizeSegment(moduleName),
                sanitizeSegment(className),
                sanitizeSegment(version));
    }

    List<Item> getOrBuildTemplates(ConnectorContext context) {
        return getOrBuildTemplates(context, () -> buildTemplates(context, context.project()));
    }

    List<Item> getOrBuildTemplates(ConnectorContext context, SupplierFn<List<Item>> supplier) {
        if (!context.cacheable()) {
            return supplier.get();
        }
        return getOrBuild(context.cacheKey(), supplier);
    }

    private ConnectorContext createContext(ClassSymbol classSymbol, Project project, SemanticModel semanticModel) {
        String className = classSymbol.getName().orElseThrow();
        ModuleInfo moduleInfo = classSymbol.getModule()
                .map(moduleSymbol -> ModuleInfo.from(moduleSymbol.id()))
                .orElseThrow();
        Package resolvedPackage = resolvePackage(moduleInfo, project).orElse(null);
        boolean persistClient = isPersistClient(classSymbol, semanticModel);
        String cacheKey = generateKey(moduleInfo.org(), moduleInfo.packageName(), moduleInfo.moduleName(), className,
                moduleInfo.version());
        boolean cacheable = BALLERINA.equals(moduleInfo.org()) || BALLERINAX.equals(moduleInfo.org());
        return new ConnectorContext(
                cacheKey,
                classSymbol,
                className,
                moduleInfo,
                resolvedPackage,
                isAiKnowledgeBase(classSymbol),
                isAgentClass(classSymbol),
                persistClient ? getPersistDatabaseIcon(classSymbol).orElse(null) : null,
                project,
                cacheable
        );
    }

    private ConnectorContext createContext(Codedata codedata, Project project) {
        ModuleInfo moduleInfo = new ModuleInfo(codedata.org(),
                codedata.packageName() == null ? codedata.module() : codedata.packageName(),
                codedata.module(), codedata.version());
        Package resolvedPackage = resolvePackage(moduleInfo, project).orElse(null);
        SemanticModel semanticModel = resolveSemanticModel(moduleInfo, project, resolvedPackage);
        if (semanticModel == null) {
            return null;
        }
        Optional<ClassSymbol> classSymbol = resolveClassSymbol(semanticModel, codedata.object());
        return classSymbol.map(symbol -> createContext(symbol, project, semanticModel)).orElse(null);
    }

    private List<Item> buildTemplates(ConnectorContext context, Project project) {
        List<FunctionData> methodFunctionsData = new FunctionDataBuilder()
                .parentSymbol(context.classSymbol())
                .parentSymbolType(context.className())
                .project(project)
                .moduleInfo(context.moduleInfo())
                .resolvedPackage(context.resolvedPackage())
                .buildChildNodes();

        List<Item> methods = new ArrayList<>();
        for (FunctionData methodFunction : methodFunctionsData) {
            String org = methodFunction.org();
            String packageName = methodFunction.packageName();
            String version = methodFunction.version();
            boolean isHttpModule = BALLERINA.equals(org) && HTTP_MODULE.equals(packageName);

            NodeBuilder nodeBuilder;
            String label;
            if (methodFunction.kind() == FunctionData.Kind.RESOURCE) {
                if (isHttpModule && HTTP_REMOTE_METHOD_SKIP_LIST.contains(methodFunction.name())) {
                    continue;
                }
                label = methodFunction.name() + (isHttpModule ? "" : methodFunction.resourcePath());
                nodeBuilder = NodeBuilder.getNodeFromKind(NodeKind.RESOURCE_ACTION_CALL);
            } else {
                label = methodFunction.name();
                FunctionData.Kind kind = methodFunction.kind();
                if (kind == FunctionData.Kind.REMOTE) {
                    nodeBuilder = NodeBuilder.getNodeFromKind(NodeKind.REMOTE_ACTION_CALL);
                } else if (context.agentClass() && label.equals(Constants.Ai.AGENT_RUN_METHOD_NAME)) {
                    nodeBuilder = NodeBuilder.getNodeFromKind(NodeKind.AGENT_RUN);
                } else if (kind == FunctionData.Kind.FUNCTION && context.knowledgeBase()) {
                    nodeBuilder = NodeBuilder.getNodeFromKind(NodeKind.KNOWLEDGE_BASE_CALL);
                } else if (kind == FunctionData.Kind.FUNCTION) {
                    nodeBuilder = NodeBuilder.getNodeFromKind(NodeKind.METHOD_CALL);
                } else {
                    throw new IllegalStateException("Unexpected value: " + kind);
                }
            }

            String icon = context.iconOverride() == null
                    ? CommonUtils.generateIcon(org, packageName, version)
                    : context.iconOverride();
            Item node = nodeBuilder
                    .metadata()
                    .label(label)
                    .icon(icon)
                    .description(methodFunction.description())
                    .stepOut()
                    .codedata()
                    .org(org)
                    .module(context.moduleInfo().moduleName())
                    .packageName(context.moduleInfo().packageName())
                    .object(context.className())
                    .symbol(methodFunction.name())
                    .version(version)
                    .resourcePath(methodFunction.resourcePath())
                    .stepOut()
                    .buildAvailableNode();
            methods.add(node);
        }
        return List.copyOf(methods);
    }

    private List<Item> bindParentSymbol(List<Item> cachedMethods, String parentSymbolName,
                                        Map<String, Boolean> compatibilityMap,
                                        Map<String, AiUtils.ReturnTypeInfo> returnInfoMap,
                                        Map<String, List<String>> nonDataParamsMap) {
        List<Item> methods = new ArrayList<>(cachedMethods.size());
        for (Item item : cachedMethods) {
            if (!(item instanceof AvailableNode availableNode)) {
                continue;
            }
            Codedata codedata = availableNode.codedata();
            Map<String, Object> data = codedata.data() == null
                    ? null
                    : new LinkedHashMap<>(codedata.data());
            if (!compatibilityMap.isEmpty() && compatibilityMap.containsKey(codedata.symbol())) {
                if (data == null) {
                    data = new LinkedHashMap<>();
                }
                data.put("agentToolCompatible", compatibilityMap.get(codedata.symbol()));
            }
            if (!returnInfoMap.isEmpty() && returnInfoMap.containsKey(codedata.symbol())) {
                if (data == null) {
                    data = new LinkedHashMap<>();
                }
                // {kind: dependent|anydata|undeterminable, type} drives the activity return-type field.
                data.put("returnTypeInfo", returnInfoMap.get(codedata.symbol()));
            }
            if (!nonDataParamsMap.isEmpty() && nonDataParamsMap.containsKey(codedata.symbol())) {
                if (data == null) {
                    data = new LinkedHashMap<>();
                }
                // Parameter names whose type is not anydata; the form surfaces them as anydata + a warning.
                data.put("nonDataParams", nonDataParamsMap.get(codedata.symbol()));
            }
            Codedata boundCodedata = new Codedata(
                    codedata.node(),
                    codedata.org(),
                    codedata.module(),
                    codedata.packageName(),
                    codedata.object(),
                    codedata.symbol(),
                    codedata.version(),
                    codedata.lineRange(),
                    codedata.sourceCode(),
                    parentSymbolName,
                    codedata.resourcePath(),
                    codedata.id(),
                    codedata.isNew(),
                    codedata.isGenerated(),
                    codedata.inferredReturnType(),
                    data);
            methods.add(new AvailableNode(availableNode.metadata(), boundCodedata, availableNode.enabled()));
        }
        return methods;
    }

    private Map<String, Boolean> getAgentToolCompatibilityMap(ClassSymbol classSymbol, SemanticModel semanticModel) {
        Map<String, Boolean> compatibilityMap = new LinkedHashMap<>();
        for (Map.Entry<String, MethodSymbol> entry : classSymbol.methods().entrySet()) {
            try {
                AiUtils.AgentToolCompatibility toolCompat = AiUtils.checkAgentToolCompatibility(
                        entry.getValue().qualifiers(), entry.getValue().typeDescriptor(), semanticModel);
                compatibilityMap.put(entry.getKey(), toolCompat.compatible());
            } catch (Throwable ignored) {
                compatibilityMap.put(entry.getKey(), false);
            }
        }
        return compatibilityMap;
    }

    private Map<String, AiUtils.ReturnTypeInfo> getReturnTypeInfoMap(ClassSymbol classSymbol,
                                                                     SemanticModel semanticModel) {
        Map<String, AiUtils.ReturnTypeInfo> returnInfoMap = new LinkedHashMap<>();
        for (Map.Entry<String, MethodSymbol> entry : classSymbol.methods().entrySet()) {
            try {
                returnInfoMap.put(entry.getKey(),
                        AiUtils.analyzeReturnType(entry.getValue().typeDescriptor(), semanticModel));
            } catch (Throwable ignored) {
                returnInfoMap.put(entry.getKey(), new AiUtils.ReturnTypeInfo("undeterminable", ""));
            }
        }
        return returnInfoMap;
    }

    private Map<String, List<String>> getNonDataParamsMap(ClassSymbol classSymbol, SemanticModel semanticModel) {
        Map<String, List<String>> nonDataParamsMap = new LinkedHashMap<>();
        for (Map.Entry<String, MethodSymbol> entry : classSymbol.methods().entrySet()) {
            try {
                nonDataParamsMap.put(entry.getKey(),
                        AiUtils.getNonAnydataParams(entry.getValue().typeDescriptor(), semanticModel));
            } catch (Throwable ignored) {
                nonDataParamsMap.put(entry.getKey(), List.of());
            }
        }
        return nonDataParamsMap;
    }

    private Optional<Package> resolvePackage(ModuleInfo moduleInfo, Project project) {
        if (project != null && isProjectModule(moduleInfo, project.currentPackage().descriptor())) {
            return Optional.of(project.currentPackage());
        }
        return PackageUtil.resolveModulePackage(moduleInfo.org(), moduleInfo.packageName(), moduleInfo.version());
    }

    private boolean isProjectModule(ModuleInfo moduleInfo, PackageDescriptor packageDescriptor) {
        if (moduleInfo == null || packageDescriptor == null || moduleInfo.org() == null) {
            return false;
        }
        if (!moduleInfo.org().equals(packageDescriptor.org().value())) {
            return false;
        }
        String packageName = moduleInfo.packageName();
        String descriptorName = packageDescriptor.name().value();
        if (packageName != null) {
            return packageName.startsWith(descriptorName);
        }
        String moduleName = moduleInfo.moduleName();
        return moduleName != null && moduleName.startsWith(descriptorName);
    }

    private SemanticModel resolveSemanticModel(ModuleInfo moduleInfo, Project project, Package resolvedPackage) {
        if (resolvedPackage != null) {
            SemanticModel semanticModel = findSemanticModel(resolvedPackage, moduleInfo);
            if (semanticModel != null) {
                return semanticModel;
            }
        }
        if (project == null) {
            return null;
        }
        return findSemanticModel(project.currentPackage(), moduleInfo);
    }

    private SemanticModel findSemanticModel(Package pkg, ModuleInfo moduleInfo) {
        for (Module module : pkg.modules()) {
            ModuleInfo candidateInfo = ModuleInfo.from(module.descriptor());
            if (candidateInfo.moduleName().equals(moduleInfo.moduleName())) {
                return PackageUtil.getCompilation(pkg.project()).getSemanticModel(module.moduleId());
            }
        }
        return null;
    }

    private Optional<ClassSymbol> resolveClassSymbol(SemanticModel semanticModel, String className) {
        return semanticModel.moduleSymbols().parallelStream()
                .filter(symbol -> symbol instanceof ClassSymbol && symbol.nameEquals(className))
                .map(symbol -> (ClassSymbol) symbol)
                .findFirst();
    }

    private List<Item> loadFromDisk(String cacheKey) {
        if (!diskAvailable.get()) {
            return null;
        }
        try {
            Path file = cacheDirectory.resolve(keyToFileName(cacheKey));
            if (!Files.exists(file)) {
                return null;
            }
            try (Reader reader = Files.newBufferedReader(file)) {
                Item[] items = gson.fromJson(reader, Item[].class);
                if (items == null) {
                    return null;
                }
                return List.of(items);
            }
        } catch (IOException | RuntimeException ignored) {
            return null;
        }
    }

    private void persistToDisk(String cacheKey, List<Item> items) {
        if (!diskAvailable.get()) {
            return;
        }
        try {
            Files.createDirectories(cacheDirectory);
            Path file = cacheDirectory.resolve(keyToFileName(cacheKey));
            try (Writer writer = Files.newBufferedWriter(file)) {
                gson.toJson(items, writer);
            }
        } catch (IOException | RuntimeException ignored) {
            diskAvailable.set(false);
        }
    }

    private void deleteFromDisk(String cacheKey) {
        if (!diskAvailable.get()) {
            return;
        }
        try {
            Files.deleteIfExists(cacheDirectory.resolve(keyToFileName(cacheKey)));
        } catch (IOException | RuntimeException ignored) {
        }
    }

    private static String sanitizeSegment(String value) {
        return value == null ? "" : value;
    }

    private static String keyToFileName(String cacheKey) {
        return cacheKey.replace(":", "_").replace("/", "-").replace("\\", "-") + ".json";
    }

    private static final class ProviderHolder {

        private static final ConnectionActionProvider INSTANCE = new ConnectionActionProvider();
    }

    record ConnectorContext(String cacheKey, ClassSymbol classSymbol, String className, ModuleInfo moduleInfo,
                            Package resolvedPackage, boolean knowledgeBase, boolean agentClass,
                            String iconOverride, Project project, boolean cacheable) {
    }

    // Exposed for core tests: getOrBuild using Caffeine atomic loading
    @FunctionalInterface
    interface SupplierFn<T> {

        T get();
    }

    private static class ItemDeserializer implements JsonDeserializer<Item> {

        @Override
        public Item deserialize(JsonElement json, Type typeOfT, JsonDeserializationContext context)
                throws JsonParseException {
            JsonObject jsonObject = json.getAsJsonObject();
            if (jsonObject.has("items")) {
                return context.deserialize(jsonObject, Category.class);
            } else if (jsonObject.has("enabled")) {
                return context.deserialize(jsonObject, AvailableNode.class);
            }
            throw new JsonParseException("Unknown type of Item");
        }
    }

    private static class CategoryDeserializer implements JsonDeserializer<Category> {

        @Override
        public Category deserialize(JsonElement json, Type typeOfT, JsonDeserializationContext context)
                throws JsonParseException {
            JsonObject jsonObject = json.getAsJsonObject();
            Metadata metadata = context.deserialize(jsonObject.get("metadata"), Metadata.class);
            JsonArray itemsArray = jsonObject.getAsJsonArray("items");
            List<Item> items = new ArrayList<>();
            for (JsonElement itemElement : itemsArray) {
                items.add(context.deserialize(itemElement, Item.class));
            }
            return new Category(metadata, items);
        }
    }
}
