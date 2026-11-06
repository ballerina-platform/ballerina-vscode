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

jest.mock("@wso2/bi-diagram", () => ({ NodeIcon: (props: any) => ({ type: "NodeIcon", props }) }), { virtual: true });
jest.mock("@wso2/ballerina-core", () => ({}), { virtual: true });
jest.mock("@wso2/ballerina-side-panel", () => ({}), { virtual: true });

import { A2A_OBJECT_NODE, convertA2aCategoryToSidePanelCategory, isA2aCategory } from "./a2a-panel";

const row = (item: any) => ({ id: item.codedata.node, label: item.metadata.label, enabled: item.enabled } as any);

const method = (node: string, object: string, parentSymbol: string, symbol: string, label: string) => ({
    metadata: { label, description: `${label} description` },
    codedata: { node, object, parentSymbol, symbol },
    enabled: true,
});

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

describe("the A2A section of the add-node panel", () => {
    const section = convertA2aCategoryToSidePanelCategory(a2a as any, row);

    it("lists the task updater and the task store as two blocks, like Model Provider", () => {
        expect(section.title).toBe("A2A");
        expect(section.items.map((i: any) => [i.id, i.label])).toEqual([
            [A2A_OBJECT_NODE, "Task Updater"],
            [A2A_OBJECT_NODE, "Task Store"],
        ]);
    });

    it("opens a titled page with one dropdown card, named after the variable, holding the calls", () => {
        const updater: any = section.items[0];
        const page = updater.metadata.a2aPage;
        expect(page.title).toBe("Task Updater");
        expect(page.items).toHaveLength(1);
        expect(page.items[0].title).toBe("updater");
        expect(page.items[0].items.map((r: any) => r.label)).toEqual(["working", "addArtifact", "getTaskId"]);
        expect(page.items[0].items.map((r: any) => r.id)).toEqual(["A2A_TASK_UPDATE", "A2A_TASK_UPDATE", "METHOD_CALL"]);
    });

    it("lists the calls with the call glyph and no extra line, as the model provider page does", () => {
        const card = (section.items[0] as any).metadata.a2aPage.items[0];
        expect(card.description).toBe("");
        for (const r of card.items) {
            expect(r.icon.props.type).toBe("REMOTE_ACTION_CALL");
        }
    });

    it("names the store's card after the task store variable in scope", () => {
        const store: any = section.items[1];
        expect(store.metadata.a2aPage.items[0].title).toBe("taskStore");
    });
});

describe("telling the A2A section from any other category", () => {
    it("recognises it by its label and its two sub-categories", () => {
        expect(isA2aCategory(a2a as any)).toBe(true);
    });

    it("leaves other categories alone", () => {
        expect(isA2aCategory({ metadata: { label: "AI" }, items: a2a.items } as any)).toBe(false);
        expect(isA2aCategory({ metadata: { label: "A2A" }, items: [method("X", "o", "p", "s", "l")] } as any)).toBe(false);
    });
});
