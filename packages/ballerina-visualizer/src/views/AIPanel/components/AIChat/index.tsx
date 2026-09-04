/**
 * Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
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

import React, { useCallback, useEffect, useRef, useState } from "react";
import styled from "@emotion/styled";
import {
    SourceFile,
    LLMDiagnostics,
    DiagnosticEntry,
    AIPanelPrompt,
    Command,
    TemplateId,
    ChatNotify,
    FollowupSuggestion,
    DocumentationGeneratorIntermediaryState,
    OperationType,
    DocGenerationRequest,
    DocGenerationType,
    FileChanges,
    CodeContext,
    ApprovalOverlayState,
    WebToolToggle,
    LoginMethod,
    RunningServiceInfo,
    ThreadSummary,
} from "@wso2/ballerina-core";

import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { Button, Codicon, Icon, Tooltip } from "@wso2/ui-toolkit";

import { AIChatInputRef } from "../AIChatInput";
import ToolCallSegment from "../ToolCallSegment";
import ToolCallGroupSegment, { ToolCallItem } from "../ToolCallGroupSegment";
import TryItScenariosSegment from "../TryItScenariosSegment";
import TodoSection from "../TodoSection";
import AgentStreamView from "../AgentStreamView";
import { StreamEntry, StreamItem } from "../AgentStreamView/types";
import { getToolCallDisplay } from "../AgentStreamView/toolDisplay";
import { ConnectorGeneratorSegment } from "../ConnectorGeneratorSegment";
import { ConfigurationCollectorSegment } from "../ConfigurationCollectorSegment";
import CheckpointSeparator from "../CheckpointSeparator";
import FollowupSuggestions from "../FollowupSuggestions";
import { Attachment, AttachmentStatus, SkillEnableStage, SkillEntry, TaskApprovalRequest } from "@wso2/ballerina-core";
import type { ClarifyEvent, ConfigurationCollectionEvent, ConnectorGenerationNotification } from "@wso2/ballerina-core";

import { AIChatView, Header, HeaderButtons, ChatMessage, TurnGroup, AuthProviderChip, UsageBadge, UsageRefreshButton, ApprovalOverlay, OverlayMessage, OverlayCloseButton } from "../../styles";
import { SessionHistoryDropdown } from "../SessionHistory";
import ReferenceDropdown from "../ReferenceDropdown";
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react";
import MarkdownRenderer from "../MarkdownRenderer";
import { CodeSection } from "../CodeSection";
import ErrorBox from "../ErrorBox";
import { Input, parseInput, stringifyInputArrayWithBadges } from "../AIChatInput/utils/inputUtils";
import { commandTemplates, NATURAL_PROGRAMMING_TEMPLATES } from "../../commandTemplates/data/commandTemplates.const";
import { placeholderTags } from "../../commandTemplates/data/placeholderTags.const";
import {
    getTemplateById,
    getTemplateTextById,
    removeTemplate,
    upsertTemplate,
} from "../../commandTemplates/utils/utils";
import { acceptResolver, handleAttachmentSelection } from "../../utils/attachment/attachmentManager";
import { SYSTEM_ERROR_SECRET } from "../AIChatInput/constants";
import { CodeSegment } from "../CodeSegment";
import AttachmentBox, { AttachmentsContainer } from "../AttachmentBox";
import Footer from "./Footer";
import { AgentMode } from "../AIChatInput/ModeToggle";
import CommonApprovalFooter from "./Footer/CommonApprovalFooter";
import ClarifyFooter from "./Footer/ClarifyFooter";
import { useFooterLogic } from "./Footer/useFooterLogic";
import { SettingsPanel } from "../../SettingsPanel";
import { McpManagerPanel } from "../../McpManagerPanel";

export type { PanelRoute } from "./utils/panelNav";
import WelcomeMessage from "./Welcome";
import { getOnboardingOpens, incrementOnboardingOpens, convertToUIMessages, isContainsSyntaxError } from "./utils/utils";
import { applyGenerationStatus, deriveReviewBarState, PanelMessage } from "./utils/reviewBarState";
import { backTooltipFor, PanelRoute } from "./utils/panelNav";
import {
    serializeStream, parseStream, appendToLastEntry, upsertComponent, upsertRequestCard,
    buildRequestCardData, buildPlanItem, applyPlanApprovalResolution, appendAbortMarker, applyTaskWriteResult,
    COMPACTION_DISABLED_NOTICE,
} from "./utils/streamSerialization";

import FeedbackBar from "./../FeedbackBar";
import QuotaRequestDialog from "./../QuotaRequestDialog";
import { useFeedback } from "./utils/useFeedback";
import { SegmentType, splitContent } from "./segment";
import { MigrationContextCard } from "../MigrationContextCard";
import { ActiveMigrationSession } from "@wso2/ballerina-rpc-client";
import { ReviewBar } from "../ReviewBar";
import SkillsManager from "../SkillsManager";
import { MAX_CONTEXT_WINDOW } from "./compaction/ContextUsageWidget";

const NO_DRIFT_FOUND = "No drift identified between the code and the documentation.";
const DRIFT_CHECK_ERROR = "Failed to check drift between the code and the documentation. Please try again.";

const USAGE_EXCEEDED_THRESHOLD_PERCENT = 3;
const QUOTA_CONTACT_EMAIL = "support@wso2.com";

//TODO: Add better error handling from backend. stream error type and non 200 status codes

const MessageBody = styled.div<{ isUserMessage: boolean }>(({ isUserMessage }: { isUserMessage: boolean }) => ({
    display: "flex",
    flexDirection: "column",
    width: isUserMessage ? "fit-content" : "100%",
    maxWidth: isUserMessage ? "85%" : "100%",
    marginLeft: isUserMessage ? "auto" : "0",
    padding: isUserMessage ? "6px 12px" : "0",
    border: isUserMessage ? "1px solid var(--vscode-panel-border)" : "none",
    borderRadius: isUserMessage ? "12px" : "0",
    background: isUserMessage ? "var(--vscode-editor-inactiveSelectionBackground)" : "transparent",
    overflowWrap: "anywhere",
}));

const CompactionNoticeContainer = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--vscode-textCodeBlock-background);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 4px;
    padding: 6px 12px;
    margin: 6px 0;
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
`;

const CompactionNotice: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <CompactionNoticeContainer>
        <span className="codicon codicon-fold" role="img" />
        {children}
    </CompactionNoticeContainer>
);

const UsageLimitNoticeContainer = styled.div`
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin: 8px 20px 0;
    padding: 8px 10px;
    border: 1px solid var(--vscode-inputValidation-warningBorder, var(--vscode-panel-border));
    border-radius: 6px;
    background: var(--vscode-inputValidation-warningBackground, var(--vscode-textCodeBlock-background));
    color: var(--vscode-foreground);
    font-size: 12px;
    line-height: 1.5;

    .codicon {
        flex-shrink: 0;
        font-size: 14px;
        line-height: 18px;
        color: var(--vscode-inputValidation-warningForeground, var(--vscode-charts-yellow, var(--vscode-foreground)));
    }

    a {
        color: var(--vscode-textLink-foreground);
        font-weight: 600;
        word-break: break-all;
        text-decoration: none;

        &:hover {
            color: var(--vscode-textLink-activeForeground);
            text-decoration: underline;
        }
    }
`;

// ── Agent stream serialization ────────────────────────────────────────────────
// Shared with the floating-orb mini chat so both surfaces read/write the same
// persisted `<agentstream>` transcript format. See ./utils/streamSerialization.

// Interactive-prompt events need care while replaying buffered events on reopen: their
// transcript cards must be rebuilt (they are part of the turn), but a "waiting for user"
// state may only be re-surfaced when the backend still has the request pending (in-chat
// prompts survive panel close and stay answerable). For card-driven prompts — whose waiting
// UI derives from the card's `stage` — the pending-stage event of an already-resolved
// request is dropped; its resolution event later in the buffer rebuilds the card in its
// final state. Banner-driven prompts (task/web-tool approval) are handled inside their
// branches instead: transcript items are always rebuilt, only the banner is suppressed.
const REPLAY_PENDING_STAGES: Record<string, string> = {
    clarify_event: "asking" satisfies ClarifyEvent["stage"],
    skill_enable_event: SkillEnableStage.PROMPTING,
    configuration_collection_event: "collecting" satisfies ConfigurationCollectionEvent["stage"],
    connector_generation_notification: "requesting_input" satisfies ConnectorGenerationNotification["stage"],
};

/**
 * `ChatNotify` types `handleChatNotify` deliberately ignores: they carry nothing that
 * belongs in the persisted assistant transcript, and nothing this panel renders.
 *
 * Enumerated rather than swallowed by a bare `default` so that adding a variant to
 * `ChatNotify` breaks the build here, forcing a decision. That guard matters because
 * this panel AUTHORS the persisted transcript (its `save_chat` branch writes the
 * rendered scrollback back via `updateChatMessage`, which drops the run-event buffer
 * that could otherwise rebuild the turn — once the run is no longer active; mid-run
 * per-step saves keep it, see `clearBuffer`'s guard in `rpc-manager.ts`) — an event
 * that should be folded into
 * `content` but is silently ignored is data the store loses for good. Mirrors
 * `MiniChat.tsx`'s `UnmodelledNotifyType`; deliberately named differently because the
 * two lists are NOT meant to match — the panel models strictly more events, so its
 * residual is smaller. Keep both greppable rather than trying to share one type.
 *
 * ⚠️ Coverage boundary: this fires only when a variant is ADDED to `ChatNotify`. It
 * does NOT fire when a type already listed below starts carrying transcript content,
 * or starts being emitted on a path it previously wasn't — that stays a human
 * judgement call, so re-read the justifications below when touching an emitter.
 *
 * Why each of these is safe to ignore *here*:
 *  - `start` — the panel already enters its loading state when it sends the request.
 *  - `evals_tool_result` never reaches any webview: `features/ai/utils/events.ts`
 *    drops it before dispatch.
 *  - `plan_updated` is declared but never emitted anywhere.
 *  - `migration_progress` is pure progress telemetry with no transcript content. Note
 *    it genuinely DOES reach this panel — `createAIPanelMigrationEventHandler`
 *    forwards every event when migration enhancement runs from AI Chat — so it is
 *    exactly the case the coverage boundary above applies to: if migration is ever
 *    folded into the main chat transcript, the tripwire will NOT catch it.
 */
type PanelUnmodelledNotifyType =
    | "start"
    | "evals_tool_result"
    | "plan_updated"
    | "migration_progress";

const SCAFFOLD_DONE_PREFIX = "ballerina.scaffold.done:";

