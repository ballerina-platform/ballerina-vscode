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
    WorkflowManagementServiceAPI,
    WorkflowManagementRequest,
    WorkflowManagementResponse,
} from "@wso2/ballerina-core";
import { StateMachine } from "../../stateMachine";
import { updateSourceCode } from "../../utils/source-utils";
import {
    disableWorkflowManagementConfig,
    enableWorkflowManagementConfig,
} from "../../utils/workflow-config-toml";

export class WorkflowManagementServiceRpcManager implements WorkflowManagementServiceAPI {

    async isWorkflowManagementEnabled(params: WorkflowManagementRequest): Promise<WorkflowManagementResponse> {
        const context = StateMachine.context();
        try {
            const projectPath: string = params.projectPath || context.projectPath;
            const res = await context.langClient.isWorkflowManagementEnabled({ projectPath });
            return res as WorkflowManagementResponse;
        } catch (error) {
            console.log(error);
            return { enabled: false };
        }
    }

    async addWorkflowManagement(params: WorkflowManagementRequest): Promise<WorkflowManagementResponse> {
        const context = StateMachine.context();
        try {
            const projectPath: string = params.projectPath || context.projectPath;
            const res: any = await context.langClient.addWorkflowManagement({ projectPath });
            if (res?.textEdits && Object.keys(res.textEdits).length > 0) {
                await updateSourceCode({ textEdits: res.textEdits, description: 'Enable Workflow Management' });
            }
            enableWorkflowManagementConfig(projectPath);
            const result = await context.langClient.isWorkflowManagementEnabled({ projectPath });
            return result as WorkflowManagementResponse;
        } catch (error) {
            console.log(error);
            return { enabled: false };
        }
    }

    async disableWorkflowManagement(params: WorkflowManagementRequest): Promise<WorkflowManagementResponse> {
        const context = StateMachine.context();
        try {
            const projectPath: string = params.projectPath || context.projectPath;
            const res: any = await context.langClient.disableWorkflowManagement({ projectPath });
            if (res?.textEdits && Object.keys(res.textEdits).length > 0) {
                await updateSourceCode({ textEdits: res.textEdits, description: 'Disable Workflow Management' });
            }
            disableWorkflowManagementConfig(projectPath);
            const result = await context.langClient.isWorkflowManagementEnabled({ projectPath });
            return result as WorkflowManagementResponse;
        } catch (error) {
            console.log(error);
            return { enabled: false };
        }
    }
}
