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

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

jest.mock("../rpc-managers/ai-panel/utils", () => ({ addToIntegration: jest.fn() }));
jest.mock("../rpc-managers/diagram-validity", () => ({ recordAiTouchedFile: jest.fn() }));
jest.mock("../features/ai/utils/project/ls-schema-notifications", () => ({ seedNewPackageBaseline: jest.fn() }));

import { createEditExecute, createMultiEditExecute, createReadExecute, createReadTool, createWriteExecute } from "../features/ai/agent/tools/text-editor";

let root: string;
let read: ReturnType<typeof createReadExecute>;

function lines(count: number, width = 1): string {
    return Array.from({ length: count }, (_, i) => `${i + 1}`.padEnd(width, "x")).join("\n");
}

function contentOf(message: string): string[] {
    return message.split("\nContent:")[1].split("\n");
}

beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "file-read-limits-"));
    read = createReadExecute(jest.fn(), root);
});

afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
});

describe("file_read limits", () => {
    it("tells the chat row which lines a partial read returned", async () => {
        fs.writeFileSync(path.join(root, "main.bal"), lines(3000));
        const events: any[] = [];
        const readWithEvents = createReadExecute((event: any) => events.push(event), root);
        await readWithEvents({ file_path: "main.bal", offset: 280, limit: 41 });
        expect(events.at(-1).toolOutput).toMatchObject({ fileName: "main.bal", startLine: 280, endLine: 320 });
        await readWithEvents({ file_path: "main.bal" });
        expect(events.at(-1).toolOutput).toMatchObject({ startLine: 1, endLine: 2000 });
        fs.writeFileSync(path.join(root, "small.bal"), lines(10));
        await readWithEvents({ file_path: "small.bal" });
        expect(events.at(-1).toolOutput.startLine).toBeUndefined();
    });

    it("accepts any number for offset and limit and rounds fractions down", async () => {
        fs.writeFileSync(path.join(root, "main.bal"), lines(10));
        const schema = (createReadTool(read) as any).inputSchema;
        expect(schema.safeParse({ file_path: "main.bal", offset: 0, limit: 2.5 }).success).toBe(true);
        expect(contentOf((await read({ file_path: "main.bal", offset: 2.9, limit: 2.5 })).message)).toEqual(["2", "3"]);
        expect((await read({ file_path: "main.bal", offset: 0 })).message).toMatch(/Invalid offset 0/);
    });

    it("reads a short file whole", async () => {
        fs.writeFileSync(path.join(root, "main.bal"), lines(10));
        const result = await read({ file_path: "main.bal" });
        expect(result.success).toBe(true);
        expect(result.message).toContain("Read entire file 'main.bal' (10 lines).");
        expect(contentOf(result.message)).toHaveLength(10);
    });

    it("caps a long file at 2,000 lines and says where to continue", async () => {
        fs.writeFileSync(path.join(root, "big.bal"), lines(3000));
        const result = await read({ file_path: "big.bal" });
        expect(result.success).toBe(true);
        expect(contentOf(result.message)).toHaveLength(2000);
        expect(result.message).toContain("[Showing lines 1-2000 of 3000.");
        expect(result.message).toContain("offset=2001");
    });

    it("caps a read at 80,000 characters", async () => {
        fs.writeFileSync(path.join(root, "wide.bal"), lines(500, 1000));
        const result = await read({ file_path: "wide.bal" });
        const body = contentOf(result.message);
        expect(body.join("\n").length).toBeLessThanOrEqual(80_000);
        expect(body.length).toBeLessThan(500);
        expect(result.message).toContain(`offset=${body.length + 1}`);
    });

    it("applies offset alone, limit alone, and clamps a large limit", async () => {
        fs.writeFileSync(path.join(root, "big.bal"), lines(3000));

        const fromOffset = await read({ file_path: "big.bal", offset: 2500 });
        expect(contentOf(fromOffset.message)[0]).toBe("2500");
        expect(contentOf(fromOffset.message)).toHaveLength(501);
        expect(fromOffset.message).not.toContain("[Showing");

        const fromLimit = await read({ file_path: "big.bal", limit: 5 });
        expect(contentOf(fromLimit.message)).toEqual(["1", "2", "3", "4", "5"]);
        expect(fromLimit.message).not.toContain("[Showing");

        const clamped = await read({ file_path: "big.bal", offset: 10, limit: 5000 });
        expect(contentOf(clamped.message)).toHaveLength(2000);
        expect(clamped.message).toContain("offset=2010");
    });

    it("rejects an offset past the end", async () => {
        fs.writeFileSync(path.join(root, "main.bal"), lines(3));
        const result = await read({ file_path: "main.bal", offset: 9 });
        expect(result.success).toBe(false);
        expect(result.message).toContain("Invalid offset 9");
    });

    it("blocks Config.toml and hidden files", async () => {
        fs.writeFileSync(path.join(root, "Config.toml"), "secret = 1");
        fs.mkdirSync(path.join(root, ".wso2"));
        fs.writeFileSync(path.join(root, ".wso2", "mcp.json"), "{}");
        for (const file_path of ["Config.toml", "tests/Config.toml", ".wso2/mcp.json"]) {
            const result = await read({ file_path });
            expect(result.success).toBe(false);
            expect(result.message).toContain("not permitted");
        }
    });

    it("still reads project skills", async () => {
        fs.mkdirSync(path.join(root, ".agents", "skills", "x"), { recursive: true });
        fs.writeFileSync(path.join(root, ".agents", "skills", "x", "SKILL.md"), "# Skill");
        const result = await read({ file_path: ".agents/skills/x/SKILL.md" });
        expect(result.success).toBe(true);
    });

});

