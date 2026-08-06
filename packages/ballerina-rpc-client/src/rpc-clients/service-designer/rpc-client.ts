/**
 * Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 * 
 * THIS FILE INCLUDES AUTO GENERATED CODE
 */
import {
    ExportOASRequest,
    ExportOASResponse,
    FunctionFromSourceRequest,
    FunctionFromSourceResponse,
    FunctionModelRequest,
    FunctionModelResponse,
    FunctionSourceCodeRequest,
    HttpResourceModelRequest,
    HttpResourceModelResponse,
    ListenerModelFromCodeRequest,
    ListenerModelFromCodeResponse,
    ListenerModelRequest,
    ListenerModelResponse,
    ListenerSourceCodeRequest,
    ListenersRequest,
    ListenersResponse,
    PayloadContext,
    ResourceReturnTypesRequest,
    ServiceDesignerAPI,
    ServiceInitSourceRequest,
    ServiceModelFromCodeRequest,
    ServiceModelFromCodeResponse,
    ServiceModelInitResponse,
    ServiceModelRequest,
    ServiceModelResponse,
    ServiceSourceCodeRequest,
    TriggerModelsRequest,
    TriggerModelsResponse,
    UpdatedArtifactsResponse,
    VisibleTypesResponse,
    addFunctionSourceCode,
    addListenerSourceCode,
    addResourceSourceCode,
    addServiceSourceCode,
    createServiceAndListener,
    exportOASFile,
    generateExamplePayloadJson,
    getFunctionFromSource,
    getFunctionModel,
    getHttpResourceModel,
    getListenerModel,
    getListenerModelFromCode,
    getListeners,
    getResourceReturnTypes,
    getServiceInitModel,
    getServiceModel,
    getServiceModelFromCode,
    getTriggerModels,
    searchTriggers,
    updateListenerSourceCode,
    updateResourceSourceCode,
    updateServiceSourceCode,
    GetOASSpecRequest,
    ValidatePropertyRequest,
    ValidatePropertyResponse,
    GetOASSpecResponse,
    getOASSpec,
    validateProperty
} from "@wso2/ballerina-core";
import { HOST_EXTENSION } from "vscode-messenger-common";
import { Messenger } from "vscode-messenger-webview";

export class ServiceDesignerRpcClient implements ServiceDesignerAPI {
    private _messenger: Messenger;

    constructor(messenger: Messenger) {
        this._messenger = messenger;
    }

    exportOASFile(params: ExportOASRequest): Promise<ExportOASResponse> {
        return this._messenger.sendRequest(exportOASFile, HOST_EXTENSION, params);
    }

    getTriggerModels(params: TriggerModelsRequest): Promise<TriggerModelsResponse> {
        return this._messenger.sendRequest(getTriggerModels, HOST_EXTENSION, params);
    }

    searchTriggers(params: TriggerModelsRequest): Promise<TriggerModelsResponse> {
        return this._messenger.sendRequest(searchTriggers, HOST_EXTENSION, params);
    }

    getListeners(params: ListenersRequest): Promise<ListenersResponse> {
        return this._messenger.sendRequest(getListeners, HOST_EXTENSION, params);
    }

    getListenerModel(params: ListenerModelRequest): Promise<ListenerModelResponse> {
        return this._messenger.sendRequest(getListenerModel, HOST_EXTENSION, params);
    }

    addListenerSourceCode(params: ListenerSourceCodeRequest): Promise<UpdatedArtifactsResponse> {
        return this._messenger.sendRequest(addListenerSourceCode, HOST_EXTENSION, params);
    }

    updateListenerSourceCode(params: ListenerSourceCodeRequest): Promise<UpdatedArtifactsResponse> {
        return this._messenger.sendRequest(updateListenerSourceCode, HOST_EXTENSION, params);
    }

    getListenerModelFromCode(params: ListenerModelFromCodeRequest): Promise<ListenerModelFromCodeResponse> {
        return this._messenger.sendRequest(getListenerModelFromCode, HOST_EXTENSION, params);
    }

    getServiceModel(params: ServiceModelRequest): Promise<ServiceModelResponse> {
        return this._messenger.sendRequest(getServiceModel, HOST_EXTENSION, params);
    }

    getFunctionModel(params: FunctionModelRequest): Promise<FunctionModelResponse> {
        return this._messenger.sendRequest(getFunctionModel, HOST_EXTENSION, params);
    }

    getFunctionFromSource(params: FunctionFromSourceRequest): Promise<FunctionFromSourceResponse> {
        return this._messenger.sendRequest(getFunctionFromSource, HOST_EXTENSION, params);
    }

    addServiceSourceCode(params: ServiceSourceCodeRequest): Promise<UpdatedArtifactsResponse> {
        return this._messenger.sendRequest(addServiceSourceCode, HOST_EXTENSION, params);
    }

    updateServiceSourceCode(params: ServiceSourceCodeRequest): Promise<UpdatedArtifactsResponse> {
        return this._messenger.sendRequest(updateServiceSourceCode, HOST_EXTENSION, params);
    }

    getServiceModelFromCode(params: ServiceModelFromCodeRequest): Promise<ServiceModelFromCodeResponse> {
        return this._messenger.sendRequest(getServiceModelFromCode, HOST_EXTENSION, params);
    }

    getHttpResourceModel(params: HttpResourceModelRequest): Promise<HttpResourceModelResponse> {
        return this._messenger.sendRequest(getHttpResourceModel, HOST_EXTENSION, params);
    }

    getResourceReturnTypes(params: ResourceReturnTypesRequest): Promise<VisibleTypesResponse> {
        return this._messenger.sendRequest(getResourceReturnTypes, HOST_EXTENSION, params);
    }

    addResourceSourceCode(params: FunctionSourceCodeRequest): Promise<UpdatedArtifactsResponse> {
        return this._messenger.sendRequest(addResourceSourceCode, HOST_EXTENSION, params);
    }

    addFunctionSourceCode(params: FunctionSourceCodeRequest): Promise<UpdatedArtifactsResponse> {
        return this._messenger.sendRequest(addFunctionSourceCode, HOST_EXTENSION, params);
    }

    updateResourceSourceCode(params: FunctionSourceCodeRequest): Promise<UpdatedArtifactsResponse> {
        return this._messenger.sendRequest(updateResourceSourceCode, HOST_EXTENSION, params);
    }

    getServiceInitModel(params: ServiceModelRequest): Promise<ServiceModelInitResponse> {
        return this._messenger.sendRequest(getServiceInitModel, HOST_EXTENSION, params);
    }

    createServiceAndListener(params: ServiceInitSourceRequest): Promise<UpdatedArtifactsResponse> {
        return this._messenger.sendRequest(createServiceAndListener, HOST_EXTENSION, params);
    }

    generateExamplePayloadJson(params: PayloadContext): Promise<object> {
        return this._messenger.sendRequest(generateExamplePayloadJson, HOST_EXTENSION, params);
    }

    validateProperty(params: ValidatePropertyRequest): Promise<ValidatePropertyResponse> {
        return this._messenger.sendRequest(validateProperty, HOST_EXTENSION, params);
    }

    getOASSpec(params: GetOASSpecRequest): Promise<GetOASSpecResponse> {
        return this._messenger.sendRequest(getOASSpec, HOST_EXTENSION, params);
    }
}
