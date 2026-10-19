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

package io.ballerina.flowmodelgenerator.extension;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.api.symbols.ClassSymbol;
import io.ballerina.compiler.api.symbols.FunctionSymbol;
import io.ballerina.compiler.api.symbols.FutureTypeSymbol;
import io.ballerina.compiler.api.symbols.MethodSymbol;
import io.ballerina.compiler.api.symbols.ParameterSymbol;
import io.ballerina.compiler.api.symbols.RecordFieldSymbol;
import io.ballerina.compiler.api.symbols.RecordTypeSymbol;
import io.ballerina.compiler.api.symbols.ResourceMethodSymbol;
import io.ballerina.compiler.api.symbols.Symbol;
import io.ballerina.compiler.api.symbols.SymbolKind;
import io.ballerina.compiler.api.symbols.TypeDefinitionSymbol;
import io.ballerina.compiler.api.symbols.TypeDescKind;
import io.ballerina.compiler.api.symbols.TypeSymbol;
import io.ballerina.compiler.api.symbols.VariableSymbol;
import io.ballerina.flowmodelgenerator.core.ActionSignatureAnalyzer;
import io.ballerina.flowmodelgenerator.core.ActivityGenerator;
import io.ballerina.flowmodelgenerator.core.utils.TypeUtils;
import io.ballerina.flowmodelgenerator.core.utils.WorkflowUtil;
import io.ballerina.flowmodelgenerator.extension.request.AnalyzeActivityActionRequest;
import io.ballerina.flowmodelgenerator.extension.request.GenActivityRequest;
import io.ballerina.flowmodelgenerator.extension.request.GetAllDataRequest;
import io.ballerina.flowmodelgenerator.extension.response.AnalyzeActivityActionResponse;
import io.ballerina.flowmodelgenerator.extension.response.GenActivityResponse;
import io.ballerina.flowmodelgenerator.extension.response.GetAllDataResponse;
import io.ballerina.modelgenerator.commons.CommonUtils;
import io.ballerina.modelgenerator.commons.FileSystemUtils;
import io.ballerina.modelgenerator.commons.ModuleInfo;
import io.ballerina.projects.Module;
import org.ballerinalang.annotation.JavaSPIService;
import org.ballerinalang.langserver.commons.service.spi.ExtendedLanguageServerService;
import org.ballerinalang.langserver.commons.workspace.WorkspaceManager;
import org.eclipse.lsp4j.jsonrpc.services.JsonRequest;
import org.eclipse.lsp4j.jsonrpc.services.JsonSegment;
import org.eclipse.lsp4j.services.LanguageServer;

import java.nio.file.Path;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;

import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.ANYDATA;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.DATA_SUFFIX;

/**
 * Service for managing workflow-related operations.
 *
 * @since 1.8.0
 */
@JavaSPIService("org.ballerinalang.langserver.commons.service.spi.ExtendedLanguageServerService")
@JsonSegment("workflowManager")
public class WorkflowManagerService implements ExtendedLanguageServerService {

    private WorkspaceManager workspaceManager;

    @Override
    public void init(LanguageServer langServer, WorkspaceManager workspaceManager) {
        this.workspaceManager = workspaceManager;
    }

    @Override
    public Class<?> getRemoteInterface() {
        return null;
    }

