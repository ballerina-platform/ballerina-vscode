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
 * @jest-environment node
 */

import type { CodeContext } from "@wso2/ballerina-core";
import {
    buildFullChatHandoffPrompt,
    buildMiniChatGenerationRequest,
    createMiniChatPrompt,
} from "./promptHandoff";

const CONTEXTS: CodeContext[] = [
    {
        type: "addition",
        filePath: "/workspace/main.bal",
        position: { line: 8, offset: 4 },
    },
    {
        type: "selection",
        filePath: "modules/orders.bal",
        startPosition: { line: 3, offset: 0 },
        endPosition: { line: 7, offset: 1 },
    },
];

describe.each(CONTEXTS)("mini/full chat context handoff ($type)", (codeContext) => {
    const launchPrompt = createMiniChatPrompt("", {
        planMode: true,
        autoSubmit: true,
        hiddenContext: "diagram insertion",
        codeContext,
    });

    it("passes the same context and mode to the agent request", () => {
        const request = buildMiniChatGenerationRequest(launchPrompt, "Add a validation step");

        expect(request).toMatchObject({
            usecase: "Add a validation step",
            hiddenContext: "diagram insertion",
            isPlanMode: true,
            codeContext,
            fileAttachmentContents: [],
            promptSource: "mini-chat",
        });
    });

    it("keeps the context and unsent draft when maximizing without auto-submitting", () => {
        const handoff = buildFullChatHandoffPrompt(launchPrompt, "Add a transform here");

        expect(handoff).toMatchObject({
            type: "text",
            text: "Add a transform here",
            planMode: true,
            autoSubmit: false,
            hiddenContext: "diagram insertion",
            codeContext,
        });
    });
});

it("creates an edit-mode empty prompt for an ordinary orb launch", () => {
    expect(createMiniChatPrompt()).toEqual({
        type: "text",
        text: "",
        planMode: false,
        autoSubmit: false,
    });
});

it("opens a completed review in the full chat without starting another turn", () => {
    const handoff = buildFullChatHandoffPrompt(createMiniChatPrompt("", { autoSubmit: true }), "");

    expect(handoff).toEqual({
        type: "text",
        text: "",
        planMode: false,
        autoSubmit: false,
    });
});
