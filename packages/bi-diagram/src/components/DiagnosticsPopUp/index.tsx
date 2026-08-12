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

import React, { useMemo, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import styled from "@emotion/styled";
import { Button, Icon, Tooltip } from "@wso2/ui-toolkit";
import { DiagnosticMessage, FlowNode, LineRange, NodeProperties, Property } from "@wso2/ballerina-core";
import { DiagramEngine } from "@projectstorm/react-diagrams-core";
import { LINK_COLOR, NODE_BG_COLOR, NODE_ERROR_COLOR, NODE_TEXT_COLOR, NODE_WIDTH } from "../../resources/constants";
import { useDiagramContext } from "../DiagramContext";

const IconBtn = styled.div<{ color: string }>`
    width: 20px;
    height: 20px;
    font-size: 20px;
    color: ${(props: { color: string }) => props.color};
    display: inline-flex;
    align-items: center;
    justify-content: center;
`;

const PopupContainer = styled.div`
    max-width: ${NODE_WIDTH}px;
    font-family: "GilmerMedium";
    font-size: 12px;
    background-color: ${NODE_BG_COLOR};
    color: ${NODE_TEXT_COLOR};
    padding: 8px;
    ul {
        margin: 0;
        padding: 0;
        list-style: none;
    }

    li {
        margin-bottom: 4px;
        white-space: pre-wrap;
        word-break: break-word;
    }
`;

const DiagnosticListItem = styled.li`
    display: flex;
    align-items: flex-start;
    gap: 6px;
`;

const DiagnosticIcon = styled.span<{ color: string }>`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: ${(props: { color: string }) => props.color};
    flex-shrink: 0;
    margin-top: 1px;
`;

const DiagnosticMessageText = styled.span`
    flex: 1;
`;

const Footer = styled.div`
    display: flex;
    justify-content: flex-end;
    margin-top: 8px;
    overflow: visible;
`;

const ActionButton = styled(Button)`
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
`;

export interface DiagnosticsPopUpProps {
    node: FlowNode;
    engine?: DiagramEngine;
}

export function DiagnosticsPopUp(props: DiagnosticsPopUpProps) {
    const { node, engine } = props;
    const { onAddNodePrompt, isUserAuthenticated, readOnly } = useDiagramContext();

    const [popupPos, setPopupPos] = useState<{ top: number; left: number } | null>(null);
    const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
    const isDiagnosticsOpen = popupPos !== null;

    const getPopupPos = (el: HTMLElement): { top: number; left: number } => {
        const rect = el.getBoundingClientRect();
        return { top: rect.bottom, left: rect.left };
    };

    // Re-anchor whenever the canvas is panned or zoomed
    useEffect(() => {
        if (!isDiagnosticsOpen || !anchorEl || !engine) return;
        const handle = engine.getModel().registerListener({
            offsetUpdated: () => setPopupPos(getPopupPos(anchorEl)),
            zoomUpdated: () => setPopupPos(getPopupPos(anchorEl)),
        });
        return () => handle.deregister();
    }, [isDiagnosticsOpen, anchorEl, engine]);

    // Close on click-outside
    useEffect(() => {
        if (!isDiagnosticsOpen) return;
        const handleClickOutside = () => setPopupPos(null);
        const timer = setTimeout(() => document.addEventListener("mousedown", handleClickOutside), 0);
        return () => {
            clearTimeout(timer);
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [isDiagnosticsOpen]);

    const handleOnDiagnosticsClick = (event: React.MouseEvent<HTMLElement>) => {
        event.preventDefault();
        event.stopPropagation();
        const el = event.currentTarget as HTMLElement;
        setAnchorEl(el);
        setPopupPos(getPopupPos(el));
    };

    const handleOnDiagnosticsClose = () => {
        setPopupPos(null);
    };

    const getPropertyDiagnostics = (properties: NodeProperties, diagnostics: DiagnosticMessageWithRange[]) => {
        for (const key in properties) {
            if (Object.prototype.hasOwnProperty.call(properties, key)) {
                const property = properties[key] as Property;
                if (property.diagnostics && property.diagnostics.hasDiagnostics) {
                    diagnostics.push(
                        ...(property.diagnostics.diagnostics || []).map((diagnostic) => ({
                            diagnostic,
                            range: property.codedata?.lineRange,
                        }))
                    );
                }
            }
        }
    };

    const diagnosticsWithRanges = useMemo(() => {
        const diagnostics: DiagnosticMessageWithRange[] = [];

        diagnostics.push(
            ...((node.diagnostics?.diagnostics || []).map((diagnostic) => ({
                diagnostic,
                range: node.codedata?.lineRange,
            })))
        );

        if (node.properties) {
            getPropertyDiagnostics(node.properties, diagnostics);
        }
        if (node.branches?.length > 0) {
            node.branches.forEach((branch) => {
                getPropertyDiagnostics(branch.properties, diagnostics);
            });
        }

        return diagnostics;
    }, [node]);

    const diagnosticMessages = useMemo(() => {
        const uniqueDiagnostics = new Map<string, DiagnosticMessage>();

        diagnosticsWithRanges.forEach(({ diagnostic }) => {
            const key = `${diagnostic.severity}:${diagnostic.message}`;
            if (!uniqueDiagnostics.has(key)) {
                uniqueDiagnostics.set(key, diagnostic);
            }
        });

        return Array.from(uniqueDiagnostics.values());
    }, [diagnosticsWithRanges]);

    const getDiagnosticIconName = (severity: DiagnosticMessage["severity"]) => {
        switch (severity) {
            case "WARNING":
                return "warning-outline-rounded";
            case "INFO":
                return "info-outline-rounded";
            case "ERROR":
            default:
                return "error-outline-rounded";
        }
    };

    const getDiagnosticColor = (severity: DiagnosticMessage["severity"]) => {
        switch (severity) {
            case "WARNING":
                return "var(--vscode-inputValidation-warningForeground)";
            case "INFO":
                return LINK_COLOR;
            case "ERROR":
            default:
                return NODE_ERROR_COLOR;
        }
    };

    const triggerSeverity: DiagnosticMessage["severity"] = diagnosticMessages.some((diagnostic) => diagnostic.severity === "ERROR")
        ? "ERROR"
        : diagnosticMessages.some((diagnostic) => diagnostic.severity === "WARNING")
            ? "WARNING"
            : "INFO";

    const targetRange: LineRange | undefined = node.codedata?.lineRange || diagnosticsWithRanges.find((entry) => entry.range)?.range;
    const canFix =
        !readOnly &&
        !!onAddNodePrompt &&
        !!isUserAuthenticated &&
        !!targetRange &&
        diagnosticMessages.length > 0;

    const handleOnFix = () => {
        if (!canFix || !onAddNodePrompt || !targetRange) {
            return;
        }

        const fixPrompt = [
            "Fix the following diagnostics at this code location:",
            ...diagnosticMessages.map((diagnostic, index) => `${index + 1}. [${diagnostic.severity}] ${diagnostic.message}`),
            "",
            "Apply the minimum required code changes to resolve these diagnostics.",
        ].join("\n");

        onAddNodePrompt(
            node,
            {
                fileName: targetRange.fileName,
                startLine: targetRange.startLine,
                endLine: targetRange.endLine,
            },
            fixPrompt,
            {
                planMode: false,
                autoSubmit: true,
            }
        );
        handleOnDiagnosticsClose();
    };

    const disabledFixTooltip = !isUserAuthenticated
        ? "You need to be logged into WSO2 Integrator Copilot to fix diagnostics"
        : !targetRange
            ? "No source location available for diagnostics"
            : diagnosticMessages.length === 0
                ? "No diagnostics found to fix"
                : undefined;

    return (
        <>
            <IconBtn color={getDiagnosticColor(triggerSeverity)} onClick={handleOnDiagnosticsClick}>
                <Icon name={getDiagnosticIconName(triggerSeverity)} sx={{ width: 20, height: 20 }} />
            </IconBtn>
            {isDiagnosticsOpen && popupPos && createPortal(
                <div
                    style={{
                        position: "fixed",
                        top: popupPos.top,
                        left: popupPos.left,
                        zIndex: 1300,
                        backgroundColor: NODE_BG_COLOR,
                        boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                >
                    <PopupContainer>
                        <ul>
                            {diagnosticMessages?.map((diagnostic, index) => (
                                <DiagnosticListItem key={`${diagnostic.severity}-${diagnostic.message}-${index}`}>
                                    <DiagnosticIcon color={getDiagnosticColor(diagnostic.severity)}>
                                        <Icon name={getDiagnosticIconName(diagnostic.severity)} />
                                    </DiagnosticIcon>
                                    <DiagnosticMessageText>{diagnostic.message}</DiagnosticMessageText>
                                </DiagnosticListItem>
                            ))}
                        </ul>
                        <Footer>
                            <Tooltip content={disabledFixTooltip}>
                                <ActionButton onClick={handleOnFix} disabled={!canFix} appearance='primary'>
                                    <Icon name="bi-ai-agent" sx={{ width: 16, height: 16, fontSize: 16, marginRight: 8 }} />
                                    Fix with AI
                                </ActionButton>
                            </Tooltip>
                        </Footer>
                    </PopupContainer>
                </div>,
                document.body
            )}
        </>
    );
}

type DiagnosticMessageWithRange = {
    diagnostic: DiagnosticMessage;
    range?: LineRange;
};
