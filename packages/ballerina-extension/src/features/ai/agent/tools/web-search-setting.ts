// Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com/) All Rights Reserved.

// WSO2 LLC. licenses this file to you under the Apache License,
// Version 2.0 (the "License"); you may not use this file except
// in compliance with the License.
// You may obtain a copy of the License at

// http://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied. See the License for the
// specific language governing permissions and limitations
// under the License.

import * as vscode from "vscode";

/** Key within the `ballerina` configuration section; the settings panel toggles it as `ballerina.copilot.enableWebSearch`. */
export const WEB_SEARCH_SETTING = "copilot.enableWebSearch";

/**
 * Whether the main agent's web_search and web_fetch run without asking. When off, each of its calls
 * asks the user for approval first; the LibraryResearcher subagent's web access stays on. Read at the
 * start of every run, so a change applies from the next message.
 */
export function isWebSearchEnabled(): boolean {
    return vscode.workspace.getConfiguration("ballerina").get<boolean>(WEB_SEARCH_SETTING, true);
}
