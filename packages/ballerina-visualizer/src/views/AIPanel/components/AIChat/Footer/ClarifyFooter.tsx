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

import React, { useState } from "react";
import styled from "@emotion/styled";
import { ClarifyQuestion } from "@wso2/ballerina-core";
import { FooterContainer } from "./index";
import { ActionButton } from "../../AgentStreamView/styles";
import { FooterBox, FooterDivider, FooterTextInputRow, FooterInput } from "./styles";
import { AmbientFrame } from "../../../../../components/AgentStatusOrb/shared";

// ── Clarify-specific styled components ────────────────────────────────────────

const TabRow = styled.div`
    display: flex;
    gap: 0;
    border-bottom: 1px solid var(--vscode-panel-border);
    margin-bottom: 4px;
`;

const Tab = styled.button<{ active: boolean }>`
    background: transparent;
    border: none;
    border-bottom: 2px solid ${({ active }: { active: boolean }) => active ? "var(--vscode-focusBorder)" : "transparent"};
    color: ${({ active }: { active: boolean }) => active ? "var(--vscode-editor-foreground)" : "var(--vscode-descriptionForeground)"};
    font-weight: ${({ active }: { active: boolean }) => active ? 600 : 400};
    font-family: var(--vscode-font-family);
    font-size: 12px;
    padding: 6px 12px;
    cursor: pointer;
    margin-bottom: -1px;
    white-space: nowrap;

    &:hover:not([data-active="true"]) {
        color: var(--vscode-editor-foreground);
    }
`;

const QuestionHeader = styled.div`
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 8px;
`;

const QuestionText = styled.span`
    font-size: 13px;
    font-weight: 500;
    line-height: 1.4;
    color: var(--vscode-editor-foreground);
    font-family: var(--vscode-font-family);
`;

const TypeBadge = styled.span`
    font-size: 10px;
    color: var(--vscode-descriptionForeground);
    font-family: var(--vscode-font-family);
    opacity: 0.5;
    white-space: nowrap;
`;

const OptionsList = styled.div`
    display: flex;
    flex-direction: column;
    gap: 4px;
`;

const OptionButton = styled.button<{ selected: boolean }>`
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0;
    width: 100%;
    background: ${({ selected }: { selected: boolean }) =>
        selected ? "var(--vscode-list-inactiveSelectionBackground, var(--vscode-list-hoverBackground))" : "transparent"};
    border: 1px solid ${({ selected }: { selected: boolean }) =>
        selected ? "var(--vscode-focusBorder, var(--vscode-input-border))" : "transparent"};
    cursor: pointer;
    padding: 7px 10px;
    border-radius: 4px;
    text-align: left;

    &:hover:not(:disabled) {
        background: var(--vscode-list-hoverBackground);
    }

    &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
`;

const OptionRow = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
`;

const OptionLabel = styled.span<{ selected: boolean }>`
    font-size: 13px;
    font-family: var(--vscode-font-family);
    font-weight: ${({ selected }: { selected: boolean }) => selected ? 500 : 400};
    color: ${({ selected }: { selected: boolean }) =>
        selected ? "var(--vscode-editor-foreground)" : "var(--vscode-foreground)"};
`;

const OtherInputRow = styled(FooterTextInputRow)`
    margin-top: 4px;
    margin-left: 18px;
    width: calc(100% - 18px);
