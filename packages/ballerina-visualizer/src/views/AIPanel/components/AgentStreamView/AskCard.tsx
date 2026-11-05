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
import type { ClarifyQuestion } from "@wso2/ballerina-core";
import {
    InlineCard,
    InlineCardHeader,
    InlineCardIcon,
    InlineCardTitle,
    InlineDivider,
} from "./styles";

// ── Locally scoped styled components ─────────────────────────────────────────

const ChevronIcon = styled.span`
    margin-left: auto;
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    opacity: 0.7;
`;

const QABlock = styled.div`
    display: flex;
    flex-direction: column;
    padding: 2px 0 4px;
`;

const QAItem = styled.div`
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 6px 0;
`;

const QAQuestion = styled.div`
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    font-family: var(--vscode-font-family);
    opacity: 0.85;
`;

const QAAnswerRow = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
`;

const QAAnswerChip = styled.span`
    font-size: 11px;
    font-family: var(--vscode-font-family);
    color: var(--vscode-editor-foreground);
    background: var(--vscode-badge-background, var(--vscode-editor-inactiveSelectionBackground));
    border-radius: 3px;
    padding: 1px 6px;
`;

// ── Component ─────────────────────────────────────────────────────────────────

export function getAnswerLabel(question: ClarifyQuestion | undefined, answer: string): string {
    return question?.options?.find(option => option.value === answer)?.label ?? answer;
}

interface AskCardProps {
    data: Record<string, any>;
    rpcClient?: any;
}

const AskCard: React.FC<AskCardProps> = ({ data }) => {
    const stage: string = data.stage;
    const [expanded, setExpanded] = useState(false);

    if (stage === "asking") {
        return null;
    }

    if (stage === "answered") {
        const answers: Array<{ question: string; answers: string[] }> = data.answers ?? [];
        const questions: ClarifyQuestion[] = data.questions ?? [];
        const hasAnswers = answers.length > 0;
        return (
            <InlineCard status="done">
                <InlineCardHeader
                    onClick={() => hasAnswers && setExpanded(e => !e)}
                    style={{ cursor: hasAnswers ? "pointer" : "default" }}
                >
                    <InlineCardIcon>
                        <span className="codicon codicon-pass" />
                    </InlineCardIcon>
                    <InlineCardTitle>Questions answered</InlineCardTitle>
                    {hasAnswers && (
                        <ChevronIcon className={`codicon codicon-chevron-${expanded ? "up" : "down"}`} />
                    )}
                </InlineCardHeader>
                {expanded && hasAnswers && (
                    <QABlock>
                        {answers.map((a, i) => (
                            <React.Fragment key={i}>
                                {i > 0 && <InlineDivider />}
                                <QAItem>
                                    <QAQuestion>{a.question}</QAQuestion>
                                    <QAAnswerRow>
                                        {a.answers.map((ans, j) => (
                                            <QAAnswerChip key={j}>{getAnswerLabel(questions[i], ans)}</QAAnswerChip>
                                        ))}
                                    </QAAnswerRow>
                                </QAItem>
                            </React.Fragment>
                        ))}
                    </QABlock>
                )}
            </InlineCard>
        );
    }

    return null;
};

export default AskCard;
