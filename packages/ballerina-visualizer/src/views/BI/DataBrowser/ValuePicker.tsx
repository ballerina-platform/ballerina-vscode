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

import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styled from "@emotion/styled";
import { keyframes } from "@emotion/react";
import { ThemeColors } from "@wso2/ui-toolkit";
import { FIELD_RADIUS, InsertTarget, InsertTargetContext, InsertTargetContextType, useExclusivePopover } from "@wso2/ballerina-side-panel";
import { DataBrowser, DataBrowserProps } from "./DataBrowser";
import { Placement, placeBeside, placePicker } from "./placement";

// The picker re-renders as it follows its field; the list inside does not need to.
const Browser = memo(DataBrowser);

export interface ValuePickerProps extends Omit<DataBrowserProps, "onHide" | "onAskCopilot"> {
    anchor: HTMLElement;
    context: InsertTargetContextType;
    target: InsertTarget;
    onClose: () => void;
}

/** The Data Browser, opened beside the form at the field it fills (or under it); inserting a value closes it. */
const EXIT_MS = 100;

export function ValuePicker({ anchor, context, target, onClose, ...browserProps }: ValuePickerProps) {
    const placement = usePlacement(anchor);
    const panelRef = useRef<HTMLDivElement>(null);
    const boxRef = useRef<HTMLDivElement>(null);
    const [closing, setClosing] = useState(false);
    // The picker fades out before it unmounts; a reopen while it fades starts a new one.
    const dismiss = useCallback(() => setClosing(true), []);
    useCloseOnOutside(panelRef, anchor, dismiss);
    useCloseWhenHidden(anchor, dismiss);
    useExclusivePopover(!closing, dismiss);
    // Unmounts once the exit has played; animationend is not dependable in a background webview.
    useEffect(() => {
        if (!closing) {
            return;
        }
        const timer = setTimeout(onClose, EXIT_MS);
        return () => clearTimeout(timer);
    }, [closing, onClose]);

    const close = useCallback(() => {
        dismiss();
        anchor.querySelector<HTMLElement>(".cm-content")?.focus();
    }, [anchor, dismiss]);
    // Rows insert through the context's target; this one also closes the picker once the value is in.
    const pickerContext = useMemo<InsertTargetContextType>(() => ({
        ...context,
        target: {
            ...target,
            insert: (value) => {
                target.insert(value);
                dismiss();
            },
        },
    }), [context, target]);

    // The picker fades out where Copilot fades in, so the field's request carries straight over.
    const askCopilot = useMemo(() => target.askCopilot && ((draft: string) => {
        dismiss();
        target.askCopilot(draft);
    }), [target, dismiss]);

    useEffect(() => {
        panelRef.current?.querySelector<HTMLElement>("vscode-text-field, input")?.focus();
    }, []);

    // The browser's search clears itself on Escape and marks the event handled; an unhandled Escape closes the picker.
    const onKeyDown = (event: React.KeyboardEvent) => {
        if (event.key === "Escape" && !event.defaultPrevented) {
            event.preventDefault();
            event.stopPropagation();
            close();
        }
    };
    const { notch, lead, ...frame } = placement;
    useGlide(boxRef, placement);

    return createPortal(
        <InsertTargetContext.Provider value={pickerContext}>
            <Frame
                ref={panelRef}
                role="dialog"
                aria-label={`Values for ${target.label}`}
                style={{ ...frame, pointerEvents: notch ? "none" : undefined }}
                beside={!!notch}
                closing={closing}
                onKeyDown={onKeyDown}
            >
                {notch && <div style={{ flex: `0 1000 ${lead}px`, minHeight: 0 }} />}
                <Panel ref={boxRef} style={notch ? { flex: "0 1 auto", pointerEvents: "auto" } : undefined}>
                    <Browser {...browserProps} onHide={close} onAskCopilot={askCopilot} />
                </Panel>
                {notch && <Notch style={notch} aria-hidden="true" />}
            </Frame>
        </InsertTargetContext.Provider>,
        anchor.ownerDocument.body
    );
}

// Follows the field while the form scrolls or the window resizes. The form is the side panel holding the field, else the field in the whole window.
function usePlacement(anchor: HTMLElement): Placement {
    const measure = () => {
        const view = anchor.ownerDocument.defaultView;
        const viewport = { width: view?.innerWidth ?? 0, height: view?.innerHeight ?? 0 };
        const field = anchor.getBoundingClientRect();
        const form = anchor.closest("[data-testid=side-panel]")?.getBoundingClientRect() ?? { left: field.left, top: 0, bottom: viewport.height };
        return placeBeside(field, form, viewport) ?? placePicker(field, viewport);
    };
    const [placement, setPlacement] = useState(measure);
    useLayoutEffect(() => {
        // Scrolling the picker's own list fires here too but leaves the placement as it was.
        const update = () => setPlacement((current) => {
            const next = measure();
            return JSON.stringify(next) === JSON.stringify(current) ? current : next;
        });
        const view = anchor.ownerDocument.defaultView;
        view?.addEventListener("resize", update);
        view?.addEventListener("scroll", update, true);
        return () => {
            view?.removeEventListener("resize", update);
            view?.removeEventListener("scroll", update, true);
        };
    }, [anchor]);
    return placement;
}

