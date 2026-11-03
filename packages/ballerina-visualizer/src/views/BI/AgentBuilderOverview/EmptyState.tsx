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

import { CSSProperties, useCallback, useEffect, useRef, useState } from "react";
import { keyframes } from "@emotion/react";
import styled from "@emotion/styled";
import { AgentRunStatus, AIMachineSnapshot, AIMachineStateValue } from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { Button, Codicon, Icon, ThemeColors } from "@wso2/ui-toolkit";
import {
    awaitingInputLabel,
    ACCENT_CORE,
    ACCENT_SPHERE,
    SpinArc,
    frameTriple,
    IconOverlay,
    AGENT_BUILDER_ORB_COLORS,
    ORB_ENERGY,
    ORB_GLOW_CLASS,
    OrbAura,
    OrbButton,
    OrbGlow,
    Sphere,
    subscribeAgentRunStatus,
    useAiPanelOpen,
    useSuppressAgentStatusOrb,
} from "../../../components/AgentStatusOrb/shared";
import { openCopilotPanel, submitPromptToCopilot } from "../../../components/AgentStatusOrb/copilotPanel";
import {
    CopilotPromptBox,
    CopilotPromptBoxHandle,
    PromptSubmitOptions,
} from "../../../components/CopilotPromptBox";
import { useAssistantName } from "../../../hooks/useProductMode";
import { RunNotice, useWelcomeRun } from "./useWelcomeRun";
import { LoadingRing } from "../../../components/Loader";
import LoginPanel from "../../AIPanel/LoginPanel";
import WaitingForLogin from "../../AIPanel/WaitingForLoginSection";
import { DisabledWindow } from "../../AIPanel/DisabledSection";
import { PopupModal } from "../../../components/PopupModal";
import { CloseButton } from "../Connection/styles";

const CONTENT_WIDTH = 760;

const EXIT_MS = 680;

type AuthState = "unknown" | "authenticated" | "unauthenticated" | "connecting" | "disabled";

const VALIDATING_SUBSTATES = [
    "validatingApiKey",
    "validatingAwsCredentials",
    "validatingVertexAiCredentials",
    "validatingAnthropicAwsCredentials",
];

function authenticatingSubstate(state: AIMachineStateValue | undefined): string | undefined {
    return typeof state === "object" && state !== null ? state.Authenticating : undefined;
}

function toAuthState(state: AIMachineStateValue | undefined): AuthState {
    if (state === undefined || state === "Initialize") {
        return "unknown";
    }
    if (state === "Authenticated") {
        return "authenticated";
    }
    if (state === "Disabled") {
        return "disabled";
    }
    return authenticatingSubstate(state) ? "connecting" : "unauthenticated";
}

interface Example {
    name: string;
    description: string;
    icon: string;
    isCodicon?: boolean;
    prompt: string;
}

interface EmptyStateCopy {
    heading: string;
    placeholder: string;
    inputLabel: string;
    manualLabel: string;
    manualIcon: string;
    manualIconIsCodicon?: boolean;
    examples: Example[];
    hiddenContext: string;
}

const EXAMPLES: Example[] = [
    {
        name: "Customer Support",
        description: "Answers questions from your product docs",
        icon: "comment-discussion",
        isCodicon: true,
        prompt:
            "Create a customer support agent that answers product questions from a knowledge base built from Markdown documentation files, and says so when the answer is not in the docs.",
    },
    {
        name: "Issue Triager",
        description: "Triages new GitHub issues by priority",
        icon: "issues",
        isCodicon: true,
        prompt:
            "Create an issue triage agent that adds a priority label to newly opened GitHub issues and posts a short summary as a comment. Add a GitHub trigger for issue events.",
    },
    {
        name: "Helpdesk Responder",
        description: "Replies to incoming WhatsApp messages",
        icon: "device-mobile",
        isCodicon: true,
        prompt:
            "Create a helpdesk agent that replies to incoming WhatsApp messages and answers common account and billing questions, telling the customer a human will follow up whenever it cannot answer confidently. Add a WhatsApp trigger for it.",
    },
    {
        name: "Order Tools",
        description: "Exposes order lookup and returns as tools",
        icon: "bi-mcp",
        prompt:
            "Create an MCP server that exposes order lookup, order status and returns from our order system as tools.",
    },
];