`;

// ── Types ─────────────────────────────────────────────────────────────────────

interface ClarifyFooterProps {
    questions: ClarifyQuestion[];
    requestId: string;
    rpcClient: any;
}

// ── Component ─────────────────────────────────────────────────────────────────

const ClarifyFooter: React.FC<ClarifyFooterProps> = ({ questions, requestId, rpcClient }) => {
    const [page, setPage] = useState(0);
    const [selections, setSelections] = useState<Record<number, string[]>>(
        () => Object.fromEntries(questions.map((_, i): [number, string[]] => [i, []]))
    );
    const [otherEnabled, setOtherEnabled] = useState<Record<number, boolean>>(
        () => Object.fromEntries(questions.map((_, i): [number, boolean] => [i, false]))
    );
    const [customTexts, setCustomTexts] = useState<Record<number, string>>(
        () => Object.fromEntries(questions.map((_, i): [number, string] => [i, ""]))
    );
    const [isSubmitting, setIsSubmitting] = useState(false);

    const q = questions[page];
    const isMulti = q?.selectionType === "multiple";

    const canProceed = (i: number) =>
        (selections[i]?.length ?? 0) > 0 ||
        (otherEnabled[i] && (customTexts[i]?.trim().length ?? 0) > 0);

    const canSubmit = questions.every((_, i) => canProceed(i));

    const handleSelectOption = (value: string) => {
        if (isMulti) {
            setSelections(prev => {
                const current = prev[page] ?? [];
                return {
                    ...prev,
                    [page]: current.includes(value)
                        ? current.filter(v => v !== value)
                        : [...current, value],
                };
            });
        } else {
            setSelections(prev => ({ ...prev, [page]: [value] }));
            setOtherEnabled(prev => ({ ...prev, [page]: false }));
            setCustomTexts(prev => ({ ...prev, [page]: "" }));
            if (page < questions.length - 1) {
                setTimeout(() => setPage(p => p + 1), 300);
            }
        }
    };

    const handleToggleOther = () => {
        const nowEnabled = !otherEnabled[page];
        setOtherEnabled(prev => ({ ...prev, [page]: nowEnabled }));
        if (nowEnabled) {
            if (!isMulti) {
                setSelections(prev => ({ ...prev, [page]: [] }));
            }
        } else {
            setCustomTexts(prev => ({ ...prev, [page]: "" }));
        }
    };

    const handleSubmit = async () => {
        if (!canSubmit || isSubmitting) return;
        setIsSubmitting(true);
        const answers = questions.map((qu, i) => {
            const selected = selections[i] ?? [];
            const custom = customTexts[i]?.trim() ?? "";
            const allAnswers = otherEnabled[i] && custom ? [...selected, custom] : [...selected];
            return { question: qu.question, answers: allAnswers };
        });
        try {
            await rpcClient?.getAiPanelRpcClient().submitClarifyAnswer({ requestId, answers });
        } catch (e) {
            console.error("[ClarifyFooter] submit error:", e);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!q) return null;

    const isOtherActive = otherEnabled[page];

    return (
        <FooterContainer>
            <AmbientFrame $variant="composer" $state="awaiting-input">
                <FooterBox>
                    {questions.length > 1 && (
                        <TabRow>
                            {questions.map((qu, i) => (
                                <Tab
                                    key={i}
                                    active={i === page}
                                    data-active={i === page}
                                    onClick={() => setPage(i)}
                                    disabled={isSubmitting}
                                >
                                    {qu.tabLabel}
                                </Tab>
                            ))}
                        </TabRow>
                    )}

                    <QuestionHeader>
                        <QuestionText>{q.question}</QuestionText>
                        <TypeBadge>{isMulti ? "multiple answer" : "single answer"}</TypeBadge>
                    </QuestionHeader>

                    <OptionsList>
                        {q.options.map(opt => {
                            const isSelected = (selections[page] ?? []).includes(opt.value);
                            return (
                                <OptionButton
                                    key={opt.value}
                                    selected={isSelected}
                                    onClick={() => handleSelectOption(opt.value)}
                                    disabled={isSubmitting}
                                >
                                    <OptionRow>
                                        <span
                                            className={`codicon ${isMulti
                                                ? isSelected ? "codicon-check" : "codicon-circle-outline"
                                                : isSelected ? "codicon-circle-filled" : "codicon-circle-outline"
                                            }`}
                                            style={{ fontSize: "14px", flexShrink: 0, color: isSelected ? "var(--vscode-charts-blue)" : "var(--vscode-descriptionForeground)", opacity: isSelected ? 1 : 0.5 }}
                                        />
                                        <OptionLabel selected={isSelected}>{opt.label}</OptionLabel>
                                    </OptionRow>
                                </OptionButton>
                            );
                        })}
                        <OptionButton
                            selected={isOtherActive}
                            onClick={handleToggleOther}
                            disabled={isSubmitting}
                        >
                            <OptionRow>
                                <span
                                    className={`codicon ${isMulti
                                        ? isOtherActive ? "codicon-check" : "codicon-circle-outline"
                                        : isOtherActive ? "codicon-circle-filled" : "codicon-circle-outline"
                                    }`}
                                    style={{ fontSize: "14px", flexShrink: 0, color: isOtherActive ? "var(--vscode-charts-blue)" : "var(--vscode-descriptionForeground)", opacity: isOtherActive ? 1 : 0.5 }}
                                />
                                <OptionLabel selected={isOtherActive}>Other</OptionLabel>
                            </OptionRow>
                        </OptionButton>
                        {isOtherActive && (
                            <OtherInputRow>
                                <FooterInput
                                    type="text"
                                    placeholder="Type your answer..."
                                    value={customTexts[page] ?? ""}
                                    disabled={isSubmitting}
                                    autoFocus
                                    onChange={e => setCustomTexts(prev => ({ ...prev, [page]: e.target.value }))}
                                />
                            </OtherInputRow>
                        )}
                    </OptionsList>

                    <FooterDivider />

                    <ActionButton
                        onClick={handleSubmit}
                        disabled={!canSubmit || isSubmitting}
                        style={{ justifyContent: "flex-start", gap: "6px" }}
                    >
                        {isSubmitting
                            ? <><span className="codicon codicon-loading codicon-modifier-spin" style={{ fontSize: "12px" }} /> Submitting...</>
                            : <><span className="codicon codicon-send" style={{ fontSize: "12px" }} /> Submit</>
                        }
                    </ActionButton>
                </FooterBox>
            </AmbientFrame>
        </FooterContainer>
    );
};

export default ClarifyFooter;
