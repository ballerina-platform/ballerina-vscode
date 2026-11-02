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

// L3 (headless host) — the `selectAttachmentFiles` RPC behind Copilot's Attach button
// (`rpc-managers/ai-panel/attachment-picker`). `window.showOpenDialog` is stubbed to answer
// as the user would; `workspace.fs` reads a real temp dir. Covers the folder the picker
// opens in (including a remote workspace), cancellation, the per-file and total size
// limits, a selection mixing readable and unreadable files, the text fallback for unlisted
// files, and the encoded content. The real
// `@wso2/ballerina-core` barrel pulls in a WebSocket LS client jest cannot load, so only
// the enum this module uses is stubbed.

jest.mock("@wso2/ballerina-core", () => ({
    AttachmentStatus: {
        Success: "Success",
        FileSizeExceeded: "FileSizeExceeded",
        UnsupportedFileFormat: "UnsupportedFileFormat",
        UnknownError: "UnknownError",
    },
}));

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
// The module jest maps `vscode` to, imported by path so the stubs tests reassign stay mutable.
import { Uri, window, workspace } from "./__mocks__/vscode";
import { AttachmentStatus, SelectAttachmentFilesRequest } from "@wso2/ballerina-core";
import { resolveAttachmentStartUri, selectAttachmentFiles } from "../rpc-managers/ai-panel/attachment-picker";

type DialogOptions = { canSelectMany?: boolean; defaultUri?: { fsPath: string }; filters?: unknown };

const request = (overrides: Partial<SelectAttachmentFilesRequest> = {}): SelectAttachmentFilesRequest => ({
    canSelectMany: true,
    maxFileSize: 10,
    maxTotalSize: 15,
    fileTypes: { txt: "text/plain", png: "image/png", pdf: "application/pdf" },
    acceptOtherText: false,
    encoding: "native",
    ...overrides,
});

const text = (name: string, content: string) =>
    ({ name, content, mimeType: "text/plain", status: AttachmentStatus.Success });

describe("resolveAttachmentStartUri", () => {
    afterEach(() => {
        workspace.workspaceFolders = [];
    });

    it("opens the first workspace folder when there is no project path", () => {
        const folder = Uri.file("/ws");
        workspace.workspaceFolders = [{ uri: folder }];
        expect(resolveAttachmentStartUri(undefined)).toBe(folder as unknown);
    });

    it("keeps the remote scheme of the workspace folder that owns the project", () => {
        const remote = { fsPath: "/home/me/ws", path: "/home/me/ws", scheme: "vscode-remote", toString: () => "remote" };
        workspace.workspaceFolders = [{ uri: Uri.file("/other") }, { uri: remote }];

        const uri = resolveAttachmentStartUri(path.join("/home/me/ws", "pkg", "sub")) as unknown as typeof remote;

        expect(uri.scheme).toBe("vscode-remote");
        expect(uri.fsPath).toBe(path.join("/home/me/ws", "pkg", "sub"));
    });

    it("returns the folder itself when the project is the workspace folder", () => {
        const folder = Uri.file("/ws");
        workspace.workspaceFolders = [{ uri: folder }];
        expect(resolveAttachmentStartUri("/ws")).toBe(folder as unknown);
    });

    it("falls back to a file URI for a project outside every workspace folder", () => {
        workspace.workspaceFolders = [{ uri: Uri.file("/ws") }];
        const uri = resolveAttachmentStartUri("/elsewhere/pkg") as unknown as { scheme: string; fsPath: string };
        expect(uri).toMatchObject({ scheme: "file", fsPath: "/elsewhere/pkg" });
    });
});