const LIBRARY_EXAMPLES: Example[] = [
    {
        name: "Reusable Agent",
        description: "An agent other integrations can run",
        icon: "bi-ai-agent",
        prompt:
            "Create a reusable agent definition for a customer support agent that answers product questions from Markdown documentation files, so other integrations in this project can run it.",
    },
    {
        name: "Shared Tools",
        description: "Agent tools any agent can call",
        icon: "bi-function",
        prompt:
            "Add reusable agent tools that look up an account and its open opportunities in Salesforce, so agents in other packages can call them.",
    },
    {
        name: "Shared Types",
        description: "Records used across agents",
        icon: "bi-type",
        prompt:
            "Define shared record types for a support ticket and a customer profile, and a data mapper that turns a support ticket into a short summary record.",
    },
    {
        name: "Shared Connection",
        description: "One configured client, reused",
        icon: "bi-connection",
        prompt:
            "Add a shared Salesforce connection that reads its credentials from configurable variables, so every agent in this project connects the same way.",
    },
];

const AGENT_COPY: EmptyStateCopy = {
    heading: "What should your agent do?",
    placeholder: "Describe what you want your agent to do…",
    inputLabel: "Describe the agent you want to build",
    manualLabel: "Add Agent",
    manualIcon: "bi-ai-agent",
    examples: EXAMPLES,
    hiddenContext: "The target package is an agentic integration, which can carry its own triggers and services.",
};

const LIBRARY_COPY: EmptyStateCopy = {
    heading: "What should this library provide?",
    placeholder: "Describe what you want this library to provide…",
    inputLabel: "Describe the library you want to build",
    manualLabel: "Add Artifact",
    manualIcon: "library",
    manualIconIsCodicon: true,
    examples: LIBRARY_EXAMPLES,
    hiddenContext:
        "The target package is a Ballerina library. It has no runnable entry point, so do not add listeners, " +
        "chat triggers or services to it. Build reusable, publicly visible artifacts instead — agent definitions, " +
        "agent tools, types and data mappers — for other packages in the project to import.",
};

const Wrap = styled.div`
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: safe center;
    padding: clamp(16px, 5vh, 56px) 24px;
    container: welcome / size;

    & > * {
        flex-shrink: 0;
    }
`;

const Intro = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
`;

const riseIn = keyframes`
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: none; }
`;

// grid-template-rows is animatable where height: auto is not, so the collapse
// glides and the centred orb rides down with it.
const IdleBlock = styled.div<{ $out?: boolean }>`
    display: grid;
    grid-template-rows: ${(props: { $out?: boolean }) => (props.$out ? "0fr" : "1fr")};
    width: 100%;
    transition: grid-template-rows 620ms cubic-bezier(0.2, 0.8, 0.2, 1);

    > div {
        display: flex;
        flex-direction: column;
        align-items: center;
        width: 100%;
        min-height: 0;
        overflow: hidden;
    }

    @media (prefers-reduced-motion: reduce) {
        transition: none;
    }
`;

const ExitGroup = styled.div<{ $out?: boolean; $delay?: number }>`
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 100%;
    opacity: ${(props: { $out?: boolean }) => (props.$out ? 0 : 1)};
    /* "none" while shown: a transform would trap the Copilot menu under the next group. */
    transform: ${(props: { $out?: boolean }) => (props.$out ? "translateY(-6px)" : "none")};
    transition: opacity 300ms ease, transform 300ms ease;
    transition-delay: ${(props: { $delay?: number }) => props.$delay ?? 0}ms;

    @media (prefers-reduced-motion: reduce) {
        transition: none;
    }
`;

const RunBlock = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 100%;
    animation: ${riseIn} 560ms 280ms both cubic-bezier(0.2, 0.8, 0.2, 1);

    @media (prefers-reduced-motion: reduce) {
        animation: none;
    }
`;

const PromptEcho = styled.p`
    margin: 14px 0 0;
    max-width: 520px;
    color: var(--vscode-descriptionForeground);
    font-size: 13px;
    line-height: 1.5;
    text-align: center;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
`;

const CopilotName = styled.div`
    margin-top: clamp(12px, 2.5cqh, 28px);
    color: var(--vscode-descriptionForeground);
    font-size: 14px;
    font-weight: 400;
    text-align: center;
`;

const Heading = styled.h2`
    margin: 0;
    font-size: clamp(26px, 2.4cqi, 32px);
    font-weight: 300;
    color: var(--vscode-foreground);
    text-align: center;
`;

