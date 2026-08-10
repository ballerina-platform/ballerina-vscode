/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styled from "@emotion/styled";
import { ChatNotify, MigrationProgressEvent } from "@wso2/ballerina-core";
import { useBiWsContext } from "../wsManager/WsClientContext";
import AgentStreamView from "../../AIPanel/components/AgentStreamView";
import type { StreamEntry, StreamItem } from "../../AIPanel/components/AgentStreamView";

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

type EnhancementStatus = "checking_auth" | "sign_in_required" | "signing_in" | "running" | "paused" | "completed" | "error" | "aborted";

type LoginMethod = "none" | "sso" | "anthropic" | "aws" | "vertex";

// ──────────────────────────────────────────────────────────────────────────────
// Stream entry helpers
// ──────────────────────────────────────────────────────────────────────────────

function appendToLastEntry(entries: StreamEntry[], item: StreamItem): StreamEntry[] {
    if (entries.length === 0) {
        return [{ description: "", items: [item] }];
    }
    const last = entries[entries.length - 1];
    return [...entries.slice(0, -1), { ...last, items: [...last.items, item] }];
}

function mergeTextToLastEntry(entries: StreamEntry[], text: string): StreamEntry[] {
    if (entries.length === 0) {
        return [{ description: "", items: [{ kind: "text", text }] }];
    }
    const last = entries[entries.length - 1];
    const lastItem = last.items[last.items.length - 1];
    if (lastItem?.kind === "text") {
        const updatedItems = [...last.items.slice(0, -1), { ...lastItem, text: lastItem.text + text }];
        return [...entries.slice(0, -1), { ...last, items: updatedItems }];
    }
    return [...entries.slice(0, -1), { ...last, items: [...last.items, { kind: "text" as const, text }] }];
}

function replaceLastTextInLastEntry(entries: StreamEntry[], newText: string): StreamEntry[] {
    if (entries.length === 0) {
        return [{ description: "", items: [{ kind: "text", text: newText }] }];
    }
    const last = entries[entries.length - 1];
    let lastTextIdx = -1;
    for (let i = last.items.length - 1; i >= 0; i--) {
        if (last.items[i].kind === "text") { lastTextIdx = i; break; }
    }
    if (lastTextIdx === -1) {
        return [...entries.slice(0, -1), { ...last, items: [...last.items, { kind: "text" as const, text: newText }] }];
    }
    const updatedItems = last.items.map((item, i) => i === lastTextIdx ? { kind: "text" as const, text: newText } : item);
    return [...entries.slice(0, -1), { ...last, items: updatedItems }];
}

function replaceToolCallInEntries(entries: StreamEntry[], resultItem: StreamItem & { kind: "tool_result" }): StreamEntry[] {
    let matched = false;
    const updated = entries.map(entry => {
        if (matched) return entry;
        const idx = entry.items.findIndex(i => i.kind === "tool_call" && i.toolCallId === resultItem.toolCallId);
        if (idx === -1) return entry;
        matched = true;
        return { ...entry, items: entry.items.map((item, i) => i === idx ? resultItem : item) };
    });
    if (!matched) {
        return appendToLastEntry(entries, resultItem);
    }
    return updated;
}

function applyTaskWriteResult(entries: StreamEntry[], toolOutput: any): StreamEntry[] {
    const tasks: Array<{ status: string; description: string }> = toolOutput?.tasks ?? [];
    const inProgressTask = tasks.find(t => t.status === "in_progress");
    const lastCompletedTask = [...tasks].reverse().find(t => t.status === "completed");

    if (inProgressTask) {
        if (entries.some(e => e.description === inProgressTask.description && e.status === "in_progress")) return entries;
        return [...entries, { description: inProgressTask.description, items: [], status: "in_progress" as const }];
    }
    let updated = entries;
    if (lastCompletedTask) {
        let done = false;
        updated = entries.map(e => {
            if (!done && e.description === lastCompletedTask.description && e.status === "in_progress") {
                done = true;
                return { ...e, status: "completed" as const };
            }
            return e;
        });
    }
    const lastEntry = updated[updated.length - 1];
    if (!lastEntry || lastEntry.description !== "") {
        updated = [...updated, { description: "", items: [] }];
    }
    return updated;
}

// ──────────────────────────────────────────────────────────────────────────────
// Styled Components
// ──────────────────────────────────────────────────────────────────────────────

const Container = styled.div`
    display: flex;
    flex-direction: column;
    gap: 16px;
    width: 100%;
`;

