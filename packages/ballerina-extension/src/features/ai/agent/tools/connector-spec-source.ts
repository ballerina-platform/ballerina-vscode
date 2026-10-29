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

/**
 * Resolves an OpenAPI spec the user has already supplied. Kept apart from connector-generator.ts,
 * which imports the language client and cannot be loaded in a unit test.
 */

import * as path from "path";
import * as yaml from "js-yaml";
import type { FileAttatchment } from "@wso2/ballerina-core";
import type { SpecFetcherInput } from "../../utils/libs/generator/openapi-types";

export type ProvidedSpecSource = "attachment" | "inline" | "url";

export type ProvidedSpecResult =
    | { kind: "none" }
    | { kind: "resolved"; spec: string; source: ProvidedSpecSource }
    | { kind: "unresolved"; reason: string };

export interface SpecFetchResponse {
    ok: boolean;
    status: number;
    contentType?: string;
    text(): Promise<string>;
}

export type SpecFetch = (url: string) => Promise<SpecFetchResponse>;

/** What the user wrote in this thread; a URL is fetched only when it appears here. */
export interface SpecContext {
    attachments?: FileAttatchment[];
    userText?: string;
}

const URL_FETCH_TIMEOUT_MS = 30000;
export const MAX_SPEC_BYTES = 10 * 1024 * 1024;

/** Reads the body as a stream and stops at MAX_SPEC_BYTES. */
export async function readLimited(response: Response): Promise<string> {
    const reader = response.body?.getReader();
    if (!reader) {
        return response.text();
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) {
            break;
        }
        total += value.byteLength;
        if (total > MAX_SPEC_BYTES) {
            await reader.cancel();
            throw new Error(`the response is larger than ${MAX_SPEC_BYTES / (1024 * 1024)} MB`);
        }
        chunks.push(value);
    }
    return Buffer.concat(chunks).toString("utf-8");
}

const defaultFetch: SpecFetch = async (url) => {
    const response = await fetch(url, { signal: AbortSignal.timeout(URL_FETCH_TIMEOUT_MS) });
    return {
        ok: response.ok,
        status: response.status,
        contentType: response.headers.get("content-type") ?? undefined,
        text: () => readLimited(response),
    };
};

/** Images and PDFs arrive as base64 data URLs, never as spec text. */
export function isTextAttachment(attachment: FileAttatchment): boolean {
    const mimeType = attachment.mimeType ?? "";
    if (mimeType.startsWith("image/") || mimeType === "application/pdf") {
        return false;
    }
    return !attachment.content.startsWith("data:");
}

export function textAttachments(attachments: FileAttatchment[] | undefined): FileAttatchment[] {
    return (attachments ?? []).filter(isTextAttachment);
}

/** The thread's attachments, newest first, so a file attached twice resolves to the latest copy. */
export function collectThreadAttachments(
    current: FileAttatchment[] | undefined,
    earlierTurns: Array<{ fileAttachments?: FileAttatchment[] }>
): FileAttatchment[] {
    const earlier = [...earlierTurns].reverse().flatMap(turn => textAttachments(turn.fileAttachments));
    return [...textAttachments(current), ...earlier];
}

/** Only spec attachments are kept on a turn; the thread file is rewritten on every save. */
export function specAttachments(attachments: FileAttatchment[] | undefined): FileAttatchment[] {
    return textAttachments(attachments).filter(attachment => notAnOpenApiSpec(attachment.content) === undefined);
}

/**
 * Rewrites the spec's absolute path in a generated `[[tool.openapi]]` entry to one relative to the
 * package, as the low-code form does, so the project still builds on another machine.
 */
export function withRelativeSpecPath(tomlText: string, packageRoot: string, specFilePath: string): string {
    const relative = path.relative(packageRoot, specFilePath).split(path.sep).join("/");
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
        return tomlText;
    }
    // The language server writes the absolute path with backslashes escaped for TOML.
    const absolute = path.resolve(specFilePath).replace(/\\/g, "\\\\");
    return tomlText.split(`"${absolute}"`).join(`"./${relative}"`);
}

function baseName(fileName: string): string {
    return fileName.split(/[\\/]/).pop() ?? fileName;
}

