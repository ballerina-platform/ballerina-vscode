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

import * as path from "path";
import type { GenerateAgentCodeRequest } from "@wso2/ballerina-core";

interface ActiveTextEditorLike {
    document: {
        languageId: string;
        uri: {
            scheme: string;
            fsPath: string;
        };
    };
}

type CompanionSurface =
    | { type: "none" }
    | { type: "editor"; filePath: string }
    | { type: "visualizer" };

let companionSurface: CompanionSurface = { type: "none" };

function isBallerinaEditor(editor: ActiveTextEditorLike): boolean {
    return editor.document.uri.scheme === "file"
        && editor.document.languageId === "ballerina"
        && editor.document.uri.fsPath.toLowerCase().endsWith(".bal");
}

/**
 * Records a text editor as the surface beside the AI panel. Passing an unsupported
 * editor intentionally clears an older Ballerina file so non-code tabs never inherit it.
 */
export function setCompanionTextEditor(editor: ActiveTextEditorLike | undefined): void {
    companionSurface = editor && isBallerinaEditor(editor)
        ? { type: "editor", filePath: editor.document.uri.fsPath }
        : { type: "none" };
}

/** Records the visualizer as the surface beside the AI panel. */
export function setCompanionVisualizer(): void {
    companionSurface = { type: "visualizer" };
}

/**
 * Resolves and validates the ambient Ballerina file for a prompt.
 *
 * Mini chat always belongs to the current visualizer location. Full chat uses
 * the last supported surface that had focus before the AI webview.
 */
export function resolveActiveFilePath(
    promptSource: GenerateAgentCodeRequest["promptSource"],
    visualizerFilePath: string | undefined,
    workspaceRoot: string | undefined,
    projectPath: string | undefined,
): string | undefined {
    let candidate: string | undefined;
    if (promptSource === "mini-chat") {
        candidate = visualizerFilePath;
    } else if (promptSource === "ai-panel") {
        candidate = companionSurface.type === "visualizer"
            ? visualizerFilePath
            : companionSurface.type === "editor"
                ? companionSurface.filePath
                : undefined;
    }

    if (
        !candidate
        || !candidate.toLowerCase().endsWith(".bal")
        || /[\0\r\n]/.test(candidate)
    ) {
        return undefined;
    }

    const contextRoot = workspaceRoot || projectPath;
    if (!contextRoot) {
        return undefined;
    }
    const root = contextRoot.toLowerCase().endsWith(".bal")
        ? path.dirname(contextRoot)
        : contextRoot;
    const resolveBase = projectPath?.toLowerCase().endsWith(".bal")
        ? path.dirname(projectPath)
        : projectPath || root;

    const absolutePath = path.isAbsolute(candidate)
        ? path.normalize(candidate)
        : path.resolve(resolveBase, candidate);
    const relativePath = path.relative(path.resolve(root), absolutePath);

    if (
        !relativePath
        || relativePath === ".."
        || relativePath.startsWith(`..${path.sep}`)
        || path.isAbsolute(relativePath)
    ) {
        return undefined;
    }

    return relativePath.split(path.sep).join("/");
}

/** Test-only reset for the module-level focus snapshot. */
export function resetCompanionSurface(): void {
    companionSurface = { type: "none" };
}
