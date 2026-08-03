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

package io.ballerina.modelgenerator.commons;

import com.google.gson.Gson;
import com.google.gson.reflect.TypeToken;
import io.ballerina.compiler.api.ModuleID;
import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.api.TypeBuilder;
import io.ballerina.compiler.api.Types;
import io.ballerina.compiler.api.symbols.AnnotationAttachmentSymbol;
import io.ballerina.compiler.api.symbols.AnnotationSymbol;
import io.ballerina.compiler.api.symbols.ArrayTypeSymbol;
import io.ballerina.compiler.api.symbols.ClassSymbol;
import io.ballerina.compiler.api.symbols.Documentable;
import io.ballerina.compiler.api.symbols.Documentation;
import io.ballerina.compiler.api.symbols.ErrorTypeSymbol;
import io.ballerina.compiler.api.symbols.FunctionSymbol;
import io.ballerina.compiler.api.symbols.FunctionTypeSymbol;
import io.ballerina.compiler.api.symbols.IntersectionTypeSymbol;
import io.ballerina.compiler.api.symbols.MapTypeSymbol;
import io.ballerina.compiler.api.symbols.MethodSymbol;
import io.ballerina.compiler.api.symbols.ObjectTypeSymbol;
import io.ballerina.compiler.api.symbols.ParameterKind;
import io.ballerina.compiler.api.symbols.ParameterSymbol;
import io.ballerina.compiler.api.symbols.PathParameterSymbol;
import io.ballerina.compiler.api.symbols.Qualifier;
import io.ballerina.compiler.api.symbols.RecordFieldSymbol;
import io.ballerina.compiler.api.symbols.RecordTypeSymbol;
import io.ballerina.compiler.api.symbols.ResourceMethodSymbol;
import io.ballerina.compiler.api.symbols.StreamTypeSymbol;
import io.ballerina.compiler.api.symbols.Symbol;
import io.ballerina.compiler.api.symbols.SymbolKind;
import io.ballerina.compiler.api.symbols.TableTypeSymbol;
import io.ballerina.compiler.api.symbols.TupleTypeSymbol;
import io.ballerina.compiler.api.symbols.TypeDefinitionSymbol;
import io.ballerina.compiler.api.symbols.TypeDescKind;
import io.ballerina.compiler.api.symbols.TypeReferenceTypeSymbol;
import io.ballerina.compiler.api.symbols.TypeSymbol;
import io.ballerina.compiler.api.symbols.UnionTypeSymbol;
import io.ballerina.compiler.api.symbols.VariableSymbol;
import io.ballerina.compiler.api.symbols.resourcepath.PathSegmentList;
import io.ballerina.compiler.api.symbols.resourcepath.ResourcePath;
import io.ballerina.compiler.api.values.ConstantValue;
import io.ballerina.projects.Document;
import io.ballerina.projects.Module;
import io.ballerina.projects.ModuleName;
import io.ballerina.projects.Package;
import io.ballerina.projects.PackageDescriptor;
import io.ballerina.projects.Project;
import io.ballerina.runtime.api.utils.IdentifierUtils;
import io.ballerina.tools.text.LinePosition;
import org.ballerinalang.langserver.LSClientLogger;
import org.ballerinalang.langserver.common.utils.CommonUtil;
import org.ballerinalang.langserver.commons.BallerinaCompilerApi;
import org.ballerinalang.langserver.commons.workspace.WorkspaceManager;
import org.eclipse.lsp4j.MessageType;

import java.io.InputStreamReader;
import java.lang.reflect.Type;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.stream.Stream;

import static io.ballerina.modelgenerator.commons.FunctionData.Kind.isAiClassKind;
import static io.ballerina.modelgenerator.commons.FunctionData.Kind.isConnector;
import static io.ballerina.modelgenerator.commons.FunctionData.Kind.isListener;

/**
 * Factory class to create {@link FunctionData} instances from function symbols.
 *
 * <p>
 * The class first checks if the item exists in the index. If not, it derives the symbol using the semantic model.
 * </p>
 *
 * @since 1.0.0
 */
public class FunctionDataBuilder {

    public static final String DISPLAY_ANNOTATION = "display";
    public static final String LABEL = "label";
    public static final String GET_DEFAULT_MODEL_PROVIDER_FUNCTION_NAME = "getDefaultModelProvider";
    public static final String GET_DEFAULT_EMBEDDING_PROVIDER_FUNCTION_NAME = "getDefaultEmbeddingProvider";
    private static final String WSO2_MODEL_PROVIDER_TYPE_NAME = "Wso2ModelProvider";
    private static final String WSO2_EMBEDDING_PROVIDER_TYPE_NAME = "Wso2EmbeddingProvider";
    private static final String MODEL_TYPE_PARAMETER_NAME = "modelType";
    private SemanticModel semanticModel;
    private TypeSymbol errorTypeSymbol;
    private Package resolvedPackage;
    private Document document;
    private FunctionSymbol functionSymbol;
    private FunctionData.Kind functionKind;
    private String functionName;
    private String description;
    private ModuleInfo moduleInfo;
    private ModuleInfo userModuleInfo;
    private String resourcePath;
    private ObjectTypeSymbol parentSymbol;
    private String parentSymbolType;
    private LSClientLogger lsClientLogger;
    private Project project;
    private boolean isCurrentModule;
    private boolean enableIndex;
    private WorkspaceManager workspaceManager;
    private Path filePath;

    public static final String REST_RESOURCE_PATH = "/path/to/subdirectory";
    public static final String REST_PARAM_PATH = "/path/to/resource";
    public static final String REST_RESOURCE_PATH_LABEL = "Remaining Resource Path";

    // Package resolution messages
    private static final String PULLING_THE_MODULE_MESSAGE = "Pulling the module '%s' from the central";
    private static final String MODULE_PULLING_FAILED_MESSAGE = "Failed to pull the module: %s";
    private static final String MODULE_PULLING_SUCCESS_MESSAGE = "Successfully pulled the module: %s";

    private static final String CLIENT_SYMBOL = "Client";

    // Add a static field for the connector name correction map
    private static final String CONNECTOR_NAME_CORRECTION_JSON = "connector_name_correction.json";
    private static final Type CONNECTOR_NAME_MAP_TYPE = new TypeToken<Map<String, String>>() { }.getType();
    private static final Map<String, String> CONNECTOR_NAME_MAP;
    static {
        Map<String, String> map;
        try (InputStreamReader reader = new InputStreamReader(
                Objects.requireNonNull(
                        FunctionDataBuilder.class.getClassLoader().getResourceAsStream(CONNECTOR_NAME_CORRECTION_JSON)),
                StandardCharsets.UTF_8)) {
            map = new Gson().fromJson(reader, CONNECTOR_NAME_MAP_TYPE);
        } catch (Throwable e) {
            map = Map.of();
        }
        CONNECTOR_NAME_MAP = map;
    }

    public FunctionDataBuilder semanticModel(SemanticModel semanticModel) {
        this.semanticModel = semanticModel;
        this.errorTypeSymbol = semanticModel.types().ERROR;
        return this;
    }

