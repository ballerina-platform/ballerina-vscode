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
import { UpdatedArtifactsResponse } from "../../interfaces/bi";
import { ListenerModelRequest, ListenerModelResponse, ServiceModelRequest, ServiceModelResponse, ServiceModelFromCodeRequest, ServiceModelFromCodeResponse, HttpResourceModelRequest, HttpResourceModelResponse, FunctionSourceCodeRequest, ListenerSourceCodeRequest, ListenersRequest, ListenersResponse, ServiceSourceCodeRequest, ListenerModelFromCodeRequest, ListenerModelFromCodeResponse, TriggerModelsRequest, TriggerModelsResponse, FunctionModelRequest, FunctionModelResponse, ResourceReturnTypesRequest, FunctionFromSourceRequest, FunctionFromSourceResponse, ServiceModelInitResponse, ServiceInitSourceRequest, VisibleTypesResponse, ValidatePropertyRequest, ValidatePropertyResponse } from "../../interfaces/extended-lang-client";
import { PayloadContext } from "../../interfaces/service";
import {
    ExportOASRequest,
    ExportOASResponse,
    GetOASSpecRequest,
    GetOASSpecResponse,
} from "./interfaces";
import { RequestType } from "vscode-messenger-common";

const _preFix = "service-designer";
export const exportOASFile: RequestType<ExportOASRequest, ExportOASResponse> = { method: `${_preFix}/exportOASFile` };
export const getTriggerModels: RequestType<TriggerModelsRequest, TriggerModelsResponse> = { method: `${_preFix}/getTriggerModels` };
export const searchTriggers: RequestType<TriggerModelsRequest, TriggerModelsResponse> = { method: `${_preFix}/searchTriggers` };
export const getListeners: RequestType<ListenersRequest, ListenersResponse> = { method: `${_preFix}/getListeners` };
export const getListenerModel: RequestType<ListenerModelRequest, ListenerModelResponse> = { method: `${_preFix}/getListenerModel` };
export const addListenerSourceCode: RequestType<ListenerSourceCodeRequest, UpdatedArtifactsResponse> = { method: `${_preFix}/addListenerSourceCode` };
export const updateListenerSourceCode: RequestType<ListenerSourceCodeRequest, UpdatedArtifactsResponse> = { method: `${_preFix}/updateListenerSourceCode` };
export const getListenerModelFromCode: RequestType<ListenerModelFromCodeRequest, ListenerModelFromCodeResponse> = { method: `${_preFix}/getListenerModelFromCode` };
export const getServiceModel: RequestType<ServiceModelRequest, ServiceModelResponse> = { method: `${_preFix}/getServiceModel` };
export const getFunctionModel: RequestType<FunctionModelRequest, FunctionModelResponse> = { method: `${_preFix}/getFunctionModel` };
export const getFunctionFromSource: RequestType<FunctionFromSourceRequest, FunctionFromSourceResponse> = { method: `${_preFix}/getFunctionFromSource` };
export const addServiceSourceCode: RequestType<ServiceSourceCodeRequest, UpdatedArtifactsResponse> = { method: `${_preFix}/addServiceSourceCode` };
export const updateServiceSourceCode: RequestType<ServiceSourceCodeRequest, UpdatedArtifactsResponse> = { method: `${_preFix}/updateServiceSourceCode` };
export const getServiceModelFromCode: RequestType<ServiceModelFromCodeRequest, ServiceModelFromCodeResponse> = { method: `${_preFix}/getServiceModelFromCode` };
export const getHttpResourceModel: RequestType<HttpResourceModelRequest, HttpResourceModelResponse> = { method: `${_preFix}/getHttpResourceModel` };
export const getResourceReturnTypes: RequestType<ResourceReturnTypesRequest, VisibleTypesResponse> = { method: `${_preFix}/getResourceReturnTypes` };
export const addResourceSourceCode: RequestType<FunctionSourceCodeRequest, UpdatedArtifactsResponse> = { method: `${_preFix}/addResourceSourceCode` };
export const addFunctionSourceCode: RequestType<FunctionSourceCodeRequest, UpdatedArtifactsResponse> = { method: `${_preFix}/addFunctionSourceCode` };
export const updateResourceSourceCode: RequestType<FunctionSourceCodeRequest, UpdatedArtifactsResponse> = { method: `${_preFix}/updateResourceSourceCode` };
export const getServiceInitModel: RequestType<ServiceModelRequest, ServiceModelInitResponse> = { method: `${_preFix}/getServiceInitModel` };
export const createServiceAndListener: RequestType<ServiceInitSourceRequest, UpdatedArtifactsResponse> = { method: `${_preFix}/createServiceAndListener` };
export const generateExamplePayloadJson: RequestType<PayloadContext, object> = { method: `${_preFix}/generateExamplePayloadJson` };
export const getOASSpec: RequestType<GetOASSpecRequest, GetOASSpecResponse> = { method: `${_preFix}/getOASSpec` };
export const validateProperty: RequestType<ValidatePropertyRequest, ValidatePropertyResponse> = { method: `${_preFix}/validateProperty` };
