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

import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.flowmodelgenerator.core.DataMapManager;
import io.ballerina.flowmodelgenerator.core.expressioneditor.KeptImports;
import io.ballerina.flowmodelgenerator.extension.request.DataMapperAddClausesRequest;
import io.ballerina.flowmodelgenerator.extension.request.DataMapperAddElementRequest;
import io.ballerina.flowmodelgenerator.extension.request.DataMapperClauseDiagnosticsRequest;
import io.ballerina.flowmodelgenerator.extension.request.DataMapperClausePositionRequest;
import io.ballerina.flowmodelgenerator.extension.request.DataMapperConvertRequest;
import io.ballerina.flowmodelgenerator.extension.request.DataMapperConvertTypeRequest;
import io.ballerina.flowmodelgenerator.extension.request.DataMapperCustomFunctionRequest;
import io.ballerina.flowmodelgenerator.extension.request.DataMapperDeleteClauseRequest;
import io.ballerina.flowmodelgenerator.extension.request.DataMapperDeleteSubMappingRequest;
import io.ballerina.flowmodelgenerator.extension.request.DataMapperFieldPositionRequest;
import io.ballerina.flowmodelgenerator.extension.request.DataMapperModelRequest;
import io.ballerina.flowmodelgenerator.extension.request.DataMapperNodePositionRequest;
import io.ballerina.flowmodelgenerator.extension.request.DataMapperQueryConvertRequest;
import io.ballerina.flowmodelgenerator.extension.request.DataMapperResolveRequest;
import io.ballerina.flowmodelgenerator.extension.request.DataMapperSourceRequest;
import io.ballerina.flowmodelgenerator.extension.request.DataMapperSubMappingRequest;
import io.ballerina.flowmodelgenerator.extension.request.DataMapperSubMappingSourceRequest;
import io.ballerina.flowmodelgenerator.extension.request.DataMapperTargetFieldPositionRequest;
import io.ballerina.flowmodelgenerator.extension.request.DataMapperTransformFunctionRequest;
import io.ballerina.flowmodelgenerator.extension.request.DataMapperTypesRequest;
import io.ballerina.flowmodelgenerator.extension.request.DataMapperVisualizeRequest;
import io.ballerina.flowmodelgenerator.extension.request.DataMappingDeleteRequest;
import io.ballerina.flowmodelgenerator.extension.response.DataMapperClauseDiagnosticsResponse;
import io.ballerina.flowmodelgenerator.extension.response.DataMapperClausePositionResponse;
import io.ballerina.flowmodelgenerator.extension.response.DataMapperClearCacheResponse;
import io.ballerina.flowmodelgenerator.extension.response.DataMapperConvertResponse;
import io.ballerina.flowmodelgenerator.extension.response.DataMapperModelResponse;
import io.ballerina.flowmodelgenerator.extension.response.DataMapperNodePositionResponse;
import io.ballerina.flowmodelgenerator.extension.response.DataMapperPositionResponse;
import io.ballerina.flowmodelgenerator.extension.response.DataMapperSourceResponse;
import io.ballerina.flowmodelgenerator.extension.response.DataMapperSubMappingResponse;
import io.ballerina.flowmodelgenerator.extension.response.DataMapperTypesResponse;
import io.ballerina.flowmodelgenerator.extension.response.DataMapperVisualizeResponse;
import io.ballerina.flowmodelgenerator.extension.response.DataMappingDeleteResponse;
import io.ballerina.modelgenerator.commons.CommonUtils;
import io.ballerina.projects.Document;
import io.ballerina.projects.Project;
import org.ballerinalang.annotation.JavaSPIService;
import org.ballerinalang.diagramutil.connector.models.connector.ReferenceType;
import org.ballerinalang.langserver.commons.LanguageServerContext;
import org.ballerinalang.langserver.commons.service.spi.ExtendedLanguageServerService;
import org.ballerinalang.langserver.commons.workspace.WorkspaceManager;
import org.ballerinalang.langserver.commons.workspace.WorkspaceManagerProxy;
import org.eclipse.lsp4j.jsonrpc.services.JsonRequest;
import org.eclipse.lsp4j.jsonrpc.services.JsonSegment;
import org.eclipse.lsp4j.services.LanguageServer;

