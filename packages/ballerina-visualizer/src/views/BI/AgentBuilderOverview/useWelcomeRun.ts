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

import { useEffect, useRef, useState } from "react";
import type { AgentRunState, AgentRunStatus } from "@wso2/ballerina-core";

export const RUN_START_TIMEOUT_MS = 10000;

export type RunNotice = "start-failed" | "replied" | "error";

const isActive = (state: AgentRunState) => state === "running" || state === "awaiting-input";

/** Tracks a prompt handed off from this screen and what its run leaves behind once it ends. */
export function useWelcomeRun(status: AgentRunStatus | null, aiPanelOpen: boolean, restorePrompt: (prompt: string) => void) {
    const state = status?.state ?? "idle";
    const generationId = status?.generationId;
    const active = isActive(state);
    const [submittedPrompt, setSubmittedPrompt] = useState<string>();
    const [runPrompt, setRunPrompt] = useState<string>();
    const [notice, setNotice] = useState<RunNotice>();
    const handoffGenerationRef = useRef<string>();
    const lastPromptRef = useRef<string>();
    const prevStateRef = useRef(state);
    const prevPanelOpenRef = useRef(aiPanelOpen);

    // Keyed on the run, not the state: a fast run can start and end between two status updates.
    useEffect(() => {
        if (submittedPrompt === undefined) {
            return;
        }
        if (generationId !== handoffGenerationRef.current) {
            setSubmittedPrompt(undefined);
            return;
        }
        const timer = setTimeout(() => {
            setSubmittedPrompt(undefined);
            setRunPrompt(undefined);
            restorePrompt(submittedPrompt);
            setNotice("start-failed");
        }, RUN_START_TIMEOUT_MS);
        return () => clearTimeout(timer);
    }, [generationId, submittedPrompt]);

    useEffect(() => {
        const previous = prevStateRef.current;
        prevStateRef.current = state;
        if (state === previous) {
            return;
        }
        if (active) {
            setNotice(undefined);
            return;
        }
        if (state === "error") {
            setNotice("error");
            if (lastPromptRef.current) {
                restorePrompt(lastPromptRef.current);
            }
        } else if (state === "completed") {
            setNotice("replied");
        }
        lastPromptRef.current = undefined;
        setRunPrompt(undefined);
    }, [state]);

    useEffect(() => {
        if (aiPanelOpen && !prevPanelOpenRef.current) {
            setNotice((current) => (current === "replied" ? undefined : current));
        }
        prevPanelOpenRef.current = aiPanelOpen;
    }, [aiPanelOpen]);

    const handedOff = (prompt: string) => {
        handoffGenerationRef.current = generationId;
        lastPromptRef.current = prompt;
        setSubmittedPrompt(prompt);
        setRunPrompt(prompt);
    };

    const handoffFailed = () => {
        lastPromptRef.current = undefined;
        setSubmittedPrompt(undefined);
        setRunPrompt(undefined);
    };

    return {
        state,
        active,
        submittedPrompt,
        runPrompt,
        notice,
        clearNotice: () => setNotice(undefined),
        handedOff,
        handoffFailed,
        showRun: active || submittedPrompt !== undefined,
    };
}