    public FunctionDataBuilder resolvedPackage(Package resolvedPackage) {
        if (resolvedPackage == null) {
            return this;
        }
        if (semanticModel == null) {
            semanticModel(PackageUtil.getCompilation(resolvedPackage).getSemanticModel(
                    resolvedPackage.getDefaultModule().moduleId()));
        }
        this.resolvedPackage = resolvedPackage;
        return this;
    }

    public FunctionDataBuilder name(String name) {
        this.functionName = name;
        return this;
    }

    public FunctionDataBuilder document(Document document) {
        this.document = document;
        return this;
    }

    public FunctionDataBuilder moduleInfo(ModuleInfo moduleInfo) {
        this.moduleInfo = moduleInfo;
        return this;
    }

    public FunctionDataBuilder resourcePath(String resourcePath) {
        this.resourcePath = resourcePath;
        return this;
    }

    public FunctionDataBuilder functionSymbol(FunctionSymbol functionSymbol) {
        if (moduleInfo == null) {
            functionSymbol.getModule().ifPresent(module -> moduleInfo = ModuleInfo.from(module.id()));
        }
        if (functionKind == null) {
            functionKind = getFunctionKind(functionSymbol);
        }
        this.functionSymbol = functionSymbol;
        return this;
    }

    public FunctionDataBuilder functionResultKind(FunctionData.Kind kind) {
        this.functionKind = kind;
        return this;
    }

    public FunctionDataBuilder userModuleInfo(ModuleInfo moduleInfo) {
        this.userModuleInfo = moduleInfo;
        return this;
    }

    public FunctionDataBuilder parentSymbolType(String parentSymbolType) {
        this.parentSymbolType = parentSymbolType;
        return this;
    }

    public FunctionDataBuilder parentSymbol(ObjectTypeSymbol parentSymbol) {
        if (moduleInfo == null) {
            parentSymbol.getModule().ifPresent(module -> moduleInfo = ModuleInfo.from(module.id()));
        }
        this.parentSymbol = parentSymbol;
        return this;
    }

    public FunctionDataBuilder parentSymbol(SemanticModel semanticModel, Document document, LinePosition position,
                                            String parentSymbolName) {
        Stream<Symbol> symbolStream = (document == null || position == null)
                ? semanticModel.moduleSymbols().parallelStream()
                : semanticModel.visibleSymbols(document, position).parallelStream();
        setParentSymbol(symbolStream, parentSymbolName);
        return this;
    }

    public FunctionDataBuilder parentSymbol(SemanticModel semanticModel, String parentSymbolName) {
        setParentSymbol(semanticModel.moduleSymbols().parallelStream(), parentSymbolName);
        return this;
    }

    public FunctionDataBuilder lsClientLogger(LSClientLogger lsClientLogger) {
        this.lsClientLogger = lsClientLogger;
        return this;
    }

    public FunctionDataBuilder project(Project project) {
        this.project = project;
        return this;
    }

    public FunctionDataBuilder enableIndex() {
        this.enableIndex = true;
        return this;
    }

    public FunctionDataBuilder workspaceManager(WorkspaceManager workspaceManager) {
        this.workspaceManager = workspaceManager;
        return this;
    }

    public FunctionDataBuilder filePath(Path filePath) {
        this.filePath = filePath;
        return this;
    }

    private void setParentSymbol(Stream<Symbol> symbolStream, String parentSymbolName) {
        this.parentSymbol = symbolStream
                .filter(symbol -> symbol.kind() == SymbolKind.VARIABLE && symbol.nameEquals(parentSymbolName))
                .map(symbol -> CommonUtils.getRawType(((VariableSymbol) symbol).typeDescriptor()))
                .filter(typeSymbol -> typeSymbol instanceof ObjectTypeSymbol)
                .map(typeSymbol -> (ObjectTypeSymbol) typeSymbol).findFirst()
                .orElse(null);
    }

    private void resolvePackageAndSemanticModel() {
        if (workspaceManager != null && filePath != null) {
            boolean isLocal = PackageUtil.isLocalFunction(workspaceManager, filePath,
                    moduleInfo.org(), moduleInfo.moduleName());
            if (isLocal) {
                // For local functions: use current workspace package + document + semantic model
                Optional<Project> optProject = workspaceManager.project(filePath);
                if (optProject.isEmpty()) {
                    return;
                }
                Package currentPackage = optProject.get().currentPackage();
                Module defaultModule = currentPackage.getDefaultModule();
                Document document = defaultModule.document(currentPackage.project().documentId(filePath));

                this.resolvedPackage(currentPackage)
                        .document(document)
                        .project(currentPackage.project());

                // Set semantic model automatically for local functions
                SemanticModel semanticModel = workspaceManager.semanticModel(filePath).orElseThrow();
                this.semanticModel(semanticModel);
                return;
            }
        }

        // For external functions: resolve from central repository
        Package resolvedPackage = PackageUtil.resolveModulePackage(
                moduleInfo.org(), moduleInfo.packageName(), moduleInfo.version()).orElse(null);
        this.resolvedPackage(resolvedPackage);
    }

    private void updateModuleInfo() {
        // Update version from resolved package if available
        if (resolvedPackage != null && moduleInfo != null) {
            String resolvedVersion = resolvedPackage.descriptor().version().toString();
            // Always update moduleInfo with the resolved version to ensure consistency
            this.moduleInfo = new ModuleInfo(
                moduleInfo.org(),
                moduleInfo.packageName(),
                moduleInfo.moduleName(),
                resolvedVersion
            );
        }
    }

