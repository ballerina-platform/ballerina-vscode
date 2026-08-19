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
 * 
 * THIS FILE INCLUDES AUTO GENERATED CODE
 */

import React, { useState, useEffect, useRef } from "react";
import styled from "@emotion/styled";
import ChatInput from "./ChatInput";
import LoadingIndicator from "./LoadingIndicator";
import { ExecutionTimeline } from "./ExecutionTimeline";
import { ApprovalCard } from "./ApprovalCard";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { Icon, Button, ThemeColors } from "@wso2/ui-toolkit";
import { SessionInfoResponse, AgentInfo, PendingApprovalInfo, HumanResponse, ChatHistoryMessage } from "@wso2/ballerina-core";
import ReactMarkdown from "react-markdown";
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { ExecutionStep } from "@wso2/ballerina-core";

enum ChatMessageType {
    MESSAGE = "message",
    ERROR = "error",
    APPROVAL = "approval",
}

interface ChatMessage {
    type: ChatMessageType;
    text: string;
    isUser: boolean;
    traceId?: string;
    executionSteps?: ExecutionStep[];
    // Present when type is APPROVAL: the requests the agent paused on.
    pendingApproval?: PendingApprovalInfo;
    // Present once (some or all of) the pending approval above has been resolved.
    decisions?: Record<string, HumanResponse>;
    // Set when the user dismisses this batch after it keeps failing to submit. Terminal even
    // if some requests still lack a decision.
    unresolvable?: boolean;
}

function isApprovalUnresolved(msg: ChatMessage): boolean {
    return msg.type === ChatMessageType.APPROVAL
        && !!msg.pendingApproval
        && !msg.unresolvable
        && msg.pendingApproval.requests.some(r => !msg.decisions?.[r.id]);
}

// ---------- WATER MARK ----------
const Watermark = styled.div`
    position: absolute;
    width: 80%;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    text-align: center;
    pointer-events: none;
    user-select: none;
`;

const ChatIcon = styled.span`
    font-size: 60px !important;
    width: 60px;
    height: 60px;
    display: block;
    margin: 0 0;
`;

const WatermarkTitle = styled.div`
    font-size: 1.5em;
    font-weight: bold;
`;

const WatermarkSubTitle = styled.div`
    font-size: 14px;
    margin-top: 24px;
    color: var(--vscode-descriptionForeground);
`;

// ---------- CHAT AREA ----------
export const ChatWrapper = styled.div`
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100%;
    container-type: inline-size;
`;

export const ChatContainer = styled.div`
    position: relative;
    display: flex;
    flex-direction: column;
    flex: 1;
    overflow: hidden;
    margin: 20px 0 32px 0;
`;

export const Messages = styled.div`
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
    position: relative;
    z-index: 1;
    padding: 8px 20px;
    height: 100%;

    @container (min-width: 1000px) {
        padding: 8px 10%;
    }

    @container (min-width: 1600px) {
        padding: 8px 15%;
    }

    @container (min-width: 2000px) {
        padding: 8px 20%;
    }
`;

export const MessageContainer = styled.div<{ isUser: boolean }>`
    display: flex;
    align-items: flex-end;
    justify-content: ${({ isUser }: { isUser: boolean }) => (isUser ? "flex-end" : "flex-start")};
    gap: 6px;
    margin-bottom: 8px;
    ${({ isUser }: { isUser: boolean }) => isUser ? "padding-left: 34px;" : ""}
`;

export const ProfilePic = styled.div`
    padding: 4px;
    border: 1px solid var(--vscode-panel-border);
    background-color: var(--vscode-editor-background);
    border-radius: 50%;
    object-fit: cover;
`;

export const MessageBubble = styled.div<{ isUser: boolean; isError?: boolean; isLoading?: boolean }>`
    position: relative;
    padding: ${({ isLoading }: { isLoading?: boolean }) => (isLoading ? "10px 14px" : "2px 14px")};
    max-width: 100%;
    align-self: ${({ isUser }: { isUser: boolean }) => (isUser ? "flex-end" : "flex-start")};
    overflow-wrap: break-word;
    word-break: break-word;
    hyphens: auto;

    color: ${({ isError }: { isError: boolean }) => (isError ? "var(--vscode-errorForeground)" : "inherit")};

    &:before {
        content: "";
        position: absolute;
        inset: 0;
        background-color: ${({ isUser, isError }: { isUser: boolean; isError?: boolean }) =>
        isError ? "var(--vscode-errorForeground)" : isUser ? "var(--vscode-button-background)" : "var(--vscode-input-background)"};
        opacity: ${({ isUser, isError }: { isUser: boolean; isError?: boolean }) => (isUser ? "0.3" : isError ? "0.05" : "1")};
        border-radius: inherit;
        border: 1px solid ${({ isUser }: { isUser: boolean }) =>
        isUser ? "var(--vscode-peekView-border)" : "var(--vscode-panel-border)"};
        z-index: -1;
    }

    border-radius: ${({ isUser }: { isUser: boolean }) => (isUser ? "12px 12px 0px 12px" : "12px 12px 12px 0px")};
`;