const HeaderRow = styled.div`
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    font-size: 13px;
    font-weight: 600;
    color: var(--vscode-editor-foreground);
`;

const StatusText = styled.span<{ variant?: "success" | "error" | "running" }>`
    font-size: 12px;
    font-weight: 500;
    color: ${(props: { variant?: string }) => {
        switch (props.variant) {
            case "success":
                return "var(--vscode-testing-iconPassed)";
            case "error":
                return "var(--vscode-errorForeground)";
            default:
                return "var(--vscode-descriptionForeground)";
        }
    }};
`;

const StreamArea = styled.div`
    flex: 1;
    max-height: 60vh;
    overflow-y: auto;
    padding: 12px;
    border: 1px solid var(--vscode-panel-border);
    border-radius: 6px;
    background-color: var(--vscode-editor-background);
    font-size: 13px;
    line-height: 1.6;
`;

const ButtonRow = styled.div`
    display: flex;
    gap: 8px;
    align-items: center;
    justify-content: flex-end;
`;

const ActionButton = styled.button<{ variant?: "primary" | "secondary" }>`
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 6px 14px;
    border-radius: 3px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    border: 1px solid
        ${(props: { variant?: string }) =>
        props.variant === "secondary"
            ? "var(--vscode-button-secondaryBackground)"
            : "var(--vscode-button-background)"};
    background-color: ${(props: { variant?: string }) =>
        props.variant === "secondary"
            ? "var(--vscode-button-secondaryBackground)"
            : "var(--vscode-button-background)"};
    color: ${(props: { variant?: string }) =>
        props.variant === "secondary"
            ? "var(--vscode-button-secondaryForeground)"
            : "var(--vscode-button-foreground)"};

    &:hover {
        opacity: 0.85;
    }

    &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
`;

const SpinnerIcon = styled.span`
    display: inline-block;
    animation: spin 1s linear infinite;
    @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }
`;

const SubText = styled.span`
    font-size: 11px;
    font-weight: 400;
    color: var(--vscode-descriptionForeground);
    margin-top: 1px;
`;

const SignInPanel = styled.div`
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px;
    border: 1px solid var(--vscode-panel-border);
    border-radius: 6px;
    background-color: var(--vscode-editor-background);
`;

const SignInMessage = styled.p`
    margin: 0;
    font-size: 12px;
    color: var(--vscode-editor-foreground);
    line-height: 1.5;
`;

const SignInErrorText = styled.p`
    margin: 0;
    font-size: 11px;
    color: var(--vscode-errorForeground);
`;

const ErrorMessageBox = styled.div`
    margin-top: 4px;
    padding: 6px 10px;
    border-radius: 4px;
    border-left: 3px solid var(--vscode-errorForeground);
    background-color: var(--vscode-inputValidation-errorBackground, rgba(255,0,0,0.08));
    font-size: 12px;
    color: var(--vscode-errorForeground);
    word-break: break-word;
`;

const ProgressRow = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
`;

const ProgressTrack = styled.div`
    flex: 1;
    height: 5px;
    border-radius: 3px;
    background-color: var(--vscode-progressBar-background, rgba(128,128,128,0.2));
    overflow: hidden;
`;

const ProgressFill = styled.div<{ pct: number }>`
    height: 100%;
    border-radius: 3px;
    width: ${(p: { pct: number }) => p.pct}%;
    background-color: var(--vscode-charts-blue);
    transition: width 0.4s ease;
`;

const ProgressLabel = styled.span`
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    color: var(--vscode-descriptionForeground);
    flex-shrink: 0;
    min-width: 30px;
    text-align: right;
`;

const ContextRow = styled.div`
    font-size: 13px;
    color: var(--vscode-descriptionForeground);
    display: flex;
    align-items: center;
    gap: 6px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
`;

const ContextSeparator = styled.span`
    opacity: 0.4;
`;

const SignInDivider = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--vscode-descriptionForeground);
    font-size: 11px;
    &::before, &::after {
        content: "";
        flex: 1;
        height: 1px;
        background: var(--vscode-panel-border);
    }
`;

const TextLinkButton = styled.button`
    background: none;
    border: none;
    padding: 0;
    font-size: 12px;
    color: var(--vscode-textLink-foreground);
    cursor: pointer;
    text-align: left;
    text-decoration: underline;
    &:hover {
        color: var(--vscode-textLink-activeForeground);
    }
`;

const CredentialForm = styled.div`
    display: flex;
    flex-direction: column;
    gap: 10px;
`;

