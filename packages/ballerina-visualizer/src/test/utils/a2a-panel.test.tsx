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

jest.mock("@wso2/bi-diagram", () => ({ NodeIcon: (props: unknown) => ({ type: "NodeIcon", props }) }), { virtual: true });
jest.mock("@wso2/ballerina-core", () => ({}), { virtual: true });
jest.mock("@wso2/ballerina-side-panel", () => ({}), { virtual: true });

import type { Category } from "@wso2/ballerina-core";
import type { Node as PanelNode } from "@wso2/ballerina-side-panel";
import { A2A_OBJECT_NODE, convertA2aCategoryToSidePanelCategory, isA2aCategory } from "../../utils/a2a-panel";

const method = (node: string, object: string, parentSymbol: string, symbol: string, label: string) => ({
    metadata: { label, description: `${label} description` },
    codedata: { node, object, parentSymbol, symbol },
    enabled: true,
});

// The parts of the language server's category that the panel reads.
const row = (item: unknown): PanelNode => {
    const { codedata, metadata, enabled } = item as ReturnType<typeof method>;
    return { id: codedata.node, label: metadata.label, enabled } as unknown as PanelNode;
};

const a2a = {
    metadata: { label: "A2A", description: "Blocks for the execute method of an A2A agent" },
    items: [
        {
            metadata: { label: "Task Updater", description: "Tell the caller how the task is going" },
            items: [
                method("A2A_TASK_UPDATE", "TaskUpdater", "updater", "working", "working"),
                method("A2A_TASK_UPDATE", "TaskUpdater", "updater", "addArtifact", "addArtifact"),
                method("METHOD_CALL", "TaskUpdater", "updater", "getTaskId", "getTaskId"),
            ],
        },
        {
            metadata: { label: "Task Store", description: "Read the tasks the agent keeps" },
            items: [method("A2A_TASK_STORE", "InMemoryTaskStore", "taskStore", "get", "get")],
        },
    ],
};

// The add-node page the section opens: one card per object, each with a row per call.
type Page = {
    title: string;
    items: { title: string; description: string; items: { id: string; label: string; icon: { props: { type: string } } }[] }[];
};
const pageOf = (node: PanelNode) => (node as unknown as { metadata: { a2aPage: Page } }).metadata.a2aPage;

describe("the A2A section of the add-node panel", () => {
    const section = convertA2aCategoryToSidePanelCategory(a2a as unknown as Category, row);
    const nodes = section.items as PanelNode[];

    it("lists the task updater and the task store as two blocks, like Model Provider", () => {
        expect(section.title).toBe("A2A");
        expect(nodes.map((i) => [i.id, i.label])).toEqual([
            [A2A_OBJECT_NODE, "Task Updater"],
            [A2A_OBJECT_NODE, "Task Store"],
        ]);
    });

    it("opens a titled page with one dropdown card, named after the variable, holding the calls", () => {
        const page = pageOf(nodes[0]);
        expect(page.title).toBe("Task Updater");
        expect(page.items).toHaveLength(1);
        expect(page.items[0].title).toBe("updater");
        expect(page.items[0].items.map((r) => r.label)).toEqual(["working", "addArtifact", "getTaskId"]);
        expect(page.items[0].items.map((r) => r.id)).toEqual(["A2A_TASK_UPDATE", "A2A_TASK_UPDATE", "METHOD_CALL"]);
    });

    it("lists the calls with the call glyph and no extra line, as the model provider page does", () => {
        const card = pageOf(nodes[0]).items[0];
        expect(card.description).toBe("");
        for (const r of card.items) {
            expect(r.icon.props.type).toBe("REMOTE_ACTION_CALL");
        }
    });

    it("names the store's card after the task store variable in scope", () => {
        expect(pageOf(nodes[1]).items[0].title).toBe("taskStore");
    });
});

describe("telling the A2A section from any other category", () => {
    it("recognises it by its label and its two sub-categories", () => {
        expect(isA2aCategory(a2a as unknown as Category)).toBe(true);
    });

    it("leaves other categories alone", () => {
        expect(isA2aCategory({ metadata: { label: "AI" }, items: a2a.items } as unknown as Category)).toBe(false);
        expect(isA2aCategory({ metadata: { label: "A2A" }, items: [method("X", "o", "p", "s", "l")] } as unknown as Category)).toBe(false);
    });
});