const MessageActionsContainer = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
    margin: -4px 0 8px 36px;
    flex-wrap: wrap;
`;

// ---------- CHAT FOOTER ----------
const ChatFooter = styled.div`
    position: sticky;
    bottom: 20px;
    width: 100%;
    padding: 0 20px;
`;

const ShowLogsButton = styled.button`
    background: none;
    border: none;
    color: var(--vscode-textLink-foreground);
    font-size: 12px;
    padding: 4px 0;
    cursor: pointer;
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    margin-top: -8px;
    gap: 4px;

    &:hover {
        text-decoration: underline;
        color: var(--vscode-textLink-activeForeground);
    }
`;

const ChatHeader = styled.div`
    position: sticky;
    top: 0;
    display: flex;
    justify-content: flex-end;
    align-items: center;
    padding: 12px 8px 8px;
    z-index: 2;
    border-bottom: 1px solid var(--vscode-panel-border);
    gap: 6px;
    flex-wrap: wrap;
`;

const ClearChatButton = styled.button`
    background: none;
    border: 1px solid var(--vscode-panel-border);
    color: var(--vscode-foreground);
    font-size: 12px;
    padding: 4px 8px;
    cursor: pointer;
    border-radius: 4px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    white-space: nowrap;

    &:hover {
        background-color: var(--vscode-list-hoverBackground);
    }

    &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
`;

const ButtonLabel = styled.span`
    @media (max-width: 400px) {
        display: none;
    }
`;

// ---------- INFO POPOVER ----------
const InfoButtonWrapper = styled.div`
    position: relative;
`;

const InfoPopover = styled.div`
    position: absolute;
    top: calc(100% + 2px);
    left: 0;
    width: 320px;
    max-width: 320px;
    background-color: var(--vscode-editorWidget-background);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 4px;
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
    z-index: 100;
    padding: 12px;
`;

const InfoRow = styled.div`
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 6px 0;

    &:not(:last-child) {
        border-bottom: 1px solid var(--vscode-panel-border);
    }
`;

const InfoLabel = styled.span`
    color: var(--vscode-descriptionForeground);
    font-size: 12px;
    font-weight: 600;
`;

const InfoValueRow = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
`;

const InfoValue = styled.span`
    color: var(--vscode-foreground);
    font-family: var(--vscode-editor-font-family);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
    flex: 1;
`;

const CopyButton = styled.button`
    background: none;
    border: none;
    color: var(--vscode-descriptionForeground);
    cursor: pointer;
    padding: 2px;
    display: flex;
    align-items: center;
    flex-shrink: 0;
    border-radius: 3px;

    &:hover {
        color: var(--vscode-foreground);
        background-color: var(--vscode-list-hoverBackground);
    }
`;

// ---------- AGENT SELECTOR ----------
const AgentSelectorWrapper = styled.div`
    position: relative;
    display: inline-flex;
    align-items: center;
    min-width: 0;
`;

const AgentSelectorButton = styled.button`
    background: none;
    border: 1px solid var(--vscode-panel-border);
    color: var(--vscode-foreground);
    font-size: 12px;
    padding: 6px 8px;
    cursor: pointer;
    border-radius: 4px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    max-width: 200px;
    min-width: 0;

    &:hover {
        background-color: var(--vscode-list-hoverBackground);
    }
`;

const AgentSelectorName = styled.span`
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;

    @media (max-width: 400px) {
        display: none;
    }
`;

const AgentDropdown = styled.div`
    position: absolute;
    top: calc(100% + 2px);
    left: 0;
    min-width: 180px;
    max-width: 280px;
    background-color: var(--vscode-editorWidget-background);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 4px;
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
    z-index: 100;
    overflow: hidden;
`;