const CredentialInput = styled.input`
    width: 100%;
    padding: 5px 8px;
    border: 1px solid var(--vscode-input-border);
    border-radius: 3px;
    background-color: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    font-size: 12px;
    box-sizing: border-box;
    &::placeholder {
        color: var(--vscode-input-placeholderForeground);
    }
    &:focus {
        outline: 1px solid var(--vscode-focusBorder);
        border-color: var(--vscode-focusBorder);
    }
`;

// Multi-line variant for pasted PEM keys — a single-line <input> silently strips
// the newlines a PEM private key depends on.
const CredentialTextArea = styled.textarea`
    width: 100%;
    padding: 5px 8px;
    border: 1px solid var(--vscode-input-border);
    border-radius: 3px;
    background-color: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 12px;
    box-sizing: border-box;
    resize: vertical;
    min-height: 72px;
    &::placeholder {
        color: var(--vscode-input-placeholderForeground);
    }
    &:focus {
        outline: 1px solid var(--vscode-focusBorder);
        border-color: var(--vscode-focusBorder);
    }
`;

const CredentialLabel = styled.label`
    display: block;
    font-size: 11px;
    color: var(--vscode-foreground);
    margin-bottom: 2px;
`;

// ──────────────────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────────────────

interface WizardAIEnhancementViewProps {
    projectCount: number;
    isMultiProject: boolean;
    onFinish: () => void;
}

