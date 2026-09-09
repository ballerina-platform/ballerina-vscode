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

// feature usage events
export const TM_EVENT_EXTENSION_INIT = "ballerina.extension.init";
export const TM_EVENT_EXTENSION_ACTIVATE = "editor-workspace-ballerina-extension-activate";

// events for opening custom views
export const TM_EVENT_OPEN_EXAMPLES = "open.examples";
export const TM_EVENT_OPEN_PERFORMANCE = "open.performance";
export const TM_EVENT_OPEN_DIAGRAM = "open.diagram";
export const TM_EVENT_OPEN_PACKAGE_OVERVIEW = "open.project.overview.via.tree.view";
export const TM_EVENT_OPEN_NETWORK_LOGS = "open.network.logs";
export const TM_EVENT_OPEN_DOC_PREVIEW = "open.doc.preview";
export const TM_EVENT_OPEN_API_DESIGNER = "open.api.designer";

// event for opening auto detected project folder through the prompt we provide
export const TM_EVENT_OPEN_DETECTED_PROJECT_ROOT_VIA_PROMPT = "open.api.designer";

// event for starting debug sessions for ballerina files
export const TM_EVENT_START_DEBUG_SESSION = "start.debug.session";

// event for running tests in current project
export const TM_EVENT_PROJECT_TEST = "execute.project.tests";

// event for running build for current project
export const TM_EVENT_PROJECT_BUILD = "execute.project.build";

// event for running pack for current project
export const TM_EVENT_PROJECT_PACK = "execute.project.pack";

// event for executing the ballerina run command
export const TM_EVENT_PROJECT_RUN = "execute.project.run";

// event for executing the ballerina run command in ls
export const TM_EVENT_PROJECT_RUN_FAST = "execute.project.run.fast";

// event for executing the ballerina doc command
export const TM_EVENT_PROJECT_DOC = "execute.project.doc";

// event for executing the ballerina add command
export const TM_EVENT_PROJECT_ADD = "execute.project.add";

// event for generating Cloud.toml for current project
export const TM_EVENT_PROJECT_CLOUD = "execute.project.cloud";

export const TM_EVENT_AUTH_COPILOT = "execute.auth.copilot";

// events for language server
export const TM_EVENT_LANG_SERVER = "ballerina.langserver.event";
export const TM_ERROR_LANG_SERVER = "ballerina.langserver.error";
export const TM_FEATURE_USAGE_LANG_SERVER = "ballerina.langserver.feature.usage";

// events related to editor support features
export const TM_EVENT_STRING_SPLIT = "ballerina.string.split";

// events for executor codelenses
export const TM_EVENT_SOURCE_DEBUG_CODELENS = "execute.source.debug.codelens";
export const TM_EVENT_TEST_DEBUG_CODELENS = "execute.test.debug.codelens";

// event for executing paste JSON as Record command
export const TM_EVENT_PASTE_AS_RECORD = "execute.pasteAsRecord";

// events for low-code
export const TM_EVENT_OPEN_LOW_CODE = "editor-lowcode-editor";
export const TM_EVENT_OPEN_CODE_EDITOR = "editor-code-editor";
export const TM_EVENT_WORKSPACE_RUN = "editor-lowcode-workspace-run";
export const TM_EVENT_LOW_CODE_RUN = "editor-lowcode-code-run";
export const TM_EVENT_SWAGGER_RUN = "editor-workspace-tryit-swagger";
export const TM_EVENT_KILL_TERMINAL = "editor-terminal-kill";
export const TM_EVENT_GIT_COMMIT = "editor-workspace-git-commit";
export const TM_EVENT_EDIT_SOURCE = "editor-workspace-edit-source";
export const TM_EVENT_EDIT_DIAGRAM = "editor-workspace-edit-diagram";
export const TM_EVENT_GRAPHQL_RUN = "editor-workspace-tryit-graphql";

export const TM_EVENT_LANG_CLIENT = "ballerina.langclient.event";

// performance analyzer events
export const TM_EVENT_PERF_REQUEST = "perfomance-analyzer-request";
export const TM_EVENT_PERF_LS_REQUEST = "perfomance-analyzer-ls-request";
export const TM_EVENT_OPEN_PERF_GRAPH = "perfomance-graph-open";
export const TM_EVENT_CLICK_PERF_GRAPH = "perfomance-graph-click";

// events for notebook
export const TM_EVENT_CREATE_NOTEBOOK = "notebook.create";
export const TM_EVENT_OPEN_NOTEBOOK = "notebook.open";
export const TM_EVENT_CLOSE_NOTEBOOK = "notebook.close";
export const TM_EVENT_RUN_NOTEBOOK = "notebook.run";
export const TM_EVENT_RUN_NOTEBOOK_CODE_SNIPPET = "notebook.run.code.snippet";
export const TM_EVENT_RUN_NOTEBOOK_BAL_CMD = "notebook.run.bal.cmd";
export const TM_EVENT_RESTART_NOTEBOOK = "notebook.restart";
export const TM_EVENT_OPEN_VARIABLE_VIEW = "notebook.variable-view.open";
export const TM_EVENT_UPDATE_VARIABLE_VIEW = "notebook.variable-view.update";
export const TM_EVENT_START_NOTEBOOK_DEBUG = "notebook.start.debug";


// events for open vscode from url
export const TM_EVENT_OPEN_FILE_URL_START = "vscode.open.file.url.start";
export const TM_EVENT_OPEN_FILE_CHANGE_PATH = "vscode.open.file.change.path";
export const TM_EVENT_OPEN_FILE_NEW_FOLDER = "vscode.open.file.new.folder";
export const TM_EVENT_OPEN_FILE_SAME_FOLDER = "vscode.open.file.same.folder";
export const TM_EVENT_OPEN_FILE_CANCELED = "vscode.open.file.canceled";

export const TM_EVENT_OPEN_REPO_URL_START = "vscode.open.repo.url.start";
export const TM_EVENT_OPEN_REPO_CLONE_NOW = "vscode.open.repo.clone.now";
export const TM_EVENT_OPEN_REPO_CHANGE_PATH = "vscode.open.repo.change.path";
export const TM_EVENT_OPEN_REPO_CANCELED = "vscode.open.repo.canceled";
export const TM_EVENT_OPEN_REPO_NEW_FOLDER = "vscode.open.exist.repo.new.folder";
export const TM_EVENT_OPEN_REPO_SAME_FOLDER = "vscode.open.exist.repo.same.folder";


// events for AI features
export const TM_EVENT_BALLERINA_AI_GENERATION_SUBMITTED = "ballerina.ai.generation.submitted";
export const TM_EVENT_BALLERINA_AI_GENERATION_COMPLETED = "ballerina.ai.generation.completed";
export const TM_EVENT_BALLERINA_AI_GENERATION_FAILED = "ballerina.ai.generation.failed";
export const TM_EVENT_BALLERINA_AI_GENERATION_ABORTED = "ballerina.ai.generation.aborted";
export const TM_EVENT_BALLERINA_AI_GENERATION_TRUNCATED = "ballerina.ai.generation.truncated";
export const TM_EVENT_BALLERINA_AI_GENERATION_KEPT = "ballerina.ai.generation.kept";
export const TM_EVENT_BALLERINA_AI_GENERATION_DISCARD = "ballerina.ai.generation.discard";
export const TM_EVENT_BALLERINA_AI_GENERATION_FEEDBACK = "ballerina.ai.generation.feedback";