    public FunctionData build() {
        // The function name is required to build the FunctionResult
        if (this.functionName == null) {
            if (functionSymbol == null) {
                throw new IllegalStateException("Function symbol must be provided if function name is not given");
            }
            this.functionName = this.functionSymbol.getName()
                    .orElseThrow(() -> new IllegalStateException("Function name not found"));
        }

        // The module information is required to build the FunctionResult
        if (moduleInfo == null) {
            throw new IllegalStateException("Module information not found");
        }

        // Perform automatic package resolution if workspaceManager and filePath are provided
        resolvePackageAndSemanticModel();

        // Ensure moduleInfo is updated with resolvedPackage version before any usage
        updateModuleInfo();

        // Check if this is a local symbol
        isCurrentModule = userModuleInfo != null && (!moduleInfo.isComplete() || userModuleInfo.equals(moduleInfo));

        // Defaulting the function result kind to FUNCTION if not provided
        if (functionKind == null) {
            functionKind = FunctionData.Kind.FUNCTION;
        }

        checkLocalModule();

        // Check if the package exists in the workspace
        if (semanticModel == null && project != null) {
            BallerinaCompilerApi compilerApi = BallerinaCompilerApi.getInstance();
            Optional<Project> workspaceProject = compilerApi.getWorkspaceProject(project);
            if (workspaceProject.isPresent()) {
                List<Project> childProjects = compilerApi.getWorkspaceProjectsInOrder(workspaceProject.get());
                for (Project childProject : childProjects) {
                    Package currentPackage = childProject.currentPackage();
                    String currentPackageName = currentPackage.packageName().value();
                    if (currentPackage.packageOrg().value().equals(moduleInfo.org()) &&
                            (currentPackageName.equals(moduleInfo.packageName()) ||
                                    currentPackageName.equals(moduleInfo.moduleName()))) {
                        // TODO: Extend the support for sub-modules of a project.
                        semanticModel(PackageUtil.getCompilation(childProject)
                                .getSemanticModel(currentPackage.getDefaultModule().moduleId()));
                        break;
                    }
                }
            }
        }

        // Check the index before attempting external package resolution.
        // This avoids unnecessary package pulls and resolution failures for already-indexed symbols.
        if (enableIndex) {
            Optional<FunctionData> indexedResult = getFunctionFromIndex();
            if (indexedResult.isPresent()) {
                return indexedResult.get();
            }
        }

        // Assume the package is from an external library, and pull the package if not available locally
        if (semanticModel == null) {
            if (moduleInfo.version() == null) {
                // Resolve the version: the cached (provisioned) version in offline test mode,
                // otherwise the latest from the central repository.
                moduleInfo = PackageUtil.fetchVersionIfNotExists(moduleInfo);
            }
            if (moduleInfo.isComplete() &&
                    PackageUtil.isModuleUnresolved(moduleInfo.org(), moduleInfo.packageName(), moduleInfo.version())) {
                notifyClient(MessageType.Info, PULLING_THE_MODULE_MESSAGE);
                if (semanticModel == null) {
                    deriveSemanticModel();
                }
                if (semanticModel == null) {
                    notifyClient(MessageType.Error, MODULE_PULLING_FAILED_MESSAGE);
                } else {
                    notifyClient(MessageType.Info, MODULE_PULLING_SUCCESS_MESSAGE);
                }
            }
        }

        // Fetch the semantic model if not provided
        if (semanticModel == null) {
            deriveSemanticModel();
        }

        // Find the symbol if not provided
        if (functionSymbol == null) {
            // If the parent symbol is not found, and its name is provided, search for the parent symbol
            if (parentSymbol == null && parentSymbolType != null) {
                setParentSymbol();
            }

            // If the parent symbol is not found, search for functions in the module-level
            if (parentSymbol == null) {
                FunctionSymbol fetchedSymbol = semanticModel.moduleSymbols().parallelStream()
                        .filter(moduleSymbol -> moduleSymbol.nameEquals(functionName) &&
                                moduleSymbol instanceof FunctionSymbol)
                        .map(moduleSymbol -> (FunctionSymbol) moduleSymbol)
                        .findFirst()
                        .orElseThrow(() -> new IllegalStateException("Function symbol not found"));
                functionSymbol(fetchedSymbol);
            } else {
                if (isAiClassKind(functionKind)) {
                    ClassSymbol classSymbol = (ClassSymbol) parentSymbol;
                    Optional<MethodSymbol> initMethod = classSymbol.initMethod();
                    if (initMethod.isEmpty()) {
                        throw new IllegalStateException("The init method should not be empty");
                    }
                    // Fetch the init method if it is a class related to AI
                    functionSymbol = initMethod.get();
                } else if (isListener(functionKind)) {
                    ClassSymbol classSymbol = (ClassSymbol) parentSymbol;
                    Optional<MethodSymbol> initMethod = classSymbol.initMethod();

                    // If the init method is not found, create the function data without parameters
                    if (initMethod.isEmpty()) {
                        String clientName = getFunctionName();
                        FunctionData functionData = new FunctionData(0, clientName, getDescription(classSymbol),
                                getTypeSignature(clientName), moduleInfo.packageName(), moduleInfo.moduleName(),
                                moduleInfo.org(), moduleInfo.version(), "", functionKind,
                                false, false, null);
                        functionData.setParameters(Map.of());
                        return functionData;
                    }
                    // Fetch the init method if it is a connector or a model provider or an embedding provider
                    functionSymbol = initMethod.get();
                } else if (isConnector(functionKind)) {
                    if ((parentSymbol.kind() != SymbolKind.CLASS ||
                            !parentSymbol.qualifiers().contains(Qualifier.CLIENT))) {
                        throw new IllegalStateException("The connector should be a client class");
                    }
                    ClassSymbol classSymbol = (ClassSymbol) parentSymbol;
                    Optional<MethodSymbol> initMethod = classSymbol.initMethod();

                    // If the init method is not found, create the function data without parameters
                    if (initMethod.isEmpty()) {
                        String clientName = getFunctionName();
                        FunctionData functionData = new FunctionData(0, clientName, getDescription(classSymbol),
                                getTypeSignature(clientName), moduleInfo.packageName(), moduleInfo.moduleName(),
                                moduleInfo.org(), moduleInfo.version(), "", functionKind,
                                false, false, getImportStatement(moduleInfo));
                        functionData.setParameters(Map.of());
                        return functionData;
                    }
                    // Fetch the init method if it is a connector or a model provider or an embedding provider
                    functionSymbol = initMethod.get();
                } else {
                    if (functionKind == FunctionData.Kind.RESOURCE) {
                        // TODO: Need to improve how resource path is stored in the codedata, as this should reflect
                        //  to the key in the methods map for easier retrieval.

                        // We need to identify the resource method through its signature since we cannot use the
                        // methods map. This limitation occurs because the resource path in the codedata is
                        // normalized for display, making it impossible to extract the correct key.
                        functionSymbol = parentSymbol.methods().values().parallelStream()
                                .filter(symbol -> symbol.kind() == SymbolKind.RESOURCE_METHOD &&
                                        symbol.nameEquals(functionName) &&
                                        buildResourcePathTemplate(symbol).resourcePathTemplate()
                                                .equals(resourcePath))
                                .findFirst()
                                .orElse(null);
                    } else if (functionKind == FunctionData.Kind.CLASS_INIT) {
                        if (parentSymbol.kind() != SymbolKind.CLASS) {
                            throw new IllegalStateException("Parent symbol should be a class symbol");
                        }
                        ClassSymbol classSymbol = (ClassSymbol) parentSymbol;
                        Optional<MethodSymbol> initMethod = classSymbol.initMethod();
                        if (initMethod.isPresent()) {
                            functionSymbol = initMethod.get();
                        } else {
                            String clientName = getFunctionName();
                            FunctionData functionData = new FunctionData(0, clientName, getDescription(classSymbol),
                                    getTypeSignature(clientName), moduleInfo.packageName(), moduleInfo.moduleName(),
                                    moduleInfo.org(), moduleInfo.version(), "", functionKind,
                                    false, false, null);
                            functionData.setParameters(Map.of());
                            return functionData;
                        }
                    } else {
                        // Fetch the respective method using the function name
                        // TODO: We are special-casing the scenario where the index is not used. We should generalize
                        //  the implementation after properly handling lang-lib functions.
                        functionSymbol = parentSymbol.methods().get(CommonUtils.removeQuotedIdentifier(functionName));
                    }
                    if (functionSymbol == null) {
                        throw new IllegalStateException("Function symbol not found");
                    }
                }
            }
        }

        if (description == null) {
            // Set the description of the client class if it is a connector, Else, use the function itself
            Documentable documentable =
                    functionKind == FunctionData.Kind.CONNECTOR ? (ClassSymbol) parentSymbol : functionSymbol;
            this.description = getDescription(documentable);
        }

        // Obtain the return information of the function
        FunctionTypeSymbol functionTypeSymbol = functionSymbol.typeDescriptor();
        ReturnData returnData = getReturnData(functionSymbol);
        ParamForTypeInfer paramForTypeInfer = returnData.paramForTypeInfer();

        // Store the resource path params
        Map<String, ParameterData> parameters = new LinkedHashMap<>();
        if (functionKind == FunctionData.Kind.RESOURCE) {
            ResourcePathTemplate resourcePathTemplate = buildResourcePathTemplate(functionSymbol);
            resourcePath = resourcePathTemplate.resourcePathTemplate();
            resourcePathTemplate.pathParams().forEach(param -> parameters.put(param.name(), param));
        }

        FunctionData functionData = new FunctionData(0, getFunctionName(), description, returnData.returnType(),
                moduleInfo.packageName(), moduleInfo.moduleName(), moduleInfo.org(), moduleInfo.version(),
                resourcePath, functionKind, returnData.returnError(),
                paramForTypeInfer != null, returnData.importStatements());

        // Populate ReturnTypeData with links
        populateReturnTypeLinks(functionData, functionTypeSymbol, returnData.returnType());

        Types types = semanticModel.types();
        TypeBuilder builder = semanticModel.types().builder();
        UnionTypeSymbol union = builder.UNION_TYPE.withMemberTypes(types.BOOLEAN, types.NIL, types.STRING, types.INT,
                types.FLOAT, types.DECIMAL, types.BYTE, types.REGEX, types.XML).build();

        Map<String, String> documentationMap =
                functionSymbol.documentation().map(Documentation::parameterMap).orElse(Map.of());
        functionTypeSymbol.params().ifPresent(paramList -> paramList.forEach(paramSymbol -> parameters.putAll(
                getParameters(paramSymbol, documentationMap, paramForTypeInfer, union))));
        functionTypeSymbol.restParam().ifPresent(paramSymbol -> parameters.putAll(
                getParameters(paramSymbol, documentationMap, paramForTypeInfer, union)));
        functionData.setParameters(parameters);
        return functionData;
    }