    /**
     * Gets all data defined for a given workflow function.
     * Data are retrieved from the data type parameter (third parameter) of the workflow process function.
     *
     * @param request The request containing file path and workflow name
     * @return Response containing array of data information
     */
    @JsonRequest
    public CompletableFuture<GetAllDataResponse> getAllData(GetAllDataRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            GetAllDataResponse response = new GetAllDataResponse();
            try {
                Path filePath = Path.of(request.filePath());
                this.workspaceManager.loadProject(filePath);
                SemanticModel semanticModel = FileSystemUtils.getSemanticModel(workspaceManager, filePath);
                // Event types are rendered as the user's code would name them: unqualified in this module.
                ModuleInfo moduleInfo = this.workspaceManager.module(filePath)
                        .map(module -> ModuleInfo.from(module.descriptor())).orElse(null);

                JsonArray dataArray = new JsonArray();
                Optional<Symbol> functionSymbol = semanticModel.moduleSymbols().stream()
                        .filter(symbol -> symbol.kind() == SymbolKind.FUNCTION)
                        .filter(symbol -> symbol.getName().orElse("").equals(request.workflowName()))
                        .filter(WorkflowUtil::isWorkflowFunction)
                        .findFirst();

                if (functionSymbol.isPresent() && functionSymbol.get() instanceof FunctionSymbol funcSymbol) {
                    JsonArray data = getDataFromWorkflowFunction(funcSymbol, semanticModel, moduleInfo);
                    data.forEach(dataArray::add);
                }

                response.setData(dataArray);
            } catch (Exception e) {
                response.setError(e);
            }
            return response;
        });
    }

    /**
     * Generates a {@code @workflow:Activity} function that wraps a connection action call, following
     * the built-in activity pattern: the connection is the first parameter of the activity function.
     *
     * @param request The request containing the action call flow node, activity name/description,
     *                activity parameters and the source connection name
     * @return Response containing the text edits to apply
     */
    @JsonRequest
    public CompletableFuture<GenActivityResponse> genActivity(GenActivityRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            GenActivityResponse response = new GenActivityResponse();
            try {
                Path filePath = Path.of(request.filePath());
                this.workspaceManager.loadProject(filePath);
                Optional<SemanticModel> semanticModel = this.workspaceManager.semanticModel(filePath);
                Optional<Module> module = this.workspaceManager.module(filePath);
                if (semanticModel.isEmpty() || module.isEmpty()) {
                    throw new IllegalStateException(
                            "Failed to resolve the semantic model or module for the file: " + filePath);
                }
                ActivityGenerator activityGenerator = new ActivityGenerator(semanticModel.get());
                response.setTextEdits(activityGenerator.genActivity(request.flowNode(), request.activityName(),
                        request.activityParameters(), request.connection(), request.description(),
                        request.streamElementType(), request.connectionAsParam(),
                        filePath, this.workspaceManager));
            } catch (Exception e) {
                response.setError(e);
            }
            return response;
        });
    }

    /**
     * Analyzes a connector action's signature for the create-activity-from-action wizard: derives the
     * activity parameters (required/optional, data types only) and return type, or reports why the
     * action cannot be wrapped automatically.
     *
     * @param request The request identifying the connection, action name, and action node kind
     * @return Response carrying the analysis (supported, reasons, params, returnType, streamElementType)
     */
    @JsonRequest
    public CompletableFuture<AnalyzeActivityActionResponse> analyzeActivityAction(
            AnalyzeActivityActionRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            AnalyzeActivityActionResponse response = new AnalyzeActivityActionResponse();
            try {
                Path filePath = Path.of(request.filePath());
                this.workspaceManager.loadProject(filePath);
                SemanticModel semanticModel = FileSystemUtils.getSemanticModel(workspaceManager, filePath);

                ClassSymbol connectionClass = semanticModel.moduleSymbols().stream()
                        .filter(symbol -> symbol.kind() == SymbolKind.VARIABLE)
                        .filter(symbol -> symbol.getName().orElse("").equals(request.connection()))
                        .findFirst()
                        .flatMap(symbol -> WorkflowUtil.resolveConnectionClass(
                                ((VariableSymbol) symbol).typeDescriptor()))
                        .orElseThrow(() -> new IllegalStateException(
                                "Connection '" + request.connection() + "' is not found in the module"));

                // Connectors may define both a remote and a resource method with the same name
                // (e.g. http:Client's get); the node kind disambiguates.
                boolean wantResource = "RESOURCE_ACTION_CALL".equals(request.nodeKind());
                MethodSymbol actionMethod = connectionClass.methods().values().stream()
                        .filter(method -> method.getName().orElse("").equals(request.actionName()))
                        .filter(method -> (method instanceof ResourceMethodSymbol) == wantResource)
                        .findFirst()
                        .orElseThrow(() -> new IllegalStateException(
                                "Action '" + request.actionName() + "' is not found on the connection '"
                                        + request.connection() + "'"));

                ActionSignatureAnalyzer.Analysis analysis =
                        ActionSignatureAnalyzer.analyze(actionMethod, semanticModel);
                response.setAnalysis(new Gson().toJsonTree(analysis));
            } catch (Exception e) {
                response.setError(e);
            }
            return response;
        });
    }

    /**
     * Gets data from a workflow function by analyzing its data type parameter.
     *
     * @param funcSymbol    The workflow function symbol
     * @param semanticModel The semantic model
     * @param moduleInfo    The module the request's file belongs to, or {@code null}
     * @return JsonArray of data information
     */
    private JsonArray getDataFromWorkflowFunction(FunctionSymbol funcSymbol, SemanticModel semanticModel,
                                                  ModuleInfo moduleInfo) {
        // The data record is the last parameter, whatever precedes it: a workflow may omit the context or
        // the input, so its position is not fixed. It is recognised by its shape, as Await Data does.
        Optional<List<ParameterSymbol>> params = funcSymbol.typeDescriptor().params();
        if (params.isPresent() && !params.get().isEmpty()) {
            List<ParameterSymbol> paramList = params.get();
            TypeSymbol lastParamType = TypeUtils.resolveTypeReference(
                    paramList.get(paramList.size() - 1).typeDescriptor());
            if (WorkflowUtil.isValidDataType(lastParamType)) {
                return extractDataFromRecordType(lastParamType, semanticModel, moduleInfo);
            }
        }

        // Otherwise a record named by convention, <FunctionName>Data, may declare the events.
        String funcName = funcSymbol.getName().orElse("");
        if (funcName.isEmpty()) {
            return new JsonArray();
        }
        String dataTypeName = funcName.substring(0, 1).toUpperCase(Locale.ROOT) + funcName.substring(1)
                + DATA_SUFFIX;
        return semanticModel.moduleSymbols().stream()
                .filter(symbol -> symbol.nameEquals(dataTypeName))
                .filter(symbol -> symbol.kind() == SymbolKind.TYPE_DEFINITION)
                .findFirst()
                .map(symbol -> extractDataFromRecordType(((TypeDefinitionSymbol) symbol).typeDescriptor(),
                        semanticModel, moduleInfo))
                .orElseGet(JsonArray::new);
    }

    /**
     * Extracts workflow data information from a record type.
     * Each field in the record with type future<T> represents a data point that can be awaited.
     *
     * @param dataType      The data record type
     * @param semanticModel The semantic model
     * @param moduleInfo    The module the type names are rendered relative to, or {@code null}
     * @return JsonArray of event information
     */
    private JsonArray extractDataFromRecordType(TypeSymbol dataType, SemanticModel semanticModel,
                                                ModuleInfo moduleInfo) {
        JsonArray data = new JsonArray();

        if (dataType.typeKind() != TypeDescKind.RECORD) {
            return data;
        }

        RecordTypeSymbol recordType = (RecordTypeSymbol) dataType;
        Map<String, RecordFieldSymbol> fields = recordType.fieldDescriptors();

        for (Map.Entry<String, RecordFieldSymbol> entry : fields.entrySet()) {
            String fieldName = entry.getKey();
            RecordFieldSymbol fieldSymbol = entry.getValue();
            TypeSymbol fieldType = TypeUtils.resolveTypeReference(fieldSymbol.typeDescriptor());
            if (fieldType.typeKind() != TypeDescKind.FUTURE) {
                continue;
            }
            String eventDataType = extractTypeNameFromFuture((FutureTypeSymbol) fieldType, semanticModel, moduleInfo);

            JsonObject eventObj = new JsonObject();
            eventObj.addProperty("name", fieldName);
            eventObj.addProperty("type", eventDataType);
            data.add(eventObj);
        }

        return data;
    }

    private String extractTypeNameFromFuture(FutureTypeSymbol typeSymbol, SemanticModel semanticModel,
                                             ModuleInfo moduleInfo) {
        // The raw signature qualifies every type reference with its org, package and version
        // (`org/pkg:0.1.0:PaymentData?`), and a bare symbol name drops an imported type's prefix; the form types
        // the data field with this text, so it has to be a type the user's code can name.
        return typeSymbol.typeParameter()
                .map(type -> CommonUtils.getTypeSignature(semanticModel, type, false, moduleInfo))
                .orElse(ANYDATA);
    }
}
