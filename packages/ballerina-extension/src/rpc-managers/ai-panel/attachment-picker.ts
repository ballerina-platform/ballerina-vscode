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

import path from "path";
import { Uri, window, workspace } from "vscode";
import { Attachment, AttachmentEncoding, AttachmentStatus, SelectAttachmentFilesRequest } from "@wso2/ballerina-core";

/**
 * The folder the attachment picker opens in. `startPath` is a plain fsPath, so it is
 * rebuilt on its workspace folder's URI to keep a remote scheme and authority.
 */
export function resolveAttachmentStartUri(startPath?: string): Uri | undefined {
    const folders = workspace.workspaceFolders ?? [];
    if (!startPath) {
        return folders[0]?.uri;
    }
    for (const folder of folders) {
        const relative = path.relative(folder.uri.fsPath, startPath);
        if (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)) {
            return relative ? Uri.joinPath(folder.uri, ...relative.split(path.sep)) : folder.uri;
        }
    }
    return Uri.file(startPath);
}

function isUtf8Text(bytes: Uint8Array): boolean {
    if (bytes.includes(0)) {
        return false;
    }
    try {
        new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        return true;
    } catch {
        return false;
    }
}

function encodeContent(bytes: Uint8Array, mimeType: string, encoding: AttachmentEncoding): string {
    const base64 = () => Buffer.from(bytes).toString("base64");
    if (encoding === "base64" || mimeType === "application/pdf") {
        return base64();
    }
    if (mimeType.startsWith("image/")) {
        return `data:${mimeType};base64,${base64()}`;
    }
    return new TextDecoder("utf-8").decode(bytes);
}

/**
 * Shows the host file picker and returns the chosen files as ready-to-send attachments.
 * A webview <input type="file"> always reopens in the last-used folder, so picking happens
 * on the host instead.
 */
export async function selectAttachmentFiles(
    params: SelectAttachmentFilesRequest,
    startPath?: string
): Promise<Attachment[]> {
    const filters: Record<string, string[]> = {};
    const extensions = Object.keys(params.fileTypes);
    if (extensions.length) {
        filters["Supported Files"] = extensions;
    }
    if (params.acceptOtherText) {
        filters["All Files"] = ["*"];
    }
    const uris = await window.showOpenDialog({
        canSelectMany: params.canSelectMany,
        defaultUri: resolveAttachmentStartUri(startPath),
        openLabel: "Attach",
        filters: Object.keys(filters).length ? filters : undefined,
    });

    const results: Attachment[] = [];
    let totalSize = 0;
    for (const uri of uris ?? []) {
        const name = path.basename(uri.fsPath);
        const extension = path.extname(name).slice(1).toLowerCase();
        const knownType = Object.prototype.hasOwnProperty.call(params.fileTypes, extension)
            ? params.fileTypes[extension]
            : undefined;
        if (!knownType && !params.acceptOtherText) {
            results.push({ name, status: AttachmentStatus.UnsupportedFileFormat });
            continue;
        }
        try {
            const { size } = await workspace.fs.stat(uri);
            // Checked before reading, so a large multi-select is never held in memory as a whole.
            if (size > params.maxFileSize || totalSize + size > params.maxTotalSize) {
                results.push({ name, status: AttachmentStatus.FileSizeExceeded });
                continue;
            }
            const bytes = await workspace.fs.readFile(uri);
            if (!knownType && !isUtf8Text(bytes)) {
                results.push({ name, status: AttachmentStatus.UnsupportedFileFormat });
                continue;
            }
            const mimeType = knownType ?? "text/plain";
            totalSize += size;
            results.push({
                name,
                content: encodeContent(bytes, mimeType, params.encoding),
                mimeType,
                status: AttachmentStatus.Success,
            });
        } catch (error) {
            console.error(`Failed to read attachment ${uri.fsPath}:`, error);
            results.push({ name, status: AttachmentStatus.UnknownError });
        }
    }
    return results;
}
