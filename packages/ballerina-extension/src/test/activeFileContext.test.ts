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

import {
    resetCompanionSurface,
    resolveActiveFilePath,
    setCompanionTextEditor,
    setCompanionVisualizer,
} from "../views/ai-panel/activeFileContext";
import { formatActiveFileReminder } from "../features/ai/agent/activeFileReminder";

const WORKSPACE_ROOT = "/workspace";
const PROJECT_ROOT = "/workspace/orders";

function editor(filePath: string, languageId: string, scheme = "file") {
    return {
        document: {
            languageId,
            uri: {
                scheme,
                fsPath: filePath,
            },
        },
    };
}

beforeEach(() => {
    resetCompanionSurface();
});

describe("active Ballerina file resolution", () => {
    it("uses the visualizer file for mini chat and makes it workspace-relative", () => {
        expect(resolveActiveFilePath(
            "mini-chat",
            "/workspace/orders/main.bal",
            WORKSPACE_ROOT,
            PROJECT_ROOT,
        )).toBe("orders/main.bal");
    });

    it("uses the visualizer file remembered beside the full AI panel", () => {
        setCompanionVisualizer();

        expect(resolveActiveFilePath(
            "ai-panel",
            "/workspace/orders/service.bal",
            WORKSPACE_ROOT,
            PROJECT_ROOT,
        )).toBe("orders/service.bal");
    });

    it("uses the exact active Ballerina editor beside the full AI panel", () => {
        setCompanionTextEditor(editor("/workspace/orders/modules/inventory.bal", "ballerina"));

        expect(resolveActiveFilePath(
            "ai-panel",
            "/workspace/orders/other.bal",
            WORKSPACE_ROOT,
            PROJECT_ROOT,
        )).toBe("orders/modules/inventory.bal");
    });

    it("supports a single-file project whose project path is the source file", () => {
        setCompanionTextEditor(editor("/workspace/main.bal", "ballerina"));

        expect(resolveActiveFilePath(
            "ai-panel",
            undefined,
            undefined,
            "/workspace/main.bal",
        )).toBe("main.bal");
    });

    it.each([
        ["TOML", editor("/workspace/orders/Config.toml", "toml")],
        ["Markdown", editor("/workspace/orders/README.md", "markdown")],
        ["wrong language", editor("/workspace/orders/main.bal", "plaintext")],
        ["non-file URI", editor("/workspace/orders/main.bal", "ballerina", "untitled")],
    ])("does not inherit an older Ballerina file for a %s editor", (_label, unsupportedEditor) => {
        setCompanionTextEditor(editor("/workspace/orders/main.bal", "ballerina"));
        setCompanionTextEditor(unsupportedEditor);

        expect(resolveActiveFilePath(
            "ai-panel",
            "/workspace/orders/visualizer.bal",
            WORKSPACE_ROOT,
            PROJECT_ROOT,
        )).toBeUndefined();
    });

    it("rejects a Ballerina file outside the active workspace", () => {
        setCompanionTextEditor(editor("/other-project/main.bal", "ballerina"));

        expect(resolveActiveFilePath(
            "ai-panel",
            undefined,
            WORKSPACE_ROOT,
            PROJECT_ROOT,
        )).toBeUndefined();
    });

    it("does not add ambient context for non-chat agent callers", () => {
        setCompanionTextEditor(editor("/workspace/orders/main.bal", "ballerina"));

        expect(resolveActiveFilePath(
            undefined,
            "/workspace/orders/visualizer.bal",
            WORKSPACE_ROOT,
            PROJECT_ROOT,
        )).toBeUndefined();
    });
});

describe("active file system reminder", () => {
    it("describes the current file as likely rather than exclusive context", () => {
        expect(formatActiveFileReminder("orders/main.bal")).toBe(`<system-reminder>
The user is currently viewing the Ballerina source file "orders/main.bal". Treat this file as likely context for the request, but do not assume changes must be limited to it.
</system-reminder>`);
    });

    it("omits the reminder when there is no supported active file", () => {
        expect(formatActiveFileReminder()).toBe("");
    });

    it("escapes path text inside the reminder", () => {
        expect(formatActiveFileReminder("modules/<orders>&billing.bal")).toContain(
            "modules/&lt;orders&gt;&amp;billing.bal",
        );
    });
});