describe("file_edit and file_write follow the same file rule", () => {
    it("does not edit or show a file the agent may not read", async () => {
        fs.writeFileSync(path.join(root, "Config.toml"), "apiKey = \"SECRET\"");
        fs.mkdirSync(path.join(root, ".wso2"));
        fs.writeFileSync(path.join(root, ".wso2", "mcp.json"), "{\"token\":\"SECRET\"}");
        const edit = createEditExecute(jest.fn(), root);
        const batchEdit = createMultiEditExecute(jest.fn(), root);
        const results = [
            await edit({ file_path: "Config.toml", old_string: "zzz", new_string: "y" }),
            await batchEdit({ file_path: ".wso2/mcp.json", edits: [{ old_string: "zzz", new_string: "y" }] }),
        ];
        for (const result of results) {
            expect(result.success).toBe(false);
            expect(result.message).toContain("not permitted");
            expect(result.message).not.toContain("SECRET");
        }
    });

    it("does not overwrite Config.toml", async () => {
        fs.writeFileSync(path.join(root, "Config.toml"), "apiKey = \"SECRET\"");
        const result = await createWriteExecute(jest.fn(), root)({ file_path: "Config.toml", content: "x = 1", overwrite: true });
        expect(result.success).toBe(false);
        expect(fs.readFileSync(path.join(root, "Config.toml"), "utf8")).toBe("apiKey = \"SECRET\"");
    });

    it("does not write a new file through a symlinked folder that leads out of the project", async () => {
        const outside = fs.mkdtempSync(path.join(os.tmpdir(), "file-write-outside-"));
        try {
            fs.symlinkSync(outside, path.join(root, "linkdir"));
            fs.symlinkSync(path.join(outside, "missing.bal"), path.join(root, "ghost.bal"));
            const write = createWriteExecute(jest.fn(), root);
            for (const file_path of ["linkdir/new/x.bal", "ghost.bal"]) {
                const result = await write({ file_path, content: "int x = 1;" });
                expect(result.success).toBe(false);
                expect(result.message).toContain("not permitted");
            }
            expect(fs.readdirSync(outside)).toEqual([]);
        } finally {
            fs.rmSync(outside, { recursive: true, force: true });
        }
    });
});
