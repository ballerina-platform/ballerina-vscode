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

export const SHARED_COMMANDS = {
    FORCE_UPDATE_PROJECT_ARTIFACTS: 'ballerina.force.update.artifacts',
    SHOW_VISUALIZER: 'ballerina.showVisualizer',
    GET_STATE_CONTEXT: 'ballerina.get.stateContext',
    OPEN_BI_NEW_PROJECT: 'ballerina.open.bi.new',
    SETUP_BALLERINA: 'ballerina.setup',
    OPEN_SERVICE_FORM: 'ballerina.open.service.form',
    OPEN_AI_PANEL: 'ballerina.open.ai.panel',
    CLOSE_AI_PANEL: 'ballerina.close.ai.panel',
    OPEN_AGENT_CHAT: 'ballerina.open.agent.chat'
}

export const BI_COMMANDS = {
    BI_RUN_PROJECT: 'BI.project.run',
    BI_DEBUG_PROJECT: 'BI.project.debug',
    PROJECT_EXPLORER: 'BI.project-explorer',
    PROJECT_EXPLORER_REFRESH: 'BI.project-explorer.refresh',
    ADD_CONNECTIONS: 'BI.project-explorer.add-connection',
    ADD_CUSTOM_CONNECTOR: 'BI.project-explorer.add-custom-connector',
    DELETE_COMPONENT: 'BI.project-explorer.delete',
    ADD_ENTRY_POINT: 'BI.project-explorer.add-entry-point',
    ADD_TYPE: 'BI.project-explorer.add-type',
    VIEW_TYPE_DIAGRAM: 'BI.project-explorer.view-type-diagram',
    ADD_FUNCTION: 'BI.project-explorer.add-function',
    OPEN_TYPE_DIAGRAM: 'BI.view.typeDiagram',
    ADD_CONFIGURATION: 'BI.project-explorer.add-configuration',
    VIEW_CONFIGURATION: 'BI.project-explorer.view-configuration',
    ADD_PROJECT: 'BI.project-explorer.add',
    SHOW_OVERVIEW: 'BI.project-explorer.overview',
    ADD_DATA_MAPPER: 'BI.project-explorer.add-data-mapper',
    ADD_WORKFLOW: 'BI.project-explorer.add-workflow',
    ADD_WORKFLOW_ACTIVITY: 'BI.project-explorer.add-workflow-activity',
    BI_EDIT_TEST_FUNCTION: 'BI.test.edit.function',
    BI_ADD_TEST_FUNCTION: 'BI.test.add.function',
    BI_ADD_AI_EVALUATION: 'BI.test.add.ai.evaluation',
    BI_EDIT_TEST_FUNCTION_DEF: 'BI.test.edit.function.def',
    BI_DELETE_TEST_FUNCTION: 'BI.test.delete.function',
    ADD_NATURAL_FUNCTION: 'BI.project-explorer.add-natural-function',
    TOGGLE_TRACE_LOGS: 'BI.toggle.trace.logs',
    DEVANT_PUSH_TO_CLOUD: 'BI.devant.push.cloud',
    CREATE_BI_PROJECT: 'BI.project.createBIProjectPure',
    CREATE_BI_MIGRATION_PROJECT: 'BI.project.createBIProjectMigration',
    GET_BI_FORM_WS_BOOTSTRAP: 'ballerina.getBiFormWsBootstrap',
    ADD_INTEGRATION: 'BI.project-explorer.add-integration',
    NOTIFY_PROJECT_EXPLORER: 'BI.project-explorer.notify'
};