import java.nio.file.Path;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.locks.Lock;

@JavaSPIService("org.ballerinalang.langserver.commons.service.spi.ExtendedLanguageServerService")
@JsonSegment("dataMapper")
public class DataMapperService implements ExtendedLanguageServerService {

    private WorkspaceManager workspaceManager;
    private WorkspaceManagerProxy workspaceManagerProxy;

    @Override
    public void init(LanguageServer langServer, WorkspaceManagerProxy workspaceManagerProxy,
                     LanguageServerContext serverContext) {
        this.workspaceManagerProxy = workspaceManagerProxy;
        this.workspaceManager = workspaceManagerProxy.get();
    }

    @Override
    public Class<?> getRemoteInterface() {
        return null;
    }

    @JsonRequest
    public CompletableFuture<DataMapperTypesResponse> types(DataMapperTypesRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            DataMapperTypesResponse response = new DataMapperTypesResponse();
            try {
                Path filePath = Path.of(request.filePath());
                this.workspaceManager.loadProject(filePath);
                Optional<SemanticModel> semanticModel = this.workspaceManager.semanticModel(filePath);
                Optional<Document> document = this.workspaceManager.document(filePath);
                if (semanticModel.isEmpty() || document.isEmpty()) {
                    return response;
                }

                DataMapManager dataMapManager = new DataMapManager(document.get());
                response.setType(dataMapManager.getTypes(request.flowNode(), request.propertyKey(),
                        semanticModel.get()));
            } catch (Throwable e) {
                response.setError(e);
            }
            return response;
        });
    }

    @JsonRequest
    public CompletableFuture<DataMapperModelResponse> mappings(DataMapperModelRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            DataMapperModelResponse response = new DataMapperModelResponse();
            try {
                Path filePath = Path.of(request.filePath());
                this.workspaceManager.loadProject(filePath);
                Optional<SemanticModel> semanticModel = this.workspaceManager.semanticModel(filePath);
                Optional<Document> document = this.workspaceManager.document(filePath);
                if (semanticModel.isEmpty() || document.isEmpty()) {
                    return response;
                }
                Path projectPath = workspaceManager.projectRoot(filePath);
                Optional<Document> functionsDoc = getDocumentFromFile(projectPath, "functions.bal");
                Optional<Document> dataMappingDoc = getDocumentFromFile(projectPath, "data_mappings.bal");

                DataMapManager dataMapManager = new DataMapManager(document.get());
                response.setMappingsModel(dataMapManager.getMappings(semanticModel.get(), request.codedata(),
                        request.position(), request.targetField(), functionsDoc.orElse(null),
                        dataMappingDoc.orElse(null)));
            } catch (Throwable e) {
                response.setError(e);
            }
            return response;
        });
    }

    @JsonRequest
    public CompletableFuture<DataMapperSourceResponse> getSource(DataMapperSourceRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            DataMapperSourceResponse response = new DataMapperSourceResponse();
            try {
                Path filePath = Path.of(request.filePath());
                this.workspaceManager.loadProject(filePath);
                Optional<Document> document = this.workspaceManager.document(filePath);
                if (document.isEmpty()) {
                    return response;
                }

                DataMapManager dataMapManager = new DataMapManager(document.get());
                response.setTextEdits(dataMapManager.getSource(filePath, request.codedata(), request.mapping(),
                        request.targetField()));
            } catch (Throwable e) {
                response.setError(e);
            }
            return response;
        });
    }

    @JsonRequest
    public CompletableFuture<DataMappingDeleteResponse> deleteMapping(DataMappingDeleteRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            DataMappingDeleteResponse response = new DataMappingDeleteResponse();
            try {
                Path filePath = Path.of(request.filePath());
                this.workspaceManager.loadProject(filePath);
                Optional<SemanticModel> semanticModel = this.workspaceManager.semanticModel(filePath);
                Optional<Document> document = this.workspaceManager.document(filePath);
                if (document.isEmpty() || semanticModel.isEmpty()) {
                    return response;
                }

                DataMapManager dataMapManager = new DataMapManager(document.get());
                response.setTextEdits(dataMapManager.deleteMapping(semanticModel.get(), filePath, request.codedata(),
                        request.mapping(), request.targetField()));
            } catch (Throwable e) {
                response.setError(e);
            }
            return response;
        });
    }

    @JsonRequest
    public CompletableFuture<DataMappingDeleteResponse> resolveOutput(DataMapperResolveRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            DataMappingDeleteResponse response = new DataMappingDeleteResponse();
            try {
                Path filePath = Path.of(request.filePath());
                this.workspaceManager.loadProject(filePath);
                Optional<SemanticModel> semanticModel = this.workspaceManager.semanticModel(filePath);
                Optional<Document> document = this.workspaceManager.document(filePath);
                if (document.isEmpty() || semanticModel.isEmpty()) {
                    return response;
                }

                DataMapManager dataMapManager = new DataMapManager(document.get());
                response.setTextEdits(dataMapManager.resolve(semanticModel.get(), filePath, request.codedata(),
                        request.targetField()));
            } catch (Throwable e) {
                response.setError(e);
            }
            return response;
        });
    }

    @JsonRequest
    public CompletableFuture<DataMapperSourceResponse> addClauses(DataMapperAddClausesRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            DataMapperSourceResponse response = new DataMapperSourceResponse();
            try {
                Path filePath = Path.of(request.filePath());
                this.workspaceManager.loadProject(filePath);
                Optional<Document> document = this.workspaceManager.document(filePath);
                if (document.isEmpty()) {
                    return response;
                }

                DataMapManager dataMapManager = new DataMapManager(document.get());
                response.setTextEdits(dataMapManager.addClause(filePath, request.codedata(), request.clause(),
                        request.index(), request.targetField()));
            } catch (Throwable e) {
                response.setError(e);
            }
            return response;
        });
    }

    @JsonRequest
    public CompletableFuture<DataMapperClauseDiagnosticsResponse> clauseDiagnostics(
            DataMapperClauseDiagnosticsRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            DataMapperClauseDiagnosticsResponse response = new DataMapperClauseDiagnosticsResponse();
            // The check edits the shadow document, which the expression editor's requests also edit.
            Lock copyLock = workspaceManagerProxy.exprCopyLock();
            copyLock.lock();
            try {
                WorkspaceManager workspaceManager = this.workspaceManagerProxy.get(
                        CommonUtils.getExprUri(request.filePath()));
                Path filePath = Path.of(request.filePath());
                KeptImports.release(workspaceManager, filePath);
                Project project = workspaceManager.loadProject(filePath);
                Optional<Document> document = workspaceManager.document(filePath);
                if (document.isEmpty()) {
                    return response;
                }

                DataMapManager dataMapManager = new DataMapManager(document.get());
                response.setDiagnostics(dataMapManager.getClauseDiagnostics(project, request.codedata(),
                        request.clause(), request.index(), request.targetField()));
            } catch (Throwable e) {
                response.setError(e);
            } finally {
                copyLock.unlock();
            }
            return response;
        });
    }

    @JsonRequest
    public CompletableFuture<DataMapperSourceResponse> deleteClause(DataMapperDeleteClauseRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            DataMapperSourceResponse response = new DataMapperSourceResponse();
            try {
                Path filePath = Path.of(request.filePath());
                this.workspaceManager.loadProject(filePath);
                Optional<Document> document = this.workspaceManager.document(filePath);
                if (document.isEmpty()) {
                    return response;
                }

                DataMapManager dataMapManager = new DataMapManager(document.get());
                response.setTextEdits(dataMapManager.deleteClause(filePath, request.codedata(), request.index(),
                        request.targetField()));
            } catch (Throwable e) {
                response.setError(e);
            }
            return response;
        });
    }

    @JsonRequest
    public CompletableFuture<DataMapperSourceResponse> convertToQuery(DataMapperQueryConvertRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            DataMapperSourceResponse response = new DataMapperSourceResponse();
            try {
                Path filePath = Path.of(request.filePath());
                this.workspaceManager.loadProject(filePath);
                Optional<SemanticModel> semanticModel = this.workspaceManager.semanticModel(filePath);
                Optional<Document> document = this.workspaceManager.document(filePath);
                if (semanticModel.isEmpty() || document.isEmpty()) {
                    return response;
                }
                DataMapManager dataMapManager = new DataMapManager(document.get());
                response.setTextEdits(dataMapManager.getQuery(semanticModel.get(), request.codedata(),
                        request.mapping(), request.targetField(), request.clauseType(), filePath));
            } catch (Throwable e) {
                response.setError(e);
            }
            return response;
        });
    }

    @JsonRequest
    public CompletableFuture<DataMapperVisualizeResponse> visualizable(DataMapperVisualizeRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            DataMapperVisualizeResponse response = new DataMapperVisualizeResponse();
            try {
                Path filePath = Path.of(request.filePath());
                Project project = workspaceManager.loadProject(filePath);
                Optional<SemanticModel> semanticModel = workspaceManager.semanticModel(filePath);
                Optional<Document> document = workspaceManager.document(filePath);
                if (semanticModel.isEmpty() || document.isEmpty()) {
                    return response;
                }
                DataMapManager dataMapManager = new DataMapManager(document.get());
                response.setVisualizableProperties(
                        dataMapManager.getVisualizableProperties(semanticModel.get(), request.codedata(),
                                project));
            } catch (Throwable e) {
                response.setError(e);
            }
            return response;
        });
    }

    @JsonRequest
    public CompletableFuture<DataMapperSourceResponse> addElement(DataMapperAddElementRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            DataMapperSourceResponse response = new DataMapperSourceResponse();
            try {
                Path filePath = Path.of(request.filePath());
                this.workspaceManager.loadProject(filePath);
                Optional<SemanticModel> semanticModel = this.workspaceManager.semanticModel(filePath);
                Optional<Document> document = this.workspaceManager.document(filePath);
                if (semanticModel.isEmpty() || document.isEmpty()) {
                    return response;
                }
                DataMapManager dataMapManager = new DataMapManager(document.get());
                response.setTextEdits(dataMapManager.addElement(semanticModel.get(), request.codedata(),
                        filePath, request.targetField(), request.outputId()));
            } catch (Throwable e) {
                response.setError(e);
            }
            return response;
        });
    }

    @JsonRequest
    public CompletableFuture<DataMapperPositionResponse> targetFieldPosition(
            DataMapperTargetFieldPositionRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            DataMapperPositionResponse response = new DataMapperPositionResponse();
            try {
                Path filePath = Path.of(request.filePath());
                this.workspaceManager.loadProject(filePath);
                Optional<SemanticModel> semanticModel = this.workspaceManager.semanticModel(filePath);
                Optional<Document> document = this.workspaceManager.document(filePath);
                if (semanticModel.isEmpty() || document.isEmpty()) {
                    return response;
                }
                DataMapManager dataMapManager = new DataMapManager(document.get());
                response.setProperty(dataMapManager.getTargetFieldPosition(semanticModel.get(), request.codedata(),
                        request.targetField()));
            } catch (Throwable e) {
                response.setError(e);
            }
            return response;
        });
    }

    @JsonRequest
    public CompletableFuture<DataMapperPositionResponse> fieldPosition(DataMapperFieldPositionRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            DataMapperPositionResponse response = new DataMapperPositionResponse();
            try {
                Path filePath = Path.of(request.filePath());
                this.workspaceManager.loadProject(filePath);
                Optional<SemanticModel> semanticModel = this.workspaceManager.semanticModel(filePath);
                Optional<Document> document = this.workspaceManager.document(filePath);
                if (semanticModel.isEmpty() || document.isEmpty()) {
                    return response;
                }
                DataMapManager dataMapManager = new DataMapManager(document.get());
                response.setProperty(dataMapManager.getFieldPosition(semanticModel.get(), request.codedata(),
                        request.targetField(), request.fieldId()));
            } catch (Throwable e) {
                response.setError(e);
            }
            return response;
        });
    }

    @JsonRequest
    public CompletableFuture<DataMapperClausePositionResponse> clausePosition(DataMapperClausePositionRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            DataMapperClausePositionResponse response = new DataMapperClausePositionResponse();
            try {
                Path filePath = Path.of(request.filePath());
                this.workspaceManager.loadProject(filePath);
                Optional<SemanticModel> semanticModel = this.workspaceManager.semanticModel(filePath);
                Optional<Document> document = this.workspaceManager.document(filePath);
                if (semanticModel.isEmpty() || document.isEmpty()) {
                    return response;
                }
                DataMapManager dataMapManager = new DataMapManager(document.get());
                response.setPosition(dataMapManager.getClausePosition(semanticModel.get(), request.codedata(),
                        request.targetField(), request.index()));
            } catch (Throwable e) {
                response.setError(e);
            }
            return response;
        });
    }

    @JsonRequest
    public CompletableFuture<DataMapperSubMappingResponse> subMapping(DataMapperSubMappingRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            DataMapperSubMappingResponse response = new DataMapperSubMappingResponse();
            try {
                Path filePath = Path.of(request.filePath());
                this.workspaceManager.loadProject(filePath);
                Optional<Document> document = this.workspaceManager.document(filePath);
                if (document.isEmpty()) {
                    return response;
                }
                DataMapManager dataMapManager = new DataMapManager(document.get());
                response.setCodedata(dataMapManager.subMapping(request.codedata(), request.view()));
            } catch (Throwable e) {
                response.setError(e);
            }
            return response;
        });
    }

    @JsonRequest
    public CompletableFuture<DataMapperNodePositionResponse> nodePosition(DataMapperNodePositionRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            DataMapperNodePositionResponse response = new DataMapperNodePositionResponse();
            try {
                Path filePath = Path.of(request.filePath());
                this.workspaceManager.loadProject(filePath);
                Optional<Document> document = this.workspaceManager.document(filePath);
                if (document.isEmpty()) {
                    return response;
                }
                DataMapManager dataMapManager = new DataMapManager(document.get());
                response.setCodedata(dataMapManager.nodePosition(request.codedata(), request.name()));
            } catch (Throwable e) {
                response.setError(e);
            }
            return response;
        });
    }

    @JsonRequest
    public CompletableFuture<DataMapperSourceResponse> addSubMapping(DataMapperSubMappingSourceRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            DataMapperSourceResponse response = new DataMapperSourceResponse();
            try {
                Path filePath = Path.of(request.filePath());
                this.workspaceManager.loadProject(filePath);
                Optional<SemanticModel> semanticModel = this.workspaceManager.semanticModel(filePath);
                Optional<Document> document = this.workspaceManager.document(filePath);
                if (semanticModel.isEmpty() || document.isEmpty()) {
                    return response;
                }
                DataMapManager dataMapManager = new DataMapManager(document.get());
                response.setTextEdits(dataMapManager.getSubMapping(this.workspaceManager, filePath,
                        request.codedata(), request.flowNode(), request.index()));
            } catch (Throwable e) {
                response.setError(e);
            }
            return response;
        });
    }

    @JsonRequest
    public CompletableFuture<DataMapperSourceResponse> deleteSubMapping(DataMapperDeleteSubMappingRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            DataMapperSourceResponse response = new DataMapperSourceResponse();
            try {
                Path filePath = Path.of(request.filePath());
                this.workspaceManager.loadProject(filePath);
                Optional<Document> document = this.workspaceManager.document(filePath);
                if (document.isEmpty()) {
                    return response;
                }
                DataMapManager dataMapManager = new DataMapManager(document.get());
                response.setTextEdits(dataMapManager.deleteSubMapping(filePath, request.codedata(), request.index()));
            } catch (Throwable e) {
                response.setError(e);
            }
            return response;
        });
    }

    @JsonRequest
    public CompletableFuture<DataMapperSourceResponse> customFunction(DataMapperCustomFunctionRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            DataMapperSourceResponse response = new DataMapperSourceResponse();
            try {
                Path filePath = Path.of(request.filePath());
                this.workspaceManager.loadProject(filePath);
                Optional<SemanticModel> semanticModel = this.workspaceManager.semanticModel(filePath);
                Optional<Document> document = this.workspaceManager.document(filePath);
                if (semanticModel.isEmpty() || document.isEmpty()) {
                    return response;
                }
                DataMapManager dataMapManager = new DataMapManager(document.get());
                response.setTextEdits(dataMapManager.genMappingFunction(this.workspaceManager, semanticModel.get(),
                        filePath, request.codedata(), request.mapping(), request.functionMetadata(),
                        request.targetField(), true));
            } catch (Throwable e) {
                response.setError(e);
            }
            return response;
        });
    }

    /**
     * Generates text edits for transformation function and its function call.
     * @param request The request containing information needed to generate the transformation function,
     *                including file path, code data, mapping details, function metadata and target field
     * @return Two text edits to apply to the codebase - one for the function definition and one for the function call
     *
     * @since 1.2.0
     */
    @JsonRequest
    public CompletableFuture<DataMapperSourceResponse> transformationFunction(
            DataMapperTransformFunctionRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            DataMapperSourceResponse response = new DataMapperSourceResponse();
            try {
                Path filePath = Path.of(request.filePath());
                this.workspaceManager.loadProject(filePath);
                Optional<SemanticModel> semanticModel = this.workspaceManager.semanticModel(filePath);
                Optional<Document> document = this.workspaceManager.document(filePath);
                if (semanticModel.isEmpty() || document.isEmpty()) {
                    return response;
                }
                DataMapManager dataMapManager = new DataMapManager(document.get());
                response.setTextEdits(dataMapManager.genMappingFunction(this.workspaceManager, semanticModel.get(),
                        filePath, request.codedata(), request.mapping(), request.functionMetadata(),
                        request.targetField(), false));
            } catch (Throwable e) {
                response.setError(e);
            }
            return response;
        });
    }

    /**
     * Clears the visited type map cache in ReferenceType.
     * This API can be used to reset the type cache when needed.
     *
     * @return Response indicating whether the cache was successfully cleared
     * @since 1.2.0
     */
    @JsonRequest
    public CompletableFuture<DataMapperClearCacheResponse> clearTypeCache() {
        return CompletableFuture.supplyAsync(() -> {
            DataMapperClearCacheResponse response = new DataMapperClearCacheResponse();
            try {
                ReferenceType.clearVisitedTypeMap();
                response.setSuccess(true);
            } catch (Throwable e) {
                response.setError(e);
                response.setSuccess(false);
            }
            return response;
        });
    }

    /**
     * Converts an expression from one type to another for incompatible primitive types.
     * This API is only called when there are incompatible types that need conversion.
     *
     * @param request The request containing expression, expressionType, output, and outputType
     * @return Response containing the converted expression and any required imports
     * @since 1.6.0
     */
    @JsonRequest
    public CompletableFuture<DataMapperConvertResponse> convertExpression(DataMapperConvertRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            DataMapperConvertResponse response = new DataMapperConvertResponse();
            try {
                DataMapManager dataMapManager = new DataMapManager(null);
                Map<String, Object> result = dataMapManager.convertExpression(
                        request.expression(),
                        request.expressionType(),
                        request.outputType()
                );

                response.setConvertedExpression((String) result.get("convertedExpression"));
            } catch (Throwable e) {
                response.setError(e);
            }
            return response;
        });
    }

    @JsonRequest
    public CompletableFuture<DataMapperSourceResponse> convertType(DataMapperConvertTypeRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            DataMapperSourceResponse response = new DataMapperSourceResponse();
            try {
                Path filePath = Path.of(request.filePath());
                this.workspaceManager.loadProject(filePath);
                Optional<Document> document = this.workspaceManager.document(filePath);
                Optional<SemanticModel> semanticModel = this.workspaceManager.semanticModel(filePath);
                if (document.isEmpty() || semanticModel.isEmpty()) {
                    return response;
                }
                DataMapManager dataMapManager = new DataMapManager(document.get());
                response.setTextEdits(dataMapManager.convertType(filePath, semanticModel.get(), request.codedata(),
                        request.typeName(), request.variableName(), request.parentTypeName(), request.isInput(),
                        request.isArray(), request.imports()));
            } catch (Throwable e) {
                response.setError(e);
            }
            return response;
        });
    }

    private Optional<Document> getDocumentFromFile(Path projectPath, String fileName) {
        try {
            return this.workspaceManagerProxy.get().document(projectPath.resolve(fileName));
        } catch (Throwable e) {
            return Optional.empty();
        }
    }
}
