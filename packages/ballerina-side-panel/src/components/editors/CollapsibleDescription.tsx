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

import React, { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import styled from "@emotion/styled";

const COLLAPSED_LINES = 2;
// The description has no background to mask with, so an inline toggle has to reserve its width on
// every line. Only worth it when enough text width survives — the side panel's column is ~256px.
const TOGGLE_GUTTER = 96;
const TOGGLE_CLEARANCE = "28px";
const MIN_TEXT_WIDTH = 280;

const Container = styled.div<{ reserveGutter: boolean }>`
    position: relative;
    width: 100%;
    padding-inline-end: ${({ reserveGutter }: { reserveGutter: boolean }) => (reserveGutter ? `${TOGGLE_GUTTER}px` : "0")};
`;

const Clamp = styled.div<{ collapsed: boolean }>`
    ${({ collapsed }: { collapsed: boolean }) =>
        collapsed
            ? `
        display: -webkit-box;
        -webkit-line-clamp: ${COLLAPSED_LINES};
        -webkit-box-orient: vertical;
        overflow: hidden;
    `
            : ""}
`;

const Toggle = styled.button<{ inline: boolean; lineBox: number }>`
    ${({ inline, lineBox }: { inline: boolean; lineBox: number }) =>
        inline
            ? `
        position: absolute;
        inset-inline-end: ${TOGGLE_CLEARANCE};
        bottom: 0;
        height: ${lineBox}px;
        line-height: ${lineBox}px;
    `
            : `
        display: block;
        margin-top: 2px;
    `}
    padding: 0;
    border: 0;
    background: transparent;
    font-family: var(--vscode-font-family);
    /* Matches the description so the toggle's line box lines up with the text it continues. */
    font-size: 13px;
    white-space: nowrap;
    color: var(--vscode-textLink-foreground);
    cursor: pointer;

    &:hover {
        color: var(--vscode-textLink-activeForeground);
        text-decoration: underline;
    }
`;

type CollapsibleDescriptionProps = {
    children: ReactNode;
    id?: string;
};

/** Field descriptions run to several lines of prose; show two and let the reader ask for the rest. */
export const CollapsibleDescription = (props: CollapsibleDescriptionProps) => {
    const { children, id } = props;
    const containerRef = useRef<HTMLDivElement>(null);
    const clampRef = useRef<HTMLDivElement>(null);
    const [collapsed, setCollapsed] = useState(true);
    const [overflows, setOverflows] = useState(false);
    const [fitsInline, setFitsInline] = useState(false);
    const [lineBox, setLineBox] = useState(0);

    const measure = useCallback(() => {
        const clamp = clampRef.current;
        const column = containerRef.current;
        if (!clamp || !column) {
            return;
        }
        // clientWidth includes the gutter, so the answer does not flip as the gutter comes and goes.
        setFitsInline(column.clientWidth - TOGGLE_GUTTER >= MIN_TEXT_WIDTH);
        if (collapsed && clamp.clientHeight > 0) {
            // Bottom-aligning boxes only lines up baselines when they are the same height.
            setLineBox(clamp.clientHeight / COLLAPSED_LINES);
        }
        // Only meaningful while clamped, so keep the last answer once expanded.
        setOverflows((previous) => (collapsed ? clamp.scrollHeight > clamp.clientHeight + 1 : previous));
    }, [collapsed]);

    useEffect(() => {
        measure();
        const observer = new ResizeObserver(measure);
        if (containerRef.current) {
            observer.observe(containerRef.current);
        }
        return () => observer.disconnect();
    }, [measure, children]);

    // The gutter only keeps the clamped last line clear of the toggle; expanded text needs neither.
    const inline = collapsed && overflows && fitsInline;

    return (
        <Container id={id} ref={containerRef} reserveGutter={inline}>
            <Clamp ref={clampRef} collapsed={collapsed}>
                {children}
            </Clamp>
            {overflows && (
                <Toggle
                    type="button"
                    inline={inline}
                    lineBox={lineBox}
                    aria-expanded={!collapsed}
                    onClick={() => setCollapsed((value) => !value)}
                >
                    {collapsed ? "Show more" : "Show less"}
                </Toggle>
            )}
        </Container>
    );
};
