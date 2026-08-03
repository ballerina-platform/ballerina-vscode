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

import { AttachmentHandler } from "./attachmentHandler";
import { Attachment, AttachmentStatus } from "@wso2/ballerina-core";
import { readFileAsText, readFileAsBase64, readFileAsRawBase64, resolveMimeType, validateFileSize, validateFileType } from "./attachmentUtils";

/**
 * Abstract base class that provides common file-attachment handling logic.
 * Concrete classes can override readFileContent if needed (e.g. for base64).
 */
export abstract class BaseAttachment implements AttachmentHandler {
    constructor(protected validFileTypes: string[]) { }

    /**
     * Main method to handle the file input event. It iterates over
     * all files, validates them, reads them, and returns the results.
     */
    public async handleFileAttach(
        e: React.ChangeEvent<HTMLInputElement>
    ): Promise<Attachment[]> {
        const files = e.target.files;
        const results: Attachment[] = [];

        if (!files) {
            return results;
        }

        for (const file of Array.from(files)) {
            if (!validateFileSize(file)) {
                results.push({
                    name: file.name,
                    status: AttachmentStatus.FileSizeExceeded,
                });
                continue;
            }

            if (!validateFileType(file, this.validFileTypes)) {
                results.push({
                    name: file.name,
                    status: AttachmentStatus.UnsupportedFileFormat,
                });
                continue;
            }

            try {
                const content = await this.readFileContent(file);
                results.push({
                    name: file.name,
                    content,
                    status: AttachmentStatus.Success,
                    // Resolve the mime type (falling back to the extension) so images
                    // and PDFs stay correctly typed even when file.type is empty.
                    mimeType: resolveMimeType(file),
                });
            } catch {
                results.push({
                    name: file.name,
                    status: AttachmentStatus.UnknownError,
                });
            }
        }

        // Clear the input
        e.target.value = "";
        return results;
    }

    /**
     * Default method to read file content.
     * Images are read as base64 data URLs, PDFs as raw base64, text files as plain text.
     * The mime type is resolved from file.type with an extension fallback so binary
     * files are never mis-read as text. Subclasses can override this if needed.
     */
    protected async readFileContent(file: File): Promise<string> {
        const mimeType = resolveMimeType(file);
        if (mimeType.startsWith('image/')) {
            return readFileAsBase64(file);
        }
        if (mimeType === 'application/pdf') {
            return readFileAsRawBase64(file);
        }
        return readFileAsText(file);
    }
}
