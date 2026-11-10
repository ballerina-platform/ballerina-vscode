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
 * A spec the user already attached, pasted or linked must be used without asking again. Anything
 * supplied that is not a usable spec must fall back to the upload card, not fail in the generator.
 */

import {
    collectThreadAttachments,
    isSupportedSpecVersion,
    specAttachments,
    urlInUserText,
    withRelativeSpecPath,
    MAX_SPEC_BYTES,
    notAnOpenApiSpec,
    readLimited,
    resolveProvidedSpec,
    SpecFetch,
} from "../features/ai/agent/tools/connector-spec-source";

const SPEC = "openapi: 3.0.3\ninfo:\n  title: Orders\n  version: 1.0.0\npaths: {}\n";
const SWAGGER_JSON = JSON.stringify({ swagger: "2.0", info: { title: "Legacy", version: "1" }, paths: {} });
const URL = "https://example.com/openapi.yaml";

const attachments = [
    { fileName: "diagram.png", content: "data:image/png;base64,AAAA", mimeType: "image/png" },
    { fileName: "notes.txt", content: "Remember to add auth." },
    { fileName: "order-api.yaml", content: SPEC },
];

const fetchReturning = (body: string, status = 200, contentType = "application/yaml"): SpecFetch =>
    jest.fn(async () => ({ ok: status >= 200 && status < 300, status, contentType, text: async () => body }));

const noFetch: SpecFetch = jest.fn(async () => { throw new Error("fetch must not be called"); });

describe("resolveProvidedSpec", () => {
    it("asks the user when no spec was supplied", async () => {
        const result = await resolveProvidedSpec({ serviceName: "Orders" }, { attachments }, noFetch);
        expect(result).toEqual({ kind: "none" });
        expect(noFetch).not.toHaveBeenCalled();
    });

    it.each([
        ["exact name", "order-api.yaml"],
        ["different case", "Order-API.yaml"],
        ["a path prefix", "/Users/someone/Downloads/order-api.yaml"],
    ])("reads an attached spec referenced by %s", async (_label, attachmentFileName) => {
        const result = await resolveProvidedSpec({ serviceName: "Orders", attachmentFileName }, { attachments }, noFetch);
        expect(result).toEqual({ kind: "resolved", spec: SPEC, source: "attachment" });
    });

    it("uses pasted spec text", async () => {
        const result = await resolveProvidedSpec({ serviceName: "Orders", specContent: SWAGGER_JSON }, {}, noFetch);
        expect(result).toEqual({ kind: "resolved", spec: SWAGGER_JSON, source: "inline" });
    });

    it("fetches a spec URL the user wrote", async () => {
        const fetchSpec = fetchReturning(SPEC);
        const result = await resolveProvidedSpec(
            { serviceName: "Orders", specUrl: ` ${URL} ` }, { userText: `Build a client from ${URL} please` }, fetchSpec);
        expect(result).toEqual({ kind: "resolved", spec: SPEC, source: "url" });
        expect(fetchSpec).toHaveBeenCalledWith(URL);
    });

    it("prefers an attachment over the other sources", async () => {
        const result = await resolveProvidedSpec(
            { serviceName: "Orders", attachmentFileName: "order-api.yaml", specContent: SWAGGER_JSON, specUrl: URL },
            { attachments, userText: URL }, noFetch);
        expect(result).toMatchObject({ kind: "resolved", source: "attachment" });
    });

    it("falls through to the next source when the attachment is missing", async () => {
        const result = await resolveProvidedSpec(
            { serviceName: "Orders", attachmentFileName: "missing.yaml", specContent: SPEC }, { attachments }, noFetch);
        expect(result).toEqual({ kind: "resolved", spec: SPEC, source: "inline" });
    });

    it("never fetches a URL the user did not write", async () => {
        const result = await resolveProvidedSpec(
            { serviceName: "Orders", specUrl: "http://169.254.169.254/latest/meta-data" },
            { userText: "Create an API using the attached definition" }, noFetch);
        expect(result.kind).toBe("unresolved");
        expect(noFetch).not.toHaveBeenCalled();
    });

    it.each([
        ["an unknown attachment", { attachmentFileName: "missing.yaml" }, noFetch],
        ["an image attachment", { attachmentFileName: "diagram.png" }, noFetch],
        ["an attachment that is not a spec", { attachmentFileName: "notes.txt" }, noFetch],
        ["pasted text that is not a spec", { specContent: "just some notes" }, noFetch],
        ["a URL that fails", { specUrl: URL }, fetchReturning("", 404)],
        ["a URL that returns an HTML page", { specUrl: URL }, fetchReturning("<html>Swagger UI</html>", 200, "text/html; charset=utf-8")],
        ["a URL that returns a JSON error", { specUrl: URL }, fetchReturning('{"error":"not found"}', 200, "application/json")],
        ["a URL that throws", { specUrl: URL },
            jest.fn(async () => { throw new Error("ECONNREFUSED"); }) as SpecFetch],
    ])("reports %s as unresolved so the user is asked instead", async (_label, input, fetchSpec) => {
        const result = await resolveProvidedSpec(
            { serviceName: "Orders", ...input }, { attachments, userText: URL }, fetchSpec);
        expect(result.kind).toBe("unresolved");
    });
});

