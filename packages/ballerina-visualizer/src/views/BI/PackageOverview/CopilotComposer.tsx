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
import { AgentRunStatus, AttachmentStatus, SHARED_COMMANDS } from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { Button, Icon, ThemeColors } from "@wso2/ui-toolkit";
import ModeToggle, { AgentMode } from "../../AIPanel/components/AIChatInput/ModeToggle";
import { useAttachments } from "../../AIPanel/components/AIChatInput/hooks/useAttachments";
import { acceptResolver, handleAttachmentSelection } from "../../AIPanel/utils/attachment/attachmentManager";
import AttachmentBox from "../../AIPanel/components/AttachmentBox";
import {
    AmbientFrame,
    ORB_SIZE,
    subscribeAgentRunStatus,
    syncOrbThemeFromSetting,
    useAiPanelOpen,
    useAmbientCopilotPresence,
    useSuppressAgentStatusOrb,
} from "../../../components/AgentStatusOrb/shared";
import { CopilotOrb } from "../../../components/AgentStatusOrb/CopilotOrb";
import { useOrbColors } from "../../../components/AgentStatusOrb/orbTheme";
import { openCopilotPanel, submitPromptToCopilot } from "../../../components/AgentStatusOrb/copilotPanel";

const CONTENT_WIDTH = 620;
const INPUT_MIN_HEIGHT = 46;
const INPUT_MAX_HEIGHT = 200;
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

const OrbButton = styled.button<{ $interactive: boolean }>`
    position: relative;
    width: ${ORB_SIZE}px;
    height: ${ORB_SIZE}px;
    padding: 0;
    border: none;
    background: transparent;
    outline-offset: 4px;
    cursor: ${(props: { $interactive: boolean }) => (props.$interactive ? "pointer" : "default")};
    transition: transform 0.2s ease;
    &:hover {
        transform: ${(props: { $interactive: boolean }) => (props.$interactive ? "scale(1.06)" : "none")};
    }
    &:active {
        transform: ${(props: { $interactive: boolean }) => (props.$interactive ? "scale(0.98)" : "none")};
    }
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

const Composer = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
    padding: 12px 12px 8px;
    border-radius: 12.5px;
    background: var(--vscode-editorWidget-background);
    cursor: text;
`;

const PromptTextArea = styled.textarea`
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

const ActionRow = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
`;

const RightControls = styled.div`
    display: flex;
    align-items: center;
    gap: 2px;
`;

const AttachmentsWrap = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin: 8px 0;
    min-width: 0;
    max-width: 100%;