const Subtitle = styled.p<{ live?: boolean }>`
    margin: 0;
    max-width: 440px;
    text-align: center;
    font-size: 14px;
    color: ${(props: { live?: boolean }) =>
        props.live ? "var(--vscode-foreground)" : "var(--vscode-descriptionForeground)"};
`;

const ComposerRow = styled.div`
    width: 100%;
    max-width: ${CONTENT_WIDTH}px;
    margin-top: clamp(16px, 4cqh, 44px);
`;

const FooterHint = styled.span`
    color: var(--vscode-descriptionForeground);
    font-size: 12px;
`;

const SetupModalHeader = styled.div`
    display: flex;
    justify-content: flex-end;
    padding: 12px 12px 0;
`;

const SetupModalBody = styled.div`
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: safe center;
    padding: 32px 24px 32px;
`;

const LoginSlot = styled.div`
    width: 100%;
    padding-top: 12px;
`;

const NarrowSlot = styled.div`
    width: 100%;
    max-width: 520px;
`;

const Notice = styled.div`
    width: 100%;
    max-width: ${CONTENT_WIDTH}px;
    margin-top: 16px;
    color: var(--vscode-descriptionForeground);
    font-size: 13px;
    text-align: center;
`;

const ExamplesBlock = styled.div`
    width: 100%;
    max-width: ${CONTENT_WIDTH}px;
    margin-top: clamp(20px, 5cqh, 56px);
    container-type: inline-size;
`;

const ExamplesLabel = styled.div`
    margin-bottom: 10px;
    color: var(--vscode-descriptionForeground);
    font-size: 12px;
`;

const Cards = styled.div`
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 16px;

    @container (max-width: 679px) {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
`;

// Two card rows (below a 728px-wide panel) need more height than one.
const SHORT_PANEL = "welcome ((max-height: 700px) and (max-width: 727px)) or (max-height: 520px)";

const Card = styled.button`
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    padding: 16px;
    border: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    border-radius: 8px;
    background: transparent;
    text-align: left;
    cursor: pointer;
    font-family: inherit;

    &:hover {
        background: var(--vscode-toolbar-hoverBackground);
    }

    @container ${SHORT_PANEL} {
        flex-direction: row;
        align-items: center;
        justify-content: flex-start;
        gap: 10px;
        padding: 10px 12px;
    }
`;

const CardText = styled.span`
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
    width: 100%;
`;

const CardName = styled.span`
    color: var(--vscode-foreground);
    font-size: 13px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
`;

const CardDescription = styled.span`
    color: var(--vscode-descriptionForeground);
    font-size: 12px;
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;

    @container ${SHORT_PANEL} {
        display: none;
    }
`;

const ScratchLine = styled.p`
    margin: 24px 0 0;
    color: var(--vscode-descriptionForeground);
    font-size: 13px;
`;

// vscode-button puts padding on its inner .control, reachable only through these tokens.
const MANUAL_BUTTON_SX = {
    "--button-padding-vertical": "6px",
    "--button-padding-horizontal": "14px",
    borderRadius: "6px",
} as CSSProperties;

const MANUAL_ICON_SX = { width: 16, height: 16, marginRight: 6 };
const MANUAL_ICON_GLYPH_SX = { fontSize: "16px" };

const ManualRow = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    width: 100%;
    max-width: 440px;
    margin-top: clamp(16px, 3.5cqh, 40px);

    /* Too short for everything: keep the manual route above the fold, examples scroll. */
    @container welcome (max-height: 520px) {
        order: -1;
    }
`;

const ScratchDivider = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    color: var(--vscode-descriptionForeground);
    font-size: 12px;

    &::before,
    &::after {
        content: "";
        flex: 1 1 auto;
        height: 1px;
        background: var(--vscode-panel-border, var(--vscode-editorWidget-border));
    }
`;

const ManualButtons = styled.div`
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
`;

const LinkButton = styled.button`
    padding: 0;
    border: 0;
    background: none;
    font: inherit;
    color: var(--vscode-textLink-foreground);
    cursor: pointer;

    &:hover {
        text-decoration: underline;
    }

    &:disabled {
        color: var(--vscode-descriptionForeground);
        cursor: default;
        text-decoration: none;
    }
`;

