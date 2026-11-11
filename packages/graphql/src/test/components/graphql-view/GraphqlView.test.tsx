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

// L2: typing an argument value in the Try It explorer. graphiql-explorer focuses an argument input
// and selects its text when the input mounts, so if the explorer is remounted on every edit, each
// keystroke selects the value and the next one replaces it. The explorer is rendered for real; only
// GraphiQL is stubbed (its CodeMirror editors don't run in jsdom) with a stand-in that only renders
// the visible plugin the way GraphiQL does. The query comes back through the explorer's `onEdit`;
// GraphiQL's own query editor path is not exercised here.

import React from "react";
import { createRoot, Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { buildSchema, getIntrospectionQuery, graphqlSync } from "graphql";

jest.mock("graphiql", () => ({
    __esModule: true,
    GraphiQL: ({ plugins, visiblePlugin }: any) => {
        const plugin = plugins.find((p: any) => p.title === visiblePlugin);
        const Content = plugin.content;
        const Icon = plugin.icon;
        return (
            <div>
                <Icon />
                <Content />
            </div>
        );
    },
}));

const SCHEMA = buildSchema(`
    type Query {
        book(bookId: Int!): String
    }
`);

// The view captures the VS Code API when its module loads and asks for the schema over it. The
// stub answers the introspection request the way the extension host does.
const INTROSPECTION = graphqlSync({ schema: SCHEMA, source: getIntrospectionQuery() });
(globalThis as any).acquireVsCodeApi = () => ({
    postMessage: (message: any) => {
        window.dispatchEvent(new MessageEvent("message", {
            data: { command: "graphqlResponse", id: message.id, res: INTROSPECTION },
        }));
    },
});
const { GraphqlView } = require("../../../components/graphql-view/GraphqlView");

declare global {
    var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/** Types into a React-controlled input the way the browser does: set the value, fire `input`. */
function typeInto(input: HTMLInputElement, value: string) {
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (!setValue) {
        throw new Error("HTMLInputElement has no value setter");
    }
    setValue.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("GraphqlView explorer", () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
    });

    it("keeps the argument input, and the caret, across keystrokes", async () => {
        await act(async () => {
            root.render(<GraphqlView data={{ serviceAPI: "http://localhost:9090/graphql", icons: { dark: "", light: "" } }} />);
        });
        await act(async () => undefined);

        // Tick `book`: the explorer adds it with its required argument.
        const bookCheckbox = Array.from(container.querySelectorAll("span"))
            .find((el) => el.textContent === "book");
        if (!bookCheckbox) {
            throw new Error("The explorer did not list the `book` field");
        }
        await act(async () => {
            bookCheckbox.click();
        });

        // The explorer focuses the argument input it has just added.
        const input = document.activeElement as HTMLInputElement;
        expect(input.tagName).toBe("INPUT");
        expect(container.contains(input)).toBe(true);

        await act(async () => {
            typeInto(input, "1");
        });
        input.setSelectionRange(1, 1);
        await act(async () => {
            typeInto(input, "10");
        });

        const current = Array.from(container.querySelectorAll<HTMLInputElement>("input[type='text']"))
            .find((el) => el.value === "10");
        // The same element: the edit re-rendered the explorer rather than mounting a new one.
        expect(current).toBe(input);
        expect(input.isConnected).toBe(true);
        // Not reselected on the way: the next keystroke appends instead of replacing the value.
        expect(input.selectionStart).toBe(input.selectionEnd);
    });
});
