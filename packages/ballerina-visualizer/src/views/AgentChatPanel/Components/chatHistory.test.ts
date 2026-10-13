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

// L2 / C07 + C08: replaying a saved chat, and deciding whether an approval still blocks the
// composer. Both matter after a reload, which is the moment the panel has nothing but stored
// history to rebuild from. Getting the second one wrong is the worse failure: too strict and
// the composer is locked forever on a conversation the user already finished; too lax and
// they can type past an agent that is still waiting on them.
//
// This module imports only types, so no mocks are needed.

import { ChatMessage, ChatMessageType, isApprovalUnresolved, toChatMessage } from "./chatHistory";

const approval = (over: Partial<ChatMessage> = {}): ChatMessage => ({
    type: ChatMessageType.APPROVAL,
    text: "Approve charging the card?",
    isUser: false,
    pendingApproval: { requests: [{ id: "r1" }, { id: "r2" }] } as never,
    ...over,
});

describe("replaying stored history", () => {
    const stored = (over: Record<string, unknown> = {}) =>
        ({ type: "message", text: "hello", isUser: true, ...over }) as never;

    it.each([
        ["an error", "error", ChatMessageType.ERROR],
        ["an approval", "approval", ChatMessageType.APPROVAL],
        ["an ordinary message", "message", ChatMessageType.MESSAGE],
    ])("restores %s to its own kind", (_label, type, expected) => {
        expect(toChatMessage(stored({ type })).type).toBe(expected);
    });

    // Anything the panel does not recognise still has to render as something, and an ordinary
    // message is the only kind that is always safe to show.
    it.each([["an unknown kind", "something-new"], ["no kind at all", undefined]])(
        "falls back to an ordinary message for %s",
        (_label, type) => {
            expect(toChatMessage(stored({ type })).type).toBe(ChatMessageType.MESSAGE);
        }
    );

    it("carries the fields the panel renders", () => {
        const restored = toChatMessage(stored({
            text: "charged",
            isUser: false,
            traceId: "trace_1",
            executionSteps: [{ name: "charge" }],
        }));

        expect(restored).toMatchObject({
            text: "charged",
            isUser: false,
            traceId: "trace_1",
            executionSteps: [{ name: "charge" }],
        });
    });

    // The decisions made before the reload have to come back with the approval, or the user is
    // asked to approve the same request twice and the agent could act on it twice.
    it("carries approval state back across a reload", () => {
        const restored = toChatMessage(stored({
            type: "approval",
            pendingApproval: { requests: [{ id: "r1" }] },
            decisions: { r1: { approved: true } },
            unresolvable: true,
        }));

        expect(restored.pendingApproval).toEqual({ requests: [{ id: "r1" }] });
        expect(restored.decisions).toEqual({ r1: { approved: true } });
        expect(restored.unresolvable).toBe(true);
    });
});

describe("whether an approval still blocks the composer", () => {
    it("blocks while no request has been decided", () => {
        expect(isApprovalUnresolved(approval())).toBe(true);
    });

    // Partial decisions are the common case: two requests arrive together and the user
    // answers one. The agent is still waiting on the other.
    it("blocks while only some requests have been decided", () => {
        expect(isApprovalUnresolved(approval({ decisions: { r1: { approved: true } as never } }))).toBe(true);
    });

    it("stops blocking once every request has a decision", () => {
        const decisions = { r1: { approved: true }, r2: { approved: false } } as never;

        expect(isApprovalUnresolved(approval({ decisions }))).toBe(false);
    });

    // A denial is a decision. Treating only approvals as answered would leave the composer
    // locked after the user says no.
    it("counts a denial as decided", () => {
        expect(isApprovalUnresolved(approval({
            decisions: { r1: { approved: false }, r2: { approved: false } } as never,
        }))).toBe(false);
    });

    // The escape hatch for a batch that keeps failing to submit: dismissing it ends the block
    // even though the requests were never answered.
    it("stops blocking once the batch has been dismissed", () => {
        expect(isApprovalUnresolved(approval({ unresolvable: true }))).toBe(false);
    });

    it.each([
        ["an ordinary message", { type: ChatMessageType.MESSAGE }],
        ["an error", { type: ChatMessageType.ERROR }],
        ["an approval carrying no requests", { pendingApproval: undefined }],
    ])("never blocks on %s", (_label, over) => {
        expect(isApprovalUnresolved(approval(over as Partial<ChatMessage>))).toBe(false);
    });

    // How the panel actually uses it: any one unresolved approval anywhere in the replayed
    // history is enough to keep the composer shut.
    it("keeps the composer shut when any message in the history is unresolved", () => {
        const history = [
            approval({ decisions: { r1: { approved: true }, r2: { approved: true } } as never }),
            { type: ChatMessageType.MESSAGE, text: "thanks", isUser: true } as ChatMessage,
            approval(),
        ];

        expect(history.some(isApprovalUnresolved)).toBe(true);
    });
});