interface RunNoticeLineProps {
    notice?: RunNotice;
    assistantName: string;
    onOpenChat: () => void;
}

function RunNoticeLine({ notice, assistantName, onOpenChat }: RunNoticeLineProps) {
    const link = (label: string) => (
        <LinkButton type="button" onClick={onOpenChat}>
            {label}
        </LinkButton>
    );
    switch (notice) {
        case "start-failed":
            return <Notice>{assistantName} didn’t start. Try again, or {link(`open ${assistantName}`)}.</Notice>;
        case "replied":
            return <Notice>{assistantName} replied in the chat. {link("Open Chat")}</Notice>;
        case "error":
            return (
                <Notice>
                    {assistantName} couldn’t finish. Your prompt is back in the box. Try again, or {link("open the chat")} for details.
                </Notice>
            );
        default:
            return null;
    }
}

interface EmptyStateProps {
    onCreateFromScratch: () => void;
    onAddMcpService?: () => void;
    isLibrary?: boolean;
}

export function EmptyState({ onCreateFromScratch, onAddMcpService, isLibrary }: EmptyStateProps) {
    const copy = isLibrary ? LIBRARY_COPY : AGENT_COPY;
    const assistantName = useAssistantName();
    const { rpcClient } = useRpcContext();
    const [status, setStatus] = useState<AgentRunStatus | null>(null);
    const [text, setText] = useState("");
    const [aiSnapshot, setAiSnapshot] = useState<AIMachineSnapshot>();
    const [pendingPrompt, setPendingPrompt] = useState<{ prompt: string; options: PromptSubmitOptions }>();
    const [setupRequested, setSetupRequested] = useState(false);
    const [idleMounted, setIdleMounted] = useState(true);
    const promptRef = useRef<CopilotPromptBoxHandle>(null);

    const aiPanelOpen = useAiPanelOpen();

    useSuppressAgentStatusOrb();

    useEffect(() => {
        if (!rpcClient) {
            return;
        }
        return subscribeAgentRunStatus(rpcClient, setStatus);
    }, [rpcClient]);

    const refreshAiSnapshot = useCallback(() => {
        rpcClient
            ?.getAiPanelRpcClient()
            .getAIMachineSnapshot()
            .then(setAiSnapshot)
            .catch((): void => undefined);
    }, [rpcClient]);

    useEffect(() => {
        if (!rpcClient) {
            return;
        }
        refreshAiSnapshot();
        rpcClient.onAIPanelStateChanged(refreshAiSnapshot);
    }, [rpcClient, refreshAiSnapshot]);

    // The transition starts on click, not when the extension reports the run —
    // opening the panel and starting it takes long enough to read as a dead beat.
    const { state, active, runPrompt, notice, clearNotice, handedOff, handoffFailed, showRun } = useWelcomeRun(
        status,
        aiPanelOpen,
        (prompt) => setText((current) => current || prompt)
    );
    const working = state !== "idle";
    const running = state === "running";
    // With the chat open, its own input is the one to use.
    const compact = aiPanelOpen && !showRun;

    useEffect(() => {
        if (!showRun) {
            setIdleMounted(true);
            return;
        }
        const timer = setTimeout(() => setIdleMounted(false), EXIT_MS);
        return () => clearTimeout(timer);
    }, [showRun]);

    const orbColors = working ? AGENT_BUILDER_ORB_COLORS[state] : ACCENT_SPHERE;
    const orbGlow = frameTriple(orbColors[0]);
    const orbHighlight = working ? `color-mix(in srgb, ${orbColors[0]} 70%, transparent)` : ACCENT_CORE;
    const runHeading = state === "awaiting-input" ? awaitingInputLabel() : "Working on it…";
    const runDetail = active ? status?.label : undefined;
    const showOpenCopilot = !aiPanelOpen;
    const orbLabel = showOpenCopilot ? `Open ${assistantName}` : undefined;
    const authState = toAuthState(aiSnapshot?.state);
    const substate = authenticatingSubstate(aiSnapshot?.state);
    const showSetup =
        authState !== "authenticated" && (pendingPrompt !== undefined || setupRequested);

    const openCopilot = () => openCopilotPanel(rpcClient);

    const dispatch = async (prompt: string, options: PromptSubmitOptions) => {
        handedOff(prompt);
        const accepted = await submitPromptToCopilot(rpcClient, prompt, {
            ...options,
            newThread: true,
            hiddenContext: copy.hiddenContext,
        });
        if (accepted) {
            setText("");
        } else {
            handoffFailed();
        }
        return accepted;
    };

    const fillExample = (prompt: string) =>
        compact
            ? void submitPromptToCopilot(rpcClient, prompt, { autoSubmit: false, hiddenContext: copy.hiddenContext })
            : promptRef.current?.fill(prompt);

    const fillChat = async (prompt: string, options: PromptSubmitOptions) => {
        const taken = await submitPromptToCopilot(rpcClient, prompt, {
            ...options,
            autoSubmit: false,
            hiddenContext: copy.hiddenContext,
        });
        if (taken) {
            setText("");
        }
        return taken;
    };

    // Opening the chat takes the draft along; a send from this box opens it too, but is already on its way.
    const panelWasOpenRef = useRef(aiPanelOpen);
    useEffect(() => {
        const opened = aiPanelOpen && !panelWasOpenRef.current;
        panelWasOpenRef.current = aiPanelOpen;
        if (opened && !showRun) {
            void promptRef.current?.handOff(fillChat);
        }
    }, [aiPanelOpen]);

    const send = async (prompt: string, options: PromptSubmitOptions) => {
        clearNotice();
        const authenticated =
            authState === "authenticated" ||
            (await rpcClient?.getAiPanelRpcClient().isUserAuthenticated().catch(() => false));
        if (!authenticated) {
            refreshAiSnapshot();
            setPendingPrompt({ prompt, options });
            return false;
        }
        return dispatch(prompt, options);
    };

    const openSetup = () => {
        refreshAiSnapshot();
        setSetupRequested(true);
    };

    const dismissSetup = () => {
        setSetupRequested(false);
        setPendingPrompt(undefined);
    };

    useEffect(() => {
        if (authState !== "authenticated" || pendingPrompt === undefined) {
            return;
        }
        setPendingPrompt(undefined);
        void dispatch(text.trim() || pendingPrompt.prompt, pendingPrompt.options);
    }, [authState, pendingPrompt, text]);

    useEffect(() => {
        if (authState === "authenticated") {
            setSetupRequested(false);
        }
    }, [authState]);

    const setupHint =
        authState === "unauthenticated" ? (
            <FooterHint>
                <LinkButton type="button" onClick={openSetup}>
                    Set up AI
                </LinkButton>{" "}
                to generate
            </FooterHint>
        ) : authState === "connecting" ? (
            <FooterHint>
                <LinkButton type="button" onClick={openSetup}>
                    Finish setting up AI
                </LinkButton>
            </FooterHint>
        ) : undefined;

    const setupModal = showSetup && (
        <PopupModal
            onClose={dismissSetup}
            dismissOnBackdropClick={authState !== "connecting"}
            dismissOnEscape
            autoHeight
            maxWidth={authState === "unauthenticated" ? undefined : 560}
        >
            {(close) => (
                <>
                    <SetupModalHeader>
                        <CloseButton appearance="icon" onClick={close}>
                            <Codicon name="close" />
                        </CloseButton>
                    </SetupModalHeader>
                    <SetupModalBody>
                        {authState === "unknown" || substate === "determineFlow" ? (
                            <LoadingRing />
                        ) : authState === "disabled" ? (
                            <NarrowSlot>
                                <DisabledWindow />
                            </NarrowSlot>
                        ) : authState === "connecting" ? (
                            <NarrowSlot>
                                <WaitingForLogin
                                    embedded
                                    loginMethod={aiSnapshot?.context?.loginMethod}
                                    isValidating={!!substate && VALIDATING_SUBSTATES.includes(substate)}
                                    errorMessage={aiSnapshot?.context?.errorMessage}
                                />
                            </NarrowSlot>
                        ) : (
                            <LoginSlot>
                                <LoginPanel
                                    embedded
                                    subtitle={
                                        pendingPrompt
                                            ? "Your prompt is saved and will be sent once setup is complete."
                                            : undefined
                                    }
                                />
                            </LoginSlot>
                        )}
                    </SetupModalBody>
                </>
            )}
        </PopupModal>
    );

    return (
        <Wrap>
            {setupModal}
            <OrbButton
                type="button"
                $interactive={showOpenCopilot}
                disabled={!showOpenCopilot}
                onClick={openCopilot}
                title={orbLabel}
                aria-label={orbLabel}
            >
                <OrbGlow className={ORB_GLOW_CLASS}>
                    <OrbAura $active={showRun} $colors={orbGlow}>
                        <Sphere
                            colors={orbColors}
                            energy={ORB_ENERGY[state]}
                            highlightColor={orbHighlight}
                        />
                        <IconOverlay>
                            <Icon
                                name="bi-ai-chat"
                                sx={{ width: 26, height: 26 }}
                                iconSx={{ fontSize: "26px", color: "#ffffff" }}
                            />
                        </IconOverlay>
                        {(running || (showRun && !working)) && <SpinArc color={orbGlow[1]} />}
                    </OrbAura>
                </OrbGlow>
            </OrbButton>

            {showRun && (
                <RunBlock>
                    <Intro>
                        <Heading>{runHeading}</Heading>
                        {runDetail && <Subtitle live>{runDetail}</Subtitle>}
                    </Intro>
                    {runPrompt && <PromptEcho>{runPrompt}</PromptEcho>}
                    {showOpenCopilot && (
                        <ScratchLine>
                            <LinkButton type="button" onClick={openCopilot}>
                                Open {assistantName}
                            </LinkButton>
                        </ScratchLine>
                    )}
                </RunBlock>
            )}

            {idleMounted && (
                <IdleBlock $out={showRun}>
                    <div>
                        <ExitGroup $out={showRun}>
                            <CopilotName>{assistantName}</CopilotName>
                            <Intro>
                                <Heading>{copy.heading}</Heading>
                            </Intro>
                        </ExitGroup>

                        <ExitGroup $out={showRun} $delay={110}>
                            {compact && (
                                <Notice>Continue in the chat, or pick an example below to start it there.</Notice>
                            )}
                            {/* Hidden rather than unmounted, so attachments and the mode survive opening the chat. */}
                            <ComposerRow style={compact ? { display: "none" } : undefined}>
                                <CopilotPromptBox
                                    ref={promptRef}
                                    value={text}
                                    onChange={setText}
                                    onSubmit={send}
                                    placeholder={copy.placeholder}
                                    ariaLabel={copy.inputLabel}
                                    state={state}
                                    setupPrompt={setupHint}
                                />
                            </ComposerRow>

                            <RunNoticeLine notice={notice} assistantName={assistantName} onOpenChat={openCopilot} />

                        </ExitGroup>

                        <ExitGroup $out={showRun}>
                            <ExamplesBlock>
                                <ExamplesLabel>Examples</ExamplesLabel>
                                <Cards>
                                    {copy.examples.map((example) => (
                                        <Card
                                            key={example.name}
                                            type="button"
                                            onClick={() => fillExample(example.prompt)}
                                        >
                                            <Icon
                                                name={example.icon}
                                                isCodicon={example.isCodicon}
                                                sx={{ color: "var(--vscode-foreground)" }}
                                                iconSx={{ fontSize: "18px", color: "var(--vscode-foreground)" }}
                                            />
                                            <CardText>
                                                <CardName>{example.name}</CardName>
                                                <CardDescription>{example.description}</CardDescription>
                                            </CardText>
                                        </Card>
                                    ))}
                                </Cards>
                            </ExamplesBlock>

                            <ManualRow>
                                <ScratchDivider>Or start from scratch</ScratchDivider>
                                <ManualButtons>
                                    <Button
                                        appearance="secondary"
                                        onClick={onCreateFromScratch}
                                        buttonSx={MANUAL_BUTTON_SX}
                                    >
                                        <Icon
                                            name={copy.manualIcon}
                                            isCodicon={copy.manualIconIsCodicon}
                                            sx={MANUAL_ICON_SX}
                                            iconSx={MANUAL_ICON_GLYPH_SX}
                                        />
                                        {copy.manualLabel}
                                    </Button>
                                    {onAddMcpService && (
                                        <Button
                                            appearance="secondary"
                                            onClick={onAddMcpService}
                                            buttonSx={MANUAL_BUTTON_SX}
                                        >
                                            <Icon name="bi-mcp" sx={MANUAL_ICON_SX} iconSx={MANUAL_ICON_GLYPH_SX} />
                                            Add MCP Server
                                        </Button>
                                    )}
                                </ManualButtons>
                            </ManualRow>
                        </ExitGroup>
                    </div>
                </IdleBlock>
            )}
        </Wrap>
    );
}
