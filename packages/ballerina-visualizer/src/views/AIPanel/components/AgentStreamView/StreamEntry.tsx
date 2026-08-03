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

import React from "react";
import MarkdownRenderer from "../MarkdownRenderer";
import TodoSection from "../TodoSection";
import AskCard from "./AskCard";
import SkillEnableCard from "./SkillEnableCard";
import ConfigCard from "./ConfigCard";
import ConnectorCard from "./ConnectorCard";
import CommandOutputCard from "./CommandOutputCard";
import TryItCard from "./TryItCard";
import {
    DoneCircle,
    DotWrapper,
    EntryBlock,
    EntryContent,
    EntryHeader,
    EntryRail,
    ExpandIcon,
    ItemDetail,
    ItemLabel,
    ItemMarkdownWrapper,
    ItemRow,
    ItemsArea,
    ItemsInner,
    NodeLabel,
    SonarCenter,
    SonarRing,
    SonarWrapper,
    ToolIcon,
} from "./styles";
import { StreamEntry, StreamItem } from "./types";

import {
    COMMAND_OUTPUT_TOOLS,
    getToolCallDisplay,
    getToolIcon,
    getToolResultDisplay,
    getToolResultIcon,
} from "./toolDisplay";

// ── Item renderer — order-preserving, used by both floating and named entries ─

function renderItem(item: StreamItem, idx: number, streamActive: boolean, rpcClient?: any): React.ReactNode {
    switch (item.kind) {
        case "text": {
            const trimmed = item.text.trim();
            if (!trimmed) return null;
            return (
                <ItemMarkdownWrapper key={idx}>
                    <MarkdownRenderer markdownContent={trimmed} />
                </ItemMarkdownWrapper>
            );
        }
        case "tool_call": {
            if (item.toolName === "hurlRunnerTool") {
                return <TryItCard key={idx} input={item.toolInput} rpcClient={rpcClient} />;
            }
            if (COMMAND_OUTPUT_TOOLS.has(item.toolName ?? "")) {
                return <CommandOutputCard key={idx} toolName={item.toolName} toolInput={item.toolInput} />;
            }
            const { label, detail } = getToolCallDisplay(item.toolName, item.toolInput);
            return (
                <ItemRow key={idx}>
                    <ToolIcon loading={streamActive}>
                        <span className={`codicon ${getToolIcon(item.toolName, "loading")}`} />
                    </ToolIcon>
                    <ItemLabel loading={streamActive}>
                        {label}{detail && <ItemDetail title={detail}>{detail}</ItemDetail>}
                    </ItemLabel>
                </ItemRow>
            );
        }
        case "tool_result": {
            if (item.toolName === "Clarify" && !item.toolOutput?.skipped) return null;
            if (item.toolName === "hurlRunnerTool") {
                return <TryItCard key={idx} output={item.toolOutput} rpcClient={rpcClient} />;
            }
            if (COMMAND_OUTPUT_TOOLS.has(item.toolName ?? "")) {
                return <CommandOutputCard key={idx} toolName={item.toolName} toolOutput={item.toolOutput} isResult={true} />;
            }
            const hint = item.toolOutput?.query ?? item.toolOutput?.url;
            const { label, detail } = getToolResultDisplay(item.toolName, item.toolOutput, hint);
            return (
                <ItemRow key={idx}>
                    <ToolIcon loading={false} failed={item.failed}>
                        <span className={`codicon ${getToolResultIcon(item.toolName, item.toolOutput)}`} />
                    </ToolIcon>
                    <ItemLabel loading={false} failed={item.failed}>
                        {label}{detail && <ItemDetail title={detail}>{detail}</ItemDetail>}
                    </ItemLabel>
                </ItemRow>
            );
        }
        case "plan":
            return (
                <TodoSection
                    key={idx}
                    tasks={item.tasks}
                    message={item.message}
                    initialExpanded={!item.approvalStatus}
                    approvalStatus={item.approvalStatus}
                    approvalComment={item.approvalComment}
                />
            );
        case "ask":
            return <AskCard key={idx} data={item.data} rpcClient={rpcClient} />;
        case "skill_enable":
            return <SkillEnableCard key={idx} data={item.data} />;
        case "config":
            return <ConfigCard key={idx} data={item.data} rpcClient={rpcClient} />;
        case "connector":
            return <ConnectorCard key={idx} data={item.data} rpcClient={rpcClient} />;
        case "component":
            if (item.componentType === "progress") {
                const isDone = item.data.status === "end";
                const isSpinning = !isDone && streamActive;
                return (
                    <ItemRow key={idx}>
                        <SonarWrapper>
                            {isSpinning ? (
                                <>
                                    <SonarRing />
                                    <SonarCenter />
                                </>
                            ) : (
                                <DoneCircle />
                            )}
                        </SonarWrapper>
                        <ItemLabel loading={isSpinning}>{item.data.text}</ItemLabel>
                    </ItemRow>
                );
            }
            return null;
        default:
            return null;
    }
}

// ── NodeStatus helper ─────────────────────────────────────────────────────────

function getNodeStatus(entry: StreamEntry, isLast: boolean, isLoading: boolean): "active" | "done" {
    if (entry.status === "completed") return "done";
    const hasActiveItem = entry.items.some(i => i.kind === "tool_call");
    if (hasActiveItem || (isLast && isLoading)) return "active";
    return "done";
}

// ── StreamEntryComponent ──────────────────────────────────────────────────────

interface StreamEntryComponentProps {
    entry: StreamEntry;
    isLast: boolean;
    isLoading: boolean;
    expanded: boolean;
    onToggle: () => void;
    innerRef?: (el: HTMLDivElement | null) => void;
    rpcClient?: any;
    hasNextNamedEntry?: boolean;
}

const StreamEntryComponent: React.FC<StreamEntryComponentProps> = ({
    entry,
    isLast,
    isLoading,
    expanded,
    onToggle,
    innerRef,
    rpcClient,
    hasNextNamedEntry = false,
}) => {
    const hasItems = entry.items.length > 0;

    // Floating entry — no rail, no dot, items render directly in arrival order
    if (!entry.description) {
        if (!hasItems) return null;
        return (
            <EntryBlock style={{ flexDirection: "column" }}>
                {entry.items.map((item, idx) => renderItem(item, idx, isLast && isLoading, rpcClient))}
            </EntryBlock>
        );
    }

    // Named task entry — rail + dot + collapsible items area
    const nodeStatus = getNodeStatus(entry, isLast, isLoading);

    return (
        <EntryBlock style={{ marginLeft: "-7px" }}>
            <EntryRail showLine={expanded || hasNextNamedEntry}>
                <DotWrapper>
                    {nodeStatus === "active" ? (
                        <SonarWrapper>
                            <SonarRing />
                            <SonarCenter />
                        </SonarWrapper>
                    ) : (
                        <DoneCircle />
                    )}
                </DotWrapper>
            </EntryRail>

            <EntryContent>
                <EntryHeader onClick={() => hasItems && onToggle()}>
                    <NodeLabel nodeStatus={nodeStatus}>{entry.description}</NodeLabel>
                    {hasItems && <ExpandIcon expanded={expanded} className="codicon codicon-ellipsis" />}
                </EntryHeader>
                {hasItems && (
                    <ItemsArea expanded={expanded}>
                        <ItemsInner ref={innerRef}>
                            {entry.items.map((item, idx) => renderItem(item, idx, isLast && isLoading, rpcClient))}
                        </ItemsInner>
                    </ItemsArea>
                )}
            </EntryContent>
        </EntryBlock>
    );
};

export { StreamEntryComponent, getNodeStatus };
export default StreamEntryComponent;
