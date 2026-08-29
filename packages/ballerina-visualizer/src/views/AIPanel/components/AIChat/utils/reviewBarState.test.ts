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
 *
 * Pure module (its only import is type-only), so no DOM is needed. Pinning `node` also keeps
 * this suite runnable while the package's default `jsdom` environment is broken in some trees.
 */

/**
 * The revert affordance used to be gated on a panel-global `hasActiveReview` flag plus list
 * position, while "reverted" was read from a `status` field the panel wrote into its own
 * transcript. Those two copies of one fact drifted: a bar could sit active for a generation the
 * extension had already accepted, or go inert while the generation was still revertible.
 *
 * Everything below pins the replacement rule — the message's own `generationStatus`, which is a
 * copy of the extension's authoritative per-generation status, decides both. So the tests are
 * mostly about *which status* produces *which decision*, and about status events that name a
 * generation this panel is not showing.
 */

import { applyGenerationStatus, deriveReviewBarState, GenerationStatus, PanelMessage } from "./reviewBarState";

const assistant = (messageId: string, generationStatus?: GenerationStatus): PanelMessage => ({
    role: "Copilot",
    content: "",
    type: "assistant_message",
    messageId,
    generationStatus,
});

const user = (messageId: string, checkpointId?: string): PanelMessage => ({
    role: "User",
    content: "do a thing",
    type: "user_message",
    messageId,
    checkpointId,
});

describe("deriveReviewBarState", () => {
    it("offers revert only while the generation is done", () => {
        const byStatus = (status: GenerationStatus | undefined) =>
            deriveReviewBarState(status, true, false);

        expect(byStatus("done")).toEqual({ isActive: true, isDiscarded: false });
        expect(byStatus("generating")).toEqual({ isActive: false, isDiscarded: false });
        expect(byStatus("accepted")).toEqual({ isActive: false, isDiscarded: false });
        expect(byStatus("error")).toEqual({ isActive: false, isDiscarded: false });
        // Absent status = a turn from before this field existed, or one still being streamed.
        expect(byStatus(undefined)).toEqual({ isActive: false, isDiscarded: false });
    });

    it("marks reverted from the status alone, wherever the turn sits", () => {
        // Not latest and mid-run: still reverted. The spent state is a property of the
        // generation, so it must survive a later turn scrolling it up the transcript.
        expect(deriveReviewBarState("reverted", false, true)).toEqual({
            isActive: false,
            isDiscarded: true,
        });
    });

    it("keeps a done turn inert once it is no longer the latest", () => {
        expect(deriveReviewBarState("done", false, false).isActive).toBe(false);
    });

    it("keeps a done turn inert while a run is in flight", () => {
        expect(deriveReviewBarState("done", true, true).isActive).toBe(false);
    });
});

describe("applyGenerationStatus", () => {
    it("applies the status to the named generation only", () => {
        const messages = [assistant("gen-1", "done"), assistant("gen-2", "done")];

        const next = applyGenerationStatus(messages, "gen-1", "reverted");

        expect(next.map((m) => m.generationStatus)).toEqual(["reverted", "done"]);
    });

    it("drops an event naming a generation the panel is not rendering", () => {
        // Thread scoping falls out of this: a generation from another thread is simply
        // not in the transcript, so its event names nothing here.
        const messages = [user("gen-1"), assistant("gen-1", "done")];

        const next = applyGenerationStatus(messages, "gen-from-another-thread", "accepted");

        expect(next).toBe(messages);
    });

    it("does not mutate the messages it is given", () => {
        const messages = [assistant("gen-1", "done")];

        applyGenerationStatus(messages, "gen-1", "accepted");

        expect(messages[0].generationStatus).toBe("done");
    });

    it("clears the bar when the next turn implicitly accepts a turn started outside the panel", () => {
        // A run launched from the mini chat or a command still lands in this transcript. The
        // extension accepts it when the following turn starts, and the only thing that reaches
        // the panel is the status event — there is no send-side hook to piggyback on.
        const messages = [user("gen-1"), assistant("gen-1", "done")];

        const accepted = applyGenerationStatus(messages, "gen-1", "accepted");

        const bar = deriveReviewBarState(accepted[1].generationStatus, true, false);
        expect(bar.isActive).toBe(false);
    });
});

describe("checkpoint restore", () => {
    it("leaves the older turn it promotes to last inert", () => {
        // Restore trims the transcript at the checkpoint, so an already-accepted turn becomes
        // the latest assistant message. Under the old position-plus-flag gate that turn could
        // light up; its status is what keeps it inert.
        const messages = [
            user("gen-1", "cp-1"),
            assistant("gen-1", "accepted"),
            user("gen-2", "cp-2"),
            assistant("gen-2", "done"),
        ];

        const trimIndex = messages.findIndex((m) => m.checkpointId === "cp-2");
        const trimmed = messages.slice(0, trimIndex);

        const last = trimmed[trimmed.length - 1];
        expect(last.messageId).toBe("gen-1");
        expect(deriveReviewBarState(last.generationStatus, true, false).isActive).toBe(false);
    });
});
