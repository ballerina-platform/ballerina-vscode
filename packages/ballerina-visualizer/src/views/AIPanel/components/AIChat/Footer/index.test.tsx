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

// L2: `hidden` must hide the footer WITHOUT unmounting it — the composer owns the draft and
// attachments as local state, and nothing on screen distinguishes hidden from unmounted.

import React from "react";
import { createRoot, Root } from "react-dom/client";
import { act } from "react-dom/test-utils";

declare global {
    var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// The core barrel pulls in ESM-only LS transport modules that jest cannot load.
jest.mock("@wso2/ballerina-core", () => ({
    __esModule: true,
    TemplateId: { Wildcard: "Wildcard" },
    // placeholderTags is keyed by Command, so the real fixture needs these to initialise.
    Command: {
        Agent: "Agent", Ask: "Ask", Compact: "Compact", Doc: "Doc", Healthcare: "Healthcare",
        NaturalProgramming: "NaturalProgramming", OpenAPI: "OpenAPI", Tests: "Tests",
        TypeCreator: "TypeCreator",
    },
}));

jest.mock("../../../commandTemplates/data/commandTemplates.const", () => ({
    __esModule: true,
    commandTemplates: {} as Record<string, unknown>,
    suggestedCommandTemplates: [] as unknown[],
}));

jest.mock("../../../commandTemplates/utils/utils", () => ({
    __esModule: true,
    getTemplateTextById: (): string => "",
}));

jest.mock("../../CodeContextCard", () => ({
    __esModule: true,
    default: (): null => null,
}));

// Reaches @wso2/ballerina-rpc-client, which ships ESM.
jest.mock("../../../../../components/AgentStatusOrb/shared", () => ({
    __esModule: true,
    Sphere: (): null => null,
    Gloss: (): null => null,
    ORB_COLORS: { running: [] as string[] },
    ORB_ENERGY: { running: 0 },
}));

jest.mock("../../AIChatInput", () => ({
    __esModule: true,
    default: React.forwardRef((): JSX.Element => <div data-testid="composer" />),
}));

import Footer from "./index";
import type { AIChatInputRef } from "../../AIChatInput";
import { placeholderTags } from "../../../commandTemplates/data/placeholderTags.const";

const noop = (): void => undefined;
const baseProps: React.ComponentProps<typeof Footer> = {
    aiChatInputRef: React.createRef<AIChatInputRef>(),
    tagOptions: {
        placeholderTags,
        loadGeneralTags: async () => [],
        injectPlaceholderTags: async () => undefined,
    },
    attachmentOptions: {
        multiple: true,
        acceptResolver: () => "",
        handleAttachmentSelection: async () => [],
    },
    inputPlaceholder: "What would you like to change?",
    onSend: async (): Promise<void> => undefined,
    onStop: noop,
    isLoading: false,
    showSuggestedCommands: false,
};

describe("Footer hidden prop", () => {
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

    const render = (hidden?: boolean) => {
        act(() => {
            root.render(<Footer {...baseProps} hidden={hidden} />);
        });
        return container.querySelector("footer") as HTMLElement;
    };

    it("keeps the composer mounted while hiding the footer", () => {
        const footer = render(true);
        expect(footer.style.display).toBe("none");
        expect(container.querySelector('[data-testid="composer"]')).not.toBeNull();
    });

    it("shows the footer when not hidden", () => {
        const footer = render(false);
        expect(footer.style.display).toBe("");
        expect(container.querySelector('[data-testid="composer"]')).not.toBeNull();
    });

    it("does not remount the composer when hidden is toggled", () => {
        render(false);
        const before = container.querySelector('[data-testid="composer"]');
        render(true);
        expect(container.querySelector('[data-testid="composer"]')).toBe(before);
    });
});
