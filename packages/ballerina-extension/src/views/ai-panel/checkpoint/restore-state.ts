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

// A restore rewrites the workspace and then truncates the thread, across enough awaits to leave the
// user seconds in which to send a prompt or switch threads. The panel's own restoring flag cannot
// gate that: it is webview state, so it is gone after a reload and never seen by the extension —
// while the chat store is what a concurrent run corrupts.

const restoringWorkspaces = new Set<string>();

export function beginRestore(projectRootPath: string): void {
    restoringWorkspaces.add(projectRootPath);
}

export function endRestore(projectRootPath: string): void {
    restoringWorkspaces.delete(projectRootPath);
}

export function isRestoreInProgress(projectRootPath: string): boolean {
    return restoringWorkspaces.has(projectRootPath);
}

/**
 * Throws rather than returning a flag: every caller is an awaited RPC, so the webview's catch is
 * what resets its spinner and shows the reason. A silent refusal would leave it spinning.
 */
export function assertNoRestoreInProgress(projectRootPath: string, action: string): void {
    if (isRestoreInProgress(projectRootPath)) {
        console.warn(`[RPC] Refused ${action} — a checkpoint restore is still running for: ${projectRootPath}`);
        throw new Error('A checkpoint restore is still in progress. Please wait for it to finish.');
    }
}
