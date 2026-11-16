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

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import styled from "@emotion/styled";
import MarkdownRenderer from "../MarkdownRenderer";
import { describeThinkingDuration } from "../AIChat/utils/streamSerialization";
import { ExpandIcon, ItemLabel, ItemRow, ItemsArea, ItemsInner, ToolIcon, breathe } from "./styles";
import { ThinkingItem } from "./types";

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

// A flex-end column clips overflow at the top, keeping the newest lines in view.
const ThinkingText = styled.div<{ clipped: boolean; faded: boolean }>`
    ${(props: { clipped: boolean; faded: boolean }) => props.clipped ? `
        display: flex;
        flex-direction: column;
        justify-content: flex-end;
        max-height: 4lh;
        overflow: hidden;
        & > * {
            flex-shrink: 0;
            ${props.faded ? "mask-image: linear-gradient(to top, black calc(4lh - 1.2em), transparent 4lh);" : ""}
        }
    ` : ""}
`;

const ThinkingSegment: React.FC<ThinkingSegmentProps> = ({ item, streamActive }) => {
    const loading = !item.done && streamActive;
    const [expanded, setExpanded] = useState(false);
    // Once opened by hand, a finished block collapses from full height, not from the 4-line box.
    const [opened, setOpened] = useState(false);
    const [fits, setFits] = useState(false);
    const textRef = useRef<HTMLDivElement>(null);
    const [elapsedSeconds, setElapsedSeconds] = useState(0);

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
    const clipped = !expanded && (loading || !opened);
    // A finished thought that fits in the box stays in view, with nothing to open.
    const short = hasBody && !loading && fits && !opened;
    const toggleable = hasBody && !short;

    useLayoutEffect(() => {
        const box = textRef.current;
        // Only the clipped box shows whether the text fits in 4 lines.
        if (box && clipped) {
            setFits((box.firstElementChild as HTMLElement).offsetHeight <= box.clientHeight);
        }
    });

    const body = (
        <ItemsInner>
            <ThinkingBody>
                <ThinkingText ref={textRef} clipped={clipped} faded={!fits}>
                    <MarkdownRenderer markdownContent={trimmedText} />
                </ThinkingText>
            </ThinkingBody>
        </ItemsInner>
    );

    return (
        <div>
            <ThinkingHeader
                type="button"
                aria-expanded={toggleable ? expanded : undefined}
                onClick={() => {
                    if (toggleable) {
                        setExpanded(!expanded);
                        setOpened(!expanded || !loading);
                    }
                }}
            >
                <ToolIcon loading={loading}>
                    <span className="codicon codicon-sparkle" />
                </ToolIcon>
                <ThinkingLabel loading={loading}>{label}</ThinkingLabel>
                {toggleable && <ExpandIcon expanded={expanded} className="codicon codicon-ellipsis" />}
            </ThinkingHeader>
            {short ? body : hasBody && (
                <ItemsArea expanded={expanded || loading} {...(!expanded && !loading && { inert: "" })}>
                    {body}
                </ItemsArea>
            )}
        </div>
    );
};

export default ThinkingSegment;
