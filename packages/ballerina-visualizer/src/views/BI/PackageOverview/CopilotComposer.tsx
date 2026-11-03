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

import React, { CSSProperties, useEffect, useRef, useState } from "react";
import { keyframes } from "@emotion/react";
import styled from "@emotion/styled";
import { VSCodeLink } from "@vscode/webview-ui-toolkit/react";
import { AgentRunStatus, SHARED_COMMANDS } from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { Button, Icon, ThemeColors } from "@wso2/ui-toolkit";
import {
    ORB_GLOW_CLASS,
    ORB_SIZE,
    OrbButton,
    OrbGlow,
    subscribeAgentRunStatus,
    syncOrbThemeFromSetting,
    useAiPanelOpen,
    useAmbientCopilotPresence,
    useSuppressAgentStatusOrb,
} from "../../../components/AgentStatusOrb/shared";
import { CopilotOrb } from "../../../components/AgentStatusOrb/CopilotOrb";
import { useOrbColors } from "../../../components/AgentStatusOrb/orbTheme";
import { openCopilotPanel, submitPromptToCopilot } from "../../../components/AgentStatusOrb/copilotPanel";
import {
    CopilotPromptBox,
    CopilotPromptBoxHandle,
    PromptSubmitOptions,
} from "../../../components/CopilotPromptBox";
import { useAssistantName } from "../../../hooks/useProductMode";

const CONTENT_WIDTH = 620;
const RUN_START_TIMEOUT_MS = 10000;

interface ExamplePrompt {
    name: string;
    description: string;
    icon: string;
    isCodicon?: boolean;
    prompt: string;
}

const EXAMPLES: ExamplePrompt[] = [
    {
        name: "REST API",
        description: "Create and list orders over HTTP",
        icon: "globe",
        prompt: "Create a REST API to create and list orders.",
    },
    {
        name: "AI agent",
        description: "Answer questions from your docs",
        icon: "bi-ai-agent",
        isCodicon: false,
        prompt: "Create an AI agent that answers questions from my Markdown docs.",
    },
    {
        name: "Connect Salesforce",
        description: "Sync new leads into a database",
        icon: "database",
        prompt: "Sync new Salesforce leads into a MySQL database.",
    },
    {
        name: "Transform data",
        description: "Map an order to an invoice",
        icon: "git-compare",
        prompt: "Map an incoming order to an invoice with a data mapper.",
    },
];

const Wrap = styled.div`
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: safe center;
    padding: 40px 24px;

    & > * {
        flex-shrink: 0;
    }
`;

const riseIn = keyframes`
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: none; }
`;

const Heading = styled.h2`
    margin: 0;
    font-size: 28px;
    font-weight: 300;
    color: var(--vscode-foreground);
    text-align: center;
    animation: ${riseIn} 400ms ease both;
`;

const AssistantName = styled.div`
    margin-bottom: 8px;
    color: var(--vscode-descriptionForeground);
    font-size: 14px;
    font-weight: 400;
    text-align: center;
    animation: ${riseIn} 400ms ease both;
`;

const Subtitle = styled.p<{ $visible?: boolean }>`
    margin: 0;
    max-width: 440px;
    text-align: center;
    font-size: 14px;
    color: var(--vscode-foreground);
    overflow: hidden;
    // Detailed step text is redundant while the panel is open (it shows it there);
    // collapse it away smoothly, and bring it back when the panel is hidden.
    opacity: ${(props: { $visible?: boolean }) => (props.$visible ? 1 : 0)};
    max-height: ${(props: { $visible?: boolean }) => (props.$visible ? "48px" : "0")};
    margin-top: ${(props: { $visible?: boolean }) => (props.$visible ? "8px" : "0")};
    transition: opacity 220ms ease, max-height 220ms ease, margin-top 220ms ease;
`;

const PromptEcho = styled.p`
    margin: 14px 0 0;
    max-width: 480px;
    color: var(--vscode-descriptionForeground);
    font-size: 13px;
    line-height: 1.5;
    text-align: center;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
`;

const RunBlock = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    margin-top: 28px;
`;

const IdleBlock = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 100%;
    margin-top: 28px;
    animation: ${riseIn} 400ms ease both;
`;

const ComposerRow = styled.div`
    width: 100%;
    max-width: ${CONTENT_WIDTH}px;
    margin-top: 24px;
`;

const ExamplesBlock = styled.div`
    width: 100%;
    max-width: ${CONTENT_WIDTH}px;
    margin-top: 32px;
`;

const ExamplesLabel = styled.div`
    margin-bottom: 10px;
    color: var(--vscode-descriptionForeground);
    font-size: 12px;
`;

const Cards = styled.div`
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;

    @media (max-width: 520px) {
        grid-template-columns: 1fr;
    }
`;

const Card = styled.button`
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
    padding: 14px;
    border: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    border-radius: 8px;
    background: transparent;
    text-align: left;
    cursor: pointer;
    font-family: inherit;
    transition: border-color 150ms ease, background-color 150ms ease;

    &:hover {
        border-color: ${ThemeColors.PRIMARY};
        background: var(--vscode-list-hoverBackground);
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
`;

const CardDescription = styled.span`
    color: var(--vscode-descriptionForeground);
    font-size: 12px;
    line-height: 1.4;
`;

const ManualRow = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 24px;
    color: var(--vscode-descriptionForeground);
    font-size: 13px;
