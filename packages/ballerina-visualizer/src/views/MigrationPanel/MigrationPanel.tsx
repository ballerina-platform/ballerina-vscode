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
import { ChatNotify } from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import styled from "@emotion/styled";
import MarkdownRenderer from "../AIPanel/components/MarkdownRenderer";
import MigrationEnhancementBanner from "../AIPanel/components/MigrationEnhancementBanner";

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

type MigrationEnhancementMode = "auto-fix";

interface MigrationSessionState {
    isActive: boolean;
    aiFeatureUsed: boolean;
    fullyEnhanced: boolean;
}

interface StreamMessage {
    id: string;
    role: "assistant" | "user" | "system";
    content: string;
    toolCalls?: Array<{ name: string; input?: any; id?: string }>;
    toolResults?: Array<{ name: string; output?: any; id?: string }>;
}

// ──────────────────────────────────────────────────────────────────────────────
// Styled components
// ──────────────────────────────────────────────────────────────────────────────

const PanelContainer = styled.div`
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100%;
    background-color: var(--vscode-editor-background);
    font-family: var(--vscode-font-family);
    color: var(--vscode-editor-foreground);
`;

const PanelHeader = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 16px;
    border-bottom: 1px solid var(--vscode-panel-border);
    flex-shrink: 0;
`;

const HeaderTitle = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-weight: 600;
`;

const HeaderActions = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
`;

const ModelSelector = styled.select`
    background: var(--vscode-dropdown-background);
    color: var(--vscode-dropdown-foreground);
    border: 1px solid var(--vscode-dropdown-border);
    border-radius: 3px;
    padding: 2px 6px;
    font-size: 11px;
    font-family: var(--vscode-font-family);
    cursor: pointer;
    outline: none;

    &:focus {
        border-color: var(--vscode-focusBorder);
    }
`;

const MessageArea = styled.div`
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
`;

const MessageBubble = styled.div<{ role: string }>`
    max-width: 100%;
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 13px;
    line-height: 1.5;
    background-color: ${(props: { role: string }) =>
        props.role === "user"
            ? "var(--vscode-textBlockQuote-background)"
            : "transparent"};
    border: ${(props: { role: string }) =>
        props.role === "user"
            ? "1px solid var(--vscode-textBlockQuote-border)"
            : "none"};
`;

const ToolCallBadge = styled.div`
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    margin: 2px 0;
    border-radius: 3px;
    font-size: 11px;
    font-weight: 500;
    background-color: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
`;

const StatusBar = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 16px;
    border-top: 1px solid var(--vscode-panel-border);
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    flex-shrink: 0;
`;

const ActionButton = styled.button<{ variant?: "primary" | "secondary" | "danger" }>`
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 12px;
    border-radius: 3px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    border: 1px solid
        ${(props: { variant?: string }) => {
            switch (props.variant) {
                case "danger":
                    return "var(--vscode-errorForeground)";
                case "secondary":
                    return "var(--vscode-button-secondaryBackground)";
                default:
                    return "var(--vscode-button-background)";
            }
        }};
    background-color: ${(props: { variant?: string }) => {
        switch (props.variant) {
            case "danger":
                return "transparent";
            case "secondary":
                return "var(--vscode-button-secondaryBackground)";
            default:
                return "var(--vscode-button-background)";
        }
    }};
    color: ${(props: { variant?: string }) => {
        switch (props.variant) {
            case "danger":
                return "var(--vscode-errorForeground)";
            case "secondary":
                return "var(--vscode-button-secondaryForeground)";
            default:
                return "var(--vscode-button-foreground)";
        }
    }};

    &:hover {
        opacity: 0.85;
    }

    &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
`;

const EmptyState = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    height: 100%;
    text-align: center;
    opacity: 0.7;

    .codicon {
        font-size: 48px;
        opacity: 0.4;
    }
`;

const EmptyStateTitle = styled.div`
    font-size: 16px;
    font-weight: 600;
`;

const EmptyStateDesc = styled.div`
    font-size: 12px;
    max-width: 320px;
    line-height: 1.6;
`;

const ModeCardRow = styled.div`
    display: flex;
    gap: 12px;
    margin-top: 16px;
    flex-wrap: wrap;
    justify-content: center;
