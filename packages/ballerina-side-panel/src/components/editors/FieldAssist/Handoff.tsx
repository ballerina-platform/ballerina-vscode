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


import React, { createContext, useContext, useEffect, useRef } from "react";
import { Codicon } from "@wso2/ui-toolkit";
import { AssistFlowChange, FormAssistQuestion } from "@wso2/ballerina-core";
import { S } from "./styles";

// What a full-page form that reloads itself calls once Copilot takes its request into the project, instead of closing.
export const HandedOffContext = createContext<(() => void) | undefined>(undefined);

// `focus` is off where another control holds the focus, e.g. a change card's Keep.
export function HandoffCard({ flowChange, onContinue, onDismiss, focus = true }: { flowChange: AssistFlowChange; onContinue?: (flowChange: AssistFlowChange) => void; onDismiss: () => void; focus?: boolean }) {
    const applying = useContext(HandedOffContext) ? "Applying makes the changes in the project." : "Applying closes this form and makes the changes in the project.";
    return (
        <OutsideFormCard title="Changes Required Outside This Form" reason={flowChange.reason} focusApply={focus}
            note={onContinue ? `${applying} Unsaved values in this form are included.` : ""}
            onApply={onContinue && (() => onContinue(flowChange))} onCancel={onDismiss} />
    );
}

// Copilot carries the request on in the project, closing the form; Cancel keeps the form as it is.
function OutsideFormCard({ title, reason, note, focusApply, onApply, onCancel }: { title: string; reason: string; note: string; focusApply?: boolean; onApply?: () => void; onCancel: () => void }) {
    const apply = useRef<HTMLButtonElement>(null);
    // The confirmation takes the focus, so Enter carries on and Tab reaches Cancel.
    useEffect(() => {
        if (focusApply) {
            apply.current?.focus({ preventScroll: true });
        }
    }, []);
    return (
        <S.Handoff role="status">
            <S.HandoffTitle>
                <Codicon name="info" sx={{ fontSize: "14px" }} iconSx={{ fontSize: "14px" }} />
                {title}
            </S.HandoffTitle>
            <div>{reason}</div>
            {note && <S.Muted>{note}</S.Muted>}
            {onApply && (
                <S.HandoffActions>
                    <S.Primary ref={apply} type="button" onClick={onApply}>Apply in Project</S.Primary>
                    <S.Secondary type="button" onClick={onCancel}>Cancel</S.Secondary>
                </S.HandoffActions>
            )}
        </S.Handoff>
    );
}

export function DeclinedCard({ reason, onContinue, onDismiss }: { reason: string; onContinue?: () => void; onDismiss: () => void }) {
    return (
        <OutsideFormCard title="Request Not Applied" reason={reason} note="No fields changed." onApply={onContinue} onCancel={onDismiss} />
    );
}

// A question Copilot asked; a click on an answer sends it as the next message.
export function QuestionCard({ question, onAnswer }: { question: FormAssistQuestion; onAnswer: (answer: string) => void }) {
    return (
        <S.Question>
            <div>{question.text}</div>
            <S.Starters>
                {question.options.map((option) => (
                    <S.Chip key={option} type="button" onClick={() => onAnswer(option)}>{option}</S.Chip>
                ))}
            </S.Starters>
        </S.Question>
    );
}

export const STOPPED = "Stopped. Nothing changed.";

export interface Declined {
    reason: string;
    why: string;
}

export const NO_VALID_VALUE = "Copilot found no valid value for this field.";
export const NO_VALID_VALUES = "Copilot found no valid values for this form.";

export const compileFailure = (errors: string[]) => `No value compiled. The closest attempt failed with: ${errors.join("; ")}`;

export const NOT_DONE = "(not done)";
export const EXPLAINED = "(explained, nothing changed)";
export const UNDONE = "(undone)";
// A question as the next request reads Copilot's reply: the text with the choices it offered.
export const questionReply = ({ text, options }: FormAssistQuestion) => (options?.length ? `${text} (${options.join(", ")})` : text);
// The thread as the next request reads it: a turn that changed nothing carries its mark.
export const markedTurns = (history: string[], marks: Map<number, string>) =>
    history.map((text, index) => marks.has(index) ? `${text} ${marks.get(index)}` : text);

export const threadRequest = (history: string[]) => [...new Set(history)].join("\n");

export function handOffNote(history: string[], why: string): string {
    const asked = [...new Set(history)].map((message) => `"${message}"`).join(", then ");
    return [asked && `In the form, the user asked: ${asked}.`, why].filter(Boolean).join("\n");
}
