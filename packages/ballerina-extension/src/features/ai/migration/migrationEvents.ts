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

import { EventEmitter } from "vscode";
import { ProjectMigrationResult } from "@wso2/ballerina-core";

/**
 * Side-channel emitters for the migration-tool streaming callbacks the language
 * server pushes during an import. The extended language client already forwards
 * these to the Ballerina visualizer via the vscode-messenger RPCLayer; it
 * additionally fires these emitters so the BI WS-manager BridgeLayer can relay
 * the same streams over the giga-bridge (to the embedded integrator webview).
 *
 * This is purely additive — it does not change the existing RPCLayer path.
 */

const _stateEmitter = new EventEmitter<string>();
const _logEmitter = new EventEmitter<string>();
const _migratedProjectEmitter = new EventEmitter<ProjectMigrationResult>();

/** Fires on `projectService/stateCallback` migration-tool state changes. */
export const onMigrationToolStateEvent = _stateEmitter.event;
/** Fires on `projectService/logCallback` migration-tool log lines. */
export const onMigrationToolLogEvent = _logEmitter.event;
/** Fires on `projectService/pushMigratedProject` per-project completions. */
export const onMigratedProjectEvent = _migratedProjectEmitter.event;

export function emitMigrationToolState(state: string): void {
    _stateEmitter.fire(state);
}

export function emitMigrationToolLog(log: string): void {
    _logEmitter.fire(log);
}

export function emitMigratedProject(project: ProjectMigrationResult): void {
    _migratedProjectEmitter.fire(project);
}