`;

const ModeCard = styled.button`
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 14px 18px;
    border-radius: 6px;
    border: 1px solid var(--vscode-panel-border);
    background: var(--vscode-editor-background);
    color: var(--vscode-editor-foreground);
    cursor: pointer;
    text-align: left;
    width: 180px;
    font-family: var(--vscode-font-family);
    transition: border-color 0.15s, background-color 0.15s;

    &:hover {
        border-color: var(--vscode-focusBorder);
        background: var(--vscode-list-hoverBackground);
    }
`;

const ModeCardTitle = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 600;
`;

const ModeCardDesc = styled.div`
    font-size: 11px;
    opacity: 0.7;
    line-height: 1.5;
`;

// ──────────────────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────────────────

export function MigrationPanel() {
    const { rpcClient } = useRpcContext();
    const messageEndRef = useRef<HTMLDivElement>(null);
    // Guard to ensure migrationPanelReady is only called once per mount
    const readySignalSent = useRef(false);

    // Session state from the backend
    const [session, setSession] = useState<MigrationSessionState>({
        isActive: false,
        aiFeatureUsed: false,
        fullyEnhanced: true,
    });
    // Tracks whether we've received at least one real session state from the backend
    const [sessionLoaded, setSessionLoaded] = useState(false);

    // Streaming state
    const [messages, setMessages] = useState<StreamMessage[]>([]);
    const [isStreaming, setIsStreaming] = useState(false);
    const [currentContent, setCurrentContent] = useState("");
    const [selectedModel, setSelectedModel] = useState("copilot");
    const [bannerDismissed, setBannerDismissed] = useState(false);

    // Fetch session state from backend on mount
    useEffect(() => {
        const fetchSession = async () => {
            try {
                const client = rpcClient.getMigrateIntegrationRpcClient() as any;
                const state = await client.getActiveMigrationSession();
                console.log("[MigrationPanel] session state:", JSON.stringify(state));
                setSession(state);
                setSessionLoaded(true);

                // Signal the backend that the panel is ready — this triggers
                // the migration agent if the session is active and not enhanced.
                if (state && state.isActive && !state.fullyEnhanced && !readySignalSent.current) {
                    readySignalSent.current = true;
                    client.migrationPanelReady().catch((e: unknown) =>
                        console.error("[MigrationPanel] migrationPanelReady failed:", e)
                    );
                }
            } catch (err) {
                console.error("[MigrationPanel] Failed to fetch session:", err);
            }
        };

        fetchSession();
        // Retry once after a short delay (handles race with extension activation)
        const timer = setTimeout(fetchSession, 2000);
        return () => clearTimeout(timer);
    }, [rpcClient]);

    // Listen for chat notification events (streaming from the backend)
    useEffect(() => {
        rpcClient.onChatNotify((event: ChatNotify) => {
            handleChatEvent(event);
        });
    }, [rpcClient]);

    // Auto-scroll to bottom
    useEffect(() => {
        messageEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, currentContent]);

    const handleChatEvent = useCallback((event: ChatNotify) => {
        switch (event.type) {
            case "start":
                setIsStreaming(true);
                setCurrentContent("");
                break;

            case "content_block":
                setCurrentContent((prev) => prev + event.content);
                break;

            case "content_replace":
                setCurrentContent(event.content);
                break;

            case "tool_call":
                setMessages((prev) => {
                    const last = prev[prev.length - 1];
                    if (last?.role === "assistant") {
                        return [
                            ...prev.slice(0, -1),
                            {
                                ...last,
                                toolCalls: [
                                    ...(last.toolCalls || []),
                                    { name: event.toolName, input: event.toolInput, id: event.toolCallId },
                                ],
                            },
                        ];
                    }
                    return prev;
                });
                break;

            case "tool_result":
                setMessages((prev) => {
                    const last = prev[prev.length - 1];
                    if (last?.role === "assistant") {
                        return [
                            ...prev.slice(0, -1),
                            {
                                ...last,
                                toolResults: [
                                    ...(last.toolResults || []),
                                    { name: event.toolName, output: event.toolOutput, id: event.toolCallId },
                                ],
                            },
                        ];
                    }
                    return prev;
                });
                break;

            case "stop":
                setIsStreaming(false);
                setCurrentContent((prev) => {
                    if (prev.trim()) {
                        setMessages((msgs) => [
                            ...msgs,
                            { id: `msg-${Date.now()}`, role: "assistant", content: prev },
                        ]);
                    }
                    return "";
                });
                // Refresh session state after pipeline completes
                refreshSession();
                break;

            case "error":
                setIsStreaming(false);
                setMessages((prev) => [
                    ...prev,
                    { id: `err-${Date.now()}`, role: "system", content: `Error: ${event.content}` },
                ]);
                setCurrentContent("");
                break;

            case "abort":
                setIsStreaming(false);
                setCurrentContent("");
                break;

            default:
                // Ignore other event types for now
                break;
        }
    }, []);

    const refreshSession = useCallback(async () => {
        try {
            const client = rpcClient.getMigrateIntegrationRpcClient() as any;
            const state = await client.getActiveMigrationSession();
            setSession(state);
        } catch {
            // ignore
        }
    }, [rpcClient]);

    const handleStartEnhancement = useCallback(
        async () => {
            try {
                // Reset for a fresh run
                setMessages([]);
                setCurrentContent("");
                setBannerDismissed(false);
                readySignalSent.current = false;

                const client = rpcClient.getMigrateIntegrationRpcClient() as any;
                await client.startMigrationEnhancement();
                setSession({ isActive: true, aiFeatureUsed: true, fullyEnhanced: false });
                // Panel is already open — directly trigger the agent
                readySignalSent.current = true;
                client.migrationPanelReady().catch((e: unknown) =>
                    console.error("[MigrationPanel] migrationPanelReady after start failed:", e)
                );
            } catch (err) {
                console.error("[MigrationPanel] Failed to start enhancement:", err);
            }
        },
        [rpcClient]
    );

    const handleMarkComplete = useCallback(async () => {
        try {
            const client = rpcClient.getMigrateIntegrationRpcClient() as any;
            await client.markEnhancementComplete();
            setSession((prev) => ({ ...prev, fullyEnhanced: true }));
        } catch {
            // ignore
        }
    }, [rpcClient]);

    const showBanner = session.isActive && !session.fullyEnhanced && !bannerDismissed && messages.length > 0;

    // Derive simple messages array for banner stage derivation
    const bannerMessages = messages.map((m) => ({
        role: m.role,
        content: m.content + (m.toolCalls?.map((t) => ` <toolcall tool="${t.name}"/>`).join("") || "")
            + (m.toolResults?.map((t) => ` <toolresult tool="${t.name}"/>`).join("") || ""),
    }));

    return (
        <PanelContainer>
            {/* Header */}
            <PanelHeader>
                <HeaderTitle>
                    <span className="codicon codicon-rocket" style={{ fontSize: "14px" }} />
                    Migration Assistant
                </HeaderTitle>
                <HeaderActions>
                    <ModelSelector
                        value={selectedModel}
                        onChange={(e) => {
                            const modelId = e.target.value;
                            setSelectedModel(modelId);
                            // Notify backend of model change
                            try {
                                const client = rpcClient.getMigrateIntegrationRpcClient() as any;
                                client.setMigrationModel({ modelId }).catch(console.debug);
                            } catch { /* non-critical */ }
                        }}
                        title="Select LLM model"
                    >
                        <option value="copilot">VS Code Copilot</option>
                        <option value="wso2">WSO2 Integrator Copilot</option>
                        <option value="anthropic">Anthropic (API Key)</option>
                    </ModelSelector>
                </HeaderActions>
            </PanelHeader>

            {/* Stage progress banner */}
            {showBanner && (
                <MigrationEnhancementBanner
                    aiFeatureUsed={session.aiFeatureUsed}
                    isActive={session.isActive || isStreaming}
                    fullyEnhanced={session.fullyEnhanced}
                    messages={bannerMessages}
                    onDismiss={() => setBannerDismissed(true)}
                    onStartEnhancement={handleStartEnhancement}
                />
            )}

            {/* Message area */}
            <MessageArea>
                {messages.length === 0 && !isStreaming && !currentContent ? (
                    <EmptyState>
                        <span className="codicon codicon-rocket" style={{ fontSize: "36px", opacity: 0.4 }} />
                        <EmptyStateTitle>Migration AI Enhancement</EmptyStateTitle>
                        <EmptyStateDesc>
                            Automatically fix compilation errors, resolve TODO comments, and ensure all tests pass in your migrated Ballerina project.
                        </EmptyStateDesc>
                        <ModeCardRow>
                            <ModeCard onClick={handleStartEnhancement} disabled={isStreaming}>
                                <ModeCardTitle>
                                    <span className="codicon codicon-run-all" style={{ fontSize: "13px" }} />
                                    Auto-Fix
                                </ModeCardTitle>
                                <ModeCardDesc>
                                    Automatically fix build errors, resolve TODOs, and run tests
                                </ModeCardDesc>
                            </ModeCard>
                        </ModeCardRow>
                        {sessionLoaded && session.fullyEnhanced && (
                            <EmptyStateDesc style={{ opacity: 0.5, marginTop: 8 }}>
                                Previous enhancement complete &mdash; start a new run above.
                            </EmptyStateDesc>
                        )}
                    </EmptyState>
                ) : (
                    <>
                        {messages.map((msg) => (
                            <MessageBubble key={msg.id} role={msg.role}>
                                {msg.role === "system" ? (
                                    <div style={{ color: "var(--vscode-errorForeground)" }}>
                                        {msg.content}
                                    </div>
                                ) : (
                                    <>
                                        <MarkdownRenderer markdownContent={msg.content} />
                                        {msg.toolCalls?.map((tc, i) => (
                                            <ToolCallBadge key={`tc-${i}`}>
                                                <span className="codicon codicon-tools" style={{ fontSize: "11px" }} />
                                                {tc.name}
                                            </ToolCallBadge>
                                        ))}
                                    </>
                                )}
                            </MessageBubble>
                        ))}

                        {/* Streaming content */}
                        {currentContent && (
                            <MessageBubble role="assistant">
                                <MarkdownRenderer markdownContent={currentContent} />
                            </MessageBubble>
                        )}
                    </>
                )}
                <div ref={messageEndRef} />
            </MessageArea>

            {/* Status bar */}
            <StatusBar>
                {isStreaming ? (
                    <>
                        <span
                            className="codicon codicon-loading spin"
                            style={{ fontSize: "12px" }}
                        />
                        <span>Processing...</span>
                        <ActionButton
                            variant="danger"
                            style={{ marginLeft: "auto" }}
                            onClick={async () => {
                                try {
                                    const client = rpcClient.getMigrateIntegrationRpcClient() as any;
                                    await client.abortMigrationAgent();
                                    console.log("[MigrationPanel] Abort requested");
                                } catch (e) {
                                    console.error("[MigrationPanel] abort failed:", e);
                                }
                            }}
                        >
                            <span className="codicon codicon-debug-stop" style={{ fontSize: "11px" }} />
                            Stop
                        </ActionButton>
                    </>
                ) : (
                    <>
                        <span style={{ opacity: 0.6 }}>
                            Model: {selectedModel === "copilot" ? "VS Code Copilot" : selectedModel === "wso2" ? "WSO2 Integrator Copilot" : "Anthropic"}
                        </span>
                        {messages.length > 0 && (
                            <ActionButton
                                variant="secondary"
                                style={{ marginLeft: "auto" }}
                                onClick={() => {
                                    setMessages([]);
                                    setCurrentContent("");
                                    setBannerDismissed(false);
                                    readySignalSent.current = false;
                                }}
                            >
                                <span className="codicon codicon-refresh" style={{ fontSize: "11px" }} />
                                New Run
                            </ActionButton>
                        )}
                        {!session.fullyEnhanced && messages.length > 0 && (
                            <ActionButton
                                variant="primary"
                                style={{ marginLeft: "auto" }}
                                onClick={handleMarkComplete}
                            >
                                <span className="codicon codicon-check" style={{ fontSize: "11px" }} />
                                Mark Complete
                            </ActionButton>
                        )}
                    </>
                )}
            </StatusBar>
        </PanelContainer>
    );
}