`;

// Caps each chip and ellipsizes its filename (the shared AttachmentBox has no width limit).
const AttachmentChip = styled.div`
    display: inline-flex;
    min-width: 0;
    max-width: 240px;

    & > div {
        max-width: 100%;
        overflow: hidden;
    }
    & > div > span:first-of-type {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
`;

// Matches the AI panel's ActionButton (AIChatInput/index.tsx).
const ComposerActionButton = styled.button`
    width: 24px;
    height: 24px;
    background-color: transparent;
    color: var(--vscode-icon-foreground);
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background-color 0.2s;
    box-sizing: border-box;

    &:hover:not(:disabled) {
        background-color: var(--vscode-toolbar-hoverBackground);
    }

    &:active:not(:disabled) {
        background-color: var(--vscode-toolbar-activeBackground);
    }

    &:disabled {
        color: var(--vscode-disabledForeground);
        cursor: default;
    }
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
    const [status, setStatus] = useState<AgentRunStatus | null>(null);
    const [text, setText] = useState("");
    const [agentMode, setAgentMode] = useState<AgentMode>(AgentMode.Edit);
    const [submittedPrompt, setSubmittedPrompt] = useState<string>();
    const { attachments, fileInputRef, handleAttachClick, onAttachmentSelection, removeAttachment, removeAllAttachments } =
        useAttachments({
            attachmentOptions: { multiple: true, acceptResolver, handleAttachmentSelection },
            activeCommand: null,
        });
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const focusOnTextRef = useRef(false);
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

    // A failed chip stays visible until removed instead of being silently dropped on send.
    const attachmentsReady = attachments.every((a) => a.status === AttachmentStatus.Success);
    const canSend = text.trim().length > 0 && attachmentsReady;

    const send = async (prompt: string) => {
        const trimmed = prompt.trim();
        if (!trimmed || !attachmentsReady) {
            return;
        }
        // Entering from this page always starts a fresh chat, not the current thread.
        const handedOff = await submitPromptToCopilot(rpcClient, trimmed, {
            planMode: agentMode === AgentMode.Plan,
            attachments,
            newThread: true,
        });
        if (handedOff) {
            setSubmittedPrompt(trimmed);
            setText("");
            removeAllAttachments();
        }
    };

    const fillExample = (prompt: string) => {
        focusOnTextRef.current = true;
        setText(prompt);
    };

    return (
        <Wrap>
            <OrbButton
                type="button"
                $interactive={showOpenCopilot}
                disabled={!showOpenCopilot}
                onClick={showOpenCopilot ? () => openCopilotPanel(rpcClient) : undefined}
                title={showOpenCopilot ? "Open WSO2 Integration Intelligence" : undefined}
                aria-label={showOpenCopilot ? "Open WSO2 Integration Intelligence" : undefined}
            >
                <CopilotOrb state={state} colors={colors} size={ORB_SIZE} />
            </OrbButton>

            {shownMode === "run" ? (
                <RunBlock>
                    <Heading>{runHeading}</Heading>
                    {runDetail && <Subtitle $visible={!aiPanelOpen}>{runDetail}</Subtitle>}
                    {submittedPrompt && <PromptEcho>{submittedPrompt}</PromptEcho>}
                </RunBlock>
            ) : shownMode === "idle" ? (
                <IdleBlock>
                    <AssistantName>WSO2 Integration Intelligence</AssistantName>
                    <Heading>What would you like to build?</Heading>

                    <ComposerRow>
                        <AmbientFrame $variant="hero" $state={state}>
                            <Composer>
                                <PromptTextArea
                                    ref={inputRef}
                                    rows={2}
                                    value={text}
                                    onChange={(event) => setText(event.target.value)}
                                    onKeyDown={(event) => {
                                        if (event.key === "Enter" && !event.shiftKey) {
                                            event.preventDefault();
                                            if (canSend) {
                                                void send(text);
                                            }
                                        }
                                    }}
                                    placeholder="Describe what you want to build…"
                                    aria-label="Describe the integration you want to build"
                                />
                                {attachments.length > 0 && (
                                    <AttachmentsWrap>
                                        {attachments.map((file, index) => (
                                            <AttachmentChip key={index} title={file.name}>
                                                <AttachmentBox
                                                    status={file.status}
                                                    fileName={file.name}
                                                    index={index}
                                                    removeAttachment={removeAttachment}
                                                />
                                            </AttachmentChip>
                                        ))}
                                    </AttachmentsWrap>
                                )}
                                <ActionRow>
                                    <ModeToggle mode={agentMode} onChange={setAgentMode} />
                                    <RightControls>
                                        <input
                                            type="file"
                                            multiple
                                            accept={acceptResolver(null)}
                                            style={{ display: "none" }}
                                            ref={fileInputRef}
                                            onChange={onAttachmentSelection}
                                        />
                                        <ComposerActionButton type="button" title="Attach context" onClick={handleAttachClick}>
                                            <Icon name="Paperclip" sx={{ fontSize: "16px" }} />
                                        </ComposerActionButton>
                                        <ComposerActionButton
                                            type="button"
                                            title={attachmentsReady ? "Send to WSO2 Integration Intelligence" : "Remove failed attachments to send"}
                                            aria-label="Send to WSO2 Integration Intelligence"
                                            disabled={!canSend}
                                            onClick={() => void send(text)}
                                        >
                                            <Icon name="Send" sx={{ fontSize: "16px" }} />
                                        </ComposerActionButton>
                                    </RightControls>
                                </ActionRow>
                            </Composer>
                        </AmbientFrame>
                    </ComposerRow>

                    <ExamplesBlock>
                        <ExamplesLabel>Try one of these</ExamplesLabel>
                        <Cards>
                            {EXAMPLES.map((example) => (
                                <Card key={example.name} type="button" onClick={() => fillExample(example.prompt)}>
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