// A list that grows or shrinks moves the panel's edge; it glides there instead of jumping. A new placement is followed at once.
function useGlide(box: React.RefObject<HTMLElement>, placement: Placement) {
    const top = useRef<number>();
    useLayoutEffect(() => {
        box.current?.getAnimations().forEach((glide) => glide.cancel());
        top.current = box.current?.getBoundingClientRect().top;
    }, [placement]);
    useLayoutEffect(() => {
        const element = box.current;
        if (!element) {
            return;
        }
        const observer = new ResizeObserver(() => {
            // Starts from where the panel is seen, so a glide cut short by another change carries on from there.
            const seen = element.getBoundingClientRect().top;
            element.getAnimations().forEach((glide) => glide.cancel());
            const now = element.getBoundingClientRect().top;
            const offset = (top.current ?? now) + seen - now - now;
            top.current = now;
            if (Math.abs(offset) >= 1 && !prefersReducedMotion()) {
                element.animate([{ transform: `translateY(${offset}px)` }, { transform: "none" }], { duration: GLIDE_MS, easing: EASE_MOVE });
            }
        });
        observer.observe(element);
        return () => observer.disconnect();
    }, []);
}

const prefersReducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

// A press outside the picker, its field and the browser's hover cards closes it; the field keeps it open for typing.
function useCloseOnOutside(panelRef: React.RefObject<HTMLElement>, anchor: HTMLElement, onClose: () => void) {
    useEffect(() => {
        const onDown = (event: MouseEvent) => {
            const node = event.target as Element;
            if (!panelRef.current?.contains(node) && !anchor.contains(node) && !node.closest?.("[role=tooltip]")) {
                onClose();
            }
        };
        anchor.ownerDocument.addEventListener("mousedown", onDown, true);
        return () => anchor.ownerDocument.removeEventListener("mousedown", onDown, true);
    }, [anchor, onClose]);
}

// A field scrolled out of its form's view closes the picker, so it never floats over the form's header.
function useCloseWhenHidden(anchor: HTMLElement, onClose: () => void) {
    useEffect(() => {
        const observer = new IntersectionObserver(([entry]) => !entry.isIntersecting && onClose());
        observer.observe(anchor);
        return () => observer.disconnect();
    }, [anchor, onClose]);
}

const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";
// On-screen movement, matching the form's row glide.
const EASE_MOVE = "cubic-bezier(0.77, 0, 0.175, 1)";
const GLIDE_MS = 160;

// Beside the form it comes out of the form's edge; under the field it drops from the field.
const enterBeside = keyframes`
    from { opacity: 0; transform: translateX(6px); }
`;
const enterBelow = keyframes`
    from { opacity: 0; transform: translateY(-4px); }
`;
const exit = keyframes`
    to { opacity: 0; }
`;
const fadeIn = keyframes`
    from { opacity: 0; }
`;

const Frame = styled.div<{ beside: boolean; closing: boolean }>`
    position: fixed;
    z-index: 2100;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    animation: ${({ beside, closing }: { beside: boolean; closing: boolean }) =>
        closing ? exit : beside ? enterBeside : enterBelow} ${({ closing }: { closing: boolean }) => (closing ? `${EXIT_MS}ms` : "150ms")} ${EASE_OUT} both;
    @media (prefers-reduced-motion: reduce) {
        animation-name: ${({ closing }: { closing: boolean }) => (closing ? exit : fadeIn)};
    }
`;

// The browser fills the panel and scrolls inside it; under a field the panel grows only as tall as its content.
const Panel = styled.div`
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid var(--vscode-editorWidget-border, var(--vscode-panel-border));
    border-radius: ${FIELD_RADIUS};
    background-color: ${ThemeColors.SURFACE_DIM};
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.32), 0 2px 6px rgba(0, 0, 0, 0.2);
    & > * {
        flex: 1 1 auto;
        min-height: 0;
    }
`;

// A square turned to point at the field; it shares the panel's fill and right border, so it reads as part of the panel.
const Notch = styled.span`
    position: absolute;
    right: -5px;
    width: 9px;
    height: 9px;
    margin-top: -5px;
    margin-bottom: -5px;
    transform: rotate(45deg);
    background-color: ${ThemeColors.SURFACE_DIM};
    border-top: 1px solid var(--vscode-editorWidget-border, var(--vscode-panel-border));
    border-right: 1px solid var(--vscode-editorWidget-border, var(--vscode-panel-border));
    pointer-events: none;
`;