export function findAttachment(
    fileName: string,
    attachments: FileAttatchment[] | undefined
): FileAttatchment | undefined {
    const candidates = textAttachments(attachments);
    const wanted = baseName(fileName.trim()).toLowerCase();
    return candidates.find(a => a.fileName === fileName)
        ?? candidates.find(a => baseName(a.fileName).toLowerCase() === wanted);
}

/** The `openapi` or `swagger` version. An unquoted YAML `swagger: 2.0` loads as the number 2. */
export function specVersion(doc: Record<string, unknown>): string | undefined {
    const raw = doc.openapi ?? doc.swagger;
    if (typeof raw === "string") {
        return raw;
    }
    return typeof raw === "number" ? String(raw) : undefined;
}

/** Whether the generator supports this version: OpenAPI 3.x or Swagger 2.x. */
export function isSupportedSpecVersion(version: string): boolean {
    return /^[23](\.|$)/.test(version);
}

/** Returns why the text is not a usable OpenAPI or Swagger document, or undefined when it is one. */
export function notAnOpenApiSpec(text: string): string | undefined {
    let doc: unknown;
    try {
        doc = yaml.load(text);
    } catch {
        return "it is not valid JSON or YAML";
    }
    if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
        return "it is not a JSON or YAML object";
    }
    const version = specVersion(doc as Record<string, unknown>);
    if (version === undefined) {
        return "it has no top-level 'openapi' or 'swagger' field";
    }
    if (!isSupportedSpecVersion(version)) {
        return `it uses unsupported version ${version}; only OpenAPI 3.x and Swagger 2.x are supported`;
    }
    return undefined;
}

/** Whether the user wrote exactly this URL; a URL that is only a prefix of one they wrote does not count. */
export function urlInUserText(url: string, userText: string | undefined): boolean {
    const normalise = (value: string) => value.trim().replace(/[.,;:!?]+$/, "").replace(/\/+$/, "");
    const wanted = normalise(url);
    return (userText?.match(/https?:\/\/[^\s<>"'`()[\]]+/g) ?? []).some(written => normalise(written) === wanted);
}

/**
 * Returns the spec the user supplied: an attached file, pasted text or a URL, in that order.
 * The user is asked for one on "none" (nothing supplied) and "unresolved" (supplied but unusable).
 */
export async function resolveProvidedSpec(
    input: SpecFetcherInput,
    context: SpecContext,
    fetchSpec: SpecFetch = defaultFetch
): Promise<ProvidedSpecResult> {
    const reasons: string[] = [];

    const accept = (spec: string, source: ProvidedSpecSource, label: string): ProvidedSpecResult | undefined => {
        const problem = notAnOpenApiSpec(spec);
        if (problem) {
            reasons.push(`${label} is not an OpenAPI spec: ${problem}`);
            return undefined;
        }
        return { kind: "resolved", spec, source };
    };

    if (input.attachmentFileName?.trim()) {
        const attachment = findAttachment(input.attachmentFileName, context.attachments);
        if (attachment?.content.trim()) {
            const result = accept(attachment.content, "attachment", `attached file "${attachment.fileName}"`);
            if (result) {
                return result;
            }
        } else {
            reasons.push(`no attached file named "${input.attachmentFileName}"`);
        }
    }

    if (input.specContent?.trim()) {
        const result = accept(input.specContent, "inline", "the pasted spec");
        if (result) {
            return result;
        }
    }

    if (input.specUrl?.trim()) {
        const url = input.specUrl.trim();
        if (!urlInUserText(url, context.userText)) {
            // A URL the user did not write could point anywhere the user's machine can reach.
            reasons.push(`${url} does not appear in the user's messages`);
        } else {
            try {
                const response = await fetchSpec(url);
                if (!response.ok) {
                    reasons.push(`fetching ${url} returned HTTP ${response.status}`);
                } else if (response.contentType?.toLowerCase().includes("text/html")) {
                    reasons.push(`${url} returned an HTML page, not a spec`);
                } else {
                    const result = accept(await response.text(), "url", url);
                    if (result) {
                        return result;
                    }
                }
            } catch (error: any) {
                reasons.push(`fetching ${url} failed: ${error?.message ?? String(error)}`);
            }
        }
    }

    return reasons.length > 0 ? { kind: "unresolved", reason: reasons.join("; ") } : { kind: "none" };
}
