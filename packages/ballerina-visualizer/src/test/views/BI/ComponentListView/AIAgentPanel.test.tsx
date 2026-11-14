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

// The WSO2 Cloud editor does not support durable agentic workflows, so the Artifacts page
// leaves that card out there while the other AI cards stay.

import * as React from "react";
import { act } from "react-dom/test-utils";
import { createRoot, Root } from "react-dom/client";
import { SCOPE } from "@wso2/ballerina-core";

// The real barrel pulls an ESM-only websocket dependency; the panel only needs these enums.
jest.mock("@wso2/ballerina-core", () => ({
    SCOPE: { ANY: "any", AI_AGENT: "ai-agent" },
    DIRECTORY_MAP: { SERVICE: "SERVICE" },
    EVENT_TYPE: { OPEN_VIEW: "OPEN_VIEW" },
    MACHINE_VIEW: {},
}));

jest.mock("@wso2/bi-diagram", () => ({ DurableAgentIcon: (): null => null }));

jest.mock("@wso2/ui-toolkit", () => ({
    __esModule: true,
    Icon: (): null => null,
    Codicon: (): null => null,
    ImageWithFallback: (): null => null,
    ProgressRing: (): null => null,
    Tooltip: ({ children }: any) => <>{children}</>,
    Typography: ({ children }: any) => <div>{children}</div>,
    ThemeColors: {},
}));

// Each card renders as a bare element carrying its id; its presence is the assertion.
jest.mock("../../../../components/ButtonCard", () => ({
    __esModule: true,
    default: ({ id }: { id: string }) => <div id={id} />,
}));

jest.mock("@wso2/ballerina-rpc-client", () => ({
    useRpcContext: () => ({ rpcClient: {} }),
}));

// artifactCards.tsx relies on the bundler's global React for its JSX.
(globalThis as any).React = React;

import { AIAgentPanel } from "../../../../views/BI/ComponentListView/AIAgentPanel";
import { AI_CHAT_AGENT_CARD, DURABLE_AGENT_CARD } from "../../../../views/BI/components/artifactCards";

declare global {
    // eslint-disable-next-line no-var
    var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

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

function renderPanel(isInDevant?: boolean, searchQuery?: string) {
    act(() => {
        root.render(
            <AIAgentPanel
                scope={SCOPE.ANY}
                triggers={{ local: [] }}
                isInDevant={isInDevant}
                searchQuery={searchQuery}
            />
        );
    });
}

const card = (id: string) => container.querySelector(`#${id}`);

describe("AIAgentPanel in the cloud editor", () => {
    it("offers the durable agentic workflow card outside the cloud editor", () => {
        renderPanel(false);
        expect(card(DURABLE_AGENT_CARD.id)).not.toBeNull();
        expect(card(AI_CHAT_AGENT_CARD.id)).not.toBeNull();
    });

    it("leaves the durable agentic workflow card out in the cloud editor, keeping the rest", () => {
        renderPanel(true);
        expect(card(DURABLE_AGENT_CARD.id)).toBeNull();
        expect(card(AI_CHAT_AGENT_CARD.id)).not.toBeNull();
    });

    it("hides the whole panel when a search matches only the durable card in the cloud editor", () => {
        renderPanel(true, DURABLE_AGENT_CARD.displayName);
        expect(container.childElementCount).toBe(0);
    });
});