describe("collectThreadAttachments", () => {
    it("reads a spec attached in an earlier turn, preferring the newest copy", async () => {
        const older = { fileName: "order-api.yaml", content: SPEC.replace("Orders", "Old Orders") };
        const thread = collectThreadAttachments(
            [], [{ fileAttachments: [older] }, { fileAttachments: [] }, { fileAttachments: [attachments[2]] }]);
        const result = await resolveProvidedSpec(
            { serviceName: "Orders", attachmentFileName: "order-api.yaml" }, { attachments: thread }, noFetch);
        expect(result).toEqual({ kind: "resolved", spec: SPEC, source: "attachment" });
    });

    it("puts the current turn first and drops images", () => {
        const current = { fileName: "new.yaml", content: SPEC };
        const thread = collectThreadAttachments([current, attachments[0]], [{ fileAttachments: attachments }]);
        expect(thread.map(a => a.fileName)).toEqual(["new.yaml", "notes.txt", "order-api.yaml"]);
    });
});

describe("withRelativeSpecPath", () => {
    const pkg = "/work/project/orders";
    const spec = `${pkg}/resources/specs/orders.yaml`;
    const entry = (filePath: string) =>
        `\n[[tool.openapi]]\nid = "orders"\ntargetModule = "orders"\nfilePath = "${filePath}"\n`;

    it("rewrites the spec's absolute path to one relative to the package", () => {
        expect(withRelativeSpecPath(entry(spec), pkg, spec)).toBe(entry("./resources/specs/orders.yaml"));
    });

    it("leaves other entries alone", () => {
        const other = entry("/elsewhere/other.yaml");
        expect(withRelativeSpecPath(other + entry(spec), pkg, spec))
            .toBe(other + entry("./resources/specs/orders.yaml"));
    });

    it("keeps an absolute path when the spec is outside the package", () => {
        const outside = "/work/specs/orders.yaml";
        expect(withRelativeSpecPath(entry(outside), pkg, outside)).toBe(entry(outside));
    });
});

describe("urlInUserText", () => {
    it.each([
        ["the exact URL", URL, `Use ${URL}`],
        ["a trailing slash difference", `${URL}/`, `Use ${URL}`],
        ["trailing sentence punctuation", URL, `The spec is at ${URL}.`],
        ["a URL in angle brackets", URL, `Spec: <${URL}>`],
        ["a URL in a markdown link", URL, `See [the spec](${URL})`],
    ])("accepts %s", (_label, url, text) => {
        expect(urlInUserText(url, text)).toBe(true);
    });

    it.each([
        ["a prefix of a longer host", "https://api.example.com", "Use https://api.example.com.evil.net/spec"],
        ["a prefix of a longer path", "https://example.com/spec", "Use https://example.com/spec.yaml"],
        ["a URL the user did not write", URL, "Create an API from my spec"],
        ["no user text", URL, undefined],
    ])("rejects %s", (_label, url, text) => {
        expect(urlInUserText(url, text)).toBe(false);
    });
});

describe("specAttachments", () => {
    it("keeps only attachments that are OpenAPI or Swagger specs", () => {
        const kept = specAttachments([
            ...attachments,
            { fileName: "legacy.json", content: SWAGGER_JSON },
            { fileName: "openapi-4.yaml", content: "openapi: 4.0.0\ninfo:\n  title: x" },
        ]);
        expect(kept.map(a => a.fileName)).toEqual(["order-api.yaml", "legacy.json"]);
    });
});

describe("notAnOpenApiSpec", () => {
    it.each([
        ["OpenAPI 3 YAML", SPEC],
        ["Swagger 2 JSON", SWAGGER_JSON],
        ["Swagger 2 YAML with an unquoted version, which loads as a number", "swagger: 2.0\ninfo:\n  title: x\npaths: {}"],
        ["OpenAPI 3.1", "openapi: 3.1.0\ninfo:\n  title: x\npaths: {}"],
    ])("accepts %s", (_label, text) => {
        expect(notAnOpenApiSpec(text)).toBeUndefined();
    });

    // Unsupported versions must fall back to the upload card rather than fail in the generator.
    it.each([
        ["OpenAPI 4", "openapi: 4.0.0\ninfo:\n  title: x"],
        ["Swagger 1.2", "swagger: '1.2'\ninfo:\n  title: x"],
        ["a version that only starts with 3", "openapi: '30.0'\ninfo:\n  title: x"],
    ])("rejects unsupported version %s", (_label, text) => {
        expect(notAnOpenApiSpec(text)).toMatch(/unsupported version/);
    });

    it.each([
        ["invalid YAML", "a: [unclosed"],
        ["a scalar", "hello"],
        ["an array", "- a\n- b"],
        ["an object without openapi/swagger", "info:\n  title: x"],
    ])("rejects %s", (_label, text) => {
        expect(notAnOpenApiSpec(text)).toEqual(expect.any(String));
    });
});

describe("isSupportedSpecVersion", () => {
    it.each(["3.0.3", "3.1.0", "3", "2.0", "2"])("supports %s", (version) => {
        expect(isSupportedSpecVersion(version)).toBe(true);
    });

    it.each(["4.0.0", "1.2", "30.0", "", "v3.0"])("rejects %p", (version) => {
        expect(isSupportedSpecVersion(version)).toBe(false);
    });
});

describe("readLimited", () => {
    it("reads a body within the limit", async () => {
        await expect(readLimited(new Response(SPEC))).resolves.toBe(SPEC);
    });

    it("rejects a body over the limit", async () => {
        await expect(readLimited(new Response(new Uint8Array(MAX_SPEC_BYTES + 1)))).rejects.toThrow("larger than");
    });
});
