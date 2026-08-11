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

import React, { useEffect, useState } from "react";
import styled from "@emotion/styled";
import MarkdownRenderer from "../MarkdownRenderer";
import { describeThinkingDuration } from "../AIChat/utils/streamSerialization";
import { ExpandIcon, ItemLabel, ItemRow, ItemsArea, ItemsInner, ToolIcon, breathe } from "./styles";
import { StreamItem } from "./types";

type ThinkingItem = Extract<StreamItem, { kind: "thinking" }>;

interface ThinkingSegmentProps {
    item: ThinkingItem;
    /** True only for the entry currently streaming — a persisted, never-closed
     *  block (e.g. extension-host restart mid-reasoning) must render static. */
    streamActive: boolean;
}

// A real <button> so the collapsed block is focusable and keyboard-operable;
// the resets strip the UA button chrome back to ItemRow's plain-row look.
const ThinkingHeader = styled(ItemRow.withComponent("button"))`
    cursor: pointer;
    user-select: none;
    background: none;
    border: none;
    font: inherit;
    color: inherit;
    text-align: left;
    width: 100%;
`;

const ThinkingLabel = styled(ItemLabel)`
    ${(props: { loading: boolean }) => props.loading ? `animation: ${breathe} 1.4s ease-in-out infinite;` : ""}
`;

const ThinkingBody = styled.div`
    margin: 2px 0 4px 17px;
    padding-left: 8px;
    border-left: 1.5px solid var(--vscode-panel-border);
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
    p:first-child { margin-top: 0; }
    p:last-child { margin-bottom: 0; }
`;

const ThinkingSegment: React.FC<ThinkingSegmentProps> = ({ item, streamActive }) => {
    const loading = !item.done && streamActive;
    // Open while the block is live so the user sees reasoning stream in; collapse
    // once it completes. Manual toggles win until the done transition fires.
    const [expanded, setExpanded] = useState(loading);
    const [elapsedSeconds, setElapsedSeconds] = useState(0);

    useEffect(() => {
        if (item.done) {
            setExpanded(false);
        }
    }, [item.done]);

    useEffect(() => {
        if (!loading || item.startedAt === undefined) {
            return;
        }
        const startedAt = item.startedAt;
        const tick = () => setElapsedSeconds(Math.max(0, Math.round((Date.now() - startedAt) / 1000)));
        tick();
        const timer = setInterval(tick, 1000);
        return () => clearInterval(timer);
    }, [loading, item.startedAt]);

    const label = loading
        ? `Thinking${elapsedSeconds > 0 ? ` (${elapsedSeconds}s)` : ""}…`
        : describeThinkingDuration(item);
    // Trim once — this component re-renders on every thinking_delta while streaming.
    const trimmedText = item.text.trim();
    const hasBody = trimmedText.length > 0;

    return (
        <div>
            <ThinkingHeader
                type="button"
                aria-expanded={hasBody ? expanded : undefined}
                onClick={() => hasBody && setExpanded((prev) => !prev)}
            >
                <ToolIcon loading={loading}>
                    <span className="codicon codicon-sparkle" />
                </ToolIcon>
                <ThinkingLabel loading={loading}>{label}</ThinkingLabel>
                {hasBody && <ExpandIcon expanded={expanded} className="codicon codicon-ellipsis" />}
            </ThinkingHeader>
            {hasBody && (
                <ItemsArea expanded={expanded}>
                    <ItemsInner>
                        <ThinkingBody>
                            <MarkdownRenderer markdownContent={trimmedText} />
                        </ThinkingBody>
                    </ItemsInner>
                </ItemsArea>
            )}
        </div>
    );
};

export default ThinkingSegment;
