/*
 *  Copyright (c) 2024, WSO2 LLC. (http://www.wso2.com)
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

package io.ballerina.flowmodelgenerator.extension;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonIOException;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.api.symbols.Symbol;
import io.ballerina.compiler.api.symbols.SymbolKind;
import io.ballerina.compiler.api.symbols.TypeDescKind;
import io.ballerina.compiler.api.symbols.TypeSymbol;
import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.compiler.syntax.tree.NonTerminalNode;
import io.ballerina.flowmodelgenerator.core.DeleteNodeHandler;
import io.ballerina.flowmodelgenerator.core.TypesManager;
import io.ballerina.flowmodelgenerator.core.converters.JsonToTypeMapper;
import io.ballerina.flowmodelgenerator.core.model.Codedata;
import io.ballerina.flowmodelgenerator.core.model.PropertyTypeMemberInfo;
import io.ballerina.flowmodelgenerator.core.model.TypeData;
import io.ballerina.flowmodelgenerator.core.type.AmbiguousTypeCastResolver;
import io.ballerina.flowmodelgenerator.core.type.RecordValueGenerator;
import io.ballerina.flowmodelgenerator.core.type.TypeSymbolAnalyzerFromTypeModel;
import io.ballerina.flowmodelgenerator.extension.request.DeleteTypeRequest;
import io.ballerina.flowmodelgenerator.extension.request.FilePathRequest;
import io.ballerina.flowmodelgenerator.extension.request.FindTypeRequest;
import io.ballerina.flowmodelgenerator.extension.request.GetTypeRequest;
import io.ballerina.flowmodelgenerator.extension.request.JsonToTypeRequest;
import io.ballerina.flowmodelgenerator.extension.request.MultipleTypeUpdateRequest;
import io.ballerina.flowmodelgenerator.extension.request.RecordConfigRequest;
import io.ballerina.flowmodelgenerator.extension.request.RecordValueGenerateRequest;
import io.ballerina.flowmodelgenerator.extension.request.TypeOfExpressionRequest;
import io.ballerina.flowmodelgenerator.extension.request.TypeUpdateRequest;
import io.ballerina.flowmodelgenerator.extension.request.UpdatedRecordConfigRequest;
import io.ballerina.flowmodelgenerator.extension.request.VerifyTypeDeleteRequest;
import io.ballerina.flowmodelgenerator.extension.response.DeleteTypeResponse;
import io.ballerina.flowmodelgenerator.extension.response.MultipleTypeUpdateResponse;
import io.ballerina.flowmodelgenerator.extension.response.RecordConfigResponse;
import io.ballerina.flowmodelgenerator.extension.response.RecordValueGenerateResponse;
import io.ballerina.flowmodelgenerator.extension.response.TypeListResponse;
import io.ballerina.flowmodelgenerator.extension.response.TypeOfExpressionResponse;
import io.ballerina.flowmodelgenerator.extension.response.TypeResponse;
import io.ballerina.flowmodelgenerator.extension.response.TypeUpdateResponse;
import io.ballerina.flowmodelgenerator.extension.response.VerifyTypeDeleteResponse;
import io.ballerina.modelgenerator.commons.FileSystemUtils;
import io.ballerina.modelgenerator.commons.ModuleInfo;
import io.ballerina.modelgenerator.commons.PackageUtil;
import io.ballerina.projects.Document;
import io.ballerina.projects.Project;
import io.ballerina.tools.diagnostics.Location;
import io.ballerina.tools.text.TextDocument;
import io.ballerina.tools.text.TextRange;
import org.ballerinalang.annotation.JavaSPIService;
import org.ballerinalang.diagramutil.connector.models.connector.Type;
import org.ballerinalang.langserver.common.utils.PathUtil;
import org.ballerinalang.langserver.commons.LanguageServerContext;
import org.ballerinalang.langserver.commons.eventsync.exceptions.EventSyncException;
import org.ballerinalang.langserver.commons.service.spi.ExtendedLanguageServerService;
import org.ballerinalang.langserver.commons.workspace.WorkspaceDocumentException;
import org.ballerinalang.langserver.commons.workspace.WorkspaceManager;
import org.ballerinalang.langserver.commons.workspace.WorkspaceManagerProxy;
import org.eclipse.lsp4j.jsonrpc.services.JsonRequest;
import org.eclipse.lsp4j.jsonrpc.services.JsonSegment;
import org.eclipse.lsp4j.services.LanguageServer;

import java.io.IOException;
import java.io.Writer;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;

@JavaSPIService("org.ballerinalang.langserver.commons.service.spi.ExtendedLanguageServerService")
@JsonSegment("typesManager")
public class TypesManagerService implements ExtendedLanguageServerService {

    // A type can be deleted if it has at most one reference (the definition itself).
    public static final int MAX_REFERENCE_FOR_DELETE = 1;
    private static final long MAX_RECORD_CONFIG_JSON_CHARS = 10L * 1024 * 1024;
    private static final String RECORD_CONFIG_ERROR_MESSAGE = "Record config is too large to send. " +
            "The record type has too many nested fields.";
    private WorkspaceManagerProxy workspaceManagerProxy;

    // Cache key for SemanticModel
    private record CacheKey(String org, String packageName, String moduleName, String version) {
    }

    // Cache for SemanticModel instances
    private static final ConcurrentHashMap<CacheKey, SemanticModel> semanticModelCache = new ConcurrentHashMap<>();

    @Override
    public void init(LanguageServer langServer, WorkspaceManagerProxy workspaceManagerProxy,
                     LanguageServerContext serverContext) {
        this.workspaceManagerProxy = workspaceManagerProxy;
    }

    @Override
    public Class<?> getRemoteInterface() {
        return null;
    }

    /**
     * Get all the types in the project with references.
     *
     * @param request {@link FindTypeRequest}
     * @return {@link TypeListResponse} all the types found in the project with references
     */
    @JsonRequest
    public CompletableFuture<TypeListResponse> getTypes(FilePathRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            TypeListResponse response = new TypeListResponse();
            try {
                Path filePath = PathUtil.convertUriStringToPath(request.filePath());
                WorkspaceManager workspaceManager = this.workspaceManagerProxy.get(request.filePath());
                Optional<FileSystemUtils.ModuleModel> moduleModel =
                        FileSystemUtils.resolveModuleModel(workspaceManager, filePath);
                if (moduleModel.isEmpty()) {
                    response.setTypes(new JsonArray());
                    return response;
                }
                TypesManager typesManager = new TypesManager(moduleModel.get().document());
                JsonElement allTypes = typesManager.getAllTypes(moduleModel.get().semanticModel());
                response.setTypes(allTypes);
            } catch (Throwable e) {
                response.setTypes(new JsonArray());
                response.setError(e);
            }
            return response;
        });
    }

    /**
     * Get the type information for a specific line position in a file.
     *
     * @param request {@link GetTypeRequest}
     * @return {@link TypeResponse} the type information for the given line position
     */
    @JsonRequest
    public CompletableFuture<TypeResponse> getType(GetTypeRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            TypeResponse response = new TypeResponse();
            try {
                Path filePath = PathUtil.convertUriStringToPath(request.filePath());
                WorkspaceManager workspaceManager = this.workspaceManagerProxy.get(request.filePath());
                workspaceManager.loadProject(filePath);
                Optional<Document> document = workspaceManager.document(filePath);
                Optional<SemanticModel> semanticModel = workspaceManager.semanticModel(filePath);
                if (document.isEmpty() || semanticModel.isEmpty()) {
                    return response;
                }
                TypesManager typesManager = new TypesManager(document.get());
                JsonElement result = typesManager.getType(semanticModel.get(), document.get(), request.linePosition());
                if (result == null) {
                    return response;
                }
                response.setType(result.getAsJsonObject().get("type").getAsJsonObject());
                response.setRefs(result.getAsJsonObject().get("refs").getAsJsonArray());
            } catch (Throwable e) {
                throw new RuntimeException(e);
            }
            return response;
        });
    }

    @JsonRequest
    public CompletableFuture<TypeOfExpressionResponse> getTypeOfExpression(TypeOfExpressionRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            TypeOfExpressionResponse response = new TypeOfExpressionResponse();
            try {
                Path filePath = PathUtil.convertUriStringToPath(request.filePath());
                WorkspaceManager workspaceManager = this.workspaceManagerProxy.get(request.filePath());
                Project project = workspaceManager.loadProject(filePath);
                Optional<Document> document = workspaceManager.document(filePath);
                Optional<SemanticModel> semanticModel = workspaceManager.semanticModel(filePath);
                if (document.isEmpty() || semanticModel.isEmpty()) {
                    return response;
                }
                Path fileName = filePath.getFileName();
                TypesManager typesManager = new TypesManager(document.get());
                JsonElement result = typesManager.getTypeOfExpression(project,
                        fileName == null ? filePath.toString() : fileName.toString(), document.get(),
                        request.position(), request.expression());
                if (result == null) {
                    return response;
                }
                response.setType(result);
            } catch (Throwable e) {
                throw new RuntimeException(e);
            }
            return response;
        });
    }

    /**
     * Get the GraphQL type information for a specific line position in a file.
     *
     * @param request {@link GetTypeRequest}
     * @return {@link TypeResponse} the GraphQL type information for the given line position
     */
    @JsonRequest
    public CompletableFuture<TypeResponse> getGraphqlType(GetTypeRequest request) {
        // TODO: Different implementation may be needed with future requirements
        return CompletableFuture.supplyAsync(() -> {
            TypeResponse response = new TypeResponse();
            try {
                Path filePath = PathUtil.convertUriStringToPath(request.filePath());
                WorkspaceManager workspaceManager = this.workspaceManagerProxy.get(request.filePath());
                workspaceManager.loadProject(filePath);
                Optional<Document> document = workspaceManager.document(filePath);
                Optional<SemanticModel> semanticModel = workspaceManager.semanticModel(filePath);
                if (document.isEmpty() || semanticModel.isEmpty()) {
                    return response;
                }
                TypesManager typesManager = new TypesManager(document.get());
                JsonElement result =
                        typesManager.getGraphqlType(semanticModel.get(), document.get(), request.linePosition());
                if (result == null) {
                    return response;
                }
                response.setType(result.getAsJsonObject().get("type").getAsJsonObject());
                response.setRefs(result.getAsJsonObject().get("refs").getAsJsonArray());
            } catch (Throwable e) {
                throw new RuntimeException(e);
            }
            return response;
        });
    }

    /**
     * Create a GraphQL class type in the specified file.
     *
     * @param request {@link TypeUpdateRequest}
     * @return {@link TypeUpdateResponse} the response containing the text edits for creating the type
     */
    @JsonRequest
    public CompletableFuture<TypeUpdateResponse> createGraphqlClassType(TypeUpdateRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            TypeUpdateResponse response = new TypeUpdateResponse();
            try {
                Path filePath = Path.of(request.filePath());
                WorkspaceManager workspaceManager = this.workspaceManagerProxy.get();
                workspaceManager.loadProject(filePath);
                TypeData typeData = (new Gson()).fromJson(request.type(), TypeData.class);
                Optional<Document> document = workspaceManager.document(filePath);
                if (document.isEmpty()) {
                    return response;
                }
                TypesManager typesManager = new TypesManager(document.get());
                response.setName(typeData.name());
                response.setTextEdits(typesManager.createGraphqlClassType(filePath, typeData));
            } catch (Throwable e) {
                throw new RuntimeException(e);
            }
            return response;
        });
    }

    /**
     * Delete a type from the specified file.
     *
     * @param request {@link DeleteTypeRequest}
     * @return {@link DeleteTypeResponse} the response containing the text edits for deleting the type
     */
    @JsonRequest
    public CompletableFuture<DeleteTypeResponse> deleteType(DeleteTypeRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            DeleteTypeResponse response = new DeleteTypeResponse();

            try {
                Path filePath = Path.of(request.filePath());

                // Load project and document
                WorkspaceManager workspaceManager = this.workspaceManagerProxy.get();
                Project project = workspaceManager.loadProject(filePath);
                Optional<SemanticModel> semanticModelOpt = workspaceManager.semanticModel(filePath);
                Optional<Document> documentOpt = workspaceManager.document(filePath);

                if (semanticModelOpt.isEmpty() || documentOpt.isEmpty()) {
                    return response;
                }

                Document document = documentOpt.get();
                TextDocument textDocument = document.textDocument();

                // Compute positions
                int startPos = textDocument.textPositionFrom(request.lineRange().startLine());
                int endPos = textDocument.textPositionFrom(request.lineRange().endLine());

                // Locate node
                NonTerminalNode targetNode = ((ModulePartNode) document.syntaxTree().rootNode())
                        .findNode(TextRange.from(startPos, endPos - startPos));

                // Build JSON in one step by combining maps
                Map<String, Object> component = Map.of(
                        "filePath", filePath.toString(),
                        "startLine", targetNode.lineRange().startLine().line(),
                        "startColumn", targetNode.lineRange().startLine().offset(),
                        "endLine", targetNode.lineRange().endLine().line(),
                        "endColumn", targetNode.lineRange().endLine().offset()
                );

                JsonObject componentJson = new Gson()
                        .toJsonTree(component)
                        .getAsJsonObject();

                response.setTextEdits(DeleteNodeHandler.getTextEditsToDeletedNode(
                        componentJson, filePath, document, project
                ));

            } catch (Throwable e) {
                response.setError(e);
            }
            return response;
        });
    }

    /**
     * Verify if a type can be safely deleted by checking for any references.
     *
     * @param request {@link VerifyTypeDeleteRequest}
     * @return {@link VerifyTypeDeleteResponse} the response indicating whether the type can be deleted
     */
    @JsonRequest
    public CompletableFuture<VerifyTypeDeleteResponse> verifyTypeDelete(VerifyTypeDeleteRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            VerifyTypeDeleteResponse response = new VerifyTypeDeleteResponse();
            try {
                Path filePath = Path.of(request.filePath());

                WorkspaceManager workspaceManager = this.workspaceManagerProxy.get();
                Optional<SemanticModel> semanticModel = workspaceManager.semanticModel(filePath);
                Optional<Document> document = workspaceManager.document(filePath);

                if (semanticModel.isEmpty() || document.isEmpty()) {
                    response.setCanDelete(false);
                    response.setError(new IllegalArgumentException("Semantic model or document not found"));
                    return response;
                }

                List<Location> locations = semanticModel.get()
                        .references(document.get(), request.startPosition());

                boolean canDelete = locations.size() <= MAX_REFERENCE_FOR_DELETE;
                response.setCanDelete(canDelete);
            } catch (Throwable e) {
                response.setError(e);
            }
            return response;
        });
    }

    /**
     * Update an existing type in the specified file.
     *
     * @param request {@link TypeUpdateRequest}
     * @return {@link TypeUpdateResponse} the response containing the text edits for updating the type
     */
    @JsonRequest
    public CompletableFuture<TypeUpdateResponse> updateType(TypeUpdateRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            TypeUpdateResponse response = new TypeUpdateResponse();
            try {
                Path filePath = Path.of(request.filePath());

                WorkspaceManager workspaceManager = this.workspaceManagerProxy.get();
                FileSystemUtils.createFileIfNotExists(workspaceManager, filePath);
                TypeData typeData = (new Gson()).fromJson(request.type(), TypeData.class);
                Document document = FileSystemUtils.getDocument(workspaceManager, filePath);
                TypesManager typesManager = new TypesManager(document);
                response.setName(typeData.name());
                response.setTextEdits(typesManager.updateType(filePath, typeData));
            } catch (Throwable e) {
                throw new RuntimeException(e);
            }
            return response;
        });
    }

    /**
     * Create multiple types in the specified file.
     *
     * @param request {@link MultipleTypeUpdateRequest}
     * @return {@link MultipleTypeUpdateResponse} the response containing the text edits for creating multiple types
     */
    @JsonRequest
    public CompletableFuture<MultipleTypeUpdateResponse> updateTypes(MultipleTypeUpdateRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            MultipleTypeUpdateResponse response = new MultipleTypeUpdateResponse();
            try {
                Path filePath = Path.of(request.filePath());

                WorkspaceManager workspaceManager = this.workspaceManagerProxy.get();
                FileSystemUtils.createFileIfNotExists(workspaceManager, filePath);
                Document document = FileSystemUtils.getDocument(workspaceManager, filePath);
                List<TypeData> typeDataList = new ArrayList<>();
                for (JsonElement element : request.types()) {
                    typeDataList.add((new Gson()).fromJson(element, TypeData.class));
                }
                TypesManager typesManager = new TypesManager(document);
                response.setTextEdits(typesManager.createMultipleTypes(filePath, typeDataList));
            } catch (Throwable e) {
                throw new RuntimeException(e);
            }
            return response;
        });
    }

    /**
     * Get the record configuration for a specific type.
     *
     * @param request {@link RecordConfigRequest}
     * @return {@link RecordConfigResponse} the record configuration for the specified type
     */
    @JsonRequest
    public CompletableFuture<RecordConfigResponse> recordConfig(RecordConfigRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            RecordConfigResponse response = new RecordConfigResponse();
            try {
                Codedata codedata = request.codedata();
                String orgName = codedata.org();
                String packageName = Objects.isNull(codedata.packageName()) ?
                        codedata.module() : codedata.packageName();
                String moduleName = codedata.module();
                String versionName = codedata.version();
                Path filePath = Path.of(request.filePath());

                Optional<SemanticModel> semanticModel = getCachedSemanticModel(orgName, packageName, moduleName,
                        versionName, filePath);

                if (semanticModel.isEmpty()) {
                    throw new IllegalArgumentException(
                            String.format("Package '%s/%s:%s' not found", orgName, packageName, versionName));
                }
                String[] parts = request.typeConstraint().split(":");
                String typeStr = parts.length > 1 ? parts[1] : parts[0];

                // Get the type symbol
                Optional<Symbol> typeSymbol = semanticModel.get().moduleSymbols().parallelStream()
                        .filter(symbol -> symbol.kind() == SymbolKind.TYPE_DEFINITION &&
                                symbol.nameEquals(typeStr))
                        .findFirst();
                if (typeSymbol.isEmpty()) {
                    throw new IllegalArgumentException(String.format("Type '%s' not found in package '%s/%s:%s'",
                            request.typeConstraint(),
                            orgName,
                            packageName,
                            versionName));
                }
                if (typeSymbol.get() instanceof TypeSymbol tSymbol && tSymbol.typeKind() != TypeDescKind.RECORD) {
                    throw new IllegalArgumentException(
                            String.format("Type '%s' is not a record", request.typeConstraint()));
                }
                Type type = Type.fromSemanticSymbol(typeSymbol.get(), semanticModel.get(), packageName);
                serializeRecordConfig(type, response);
            } catch (OutOfMemoryError oom) {
                response.setError(new RuntimeException(RECORD_CONFIG_ERROR_MESSAGE, oom));
            } catch (Throwable e) {
                response.setError(e);
            }
            return response;
        });
    }

    @JsonRequest
    public CompletableFuture<RecordValueGenerateResponse> generateValue(RecordValueGenerateRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            RecordValueGenerateResponse response = new RecordValueGenerateResponse();
            try {
                JsonObject typeJson = request.type().getAsJsonObject();

                // A type constraint surfaces a top-level union ambiguity; codedata alone is enough to probe the
                // concrete type for a nested ambiguity. Either is sufficient to attempt cast resolution.
                String typeConstraint = request.typeConstraint();
                if ((typeConstraint != null && !typeConstraint.isBlank()) || request.codedata() != null) {
                    // Probing is best-effort: an invalid typeConstraint/codedata/filePath must never fail the
                    // request — fall back to the bare value the endpoint would have produced before.
                    try {
                        Path filePath = PathUtil.convertUriStringToPath(request.filePath());
                        WorkspaceManager workspaceManager = this.workspaceManagerProxy.get(request.filePath());
                        Project project = workspaceManager.loadProject(filePath);
                        Optional<Document> document = workspaceManager.document(filePath);
                        Optional<SemanticModel> semanticModel = workspaceManager.semanticModel(filePath);
                        if (document.isPresent() && semanticModel.isPresent()) {
                            AmbiguousTypeCastResolver.applyAmbiguityCasts(project, document.get(),
                                    semanticModel.get(), typeConstraint, request.codedata(), typeJson);
                        }
                    } catch (Throwable ignored) {
                        // Best-effort cast probing failed; return the bare value below.
                    }
                }

                response.setRecordValue(RecordValueGenerator.generate(typeJson));
            } catch (Throwable e) {
                response.setError(e);
            }
            return response;
        });
    }

    @JsonRequest
    public CompletableFuture<RecordConfigResponse> updateRecordConfig(UpdatedRecordConfigRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            RecordConfigResponse response = new RecordConfigResponse();
            try {
                FindTypeRequest.TypePackageInfo info = FindTypeRequest.TypePackageInfo.from(request.codedata());
                SemanticModel semanticModel = findSemanticModel(info, request.filePath());
                Optional<Symbol> typeSymbol = findTypeSymbolFromSemanticModel(semanticModel, request.typeConstraint());
                if (typeSymbol.isEmpty()) {
                    throw new IllegalArgumentException(String.format("Type '%s' not found in package '%s/%s:%s'",
                            request.typeConstraint(), info.org(), info.moduleName(), info.version()));
                }
                Type type = TypeSymbolAnalyzerFromTypeModel.analyze(typeSymbol.get(), request.expr(), semanticModel);
                serializeRecordConfig(type, response);
            } catch (Throwable e) {
                response.setError(e);
            }
            semanticModelCache.clear();
            return response;
        });
    }

    /**
     * Find the matching type for the given expression from a list of {@link PropertyTypeMemberInfo}.
     * If found a matching type for the expression, update the matching types value information.
     *
     * @param request {@link FindTypeRequest}
     * @return {@link RecordConfigResponse}
     */
    @JsonRequest
    public CompletableFuture<RecordConfigResponse> findMatchingType(FindTypeRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            RecordConfigResponse response = new RecordConfigResponse();
            try {
                String expression = request.expr();
                for (PropertyTypeMemberInfo memberInfo : request.typeMembers()) {
                    try {
                        FindTypeRequest.TypePackageInfo info = FindTypeRequest.TypePackageInfo
                                .from(memberInfo.packageInfo(), memberInfo.packageName());
                        SemanticModel semanticModel = findSemanticModel(info, request.filePath());
                        Optional<Symbol> typeSymbol = findTypeSymbolFromSemanticModel(semanticModel,
                                memberInfo.type());
                        if (typeSymbol.isEmpty()) {
                            continue;
                        }
                        Type type = TypeSymbolAnalyzerFromTypeModel.analyze(typeSymbol.get(), expression,
                                semanticModel);
                        if (type != null && type.selected) {
                            type.name = memberInfo.type();
                            serializeRecordConfig(type, response);
                            response.setTypeName(memberInfo.type());
                            break;
                        }
                    } catch (OutOfMemoryError oom) {
                        response.setError(new RuntimeException(RECORD_CONFIG_ERROR_MESSAGE, oom));
                        return response;
                    } catch (Throwable ignored) {
                    }
                }
            } catch (Throwable e) {
                response.setError(e);
            }
            semanticModelCache.clear();
            return response;
        });
    }

    /**
     * Convert a JSON string to a Ballerina type.
     *
     * @param request {@link JsonToTypeRequest}
     * @return {@link TypeListResponse} the response containing the converted types
     */
    @JsonRequest
    public CompletableFuture<TypeListResponse> jsonToType(JsonToTypeRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            TypeListResponse response = new TypeListResponse();

            String jsonString = request.jsonString();
            String typeName = request.typeName();
            String prefix = request.prefix();
            boolean asInline = request.asInline();
            boolean allowAdditionalFields = request.allowAdditionalFields();
            boolean isNullAsOptional = request.nullAsOptional();

            try {
                Path filePath = Path.of(request.filePath());

                WorkspaceManager workspaceManager = this.workspaceManagerProxy.get();
                FileSystemUtils.createFileIfNotExists(workspaceManager, filePath);

                JsonToTypeMapper jsonToTypeMapper = new JsonToTypeMapper(
                        allowAdditionalFields,
                        asInline,
                        isNullAsOptional,
                        prefix,
                        workspaceManager,
                        filePath
                );
                JsonElement converted = jsonToTypeMapper.convert(jsonString, typeName);
                response.setTypes(converted);
            } catch (Throwable e) {
                throw new RuntimeException(e);
            }
            return response;
        });
    }

    // Utility methods

    private Optional<SemanticModel> getCachedSemanticModel(String org, String packageName, String moduleName,
                                                           String version, Path filePath) {
        String normalizedModuleName = moduleName == null || moduleName.isBlank() ? packageName : moduleName;
        // Check cache with filePath
        CacheKey keyWithPath = new CacheKey(org, packageName, normalizedModuleName, version);
        // Try to load via filePath-specific method

        WorkspaceManager workspaceManager = this.workspaceManagerProxy.get();
        Optional<SemanticModel> model = PackageUtil.getSemanticModelIfMatched(workspaceManager, filePath, org,
                packageName, normalizedModuleName, version);
        if (model.isPresent()) {
            semanticModelCache.put(keyWithPath, model.get());
            return model;
        }

        SemanticModel cachedModel = semanticModelCache.get(keyWithPath);
        if (cachedModel != null) {
            return Optional.of(cachedModel);
        }

        // Fallback to general package lookup
        CacheKey keyWithoutPath = new CacheKey(org, packageName, normalizedModuleName, version);
        cachedModel = semanticModelCache.get(keyWithoutPath);
        if (cachedModel != null) {
            return Optional.of(cachedModel);
        }

        // Check workspace sibling projects (same workspace, different integration)
        try {
            Project project = workspaceManager.loadProject(filePath);
            Optional<SemanticModel> workspaceModel = PackageUtil.getSemanticModelFromWorkspace(
                            project, org, packageName, normalizedModuleName, version)
                    .map(PackageUtil.WorkspacePackageResolution::semanticModel);
            if (workspaceModel.isPresent()) {
                semanticModelCache.put(keyWithoutPath, workspaceModel.get());
                return workspaceModel;
            }
        } catch (WorkspaceDocumentException | EventSyncException e) {
            // Fall through to general package lookup
        }

        ModuleInfo moduleInfo = new ModuleInfo(org, packageName, normalizedModuleName, version);
        model = PackageUtil.getSemanticModel(moduleInfo);
        model.ifPresent(m -> semanticModelCache.put(keyWithoutPath, m));
        return model;
    }

    private SemanticModel findSemanticModel(FindTypeRequest.TypePackageInfo packageInfo, String path) {
        String orgName = packageInfo.org();
        String packageName = packageInfo.packageName();
        String moduleName = packageInfo.moduleName();
        String versionName = packageInfo.version();
        Path filePath = Path.of(path);

        // Retrieve cached or load new semantic model
        Optional<SemanticModel> semanticModel = getCachedSemanticModel(orgName, packageName, moduleName, versionName,
                filePath);
        if (semanticModel.isEmpty()) {
            throw new IllegalArgumentException(
                    String.format("Package '%s/%s:%s' not found", orgName, packageName, versionName)
            );
        }

        return semanticModel.get();
    }

    private Optional<Symbol> findTypeSymbolFromSemanticModel(SemanticModel semanticModel, String typeConstraint) {
        String[] parts = typeConstraint.split(":");
        String type = parts.length > 1 ? parts[1] : parts[0];

        return semanticModel.moduleSymbols().parallelStream()
                .filter(symbol -> symbol.kind() == SymbolKind.TYPE_DEFINITION && symbol.nameEquals(type))
                .findFirst();
    }

    private record PackageNameModulePartName(String packageName, String modulePartName) {

        public static PackageNameModulePartName from(String packageNameStr) {
            String[] parts = packageNameStr.split("\\.");
            if (parts.length > 1) {
                return new PackageNameModulePartName(parts[0], parts[1]);
            } else if (parts.length == 1) {
                return new PackageNameModulePartName(parts[0], null);
            }
            return new PackageNameModulePartName(null, null);
        }
    }

    private void serializeRecordConfig(Type type, RecordConfigResponse response) {
        SizeLimitedWriter writer = new SizeLimitedWriter(MAX_RECORD_CONFIG_JSON_CHARS);
        try {
            new Gson().toJson(type, writer);
            response.setRecordConfig(JsonParser.parseString(writer.getContent()));
        } catch (JsonIOException e) {
            response.setError(new RuntimeException(RECORD_CONFIG_ERROR_MESSAGE));
        }
    }

    /**
     * A Writer that stops Gson serialization as soon as the output would exceed a character limit.
     * Overriding both write methods prevents the default Writer from allocating an intermediate
     * char[] when Gson passes a String segment, so the limit is enforced before any extra allocation.
     * Gson wraps the resulting IOException in JsonIOException, which callers catch to detect the limit.
     */
    private static final class SizeLimitedWriter extends Writer {

        private final StringBuilder sb;
        private final long limit;

        SizeLimitedWriter(long limit) {
            this.sb = new StringBuilder();
            this.limit = limit;
        }

        @Override
        public void write(char[] cbuf, int off, int len) throws IOException {
            if (sb.length() + len > limit) {
                throw new IOException("Record config payload exceeds the size limit");
            }
            sb.append(cbuf, off, len);
        }

        @Override
        public void write(String str, int off, int len) throws IOException {
            if (sb.length() + len > limit) {
                throw new IOException("Record config payload exceeds the size limit");
            }
            sb.append(str, off, off + len);
        }

        @Override
        public void flush() {
        }

        @Override
        public void close() {
        }

        String getContent() {
            return sb.toString();
        }
    }
}