const AgentDropdownItem = styled.button<{ isActive: boolean }>`
    width: 100%;
    background: ${({ isActive }: { isActive: boolean }) =>
        isActive ? "var(--vscode-list-activeSelectionBackground)" : "none"};
    color: ${({ isActive }: { isActive: boolean }) =>
        isActive ? "var(--vscode-list-activeSelectionForeground)" : "var(--vscode-foreground)"};
    border: none;
    padding: 6px 12px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    text-align: left;

    &:hover {
        background-color: ${({ isActive }: { isActive: boolean }) =>
        isActive ? "var(--vscode-list-activeSelectionBackground)" : "var(--vscode-list-hoverBackground)"};
    }
`;

const AgentItemName = styled.span`
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
    min-width: 0;
`;

const AgentItemPath = styled.span`
    color: var(--vscode-descriptionForeground);
    font-size: 11px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 50%;
    flex-shrink: 1;
`;

// ---------- WARNING POPUP ----------
const ModalBackdrop = styled.div({
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000
});

const ModalContent = styled.div<{ maxWidth: string }>(({ maxWidth }: { maxWidth: string }) => ({
    backgroundColor: ThemeColors.SURFACE,
    color: ThemeColors.ON_SURFACE,
    padding: '20px',
    border: `1px solid ${ThemeColors.OUTLINE_VARIANT}`,
    borderRadius: '4px',
    boxShadow: '0 4px 24px rgba(0, 0, 0, 0.4)',
    maxWidth: maxWidth,
    margin: '0 16px',
    textAlign: 'center'
}));

const ButtonContainer = styled.div({
    marginTop: '20px',
    display: 'flex',
    justifyContent: 'center',
    gap: '10px'
});

// ---------- HELPER COMPONENTS ----------
interface ModalProps {
    isOpen: boolean;
    children: React.ReactNode;
    onClose?: () => void;
    maxWidth?: string;
}

const Modal: React.FC<ModalProps> = ({ isOpen, children, onClose, maxWidth = '400px' }) => {
    if (!isOpen) return null;

    const handleBackdropClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget && onClose) {
            onClose();
        }
    };

    return (
        <ModalBackdrop onClick={handleBackdropClick}>
            <ModalContent maxWidth={maxWidth}>
                {children}
            </ModalContent>
        </ModalBackdrop>
    );
};

interface ClearChatWarningPopupProps {
    isOpen: boolean;
    onContinue: () => void;
    onCancel: () => void;
}

const ClearChatWarningPopup: React.FC<ClearChatWarningPopupProps> = ({ isOpen, onContinue, onCancel }) => {
    return (
        <Modal isOpen={isOpen} onClose={onCancel} maxWidth='450px'>
            <p>Are you sure you want to clear the chat? This will remove all messages and cannot be undone.</p>
            <ButtonContainer>
                <Button
                    appearance='primary'
                    onClick={onContinue}>
                    Clear Chat
                </Button>
                <Button
                    appearance='secondary'
                    onClick={onCancel}>
                    Cancel
                </Button>
            </ButtonContainer>
        </Modal>
    );
};

