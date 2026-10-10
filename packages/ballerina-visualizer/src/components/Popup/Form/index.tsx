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

import React, { useLayoutEffect, useRef } from "react";
import { keyframes } from "@emotion/react";
import styled from "@emotion/styled";
import { Button, Codicon, ScrollableContainer, Typography } from "@wso2/ui-toolkit";
import { ThemeColors } from "@wso2/ui-toolkit/lib/styles/Theme";

const PopupFormContainer = styled.div`
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 2100;
    background-color: color-mix(in srgb, ${ThemeColors.SECONDARY_CONTAINER} 70%, transparent);
    display: flex;
    justify-content: center;
    align-items: center;
`;

const PopupFormBox = styled.div<{ width?: number; height?: number }>`
  width: ${({width}:{width:number}) => (width ? `${width}px` : 'auto')};
  height: ${({height}:{height:number}) => (height ? `${height}px` : 'auto')};
  max-width: 90vw;
  max-height: 90vh;
  transition: width 180ms ease, height 180ms ease;
  position: relative;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 10px;
  background-color: ${ThemeColors.SURFACE_DIM};
  box-shadow: 0 3px 8px rgb(0 0 0 / 0.2);
  z-index: 2100;
`;

const PopupFormHeader = styled.header`
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 16px 20px;
    border-bottom: 1px solid ${ThemeColors.OUTLINE_VARIANT};
`;

const PopupFormHeading = styled.div`
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
`;

const Trail = styled.nav`
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    font-size: 12px;
`;

const TrailSeparator = styled.i`
    font-size: 13px;
    opacity: 0.5;
`;

const TrailCrumb = styled.span`
    cursor: pointer;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;

    &:hover {
        color: ${ThemeColors.ON_SURFACE};
        text-decoration: underline;
    }
`;

export type PopupFormBreadcrumb = {
    id: string;
    label: string;
    onSelect?: () => void;
};

export type PopupFormProps = {
    width?: number;
    height?: number;
    title: string;
    children: React.ReactNode;
    onClose?: () => void;
    onBack?: () => void;
    breadcrumbs?: PopupFormBreadcrumb[];
    transitionKey?: string;
    transitionDirection?: "forward" | "back";
};

const slideFrom = (offset: string) => keyframes`
    from { opacity: 0; transform: translateX(${offset}); }
    to { opacity: 1; transform: translateX(0); }
`;

const enterForward = slideFrom("12px");
const enterBack = slideFrom("-12px");

const PopupFormContent = styled.div`
    flex: 1;
    min-height: 0; /* Critical for nested flex scroll areas */
    display: flex;
    flex-direction: column;
    padding: 16px;

    &.enter-forward {
        animation: ${enterForward} 200ms cubic-bezier(0.2, 0, 0, 1);
    }

    &.enter-back {
        animation: ${enterBack} 200ms cubic-bezier(0.2, 0, 0, 1);
    }

    @media (prefers-reduced-motion: reduce) {
        &.enter-forward,
        &.enter-back {
            animation: none;
        }
    }
`;


export const PopupForm = (props: PopupFormProps) => {
    const { width, height, title, children, onClose, onBack, breadcrumbs, transitionKey, transitionDirection } = props;
    // The last crumb is the current level, which the title already names.
    const trail = breadcrumbs?.slice(0, -1) ?? [];
    const contentRef = useRef<HTMLDivElement>(null);
    const isFirstLevel = useRef(true);

    useLayoutEffect(() => {
        if (isFirstLevel.current) {
            isFirstLevel.current = false;
            return;
        }
        const content = contentRef.current;
        if (!content) {
            return;
        }
        content.classList.remove("enter-forward", "enter-back");
        void content.offsetWidth; // restart the animation
        content.classList.add(transitionDirection === "back" ? "enter-back" : "enter-forward");
        // Direction is read from the render that changed the level, so it is not a dependency.
    }, [transitionKey]);

    return (
        <PopupFormContainer>
            <PopupFormBox width={width} height={height}>
                <PopupFormHeader>
                    {onBack && (
                        <Button appearance="icon" onClick={onBack} tooltip="Back" data-testid="popup-back-btn">
                            <Codicon name="arrow-left" />
                        </Button>
                    )}
                    <PopupFormHeading>
                        {trail.length > 0 && (
                            <Trail aria-label="Breadcrumb">
                                {trail.map((crumb, index) => (
                                    <React.Fragment key={crumb.id}>
                                        {index > 0 && (
                                            <TrailSeparator className="codicon codicon-chevron-right" aria-hidden />
                                        )}
                                        <TrailCrumb title={crumb.label} onClick={crumb.onSelect}>
                                            {crumb.label}
                                        </TrailCrumb>
                                    </React.Fragment>
                                ))}
                            </Trail>
                        )}
                        <Typography
                            variant="h2"
                            sx={{ margin: 0, fontSize: "20px", fontWeight: 600, color: ThemeColors.ON_SURFACE }}
                        >
                            {title}
                        </Typography>
                    </PopupFormHeading>
                    <Codicon name="close" onClick={onClose} />
                </PopupFormHeader>
                <PopupFormContent ref={contentRef}>
                    <ScrollableContainer>{children}</ScrollableContainer>
                </PopupFormContent>
            </PopupFormBox>
        </PopupFormContainer>
    )
}
