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

import React, { ReactNode } from "react";
import { Tooltip } from "@wso2/ui-toolkit";
import ReactMarkdown from "react-markdown";

export const MARKDOWN_DISALLOWED_ELEMENTS = ["script", "iframe", "object", "embed", "link", "style"];

export interface MarkdownWithTooltipProps {
    text: string;
    // The clamped/faded container shown inline on the node.
    Styled: React.ComponentType<{ children?: ReactNode }>;
    // The scrollable container shown in the hover tooltip.
    TooltipStyled: React.ComponentType<{ children?: ReactNode; onWheel?: React.WheelEventHandler<HTMLDivElement> }>;
    containerSx?: any;
}

// Renders markdown text clamped/faded to its Styled container, plus a hover tooltip with the
// unclamped text — the box's fixed height means long role/instructions text is always truncated,
// so this is the only way to read it in full without opening the node's configuration form.
// Shared by AgentCallNodeWidget, AgentNodeWidget and DurableAgentRunNodeWidget so the disallowed
// element list and the clamp/tooltip structure can't drift between them.
export function MarkdownWithTooltip(props: MarkdownWithTooltipProps) {
    const { text, Styled, TooltipStyled, containerSx } = props;
    return (
        <Tooltip
            content={
                // Stop wheel events from bubbling out of the scrollable tooltip so scrolling
                // its overflowing text doesn't also pan/zoom the diagram canvas underneath.
                <TooltipStyled onWheel={(e) => e.stopPropagation()}>
                    <ReactMarkdown disallowedElements={MARKDOWN_DISALLOWED_ELEMENTS} unwrapDisallowed={true}>
                        {text}
                    </ReactMarkdown>
                </TooltipStyled>
            }
            containerSx={containerSx}
        >
            <Styled>
                <ReactMarkdown disallowedElements={MARKDOWN_DISALLOWED_ELEMENTS} unwrapDisallowed={true}>
                    {text}
                </ReactMarkdown>
            </Styled>
        </Tooltip>
    );
}
