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

import React, { cloneElement, isValidElement, ReactNode, ReactElement, useEffect } from "react";
import { createPortal } from "react-dom";
import styled from "@emotion/styled";
import { Icon, Divider, ThemeColors, Typography, Tooltip, Button } from "@wso2/ui-toolkit";
import { useVisualizerContext } from "../../Context";

export const MODAL_BACKDROP =
    "color-mix(in srgb, var(--vscode-editor-inactiveSelectionBackground) 40%, transparent)";

export type DynamicModalProps = {
    children: ReactNode;
    onClose?: () => void;
    title: string;
    anchorRef: React.RefObject<HTMLDivElement>;
    width?: number;
    height?: number;
    openState: boolean;
    setOpenState: (state: boolean) => void;
    sx?: any;
    closeOnBackdropClick?: boolean;
    closeButtonIcon?: "close" | "minimize";
};

const ModalContainer = styled.div<{ sx?: any }>`
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 2100;
    display: flex;
    justify-content: center;
    align-items: center;
    ${(props: { sx?: any }) => props.sx};
`;


const ModalBox = styled.div<{ width?: number; height?: number }>`
  width: ${({ width }: { width: number }) => (width ? `${width}px` : 'auto')};
  height: ${({ height }: { height: number }) => (height ? `${height}px` : 'auto')};
  max-width: 90vw;
  max-height: 90vh;
  position: relative;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 16px;
  border-radius: 3px;
  background-color: ${ThemeColors.SURFACE_DIM};
  box-shadow: 0 3px 8px rgb(0 0 0 / 0.2);
  z-index: 2100;
`;

const InvisibleButton = styled.button`
    background: none;
    border: none;
    padding: 0;
    margin: 0;
    text-align: inherit;
    color: inherit;
    font: inherit;
    cursor: pointer;
    outline: none;
    box-shadow: none;
    appearance: none;
    display: inline-flex;
    align-items: center;
`;


const ModalHeaderSection = styled.header`
    display: flex;
    align-items: center;
    justify-content: space-between;
`;

export const CloseButton = styled(Button)`
    border-radius: 5px;
`;

type TriggerProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode };
const Trigger: React.FC<TriggerProps> = (props) => <InvisibleButton {...props}>{props.children}</InvisibleButton>;

const DynamicModal: React.FC<DynamicModalProps> & { Trigger: typeof Trigger } = ({
    children,
    onClose,
    title,
    anchorRef,
    width,
    height,
    openState,
    setOpenState,
    sx,
    closeOnBackdropClick = false,
    closeButtonIcon = "close",
}) => {
    const { setShowOverlay } = useVisualizerContext();
    let trigger: ReactElement | null = null;
    const content: ReactNode[] = [];

    React.Children.forEach(children, child => {
        if (isValidElement(child) && child.type === DynamicModal.Trigger) {
            trigger = cloneElement(child as React.ReactElement, {
                onClick: () => setOpenState(true)
            });
        } else {
            content.push(child);
        }
    });

    const handleClose = () => {
        setOpenState(false);
        setShowOverlay(false);
        onClose && onClose();
    };

    const handleBackdropClick = (e: React.MouseEvent) => {
        // Only close if closeOnBackdropClick is true and the click was on the backdrop itself
        if (closeOnBackdropClick && e.target === e.currentTarget) {
            handleClose();
        }
    };

    useEffect(() => {
        setShowOverlay(openState === true);
    });

    useEffect(() => {
        return () => {
            setShowOverlay(false);
        };
    }, []);

    const targetEl = document.getElementById("visualizer-container");

    // Map closeButtonIcon prop to actual icon names and tooltip text
    const iconName = closeButtonIcon === "minimize" ? "bi-minimize-modal" : "bi-close";
    const tooltipText = closeButtonIcon === "minimize" 
        ? "Minimize to return to the form" 
        : "Close";

    return (
        <>
            {trigger}
            {openState && targetEl && createPortal(
                <ModalContainer 
                    ref={anchorRef} 
                    className="unq-modal-overlay" 
                    sx={sx}
                    onClick={handleBackdropClick}
                >
                    <ModalBox width={width} height={height}>
                        <ModalHeaderSection>
                            <Typography variant="h2" sx={{ margin: 0 }}>
                                {title}
                            </Typography>
                            <Tooltip content={tooltipText} position="bottom">
                                <CloseButton appearance="icon" onClick={handleClose}>
                                    <Icon name={iconName} sx={{fontSize: "16px", width: "16px"}}/>
                                </CloseButton>
                            </Tooltip>
                        </ModalHeaderSection>
                        <Divider />
                        {content}
                    </ModalBox>
                </ModalContainer>,
                targetEl
            )}
        </>
    );
};

DynamicModal.Trigger = Trigger;

export default DynamicModal;