// Stable, non-crypto hash for keying scaffold runs by (prompt + steps).
function scaffoldKeyHash(text: string, hiddenContext: string | undefined): string {
    const input = text + "\0" + (hiddenContext ?? "");
    let h = 5381;
    for (let i = 0; i < input.length; i++) {
        h = ((h << 5) + h + input.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(36);
}

const AIChat: React.FC = () => {
    const { rpcClient } = useRpcContext();
    const [messages, setMessages] = useState<PanelMessage[]>([]);
    const renderedMessagesRef = useRef(messages);
    const messagesCommitWaitersRef = useRef<Array<() => void>>([]);
    const [messagesCommitSignal, setMessagesCommitSignal] = useState(0);

    React.useLayoutEffect(() => {
        renderedMessagesRef.current = messages;
        const waiters = messagesCommitWaitersRef.current.splice(0);
        for (const resolve of waiters) {
            resolve();
        }
    }, [messages, messagesCommitSignal]);

    const waitForMessagesCommit = useCallback((): Promise<void> => {
        return new Promise((resolve) => {
            messagesCommitWaitersRef.current.push(resolve);
            // This marker is queued after all preceding message updates. The
            // layout effect therefore observes their final committed state.
            setMessagesCommitSignal((value) => value + 1);
        });
    }, []);

    const getLatestAssistantMessageIndex = (chatMessages: Array<{ role: string }>): number => {
        for (let i = chatMessages.length - 1; i >= 0; i--) {
            const role = chatMessages[i]?.role;
            if (role === "Copilot" || role === "assistant") {
                return i;
            }
        }
        return -1;
    };

    const getLatestUserMessageIndex = (chatMessages: Array<{ role: string }>): number => {
        for (let i = chatMessages.length - 1; i >= 0; i--) {
            const role = chatMessages[i]?.role;
            if (role === "User" || role === "user") {
                return i;
            }
        }
        return -1;
    };

    const ensureAssistantMessage = (
        chatMessages: PanelMessage[]
    ): number => {
        const targetIndex = getLatestAssistantMessageIndex(chatMessages);
        // Reuse the trailing assistant bubble only if it belongs to the CURRENT turn — i.e. it
        // comes after the most recent user message. Otherwise (a newer user prompt exists, or there
        // is no assistant yet) start a fresh bubble so streamed content lands under the right turn.
        // Without this, replaying a follow-up turn's events on reopen merges them into the previous
        // turn's bubble and the follow-up prompt is pushed below its own response.
        if (targetIndex !== -1 && targetIndex > getLatestUserMessageIndex(chatMessages)) {
            if (!chatMessages[targetIndex].messageId && activeRunGenerationIdRef.current) {
                chatMessages[targetIndex] = {
                    ...chatMessages[targetIndex],
                    messageId: activeRunGenerationIdRef.current,
                };
            }
            return targetIndex;
        }
        chatMessages.push({
            role: "Copilot",
            content: "",
            type: "assistant_message",
            messageId: activeRunGenerationIdRef.current,
        });
        return chatMessages.length - 1;
    };

    const updateLastMessage = (updater: (content: string) => string) => {
        setMessages((prevMessages) => {
            const newMessages = [...prevMessages];
            const targetIndex = ensureAssistantMessage(newMessages);
            newMessages[targetIndex].content = updater(newMessages[targetIndex].content);
            return newMessages;
        });
    };

    const [isLoading, setIsLoading] = useState(false);
    // onChatNotify is re-registered each render, so stale closures fire too — suggestion
    // staleness has to be judged against a ref, not the captured isLoading value.
    const isLoadingRef = useRef(false);
    isLoadingRef.current = isLoading;
    // Set by the "abort" notification, which always arrives before the RPC error (whose name is lost in transit).
    const abortHandledRef = useRef(false);
    const [followupSuggestions, setFollowupSuggestions] = useState<FollowupSuggestion[]>([]);
    const [isCompacting, setIsCompacting] = useState(false);
    // Tools currently in flight, oldest first, for the composer's loading
    // indicator. This is a list rather than a single slot because a step can run
    // several tools concurrently (the AI SDK executes a step's calls with
    // Promise.all, and each tool emits its own tool_call/tool_result): with one
    // slot, the first result to land would clear a sibling that is still
    // running. Empty means the model is thinking or writing rather than calling
    // a tool, and the indicator falls back to its generic label.
    const [inFlightTools, setInFlightTools] = useState<{ id: string; label: string }[]>([]);
    const [hoveredTurnIndex, setHoveredTurnIndex] = useState<number | null>(null);
    const [lastQuestionIndex, setLastQuestionIndex] = useState(-1);
    const [isCodeLoading, setIsCodeLoading] = useState(false);
    const [currentGeneratingPromptIndex, setCurrentGeneratingPromptIndex] = useState(-1);
    const [isReqFileExists, setIsReqFileExists] = useState(false);
    const [isPromptExecutedInCurrentWindow, setIsPromptExecutedInCurrentWindow] = useState(false);

    const [docGenIntermediaryState, setDocGenIntermediaryState] =
        useState<DocumentationGeneratorIntermediaryState | null>(null);
    const [isAddingToWorkspace, setIsAddingToWorkspace] = useState(false);

    // Panel navigation stack. [] = chat; the top of the stack is the visible
    // panel. Back pops one level, so the same panel returns to wherever it was
    // opened from (e.g. MCP manager → chat when opened from the chip, or → settings
    // when opened from the Customize Copilot section).
    const [panelStack, setPanelStack] = useState<PanelRoute[]>([]);
    const activePanel = panelStack[panelStack.length - 1];
    const pushPanel = (route: PanelRoute) => setPanelStack(s => [...s, route]);
    const popPanel = () => setPanelStack(s => s.slice(0, -1));
    const backTooltip = backTooltipFor(panelStack);
    const [isAutoApproveEnabled, setIsAutoApproveEnabled] = useState(false);
    const [isWebToolsEnabled, setIsWebToolsEnabled] = useState(false);
    const userWebSearchPreferenceRef = useRef(false);
    const [agentMode, _setAgentMode] = useState<AgentMode>(AgentMode.Edit);
    const agentModeRef = useRef<AgentMode>(AgentMode.Edit);
    const setAgentMode = (mode: AgentMode) => {
        _setAgentMode(mode);
        agentModeRef.current = mode;
    };

    const [availableCheckpointIds, setAvailableCheckpointIds] = useState<Set<string>>(new Set());
    const [restoringCheckpointId, setRestoringCheckpointId] = useState<string | null>(null);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [threads, setThreads] = useState<ThreadSummary[]>([]);
    const [threadsLoading, setThreadsLoading] = useState(false);
    const [threadsError, setThreadsError] = useState<string | null>(null);

    const [approvalRequest, setApprovalRequest] = useState<TaskApprovalRequest | null>(null);
    const [approvalOverlay, setApprovalOverlay] = useState<ApprovalOverlayState>({ show: false });
    const [webToolApprovalRequest, setWebToolApprovalRequest] = useState<{
        requestId: string;
        toolName: "web_search" | "web_fetch";
        content: string;
    } | null>(null);

    const [currentFileArray, setCurrentFileArray] = useState<SourceFile[]>([]);
    const [codeContext, setCodeContext] = useState<CodeContext | undefined>(undefined);
    const [footerSuggestedCommandTemplates, setFooterSuggestedCommandTemplates] = useState<AIPanelPrompt[] | undefined>(undefined);
    const [footerInputPlaceholder, setFooterInputPlaceholder] = useState<string | null>(null);

    const [migrationSession, setMigrationSession] = useState<ActiveMigrationSession | null>(null);
    const [isMigrationEnhancementRunning, setIsMigrationEnhancementRunning] = useState(false);
    const [usage, setUsage] = useState<{ remainingUsagePercentage: number; resetsIn: number; orgId?: string; alreadyRequested?: boolean } | null>(null);
    const [isUsageExceeded, setIsUsageExceeded] = useState(false);
    const [showQuotaDialog, setShowQuotaDialog] = useState(false);
    const [quotaRequestSubmitting, setQuotaRequestSubmitting] = useState(false);
    const [quotaRequestError, setQuotaRequestError] = useState<string | undefined>(undefined);
    const [loginMethod, setLoginMethod] = useState<LoginMethod | null>(null);

    const [contextUsage, setContextUsage] = useState<{
        inputTokens: number;
        percentage: number;
        breakdown?: { systemInstructions: number; toolDefinitions: number; reservedOutput: number; files: number; messages: number; toolResults: number };
    } | null>(null);
    const [showContextUsage, setShowContextUsage] = useState(false);
    const [mcpToolsEnabled, setMcpToolsEnabled] = useState(false);

    const [runningServices, setRunningServices] = useState<RunningServiceInfo[]>([]);
    const [skills, setSkills] = useState<SkillEntry[]>([]);

    //TODO: Need a better way of storing data related to last generation to be in the repair state.
    const currentDiagnosticsRef = useRef<DiagnosticEntry[]>([]);
    const codeContextRef = useRef<CodeContext | undefined>(undefined);
    const hiddenContextRef = useRef<string | undefined>(undefined);
    const functionsRef = useRef<any>([]);
    const lastAttatchmentsRef = useRef<any>([]);
    const aiChatInputRef = useRef<AIChatInputRef>(null);
    const messagesRef = useRef<any>([]);

    const isErrorChunkReceivedRef = useRef(false);
    const activeScaffoldKeyRef = useRef<string | null>(null);

    // --- Panel reconnection safeguards ---
    // The agent run survives the panel closing; these let a reopened panel
    // re-attach to an in-flight run, replay missed events, and poll for events
    // that were dropped while no panel was listening.
    const ENABLE_STREAM_SAFEGUARDS = true;
    const ENABLE_STREAM_POLLING_FALLBACK = ENABLE_STREAM_SAFEGUARDS;
    const POLL_STALE_THRESHOLD_MS = 5_000;
    const POLL_INTERVAL_MS = 3_000;
    const lastReceivedSeqRef = useRef<number>(0);          // highest seq seen (push or replay)
    const lastEventTimeRef = useRef<number>(0);            // timestamp of last event (staleness)
    const terminalEventReceivedRef = useRef<boolean>(false); // stop/abort/error seen
    const pollInFlightRef = useRef<boolean>(false);        // prevents overlapping polls
    const activeRunGenerationIdRef = useRef<string | undefined>(undefined); // drop stale-run events
    const activeRunScopeRef = useRef<{ projectRootPath: string; threadId: string } | undefined>(undefined);
    const runEpochRef = useRef(0);                         // invalidates old in-flight poll responses
    const runAcknowledgedRef = useRef(false);              // backend has exposed/evented the expected run
    const handleChatNotifyRef = useRef<(response: ChatNotify) => void | Promise<void>>(() => {});
    const [backendRequestTriggered, setBackendRequestTriggered] = useState(false);
    // True while replaying buffered events on reopen — lets the notify handler skip
    // interactive prompts that were already resolved earlier in the run.
    const replayingRef = useRef(false);
    // Ensures the reconnect/replay runs at most once for this panel mount
    // (guards StrictMode double-effects and rpcClient identity churn).
    const didReconnectRef = useRef(false);
    // Request ids of interactive prompts still awaiting a response, captured at reconnect.
    // During replay, a buffered prompt is re-shown only if its id is in here (still pending).
    const pendingRequestIdsRef = useRef<Set<string>>(new Set());
    // Live-event gate. The onChatNotify subscription is active from the first render, but
    // reconnect (history load + buffer replay) happens later and asynchronously. While the gate
    // is CLOSED, incoming live events are queued instead of processed, so they can't interleave
    // with the replay. The reconnect effect drains the queue in order (seq-deduped against the
    // replay's high-water mark) and opens the gate once replay is done.
    const liveGateClosedRef = useRef(true);
    const liveQueueRef = useRef<ChatNotify[]>([]);
    // Resolved once the mount-time reconnect (history load + buffer replay + recovery
    // persist) has settled. Sends await this before hitting the backend: a new run's
    // beginRun resets the event buffer, so a send racing the replay (e.g. an
    // auto-submitted initial prompt) would wipe a finished run's not-yet-persisted
    // tail — review chip and final transcript included.
    const reconnectSettledResolveRef = useRef<(() => void) | null>(null);
    const reconnectSettledRef = useRef<Promise<void> | null>(null);
    if (reconnectSettledRef.current === null) {
        reconnectSettledRef.current = new Promise<void>((resolve) => {
            reconnectSettledResolveRef.current = resolve;
        });
    }

    const messagesEndRef = React.useRef<HTMLDivElement>(null);

    /* REFACTORED CODE START [2] */
    // custom hooks: commands + attachments
    const { loadGeneralTags, injectPlaceholderTags } = useFooterLogic({
        rpcClient,
    });

    const { feedbackGiven, setFeedbackGiven, handleFeedback } = useFeedback({
        messages,
        currentDiagnosticsRef,
    });

    const updateCodeContext = (context?: CodeContext) => {
        codeContextRef.current = context;
        setCodeContext(context);
    };

    /**
     * Effect: Initialize the component with initial prompts
     */
    useEffect(function initializeWithInitialPrompts() {
        const fetchPrompt = () => {
            rpcClient
                .getAiPanelRpcClient()
                .getDefaultPrompt()
                .then(async (defaultPrompt: AIPanelPrompt) => {
                    if (defaultPrompt) {
                        // Extract CodeContext from both command-template metadata and text-type direct param
                        const codeCtx = defaultPrompt.type === 'command-template'
                            ? defaultPrompt.metadata?.codeContext
                            : defaultPrompt.type === 'text'
                                ? defaultPrompt.codeContext
                                : undefined;

                        updateCodeContext(codeCtx);
                        hiddenContextRef.current = defaultPrompt.hiddenContext;

                        // Handle plan mode for text-type prompts
                        if (defaultPrompt.type === 'text') {
                            const textPrompt = defaultPrompt;
                            setAgentMode(defaultPrompt.planMode ? AgentMode.Plan : AgentMode.Edit);
                            setFooterSuggestedCommandTemplates(textPrompt.suggestedCommandTemplates);
                            setFooterInputPlaceholder(textPrompt.inputPlaceholder ?? null);

                            if (defaultPrompt.autoSubmit && defaultPrompt.text.trim().length > 0) {
                                // Devant scaffold gate: when the extension was launched with INITIAL_SCAFFOLD_PROMPT,
                                // never auto-execute the same scaffold twice on this env URL (localStorage scoped per origin).
                                // Fail open — if the RPC errors for any reason, behave as if env is unset.
                                const isScaffoldEnv = await rpcClient
                                    .getAiPanelRpcClient()
                                    .isScaffoldEnvActive()
                                    .catch(() => false);
                                if (isScaffoldEnv) {
                                    const key = SCAFFOLD_DONE_PREFIX + scaffoldKeyHash(defaultPrompt.text, defaultPrompt.hiddenContext);
                                    if (localStorage.getItem(key) === "1") {
                                        // Already executed in a previous session for this env+spec.
                                        // Drop the cached prompt so it isn't re-served on next panel mount.
                                        rpcClient.getAiPanelRpcClient().clearInitialPrompt();
                                        return;
                                    }
                                    activeScaffoldKeyRef.current = key;
                                }
                                // A prompt handed off from another surface (e.g. the overview) can ask
                                // for a fresh thread; clear first, then re-apply its mode (clear resets it).
                                if (defaultPrompt.newThread) {
                                    await handleClearChat().catch((): void => { /* best-effort: still submit */ });
                                    setAgentMode(defaultPrompt.planMode ? AgentMode.Plan : AgentMode.Edit);
                                }
                                void handleSend({
                                    input: [{ content: defaultPrompt.text }],
                                    attachments: defaultPrompt.attachments ?? [],
                                });
                                return;
                            }
                        } else {
                            setFooterSuggestedCommandTemplates(undefined);
                            setFooterInputPlaceholder(null);
                        }

                        aiChatInputRef.current?.setInputContent(defaultPrompt);
                    }
                });
        };

        // Fetch prompt on mount
        fetchPrompt();

        // Listen for prompt updates when panel is already open
        rpcClient.onPromptUpdated(() => {
            fetchPrompt();
        });
    }, []);

    /**
     * Effect: Update onboarding state
     */
    useEffect(function updateOnboardingState() {
        incrementOnboardingOpens();
    }, []);


    const formatResetsIn = (seconds: number): string => {
        const days = Math.floor(seconds / 86400);
        if (days >= 1) return `${days} day${days > 1 ? 's' : ''}`;
        const hours = Math.floor(seconds / 3600);
        if (hours >= 1) return `${hours} hour${hours > 1 ? 's' : ''}`;
        const mins = Math.floor(seconds / 60);
        return `${mins} min${mins > 1 ? 's' : ''}`;
    };

    const formatResetsInExact = (seconds: number): string => {
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const parts: string[] = [];
        if (days > 0) parts.push(`${days}d`);
        if (hours > 0) parts.push(`${hours}h`);
        if (mins > 0) parts.push(`${mins}m`);
        return parts.length > 0 ? parts.join(' ') : 'less than a minute';
    };

    const fetchUsage = async (clearOnError = true) => {
        try {
            const result = await rpcClient.getAiPanelRpcClient().getUsage();
            if (result) {
                setUsage(result);
                setIsUsageExceeded(result.resetsIn !== -1 && result.remainingUsagePercentage < USAGE_EXCEEDED_THRESHOLD_PERCENT);
            } else {
                setUsage(null);
                setIsUsageExceeded(false);
            }
        } catch (e) {
            console.error("Failed to fetch usage:", e);
            // Clear only on the automatic path, so a transient failure can't block the user.
            if (clearOnError) {
                setUsage(null);
                setIsUsageExceeded(false);
            }
        }
    };

    const [recheckingUsage, setRecheckingUsage] = useState(false);

    /** Nothing else re-checks while the limit is up — the input is disabled, so no turn runs. */
    const handleRecheckUsage = async (): Promise<void> => {
        setRecheckingUsage(true);
        try {
            await fetchUsage(false);
        } finally {
            setRecheckingUsage(false);
        }
    };

    const handleQuotaRequestSubmit = async (note: string) => {
        setQuotaRequestSubmitting(true);
        setQuotaRequestError(undefined);
        try {
            const result = await rpcClient.getAiPanelRpcClient().requestQuota({ note });
            if (result.status === "submitted" || result.status === "already_requested") {
                setShowQuotaDialog(false);
                await fetchUsage();
            } else {
                setQuotaRequestError(`Something went wrong. Please try again or email ${QUOTA_CONTACT_EMAIL}.`);
            }
        } catch (e) {
            console.error("Failed to submit quota request:", e);
            setQuotaRequestError(`Something went wrong. Please try again or email ${QUOTA_CONTACT_EMAIL}.`);
        } finally {
            setQuotaRequestSubmitting(false);
        }
    };

    const fetchLoginMethod = async () => {
        try {
            const method = await rpcClient.getAiPanelRpcClient().getLoginMethod();
            setLoginMethod(method);
        } catch (e) {
            console.error("Failed to fetch login method:", e);
        }
    };

    useEffect(() => { fetchUsage(); fetchLoginMethod(); loadThreads(); }, []);

    const refreshSkills = useCallback(() => {
        rpcClient.getAiPanelRpcClient().getSkills().then(res => setSkills(res.skills));
    }, [rpcClient]);

    useEffect(function fetchSkills() {
        refreshSkills();
    }, [refreshSkills]);

    useEffect(() => {
        rpcClient.getAiPanelRpcClient().getShowContextUsage().then(setShowContextUsage).catch(() => {});
        rpcClient.getAiPanelRpcClient().getMcpToolsEnabled().then(setMcpToolsEnabled).catch(() => {});
    }, []);

    /** Re-derives chips for whichever turn is now last (after a restore or a thread change). */
    const refreshFollowupSuggestions = async () => {
        try {
            const suggestions = await rpcClient.getAiPanelRpcClient().getLatestFollowupSuggestions();
            setFollowupSuggestions(suggestions ?? []);
        } catch (error) {
            console.error('[AIChat] Failed to refresh follow-up suggestions:', error);
            setFollowupSuggestions([]);
        }
    };

    const handleCheckpointRestore = async (checkpointId: string) => {
        // Guard against concurrent restores — the separator UI also disables
        // itself, but this is defensive in case the handler is called directly.
        if (restoringCheckpointId) {
            return;
        }
        // Mark this checkpoint as restoring immediately so the separator can
        // swap to the "Restoring checkpoint..." spinner on the same tick.
        setRestoringCheckpointId(checkpointId);
        try {
            // Call backend to restore checkpoint (files + chat history)
            await rpcClient.getAiPanelRpcClient().restoreCheckpoint({ checkpointId });

            // Trim chat UI to the restored checkpoint — messages after this point
            // no longer reflect the restored file state so they should be removed.
            setMessages(prev => {
                const idx = prev.findIndex(m => m.checkpointId === checkpointId);
                return idx === -1 ? prev : prev.slice(0, idx);
            });

            // Update available checkpoint IDs after restore (checkpoints are trimmed during restore)
            const checkpoints = await rpcClient.getAiPanelRpcClient().getCheckpoints();
            const checkpointIds = checkpoints.map(cp => cp.id);
            setAvailableCheckpointIds(new Set(checkpointIds));

            // Reset UI state
            setIsLoading(false);
            setIsCodeLoading(false);
            setDocGenIntermediaryState(null);
            setIsAddingToWorkspace(false);
            setCurrentFileArray([]);
            setLastQuestionIndex(-1);
            setCurrentGeneratingPromptIndex(-1);
            // Clear stale context usage — token count changed with the restore.
            // Widget will reappear with accurate data on the next agent turn.
            setContextUsage(null);
            // History is trimmed to the checkpoint — re-derive so the reverted turn's chips drop.
            await refreshFollowupSuggestions();
        } catch (error) {
            console.error("Failed to restore checkpoint:", error);
        } finally {
            setRestoringCheckpointId(null);
        }
    };

    useEffect(() => {
        const initializeCheckpoints = async () => {
            try {
                // Fetch available checkpoints
                const checkpoints = await rpcClient.getAiPanelRpcClient().getCheckpoints();
                const checkpointIds = checkpoints.map(cp => cp.id);
                setAvailableCheckpointIds(new Set(checkpointIds));
            } catch (error) {
                console.error("[AIChat] Failed to initialize checkpoints:", error);
            }
        };

        initializeCheckpoints();
    }, [rpcClient]);



    useEffect(() => {
        const handleApprovalOverlay = (data: ApprovalOverlayState) => {
            console.log("[AIChat] Approval overlay notification:", data);
            setApprovalOverlay(data);
        };

        rpcClient.onApprovalOverlayState(handleApprovalOverlay);
    }, [rpcClient]);

    useEffect(() => {
        rpcClient.onWebToolToggle((payload: WebToolToggle) => {
            setIsWebToolsEnabled(payload.active ? true : userWebSearchPreferenceRef.current);
        });
    }, [rpcClient]);

    // Initial fetch covers services started before the webview opened;
    // the subscription keeps the list live for the rest of the session.
    useEffect(() => {
        let cancelled = false;
        rpcClient.getAiPanelRpcClient().getRunningServices().then((services) => {
            if (!cancelled) {
                setRunningServices(services);
            }
        }).catch(() => { /* manager not initialized yet */ });
        const disposeListener = rpcClient.onRunningServicesChanged((services: RunningServiceInfo[]) => {
            setRunningServices(services);
        });
        return () => {
            cancelled = true;
            disposeListener();
        };
    }, [rpcClient]);

    const handleStopRunningService = async (taskId: string) => {
        try {
            await rpcClient.getAiPanelRpcClient().stopRunningService({ taskId });
        } catch (err) {
            console.error("Failed to stop running service", err);
        }
    };

    const handleStopAllRunningServices = async () => {
        const active = runningServices.filter((s) => !s.exited);
        await Promise.all(
            active.map((s) =>
                rpcClient.getAiPanelRpcClient().stopRunningService({ taskId: s.taskId }).catch((err) => {
                    console.error("Failed to stop running service", err);
                })
            )
        );
    };

    /**
     * Re-attach to an agent run after the panel was closed and reopened: fetch
     * the buffered events, adopt the run, and replay what the closed panel
     * missed. Covers both a run that is still executing (live re-attach) and a
     * run that finished while the panel was closed — the backend serves the
     * latter's buffer exactly once, and replaying its save_chat also persists
     * the final transcript the closed panel never round-tripped. No-op when
     * there is nothing to replay.
     */
    const reconnectToActiveRun = async (historyMessages: ReturnType<typeof convertToUIMessages>) => {
        try {
            const runStatus = await rpcClient.getAiPanelRpcClient().getRunStatus({});
            activeRunScopeRef.current = {
                projectRootPath: runStatus.projectRootPath,
                threadId: runStatus.threadId,
            };
            // Prompts still awaiting an answer — used by the replay skip guard to
            // re-show only still-pending interactive prompts.
            pendingRequestIdsRef.current = new Set(runStatus.pendingRequestIds ?? []);

            const generationId = runStatus.generationId
                ?? runStatus.events.find(e => !!e.generationId)?.generationId;
            // A buffer only exists while the turn's FINAL transcript is not yet persisted
            // (per-step save_chat writes partial uiResponses mid-run, so a history bubble
            // for this generation does NOT imply completeness) — whenever one exists,
            // rebuild the turn from it; the persist that follows clears it, so this
            // converges. A live run always proceeds, even with an empty buffer, to arm
            // the spinner and polling fallback.
            if (!runStatus.isRunning && runStatus.events.length === 0) {
                return;
            }

            // Older extension versions could expose a run before its generation
            // was persisted. Repair such a history defensively from the backend's
            // authoritative prompt so streamed content cannot attach to the prior turn.
            if (
                generationId
                && runStatus.userPrompt
                && !historyMessages.some((message) =>
                    message.role === "User" && message.messageId === generationId
                )
            ) {
                setMessages((previous) => [
                    ...previous,
                    {
                        role: "User",
                        content: runStatus.userPrompt!,
                        type: "user_message",
                        messageId: generationId,
                    },
                ]);
            }

            // Adopt this run so any stray events from a prior run are dropped.
            activeRunGenerationIdRef.current = generationId;
            runAcknowledgedRef.current = !!generationId;
            runEpochRef.current += 1;
            if (ENABLE_STREAM_SAFEGUARDS) {
                lastReceivedSeqRef.current = runStatus.truncated
                    ? (runStatus.events[runStatus.events.length - 1]?.seq ?? 0)
                    : 0;
                lastEventTimeRef.current = Date.now();
                terminalEventReceivedRef.current = false;
            }
            if (runStatus.isPlanMode !== undefined) {
                setAgentMode(runStatus.isPlanMode ? AgentMode.Plan : AgentMode.Edit);
            }
            // The status notification is not buffered with the run's events, so the bubble
            // the replay rebuilds below would lose it — carry the loaded value across.
            const loadedGenerationStatus = historyMessages.find(
                (message) => message.type === "assistant_message" && message.messageId === generationId
            )?.generationStatus;

            if (!runStatus.truncated) {
                // Drop any assistant bubble already loaded for this generation (stale
                // partial uiResponse) — the replay rebuilds the full turn from scratch,
                // and turn-aware ensureAssistantMessage starts a fresh bubble for it.
                setMessages(prev => prev.filter(
                    (m) => !(m.type === "assistant_message" && m.messageId === generationId)
                ));
            } else {
                // Never present or persist a retained tail as though it were the
                // complete turn. Keep any durable partial and make the gap explicit.
                setMessages((previous) => {
                    const next = [...previous];
                    const targetIndex = ensureAssistantMessage(next);
                    const current = next[targetIndex];
                    const warning = "\n\n*[Some output streamed while this panel was closed could not be recovered. The transcript below may be incomplete.]*";
                    if (!current.content.includes(warning.trim())) {
                        next[targetIndex] = { ...current, content: `${current.content}${warning}` };
                    }
                    return next;
                });
            }
            if (runStatus.isRunning) {
                setIsLoading(true);
                setBackendRequestTriggered(true);
            }
            replayingRef.current = true;
            try {
                if (!runStatus.truncated) {
                    for (const ev of runStatus.events) {
                        await handleChatNotifyRef.current(ev);
                    }
                } else {
                    // The retained tail is not a complete transcript. Re-surface only
                    // still-answerable prompts and safe structural state.
                    for (const ev of runStatus.events) {
                        const reqId = (ev as any).requestId;
                        const stillPendingPrompt = !!reqId && pendingRequestIdsRef.current.has(reqId);
                        const structuralTail = ev.type === "chat_component" || ev.type === "diagnostics"
                            || ev.type === "plan_approval_resolved"
                            || (!runStatus.isRunning && ev.type === "error");
                        if (stillPendingPrompt || structuralTail) {
                            await handleChatNotifyRef.current(ev);
                        }
                    }
                }
            } finally {
                replayingRef.current = false;
            }
            if (loadedGenerationStatus) {
                setMessages(prev => prev.map(m =>
                    m.type === "assistant_message" && m.messageId === generationId
                        ? { ...m, generationStatus: loadedGenerationStatus }
                        : m
                ));
            }
            if (!runStatus.isRunning && generationId && !runStatus.truncated) {
                // Finished while the panel was closed. Persist the rebuilt transcript so
                // it's durable, the backend drops the buffer, and later reopens serve from
                // history. (The replayed save_chat usually does this already; this covers
                // buffers whose run ended without one, e.g. an error turn.) Read the
                // Wait for React to commit every replay update, then perform one
                // explicit, awaited final write. This is the only recovery write
                // allowed to clear the backend buffer.
                await waitForMessagesCommit();
                const recoveredMessage = [...renderedMessagesRef.current]
                    .reverse()
                    .find((message) =>
                        (message.role === "Copilot" || message.role === "assistant")
                        && message.messageId === generationId
                    );
                if (recoveredMessage?.content) {
                    await rpcClient.getAiPanelRpcClient().updateChatMessage({
                        messageId: generationId,
                        content: recoveredMessage.content,
                        projectRootPath: runStatus.projectRootPath,
                        threadId: runStatus.threadId,
                        clearRunBuffer: true,
                    });
                }
            }
        } catch (error) {
            console.error('[AIChat] Failed to restore in-flight run status:', error);
        }
    };

    /**
     * Effect: Load initial chat history from aiChatMachine context
     */
    useEffect(function loadInitialChatHistory() {
        const loadHistory = async () => {
            // Duplicate/concurrent mount (React StrictMode, or an rpcClient identity
            // change): the primary run owns history load, gate and replay. Bail so we
            // never replay twice or double-open the gate.
            if (didReconnectRef.current) {
                return;
            }
            didReconnectRef.current = true;

            try {
                let uiMessages: ReturnType<typeof convertToUIMessages> = [];
                try {
                    const historyMessages = await rpcClient.getAiPanelRpcClient().getChatMessages();
                    if (historyMessages && historyMessages.length > 0) {
                        uiMessages = convertToUIMessages(historyMessages);
                        setMessages((prevMessages) => (prevMessages.length > 0 ? prevMessages : uiMessages));
                    }
                } catch (error) {
                    console.error('[AIChat] Failed to load initial chat history:', error);
                    // Continue with empty messages - don't block the UI
                }

                // Reconnect to an in-flight run: the run keeps executing on the
                // extension host while the panel is closed, buffering the events we
                // missed. Replay them so the reopened panel shows live progress.
                await reconnectToActiveRun(uiMessages);
            } finally {
                // Open the gate: replay is done (or was skipped). Drain live events
                // that arrived meanwhile, in order, deduped against the replay's seq
                // high-water mark; then resume direct dispatch. Events arriving during
                // the drain re-queue and are picked up by the loop, so opening the
                // gate right after the loop (synchronously) can't drop anything.
                const q = liveQueueRef.current;
                while (q.length > 0) {
                    const ev = q.shift();
                    if (!ev) { continue; }
                    if (typeof ev.seq === "number" && ev.seq <= lastReceivedSeqRef.current) {
                        continue; // already applied by the replay
                    }
                    try {
                        await handleChatNotifyRef.current(ev);
                    } catch (e) {
                        console.error('[AIChat] live drain failed:', e);
                    }
                }
                liveGateClosedRef.current = false;
                reconnectSettledResolveRef.current?.();
            }
            // Follow-up chips arrive via a live notification, so a webview reload would
            // otherwise lose them — re-derive from the latest generation, like review state.
            try {
                const suggestions = await rpcClient.getAiPanelRpcClient().getLatestFollowupSuggestions();
                if (suggestions?.length > 0) {
                    setFollowupSuggestions(suggestions);
                }
            } catch (error) {
                console.error('[AIChat] Failed to restore follow-up suggestions:', error);
            }
        };

        loadHistory();
    }, [rpcClient]);

    /**
     * Effect: Polling fallback for panel reconnection. When a run is active but
     * live push events go stale (e.g. the panel was briefly closed, or a burst
     * was dropped), poll `getRunStatus` for events since the last seen `seq` and
     * replay them. Stops once a terminal event is seen or the run ends.
     */
    useEffect(() => {
        if (!ENABLE_STREAM_POLLING_FALLBACK || !backendRequestTriggered || !rpcClient) {
            return;
        }
        const intervalId = setInterval(async () => {
            if (terminalEventReceivedRef.current || pollInFlightRef.current) {
                return;
            }
            if (Date.now() - lastEventTimeRef.current < POLL_STALE_THRESHOLD_MS) {
                return;
            }
            try {
                pollInFlightRef.current = true;
                const requestedEpoch = runEpochRef.current;
                const requestedGenerationId = activeRunGenerationIdRef.current;
                const runStatus = await rpcClient.getAiPanelRpcClient().getRunStatus({
                    sinceSeq: lastReceivedSeqRef.current,
                });
                // A new send/reconnect happened while this request was in flight,
                // or the response belongs to a different server-side run.
                if (
                    requestedEpoch !== runEpochRef.current
                    || (
                        requestedGenerationId
                        && runStatus.generationId
                        && requestedGenerationId !== runStatus.generationId
                    )
                    || (
                        requestedGenerationId
                        && !runStatus.generationId
                        && !runAcknowledgedRef.current
                    )
                ) {
                    return;
                }
                if (
                    requestedGenerationId
                    && runStatus.generationId === requestedGenerationId
                ) {
                    runAcknowledgedRef.current = true;
                }
                activeRunScopeRef.current = {
                    projectRootPath: runStatus.projectRootPath,
                    threadId: runStatus.threadId,
                };
                for (const ev of runStatus.events) {
                    // Race guard against a push arriving concurrently with the poll.
                    if (typeof ev.seq === "number" && ev.seq <= lastReceivedSeqRef.current) {
                        continue;
                    }
                    await handleChatNotifyRef.current(ev);
                }
                if (!runStatus.isRunning && runStatus.events.length === 0 && !terminalEventReceivedRef.current) {
                    // Watchdog: the run is genuinely gone but its terminal event never
                    // reached us (and there's nothing left to replay) — release the
                    // spinner instead of stranding it. The transcript on screen is
                    // whatever streamed/replayed; only the loading state is stuck.
                    console.warn('[AIChat] Polling watchdog clearing a stuck spinner (missed terminal signal).');
                    setIsLoading(false);
                    setIsCodeLoading(false);
                    setIsCompacting(false);
                    setBackendRequestTriggered(false);
                }
            } catch {
                // best-effort; try again next tick
            } finally {
                pollInFlightRef.current = false;
            }
        }, POLL_INTERVAL_MS);
        return () => {
            clearInterval(intervalId);
            pollInFlightRef.current = false;
        };
    }, [backendRequestTriggered, rpcClient]);

    /**
     * Effect: Check for an active migration session that needs AI enhancement.
     * Shows a context card so the user can resume or start enhancement.
     */
    useEffect(function checkMigrationSession() {
        const fetchSession = async () => {
            try {
                const session = await rpcClient.getMigrateIntegrationRpcClient().getActiveMigrationSession();
                if (session && !session.fullyEnhanced) {
                    setMigrationSession(session);
                } else {
                    setMigrationSession(null);
                }
            } catch {
                // Migration RPC may not be available – ignore
            }
        };
        fetchSession();
    }, [rpcClient]);

    rpcClient?.onCheckpointCaptured(async (payload: { messageId: string; checkpointId: string }) => {
        setMessages((prevMessages) => {
            const updatedMessages = [...prevMessages];
            for (let i = updatedMessages.length - 1; i >= 0; i--) {
                if (updatedMessages[i].type === "user_message" && !updatedMessages[i].checkpointId) {
                    updatedMessages[i] = {
                        ...updatedMessages[i],
                        checkpointId: payload.checkpointId,
                        messageId: payload.messageId
                    };
                    break;
                }
            }
            return updatedMessages;
        });

        // Update available checkpoint IDs after a new checkpoint is captured
        // This ensures the set reflects any cleanup of old checkpoints (maxCount enforcement)
        try {
            const checkpoints = await rpcClient.getAiPanelRpcClient().getCheckpoints();
            const checkpointIds = checkpoints.map(cp => cp.id);
            setAvailableCheckpointIds(new Set(checkpointIds));
        } catch (error) {
            console.error("[AIChat] Failed to update available checkpoint IDs:", error);
        }
    });

    // Backstop for the step label: a run can stop being "loading" through many
    // paths (terminal event, thrown error, reconnect deciding the run is over,
    // checkpoint restore, explicit stop), and only some of them are ChatNotify
    // events. Clearing on the flag itself means the next turn can never open
    // showing the previous turn's last tool. It is also the only thing that
    // retires a tool whose result never arrives (a tool that throws produces an
    // SDK tool-error chunk, which the extension host currently drops).
    useEffect(() => {
        if (!isLoading) {
            setInFlightTools(prev => (prev.length === 0 ? prev : []));
        }
    }, [isLoading]);

    // The newest in-flight tool is the step worth showing; older siblings are
    // still running but the indicator is one line.
    const activeToolLabel = inFlightTools.length > 0 ? inFlightTools[inFlightTools.length - 1].label : undefined;

    const handleChatNotify = async (response: ChatNotify) => {
        // Drop events belonging to a different (previously-interrupted) run once we
        // have adopted a specific run on reconnect — BEFORE any bookkeeping. seq is
        // per-run, so a stale run's event must not advance the adopted run's seq
        // high-water mark (it would poison sinceSeq polling) or set the terminal
        // flag (it would stop polling for the still-live adopted run).
        if (
            response.generationId &&
            activeRunGenerationIdRef.current &&
            response.generationId !== activeRunGenerationIdRef.current
        ) {
            return;
        }
        if (
            response.generationId
            && response.generationId === activeRunGenerationIdRef.current
        ) {
            runAcknowledgedRef.current = true;
        }
        if (
            !replayingRef.current
            && typeof response.seq === "number"
            && response.seq <= lastReceivedSeqRef.current
        ) {
            return;
        }
        // Reconnection bookkeeping: track the seq high-water mark, staleness
        // timestamp, and terminal state for the accepted event.
        if (ENABLE_STREAM_SAFEGUARDS) {
            if (typeof response.seq === "number" && response.seq > lastReceivedSeqRef.current) {
                lastReceivedSeqRef.current = response.seq;
            }
            lastEventTimeRef.current = Date.now();
            if (response.type === "stop" || response.type === "abort" || response.type === "error") {
                terminalEventReceivedRef.current = true;
            }
        }

        const type = response.type;

        // Track in-flight tools for the composer's loading indicator. This is a
        // separate pass rather than extra lines inside the big dispatch below: it
        // reads one start signal and four end signals that the dispatch already
        // handles for other reasons, and keeping it here makes the indicator's
        // whole data source greppable in one place. This block never returns, so
        // narrowing re-widens after it and the exhaustiveness guard at the tail of
        // the dispatch is unaffected in both directions.
        if (type === "tool_call") {
            const { label, detail } = getToolCallDisplay(response.toolName, response.toolInput);
            const entry = { id: response.toolCallId ?? "", label: detail ? `${label} ${detail}` : label };
            setInFlightTools(prev => [...prev, entry]);
        } else if (type === "tool_result") {
            // Drop only the matching call. Tools without an id share the "" key,
            // so each anonymous result retires the oldest anonymous call.
            const finishedId = response.toolCallId ?? "";
            setInFlightTools(prev => {
                const index = prev.findIndex(tool => tool.id === finishedId);
                return index === -1 ? prev : [...prev.slice(0, index), ...prev.slice(index + 1)];
            });
        } else if (type === "stop" || type === "abort" || type === "error") {
            setInFlightTools(prev => (prev.length === 0 ? prev : []));
        }

        // True only while replaying a buffered event whose request the backend no longer has
        // pending — its live interaction was already resolved and must not be re-surfaced.
        // A still-pending prompt falls through and renders live (answerable after reopen).
        const isResolvedReplayedPrompt = (reqId?: string) =>
            replayingRef.current && (!reqId || !pendingRequestIdsRef.current.has(reqId));

        // Card-driven prompts: drop the pending-stage event of an already-resolved request;
        // its resolution event later in the buffer rebuilds the card in its final state.
        const pendingStage = REPLAY_PENDING_STAGES[type];
        if (
            pendingStage &&
            (response as any).stage === pendingStage &&
            isResolvedReplayedPrompt((response as any).requestId)
        ) {
            return;
        }

        if (type === "content_block" || type === "content_replace") {
            const content = response.content;
            // An empty append is a no-op; an empty *replace* is meaningful (it clears
            // the trailing text), so only the append path short-circuits.
            if (type === "content_block" && content === "") return;
            setMessages(prevMessages => {
                const msgs = [...prevMessages];
                const targetIndex = ensureAssistantMessage(msgs);
                const last = msgs[targetIndex];
                const entries = parseStream(last.content);
                // Merge into trailing text item of the last entry if possible, otherwise append
                if (entries.length > 0) {
                    const lastEntry = entries[entries.length - 1];
                    const lastItem = lastEntry.items[lastEntry.items.length - 1];
                    if (lastItem?.kind === "text") {
                        const mergedText = type === "content_block" ? lastItem.text + content : content;
                        const updatedItems = [...lastEntry.items.slice(0, -1), { ...lastItem, text: mergedText }];
                        const updated = [...entries.slice(0, -1), { ...lastEntry, items: updatedItems }];
                        msgs[targetIndex] = { ...last, content: serializeStream(updated, last.content) };
                        return msgs;
                    }
                }
                const updated = appendToLastEntry(entries, { kind: "text", text: content });
                msgs[targetIndex] = { ...last, content: serializeStream(updated, last.content) };
                return msgs;
            });

        } else if (type === "tool_call") {
            const newItem: StreamItem = { kind: "tool_call", toolCallId: response.toolCallId, toolName: response.toolName, toolInput: response.toolInput };
            setMessages(prevMessages => {
                const msgs = [...prevMessages];
                const targetIndex = ensureAssistantMessage(msgs);
                const last = msgs[targetIndex];
                const entries = parseStream(last.content);
                const updated = appendToLastEntry(entries, newItem);
                msgs[targetIndex] = { ...last, content: serializeStream(updated, last.content) };
                return msgs;
            });

        } else if (type === "tool_result") {
            if (response.toolName === "TaskWrite") {
                const tasks = response.toolOutput?.tasks ?? [];
                setMessages(prevMessages => {
                    const msgs = [...prevMessages];
                    const targetIndex = ensureAssistantMessage(msgs);
                    const last = msgs[targetIndex];
                    const entries = parseStream(last.content);
                    const updated = applyTaskWriteResult(entries, tasks);
                    // Unchanged (task entry already open) — skip the redundant write.
                    if (updated === entries) return prevMessages;
                    msgs[targetIndex] = { ...last, content: serializeStream(updated, last.content) };
                    return msgs;
                });
            } else {
                // Replace the matching tool_call item with tool_result
                setMessages(prevMessages => {
                    const msgs = [...prevMessages];
                    const targetIndex = ensureAssistantMessage(msgs);
                    const last = msgs[targetIndex];
                    const entries = parseStream(last.content);
                    const resultItem: StreamItem = { kind: "tool_result", toolCallId: response.toolCallId, toolName: response.toolName, toolOutput: response.toolOutput, failed: response.failed };
                    let matched = false;
                    const updated = entries.map(entry => {
                        if (matched) return entry;
                        const idx = entry.items.findIndex(i => i.kind === "tool_call" && i.toolCallId === response.toolCallId);
                        if (idx === -1) return entry;
                        matched = true;
                        const updatedItems = entry.items.map((item, i) => i === idx ? resultItem : item);
                        return { ...entry, items: updatedItems };
                    });
                    if (!matched) {
                        // No matching call found — append as new item to last entry
                        msgs[targetIndex] = { ...last, content: serializeStream(appendToLastEntry(entries, resultItem), last.content) };
                    } else {
                        msgs[targetIndex] = { ...last, content: serializeStream(updated, last.content) };
                    }
                    return msgs;
                });
            }

        } else if (type === "task_approval_request") {
            if (response.approvalType === "plan") {
                setMessages(prevMessages => {
                    const msgs = [...prevMessages];
                    const targetIndex = ensureAssistantMessage(msgs);
                    const last = msgs[targetIndex];
                    const entries = parseStream(last.content);
                    const updated = appendToLastEntry(
                        entries,
                        buildPlanItem(response.requestId, response.tasks, response.message, response.autoApproved)
                    );
                    msgs[targetIndex] = { ...last, content: serializeStream(updated, last.content) };
                    return msgs;
                });
            }

            // Replayed, already-resolved approval: the plan transcript item above is still
            // rebuilt; only the interactive banner / auto-approve side effects are skipped.
            if (isResolvedReplayedPrompt(response.requestId)) {
                return;
            }

            // Skip approval UI when auto-approved from backend (scaffold mode)
            if (response.autoApproved) {
                return;
            }

            if (isAutoApproveEnabled && response.approvalType === "completion") {
                await rpcClient.getAiPanelRpcClient().approveTask({ requestId: response.requestId });
                return;
            }

            setApprovalRequest({
                type: "task_approval_request",
                requestId: response.requestId,
                approvalType: response.approvalType,
                tasks: response.tasks,
                taskDescription: response.taskDescription,
                message: response.message,
            });

        } else if (type === "plan_approval_resolved") {
            setMessages((previous) => {
                const next = [...previous];
                const assistantIndex = getLatestAssistantMessageIndex(next);
                if (assistantIndex === -1) {
                    return previous;
                }
                const assistant = next[assistantIndex];
                const entries = parseStream(assistant.content);
                const updated = applyPlanApprovalResolution(
                    entries,
                    response.requestId,
                    response.approved,
                    response.comment
                );
                if (updated === entries) {
                    return previous;
                }
                next[assistantIndex] = {
                    ...assistant,
                    content: serializeStream(updated, assistant.content),
                };
                return next;
            });
            setApprovalRequest((pending) =>
                pending?.requestId === response.requestId ? null : pending
            );

        } else if (type === "web_tool_approval_request") {
            // Banner-only event (no transcript item) — nothing to rebuild for a resolved one.
            if (isResolvedReplayedPrompt(response.requestId)) {
                return;
            }
            setWebToolApprovalRequest({
                requestId: response.requestId,
                toolName: response.toolName,
                content: response.content,
            });

        } else if (type === "intermediary_state") {
            const state = response.state;
            if ("serviceName" in state && "documentation" in state) {
                setDocGenIntermediaryState(state as DocumentationGeneratorIntermediaryState);
            }

        } else if (type === "generated_sources") {
            setCurrentFileArray(response.fileArray);

        } else if (type === "connector_generation_notification") {
            const connectorData = buildRequestCardData("connector", response);
            setMessages(prevMessages => {
                const msgs = [...prevMessages];
                const targetIndex = ensureAssistantMessage(msgs);
                const last = msgs[targetIndex];
                const entries = parseStream(last.content);
                const updated = upsertRequestCard(entries, "connector", connectorData);
                msgs[targetIndex] = { ...last, content: serializeStream(updated, last.content) };
                return msgs;
            });

        } else if (type === "configuration_collection_event") {
            const configurationData = buildRequestCardData("config", response);
            setMessages(prevMessages => {
                const msgs = [...prevMessages];
                const targetIndex = ensureAssistantMessage(msgs);
                const last = msgs[targetIndex];
                const entries = parseStream(last.content);
                const updated = upsertRequestCard(entries, "config", configurationData);
                msgs[targetIndex] = { ...last, content: serializeStream(updated, last.content) };
                return msgs;
            });

        } else if (type === "clarify_event") {
            const clarifyData = buildRequestCardData("ask", response);
            setMessages(prevMessages => {
                const msgs = [...prevMessages];
                const targetIndex = ensureAssistantMessage(msgs);
                const last = msgs[targetIndex];
                const entries = parseStream(last.content);
                const updated = upsertRequestCard(entries, "ask", clarifyData);
                msgs[targetIndex] = { ...last, content: serializeStream(updated, last.content) };
                return msgs;
            });

        } else if (type === "skill_enable_event") {
            const enableData = buildRequestCardData("skill_enable", response);
            setMessages(prevMessages => {
                const msgs = [...prevMessages];
                const targetIndex = ensureAssistantMessage(msgs);
                const last = msgs[targetIndex];
                const entries = parseStream(last.content);
                const updated = upsertRequestCard(entries, "skill_enable", enableData);
                msgs[targetIndex] = { ...last, content: serializeStream(updated, last.content) };
                return msgs;
            });

        } else if (type === "diagnostics") {
            currentDiagnosticsRef.current = response.diagnostics;

        } else if (type === "chat_component") {
            const { componentType, id, data } = response;
            setMessages(prevMessages => {
                const msgs = [...prevMessages];
                const targetIndex = ensureAssistantMessage(msgs);
                const last = msgs[targetIndex];
                const entries = parseStream(last.content);
                const updated = upsertComponent(entries, componentType, id, data);
                msgs[targetIndex] = { ...last, content: serializeStream(updated, last.content) };
                return msgs;
            });

        } else if (type === "generation_status") {
            const { generationId, status } = response;
            setMessages(prevMessages => applyGenerationStatus(prevMessages, generationId, status));

        } else if (type === "messages") {
            messagesRef.current = response.messages;

        } else if (type === "compaction_start") {
            setIsCompacting(true);

        } else if (type === "compaction_end") {
            setIsCompacting(false);

        } else if (type === "compaction_disabled") {
            setIsCompacting(false);
            setMessages(prevMessages => {
                const msgs = [...prevMessages];
                const targetIndex = ensureAssistantMessage(msgs);
                const last = msgs[targetIndex];
                msgs[targetIndex] = { ...last, content: last.content + COMPACTION_DISABLED_NOTICE };
                return msgs;
            });

        } else if (type === "usage_metrics") {
            const inputTokens = response.usage?.inputTokens ?? 0;
            const percentage = Math.min(100, Math.round((inputTokens / MAX_CONTEXT_WINDOW) * 100));
            const breakdown = response.breakdown;
            setContextUsage({ inputTokens, percentage, breakdown });

        } else if (type === "config_change") {
            if (response.key === 'showContextUsage') {
                setShowContextUsage(response.value);
            } else if (response.key === 'mcpToolsEnabled') {
                setMcpToolsEnabled(response.value);
            }

        } else if (type === "stop") {
            console.log("Received stop signal");
            setIsWebToolsEnabled(userWebSearchPreferenceRef.current);
            setWebToolApprovalRequest(null);
            setApprovalRequest(null);
            setIsCompacting(false);
            setIsCodeLoading(false);
            setIsLoading(false);
            setIsMigrationEnhancementRunning(false);
            setBackendRequestTriggered(false);
            fetchUsage();
            setAgentMode(AgentMode.Edit);
            if (activeScaffoldKeyRef.current && !isErrorChunkReceivedRef.current) {
                localStorage.setItem(activeScaffoldKeyRef.current, "1");
            }
            activeScaffoldKeyRef.current = null;

        } else if (type === "abort") {
            console.log("Received abort signal");
            abortHandledRef.current = true;
            activeScaffoldKeyRef.current = null;
            setIsWebToolsEnabled(userWebSearchPreferenceRef.current);
            setWebToolApprovalRequest(null);
            setApprovalRequest(null);
            setMessages(prevMessages => {
                const msgs = [...prevMessages];
                const targetIndex = ensureAssistantMessage(msgs);
                const last = msgs[targetIndex];
                const updated = appendAbortMarker(parseStream(last.content));
                msgs[targetIndex] = { ...last, content: serializeStream(updated, last.content) };
                return msgs;
            });
            setIsCompacting(false);
            setIsCodeLoading(false);
            setIsLoading(false);
            setBackendRequestTriggered(false);
            setAgentMode(AgentMode.Edit);
            if (isMigrationEnhancementRunning) {
                setIsMigrationEnhancementRunning(false);
                // Re-fetch session so the Resume card appears
                try {
                    const updatedSession = await rpcClient.getMigrateIntegrationRpcClient().getActiveMigrationSession();
                    setMigrationSession(updatedSession);
                } catch (e) {
                    console.error('[AIChat] Failed to refresh migration session after abort:', e);
                }
            }

        } else if (type === "save_chat") {
            console.log("Received save_chat signal");
            const messageId = response.messageId;
            const isRecoveryIntermediateWrite = replayingRef.current;
            await waitForMessagesCommit();
            const scopedAssistant = [...renderedMessagesRef.current]
                .reverse()
                .find((message) =>
                    (message.role === "Copilot" || message.role === "assistant")
                    && message.messageId === messageId
                );
            const fallbackAssistant = (
                response.generationId === undefined
                || activeRunGenerationIdRef.current === messageId
            )
                ? renderedMessagesRef.current[getLatestAssistantMessageIndex(renderedMessagesRef.current)]
                : undefined;
            const contentToSave = scopedAssistant?.content || fallbackAssistant?.content || "";
            try {
                await rpcClient.getAiPanelRpcClient().updateChatMessage({
                    messageId,
                    content: contentToSave,
                    projectRootPath: activeRunScopeRef.current?.projectRootPath,
                    threadId: activeRunScopeRef.current?.threadId,
                    clearRunBuffer: !isRecoveryIntermediateWrite,
                });
            } catch (error) {
                console.error("[AIChat] Failed to persist chat message:", error);
                if (isRecoveryIntermediateWrite) {
                    throw error;
                }
            }

        } else if (type === "followup_suggestions") {
            console.log(`[Followups] Received: ${response.suggestions.map(s => s.label).join(', ')}`);
            // Chips only ever describe a finished turn, so anything arriving mid-turn is stale.
            if (isLoadingRef.current) {
                return;
            }
            setFollowupSuggestions(response.suggestions);

        } else if (type === "error") {
            console.log("Received error signal");
            const errorContent = response.content;

            if (response.code === "usage_limit") {
                setIsUsageExceeded(true);
                fetchUsage();
                setIsCompacting(false);
                setIsCodeLoading(false);
                setIsLoading(false);
                isErrorChunkReceivedRef.current = true;
                return;
            }

            const errorTemplate = `\n\n<error data-system="true" data-auth="${SYSTEM_ERROR_SECRET}">${errorContent}</error>`;
            setMessages((prevMessages) => {
                const newMessages = [...prevMessages];
                const targetIndex = ensureAssistantMessage(newMessages);
                let content = newMessages[targetIndex].content;

                // Check if there's an unclosed code block and close it properly
                const codeBlockPattern = /<code filename="[^"]+">[\s]*```\w+/g;
                const openCodeBlocks = (content.match(codeBlockPattern) || []).length;
                const closedCodeBlocks = (content.match(/<\/code>/g) || []).length;

                if (openCodeBlocks > closedCodeBlocks) {
                    const endsWithPartialClose = /```\s*<\/cod?e?$/.test(content.trim());
                    const endsWithBackticks = /```\s*$/.test(content.trim());
                    const endsWithPartialBackticks = /`{1,2}$/.test(content.trim());

                    if (endsWithPartialClose) {
                        content = content.replace(/```\s*<\/cod?e?$/, "");
                        content += "\n```\n</code>";
                    } else if (endsWithBackticks) {
                        content += "\n</code>";
                    } else if (endsWithPartialBackticks) {
                        content = content.replace(/`{1,2}$/, "");
                        content += "\n```\n</code>";
                    } else {
                        content += "\n```\n</code>";
                    }
                }

                newMessages[targetIndex].content = content + errorTemplate;
                return newMessages;
            });
            setIsCompacting(false);
            setIsCodeLoading(false);
            setIsLoading(false);
            setBackendRequestTriggered(false);
            isErrorChunkReceivedRef.current = true;

        } else {
            // Tripwire: this assignment fails to compile when a new `ChatNotify` variant
            // is added, forcing an explicit decision instead of a silent drop. If the new
            // variant contributes to the persisted transcript, give it a branch above; if
            // it is genuinely presentational, add it to `PanelUnmodelledNotifyType` (and
            // check whether the mini chat needs the same branch — it authors the same
            // record). See that type for what this guard does NOT cover.
            //
            // Relies on aliased-discriminant narrowing (TS 4.4+) of `type`, so every
            // branch above must test `type`, not `response.type` — a branch that tests
            // `response.type` (or casts through `as any`) silently opts out of narrowing
            // and drops its own literal from this residual without failing the build.
            type ResidualAtTail = typeof type;
            // Forward direction: residual ⊆ declared. Catches an unhandled variant.
            const _unmodelled: PanelUnmodelledNotifyType = type;
            // Reverse direction: declared ⊆ residual. Catches a STALE entry — one that
            // has since gained a branch above, so the list would otherwise keep claiming
            // an event is unmodelled when it is actually folded. Assigning the narrowed
            // residual into the hand-written union only ever checks the forward direction,
            // so without this the list can silently rot into inaccurate documentation.
            // (`typeof type` captures the flow-narrowed residual at this point, not the
            // declared union — verified; that is what makes this check non-vacuous.)
            const _noStaleEntries: ResidualAtTail = {} as PanelUnmodelledNotifyType;
            void _unmodelled;
            void _noStaleEntries;
        }
    };

    // Keep the subscription behaviour identical to before (fresh closure per
    // render so `messages`-reading branches stay current), and expose the
    // latest handler via a ref for the reconnect/poll replay paths.
    handleChatNotifyRef.current = handleChatNotify;
    // Live subscription. While the reconnect gate is closed (mount → replay done),
    // queue events so they can't interleave with the async replay; the reconnect
    // effect drains them in order (seq-deduped) and opens the gate.
    const onLiveChatNotify = (response: ChatNotify) => {
        if (liveGateClosedRef.current) {
            liveQueueRef.current.push(response);
            return;
        }
        return handleChatNotify(response);
    };
    rpcClient?.onChatNotify(onLiveChatNotify);

    function generateNaturalProgrammingTemplate(isReqFileExists: boolean) {
        if (isReqFileExists) {
            upsertTemplate(
                commandTemplates,
                Command.NaturalProgramming,
                getTemplateById("code-doc-drift-check", NATURAL_PROGRAMMING_TEMPLATES)
            );
            upsertTemplate(
                commandTemplates,
                Command.NaturalProgramming,
                getTemplateById("generate-code-from-requirements", NATURAL_PROGRAMMING_TEMPLATES)
            );
            upsertTemplate(
                commandTemplates,
                Command.NaturalProgramming,
                getTemplateById("generate-test-from-requirements", NATURAL_PROGRAMMING_TEMPLATES)
            );
            removeTemplate(commandTemplates, Command.NaturalProgramming, "generate-code-from-following-requirements");
        } else {
            upsertTemplate(
                commandTemplates,
                Command.NaturalProgramming,
                getTemplateById("generate-code-from-following-requirements", NATURAL_PROGRAMMING_TEMPLATES)
            );
            upsertTemplate(
                commandTemplates,
                Command.NaturalProgramming,
                getTemplateById("code-doc-drift-check", NATURAL_PROGRAMMING_TEMPLATES)
            );
            upsertTemplate(
                commandTemplates,
                Command.NaturalProgramming,
                getTemplateById("generate-test-from-requirements", NATURAL_PROGRAMMING_TEMPLATES)
            );
            removeTemplate(commandTemplates, Command.NaturalProgramming, "generate-code-from-requirements");
        }
    }

    useEffect(() => {
        generateNaturalProgrammingTemplate(isReqFileExists);
    }, [isReqFileExists]);

    useEffect(() => {
        const scrollToEnd = (behavior: ScrollBehavior) => {
            messagesEndRef.current?.scrollIntoView({ behavior, block: "end" });
        };
        scrollToEnd("smooth");
        // Once the turn settles the layout keeps growing (review/restore bar,
        // markdown + code highlighting), so smooth-scroll lands on a stale
        // bottom — snap to the true end after that late growth.
        if (!isLoading && !isCodeLoading) {
            const t = setTimeout(() => scrollToEnd("auto"), 120);
            return () => clearTimeout(t);
        }
    }, [messages, isLoading, isCodeLoading, followupSuggestions]);

    async function handleSendQuery(content: {
        input: Input[];
        attachments: Attachment[];
        metadata?: Record<string, any>;
    }) {
        // Clear previous generation refs
        currentDiagnosticsRef.current = [];
        functionsRef.current = [];
        lastAttatchmentsRef.current = null;
        setCurrentFileArray([]);

        try {
            await processContent(content);
        } catch (error: any) {
            setIsCompacting(false);
            setIsLoading(false);
            setIsCodeLoading(false);
            if (abortHandledRef.current || error.name === "AbortError") {
                abortHandledRef.current = false;
                // The "abort" notification already appended the interruption marker.
            } else if (error?.name === "UsageLimitError" || error?.statusCode === 429) {
                setIsUsageExceeded(true);
                fetchUsage();
                isErrorChunkReceivedRef.current = true;
                activeScaffoldKeyRef.current = null;
            } else {
                updateLastMessage((lastContent) => {
                    if (error && "message" in error) {
                        return lastContent + `\n\n<error data-system="true" data-auth="${SYSTEM_ERROR_SECRET}">${error.message}</error>`;
                    }
                    return lastContent + `\n\n<error data-system="true" data-auth="${SYSTEM_ERROR_SECRET}">${error}</error>`;
                });
            }
        }
    }

    /**
     * Handles the user clicking "Resume/Start AI Enhancement" from the migration
     * context card. Seeds any saved conversation history, then submits the
     * auto-fix prompt via the default prompt mechanism.
     */
    async function handleContinueMigrationEnhancement() {
        try {
            // Prime the chat UI so streaming events have a message to append to
            setMigrationSession(null);
            setIsLoading(true);

            // aiFeatureUsed=true && fullyEnhanced=false means enhancement was previously
            // started (at the wizard or via AI Chat) but never finished — this is a resume.
            const isResume = migrationSession?.aiFeatureUsed === true;

            if (isResume) {
                // Load any persisted history into the chat UI before resuming
                const historyMessages = await rpcClient.getMigrateIntegrationRpcClient().getMigrationHistoryMessages();
                if (historyMessages.length > 0) {
                    const historyUiMessages = historyMessages.map((m) => ({
                        role: m.role === "user" ? "User" : "Copilot",
                        content: m.content,
                        type: m.role === "user" ? "user_message" : "assistant_message",
                    }));
                    setMessages((prev) => [...prev, ...historyUiMessages]);
                }
            }

            // Push the user trigger and empty assistant placeholder
            setMessages((prevMessages) => [
                ...prevMessages,
                { role: "User", content: isResume ? "Continue AI Enhancement" : "Start AI Enhancement", type: "user_message" },
                { role: "Copilot", content: "", type: "assistant_message" },
            ]);

            setIsMigrationEnhancementRunning(true);

            // Seed saved conversation history into AI chat state
            await rpcClient.getMigrateIntegrationRpcClient().seedMigrationHistory();
            // Prepare the pipeline (updates toml, sets _wizardProjectRoot, marks session active, flags AI Chat routing)
            await rpcClient.getMigrateIntegrationRpcClient().startMigrationEnhancement();
            // Actually start the wizard-level streaming pipeline — events now routed to AI Chat
            await rpcClient.getMigrateIntegrationRpcClient().wizardEnhancementReady();
        } catch (error) {
            console.error('[AIChat] Failed to continue migration enhancement:', error);
            setIsMigrationEnhancementRunning(false);
            setIsLoading(false);
        }
    }

    /**
     * Handles the user clicking "Auto-fix" from the "none" banner.
     * Calls the backend to update the toml and start the pipeline, which will
     * push a new default prompt – the `onPromptUpdated` listener picks it up and
     * triggers the auto-submit effect.
     */
    async function handleSend(content: { input: Input[]; attachments: Attachment[]; metadata?: Record<string, any> }) {
        // A new run's beginRun resets the backend event buffer — wait for the
        // mount-time reconnect to finish replaying/persisting any buffered run
        // first, so an auto-submitted prompt can't wipe a finished run's
        // not-yet-persisted tail (review chip and final transcript included).
        await reconnectSettledRef.current;
        setCurrentGeneratingPromptIndex(otherMessages.length);
        setIsPromptExecutedInCurrentWindow(true);
        setFeedbackGiven(null);
        setFollowupSuggestions([]);

        if (content.input.length === 0) {
            return;
        }
        const generationId = `msg-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
        activeRunGenerationIdRef.current = generationId;
        activeRunScopeRef.current = undefined;
        runEpochRef.current += 1;
        runAcknowledgedRef.current = false;
        // Clear until onCheckpointCaptured repopulates with the new set
        setAvailableCheckpointIds(new Set());
        rpcClient.getAiPanelRpcClient().clearInitialPrompt();
        setMessages((prevMessages) => prevMessages.filter((message) => message.type !== "label"));
        setMessages((prevMessages) => prevMessages.filter((message) => message.type !== "question"));
        setIsLoading(true);
        isErrorChunkReceivedRef.current = false;
        // Reset reconnection safeguards for the explicitly identified new run
        // and arm the polling fallback.
        if (ENABLE_STREAM_SAFEGUARDS) {
            lastReceivedSeqRef.current = 0;
            lastEventTimeRef.current = Date.now();
            terminalEventReceivedRef.current = false;
        }
        setBackendRequestTriggered(true);
        setMessages((prevMessages) =>
            prevMessages.filter((message, index) => index <= lastQuestionIndex || message.type !== "question")
        );

        const stringifiedContent = stringifyInputArrayWithBadges(content.input);
        const uerMessage = getUserMessage([stringifiedContent, content.attachments]);
        setMessages((prevMessages) => [
            ...prevMessages,
            { role: "User", content: uerMessage, type: "user_message", messageId: generationId },
            { role: "Copilot", content: "", type: "assistant_message", messageId: generationId },
        ]);

        await handleSendQuery(content);
    }

    function getUserMessage(content: [string, Attachment[]]): string {
        const [message, attachments] = content;

        return attachments.reduce((acc, attachment) => {
            return acc + `<attachment>${attachment.name}</attachment>`;
        }, message);
    }

    async function processContent(content: {
        input: Input[];
        attachments: Attachment[];
        metadata?: Record<string, any>;
    }) {
        const inputText = stringifyInputArrayWithBadges(content.input);
        const parsedInput = parseInput(content.input, commandTemplates);
        const attachments = content.attachments;
        let metadata = content.metadata;

        if (parsedInput && "type" in parsedInput && parsedInput.type === "error") {
            throw new Error(parsedInput.message);
        } else if ("text" in parsedInput && !("command" in parsedInput)) {
            if (metadata?.selectedSkillId) {
                const existing = hiddenContextRef.current ? `${hiddenContextRef.current}\n` : "";
                const argsClause = metadata.selectedSkillArgs
                    ? ` and args="${metadata.selectedSkillArgs}"`
                    : '';
                hiddenContextRef.current = `${existing}The user has explicitly selected the "${metadata.selectedSkillId}" skill. You MUST call invoke_skill with skillName="${metadata.selectedSkillId}"${argsClause} and apply its rules. Invoke it immediately before you begin the work the skill governs (for example, right before editing the relevant file), not as a separate up-front step.`;
            }
            await processAgentGeneration(parsedInput.text, attachments);
        } else if ("command" in parsedInput) {
            switch (parsedInput.command) {
                case Command.NaturalProgramming: {
                    let useCase = "";
                    switch (parsedInput.templateId) {
                        case "code-doc-drift-check":
                            await processLLMDiagnostics();
                            break;
                        case "generate-code-from-following-requirements":
                            await rpcClient.getAiPanelRpcClient().updateRequirementSpecification({
                                content: parsedInput.placeholderValues.requirements
                            });
                            setIsReqFileExists(true);

                            useCase = parsedInput.placeholderValues.requirements;
                            await processAgentGeneration(
                                useCase, attachments, "CODE_FOR_USER_REQUIREMENT"
                            );
                            break;
                        case "generate-test-from-requirements":
                            rpcClient.getAiPanelRpcClient().createTestDirecoryIfNotExists();

                            useCase = getTemplateTextById(
                                commandTemplates,
                                Command.NaturalProgramming,
                                "generate-test-from-requirements"
                            );
                            await processAgentGeneration(
                                useCase, attachments, "TESTS_FOR_USER_REQUIREMENT"
                            );
                            break;
                        case "generate-code-from-requirements":
                            useCase = getTemplateTextById(
                                commandTemplates,
                                Command.NaturalProgramming,
                                "generate-code-from-requirements"
                            );
                            await processAgentGeneration(
                                useCase, attachments, "CODE_FOR_USER_REQUIREMENT"
                            );
                            break;
                    }
                    break;
                }
                case Command.TypeCreator: {
                    switch (parsedInput.templateId) {
                        case "types-for-attached":
                            if (attachments) {
                                await processContextTypeCreation(attachments);
                                break;
                            } else {
                                throw new Error("Error: Missing Attach context");
                            }
                    }
                    break;
                }
                // case Command.Healthcare: {
                //     switch (parsedInput.templateId) {
                //         case TemplateId.Wildcard:
                //             await processHealthcareCodeGeneration(parsedInput.text, inputText);
                //             break;
                //     }
                //     break;
                // }
                case Command.Ask: {
                    switch (parsedInput.templateId) {
                        case TemplateId.Wildcard:
                            await findInDocumentation(parsedInput.text, inputText);
                            break;
                    }
                    break;
                }
                case Command.OpenAPI: {
                    switch (parsedInput.templateId) {
                        case TemplateId.Wildcard:
                            await processOpenAPICodeGeneration(parsedInput.text, inputText);
                            break;
                    }
                    break;
                }
                case Command.Doc: {
                    switch (parsedInput.templateId) {
                        case "generate-user-doc":
                            await processUserDocGeneration(parsedInput.placeholderValues.servicename);
                            break;
                    }
                    break;
                }
                /*
                case Command.Compact: {
                    setIsCompacting(true);
                    const customInstructions = parsedInput.templateId === TemplateId.Wildcard
                        ? parsedInput.text?.trim() || undefined
                        : undefined;
                    const result = await rpcClient.getAiPanelRpcClient().compactConversation(
                        customInstructions ? { customInstructions } : {}
                    );
                    if (!result.success) {
                        throw new Error(result.error || 'Compaction failed');
                    }
                    // Reload the compacted history from backend and reset all UI state.
                    // Without this, isLoading stays true (input disabled) and the old
                    // messages remain on screen because the success path never resets state.
                    const updatedMessages = await rpcClient.getAiPanelRpcClient().getChatMessages();
                    const uiMessages = convertToUIMessages(updatedMessages);
                    const summaryContent = result.summary
                        ? `This session is being continued from a previous conversation that ran out of context. The summary below covers the earlier portion of the conversation.\n\n**Summary**\n\n${result.summary}`
                        : `Context compacted successfully. You can continue the conversation.`;
                    uiMessages.push({
                        role: 'Copilot',
                        content: summaryContent,
                        type: 'assistant_message',
                        checkpointId: '',
                        messageId: '',
                    });
                    setMessages(uiMessages);
                    setIsCompacting(false);
                    setIsLoading(false);
                    setIsCodeLoading(false);
                    setCurrentFileArray([]);
                    setLastQuestionIndex(-1);
                    setCurrentGeneratingPromptIndex(-1);
                    break;
                }
                */
            }
        }
    }

    const handleAddAllCodeSegmentsToWorkspace = async (
        codeSegments: any,
        setIsCodeAdded: React.Dispatch<React.SetStateAction<boolean>>,
        command: string    ) => {
        console.log("Add to integration called. Command: ", command);
        const fileChanges: FileChanges[] = [];
        for (let { segmentText, filePath } of codeSegments) {
            fileChanges.push({
                filePath: filePath,
                content: segmentText,
            });
        }
        await rpcClient.getAiPanelRpcClient().addFilesToProject({
            fileChanges: fileChanges,
        })
        setIsAddingToWorkspace(true);
    };

    const handleRevertChanges = async (
        codeSegments: any,
        setIsCodeAdded: React.Dispatch<React.SetStateAction<boolean>>,
        command: string
    ) => {
        console.log("Revert gration called. Command: ", command);
        setIsAddingToWorkspace(true);
    };

    async function processUserDocGeneration(serviceName: string) {
        try {
            const requestBody: DocGenerationRequest = {
                type: DocGenerationType.User,
                serviceName: serviceName,
            };

            await rpcClient.getAiPanelRpcClient().getGeneratedDocumentation(requestBody);
        } catch (error: any) {
            setIsLoading(false);
            const errorName = error instanceof Error ? error.name : "Unknown error";
            const errorMessage = "message" in error ? error.message : "Unknown error";

            if (errorName === "AbortError") {
                throw new Error("Failed: The user cancelled the request.");
            } else {
                throw new Error(errorMessage);
            }
        }
    }

    async function processContextTypeCreation(attachments: Attachment[]) {
        if (!attachments || attachments.length === 0) {
            throw new Error(`Missing attachment`);
        }

        await rpcClient.getAiPanelRpcClient().generateContextTypes({
            attachments
        });
    }

    async function findInDocumentation(messageBody: string, message: string) {
        let assistant_response = "";
        let formatted_response = ";";
        setIsLoading(true);
        try {
            assistant_response = await rpcClient.getAiPanelRpcClient().getFromDocumentation(messageBody);
            formatted_response = assistant_response.replace(
                /^([ \t]*)```ballerina\s*\n([\s\S]*?)^[ \t]*```/gm,
                (_, indent, codeBlock) => {
                    // Remove the common indent from all lines in the code block
                    const cleanedCode = codeBlock
                        .split("\n")
                        .map((line: string) => (line.startsWith(indent) ? line.slice(indent.length) : line))
                        .join("\n");

                    return `<inlineCode>\n${cleanedCode}\n<inlineCode>`;
                }
            );

            const referenceRegex = /reference sources:\s*((?:<https?:\/\/[^\s>]+>\s*)+)/;
            const match = formatted_response.match(referenceRegex);

            if (match) {
                const references = match[1].trim().split(/\s+/);
                const referencesTag = `<references>${JSON.stringify(references)}<references>`;
                formatted_response = formatted_response.replace(referenceRegex, referencesTag);
            }

            updateLastMessage(() => formatted_response);
            setIsLoading(false);
        } catch (error) {
            setIsLoading(false);
            throw error;
        }
    }

    async function processOpenAPICodeGeneration(useCase: string, message: string) {
        const requestBody: any = {
            query: useCase,
            chatHistory: [],
        };

        await rpcClient.getAiPanelRpcClient().generateOpenAPI(requestBody);
    }

    async function processAgentGeneration(useCase: string, attachments: Attachment[], operationType?: OperationType) {
        const fileAttatchments = attachments.map((file) => ({
            fileName: file.name,
            content: file.content,
            mimeType: file?.mimeType,
        }));

        const currentCodeContext = codeContextRef.current;
        const currentHiddenContext = hiddenContextRef.current;
        hiddenContextRef.current = undefined;
        console.log("Submitting agent prompt:", { useCase, agentMode: agentModeRef.current, codeContext: currentCodeContext, operationType, fileAttatchments });
        await rpcClient.getAiPanelRpcClient().generateAgent({
            generationId: activeRunGenerationIdRef.current,
            promptSource: 'ai-panel',
            usecase: useCase, hiddenContext: currentHiddenContext, isPlanMode: agentModeRef.current === AgentMode.Plan, codeContext: currentCodeContext, operationType, fileAttachmentContents: fileAttatchments, webSearchEnabled: isWebToolsEnabled
        });
    }

    async function handleStop() {
        if (isMigrationEnhancementRunning) {
            // Stop the migration agent - partial state and VS Code notification are
            // handled by the orchestrator's abort catch block.
            await rpcClient.getMigrateIntegrationRpcClient().abortMigrationAgent();
            setIsLoading(false);
            setIsCodeLoading(false);
            return;
        }
        // Call RPC with empty params (defaults to current workspace + 'default' thread)
        rpcClient.getAiPanelRpcClient().abortAIGeneration({});

        setIsLoading(false);
        setIsCodeLoading(false);
    }

    async function handleSettings() {
        pushPanel("settings");
    }

    async function handleClearChat(): Promise<void> {
        setMessages([]);
        setApprovalRequest(null);
        setContextUsage(null);
        setFollowupSuggestions([]);
        setAgentMode(AgentMode.Edit);
        await rpcClient.getAiPanelRpcClient().clearChat();
        loadThreads();
    }

    // Six call sites fire this without serializing, so a slow earlier response could otherwise
    // overwrite a newer list — or end the spinner while a newer request is still running.
    const loadThreadsSeqRef = useRef(0);

    async function loadThreads(): Promise<void> {
        const seq = ++loadThreadsSeqRef.current;
        setThreadsLoading(true);
        setThreadsError(null);
        try {
            const list = await rpcClient.getAiPanelRpcClient().listThreads();
            if (seq !== loadThreadsSeqRef.current) { return; }
            setThreads(list);
        } catch (error) {
            if (seq !== loadThreadsSeqRef.current) { return; }
            console.error('[AIChat] Failed to load chat sessions:', error);
            setThreadsError("Couldn't load sessions. Close and reopen to retry.");
        } finally {
            if (seq === loadThreadsSeqRef.current) { setThreadsLoading(false); }
        }
    }

    async function handleSwitchThread(threadId: string): Promise<void> {
        await rpcClient.getAiPanelRpcClient().switchThread({ threadId });

        // Reload messages and checkpoints for the newly active thread in parallel
        const [msgs, checkpoints] = await Promise.all([
            rpcClient.getAiPanelRpcClient().getChatMessages(),
            rpcClient.getAiPanelRpcClient().getCheckpoints(),
        ]);

        setMessages(msgs.map(m => ({ role: m.role === "user" ? "User" : "Copilot", content: m.content, type: "text", checkpointId: m.checkpointId, messageId: m.messageId, generationStatus: m.generationStatus })));

        // Rebuild the checkpoint availability set for the switched-to thread.
        // Without this, every checkpointId from the old thread would be absent from the set
        // and all restore buttons would appear disabled.
        setAvailableCheckpointIds(new Set(checkpoints.map(cp => cp.id)));

        setRestoringCheckpointId(null);
        setApprovalRequest(null);
        setContextUsage(null);
        await refreshFollowupSuggestions();
        loadThreads();
    }

    async function handleDeleteThread(threadId: string): Promise<void> {
        await rpcClient.getAiPanelRpcClient().deleteThread({ threadId });

        // Reload messages and checkpoints for the (possibly new) active thread
        const [msgs, checkpoints] = await Promise.all([
            rpcClient.getAiPanelRpcClient().getChatMessages(),
            rpcClient.getAiPanelRpcClient().getCheckpoints(),
        ]);
        setMessages(msgs.map(m => ({ role: m.role === "user" ? "User" : "Copilot", content: m.content, type: "text", checkpointId: m.checkpointId, messageId: m.messageId, generationStatus: m.generationStatus })));
        setAvailableCheckpointIds(new Set(checkpoints.map(cp => cp.id)));
        setRestoringCheckpointId(null);
        setApprovalRequest(null);
        setContextUsage(null);
        await refreshFollowupSuggestions();
        loadThreads();
    }

    async function handleRenameThread(threadId: string, name: string): Promise<void> {
        await rpcClient.getAiPanelRpcClient().renameThread({ threadId, name });
        loadThreads();
    }

    const handleToggleAutoApprove = () => {
        const newValue = !isAutoApproveEnabled;
        setIsAutoApproveEnabled(newValue);
    };

    const handleToggleWebSearch = () => {
        const next = !isWebToolsEnabled;
        userWebSearchPreferenceRef.current = next;
        setIsWebToolsEnabled(next);
    };

    const handleChangeAgentMode = (mode: AgentMode) => {
        // message.content is already up-to-date with the serialized agent stream — nothing to persist here
        setAgentMode(mode);
    };

    const questionMessages = messages.filter((message) => message.type === "question");
    if (questionMessages.length > 0) {
        // localStorage.setItem(
        //     `Question-AIGenerationChat-${projectUuid}`,
        //     questionMessages[questionMessages.length - 1].content
        // );
    }
    const otherMessages = messages.filter((message) => message.type !== "question");
    useEffect(() => {
        // Set the currentGeneratingPromptIndex to the last prompt index whenever otherMessages updates
        if (otherMessages.length > 0) {
            setCurrentGeneratingPromptIndex(otherMessages.length - 1);
        }
    }, [otherMessages.length]);


    const saveDocumentation = async () => {
        if (!docGenIntermediaryState) return;

        setIsAddingToWorkspace(true);
        try {
            rpcClient.getAiPanelRpcClient().addFilesToProject({
                fileChanges: [
                    {
                        filePath: `docs/api_doc.md`,
                        content: docGenIntermediaryState.documentation,
                    },
                ],
            });

            // Update the stream item to show "Saved" state
            setMessages((prevMessages) => {
                const msgs = [...prevMessages];
                const targetIndex = msgs.findLastIndex((m: any) => m.actor === "copilot");
                if (targetIndex === -1) return prevMessages;
                const last = msgs[targetIndex];
                const entries = parseStream(last.content);
                const updated = entries.map((entry: StreamEntry) => ({
                    ...entry,
                    items: entry.items.map((item: StreamItem) =>
                        item.kind === "component" && (item as any).componentType === "button" && (item as any).data.buttonType === "save_documentation"
                            ? { kind: "component" as const, componentType: "button", data: { buttonType: "documentation_saved" } }
                            : item
                    )
                }));
                msgs[targetIndex] = { ...last, content: serializeStream(updated, last.content) };
                return msgs;
            });
        } catch (error) {
            console.error("Error saving documentation:", error);
        } finally {
            setIsAddingToWorkspace(false);
        }
    };

    const regenerateDocumentation = async () => {
        if (!docGenIntermediaryState) return;

        setMessages((prevMessages) => {
            const newMessages = [...prevMessages];
            const targetIndex = ensureAssistantMessage(newMessages);
            newMessages[targetIndex].content = "";
            return newMessages;
        });

        setIsLoading(true);
        await rpcClient.getAiPanelRpcClient().getGeneratedDocumentation({
            type: DocGenerationType.User,
            serviceName: docGenIntermediaryState.serviceName,
        });
    };

    const handleRetryRepair = async () => {
        //TODO: Remove this and implement retry UX with agent.
    };

    const handleApprovalApprove = async (enableAutoApprove: boolean) => {
        if (!approvalRequest) return;

        // Update auto-approve setting (managed locally in visualizer)
        if (enableAutoApprove !== isAutoApproveEnabled) {
            setIsAutoApproveEnabled(enableAutoApprove);
        }

        // Approve plan or task
        if (approvalRequest.approvalType === "plan") {
            await rpcClient.getAiPanelRpcClient().approvePlan({
                requestId: approvalRequest.requestId,
                comment: undefined
            });
        } else if (approvalRequest.approvalType === "completion") {
            const reviewTasks = approvalRequest.tasks.filter(t => t.status === "review");
            const lastReviewTask = reviewTasks[reviewTasks.length - 1];

            await rpcClient.getAiPanelRpcClient().approveTask({
                requestId: approvalRequest.requestId,
                approvedTaskDescription: lastReviewTask?.description
            });
        }

        setApprovalRequest(null);
    };

    const handleApprovalReject = async (comment: string) => {
        if (!approvalRequest) return;

        if (approvalRequest.approvalType === "plan") {
            await rpcClient.getAiPanelRpcClient().declinePlan({
                requestId: approvalRequest.requestId,
                comment
            });
        } else if (approvalRequest.approvalType === "completion") {
            await rpcClient.getAiPanelRpcClient().declineTask({
                requestId: approvalRequest.requestId,
                comment
            });
        }

        setApprovalRequest(null);
    };

    const handleWebToolAllow = async () => {
        if (!webToolApprovalRequest) return;
        await rpcClient.getAiPanelRpcClient().approveWebTool({ requestId: webToolApprovalRequest.requestId });
        setWebToolApprovalRequest(null);
    };

    const handleWebToolDeny = async () => {
        if (!webToolApprovalRequest) return;
        await rpcClient.getAiPanelRpcClient().declineWebTool({ requestId: webToolApprovalRequest.requestId });
        setWebToolApprovalRequest(null);
    };

    async function processLLMDiagnostics() {
        let response: LLMDiagnostics = await rpcClient.getAiPanelRpcClient().getDriftDiagnosticContents();

        const responseStatus = response.statusCode;
        const invalidResponse = response == null || response.statusCode == null;

        if (invalidResponse) {
            throw new Error(DRIFT_CHECK_ERROR);
        }

        if (!(responseStatus >= 200 && responseStatus < 300)) {
            throw new Error(DRIFT_CHECK_ERROR);
        }

        if (response.diags == null || response.diags == "") {
            response.diags = NO_DRIFT_FOUND;
        }

        setIsLoading(false);

        setMessages((prevMessages) => {
            const newMessage = [...prevMessages];
            const targetIndex = ensureAssistantMessage(newMessage);
            newMessage[targetIndex].content = response.diags;
            return newMessage;
        });
    }
    return (
        <>
            {panelStack.length === 0 && (
                <AIChatView style={{ position: "relative" }}>
                    {approvalOverlay.show && (
                        <ApprovalOverlay>
                            <OverlayMessage>
                                <span>{approvalOverlay.message || 'Processing...'}</span>
                                {approvalOverlay.requestId && (
                                    <OverlayCloseButton
                                        title="Close"
                                        aria-label="Close"
                                        onClick={() => {
                                            rpcClient
                                                .getVisualizerRpcClient()
                                                .handleApprovalPopupClose({ requestId: approvalOverlay.requestId! });
                                        }}
                                    >
                                        <span className="codicon codicon-close" />
                                    </OverlayCloseButton>
                                )}
                            </OverlayMessage>
                        </ApprovalOverlay>
                    )}
                    <Header>
                        {loginMethod === LoginMethod.ANTHROPIC_KEY || loginMethod === LoginMethod.AWS_BEDROCK || loginMethod === LoginMethod.VERTEX_AI || loginMethod === LoginMethod.ANTHROPIC_AWS ? (
                            <AuthProviderChip>
                                <UsageBadge>
                                    <span className="codicon codicon-key" style={{ fontSize: 11 }} />
                                    {loginMethod === LoginMethod.ANTHROPIC_KEY ? "Anthropic (own key)"
                                        : loginMethod === LoginMethod.AWS_BEDROCK ? "AWS Bedrock (own key)"
                                        : loginMethod === LoginMethod.ANTHROPIC_AWS ? "Anthropic AWS (own key)"
                                        : "Vertex AI (own key)"}
                                </UsageBadge>
                            </AuthProviderChip>
                        ) : (
                            <AuthProviderChip>
                                Usage:
                                {usage?.resetsIn === -1 ? (
                                    <Tooltip content="Subject to fair usage policy.">
                                        <UsageBadge>Unlimited</UsageBadge>
                                    </Tooltip>
                                ) : !usage ? (
                                    <UsageBadge>N/A</UsageBadge>
                                ) : (
                                    <Tooltip content={`Resets in ${formatResetsInExact(usage.resetsIn)}`}>
                                        <UsageBadge>{isUsageExceeded ? "100%" : `${Math.round(100 - usage.remainingUsagePercentage)}%`}</UsageBadge>
                                    </Tooltip>
                                )}
                                {isUsageExceeded && (
                                    <Tooltip content="Check usage again">
                                        <UsageRefreshButton
                                            type="button"
                                            onClick={() => { void handleRecheckUsage(); }}
                                            disabled={recheckingUsage}
                                            aria-label="Check usage again"
                                        >
                                            <span className={`codicon codicon-refresh${recheckingUsage ? " codicon-modifier-spin" : ""}`} style={{ fontSize: 12 }} />
                                        </UsageRefreshButton>
                                    </Tooltip>
                                )}
                            </AuthProviderChip>
                        )}
                        <HeaderButtons>
                            {/* New chat is created from a row inside the dropdown, not from this button. */}
                            <div style={{ position: "relative" }}>
                                <Button
                                    appearance="icon"
                                    onClick={() => { void loadThreads(); setHistoryOpen(v => !v); }}
                                    tooltip="Chat sessions"
                                >
                                    <Icon name="CopilotChatRounded" sx={{ fontSize: "18px", marginRight: 6 }} iconSx={{ position: "relative" }} />
                                    Chats
                                </Button>
                                {historyOpen && (
                                    <SessionHistoryDropdown
                                        threads={threads}
                                        loading={threadsLoading}
                                        error={threadsError}
                                        readOnly={isLoading}
                                        onNewChat={handleClearChat}
                                        onSwitch={handleSwitchThread}
                                        onDelete={handleDeleteThread}
                                        onRename={handleRenameThread}
                                        onClose={() => setHistoryOpen(false)}
                                    />
                                )}
                            </div>
                            <Button appearance="icon" onClick={() => handleSettings()} tooltip="Settings">
                                <Icon name="SettingsRounded" sx={{ fontSize: "18px", marginRight: 6 }} iconSx={{ position: "relative" }} />
                                Settings
                            </Button>
                        </HeaderButtons>
                    </Header>
                    <main style={{ flex: 1, overflowY: "auto" }}>
                        {migrationSession && (
                            <MigrationContextCard
                                session={migrationSession}
                                onContinueEnhancement={handleContinueMigrationEnhancement}
                            />
                        )}
                        {Array.isArray(otherMessages) && otherMessages.length === 0 && (
                            <WelcomeMessage isOnboarding={getOnboardingOpens() <= 3.0} />
                        )}
                        {(() => {
                            // Group flat message list into [userMsg, assistantMsg | undefined] pairs for turn-level hover
                            const turns: Array<[typeof otherMessages[0], number, typeof otherMessages[0] | undefined, number | undefined]> = [];
                            let i = 0;
                            while (i < otherMessages.length) {
                                const msg = otherMessages[i];
                                if (msg.role === "User") {
                                    const next = otherMessages[i + 1];
                                    const hasAssistant = next?.role === "Copilot";
                                    turns.push([msg, i, hasAssistant ? next : undefined, hasAssistant ? i + 1 : undefined]);
                                    i += hasAssistant ? 2 : 1;
                                } else {
                                    turns.push([msg, i, undefined, undefined]);
                                    i++;
                                }
                            }
                            const lastAssistantIndex = otherMessages.map((m) => m.role).lastIndexOf("Copilot");

                            return turns.map(([userMsg, userIndex, assistantMsg, assistantIndex], turnIndex) => {
                                const renderMessage = (message: typeof otherMessages[0], index: number) => {
                                    const isLastResponse = index === currentGeneratingPromptIndex;
                                    const isUserMessage = message.role === "User";
                                    const isAssistantMessage = message.role === "Copilot";
                                    const isLatestAssistantMessage = isAssistantMessage && index === lastAssistantIndex;
                                    const reviewBar = deriveReviewBarState(message.generationStatus, isLatestAssistantMessage, isLoading);

                            // Note: Cannot use useMemo here as it's inside map() callback
                            // The stateless regex implementation in splitContent() ensures no corruption during streaming
                            const segmentedContent = splitContent(message.content);
                            return (
                                <ChatMessage key={index}>
                                    {/* Checkpoint separator before user messages */}
                                    {message.role === "User" && (() => {
                                        // Show "Creating checkpoints..." while loading for the latest user message
                                        // Once done loading, show the restore button
                                        const isLatestUserMessage = index === otherMessages.length - 2;
                                        const shouldShowCreating = isLoading && isLatestUserMessage;
                                        const shouldShowRestore = !isLoading && message.checkpointId;

                                        return (
                                            <>
                                                {/* Show "Creating checkpoints..." while generating for latest message */}
                                                {shouldShowCreating && (
                                                    <CheckpointSeparator
                                                        checkpointId={message.checkpointId}
                                                        isAvailable={false}
                                                        isDisabled={true}
                                                        isCreating={true}
                                                        isGroupHovered={hoveredTurnIndex === turnIndex}
                                                        onRestore={handleCheckpointRestore}
                                                    />
                                                )}
                                                {/* Show restore button when done loading */}
                                                {shouldShowRestore && (
                                                    <CheckpointSeparator
                                                        checkpointId={message.checkpointId}
                                                        isAvailable={availableCheckpointIds.has(message.checkpointId)}
                                                        isDisabled={isLoading || restoringCheckpointId !== null}
                                                        isCreating={false}
                                                        isRestoring={restoringCheckpointId === message.checkpointId}
                                                        isGroupHovered={hoveredTurnIndex === turnIndex}
                                                        onRestore={handleCheckpointRestore}
                                                    />
                                                )}
                                            </>
                                        );
                                    })()}

                                    <MessageBody isUserMessage={isUserMessage}>
                                        {segmentedContent.map((segment, i) => {
                                            if (segment.type === SegmentType.AgentStream) {
                                                const stream = segment.stream ?? [];
                                                const allItems = stream.flatMap((e: StreamEntry) => e.items);
                                                const buttonItems = allItems.filter((item: StreamItem) => item.kind === "component" && (item as any).componentType === "button");
                                                const reviewItem = allItems.find((item: StreamItem) => item.kind === "component" && (item as any).componentType === "review");
                                                return (
                                                    <React.Fragment key={`agent-stream-${i}`}>
                                                        <AgentStreamView
                                                            stream={stream}
                                                            isLoading={isLoading && isLatestAssistantMessage}
                                                            rpcClient={rpcClient}
                                                        />
                                                        {reviewItem && (
                                                            <ReviewBar
                                                                modifiedFiles={(reviewItem as any).data.modifiedFiles ?? []}
                                                                semanticDiffs={(reviewItem as any).data.semanticDiffs}
                                                                loadDesignDiagrams={(reviewItem as any).data.loadDesignDiagrams}
                                                                isWorkspace={(reviewItem as any).data.isWorkspace}
                                                                diffPackageMap={(reviewItem as any).data.diffPackageMap}
                                                                generationId={(reviewItem as any).data.generationId}
                                                                isDiscarded={reviewBar.isDiscarded}
                                                                rpcClient={isLatestAssistantMessage ? rpcClient : undefined}
                                                                isActive={reviewBar.isActive}
                                                            />
                                                        )}
                                                        {buttonItems.map((item: StreamItem, ci: number) => {
                                                            const buttonType = (item as any).data.buttonType;
                                                            if (buttonType === "save_documentation" && !isCodeLoading && isLastResponse && !isLoading) {
                                                                return (
                                                                    <div key={`comp-${ci}`} style={{ display: "flex", gap: "10px" }}>
                                                                        <VSCodeButton title="Save Documentation" onClick={saveDocumentation}>Save Documentation</VSCodeButton>
                                                                        <VSCodeButton title="Regenerate documentation" appearance="secondary" onClick={regenerateDocumentation}>
                                                                            <Codicon name="refresh" />
                                                                        </VSCodeButton>
                                                                    </div>
                                                                );
                                                            }
                                                            if (buttonType === "documentation_saved") {
                                                                return <VSCodeButton key={`comp-${ci}`} title="Documentation has been saved" disabled>Saved</VSCodeButton>;
                                                            }
                                                            return null;
                                                        })}
                                                    </React.Fragment>
                                                );
                                            }

                                            if (segment.type === SegmentType.Code) {
                                                const nextSegment = segmentedContent[i + 1];
                                                if (
                                                    nextSegment &&
                                                    (nextSegment.type === SegmentType.Code ||
                                                        (nextSegment.type === SegmentType.Text &&
                                                            (nextSegment.text != "\n" && nextSegment.text.trim() === "")))
                                                ) {
                                                    return;
                                                } else {
                                                    const codeSegments = [];
                                                    let j = i;
                                                    while (j >= 0) {
                                                        const prevSegment = segmentedContent[j];
                                                        if (prevSegment.type === SegmentType.Code) {
                                                            codeSegments.unshift({
                                                                source: prevSegment.text.trim(),
                                                                fileName: prevSegment.fileName,
                                                                language: prevSegment.language,
                                                            });
                                                        } else if (
                                                            prevSegment.type === SegmentType.Text &&
                                                            prevSegment.text.trim() === ""
                                                        ) {
                                                            j--;
                                                            continue;
                                                        } else {
                                                            break;
                                                        }
                                                        j--;
                                                    }
                                                    return (
                                                        <CodeSection
                                                            key={`code-${i}`}
                                                            codeSegments={codeSegments}
                                                            loading={isLoading}
                                                            handleAddAllCodeSegmentsToWorkspace={handleAddAllCodeSegmentsToWorkspace}
                                                            handleRevertChanges={handleRevertChanges}
                                                            isReady={!isCodeLoading}
                                                            message={message}
                                                            buttonsActive={true}
                                                            isSyntaxError={isContainsSyntaxError(currentDiagnosticsRef.current)}
                                                            command={segment.command}
                                                            diagnostics={currentDiagnosticsRef.current}
                                                            onRetryRepair={handleRetryRepair}
                                                            isPromptExecutedInCurrentWindow={isPromptExecutedInCurrentWindow}
                                                            isErrorChunkReceived={isErrorChunkReceivedRef.current}
                                                            isAddingToWorkspace={isAddingToWorkspace}
                                                            fileArray={currentFileArray}
                                                        />
                                                    );
                                                }
                                            } else if (segment.type === SegmentType.ToolCall) {
                                                const currentToolName = segment.toolName;

                                                let nextIdx = i + 1;
                                                while (
                                                    nextIdx < segmentedContent.length &&
                                                    segmentedContent[nextIdx].type === SegmentType.Text &&
                                                    segmentedContent[nextIdx].text.trim() === ""
                                                ) {
                                                    nextIdx++;
                                                }
                                                const nextSeg = segmentedContent[nextIdx];
                                                if (
                                                    nextSeg &&
                                                    nextSeg.type === SegmentType.ToolCall &&
                                                    nextSeg.toolName === currentToolName
                                                ) {
                                                    return null;
                                                }

                                                const groupItems: ToolCallItem[] = [];
                                                let j = i;
                                                while (j >= 0) {
                                                    const seg = segmentedContent[j];
                                                    if (
                                                        seg.type === SegmentType.ToolCall &&
                                                        seg.toolName === currentToolName
                                                    ) {
                                                        groupItems.unshift({
                                                            text: seg.text,
                                                            loading: seg.loading,
                                                            failed: seg.failed,
                                                            toolName: seg.toolName,
                                                        });
                                                    } else if (
                                                        seg.type === SegmentType.Text &&
                                                        seg.text.trim() === ""
                                                    ) {
                                                        j--;
                                                        continue;
                                                    } else {
                                                        break;
                                                    }
                                                    j--;
                                                }

                                                if (groupItems.length === 1) {
                                                    return (
                                                        <ToolCallSegment
                                                            key={`tool-call-${i}`}
                                                            text={segment.text}
                                                            loading={segment.loading}
                                                            failed={segment.failed}
                                                        />
                                                    );
                                                }

                                                return (
                                                    <ToolCallGroupSegment
                                                        key={`tool-call-group-${i}`}
                                                        segments={groupItems}
                                                    />
                                                );
                                            } else if (segment.type === SegmentType.TryItScenarios) {
                                                return (
                                                    <TryItScenariosSegment
                                                        key={`try-it-scenarios-${i}`}
                                                        text={segment.text}
                                                        loading={segment.loading}
                                                    />
                                                );
                                            } else if (segment.type === SegmentType.Todo) {
                                                return (
                                                    <TodoSection
                                                        key={`todo-${i}`}
                                                        tasks={segment.tasks || []}
                                                        message={segment.message}
                                                    />
                                                );
                                            } else if (segment.type === SegmentType.SpecFetcher) {
                                                return (
                                                    <ConnectorGeneratorSegment
                                                        key={`connector-generator-${i}`}
                                                        data={segment.specData}
                                                        rpcClient={rpcClient}
                                                    />
                                                );
                                            } else if (segment.type === SegmentType.ConfigurationCollector) {
                                                return (
                                                    <ConfigurationCollectorSegment
                                                        key={`configuration-collector-${i}`}
                                                        data={segment.configurationData}
                                                        rpcClient={rpcClient}
                                                    />
                                                );
                                            } else if (segment.type === SegmentType.Attachment) {
                                                return (
                                                    <AttachmentsContainer>
                                                        {segment.text.split(",").map((fileName: string, attachmentIndex: number) => (
                                                            <AttachmentBox
                                                                key={`attachment-${i}-${attachmentIndex}`}
                                                                status={AttachmentStatus.Success}
                                                                fileName={fileName.trim()}
                                                                index={attachmentIndex}
                                                                removeAttachment={null}
                                                                readOnly={true}
                                                            />
                                                        ))}
                                                    </AttachmentsContainer>
                                                );
                                            } else if (segment.type === SegmentType.InlineCode) {
                                                return (
                                                    <CodeSegment
                                                        key={`code-segment-${i}`}
                                                        source={segment.text}
                                                        fileName={"Ballerina"}
                                                        language={"ballerina"}
                                                        collapsible={false}
                                                        showCopyButton={true}
                                                    />
                                                );
                                            } else if (segment.type === SegmentType.References) {
                                                return <ReferenceDropdown key={`references-${i}`} links={JSON.parse(segment.text)} />;
                                            } else if (segment.type === SegmentType.Compaction) {
                                                return <CompactionNotice key={`compaction-${i}`}>{segment.text}</CompactionNotice>;
                                            } else {
                                                if (message.type === "Error") {
                                                    return <ErrorBox key={`error-${i}`}>{segment.text}</ErrorBox>;
                                                }
                                                return <MarkdownRenderer key={`markdown-${i}`} markdownContent={segment.text} />;
                                            }
                                        })}
                                    </MessageBody>
                                    {/* Show feedback bar for the latest assistant message once loading is complete */}
                                    {isAssistantMessage && isLatestAssistantMessage && !isLoading && !isCodeLoading && (
                                        <FeedbackBar
                                            messageIndex={index}
                                            onFeedback={handleFeedback}
                                            currentFeedback={feedbackGiven}
                                        />
                                    )}
                                    {/* Hidden while over quota: the input is disabled, so a chip would prefill something unsendable. */}
                                    {isAssistantMessage && isLatestAssistantMessage && !isLoading && !isCodeLoading && !isUsageExceeded && followupSuggestions.length > 0 && (
                                        <FollowupSuggestions
                                            suggestions={followupSuggestions}
                                            onPick={(suggestion) => {
                                                aiChatInputRef.current?.setInputContent({
                                                    type: "text",
                                                    text: suggestion.prompt,
                                                    planMode: agentMode === AgentMode.Plan,
                                                });
                                            }}
                                        />
                                    )}
                                </ChatMessage>
                            );
                        };

                                return (
                                    <TurnGroup
                                        key={userIndex}
                                        onMouseEnter={() => setHoveredTurnIndex(turnIndex)}
                                        onMouseLeave={() => setHoveredTurnIndex(null)}
                                    >
                                        {renderMessage(userMsg, userIndex)}
                                        {assistantMsg !== undefined && renderMessage(assistantMsg, assistantIndex!)}
                                    </TurnGroup>
                                );
                            });
                        })()}
                        <div ref={messagesEndRef} />
                    </main>
                    {isUsageExceeded && (
                        <UsageLimitNoticeContainer>
                            <span className="codicon codicon-warning" role="img" aria-hidden="true" />
                            <span>
                                You've reached your Integrator Copilot usage limit
                                {usage && usage.resetsIn !== -1 ? `, which resets in ${formatResetsIn(usage.resetsIn)}` : ""}.
                                {usage?.alreadyRequested
                                    ? <>{" "}Your request for additional quota has been submitted. Reach us at <a href={`mailto:${QUOTA_CONTACT_EMAIL}`}>{QUOTA_CONTACT_EMAIL}</a>.</>
                                    : <>{" "}<a href="#" onClick={(e) => { e.preventDefault(); setShowQuotaDialog(true); }}>Request additional quota</a>.</>
                                }
                            </span>
                        </UsageLimitNoticeContainer>
                    )}
                    {showQuotaDialog && (
                        <QuotaRequestDialog
                            submitting={quotaRequestSubmitting}
                            error={quotaRequestError}
                            onCancel={() => { setShowQuotaDialog(false); setQuotaRequestError(undefined); }}
                            onSubmit={handleQuotaRequestSubmit}
                        />
                    )}
                    {(() => {
                        const lastAssistantMsg = [...otherMessages].reverse().find(m => m.role === "Copilot");
                        const lastStream = lastAssistantMsg ? parseStream(lastAssistantMsg.content) : [];
                        const lastStreamItems = lastStream.flatMap((e: StreamEntry) => e.items);
                        const activeClarifyItem = lastStreamItems.find(
                            (item: StreamItem) => item.kind === "ask" && (item as any).data?.stage === "asking"
                        ) as { kind: "ask"; data: { requestId: string; questions: any[] } } | undefined;

                        const activeSkillEnableItem = lastStreamItems.find(
                            (item: StreamItem) => item.kind === "skill_enable" && (item as any).data?.stage === "prompting"
                        ) as { kind: "skill_enable"; data: { requestId: string; skillName: string; skillId: string } } | undefined;

                        const approvalFooter = activeClarifyItem ? (
                            <ClarifyFooter
                                questions={activeClarifyItem.data.questions}
                                requestId={activeClarifyItem.data.requestId}
                                rpcClient={rpcClient}
                                onStop={handleStop}
                            />
                        ) : activeSkillEnableItem ? (
                            <CommonApprovalFooter
                                type="skill_enable"
                                skillName={activeSkillEnableItem.data.skillName}
                                onEnable={() => rpcClient.getAiPanelRpcClient().enableSkillFromChat({
                                    requestId: activeSkillEnableItem.data.requestId,
                                    skillId: activeSkillEnableItem.data.skillId,
                                })}
                                onSkip={() => rpcClient.getAiPanelRpcClient().cancelSkillEnable({
                                    requestId: activeSkillEnableItem.data.requestId,
                                })}
                                onStop={handleStop}
                            />
                        ) : webToolApprovalRequest ? (
                            <CommonApprovalFooter
                                type="web_tool"
                                toolName={webToolApprovalRequest.toolName}
                                content={webToolApprovalRequest.content}
                                onAllow={handleWebToolAllow}
                                onDeny={handleWebToolDeny}
                                onStop={handleStop}
                            />
                        ) : approvalRequest ? (
                            <CommonApprovalFooter
                                type={approvalRequest.approvalType}
                                onApprove={handleApprovalApprove}
                                onReject={handleApprovalReject}
                                onStop={handleStop}
                            />
                        ) : null;

                        // Kept mounted behind the approval footer so the draft and attachments survive.
                        return (
                        <>
                            {approvalFooter}
                            <Footer
                            hidden={!!approvalFooter}
                            aiChatInputRef={aiChatInputRef}
                            tagOptions={{
                                placeholderTags: placeholderTags,
                                loadGeneralTags: loadGeneralTags,
                                injectPlaceholderTags: injectPlaceholderTags,
                            }}
                            attachmentOptions={{
                                multiple: true,
                                acceptResolver: acceptResolver,
                                handleAttachmentSelection: handleAttachmentSelection,
                            }}
                            suggestedCommandTemplates={footerSuggestedCommandTemplates}
                            inputPlaceholder={
                                footerInputPlaceholder ??
                                (agentMode === AgentMode.Plan
                                    ? "What would you like to plan?"
                                    : messages.length === 0
                                        ? "What would you like to change?"
                                        : "What should we do next?")
                            }
                            onSend={handleSend}
                            onStop={handleStop}
                            isLoading={isLoading}
                            loadingLabel={isCompacting ? "Compacting conversation" : activeToolLabel}
                            showSuggestedCommands={Array.isArray(otherMessages) && otherMessages.length === 0}
                            codeContext={codeContext}
                            onRemoveCodeContext={() => updateCodeContext(undefined)}
                            agentMode={agentMode}
                            onChangeAgentMode={handleChangeAgentMode}
                            isAutoApproveEnabled={isAutoApproveEnabled}
                            onDisableAutoApprove={handleToggleAutoApprove}
                            isWebToolsEnabled={isWebToolsEnabled}
                            onToggleWebSearch={handleToggleWebSearch}
                            disabled={isUsageExceeded}
                            contextUsage={showContextUsage ? contextUsage : null}
                            mcpToolsEnabled={mcpToolsEnabled}
                            onOpenMcpManager={() => pushPanel("mcp")}
                            runningServicesPanel={{
                                services: runningServices,
                                onStopService: handleStopRunningService,
                                onStopAll: handleStopAllRunningServices,
                            }}
                            skills={skills}
                        />
                        </>
                        );
                    })()}
                </AIChatView>
            )}
            {activePanel === "settings" && (
                <SettingsPanel onClose={popPanel} backTooltip={backTooltip} onNavigate={pushPanel} mcpToolsEnabled={mcpToolsEnabled} />
            )}
            {activePanel === "mcp" && <McpManagerPanel onClose={popPanel} backTooltip={backTooltip} />}
            {activePanel === "skills" && <SkillsManager onClose={popPanel} backTooltip={backTooltip} onSkillsChange={refreshSkills} />}
        </>
    );
};

export default AIChat;
