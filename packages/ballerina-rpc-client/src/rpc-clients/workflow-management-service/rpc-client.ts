/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
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
import {
    WorkflowManagementResponse, WorkflowManagementRequest,
    addWorkflowManagement, disableWorkflowManagement, isWorkflowManagementEnabled, WorkflowManagementServiceAPI
} from "@wso2/ballerina-core";
import { HOST_EXTENSION } from "vscode-messenger-common";
import { Messenger } from "vscode-messenger-webview";

export class WorkflowManagementServiceRpcClient implements WorkflowManagementServiceAPI {
    private _messenger: Messenger;

    constructor(messenger: Messenger) {
        this._messenger = messenger;
    }

    isWorkflowManagementEnabled(params: WorkflowManagementRequest): Promise<WorkflowManagementResponse> {
        return this._messenger.sendRequest(isWorkflowManagementEnabled, HOST_EXTENSION, params);
    }

    addWorkflowManagement(params: WorkflowManagementRequest): Promise<WorkflowManagementResponse> {
        return this._messenger.sendRequest(addWorkflowManagement, HOST_EXTENSION, params);
    }

    disableWorkflowManagement(params: WorkflowManagementRequest): Promise<WorkflowManagementResponse> {
        return this._messenger.sendRequest(disableWorkflowManagement, HOST_EXTENSION, params);
    }
}