    private void checkLocalModule() {
        if (project != null && moduleInfo != null && isLocal()) {
            for (Module module : project.currentPackage().modules()) {
                ModuleName moduleName = module.moduleName();
                if ((moduleName.packageName() + "." + moduleName.moduleNamePart()).equals(moduleInfo.moduleName())) {
                    semanticModel(PackageUtil.getCompilation(project).getSemanticModel(module.moduleId()));
                    break;
                }
            }
        }
    }

    public boolean isLocal() {
        if (project == null || moduleInfo == null) {
            return false;
        }
        PackageDescriptor descriptor = project.currentPackage().descriptor();
        if (!moduleInfo.org().equals(descriptor.org().value())) {
            return false;
        }
        String packageName = moduleInfo.packageName();
        String descriptorName = descriptor.name().value();
        if (packageName != null) {
            return packageName.startsWith(descriptorName);
        }
        String moduleName = moduleInfo.moduleName();
        if (moduleName != null) {
            return moduleName.startsWith(descriptorName);
        }
        return false;
    }

    private ReturnData getReturnData(FunctionSymbol symbol) {
        FunctionTypeSymbol functionTypeSymbol = symbol.typeDescriptor();
        Optional<TypeSymbol> returnTypeSymbol = functionTypeSymbol.returnTypeDescriptor();
        String returnType = returnTypeSymbol
                .map(typeSymbol -> {
                    if (isGetDefaultModelProvider(functionKind, functionName)) {
                        return CommonUtils.getClassType(moduleInfo.moduleName(), WSO2_MODEL_PROVIDER_TYPE_NAME);
                    }
                    if (isGetDefaultEmbeddingProvider(functionKind, functionName)) {
                        return CommonUtils.getClassType(moduleInfo.moduleName(), WSO2_EMBEDDING_PROVIDER_TYPE_NAME);
                    }
                    if (functionKind == FunctionData.Kind.CLASS_INIT || isConnector(functionKind)
                            || isAiClassKind(functionKind)) {
                        return CommonUtils.getClassType(moduleInfo.moduleName(),
                                parentSymbol.getName().orElse("Client"));
                    }
                    return getTypeSignature(typeSymbol, true);
                }).orElse("");

        ParamForTypeInfer paramForTypeInfer = null;
        if (symbol.external()) {
            List<String> paramNameList = new ArrayList<>();
            functionTypeSymbol.params().ifPresent(paramList -> paramList
                    .stream()
                    .filter(paramSym -> paramSym.paramKind() == ParameterKind.DEFAULTABLE)
                    .forEach(paramSymbol -> paramNameList.add(paramSymbol.getName().orElse(""))));

            Map<String, TypeSymbol> returnTypeMap = new HashMap<>();
            returnTypeSymbol.ifPresent(typeSymbol -> allMembers(returnTypeMap, typeSymbol));
            for (String paramName : paramNameList) {
                if (returnTypeMap.containsKey(paramName)) {
                    TypeSymbol typeDescriptor = returnTypeMap.get(paramName);
                    TypeSymbol typeSymbol = ((TypeReferenceTypeSymbol) typeDescriptor).typeDescriptor();
                    String defaultValue = getTypeSignature(typeSymbol);
                    paramForTypeInfer = new ParamForTypeInfer(paramName, defaultValue, typeSymbol,
                            CommonUtils.getTypeSignature(semanticModel, CommonUtils.getRawType(typeDescriptor), true));
                    break;
                }
            }
        }

        // Resolving import statements
        String importStatements =
                functionKind == FunctionData.Kind.CLASS_INIT || isConnector(functionKind) || isAiClassKind(functionKind)
                        ? getImportStatement(moduleInfo)
                        : returnTypeSymbol.map(typeSymbol -> getImportStatements(returnTypeSymbol.get())).orElse(null);

        boolean returnError = returnTypeSymbol
                .map(returnTypeDesc -> CommonUtils.subTypeOf(returnTypeDesc, errorTypeSymbol)).orElse(false);
        return new ReturnData(returnType, paramForTypeInfer, returnError, importStatements);
    }

    private boolean isGetDefaultModelProvider(FunctionData.Kind functionKind, String functionName) {
        return functionKind == FunctionData.Kind.MODEL_PROVIDER
                && functionName.equals(GET_DEFAULT_MODEL_PROVIDER_FUNCTION_NAME);
    }

    private boolean isGetDefaultEmbeddingProvider(FunctionData.Kind functionKind, String functionName) {
        return functionKind == FunctionData.Kind.EMBEDDING_PROVIDER
                && functionName.equals(GET_DEFAULT_EMBEDDING_PROVIDER_FUNCTION_NAME);
    }

    private void setParentSymbol() {
        if (semanticModel == null) {
            deriveSemanticModel();
        }
        ObjectTypeSymbol fetchedParentTypeSymbol = semanticModel.moduleSymbols().parallelStream()
                .filter(moduleSymbol -> moduleSymbol.nameEquals(parentSymbolType) &&
                        moduleSymbol instanceof ObjectTypeSymbol)
                .map(moduleSymbol -> (ObjectTypeSymbol) moduleSymbol)
                .findFirst()
                .orElseThrow(() -> new IllegalStateException("Parent symbol not found"));
        parentSymbol(fetchedParentTypeSymbol);
    }

