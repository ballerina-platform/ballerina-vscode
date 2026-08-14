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

import { CSSProperties, useEffect, useLayoutEffect, useRef, useState } from "react";
import { keyframes } from "@emotion/react";
import styled from "@emotion/styled";
import { AgentRunStatus, SHARED_COMMANDS } from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { Button, Codicon, Icon, ThemeColors } from "@wso2/ui-toolkit";
import {
    AWAITING_INPUT_LABEL,
    AmbientFrame,
    ACCENT_CORE,
    ACCENT_FRAME,
    ACCENT_SPHERE,
    SpinArc,
    HERO_GLOW,
    ambientGlow,
    IconOverlay,
    AGENT_BUILDER_ORB_COLORS,
    ORB_ENERGY,
    ORB_SIZE,
    Sphere,
    subscribeAgentRunStatus,
    useAiPanelOpen,
    useSuppressAgentStatusOrb,
} from "../../../components/AgentStatusOrb/shared";

const CONTENT_WIDTH = 760;

const INPUT_MIN_HEIGHT = 46;
const INPUT_MAX_HEIGHT = 220;

const EXAMPLES = [
    {
        name: "Customer Support",
        description: "Answers questions from your product docs",
        icon: "comment-discussion",
        prompt:
            "Create a customer support agent that answers product questions using a knowledge base built from our documentation, and expose it as a chat service.",
    },
    {
        name: "Issue Triager",
        description: "Triages new GitHub issues by priority",
        icon: "issues",
        prompt:
            "Create an issue triage agent that reviews new GitHub issues, suggests a priority label and posts a short summary, triggered when an issue is opened.",
    },
    {
        name: "Helpdesk Responder",
        description: "Replies on WhatsApp or Telegram",
        icon: "device-mobile",
        prompt:
            "Create a helpdesk agent that replies to incoming WhatsApp messages using our product documentation, and add a WhatsApp trigger for it.",
    },
    {
        name: "Operations Assistant",
        description: "Looks up records in internal services",
        icon: "server-process",
        prompt:
            "Create an operations agent that calls our internal HTTP services as tools to look up records and answer questions about them.",
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

const Intro = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
`;

const auraBreathe = keyframes`
    0%, 100% { transform: scale(1); opacity: 0.4; }
    50% { transform: scale(1.15); opacity: 0.7; }
`;

const OrbHolder = styled.div`
    position: relative;
    width: ${ORB_SIZE}px;
    height: ${ORB_SIZE}px;
    flex: none;
    border-radius: 50%;
    box-shadow: ${ambientGlow(ACCENT_FRAME, HERO_GLOW)};

    &::before {
        content: "";
        position: absolute;
        inset: -75%;
        border-radius: 50%;
        background: radial-gradient(
            circle,
            color-mix(in srgb, ${ACCENT_FRAME[1]} 32%, transparent) 0%,
            color-mix(in srgb, ${ACCENT_FRAME[0]} 12%, transparent) 45%,
            transparent 70%
        );
        filter: blur(12px);
        animation: ${auraBreathe} 5.5s ease-in-out infinite;
        pointer-events: none;
    }

    @media (prefers-reduced-motion: reduce) {
        &::before {
            animation: none;
            opacity: 0.75;
        }
    }
`;

const CopilotName = styled.div`
    margin-top: 20px;
    color: var(--vscode-descriptionForeground);
    font-size: 14px;
    font-weight: 400;
    text-align: center;
`;

const Heading = styled.h2`
    margin: 0;
    font-size: 28px;
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

const Composer = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 12px 8px;
    border-radius: 12.5px;
    background: var(--vscode-editorWidget-background);
`;

const ComposerRow = styled.div`
    width: 100%;
    max-width: ${CONTENT_WIDTH}px;
    margin-top: 32px;
`;

const ComposerFrame = styled(AmbientFrame)`
    padding: 1px;
`;

const PromptInput = styled.textarea`
    border: none;
    outline: none;
    resize: none;
    background: transparent;
    color: var(--vscode-input-foreground);
    font-family: var(--vscode-font-family);
    font-size: 14px;
    line-height: 1.5;
    min-height: ${INPUT_MIN_HEIGHT}px;
    max-height: ${INPUT_MAX_HEIGHT}px;
    overflow-y: auto;
    scrollbar-width: none;

    &::-webkit-scrollbar {
        display: none;
    }

    &::placeholder {
        color: var(--vscode-input-placeholderForeground);
    }
`;

const ComposerFooter = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
`;

const RoundButton = styled.button<{ primary?: boolean }>`
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: ${(props: { primary?: boolean }) => (props.primary ? "var(--vscode-button-background)" : "transparent")};
    color: ${(props: { primary?: boolean }) => (props.primary ? "var(--vscode-button-foreground)" : "var(--vscode-foreground)")};
    cursor: pointer;

    & > div {
        width: 16px;
        height: 16px;
        line-height: 16px;
    }

    &:hover:not(:disabled) {
        background: var(--vscode-toolbar-hoverBackground);
    }

    &:disabled {
        opacity: 0.4;
        cursor: default;
    }
`;

const ExamplesBlock = styled.div`
    width: 100%;
    max-width: ${CONTENT_WIDTH}px;
    margin-top: 40px;
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

    @media (max-width: 900px) {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
`;

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

const ManualRow = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 28px;
    color: var(--vscode-descriptionForeground);
    font-size: 13px;
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

interface EmptyStateProps {
    onCreateFromScratch: () => void;
}

export function EmptyState({ onCreateFromScratch }: EmptyStateProps) {
    const { rpcClient } = useRpcContext();
    const [status, setStatus] = useState<AgentRunStatus | null>(null);
    const [text, setText] = useState("");
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const focusOnTextRef = useRef(false);

    const aiPanelOpen = useAiPanelOpen();

    useSuppressAgentStatusOrb();

    useEffect(() => {
        if (!rpcClient) {
            return;
        }
        return subscribeAgentRunStatus(rpcClient, setStatus);
    }, [rpcClient]);

    useLayoutEffect(() => {
        const input = inputRef.current;
        if (!input) {
            return;
        }
        input.style.height = "auto";
        input.style.height = `${Math.min(input.scrollHeight, INPUT_MAX_HEIGHT)}px`;
        if (focusOnTextRef.current) {
            focusOnTextRef.current = false;
            input.focus();
            input.setSelectionRange(input.value.length, input.value.length);
        }
    }, [text]);

    const state = status?.state ?? "idle";
    const working = state !== "idle";
    const running = state === "running";

    const orbColors = working ? AGENT_BUILDER_ORB_COLORS[state] : ACCENT_SPHERE;
    const orbHighlight = working ? `color-mix(in srgb, ${orbColors[0]} 70%, transparent)` : ACCENT_CORE;
    const runHeading =
        state === "awaiting-input"
            ? AWAITING_INPUT_LABEL
            : state === "error"
                ? "Something went wrong"
                : state === "completed"
                    ? "All done"
                    : "Building your agent";
    const runDetail =
        state === "completed" ? undefined : status?.label ?? (running ? "Working on it…" : undefined);
    const showOpenCopilot = !aiPanelOpen;

    const openCopilot = () => {
        rpcClient?.getCommonRpcClient().executeCommand({ commands: [SHARED_COMMANDS.OPEN_AI_PANEL] });
    };

    const send = (prompt: string) => {
        const trimmed = prompt.trim();
        if (!trimmed) {
            openCopilot();
            return;
        }
        rpcClient?.getCommonRpcClient().executeCommand({
            commands: [
                SHARED_COMMANDS.OPEN_AI_PANEL,
                { type: "text", text: trimmed, planMode: false, autoSubmit: true, newThread: true },
            ],
        });
        setText("");
    };

    const fillExample = (prompt: string) => {
        focusOnTextRef.current = true;
        setText(prompt);
    };

    return (
        <Wrap>
            <OrbHolder>
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
                {running && <SpinArc color={ACCENT_FRAME[1]} />}
            </OrbHolder>

            {working ? (
                <>
                    <Intro>
                        <Heading>{runHeading}</Heading>
                        {runDetail && <Subtitle live>{runDetail}</Subtitle>}
                    </Intro>
                    {showOpenCopilot && (
                        <ScratchLine>
                            <LinkButton type="button" onClick={openCopilot}>
                                Open WSO2 Agent Builder Intelligence
                            </LinkButton>
                        </ScratchLine>
                    )}
                </>
            ) : (
                <>
                    <CopilotName>WSO2 Agent Builder Intelligence</CopilotName>
                    <Intro>
                        <Heading>What should your agent do?</Heading>
                    </Intro>

                    <ComposerRow>
                        <ComposerFrame $variant="hero" $state={state} $colors={ACCENT_FRAME}>
                            <Composer>
                                <PromptInput
                                    ref={inputRef}
                                    rows={2}
                                    value={text}
                                    onChange={(event) => setText(event.target.value)}
                                    onKeyDown={(event) => {
                                        if (event.key === "Enter" && !event.shiftKey) {
                                            event.preventDefault();
                                            send(text);
                                        }
                                    }}
                                    placeholder="Describe what you want your agent to do…"
                                    aria-label="Describe the agent you want to build"
                                />
                                <ComposerFooter>
                                    <RoundButton type="button" title="Open WSO2 Agent Builder Intelligence" onClick={openCopilot}>
                                        <Codicon name="add" />
                                    </RoundButton>
                                    <RoundButton
                                        type="button"
                                        title="Send to WSO2 Agent Builder Intelligence"
                                        aria-label="Send to WSO2 Agent Builder Intelligence"
                                        disabled={!text.trim()}
                                        onClick={() => send(text)}
                                        primary={true}
                                    >
                                        <Codicon name="arrow-up" />
                                    </RoundButton>
                                </ComposerFooter>
                            </Composer>
                        </ComposerFrame>
                    </ComposerRow>

                    <ExamplesBlock>
                        <ExamplesLabel>Examples</ExamplesLabel>
                        <Cards>
                            {EXAMPLES.map((example) => (
                                <Card key={example.name} type="button" onClick={() => fillExample(example.prompt)}>
                                    <Icon
                                        name={example.icon}
                                        isCodicon={true}
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
                        <Button appearance="secondary" onClick={onCreateFromScratch} buttonSx={MANUAL_BUTTON_SX}>
                            Add an agent manually
                        </Button>
                    </ManualRow>
                </>
            )}
        </Wrap>
    );
}
