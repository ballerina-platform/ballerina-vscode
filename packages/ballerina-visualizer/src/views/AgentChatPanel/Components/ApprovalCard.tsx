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

import React, { useState } from "react";
import styled from "@emotion/styled";
import { Icon, Button } from "@wso2/ui-toolkit";
import { ApprovalRequest, HumanResponse } from "@wso2/ballerina-core";

interface ApprovalCardProps {
    requests: ApprovalRequest[];
    decisions?: Record<string, HumanResponse>;
    // Set once the user has dismissed this batch; renders as terminal even if some requests
    // still lack a decision.
    unresolvable?: boolean;
    onSubmit: (decisions: Record<string, HumanResponse>) => Promise<void>;
    // Lets the user give up on a batch that keeps failing instead of being stuck with a
    // disabled chat input. Optional since a fully/terminally rendered card has no use for it.
    onDismiss?: () => void;
}

const Card = styled.div`
    width: 100%;
    max-width: 520px;
    background: var(--vscode-input-background);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 4px;
    overflow: hidden;
`;

const HeaderSpacer = styled.div`
    flex: 1;
`;

const CardHeader = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--vscode-panel-border);
    font-size: 12px;
    font-weight: 600;
    color: var(--vscode-foreground);
`;

const WarnIconWrapper = styled.span`
    display: inline-flex;
    align-items: center;
    color: var(--vscode-editorWarning-foreground);
`;

const RequestRow = styled.div`
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;

    &:not(:last-of-type) {
        border-bottom: 1px solid var(--vscode-panel-border);
    }
`;

const RequestHeaderRow = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
`;

const BatchIndex = styled.span`
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    flex-shrink: 0;
`;

const ToolIconWrapper = styled.span`
    display: inline-flex;
    align-items: center;
    color: var(--vscode-terminal-ansiBrightMagenta);
`;

const ToolName = styled.span`
    font-size: 12px;
    font-weight: 600;
    color: var(--vscode-foreground);
`;

const ToolDescription = styled.div`
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
`;

const ArgumentsContainer = styled.div`
    background: var(--vscode-editor-background);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 4px;
    padding: 6px 8px;
`;

const ArgumentsTable = styled.div`
    display: grid;
    grid-template-columns: max-content 1fr;
    column-gap: 12px;
    row-gap: 4px;
    align-items: baseline;
`;

const ArgumentLabel = styled.span`
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    white-space: nowrap;
`;

const ArgumentValue = styled.span`
    font-size: 11px;
    color: var(--vscode-foreground);
    word-break: break-word;
`;

const EmptyValue = styled.span`
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    font-style: italic;
`;

const NoArguments = styled.div`
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    font-style: italic;
`;

const NestedBlock = styled.div`
    padding-left: 8px;
    border-left: 2px solid var(--vscode-panel-border);
`;

const NestedList = styled.div`
    display: flex;
    flex-direction: column;
    gap: 6px;
`;

const NestedItemLabel = styled.div`
    font-size: 10px;
    color: var(--vscode-descriptionForeground);
    margin-bottom: 2px;
`;

const RowActions = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 2px;
`;

const SmallButton = styled.button<{ variant: "approve" | "reject" }>`
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    padding: 3px 10px;
    border-radius: 4px;
    cursor: pointer;
    border: 1px solid ${({ variant }: { variant: "approve" | "reject" }) =>
        variant === "approve" ? "var(--vscode-terminal-ansiGreen)" : "var(--vscode-errorForeground)"};
    color: ${({ variant }: { variant: "approve" | "reject" }) =>
        variant === "approve" ? "var(--vscode-terminal-ansiGreen)" : "var(--vscode-errorForeground)"};
    background: transparent;

    &:hover:not(:disabled) {
        background-color: var(--vscode-list-hoverBackground);
    }

    &:disabled {
        opacity: 0.5;
        cursor: default;
    }
`;

const ReasonBox = styled.div`
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 4px;
`;

const ReasonInput = styled.textarea`
    width: 100%;
    min-height: 44px;
    resize: vertical;
    font-family: inherit;
    font-size: 12px;
    padding: 6px 8px;
    background: var(--vscode-editor-background);
    color: var(--vscode-editor-foreground);
    border: 1px solid var(--vscode-editorWidget-border);
    border-radius: 4px;
    box-sizing: border-box;

    &:focus {
        outline: none;
        border-color: var(--vscode-button-background);
    }
`;

const ReasonActions = styled.div`
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 12px;
`;

const TextLinkButton = styled.button`
    background: none;
    border: none;
    color: var(--vscode-textLink-foreground);
    font-size: 12px;
    cursor: pointer;
    padding: 0;

    &:hover:not(:disabled) {
        text-decoration: underline;
    }

    &:disabled {
        opacity: 0.5;
        cursor: default;
    }
`;

const DecidedBadge = styled.span<{ decision: "APPROVE" | "REJECT" }>`
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    font-weight: 600;
    color: ${({ decision }: { decision: "APPROVE" | "REJECT" }) =>
        decision === "APPROVE" ? "var(--vscode-terminal-ansiGreen)" : "var(--vscode-errorForeground)"};
