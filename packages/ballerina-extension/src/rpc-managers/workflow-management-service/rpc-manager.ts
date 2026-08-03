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
import * as fs from 'fs';
import * as path from 'path';
import { parse, stringify } from "@iarna/toml";
import { StateMachine } from "../../stateMachine";
import { updateSourceCode } from "../../utils/source-utils";

/**
 * Adds the `[ballerina.workflow.management]` configuration block to Config.toml,
 * preserving any other configuration already present.
 */
function addWorkflowManagementConfigToml(projectPath: string): void {
    const configPath = path.join(projectPath, 'Config.toml');
    let config: Record<string, any> = {};

    if (fs.existsSync(configPath)) {
        try {
            config = parse(fs.readFileSync(configPath, 'utf-8')) as Record<string, any>;
        } catch (error) {
            // Abort rather than overwriting an unparseable Config.toml with a partial config.
            console.error('[WorkflowManagement] Error reading Config.toml, skipping update:', error);
            return;
        }
    }

    if (!config.ballerina) { config.ballerina = {}; }
    if (!config.ballerina.workflow) { config.ballerina.workflow = {}; }

    const existing = config.ballerina.workflow.management ?? {};
    config.ballerina.workflow.management = {
        ...existing,
        enableManagementApi: true,
        port: existing.port ?? 8234,
        enableBasicAuth: existing.enableBasicAuth ?? false,
    };

    fs.writeFileSync(configPath, stringify(config), 'utf-8');
}

/**
 * Removes the `[ballerina.workflow.management]` block from Config.toml, cleaning up
 * any parent tables that become empty as a result.
 */
function removeWorkflowManagementConfigToml(projectPath: string): void {
    const configPath = path.join(projectPath, 'Config.toml');
    if (!fs.existsSync(configPath)) {
        return;
    }

    try {
        const config = parse(fs.readFileSync(configPath, 'utf-8')) as Record<string, any>;

        if (config.ballerina?.workflow?.management) {
            delete config.ballerina.workflow.management;

            if (Object.keys(config.ballerina.workflow).length === 0) { delete config.ballerina.workflow; }
            if (Object.keys(config.ballerina).length === 0) { delete config.ballerina; }
        }

        fs.writeFileSync(configPath, stringify(config), 'utf-8');
    } catch (error) {
        console.error('[WorkflowManagement] Error removing workflow management config from Config.toml:', error);
    }
}

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
            addWorkflowManagementConfigToml(projectPath);
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
            removeWorkflowManagementConfigToml(projectPath);
            const result = await context.langClient.isWorkflowManagementEnabled({ projectPath });
            return result as WorkflowManagementResponse;
        } catch (error) {
            console.log(error);
            return { enabled: false };
        }
    }
}