    private FunctionData.Kind getFunctionKind(FunctionSymbol symbol) {
        if (symbol.kind() == SymbolKind.METHOD) {
            List<Qualifier> qualifiers = symbol.qualifiers();
            if (qualifiers.contains(Qualifier.REMOTE)) {
                return FunctionData.Kind.REMOTE;
            }
            if (qualifiers.contains(Qualifier.RESOURCE)) {
                return FunctionData.Kind.RESOURCE;
            }
        }
        if (symbol.kind() == SymbolKind.RESOURCE_METHOD) {
            return FunctionData.Kind.RESOURCE;
        }
        return FunctionData.Kind.FUNCTION;
    }

    private void deriveSemanticModel() {
        semanticModel(PackageUtil.getSemanticModel(moduleInfo)
                .orElseThrow(() -> new IllegalStateException("Semantic model not found")));
    }

    public List<FunctionData> buildChildNodes() {
        if (parentSymbolType != null && moduleInfo != null) {
            List<FunctionData> fetchedMethods = getMethodsFromIndex();
            if (!fetchedMethods.isEmpty()) {
                return fetchedMethods;
            }
        }

        // The parent symbol must be present
        if (this.parentSymbol == null && this.parentSymbolType == null) {
            throw new IllegalStateException("Parent symbol must be provided");
        }

        // Ensure moduleInfo is updated with resolved package version before any usage
        updateModuleInfo();
        checkLocalModule();

        // Derive if the semantic model is not provided
        if (semanticModel == null) {
            deriveSemanticModel();
        }

        // Derive if the parent symbol is not provided
        if (this.parentSymbol == null) {
            setParentSymbol();
        }

        // The parent symbol should be a class symbol
        if (this.parentSymbol.kind() != SymbolKind.CLASS) {
            throw new IllegalStateException("Parent symbol should be a class symbol");
        }

        ClassSymbol classSymbol = (ClassSymbol) this.parentSymbol;
        List<FunctionData> functionDataList = new ArrayList<>();
        for (MethodSymbol methodSymbol : classSymbol.methods().values()) {
            List<Qualifier> qualifiers = methodSymbol.qualifiers();
            if (qualifiers.contains(Qualifier.PRIVATE)) {
                continue;
            }
            FunctionData.Kind methodKind = getFunctionKind(methodSymbol);
            if (methodKind == FunctionData.Kind.FUNCTION && !qualifiers.contains(Qualifier.PUBLIC)) {
                continue;
            }
            ReturnData returnData = getReturnData(methodSymbol);

            // If the method is a resource method, the resource path should be derived
            String methodResourcePath;
            if (methodKind == FunctionData.Kind.RESOURCE) {
                ResourcePathTemplate resourcePathTemplate = buildResourcePathTemplate(methodSymbol);
                methodResourcePath = resourcePathTemplate.resourcePathTemplate();
            } else {
                methodResourcePath = "";
            }

            FunctionData functionData = new FunctionData(0,
                    methodSymbol.getName().orElse(""),
                    getDescription(methodSymbol),
                    returnData.returnType(),
                    moduleInfo.packageName(),
                    moduleInfo.moduleName(),
                    moduleInfo.org(),
                    moduleInfo.version(),
                    methodResourcePath,
                    methodKind,
                    returnData.returnError(),
                    returnData.paramForTypeInfer() != null,
                    returnData.importStatements());

            // Populate ReturnTypeData with links
            FunctionTypeSymbol methodTypeSymbol = methodSymbol.typeDescriptor();
            populateReturnTypeLinks(functionData, methodTypeSymbol, returnData.returnType());

            // Populate method parameters
            Map<String, ParameterData> methodParameters = new LinkedHashMap<>();
            if (methodKind == FunctionData.Kind.RESOURCE) {
                ResourcePathTemplate resourcePathTemplate = buildResourcePathTemplate(methodSymbol);
                resourcePathTemplate.pathParams().forEach(param -> methodParameters.put(param.name(), param));
            }

            ParamForTypeInfer paramForTypeInfer = returnData.paramForTypeInfer();
            Types types = semanticModel.types();
            TypeBuilder builder = semanticModel.types().builder();
            UnionTypeSymbol union = builder.UNION_TYPE.withMemberTypes(types.BOOLEAN, types.NIL, types.STRING,
                    types.INT, types.FLOAT, types.DECIMAL, types.BYTE, types.REGEX, types.XML).build();

            Map<String, String> documentationMap =
                    methodSymbol.documentation().map(Documentation::parameterMap).orElse(Map.of());
            methodTypeSymbol.params().ifPresent(paramList -> paramList.forEach(paramSymbol -> methodParameters.putAll(
                    getParameters(paramSymbol, documentationMap, paramForTypeInfer, union))));
            methodTypeSymbol.restParam().ifPresent(paramSymbol -> methodParameters.putAll(
                    getParameters(paramSymbol, documentationMap, paramForTypeInfer, union)));
            functionData.setParameters(methodParameters);

            functionDataList.add(functionData);
        }
        return functionDataList;
    }

    private Optional<FunctionData> getFunctionFromIndex() {
        DatabaseManager dbManager;
        try {
            dbManager = DatabaseManager.getInstance();
        } catch (Throwable e) {
            return Optional.empty();
        }

        // Skipping the index since we currently only index connectors with the name "Client".
        // TODO: This should be removed after the package index is revamped.
        if (parentSymbolType != null && !parentSymbolType.isEmpty() && !CLIENT_SYMBOL.equals(parentSymbolType)) {
            return Optional.empty();
        }

        Optional<FunctionData> optFunctionResult =
                dbManager.getFunction(moduleInfo.org(), moduleInfo.packageName(), moduleInfo.moduleName(),
                        getFunctionName(), functionKind, resourcePath);
        if (optFunctionResult.isEmpty()) {
            return Optional.empty();
        }
        FunctionData functionData = optFunctionResult.get();
        LinkedHashMap<String, ParameterData> parameters =
                dbManager.getFunctionParametersAsMap(functionData.functionId());
        functionData.setParameters(parameters);
        return Optional.of(functionData);
    }

    private List<FunctionData> getMethodsFromIndex() {
        DatabaseManager dbManager = DatabaseManager.getInstance();
        List<FunctionData> methods = dbManager.getMethods(parentSymbolType, moduleInfo.org(), moduleInfo.moduleName());
        if (methods.isEmpty()) {
            return new ArrayList<>();
        }
        methods.parallelStream()
                .forEach(method -> method.setParameters(dbManager.getFunctionParametersAsMap(method.functionId())));
        return methods;
    }

