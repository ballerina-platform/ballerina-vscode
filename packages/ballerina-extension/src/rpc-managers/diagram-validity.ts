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

import { Uri } from 'vscode';
import { StateMachine } from '../stateMachine';
import { chatStateStorage } from '../views/ai-panel/chatStateStorage';

const aiTouchedFiles = new Set<string>();

/** Records an absolute file path as touched by the current Copilot generation. */
export function recordAiTouchedFile(absPath: string): void {
    aiTouchedFiles.add(absPath);
}

/** Clears the touched-file set. Call at the start of a new generation. */
export function clearAiTouchedFiles(): void {
    aiTouchedFiles.clear();
}

/** Whether the given absolute path was touched by the current Copilot generation. */
export function isAiTouchedFile(absPath: string): boolean {
    return aiTouchedFiles.has(absPath);
}

function toUri(pathOrUri: string): string {
    return /^[a-z][a-z0-9+.-]*:\/\//i.test(pathOrUri) ? pathOrUri : Uri.file(pathOrUri).toString();
}

/**
 * Whether the given files (or, if none given, the current generation's touched files) are
 * syntactically valid. Used to suppress diagram renders of partial models mid-edit — the
 * Ballerina parser is error-tolerant, so broken source yields a partial (not error) model.
 * Only gates while a Copilot generation is active; user hand-edits are never suppressed.
 * Fails open on any probe error so a broken check can never block a real render.
 */
export async function isAiSourceParseable(fileUris: string[] = []): Promise<boolean> {
    if (!chatStateStorage.hasAnyActiveExecution()) {
        return true;
    }

    const targets = fileUris.length > 0 ? fileUris : Array.from(aiTouchedFiles).map(toUri);
    if (targets.length === 0) {
        return true;
    }

    try {
        for (const uri of targets) {
            const st = await StateMachine.langClient().getSyntaxTree({ documentIdentifier: { uri: toUri(uri) } });
            if (st && typeof (st as any).parseSuccess === "boolean" && (st as any).parseSuccess === false) {
                return false;
            }
        }
        return true;
    } catch {
        return true;
    }
}