`;

const BatchActions = styled.div`
    display: flex;
    justify-content: center;
    gap: 10px;
    padding: 10px 12px;
    border-top: 1px solid var(--vscode-panel-border);
`;

const CollapsedSummary = styled.div`
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 14px;
    padding: 8px 12px;
    font-size: 12px;
`;

const SummaryItem = styled.span<{ decision: "APPROVE" | "REJECT" }>`
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: ${({ decision }: { decision: "APPROVE" | "REJECT" }) =>
        decision === "APPROVE" ? "var(--vscode-terminal-ansiGreen)" : "var(--vscode-errorForeground)"};
`;

function isPlainObject(value: unknown): value is Record<string, any> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

// Renders a tool call's arguments as label/value rows instead of raw JSON, so a
// non-technical reviewer can tell what they're approving. Nested objects/arrays recurse into
// indented sub-tables rather than falling back to a JSON dump.
function renderArguments(args: Record<string, any>): React.ReactNode {
    const entries = Object.entries(args);
    if (entries.length === 0) {
        return <NoArguments>No arguments</NoArguments>;
    }
    return (
        <ArgumentsTable>
            {entries.map(([key, value]) => (
                <React.Fragment key={key}>
                    <ArgumentLabel>{key}</ArgumentLabel>
                    <ArgumentValue>{renderArgumentValue(value)}</ArgumentValue>
                </React.Fragment>
            ))}
        </ArgumentsTable>
    );
}

function renderArgumentValue(value: unknown): React.ReactNode {
    if (value === undefined || value === null) {
        return <EmptyValue>—</EmptyValue>;
    }
    if (typeof value === "boolean") {
        return value ? "Yes" : "No";
    }
    if (Array.isArray(value)) {
        if (value.length === 0) {
            return <EmptyValue>—</EmptyValue>;
        }
        if (value.every(item => !isPlainObject(item) && !Array.isArray(item))) {
            return value.map(item => String(item)).join(", ");
        }
        return (
            <NestedList>
                {value.map((item, idx) => (
                    <div key={idx}>
                        <NestedItemLabel>Item {idx + 1}</NestedItemLabel>
                        <NestedBlock>
                            {isPlainObject(item) ? renderArguments(item) : String(item)}
                        </NestedBlock>
                    </div>
                ))}
            </NestedList>
        );
    }
    if (isPlainObject(value)) {
        return <NestedBlock>{renderArguments(value)}</NestedBlock>;
    }
    return String(value);
}

export const ApprovalCard: React.FC<ApprovalCardProps> = ({ requests, decisions, unresolvable, onSubmit, onDismiss }) => {
    const [expandedArgs, setExpandedArgs] = useState<Record<string, boolean>>({});
    const [rejectingId, setRejectingId] = useState<string | null>(null);
    const [reasonText, setReasonText] = useState("");
    const [submitting, setSubmitting] = useState(false);
    // Surfaces a Dismiss option once a submission has failed at least once - most batches
    // resolve fine on a retry (e.g. a partial decision followed by a fuller one), so this
    // only appears once the card has actually given the user a reason to give up on it.
    const [hasFailed, setHasFailed] = useState(false);

    const pendingRequests = requests.filter(r => !decisions?.[r.id]);
    const isFullyResolved = requests.length > 0 && pendingRequests.length === 0;

    const toggleArgs = (id: string) => setExpandedArgs(prev => ({ ...prev, [id]: !prev[id] }));

    const submit = async (partial: Record<string, HumanResponse>) => {
        setSubmitting(true);
        try {
            await onSubmit(partial);
            setRejectingId(null);
            setReasonText("");
        } catch {
            // Failure is already surfaced as a chat message by the caller; keep the card
            // interactive (and any open reason box open) so the user can retry.
            setHasFailed(true);
        } finally {
            setSubmitting(false);
        }
    };

    const handleApprove = (id: string) => submit({ [id]: { decision: "APPROVE" } });

    const handleStartReject = (id: string) => {
        setRejectingId(id);
        setReasonText("");
    };

    const handleConfirmReject = (id: string) => {
        const reason = reasonText.trim();
        submit({ [id]: { decision: "REJECT", ...(reason ? { reason } : {}) } });
    };

    const handleApproveAll = () => {
        const decisionsMap: Record<string, HumanResponse> = {};
        pendingRequests.forEach(r => { decisionsMap[r.id] = { decision: "APPROVE" }; });
        submit(decisionsMap);
    };

    const handleRejectAll = () => {
        const decisionsMap: Record<string, HumanResponse> = {};
        pendingRequests.forEach(r => { decisionsMap[r.id] = { decision: "REJECT" }; });
        submit(decisionsMap);
    };

    if (unresolvable) {
        return (
            <Card>
                <CollapsedSummary>
                    {requests.map(req => {
                        const decided = decisions?.[req.id];
                        if (decided) {
                            return (
                                <SummaryItem key={req.id} decision={decided.decision}>
                                    <Icon
                                        name={decided.decision === "APPROVE" ? "bi-check" : "bi-close"}
                                        sx={{ width: 14, height: 14 }}
                                        iconSx={{ fontSize: "14px" }}
                                    />
                                    {req.toolName} {decided.decision === "APPROVE" ? "approved" : "rejected"}
                                    {decided.reason ? ` — "${decided.reason}"` : ""}
                                </SummaryItem>
                            );
                        }
                        return (
                            <SummaryItem key={req.id} decision="REJECT">
                                <Icon name="bi-warning" sx={{ width: 14, height: 14 }} iconSx={{ fontSize: "14px" }} />
                                {req.toolName} could not be resumed
                            </SummaryItem>
                        );
                    })}
                </CollapsedSummary>
            </Card>
        );
    }

    if (isFullyResolved) {
        return (
            <Card>
                <CollapsedSummary>
                    {requests.map(req => {
                        const decided = decisions![req.id];
                        return (
                            <SummaryItem key={req.id} decision={decided.decision}>
                                <Icon
                                    name={decided.decision === "APPROVE" ? "bi-check" : "bi-close"}
                                    sx={{ width: 14, height: 14 }}
                                    iconSx={{ fontSize: "14px" }}
                                />
                                {req.toolName} {decided.decision === "APPROVE" ? "approved" : "rejected"}
                                {decided.reason ? ` — "${decided.reason}"` : ""}
                            </SummaryItem>
                        );
                    })}
                </CollapsedSummary>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <WarnIconWrapper>
                    <Icon name="user-fill" sx={{ width: 14, height: 14 }} iconSx={{ fontSize: "14px" }} />
                </WarnIconWrapper>
                Approval required &middot; {pendingRequests.length} pending
                <HeaderSpacer />
                {hasFailed && onDismiss && (
                    <TextLinkButton onClick={onDismiss} disabled={submitting}>
                        Dismiss
                    </TextLinkButton>
                )}
            </CardHeader>
            {requests.map((req, idx) => {
                const decided = decisions?.[req.id];
                return (
                    <RequestRow key={req.id}>
                        <RequestHeaderRow>
                            <BatchIndex>{idx + 1}/{requests.length}</BatchIndex>
                            <ToolIconWrapper>
                                <Icon name="bi-wrench" sx={{ width: 14, height: 14 }} iconSx={{ fontSize: "14px" }} />
                            </ToolIconWrapper>
                            <ToolName>{req.toolName}</ToolName>
                        </RequestHeaderRow>
                        <ToolDescription>{req.toolDescription}</ToolDescription>
                        <TextLinkButton onClick={() => toggleArgs(req.id)}>
                            {expandedArgs[req.id] ? "Hide arguments" : "Show arguments"}
                        </TextLinkButton>
                        {expandedArgs[req.id] && (
                            <ArgumentsContainer>{renderArguments(req.arguments)}</ArgumentsContainer>
                        )}
                        {decided ? (
                            <DecidedBadge decision={decided.decision}>
                                <Icon
                                    name={decided.decision === "APPROVE" ? "bi-check" : "bi-close"}
                                    sx={{ width: 14, height: 14 }}
                                    iconSx={{ fontSize: "14px" }}
                                />
                                {decided.decision === "APPROVE" ? "Approved" : "Rejected"}
                                {decided.reason ? ` — "${decided.reason}"` : ""}
                            </DecidedBadge>
                        ) : rejectingId === req.id ? (
                            <ReasonBox>
                                <ReasonInput
                                    autoFocus
                                    placeholder="Reason (optional), shown to the agent"
                                    value={reasonText}
                                    onChange={(e) => setReasonText(e.target.value)}
                                    disabled={submitting}
                                />
                                <ReasonActions>
                                    <TextLinkButton onClick={() => setRejectingId(null)} disabled={submitting}>
                                        Cancel
                                    </TextLinkButton>
                                    <SmallButton variant="reject" onClick={() => handleConfirmReject(req.id)} disabled={submitting}>
                                        Confirm Reject
                                    </SmallButton>
                                </ReasonActions>
                            </ReasonBox>
                        ) : (
                            <RowActions>
                                <SmallButton variant="approve" onClick={() => handleApprove(req.id)} disabled={submitting}>
                                    <Icon name="bi-check" sx={{ width: 12, height: 12 }} iconSx={{ fontSize: "12px" }} />
                                    Approve
                                </SmallButton>
                                <SmallButton variant="reject" onClick={() => handleStartReject(req.id)} disabled={submitting}>
                                    <Icon name="bi-close" sx={{ width: 12, height: 12 }} iconSx={{ fontSize: "12px" }} />
                                    Reject
                                </SmallButton>
                            </RowActions>
                        )}
                    </RequestRow>
                );
            })}
            {pendingRequests.length > 1 && (
                <BatchActions>
                    <Button appearance="primary" onClick={handleApproveAll} disabled={submitting}>
                        Approve All
                    </Button>
                    <Button appearance="secondary" onClick={handleRejectAll} disabled={submitting}>
                        Reject All
                    </Button>
                </BatchActions>
            )}
        </Card>
    );
};

export default ApprovalCard;