describe("selectAttachmentFiles", () => {
    let dir: string;
    let dialogOptions: DialogOptions;
    const originalShowOpenDialog = window.showOpenDialog;

    const write = (name: string, content: string | Uint8Array) => {
        fs.writeFileSync(path.join(dir, name), content);
        return Uri.file(path.join(dir, name));
    };
    const answerDialogWith = (uris: { fsPath: string }[] | undefined) => {
        window.showOpenDialog = async (options?: DialogOptions) => {
            dialogOptions = options;
            return uris;
        };
    };

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "attachment-picker-"));
        dialogOptions = undefined;
        jest.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() => {
        window.showOpenDialog = originalShowOpenDialog;
        fs.rmSync(dir, { recursive: true, force: true });
        jest.restoreAllMocks();
    });

    it("filters the picker by the allow-list, adds All Files for the text fallback, and offers everything with neither", async () => {
        answerDialogWith(undefined);

        await selectAttachmentFiles(request(), dir);
        expect(dialogOptions).toMatchObject({ canSelectMany: true, filters: { "Supported Files": ["txt", "png", "pdf"] } });
        expect(dialogOptions.defaultUri.fsPath).toBe(dir);

        await selectAttachmentFiles(request({ acceptOtherText: true }), dir);
        expect(dialogOptions.filters).toEqual({ "Supported Files": ["txt", "png", "pdf"], "All Files": ["*"] });

        await selectAttachmentFiles(request({ fileTypes: {}, canSelectMany: false }), dir);
        expect(dialogOptions).toMatchObject({ canSelectMany: false, filters: undefined });
    });

    it("returns nothing when the user cancels the picker", async () => {
        answerDialogWith(undefined);
        await expect(selectAttachmentFiles(request(), dir)).resolves.toEqual([]);
    });

    it("rejects an oversized file without reading it", async () => {
        const big = write("big.txt", "x".repeat(11));
        const readFile = jest.spyOn(workspace.fs, "readFile");
        answerDialogWith([big]);

        await expect(selectAttachmentFiles(request(), dir)).resolves.toEqual([
            { name: "big.txt", status: AttachmentStatus.FileSizeExceeded },
        ]);
        expect(readFile).not.toHaveBeenCalled();
    });

    it("rejects files past the total budget, in selection order", async () => {
        const a = write("a.txt", "12345678");
        const b = write("b.txt", "12345678");
        const c = write("c.txt", "1234567");
        answerDialogWith([a, b, c]);

        // a (8) fits; b would make 16 > 15; c (7) still fits next to a.
        await expect(selectAttachmentFiles(request(), dir)).resolves.toEqual([
            text("a.txt", "12345678"),
            { name: "b.txt", status: AttachmentStatus.FileSizeExceeded },
            text("c.txt", "1234567"),
        ]);
    });

    it("reports an unreadable file and still returns the readable ones", async () => {
        const ok = write("ok.txt", "hello");
        const missing = Uri.file(path.join(dir, "missing.txt"));
        answerDialogWith([missing, ok]);

        await expect(selectAttachmentFiles(request(), dir)).resolves.toEqual([
            { name: "missing.txt", status: AttachmentStatus.UnknownError },
            text("ok.txt", "hello"),
        ]);
    });

    const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47]);
    const PDF = Buffer.from("%PDF-");
    const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");
    it.each([
        ["native", "note.txt", Buffer.from("hi"), "text/plain", "hi"],
        ["native", "pic.png", PNG, "image/png", `data:image/png;base64,${b64(PNG)}`],
        ["native", "doc.pdf", PDF, "application/pdf", b64(PDF)],
        ["base64", "note.txt", Buffer.from("hi"), "text/plain", b64(Buffer.from("hi"))],
        ["base64", "pic.png", PNG, "image/png", b64(PNG)],
        ["base64", "doc.pdf", PDF, "application/pdf", b64(PDF)],
    ] as const)("with %s encoding returns %s in its final form", async (encoding, name, bytes, mimeType, content) => {
        answerDialogWith([write(name, bytes)]);

        await expect(selectAttachmentFiles(request({ encoding }), dir)).resolves.toEqual([
            { name, content, mimeType, status: AttachmentStatus.Success },
        ]);
    });

    it("rejects an unlisted file without reading it when there is no text fallback", async () => {
        const schema = write("order.xsd", "<xs:schema/>");
        const readFile = jest.spyOn(workspace.fs, "readFile");
        answerDialogWith([schema]);

        await expect(selectAttachmentFiles(request(), dir)).resolves.toEqual([
            { name: "order.xsd", status: AttachmentStatus.UnsupportedFileFormat },
        ]);
        expect(readFile).not.toHaveBeenCalled();
    });

    it("attaches unlisted text files, extensionless ones included, as text and rejects binary ones", async () => {
        const schema = write("order.xsd", "<xs:schema/>");
        const dockerfile = write("Dockerfile", "FROM x");
        const nul = write("blob.bin", Uint8Array.from([0x41, 0x00, 0x42]));
        const notUtf8 = write("latin1.dat", Uint8Array.from([0xff, 0xfe, 0x41]));
        answerDialogWith([schema, dockerfile, nul, notUtf8]);

        await expect(selectAttachmentFiles(request({ acceptOtherText: true, maxFileSize: 100, maxTotalSize: 100 }), dir)).resolves.toEqual([
            text("order.xsd", "<xs:schema/>"),
            text("Dockerfile", "FROM x"),
            { name: "blob.bin", status: AttachmentStatus.UnsupportedFileFormat },
            { name: "latin1.dat", status: AttachmentStatus.UnsupportedFileFormat },
        ]);
    });
});