export function WizardAIEnhancementView({ projectCount, isMultiProject, onFinish }: WizardAIEnhancementViewProps) {
    const { wsClient } = useBiWsContext();
    const scrollRef = useRef<HTMLDivElement>(null);
    const enhancementTriggered = useRef(false);

    const [status, setStatus] = useState<EnhancementStatus>("checking_auth");
    const [entries, setEntries] = useState<StreamEntry[]>([{ description: "", items: [] }]);
    const [elapsed, setElapsed] = useState(0);
    const [signInError, setSignInError] = useState<string | undefined>();
    const [errorMessage, setErrorMessage] = useState<string | undefined>();
    const [progress, setProgress] = useState<MigrationProgressEvent | null>(null);
    const [loginMethod, setLoginMethod] = useState<LoginMethod>("none");

    // Anthropic credentials
    const [anthropicApiKey, setAnthropicApiKey] = useState("");
    // AWS Bedrock credentials
    const [awsAccessKeyId, setAwsAccessKeyId] = useState("");
    const [awsSecretAccessKey, setAwsSecretAccessKey] = useState("");
    const [awsRegion, setAwsRegion] = useState("");
    const [awsSessionToken, setAwsSessionToken] = useState("");
    // Vertex AI credentials
    const [vertexProjectId, setVertexProjectId] = useState("");
    const [vertexLocation, setVertexLocation] = useState("");
    const [vertexClientEmail, setVertexClientEmail] = useState("");
    const [vertexPrivateKey, setVertexPrivateKey] = useState("");

    const terminalRef = useRef(false);
    const userPausedRef = useRef(false);
    // Accumulates total elapsed seconds across multiple run segments (pause/resume cycles)
    const accumulatedRef = useRef(0);
    const segmentStartRef = useRef<number | null>(null);

    // ── Uptime counter ──────────────────────────────────────────────────────
    useEffect(() => {
        if (status !== "running") {
            return;
        }
        segmentStartRef.current = Date.now();
        const id = setInterval(() => {
            const segmentElapsed = segmentStartRef.current
                ? Math.floor((Date.now() - segmentStartRef.current) / 1000)
                : 0;
            setElapsed(accumulatedRef.current + segmentElapsed);
        }, 1000);
        return () => {
            clearInterval(id);
            if (segmentStartRef.current) {
                accumulatedRef.current += Math.floor((Date.now() - segmentStartRef.current) / 1000);
                segmentStartRef.current = null;
            }
        };
    }, [status]);

    function formatElapsed(seconds: number): string {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        if (h > 0) {
            return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
        }
        return `${m}:${String(s).padStart(2, "0")}`;
    }

    // ── Chat event handler ──────────────────────────────────────────────────
    const handleChatEvent = useCallback(
        (event: ChatNotify) => {
            if (event.type === "start") {
                terminalRef.current = false;
                setStatus("running");
                // Entries are NOT reset — all stages accumulate for full history
                return;
            }

            if (terminalRef.current) {
                return;
            }

            switch (event.type) {

                case "content_block":
                    if (event.content) {
                        setEntries(prev => mergeTextToLastEntry(prev, event.content));
                    }
                    break;

                case "content_replace":
                    setEntries(prev => replaceLastTextInLastEntry(prev, event.content));
                    break;

                case "tool_call": {
                    const newItem: StreamItem = {
                        kind: "tool_call",
                        toolCallId: event.toolCallId,
                        toolName: event.toolName,
                        toolInput: event.toolInput,
                    };
                    setEntries(prev => appendToLastEntry(prev, newItem));
                    break;
                }

                case "tool_result": {
                    if (event.toolName === "TaskWrite") {
                        // Replace the orphan tool_call left in the floating entry (applyTaskWriteResult
                        // creates a named entry but never replaces the original call item).
                        const taskResultItem: StreamItem = {
                            kind: "tool_result",
                            toolCallId: event.toolCallId,
                            toolName: event.toolName,
                            toolOutput: event.toolOutput,
                        };
                        setEntries(prev => {
                            const withResult = replaceToolCallInEntries(prev, taskResultItem as StreamItem & { kind: "tool_result" });
                            return applyTaskWriteResult(withResult, event.toolOutput);
                        });
                    } else {
                        setEntries(prev => {
                            // For tools whose result shape omits path info, inject it
                            // from the original tool_call so display helpers can show it.
                            let toolOutput = event.toolOutput;
                            if (event.toolName === "migration_source_read") {
                                for (const entry of prev) {
                                    const orig = entry.items.find(i => i.kind === "tool_call" && i.toolCallId === event.toolCallId) as (StreamItem & { kind: "tool_call" }) | undefined;
                                    if (orig?.toolInput?.file_path) {
                                        toolOutput = { ...toolOutput, file_path: orig.toolInput.file_path };
                                        break;
                                    }
                                }
                            }
                            if (event.toolName === "migration_source_list") {
                                for (const entry of prev) {
                                    const orig = entry.items.find(i => i.kind === "tool_call" && i.toolCallId === event.toolCallId) as (StreamItem & { kind: "tool_call" }) | undefined;
                                    if (orig?.toolInput?.directory_path !== undefined) {
                                        toolOutput = { ...toolOutput, directory_path: orig.toolInput.directory_path };
                                        break;
                                    }
                                }
                            }
                            const resultItem: StreamItem = {
                                kind: "tool_result",
                                toolCallId: event.toolCallId,
                                toolName: event.toolName,
                                toolOutput,
                                failed: event.failed,
                            };
                            return replaceToolCallInEntries(prev, resultItem as StreamItem & { kind: "tool_result" });
                        });
                    }
                    break;
                }

                case "stop":
                    terminalRef.current = true;
                    setStatus("completed");
                    break;

                case "error": {
                    const errorMsg = event.content ?? "An unexpected error occurred.";
                    setEntries(prev => appendToLastEntry(prev, { kind: "text", text: `**Error:** ${errorMsg}` }));
                    setErrorMessage(errorMsg);
                    terminalRef.current = true;
                    setStatus("error");
                    break;
                }

                case "abort":
                    terminalRef.current = true;
                    // Only mark as aborted if the user didn't pause manually.
                    if (!userPausedRef.current) {
                        setStatus("aborted");
                    }
                    break;

                case "migration_progress":
                    setProgress(event);
                    break;

                default:
                    break;
            }
        },
        []
    );

    // ── Subscribe to streaming events ───────────────────────────────────────
    useEffect(() => {
        const cleanup = wsClient.onChatNotify((event: ChatNotify) => {
            handleChatEvent(event);
        });
        return cleanup;
    }, [wsClient, handleChatEvent]);

    // ── Trigger the agent ───────────────────────────────────────────────────
    useEffect(() => {
        if (enhancementTriggered.current) {
            return;
        }
        enhancementTriggered.current = true;

        wsClient.checkAIAuth()
            .then((isAuthenticated) => {
                if (isAuthenticated) {
                    setStatus("running");
                    return wsClient.wizardEnhancementReady();
                } else {
                    setStatus("sign_in_required");
                }
            })
            .catch((err: unknown) => {
                console.error("[WizardAIEnhancementView] checkAIAuth failed:", err);
                setStatus("error");
            });
    }, [wsClient]);

    // ── Auto-scroll (pauses when user scrolls up; resumes once back at bottom) ─
    const isUserScrolledUpRef = useRef(false);

    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        const onScroll = () => {
            const threshold = 60;
            const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - threshold;
            isUserScrolledUpRef.current = !atBottom;
        };
        el.addEventListener("scroll", onScroll, { passive: true });
        return () => el.removeEventListener("scroll", onScroll);
    }, []);

    useEffect(() => {
        if (!isUserScrolledUpRef.current) {
            scrollRef.current?.scrollTo({
                top: scrollRef.current.scrollHeight,
                behavior: "smooth",
            });
        }
    }, [entries]);

    // ── Actions ─────────────────────────────────────────────────────────────
    const handleOpenProject = useCallback(() => {
        wsClient.openMigratedProject().catch((err: unknown) => {
            console.error("[WizardAIEnhancementView] openMigratedProject failed:", err);
        });
    }, [wsClient]);

    const handlePause = useCallback(() => {
        userPausedRef.current = true;
        setStatus("paused");
        wsClient.abortMigrationAgent().catch(() => { /* best effort */ });
    }, [wsClient]);

    const handleResume = useCallback(() => {
        userPausedRef.current = false;
        terminalRef.current = false;
        setStatus("running");
        wsClient.wizardEnhancementReady().catch((err: unknown) => {
            console.error("[WizardAIEnhancementView] wizardEnhancementReady (resume) failed:", err);
            userPausedRef.current = true;
            setStatus("paused");
        });
    }, [wsClient]);

    const handleDone = useCallback(() => {
        onFinish();
    }, [onFinish]);

    const handleSignIn = useCallback(() => {
        setSignInError(undefined);
        setLoginMethod("sso");
        setStatus("signing_in");
        wsClient.triggerAICopilotSignIn()
            .then((result) => {
                if (result.success) {
                    setStatus("running");
                    return wsClient.wizardEnhancementReady();
                } else {
                    setSignInError(result.error || "Sign-in was cancelled. Please try again.");
                    setStatus("sign_in_required");
                    setLoginMethod("none");
                }
            })
            .catch(() => {
                setSignInError("Sign-in failed. Please try again.");
                setStatus("sign_in_required");
                setLoginMethod("none");
            });
    }, [wsClient]);

    const handleAnthropicSubmit = useCallback(() => {
        if (!anthropicApiKey.trim()) { return; }
        setSignInError(undefined);
        setStatus("signing_in");
        wsClient.triggerAnthropicKeySignIn({ apiKey: anthropicApiKey.trim() })
            .then((result) => {
                if (result.success) {
                    setStatus("running");
                    return wsClient.wizardEnhancementReady();
                } else {
                    setSignInError(result.error || "Authentication failed. Please check your API key.");
                    setStatus("sign_in_required");
                }
            })
            .catch(() => {
                setSignInError("Authentication failed. Please try again.");
                setStatus("sign_in_required");
            });
    }, [wsClient, anthropicApiKey]);

    const handleAwsBedrockSubmit = useCallback(() => {
        if (!awsAccessKeyId.trim() || !awsSecretAccessKey.trim() || !awsRegion.trim()) { return; }
        setSignInError(undefined);
        setStatus("signing_in");
        wsClient.triggerAwsBedrockSignIn({
            accessKeyId: awsAccessKeyId.trim(),
            secretAccessKey: awsSecretAccessKey.trim(),
            region: awsRegion.trim(),
            ...(awsSessionToken.trim() ? { sessionToken: awsSessionToken.trim() } : {}),
        })
            .then((result) => {
                if (result.success) {
                    setStatus("running");
                    return wsClient.wizardEnhancementReady();
                } else {
                    setSignInError(result.error || "Authentication failed. Please check your AWS credentials.");
                    setStatus("sign_in_required");
                }
            })
            .catch(() => {
                setSignInError("Authentication failed. Please try again.");
                setStatus("sign_in_required");
            });
    }, [wsClient, awsAccessKeyId, awsSecretAccessKey, awsRegion, awsSessionToken]);

    const handleVertexAiSubmit = useCallback(() => {
        if (!vertexProjectId.trim() || !vertexLocation.trim() || !vertexClientEmail.trim() || !vertexPrivateKey.trim()) { return; }
        setSignInError(undefined);
        setStatus("signing_in");
        wsClient.triggerVertexAiSignIn({
            projectId: vertexProjectId.trim(),
            location: vertexLocation.trim(),
            clientEmail: vertexClientEmail.trim(),
            privateKey: vertexPrivateKey.trim(),
        })
            .then((result) => {
                if (result.success) {
                    setStatus("running");
                    return wsClient.wizardEnhancementReady();
                } else {
                    setSignInError(result.error || "Authentication failed. Please check your Google Vertex AI credentials.");
                    setStatus("sign_in_required");
                }
            })
            .catch(() => {
                setSignInError("Authentication failed. Please try again.");
                setStatus("sign_in_required");
            });
    }, [wsClient, vertexProjectId, vertexLocation, vertexClientEmail, vertexPrivateKey]);

    // ── Render ───────────────────────────────────────────────────────────────
    const isRunning = status === "running";
    const isPaused = status === "paused";
    const isAuthPhase = status === "checking_auth" || status === "sign_in_required" || status === "signing_in";
    const openProjectDisabled = projectCount > 15;
    const hasStreamContent = entries.some(e => e.items.length > 0 || !!e.description);
    const isDone = status === "completed" || status === "error" || status === "aborted";

    const pct = useMemo(() => {
        if (status === "completed") return 100;
        if (!progress) return 0;
        const { completedStagesOverall, totalStagesOverall } = progress;
        if (totalStagesOverall === 0) return 0;
        return Math.min(99, Math.round((completedStagesOverall / totalStagesOverall) * 100));
    }, [progress, status]);

    const showProgress = !isAuthPhase && status !== "aborted" && (isRunning || isPaused || isDone);

    const contextText = useMemo(() => {
        if (status === "completed") return "All stages complete";
        if (!progress) return null;
        const stageLabel = `Stage ${progress.currentStageIndex + 1}/${progress.totalStagesInPackage}: ${progress.currentStageName}`;
        if (progress.totalPackages <= 1 || !progress.currentPackageName) return stageLabel;
        const pkgLabel = `Package ${progress.currentPackageIndex + 1}/${progress.totalPackages}: ${progress.currentPackageName}`;
        return `${pkgLabel}  •  ${stageLabel}`;
    }, [progress, status]);

    return (
        <Container>
            <HeaderRow>
                {status === "checking_auth" && (
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <SpinnerIcon className="codicon codicon-sync" />
                        <StatusText variant="running">Checking authentication…</StatusText>
                    </div>
                )}
                {status === "sign_in_required" && (
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span className="codicon codicon-account" />
                        <StatusText>Sign in required</StatusText>
                    </div>
                )}
                {status === "signing_in" && (
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <SpinnerIcon className="codicon codicon-sync" />
                        <StatusText variant="running">Signing in…</StatusText>
                    </div>
                )}
                {isRunning && (
                    <>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <SpinnerIcon className="codicon codicon-sync" />
                            <StatusText variant="running">AI enhancement in progress…</StatusText>
                            <span style={{ fontSize: "11px", color: "var(--vscode-descriptionForeground)", fontVariantNumeric: "tabular-nums" }}>
                                [{formatElapsed(elapsed)}]
                            </span>
                        </div>
                        <SubText>This may take a while.</SubText>
                    </>
                )}
                {status === "completed" && (
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span className="codicon codicon-check" style={{ color: "var(--vscode-testing-iconPassed)" }} />
                        <StatusText variant="success">AI Enhancement completed</StatusText>
                    </div>
                )}
                {status === "error" && (
                    <>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <span className="codicon codicon-error" style={{ color: "var(--vscode-errorForeground)" }} />
                            <StatusText variant="error">AI Enhancement encountered an error</StatusText>
                        </div>
                        {errorMessage && <ErrorMessageBox>{errorMessage}</ErrorMessageBox>}
                    </>
                )}
                {status === "aborted" && (
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span className="codicon codicon-circle-slash" />
                        <StatusText>AI Enhancement was skipped</StatusText>
                    </div>
                )}
                {isPaused && (
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span className="codicon codicon-debug-pause" style={{ color: "var(--vscode-descriptionForeground)" }} />
                        <StatusText>AI Enhancement paused</StatusText>
                        <span style={{ fontSize: "11px", color: "var(--vscode-descriptionForeground)", fontVariantNumeric: "tabular-nums" }}>
                            [{formatElapsed(elapsed)}]
                        </span>
                    </div>
                )}
            </HeaderRow>

            {status === "sign_in_required" && (
                <SignInPanel>
                    {signInError && <SignInErrorText>{signInError}</SignInErrorText>}

                    {loginMethod === "none" && (
                        <>
                            <SignInMessage>
                                Sign in to use AI Enhancement. Choose one of the options below.
                            </SignInMessage>
                            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                                <div style={{ display: "flex", gap: "8px" }}>
                                    <ActionButton variant="primary" onClick={handleSignIn}>
                                        <span className="codicon codicon-account" />
                                        Login using WSO2 Integration Platform
                                    </ActionButton>
                                    <ActionButton variant="secondary" onClick={onFinish}>
                                        Skip and Done
                                    </ActionButton>
                                </div>
                                <SignInDivider>or</SignInDivider>
                                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                                    <TextLinkButton onClick={() => { setLoginMethod("anthropic"); setSignInError(undefined); }}>
                                        Enter your Anthropic API key
                                    </TextLinkButton>
                                    <TextLinkButton onClick={() => { setLoginMethod("aws"); setSignInError(undefined); }}>
                                        Enter your AWS Bedrock credentials
                                    </TextLinkButton>
                                    <TextLinkButton onClick={() => { setLoginMethod("vertex"); setSignInError(undefined); }}>
                                        Enter your Google Vertex AI credentials
                                    </TextLinkButton>
                                </div>
                            </div>
                        </>
                    )}

                    {loginMethod === "anthropic" && (
                        <>
                            <SignInMessage>Enter your Anthropic API key:</SignInMessage>
                            <CredentialForm>
                                <div>
                                    <CredentialLabel htmlFor="anthropic-api-key">Anthropic API Key</CredentialLabel>
                                    <CredentialInput
                                        id="anthropic-api-key"
                                        type="password"
                                        placeholder="sk-ant-..."
                                        value={anthropicApiKey}
                                        onChange={(e) => setAnthropicApiKey(e.target.value)}
                                        onKeyDown={(e) => e.key === "Enter" && handleAnthropicSubmit()}
                                    />
                                </div>
                                <div style={{ display: "flex", gap: "8px" }}>
                                    <ActionButton variant="primary" onClick={handleAnthropicSubmit} disabled={!anthropicApiKey.trim()}>
                                        Submit
                                    </ActionButton>
                                    <ActionButton variant="secondary" onClick={() => { setLoginMethod("none"); setSignInError(undefined); }}>
                                        Back
                                    </ActionButton>
                                </div>
                            </CredentialForm>
                        </>
                    )}

                    {loginMethod === "aws" && (
                        <>
                            <SignInMessage>Enter your AWS Bedrock credentials:</SignInMessage>
                            <CredentialForm>
                                <div>
                                    <CredentialLabel htmlFor="aws-access-key-id">Access Key ID</CredentialLabel>
                                    <CredentialInput
                                        id="aws-access-key-id"
                                        type="text"
                                        placeholder="AKIAIOSFODNN7EXAMPLE"
                                        value={awsAccessKeyId}
                                        onChange={(e) => setAwsAccessKeyId(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <CredentialLabel htmlFor="aws-secret-access-key">Secret Access Key</CredentialLabel>
                                    <CredentialInput
                                        id="aws-secret-access-key"
                                        type="password"
                                        placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
                                        value={awsSecretAccessKey}
                                        onChange={(e) => setAwsSecretAccessKey(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <CredentialLabel htmlFor="aws-region">Region</CredentialLabel>
                                    <CredentialInput
                                        id="aws-region"
                                        type="text"
                                        placeholder="us-east-1"
                                        value={awsRegion}
                                        onChange={(e) => setAwsRegion(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <CredentialLabel htmlFor="aws-session-token">Session Token (optional)</CredentialLabel>
                                    <CredentialInput
                                        id="aws-session-token"
                                        type="password"
                                        placeholder="Temporary session token"
                                        value={awsSessionToken}
                                        onChange={(e) => setAwsSessionToken(e.target.value)}
                                    />
                                </div>
                                <div style={{ display: "flex", gap: "8px" }}>
                                    <ActionButton variant="primary" onClick={handleAwsBedrockSubmit} disabled={!awsAccessKeyId.trim() || !awsSecretAccessKey.trim() || !awsRegion.trim()}>
                                        Submit
                                    </ActionButton>
                                    <ActionButton variant="secondary" onClick={() => { setLoginMethod("none"); setSignInError(undefined); }}>
                                        Back
                                    </ActionButton>
                                </div>
                            </CredentialForm>
                        </>
                    )}

                    {loginMethod === "vertex" && (
                        <>
                            <SignInMessage>Enter your Google Vertex AI credentials:</SignInMessage>
                            <CredentialForm>
                                <div>
                                    <CredentialLabel htmlFor="vertex-project-id">Project ID</CredentialLabel>
                                    <CredentialInput
                                        id="vertex-project-id"
                                        type="text"
                                        placeholder="my-gcp-project"
                                        value={vertexProjectId}
                                        onChange={(e) => setVertexProjectId(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <CredentialLabel htmlFor="vertex-location">Location</CredentialLabel>
                                    <CredentialInput
                                        id="vertex-location"
                                        type="text"
                                        placeholder="us-central1"
                                        value={vertexLocation}
                                        onChange={(e) => setVertexLocation(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <CredentialLabel htmlFor="vertex-client-email">Client Email</CredentialLabel>
                                    <CredentialInput
                                        id="vertex-client-email"
                                        type="text"
                                        placeholder="service-account@project.iam.gserviceaccount.com"
                                        value={vertexClientEmail}
                                        onChange={(e) => setVertexClientEmail(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <CredentialLabel htmlFor="vertex-private-key">Private Key</CredentialLabel>
                                    <CredentialTextArea
                                        id="vertex-private-key"
                                        rows={4}
                                        placeholder="-----BEGIN PRIVATE KEY-----"
                                        value={vertexPrivateKey}
                                        onChange={(e) => setVertexPrivateKey(e.target.value)}
                                    />
                                </div>
                                <div style={{ display: "flex", gap: "8px" }}>
                                    <ActionButton variant="primary" onClick={handleVertexAiSubmit} disabled={!vertexProjectId.trim() || !vertexLocation.trim() || !vertexClientEmail.trim() || !vertexPrivateKey.trim()}>
                                        Submit
                                    </ActionButton>
                                    <ActionButton variant="secondary" onClick={() => { setLoginMethod("none"); setSignInError(undefined); }}>
                                        Back
                                    </ActionButton>
                                </div>
                            </CredentialForm>
                        </>
                    )}
                </SignInPanel>
            )}

            {status === "signing_in" && (
                <SignInPanel>
                    <SignInMessage>
                        {loginMethod === "sso" || loginMethod === "none"
                            ? "Complete sign-in in the browser window that opened. Return here when done."
                            : "Authenticating with your credentials…"}
                    </SignInMessage>
                </SignInPanel>
            )}

            {showProgress && (
                <>
                    <ProgressRow>
                        <ProgressTrack>
                            <ProgressFill pct={pct} />
                        </ProgressTrack>
                        <ProgressLabel>{pct}%</ProgressLabel>
                    </ProgressRow>
                    {contextText && (
                        <ContextRow>
                            {progress?.totalPackages && progress.totalPackages > 1 && progress.currentPackageName ? (
                                <>
                                    <span className="codicon codicon-package" style={{ fontSize: "13px" }} />
                                    <span>{`Package ${progress.currentPackageIndex + 1}/${progress.totalPackages}: ${progress.currentPackageName}`}</span>
                                    <ContextSeparator>•</ContextSeparator>
                                    <span>{`Stage ${progress.currentStageIndex + 1}/${progress.totalStagesInPackage}: ${progress.currentStageName}`}</span>
                                </>
                            ) : (
                                <>
                                    <span className="codicon codicon-layers" style={{ fontSize: "13px" }} />
                                    <span>{contextText}</span>
                                </>
                            )}
                        </ContextRow>
                    )}
                </>
            )}

            {!isAuthPhase && (
                <StreamArea ref={scrollRef}>
                    <AgentStreamView stream={entries} isLoading={isRunning} />
                    {isRunning && !hasStreamContent && (
                        <StatusText variant="running">Starting AI enhancement agent…</StatusText>
                    )}
                </StreamArea>
            )}

            {!isAuthPhase && <ButtonRow>
                {isRunning && (
                    <ActionButton variant="primary" onClick={handlePause}>
                        Pause
                    </ActionButton>
                )}
                {isPaused && (
                    <ActionButton variant="primary" onClick={handleResume}>
                        Resume
                    </ActionButton>
                )}

                {/* Open Project — disabled while running (agent active), guarded by project count when paused/done */}
                <span
                    style={{ display: "inline-block" }}
                    title={
                        isRunning
                            ? "AI enhancement is in progress. Pause first to open the project."
                            : openProjectDisabled
                                ? `Opening ${projectCount} projects simultaneously may cause the editor to become unresponsive. Navigate to the destination path to open them manually.`
                                : undefined
                    }
                >
                    <ActionButton
                        variant="secondary"
                        onClick={handleOpenProject}
                        disabled={isRunning || openProjectDisabled}
                    >
                        {isMultiProject ? "Open Workspace" : "Open Project"}
                    </ActionButton>
                </span>
                {/* Done — always visible like Open Project, disabled while running */}
                <span
                    style={{ display: "inline-block" }}
                    title={isRunning ? "AI enhancement is in progress. Pause first." : undefined}
                >
                    <ActionButton
                        variant={isPaused || isRunning ? "secondary" : "primary"}
                        onClick={handleDone}
                        disabled={isRunning}
                    >
                        Done
                    </ActionButton>
                </span>
            </ButtonRow>}
        </Container>
    );
}
