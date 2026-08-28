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

import React, { ReactNode, useEffect, useRef, useState } from "react";
import styled from "@emotion/styled";
import { keyframes } from "@emotion/react";
import { ThemeColors } from "@wso2/ui-toolkit";

import { PopupContainer, PopupOverlay } from "../../views/BI/Connection/styles";

const ENTER_MS = 180;
const EXIT_MS = 130;
const STEP_MS = 150;

const fadeIn = keyframes`
    from { opacity: 0; }
    to { opacity: 1; }
`;

const popIn = keyframes`
    from { opacity: 0; transform: translate(-50%, -48%) scale(0.97); }
    to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
`;

const Backdrop = styled(PopupOverlay)`
    background-color: color-mix(in srgb, ${ThemeColors.SECONDARY_CONTAINER} 70%, transparent);
    animation: ${fadeIn} ${ENTER_MS}ms ease-out both;
    &.closing {
        animation-duration: ${EXIT_MS}ms;
        animation-direction: reverse;
    }
    @media (prefers-reduced-motion: reduce) {
        animation: none;
    }
`;

type BoxProps = { $expanded?: boolean; $autoHeight?: boolean; $maxWidth?: number };

const Box = styled(PopupContainer) <BoxProps>`
    width: ${(props: BoxProps) => props.$expanded ? "90%" : "80%"};
    max-width: ${(props: BoxProps) => props.$maxWidth ? `${props.$maxWidth}px` : props.$expanded ? "1000px" : "800px"};
    transition: max-height 180ms ease, max-width 180ms ease;
    height: ${(props: BoxProps) => props.$autoHeight ? "auto" : props.$expanded ? "90vh" : "80vh"};
    max-height: ${(props: BoxProps) => props.$autoHeight ? "80vh" : props.$expanded ? "none" : "800px"};
    min-height: ${(props: BoxProps) => props.$autoHeight ? "0" : "480px"};
    animation: ${popIn} ${ENTER_MS}ms cubic-bezier(0.16, 1, 0.3, 1) both;
    &.closing {
        animation-duration: ${EXIT_MS}ms;
        animation-direction: reverse;
        animation-timing-function: ease-in;
    }
    @media (prefers-reduced-motion: reduce) {
        animation: none;
    }
`;

export type PopupModalStepDirection = "forward" | "backward";

export const PopupModalStep = styled.div<{ $direction?: PopupModalStepDirection; $animate?: boolean }>`
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
    animation: ${(props: { $direction?: PopupModalStepDirection; $animate?: boolean }) =>
        props.$animate === false
            ? "none"
            : `${props.$direction === "backward" ? "popup-step-backward" : "popup-step-forward"} `
              + `${STEP_MS}ms ease-out both`};

    @keyframes popup-step-forward {
        from { opacity: 0; transform: translateX(8px); }
        to { opacity: 1; transform: translateX(0); }
    }

    @keyframes popup-step-backward {
        from { opacity: 0; transform: translateX(-8px); }
        to { opacity: 1; transform: translateX(0); }
    }

    @media (prefers-reduced-motion: reduce) {
        animation: none;
    }
`;

export interface PopupModalProps {
    onClose: () => void;
    dismissOnBackdropClick?: boolean;
    dismissOnEscape?: boolean;
    expanded?: boolean;
    autoHeight?: boolean;
    maxWidth?: number;
    zIndexBase?: number;
    ariaLabelledBy?: string;
    children: (close: () => void) => ReactNode;
}

export function PopupModal(props: PopupModalProps) {
    const { onClose, dismissOnBackdropClick, dismissOnEscape, expanded, autoHeight, maxWidth, zIndexBase, ariaLabelledBy, children } = props;
    const [closing, setClosing] = useState(false);
    const exitTimer = useRef<ReturnType<typeof setTimeout>>(null);

    useEffect(() => () => clearTimeout(exitTimer.current), []);

    const close = () => {
        if (closing) {
            return;
        }
        setClosing(true);
        exitTimer.current = setTimeout(onClose, EXIT_MS);
    };

    useEffect(() => {
        if (!dismissOnEscape) {
            return;
        }
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape" && !event.defaultPrevented) {
                close();
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [dismissOnEscape, closing]);

    const closingClass = closing ? "closing" : undefined;

    return (
        <>
            <Backdrop
                className={closingClass}
                onClose={dismissOnBackdropClick ? close : undefined}
                sx={zIndexBase ? { zIndex: zIndexBase } : undefined}
            />
            <Box
                role="dialog"
                aria-modal="true"
                aria-labelledby={ariaLabelledBy}
                $expanded={expanded}
                $autoHeight={autoHeight}
                $maxWidth={maxWidth}
                className={closingClass}
                style={zIndexBase ? { zIndex: zIndexBase + 1 } : undefined}
            >
                {children(close)}
            </Box>
        </>
    );
}

export default PopupModal;