function toDisplayName(name: string): string {
    return name
        .replace(/\\/g, '')
        .replace(/[-_]/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
        .replace(/\b\w/g, c => c.toUpperCase())
        .replace("Agent Chat/", "");
}

function toChatMessage(msg: ChatHistoryMessage): ChatMessage {
    return {
        type: msg.type === 'error'
            ? ChatMessageType.ERROR
            : msg.type === 'approval'
                ? ChatMessageType.APPROVAL
                : ChatMessageType.MESSAGE,
        text: msg.text,
        isUser: msg.isUser,
        traceId: msg.traceId,
        executionSteps: msg.executionSteps,
        pendingApproval: msg.pendingApproval,
        decisions: msg.decisions,
        unresolvable: msg.unresolvable,
    };
}

// Preprocess LaTeX delimiters to convert \(...\) and \[...\] to $...$ and $$...$$
export function preprocessLatex(text: string): string {
    if (!text || typeof text !== 'string') return text;

    // Convert display math \[...\] to $$...$$
    let processed = text.replace(/\\\[(.*?)\\\]/gs, (_, math) => `$$${math}$$`);

    // Convert inline math \(...\) to $...$
    processed = processed.replace(/\\\((.*?)\\\)/gs, (_, math) => `$${math}$`);

    return processed;
}

const ChatInterface: React.FC = () => {
    const { rpcClient } = useRpcContext();
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isTracingEnabled, setIsTracingEnabled] = useState(false);
    const [showClearWarning, setShowClearWarning] = useState(false);
    const [showInfoPopover, setShowInfoPopover] = useState(false);
    const [sessionInfo, setSessionInfo] = useState<SessionInfoResponse | null>(null);
    const [copiedField, setCopiedField] = useState<string | null>(null);
    const [availableAgents, setAvailableAgents] = useState<AgentInfo[]>([]);
    const [activeAgentName, setActiveAgentName] = useState<string>('');
    const [showAgentDropdown, setShowAgentDropdown] = useState(false);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const infoPopoverRef = useRef<HTMLDivElement>(null);
    const agentDropdownRef = useRef<HTMLDivElement>(null);
    // Bumped whenever the active session changes (switch agent, clear chat, or a switch pushed
    // from the extension host). In-flight requests capture this value and drop their response
    // if it no longer matches, rather than applying it to whatever session is now on screen.
    const sessionTokenRef = useRef(0);

    // Check if we have any traces (to enable/disable Session Traces button)
    const hasTraces = messages.some(msg => !msg.isUser && msg.traceId);

    // Block free-text input while any turn has an unresolved approval request. Scanning the
    // whole list (not just the last message) matters because a failed decision submission
    // appends an error message after the approval card, which would otherwise become
    // `lastMessage` and incorrectly report nothing pending.
    const isApprovalPending = messages.some(isApprovalUnresolved);

    // Load chat history and check tracing status on mount
    useEffect(() => {
        const loadChatHistory = async () => {
            try {
                const history = await rpcClient.getAgentChatRpcClient().getChatHistory();

                // Only restore chat if the agent is still running
                if (history.isAgentRunning && history.messages.length > 0) {
                    // Convert ChatHistoryMessage to ChatMessage format
                    const chatMessages: ChatMessage[] = history.messages.map(toChatMessage);
                    setMessages(chatMessages);
                }
                // If agent is not running, chat history is cleared automatically
            } catch (error) {
                console.error('Failed to load chat history:', error);
            }
        };

        const checkTracingStatus = async () => {
            try {
                const status = await rpcClient.getAgentChatRpcClient().getTracingStatus();
                setIsTracingEnabled(status.enabled);
            } catch (error) {
                console.error('Failed to get tracing status:', error);
                setIsTracingEnabled(false);
            }
        };

        const loadAvailableAgents = async () => {
            try {
                const response = await rpcClient.getAgentChatRpcClient().getAvailableChatAgents();
                setAvailableAgents(response.agents);
                setActiveAgentName(response.activeAgentName);
            } catch (error) {
                console.error('Failed to load available agents:', error);
            }
        };

        loadChatHistory();
        checkTracingStatus();
        loadAvailableAgents();
    }, [rpcClient]);

    // Listen for tracing status changes pushed from the extension (toggled from the diagram)
    useEffect(() => {
        rpcClient.getAgentChatRpcClient().onTracingStatusChanged((status) => {
            setIsTracingEnabled(status.enabled);
        });
    }, [rpcClient]);

    // Listen for active agent changes from the extension host (e.g. when user clicks Chat on a different agent)
    useEffect(() => {
        rpcClient.getAgentChatRpcClient().onActiveAgentChanged(async (agentName: string) => {
            try {
                sessionTokenRef.current++;
                const response = await rpcClient.getAgentChatRpcClient().switchChatAgent({ agentName });
                setActiveAgentName(agentName);

                const chatMessages: ChatMessage[] = response.chatHistory.map(toChatMessage);
                setMessages(chatMessages);
                setSessionInfo(null);
                setShowInfoPopover(false);

                // Refresh available agents in case the list changed
                const agentsResponse = await rpcClient.getAgentChatRpcClient().getAvailableChatAgents();
                setAvailableAgents(agentsResponse.agents);
            } catch (error) {
                console.error('Failed to switch agent from notification:', error);
            }
        });
    }, [rpcClient]);

    // Auto scroll to the bottom when messages change
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // Close agent dropdown on outside click
    useEffect(() => {
        if (!showAgentDropdown) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (agentDropdownRef.current && !agentDropdownRef.current.contains(e.target as Node)) {
                setShowAgentDropdown(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [showAgentDropdown]);

    // Close info popover on outside click
    useEffect(() => {
        if (!showInfoPopover) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (infoPopoverRef.current && !infoPopoverRef.current.contains(e.target as Node)) {
                setShowInfoPopover(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [showInfoPopover]);

    const handleToggleInfo = async () => {
        if (showInfoPopover) {
            setShowInfoPopover(false);
            return;
        }
        try {
            const info = await rpcClient.getAgentChatRpcClient().getSessionInfo();
            setSessionInfo(info);
            setShowInfoPopover(true);
        } catch (error) {
            console.error('Failed to get session info:', error);
            setSessionInfo(null);
            setShowInfoPopover(false);
        }
    };

    const handleCopy = async (field: string, value: string) => {
        try {
            await navigator.clipboard.writeText(value);
            setCopiedField(field);
            setTimeout(() => setCopiedField(null), 1500);
        } catch (error) {
            console.error('Failed to copy to clipboard:', error);
        }
    };

    const handleSwitchAgent = async (agentName: string) => {
        if (agentName === activeAgentName || isLoading) return;

        try {
            sessionTokenRef.current++;
            const response = await rpcClient.getAgentChatRpcClient().switchChatAgent({ agentName });
            setActiveAgentName(agentName);

            // Load the chat history for the switched agent
            const chatMessages: ChatMessage[] = response.chatHistory.map(toChatMessage);
            setMessages(chatMessages);

            // Reset session info cache
            setSessionInfo(null);
            setShowInfoPopover(false);
        } catch (error) {
            console.error('Failed to switch agent:', error);
        } finally {
            setShowAgentDropdown(false);
        }
    };

    const parseAgentError = (error: unknown): { errorMessage: string; traceId?: string; executionSteps?: ExecutionStep[] } => {
        let errorMessage = "An unknown error occurred";
        let traceId: string | undefined;
        let executionSteps: ExecutionStep[] | undefined;

        // Try to parse structured error with trace information
        if (error && typeof error === "object" && "message" in error) {
            try {
                const parsedError = JSON.parse(String(error.message));
                if (parsedError.message && parsedError.traceInfo) {
                    errorMessage = parsedError.message;
                    traceId = parsedError.traceInfo.traceId;
                    executionSteps = parsedError.traceInfo.executionSteps;
                } else {
                    // Fallback to regular error message
                    errorMessage = String(error.message);
                }
            } catch (parseError) {
                // If JSON parsing fails, use the original error message
                errorMessage = String(error.message);
            }
        }

        return { errorMessage, traceId, executionSteps };
    };

    const appendAgentResponse = (response: {
        pendingApproval?: PendingApprovalInfo;
        message: string;
        traceId?: string;
        executionSteps?: ExecutionStep[];
    }) => {
        if (response.pendingApproval) {
            setMessages((prev) => [
                ...prev,
                { type: ChatMessageType.APPROVAL, text: "", isUser: false, pendingApproval: response.pendingApproval },
            ]);
        } else {
            setMessages((prev) => [
                ...prev,
                {
                    type: ChatMessageType.MESSAGE,
                    text: response.message,
                    isUser: false,
                    traceId: response.traceId,
                    executionSteps: response.executionSteps
                },
            ]);
        }
    };

    const handleSendMessage = async (text: string) => {
        if (!text.trim()) return;

        // Capture the session token so a reply that lands after the user switched agents (or
        // cleared chat) gets dropped instead of appended to the new session's transcript.
        const requestToken = sessionTokenRef.current;

        setMessages((prev) => [...prev, { type: ChatMessageType.MESSAGE, text, isUser: true }]);
        setIsLoading(true);

        try {
            const chatResponse = await rpcClient.getAgentChatRpcClient().getChatMessage({ message: text });

            if (sessionTokenRef.current !== requestToken) {
                return;
            }

            appendAgentResponse(chatResponse);
        } catch (error) {
            if (sessionTokenRef.current !== requestToken) {
                return;
            }

            const { errorMessage, traceId, executionSteps } = parseAgentError(error);

            console.error("Chat message error:", error);

            setMessages((prev) => [...prev, {
                type: ChatMessageType.ERROR,
                text: errorMessage,
                isUser: false,
                traceId,
                executionSteps
            }]);
        } finally {
            setIsLoading(false);
        }
    };

    // Finds the approval message a batch of decisions belongs to by matching request ids,
    // rather than trusting a snapshotted array index that could point at the wrong message
    // once anything reorders `messages` between the click and the response.
    const findApprovalMessageIndex = (messages: ChatMessage[], requestIds: string[]): number => {
        return messages.findIndex(m =>
            m.type === ChatMessageType.APPROVAL && m.pendingApproval?.requests.some(r => requestIds.includes(r.id))
        );
    };

    const handleApprovalDecision = async (decisions: Record<string, HumanResponse>) => {
        // Lock session-changing actions (switch agent, clear chat) while a decision is in
        // flight, and capture the session token so a response that arrives after the user
        // switched/cleared sessions anyway is dropped instead of applied to the wrong chat.
        const requestToken = sessionTokenRef.current;
        setIsLoading(true);
        try {
            const response = await rpcClient.getAgentChatRpcClient().submitDecision({ decisions });

            if (sessionTokenRef.current !== requestToken) {
                return;
            }

            setMessages((prev) => {
                const updated = [...prev];
                const targetIndex = findApprovalMessageIndex(updated, Object.keys(decisions));
                if (targetIndex !== -1) {
                    const target = updated[targetIndex];
                    updated[targetIndex] = { ...target, decisions: { ...(target.decisions || {}), ...decisions } };
                }
                return updated;
            });

            appendAgentResponse(response);
        } catch (error) {
            if (sessionTokenRef.current !== requestToken) {
                return;
            }

            const { errorMessage, traceId, executionSteps } = parseAgentError(error);

            console.error("Submit decision error:", error);

            // Leave the approval card as-is (a failed submitDecision doesn't change what's
            // pending) so the user can retry, e.g. with a fuller set of decisions - only the
            // explicit Dismiss action below gives up on it.
            setMessages((prev) => [...prev, {
                type: ChatMessageType.ERROR,
                text: errorMessage,
                isUser: false,
                traceId,
                executionSteps
            }]);
        } finally {
            // Always clear the lock, even if the session moved on while this was in flight -
            // otherwise nothing would ever reset isLoading for the session now on screen.
            setIsLoading(false);
        }
    };

    // Lets the user give up on a batch that keeps failing (e.g. the service genuinely lost
    // track of it) instead of being stuck forever with a disabled chat input and no way out
    // but Clear Chat. This is a local, session-only decision - it doesn't call the service.
    const handleDismissApproval = (requestIds: string[]) => {
        setMessages((prev) => {
            const updated = [...prev];
            const targetIndex = findApprovalMessageIndex(updated, requestIds);
            if (targetIndex !== -1) {
                updated[targetIndex] = { ...updated[targetIndex], unresolvable: true };
            }
            return updated;
        });
    };

    const handleStop = () => {
        rpcClient.getAgentChatRpcClient().abortChatRequest();
        setIsLoading(false);
    };

    const handleShowLogs = async (messageIndex: number) => {
        try {
            // Get the trace ID from the agent's response message
            const message = messages[messageIndex];

            if (!message || message.isUser || !message.traceId) {
                console.error('No trace ID found for this message');
                return;
            }

            await rpcClient.getAgentChatRpcClient().showTraceView({
                traceId: message.traceId
            });
        } catch (error) {
            console.error('Failed to show trace view:', error);
        }
    };

    const handleClearChat = () => {
        // Show the warning popup
        setShowClearWarning(true);
    };

    const confirmClearChat = async () => {
        try {
            sessionTokenRef.current++;
            // Clear the chat history on the backend and get a new session ID
            await rpcClient.getAgentChatRpcClient().clearChatHistory();
            // Clear the messages in the UI
            setMessages([]);
            // Invalidate cached session info and popover
            setSessionInfo(null);
            setShowInfoPopover(false);
            // Close the warning popup
            setShowClearWarning(false);
        } catch (error) {
            console.error("Failed to clear chat history:", error);
        }
    };

    const cancelClearChat = () => {
        // Close the warning popup
        setShowClearWarning(false);
    };

    const handleViewInTrace = async (traceId: string, spanId: string) => {
        try {
            await rpcClient.getAgentChatRpcClient().showTraceView({
                traceId,
                focusSpanId: spanId
            });
        } catch (error) {
            console.error('Failed to show trace view:', error);
        }
    };

    const handleShowSessionLogs = async () => {
        try {
            await rpcClient.getAgentChatRpcClient().showSessionOverview({});
        } catch (error) {
            console.error('Failed to show session overview:', error);
        }
    };

    return (
        <ChatWrapper>
            <ChatHeader>
                <InfoButtonWrapper ref={infoPopoverRef}>
                    <ClearChatButton onClick={handleToggleInfo} title="Session info">
                        <Icon name="bi-info" sx={{ fontSize: 16, width: 16, height: 16 }} iconSx={{ fontSize: "16px" }} />
                    </ClearChatButton>
                    {showInfoPopover && sessionInfo && (
                        <InfoPopover>
                            <InfoRow>
                                <InfoLabel>Session ID</InfoLabel>
                                <InfoValueRow>
                                    <InfoValue title={sessionInfo.sessionId}>{sessionInfo.sessionId}</InfoValue>
                                    <CopyButton onClick={() => handleCopy('sessionId', sessionInfo.sessionId)} title="Copy session ID">
                                        <span className={`codicon codicon-${copiedField === 'sessionId' ? 'check' : 'copy'}`} style={{ fontSize: 14 }} />
                                    </CopyButton>
                                </InfoValueRow>
                            </InfoRow>
                            <InfoRow>
                                <InfoLabel>Chat Endpoint</InfoLabel>
                                <InfoValueRow>
                                    <InfoValue title={sessionInfo.chatEndpoint}>{sessionInfo.chatEndpoint}</InfoValue>
                                    <CopyButton onClick={() => handleCopy('chatEndpoint', sessionInfo.chatEndpoint)} title="Copy chat endpoint">
                                        <span className={`codicon codicon-${copiedField === 'chatEndpoint' ? 'check' : 'copy'}`} style={{ fontSize: 14 }} />
                                    </CopyButton>
                                </InfoValueRow>
                            </InfoRow>
                            <InfoRow>
                                <InfoLabel>Tracing</InfoLabel>
                                <InfoValue>{isTracingEnabled ? "Enabled" : "Disabled"}</InfoValue>
                            </InfoRow>
                        </InfoPopover>
                    )}
                </InfoButtonWrapper>
                {availableAgents.length > 1 && (
                    <AgentSelectorWrapper ref={agentDropdownRef}>
                        <AgentSelectorButton
                            onClick={() => setShowAgentDropdown(!showAgentDropdown)}
                            disabled={isLoading}
                            title="Switch agent"
                        >
                            <Icon
                                name="bi-ai-agent"
                                sx={{ width: 14, height: 14, flexShrink: 0 }}
                                iconSx={{ fontSize: "14px", color: "var(--vscode-terminal-ansiBrightCyan)" }}
                            />
                            <AgentSelectorName>{toDisplayName(activeAgentName)}</AgentSelectorName>
                            <span className="codicon codicon-chevron-down" style={{ fontSize: 10, flexShrink: 0 }} />
                        </AgentSelectorButton>
                        {showAgentDropdown && (
                            <AgentDropdown>
                                {availableAgents.map((agent) => (
                                    <AgentDropdownItem
                                        key={agent.name}
                                        isActive={agent.name === activeAgentName}
                                        onClick={() => handleSwitchAgent(agent.name)}
                                    >
                                        <Icon
                                            name="bi-ai-agent"
                                            sx={{ width: 14, height: 14, flexShrink: 0 }}
                                            iconSx={{
                                                fontSize: "14px",
                                                color: agent.name === activeAgentName
                                                    ? "var(--vscode-list-activeSelectionForeground)"
                                                    : "var(--vscode-terminal-ansiBrightCyan)"
                                            }}
                                        />
                                        <AgentItemName>{toDisplayName(agent.name)}</AgentItemName>
                                        <AgentItemPath>{agent.basePath.replace(/\\/g, '')}</AgentItemPath>
                                    </AgentDropdownItem>
                                ))}
                            </AgentDropdown>
                        )}
                    </AgentSelectorWrapper>
                )}
                <div style={{ flex: 1 }} />
                {messages.length > 0 && (
                    <>
                        {isTracingEnabled && hasTraces && (
                            <ClearChatButton onClick={handleShowSessionLogs} disabled={isLoading} title="View traces for the entire conversation">
                                <span className="codicon codicon-list-tree" />
                                <ButtonLabel>Session Traces</ButtonLabel>
                            </ClearChatButton>
                        )}
                        <ClearChatButton onClick={handleClearChat} disabled={isLoading} title="Clear chat">
                            <Icon name="bi-delete" sx={{ fontSize: 16, width: 16, height: 16 }} iconSx={{ fontSize: "16px" }} />
                            <ButtonLabel>Clear Chat</ButtonLabel>
                        </ClearChatButton>
                    </>
                )}
            </ChatHeader>
            <ChatContainer>
                {messages.length === 0 && (
                    <Watermark>
                        <ChatIcon className="codicon codicon-comment-discussion" />
                        <WatermarkTitle>Agent Chat</WatermarkTitle>
                        <WatermarkSubTitle>
                            Use this chat interface to evaluate your AI agent's responses and refine its conversational flow.
                        </WatermarkSubTitle>
                    </Watermark>
                )}
                <Messages>
                    {/* Render each message */}
                    {messages.map((msg, idx) => (
                        <React.Fragment key={idx}>
                            {!msg.isUser && isTracingEnabled && msg?.executionSteps && msg.executionSteps.length > 0 && msg.traceId && (
                                <ExecutionTimeline
                                    steps={msg.executionSteps}
                                    traceId={msg.traceId}
                                    onViewInTrace={handleViewInTrace}
                                />
                            )}
                            {msg.type === ChatMessageType.APPROVAL && msg.pendingApproval ? (
                                <MessageContainer isUser={false}>
                                    <ProfilePic>
                                        <Icon
                                            name="bi-ai-agent"
                                            sx={{ width: 18, height: 18 }}
                                            iconSx={{
                                                fontSize: "18px",
                                                color: "var(--vscode-terminal-ansiBrightCyan)",
                                                cursor: "default",
                                            }}
                                        />
                                    </ProfilePic>
                                    <ApprovalCard
                                        requests={msg.pendingApproval.requests}
                                        decisions={msg.decisions}
                                        unresolvable={msg.unresolvable}
                                        onSubmit={handleApprovalDecision}
                                        onDismiss={() => handleDismissApproval(msg.pendingApproval.requests.map(r => r.id))}
                                    />
                                </MessageContainer>
                            ) : (
                                <>
                                    <MessageContainer isUser={msg.isUser}>
                                        {!msg.isUser && (
                                            <ProfilePic>
                                                <Icon
                                                    name="bi-ai-agent"
                                                    sx={{ width: 18, height: 18 }}
                                                    iconSx={{
                                                        fontSize: "18px",
                                                        color: "var(--vscode-terminal-ansiBrightCyan)",
                                                        cursor: "default",
                                                    }}
                                                />
                                            </ProfilePic>
                                        )}
                                        <MessageBubble isUser={msg.isUser} isError={msg.type === ChatMessageType.ERROR}>
                                            <ReactMarkdown
                                                remarkPlugins={[remarkMath, remarkGfm]}
                                                rehypePlugins={[rehypeKatex]}
                                            >
                                                {preprocessLatex(msg.text)}
                                            </ReactMarkdown>
                                        </MessageBubble>
                                        {msg.isUser && (
                                            <ProfilePic>
                                                <Icon
                                                    name="bi-user"
                                                    sx={{ width: 18, height: 18 }}
                                                    iconSx={{
                                                        fontSize: "18px",
                                                        color: "var(--vscode-foreground)",
                                                        cursor: "default",
                                                    }}
                                                />
                                            </ProfilePic>
                                        )}
                                    </MessageContainer>
                                    {!msg.isUser && isTracingEnabled && msg.traceId && (
                                        <MessageActionsContainer>
                                            <ShowLogsButton onClick={() => handleShowLogs(idx)} title="View trace logs for this message">
                                                View Trace
                                            </ShowLogsButton>
                                        </MessageActionsContainer>
                                    )}
                                </>
                            )}
                        </React.Fragment>
                    ))}

                    {/* If waiting on a response, show the loading bubble */}
                    {isLoading && (
                        <MessageContainer isUser={false}>
                            <ProfilePic>
                                <Icon
                                    name="bi-ai-agent"
                                    sx={{ width: 18, height: 18 }}
                                    iconSx={{
                                        fontSize: "18px",
                                        color: "var(--vscode-foreground)",
                                        cursor: "default",
                                    }}
                                />
                            </ProfilePic>
                            <MessageBubble isUser={false} isLoading={true}>
                                <LoadingIndicator />
                            </MessageBubble>
                        </MessageContainer>
                    )}
                    <div ref={messagesEndRef} />
                </Messages>
            </ChatContainer>
            <ChatFooter>
                <ChatInput
                    value=""
                    onSend={handleSendMessage}
                    onStop={handleStop}
                    isLoading={isLoading}
                    disabled={isApprovalPending}
                    placeholder={isApprovalPending ? "Waiting on your decision…" : "Type your message..."}
                />
                {/* <FooterText>
                    <SmallInfoIcon className="codicon codicon-info" />
                    <span>Add chat to external application.</span>
                    <a
                        href="https://example.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                            marginLeft: "8px",
                            textDecoration: "underline",
                            cursor: "pointer",
                        }}
                    >
                        More info
                    </a>
                </FooterText> */}
            </ChatFooter>
            <ClearChatWarningPopup
                isOpen={showClearWarning}
                onContinue={confirmClearChat}
                onCancel={cancelClearChat}
            />
        </ChatWrapper>
    );
};

export default ChatInterface;
