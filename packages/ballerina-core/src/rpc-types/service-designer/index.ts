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
 */

import { UpdatedArtifactsResponse } from "../../interfaces/bi";
import { ListenerModelRequest, ListenerModelResponse, ServiceModelRequest, ServiceModelResponse, ServiceModelFromCodeRequest, ServiceModelFromCodeResponse, HttpResourceModelRequest, HttpResourceModelResponse, FunctionSourceCodeRequest, ListenerSourceCodeRequest, ListenersRequest, ListenersResponse, ServiceSourceCodeRequest, ListenerModelFromCodeRequest, ListenerModelFromCodeResponse, TriggerModelsRequest, TriggerModelsResponse, FunctionModelRequest, FunctionModelResponse, ResourceReturnTypesRequest, FunctionFromSourceRequest, FunctionFromSourceResponse, ServiceModelInitResponse, ServiceInitSourceRequest, VisibleTypesResponse, ValidatePropertyRequest, ValidatePropertyResponse } from "../../interfaces/extended-lang-client";
import { PayloadContext } from "../../interfaces/service";
import {
    ExportOASRequest,
    ExportOASResponse,
    GetOASSpecRequest,
    GetOASSpecResponse,
} from "./interfaces";

export interface ServiceDesignerAPI {
    exportOASFile: (params: ExportOASRequest) => Promise<ExportOASResponse>;
    getTriggerModels: (params: TriggerModelsRequest) => Promise<TriggerModelsResponse>;
    searchTriggers: (params: TriggerModelsRequest) => Promise<TriggerModelsResponse>;
    getListeners: (params: ListenersRequest) => Promise<ListenersResponse>;
    getListenerModel: (params: ListenerModelRequest) => Promise<ListenerModelResponse>;
    addListenerSourceCode: (params: ListenerSourceCodeRequest) => Promise<UpdatedArtifactsResponse>;
    updateListenerSourceCode: (params: ListenerSourceCodeRequest) => Promise<UpdatedArtifactsResponse>;
    getListenerModelFromCode: (params: ListenerModelFromCodeRequest) => Promise<ListenerModelFromCodeResponse>;
    getServiceModel: (params: ServiceModelRequest) => Promise<ServiceModelResponse>;
    getFunctionModel: (params: FunctionModelRequest) => Promise<FunctionModelResponse>;
    getFunctionFromSource: (params: FunctionFromSourceRequest) => Promise<FunctionFromSourceResponse>;
    addServiceSourceCode: (params: ServiceSourceCodeRequest) => Promise<UpdatedArtifactsResponse>;
    updateServiceSourceCode: (params: ServiceSourceCodeRequest) => Promise<UpdatedArtifactsResponse>;
    getServiceModelFromCode: (params: ServiceModelFromCodeRequest) => Promise<ServiceModelFromCodeResponse>;
    getHttpResourceModel: (params: HttpResourceModelRequest) => Promise<HttpResourceModelResponse>;
    getResourceReturnTypes: (params: ResourceReturnTypesRequest) => Promise<VisibleTypesResponse>;
    addResourceSourceCode: (params: FunctionSourceCodeRequest) => Promise<UpdatedArtifactsResponse>;
    addFunctionSourceCode: (params: FunctionSourceCodeRequest) => Promise<UpdatedArtifactsResponse>;
    updateResourceSourceCode: (params: FunctionSourceCodeRequest) => Promise<UpdatedArtifactsResponse>;
    getServiceInitModel: (params: ServiceModelRequest) => Promise<ServiceModelInitResponse>;
    createServiceAndListener: (params: ServiceInitSourceRequest) => Promise<UpdatedArtifactsResponse>;
    generateExamplePayloadJson: (params: PayloadContext) => Promise<object>;
    getOASSpec: (params: GetOASSpecRequest) => Promise<GetOASSpecResponse>;
    validateProperty: (params: ValidatePropertyRequest) => Promise<ValidatePropertyResponse>;
}