    private Map<String, ParameterData> getParameters(ParameterSymbol paramSymbol,
                                                     Map<String, String> documentationMap,
                                                     ParamForTypeInfer paramForTypeInfer,
                                                     UnionTypeSymbol union) {
        Map<String, ParameterData> parameters = new LinkedHashMap<>();
        String paramName = paramSymbol.getName().orElse("");
        String paramDescription = documentationMap.get(paramName);
        ParameterData.Kind parameterKind = ParameterData.Kind.fromKind(paramSymbol.paramKind());
        boolean deprecated = isDeprecated(paramSymbol.annotAttachments());
        String paramType;
        boolean optional = true;
        String placeholder;
        String defaultValue = null;
        TypeSymbol typeSymbol = paramSymbol.typeDescriptor();
        String importStatements = getImportStatements(typeSymbol);
        if (parameterKind == ParameterData.Kind.REST_PARAMETER) {
            placeholder = DefaultValueGeneratorUtil.getDefaultValueForType(
                    ((ArrayTypeSymbol) typeSymbol).memberTypeDescriptor());
            paramType = getTypeSignature(((ArrayTypeSymbol) typeSymbol).memberTypeDescriptor());
        } else if (parameterKind == ParameterData.Kind.INCLUDED_RECORD) {
            Map<String, String> includedRecordParamDocs = new HashMap<>();
            if (typeSymbol.getModule().isPresent() && typeSymbol.getName().isPresent()) {
                ModuleID id = typeSymbol.getModule().get().id();
                if (semanticModel != null) {
                    Optional<Symbol> typeByName = semanticModel.types().getTypeByName(id.orgName(), id.moduleName(),
                            "", typeSymbol.getName().get());
                    if (typeByName.isPresent() && typeByName.get() instanceof TypeDefinitionSymbol typeDefSymbol) {
                        Optional<Documentation> documentation = typeDefSymbol.documentation();
                        documentation.ifPresent(documentation1 -> includedRecordParamDocs.putAll(
                                documentation1.parameterMap()));
                    }
                }
            }
            paramType = getTypeSignature(typeSymbol);
            Map<String, ParameterData> includedParameters = getIncludedRecordParams(
                    (RecordTypeSymbol) CommonUtil.getRawType(typeSymbol), true, includedRecordParamDocs, union);
            parameters.putAll(includedParameters);
            placeholder = DefaultValueGeneratorUtil.getDefaultValueForType(typeSymbol);
        } else if (parameterKind == ParameterData.Kind.REQUIRED) {
            paramType = getTypeSignature(typeSymbol);
            placeholder = DefaultValueGeneratorUtil.getDefaultValueForType(typeSymbol);
            optional = false;
        } else {
            if (paramForTypeInfer != null) {
                if (paramForTypeInfer.paramName().equals(paramName)) {
                    placeholder = paramForTypeInfer.defaultValue();
                    defaultValue = paramForTypeInfer.defaultValue();
                    paramType = paramForTypeInfer.type();
                    typeSymbol = paramForTypeInfer.typeSymbol();
                    parameters.put(paramName, ParameterData.from(paramName, paramDescription,
                            getLabel(paramSymbol.annotAttachments(), paramName), paramType, placeholder, defaultValue,
                            ParameterData.Kind.PARAM_FOR_TYPE_INFER, optional, deprecated, importStatements,
                            typeSymbol));
                    return parameters;
                }
            }
            placeholder = DefaultValueGeneratorUtil.getDefaultValueForType(typeSymbol);
            defaultValue = CommonUtils.resolveDefaultValue(paramSymbol, typeSymbol, semanticModel, resolvedPackage,
                    document);
            paramType = getTypeSignature(typeSymbol);
        }
        ParameterData parameterData = ParameterData.from(paramName, paramDescription,
                getLabel(paramSymbol.annotAttachments(), paramName), paramType, placeholder, defaultValue,
                parameterKind, optional, deprecated,
                importStatements, typeSymbol);
        parameters.put(paramName, parameterData);
        addParameterMemberTypes(typeSymbol, parameterData, union);
        return parameters;
    }

    private static void addParameterMemberTypes(TypeSymbol typeSymbol, ParameterData parameterData,
                                                UnionTypeSymbol union) {

        if (typeSymbol instanceof UnionTypeSymbol unionTypeSymbol) {
            unionTypeSymbol.memberTypeDescriptors().forEach(
                    memberType -> addParameterMemberTypes(memberType, parameterData, union));
            return;
        }

        String packageIdentifier = "";
        ModuleInfo moduleInfo = null;
        if (typeSymbol.getModule().isPresent()) {
            ModuleID id = typeSymbol.getModule().get().id();
            packageIdentifier = "%s:%s:%s".formatted(id.orgName(), id.moduleName(), id.version());
            moduleInfo = ModuleInfo.from(id);
        }
        String type = CommonUtils.getTypeSignature(typeSymbol, moduleInfo);
        String kind = "OTHER";
        TypeSymbol rawType = CommonUtils.getRawType(typeSymbol);
        if (typeSymbol.subtypeOf(union)) {
            kind = "BASIC_TYPE";
        } else if (rawType instanceof TupleTypeSymbol) {
            kind = "TUPLE_TYPE";
        } else if (rawType instanceof ArrayTypeSymbol arrayTypeSymbol) {
            kind = "ARRAY_TYPE";
            TypeSymbol memberType = arrayTypeSymbol.memberTypeDescriptor();
            if (memberType.getModule().isPresent()) {
                ModuleID id = memberType.getModule().get().id();
                packageIdentifier = "%s:%s:%s".formatted(id.orgName(), id.moduleName(), id.version());
                moduleInfo = ModuleInfo.from(id);
            }
            type = CommonUtils.getTypeSignature(memberType, moduleInfo);
        } else if (rawType instanceof RecordTypeSymbol) {
            if (typeSymbol instanceof RecordTypeSymbol) {
                kind = "ANON_RECORD_TYPE";
            } else {
                kind = "RECORD_TYPE";
            }
        } else if (rawType instanceof MapTypeSymbol mapTypeSymbol) {
            kind = "MAP_TYPE";
            TypeSymbol typeParam = mapTypeSymbol.typeParam();
            if (typeParam.getModule().isPresent()) {
                ModuleID id = typeParam.getModule().get().id();
                packageIdentifier = "%s:%s:%s".formatted(id.orgName(), id.moduleName(), id.version());
                moduleInfo = ModuleInfo.from(id);
            }
            type = CommonUtils.getTypeSignature(typeSymbol, moduleInfo);
        } else if (rawType instanceof TableTypeSymbol tableTypeSymbol) {
            kind = "TABLE_TYPE";
            TypeSymbol rowTypeParameter = tableTypeSymbol.rowTypeParameter();
            if (rowTypeParameter.getModule().isPresent()) {
                ModuleID id = rowTypeParameter.getModule().get().id();
                packageIdentifier = "%s:%s:%s".formatted(id.orgName(), id.moduleName(), id.version());
                moduleInfo = ModuleInfo.from(id);
            }
            type = CommonUtils.getTypeSignature(typeSymbol, moduleInfo);
        } else if (rawType instanceof StreamTypeSymbol) {
            kind = "STREAM_TYPE";
        } else if (rawType instanceof ObjectTypeSymbol) {
            kind = "OBJECT_TYPE";
        } else if (rawType instanceof FunctionTypeSymbol) {
            kind = "FUNCTION_TYPE";
        } else if (rawType instanceof ErrorTypeSymbol) {
            kind = "ERROR_TYPE";
        }

        String[] typeParts = type.split(":");
        if (typeParts.length > 1) {
            type = typeParts[1];
        }

        parameterData.typeMembers().add(new ParameterMemberTypeData(type, kind, packageIdentifier,
                moduleInfo == null ? "" : moduleInfo.packageName()));
    }

