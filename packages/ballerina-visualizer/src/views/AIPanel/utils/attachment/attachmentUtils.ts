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

export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

/**
 * Validate file size against the global MAX_FILE_SIZE.
 */
export const validateFileSize = (file: File): boolean => {
    return file.size <= MAX_FILE_SIZE;
};

/**
 * Validate file type by checking against a list of valid MIME types/extensions.
 * Uses the resolved mime type so files with an empty browser-reported file.type
 * (e.g. a .pdf/.png inferred from its extension) are validated consistently with
 * how they are later read and labelled.
 */
export const validateFileType = (file: File, validFileTypes: string[]): boolean => {
    return validFileTypes.includes(resolveMimeType(file));
};

/**
 * Default way to read the file as text, returning a Promise<string>.
 */
export const readFileAsText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => {
            if (typeof reader.result === "string") {
                resolve(reader.result);
            } else {
                reject(new Error("File content is not a string."));
            }
        };

        reader.onerror = () => reject(new Error("Error reading the file."));
        reader.readAsText(file);
    });
};

/**
 * Fallback MIME types inferred from the file extension. Used when the browser
 * reports an empty `file.type`, which can happen for binary files (PDFs, images)
 * depending on the OS / file-registration state.
 */
const EXTENSION_MIME_TYPES: Record<string, string> = {
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
};

/**
 * Best-known MIME type for a file: the browser-provided `file.type` when present,
 * otherwise inferred from the file extension. Guarantees images and PDFs stay
 * correctly typed even when `file.type` is empty.
 */
export const resolveMimeType = (file: File): string => {
    if (file.type) {
        return file.type;
    }
    const extension = file.name.toLowerCase().split(".").pop() ?? "";
    return EXTENSION_MIME_TYPES[extension] ?? "";
};

/**
 * Helper to check if a file is an image based on its resolved MIME type.
 */
export const isImageFile = (file: File): boolean => {
    return resolveMimeType(file).startsWith('image/');
};

/**
 * Read image file as base64 data URL.
 */
export const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => {
            if (typeof reader.result === "string") {
                resolve(reader.result);
            } else {
                reject(new Error("File content is not a string."));
            }
        };

        reader.onerror = () => reject(new Error("Error reading the image file."));
        reader.readAsDataURL(file);
    });
};

/**
 * Read a file as raw base64 (without the `data:...;base64,` prefix).
 * Used for binary documents such as PDFs that are sent to the model as native
 * file blocks. `readAsDataURL` emits single-line base64, so the stripped string
 * has no embedded newlines.
 */
export const readFileAsRawBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => {
            if (typeof reader.result === "string") {
                const base64String = reader.result.split(",")[1];
                if (base64String) {
                    resolve(base64String);
                } else {
                    reject(new Error("Failed to extract Base64 content."));
                }
            } else {
                reject(new Error("File content is not a string."));
            }
        };

        reader.onerror = () => reject(new Error("Error reading the file."));
        reader.readAsDataURL(file);
    });
};