`;

// vscode-button puts padding on its inner .control, reachable only through these tokens.
const MANUAL_BUTTON_SX = {
    "--button-padding-vertical": "6px",
    "--button-padding-horizontal": "14px",
    borderRadius: "6px",
} as CSSProperties;

interface CopilotComposerProps {
    onAddArtifactManually: () => void;
    /** True while the parent is fading this out — freeze the content so it fades as one piece. */
    hiding?: boolean;
}

/**
 * The integration overview's empty-state landing — Copilot's own front door for
 * this page. Only rendered while the integration has no artifacts; the moment
 * one exists, the page shows the diagram instead and this unmounts.
 */
export function CopilotComposer({ onAddArtifactManually, hiding }: CopilotComposerProps) {
    const { rpcClient } = useRpcContext();
    const assistantName = useAssistantName();
    const [status, setStatus] = useState<AgentRunStatus | null>(null);
    const [text, setText] = useState("");
    const [submittedPrompt, setSubmittedPrompt] = useState<string>();
    const promptRef = useRef<CopilotPromptBoxHandle>(null);
    const runStartedRef = useRef(false);
    const aiPanelOpen = useAiPanelOpen();

    // One Copilot surface per view — the floating orb stands down while this is mounted.
    useSuppressAgentStatusOrb();
    useAmbientCopilotPresence();

    useEffect(() => {
        if (!rpcClient) {
            return;
        }
        syncOrbThemeFromSetting(rpcClient);
        return subscribeAgentRunStatus(rpcClient, setStatus);
    }, [rpcClient]);

    // This composer reports run status inline, so silence the redundant status-bar item while mounted.
    useEffect(() => {
        const setInline = (active: boolean) => {
            rpcClient?.getCommonRpcClient().executeCommand({ commands: [SHARED_COMMANDS.SET_COPILOT_INLINE_STATUS, active] });
        };
        setInline(true);
        return () => setInline(false);
    }, [rpcClient]);

    const state = status?.state ?? "idle";
    const working = state !== "idle";
    // The transition starts on click, not when the extension reports the run —
    // opening the panel and starting it takes long enough to read as a dead beat.
    const showRun = working || submittedPrompt !== undefined;

    // Which block to render — frozen while hiding so the whole surface fades out
    // intact instead of the inner content vanishing and leaving the bare orb.
    const mode: "run" | "idle" | "none" = showRun ? "run" : aiPanelOpen ? "none" : "idle";
    const modeRef = useRef(mode);
    if (!hiding) {
        modeRef.current = mode;
    }
    const shownMode = hiding ? modeRef.current : mode;

    useEffect(() => {
        if (working) {
            runStartedRef.current = true;
            return;
        }
        if (submittedPrompt === undefined) {
            return;
        }
        if (runStartedRef.current) {
            runStartedRef.current = false;
            setSubmittedPrompt(undefined);
            return;
        }
        const timer = setTimeout(() => setSubmittedPrompt(undefined), RUN_START_TIMEOUT_MS);
        return () => clearTimeout(timer);
    }, [working, submittedPrompt]);

    const colors = useOrbColors(state);

    const runHeading =
        state === "awaiting-input"
            ? "Needs your input"
            : state === "error"
                ? "Something went wrong"
                : state === "completed"
                    ? "Done"
                    : "Working on it…";
    const runDetail = state === "completed" ? undefined : status?.label;
    const showOpenCopilot = !aiPanelOpen;

    const send = async (prompt: string, options: PromptSubmitOptions) => {
        // Entering from this page always starts a fresh chat, not the current thread.
        const handedOff = await submitPromptToCopilot(rpcClient, prompt, { ...options, newThread: true });
        if (handedOff) {
            setSubmittedPrompt(prompt);
            setText("");
        }
        return handedOff;
    };

    return (
        <Wrap>
            <OrbButton
                    type="button"
                    $interactive={showOpenCopilot}
                    disabled={!showOpenCopilot}
                    onClick={showOpenCopilot ? () => openCopilotPanel(rpcClient) : undefined}
                    title={showOpenCopilot ? `Open ${assistantName}` : undefined}
                    aria-label={showOpenCopilot ? `Open ${assistantName}` : undefined}
                >
                    <OrbGlow className={ORB_GLOW_CLASS}>
                        <CopilotOrb state={state} colors={colors} size={ORB_SIZE} />
                    </OrbGlow>
            </OrbButton>

            {shownMode === "run" ? (
                <RunBlock>
                    <Heading>{runHeading}</Heading>
                    {runDetail && <Subtitle $visible={!aiPanelOpen}>{runDetail}</Subtitle>}
                    {submittedPrompt && <PromptEcho>{submittedPrompt}</PromptEcho>}
                    {showOpenCopilot && (
                        <VSCodeLink onClick={() => openCopilotPanel(rpcClient)} style={{ marginTop: 8 }}>
                            Open {assistantName}
                        </VSCodeLink>
                    )}
                </RunBlock>
            ) : shownMode === "idle" ? (
                <IdleBlock>
                    <AssistantName>{assistantName}</AssistantName>
                    <Heading>What would you like to build?</Heading>

                    <ComposerRow>
                        <CopilotPromptBox
                            ref={promptRef}
                            value={text}
                            onChange={setText}
                            onSubmit={send}
                            placeholder="Describe what you want to build…"
                            ariaLabel="Describe the integration you want to build"
                            state={state}
                        />
                    </ComposerRow>

                    <ExamplesBlock>
                        <ExamplesLabel>Try one of these</ExamplesLabel>
                        <Cards>
                            {EXAMPLES.map((example) => (
                                <Card key={example.name} type="button" onClick={() => promptRef.current?.fill(example.prompt)}>
                                    <Icon
                                        name={example.icon}
                                        isCodicon={example.isCodicon ?? true}
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
                        or
                        <Button appearance="secondary" onClick={onAddArtifactManually} buttonSx={MANUAL_BUTTON_SX}>
                            Add Artifact manually
                        </Button>
                    </ManualRow>
                </IdleBlock>
            ) : null}
        </Wrap>
    );
}