    private void populateReturnTypeLinks(FunctionData functionData, FunctionTypeSymbol functionTypeSymbol,
                                         String returnTypeString) {
        Optional<TypeSymbol> returnTypeSymbol = functionTypeSymbol.returnTypeDescriptor();
        if (returnTypeSymbol.isPresent()) {
            ReturnTypeData returnTypeData = new ReturnTypeData(returnTypeString, returnTypeSymbol.get());
            functionData.setReturnTypeData(returnTypeData);
        }
    }

    private Map<String, ParameterData> getIncludedRecordParams(RecordTypeSymbol recordTypeSymbol,
                                                               boolean insert,
                                                               Map<String, String> documentationMap,
                                                               UnionTypeSymbol union) {
        Map<String, ParameterData> parameters = new LinkedHashMap<>();
        recordTypeSymbol.typeInclusions().forEach(includedType -> {
            if (includedType.getModule().isPresent() && includedType.getName().isPresent()) {
                ModuleID id = includedType.getModule().get().id();
                if (semanticModel != null) {
                    Optional<Symbol> typeByName = semanticModel.types().getTypeByName(id.orgName(), id.moduleName(),
                            "", includedType.getName().get());
                    if (typeByName.isPresent() && typeByName.get() instanceof TypeDefinitionSymbol typeDefSymbol) {
                        Optional<Documentation> documentation = typeDefSymbol.documentation();
                        documentation.ifPresent(doc -> documentationMap.putAll(doc.parameterMap()));
                    }
                }
            }
            parameters.putAll(getIncludedRecordParams((RecordTypeSymbol) CommonUtils.getRawType(includedType), insert,
                    documentationMap, union));
        });
        for (Map.Entry<String, RecordFieldSymbol> entry : recordTypeSymbol.fieldDescriptors().entrySet()) {
            RecordFieldSymbol recordFieldSymbol = entry.getValue();
            TypeSymbol typeSymbol = recordFieldSymbol.typeDescriptor();
            TypeSymbol fieldType = CommonUtil.getRawType(typeSymbol);
            if (fieldType.typeKind() == TypeDescKind.NEVER) {
                continue;
            }
            String paramName = entry.getKey();
            String paramDescription = getDescription(entry.getValue());
            if (documentationMap.containsKey(paramName) && !paramDescription.isEmpty()) {
                documentationMap.put(paramName, paramDescription);
            } else if (!documentationMap.containsKey(paramName)) {
                documentationMap.put(paramName, paramDescription);
            }
            if (!insert) {
                continue;
            }

            String placeholder = DefaultValueGeneratorUtil.getDefaultValueForType(fieldType);
            String defaultValue = CommonUtils.resolveDefaultValue(recordFieldSymbol, fieldType, semanticModel,
                    resolvedPackage, document);
            String paramType = getTypeSignature(typeSymbol);
            boolean optional = recordFieldSymbol.isOptional() || recordFieldSymbol.hasDefaultValue();
            boolean deprecated = isDeprecated(recordFieldSymbol.annotAttachments());
            ParameterData parameterData = ParameterData.from(paramName, documentationMap.get(paramName),
                    getLabel(recordFieldSymbol.annotAttachments(), paramName),
                    paramType, placeholder, defaultValue, ParameterData.Kind.INCLUDED_FIELD, optional, deprecated,
                    getImportStatements(typeSymbol), typeSymbol);
            parameters.put(paramName, parameterData);
            addParameterMemberTypes(typeSymbol, parameterData, union);
        }
        recordTypeSymbol.restTypeDescriptor().ifPresent(typeSymbol -> {
            String paramType = getTypeSignature(typeSymbol);
            String placeholder = DefaultValueGeneratorUtil.getDefaultValueForType(typeSymbol);
            parameters.put("Additional Values", new ParameterData(0, "Additional Values",
                    paramType, ParameterData.Kind.INCLUDED_RECORD_REST, placeholder, null,
                    "Capture key value pairs", null, true, false, getImportStatements(typeSymbol),
                    new ArrayList<>(), typeSymbol));
        });
        return parameters;
    }

    public static void allMembers(Map<String, TypeSymbol> typeMap, TypeSymbol typeSymbol) {

        switch (typeSymbol.typeKind()) {
            case UNION -> {
                UnionTypeSymbol unionTypeSymbol = (UnionTypeSymbol) typeSymbol;
                unionTypeSymbol.memberTypeDescriptors().forEach(memberType -> allMembers(typeMap, memberType));
            }
            case INTERSECTION -> {
                IntersectionTypeSymbol intersectionTypeSymbol = (IntersectionTypeSymbol) typeSymbol;
                intersectionTypeSymbol.memberTypeDescriptors().forEach(memberType -> allMembers(typeMap, memberType));
            }
            case STREAM -> {
                StreamTypeSymbol streamTypeSymbol = (StreamTypeSymbol) typeSymbol;
                allMembers(typeMap, streamTypeSymbol.typeParameter());
                allMembers(typeMap, streamTypeSymbol.completionValueTypeParameter());
            }
            case ARRAY -> {
                ArrayTypeSymbol arrayTypeSymbol = (ArrayTypeSymbol) typeSymbol;
                allMembers(typeMap, arrayTypeSymbol.memberTypeDescriptor());
            }
            case MAP -> {
                MapTypeSymbol mapTypeSymbol = (MapTypeSymbol) typeSymbol;
                allMembers(typeMap, mapTypeSymbol.typeParam());
            }
            case TABLE -> {
                TableTypeSymbol tableTypeSymbol = (TableTypeSymbol) typeSymbol;
                allMembers(typeMap, tableTypeSymbol.rowTypeParameter());
                tableTypeSymbol.keyConstraintTypeParameter().ifPresent(keyType -> allMembers(typeMap, keyType));
            }
            case RECORD -> {
                RecordTypeSymbol recordTypeSymbol = (RecordTypeSymbol) typeSymbol;
                recordTypeSymbol.fieldDescriptors()
                        .forEach((key, value) -> allMembers(typeMap, value.typeDescriptor()));
                recordTypeSymbol.restTypeDescriptor().ifPresent(restType -> allMembers(typeMap, restType));
            }
            default -> typeMap.put(typeSymbol.getName().orElse(""), typeSymbol);
        }
    }

    private ResourcePathTemplate buildResourcePathTemplate(FunctionSymbol functionSymbol) {
        Map<String, String> documentationMap = functionSymbol.documentation().map(Documentation::parameterMap)
                .orElse(Map.of());
        StringBuilder pathBuilder = new StringBuilder();
        ResourceMethodSymbol resourceMethodSymbol = (ResourceMethodSymbol) functionSymbol;
        ResourcePath resourcePath = resourceMethodSymbol.resourcePath();
        List<ParameterData> pathParams = new ArrayList<>();
        switch (resourcePath.kind()) {
            case PATH_SEGMENT_LIST -> {
                PathSegmentList pathSegmentList = (PathSegmentList) resourcePath;
                for (Symbol pathSegment : pathSegmentList.list()) {
                    pathBuilder.append("/");
                    if (pathSegment instanceof PathParameterSymbol pathParameterSymbol) {
                        TypeSymbol typeSymbol = pathParameterSymbol.typeDescriptor();
                        String defaultValue = DefaultValueGeneratorUtil.getDefaultValueForType(typeSymbol);
                        String type =
                                CommonUtils.getTypeSignature(semanticModel, typeSymbol,
                                        true);
                        String paramName = pathParameterSymbol.getName().orElse("");
                        String paramDescription = documentationMap.get(paramName);
                        pathBuilder.append("[").append(paramName).append("]");
                        pathParams.add(
                                ParameterData.from(paramName, type, ParameterData.Kind.PATH_PARAM, defaultValue,
                                        paramDescription, false, typeSymbol));
                    } else {
                        pathBuilder.append(pathSegment.getName().orElse(""));
                    }
                }
                ((PathSegmentList) resourcePath).pathRestParameter().ifPresent(pathRestParameter -> {
                    pathParams.add(
                            ParameterData.from(REST_RESOURCE_PATH_LABEL, "string",
                                    ParameterData.Kind.PATH_REST_PARAM, REST_PARAM_PATH, REST_RESOURCE_PATH_LABEL,
                                    false));
                });
            }
            case PATH_REST_PARAM -> {
                pathBuilder.append(REST_RESOURCE_PATH);
            }
            case DOT_RESOURCE_PATH -> pathBuilder.append("/");
        }
        return new ResourcePathTemplate(pathBuilder.toString(), pathParams);
    }

