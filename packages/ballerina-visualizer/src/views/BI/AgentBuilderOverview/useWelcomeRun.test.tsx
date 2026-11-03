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

import * as React from "react";
import { act } from "react-dom/test-utils";
import { createRoot, Root } from "react-dom/client";
import type { AgentRunState, AgentRunStatus } from "@wso2/ballerina-core";
import { RUN_START_TIMEOUT_MS, useWelcomeRun } from "./useWelcomeRun";

declare global {
    // eslint-disable-next-line no-var
    var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type Run = ReturnType<typeof useWelcomeRun>;

describe("useWelcomeRun", () => {
    let container: HTMLDivElement;
    let root: Root;
    let run: Run;
    let restored: string[];

    const status = (state: AgentRunState, generationId?: string): AgentRunStatus =>
        ({ state, generationId, aiPanelOpen: false, timestamp: 0 } as AgentRunStatus);

    function Harness({ value, panelOpen }: { value: AgentRunStatus | null; panelOpen: boolean }): null {
        run = useWelcomeRun(value, panelOpen, (prompt) => restored.push(prompt));
        return null;
    }

    const render = (value: AgentRunStatus | null, panelOpen = false) =>
        act(() => root.render(<Harness value={value} panelOpen={panelOpen} />));

    beforeEach(() => {
        jest.useFakeTimers();
        restored = [];
        container = document.createElement("div");
        root = createRoot(container);
        render(status("idle", "g0"));
    });

    afterEach(() => {
        act(() => root.unmount());
        jest.useRealTimers();
    });

    it("shows the run from the handoff until a new run takes over, then until it ends", () => {
        act(() => run.handedOff("build a greeter"));
        expect(run.showRun).toBe(true);
        render(status("running", "g1"));
        expect(run.submittedPrompt).toBeUndefined();
        expect(run.runPrompt).toBe("build a greeter");
        expect(run.showRun).toBe(true);
        render(status("idle", "g1"));
        expect(run.showRun).toBe(false);
        expect(run.runPrompt).toBeUndefined();
        expect(run.notice).toBeUndefined();
    });

    it("treats a run that started and ended between updates as taken over", () => {
        act(() => run.handedOff("hi"));
        render(status("idle", "g1"));
        expect(run.showRun).toBe(false);
        act(() => jest.advanceTimersByTime(RUN_START_TIMEOUT_MS));
        expect(run.notice).toBeUndefined();
    });

    it("restores the prompt and reports a failed run", () => {
        act(() => run.handedOff("build a greeter"));
        render(status("running", "g1"));
        render(status("error", "g1"));
        expect(run.showRun).toBe(false);
        expect(run.notice).toBe("error");
        expect(restored).toEqual(["build a greeter"]);
    });

    it("points to an unseen reply until the chat opens", () => {
        act(() => run.handedOff("hi"));
        render(status("running", "g1"));
        render(status("completed", "g1"));
        expect(run.showRun).toBe(false);
        expect(run.notice).toBe("replied");
        render(status("completed", "g1"), true);
        expect(run.notice).toBeUndefined();
    });

    it("reports a run that never started and restores the prompt", () => {
        act(() => run.handedOff("hi"));
        act(() => jest.advanceTimersByTime(RUN_START_TIMEOUT_MS));
        expect(run.showRun).toBe(false);
        expect(run.notice).toBe("start-failed");
        expect(restored).toEqual(["hi"]);
    });

    it("drops the run view when the handoff is refused", () => {
        act(() => run.handedOff("hi"));
        act(() => run.handoffFailed());
        expect(run.showRun).toBe(false);
        expect(run.runPrompt).toBeUndefined();
        act(() => jest.advanceTimersByTime(RUN_START_TIMEOUT_MS));
        expect(run.notice).toBeUndefined();
    });

    it("does not restore a prompt for a run started from the chat", () => {
        render(status("running", "g1"));
        render(status("error", "g1"));
        expect(run.notice).toBe("error");
        expect(restored).toEqual([]);
    });
});