    public record ResourcePathTemplate(String resourcePathTemplate, List<ParameterData> pathParams) {
    }

    private String getTypeSignature(TypeSymbol typeSymbol) {
        return getTypeSignature(typeSymbol, false);
    }

    private String getTypeSignature(TypeSymbol typeSymbol, boolean ignoreError) {
        if (userModuleInfo == null) {
            return CommonUtils.getTypeSignature(semanticModel, typeSymbol, ignoreError);
        }
        return CommonUtils.getTypeSignature(semanticModel, typeSymbol, ignoreError, userModuleInfo);
    }

    private String getTypeSignature(String type) {
        if (userModuleInfo != null && (!moduleInfo.isComplete() || userModuleInfo.equals(moduleInfo))) {
            return type;
        }
        return CommonUtils.getClassType(moduleInfo.moduleName(), type);
    }

    private String getFunctionName() {
        // Get the client name if it is the init method of the client
        if (isConnector(functionKind) || isAiClassKind(functionKind)) {
            if (parentSymbolType != null) {
                return parentSymbolType;
            }
            if (parentSymbol != null) {
                return CommonUtils.getClassType(moduleInfo.packageName(),
                        parentSymbol.getName().orElse(functionName));
            }
        }
        return functionName;
    }

    private String getDescription(Documentable documentable) {
        return documentable.documentation().flatMap(Documentation::description).orElse("");
    }

    private String getImportStatement(ModuleInfo moduleInfo) {
        if (isCurrentModule && moduleInfo.equals(userModuleInfo)) {
            return null;
        }
        return CommonUtils.getImportStatement(moduleInfo.org(), moduleInfo.packageName(), moduleInfo.moduleName());
    }

    private String getImportStatements(TypeSymbol typeSymbol) {
        if (isCurrentModule && typeSymbol.getModule()
                .map(moduleSymbol -> ModuleInfo.from(moduleSymbol.id()).equals(userModuleInfo)).orElse(false)) {
            return null;
        }
        return CommonUtils.getImportStatements(typeSymbol, moduleInfo).orElse(null);
    }

    private void notifyClient(MessageType messageType, String message) {
        if (lsClientLogger != null) {
            String signature =
                    String.format("%s/%s:%s", moduleInfo.org(), moduleInfo.packageName(), moduleInfo.version());
            lsClientLogger.notifyClient(messageType, String.format(message, signature));
        }
    }

    private String getLabel(List<AnnotationAttachmentSymbol> annotationAttachmentSymbols, String paramName) {
        String output = null;
        for (AnnotationAttachmentSymbol annotAttachment : annotationAttachmentSymbols) {
            AnnotationSymbol annotationSymbol = annotAttachment.typeDescriptor();
            Optional<String> optName = annotationSymbol.getName();
            if (optName.isEmpty()) {
                continue;
            }
            if (!optName.get().equals(DISPLAY_ANNOTATION)) {
                continue;
            }
            Optional<ConstantValue> optAttachmentValue = annotAttachment.attachmentValue();
            if (optAttachmentValue.isEmpty()) {
                break;
            }
            ConstantValue attachmentValue = optAttachmentValue.get();
            if (attachmentValue.valueType().typeKind() != TypeDescKind.RECORD) {
                throw new IllegalStateException("Annotation attachment value is not a record");
            }
            HashMap<?, ?> valueMap = (HashMap<?, ?>) attachmentValue.value();
            Object label = valueMap.get(LABEL);
            if (label == null) {
                break;
            }
            output = label.toString();
        }
        if (output == null || output.isEmpty()) {
            output = paramName;
        }
        return toTitleCase(output);
    }

    private boolean isDeprecated(List<AnnotationAttachmentSymbol> annotationAttachmentSymbols) {
        if (annotationAttachmentSymbols == null) {
            return false;
        }
        for (AnnotationAttachmentSymbol annotAttachment : annotationAttachmentSymbols) {
            AnnotationSymbol annotationSymbol = annotAttachment.typeDescriptor();
            Optional<String> optName = annotationSymbol.getName();
            if (optName.isPresent() && optName.get().equals("deprecated")) {
                return true;
            }
        }
        return false;
    }

    /**
     * Converts a camelCase or PascalCase string to Title Case with spaces, including before numbers. E.g., "targetType"
     * -> "Target Type", "http1Config" -> "Http1 Config", "account_name" -> "Account Name", etc.
     */
    private static String toTitleCase(String input) {
        if (input == null || input.isEmpty()) {
            return input;
        }

        // Escape special characters
        input = IdentifierUtils.unescapeBallerina(input);

        // Remove leading single quote if it exists
        if (input.startsWith("'")) {
            input = input.substring(1);
        }

        // Convert snake case to space-separated words
        input = input.replace('_', ' ');

        // Check for connector name prefix mapping
        for (Map.Entry<String, String> entry : CONNECTOR_NAME_MAP.entrySet()) {
            if (input.startsWith(entry.getKey())) {
                String rest = input.substring(entry.getKey().length());
                input = entry.getValue() + (rest.isEmpty() || Character.isDigit(rest.charAt(0)) ? "" : " ") + rest;
                break;
            }
        }

        // Split camelCase and add spaces before capitals
        String[] words = input.replaceAll("([A-Z]+)([A-Z][a-z])", "$1 $2")
                .replaceAll("([a-z0-9])([A-Z])", "$1 $2")
                .replaceAll("([0-9])([A-Z])", "$1 $2")
                .split(" ");

        // Capitalize first letter of each word
        StringBuilder sb = new StringBuilder(input.length() + words.length);
        for (int i = 0; i < words.length; i++) {
            if (!words[i].isEmpty()) {
                sb.append(Character.toUpperCase(words[i].charAt(0)));
                if (words[i].length() > 1) {
                    sb.append(words[i].substring(1));
                }
                if (i < words.length - 1) {
                    sb.append(' ');
                }
            }
        }
        return sb.toString();
    }

    private record ParamForTypeInfer(String paramName, String defaultValue, TypeSymbol typeSymbol, String type) {
    }

    private record ReturnData(String returnType, ParamForTypeInfer paramForTypeInfer, boolean returnError,
                              String importStatements) {
    }
}
