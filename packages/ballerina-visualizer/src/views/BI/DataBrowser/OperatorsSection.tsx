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


import React from "react";
import { InsertTarget } from "@wso2/ballerina-side-panel";
import { Preview } from "./FunctionsSection";
import { S } from "./styles";
import { Section, dragProps } from "./tree";

// A condition compares values and joins comparisons; arithmetic and joining text need no reminder.
const OPERATORS = ["==", "!=", ">", "<", ">=", "<=", "&&", "||", "!"];

export const OPERATOR_DESCRIPTIONS: Record<string, string> = {
    "==": "Equal to",
    "!=": "Not equal to",
    ">": "Greater than",
    "<": "Less than",
    ">=": "Greater than or equal to",
    "<=": "Less than or equal to",
    "&&": "And: true when both sides are true",
    "||": "Or: true when either side is true",
    "!": "Not: reverses true and false",
};

// The card sits beside the browser, so it lines up with the chips row rather than the chip.
const anchorOf = (chip: HTMLElement) => {
    const row = chip.parentElement.getBoundingClientRect();
    const rect = chip.getBoundingClientRect();
    return new DOMRect(row.left, rect.top, row.width, rect.height);
};

interface OperatorsSectionProps {
    target?: InsertTarget | null;
    onPreview: Preview<string>;
}

export function OperatorsSection({ target, onPreview }: OperatorsSectionProps) {
    if (target?.expectedType?.replace(/\?$/, "") !== "boolean") {
        return null;
    }
    return (
        <Section title="Operators">
            <S.Chips>
                {OPERATORS.map((operator) => (
                    <S.Operator
                        key={operator}
                        active={false}
                        aria-label={OPERATOR_DESCRIPTIONS[operator]}
                        onClick={() => {
                            onPreview.hide(true);
                            target?.insert(operator);
                        }}
                        {...dragProps(operator, (into) => into.insert(operator), () => onPreview.hide(true))}
                        onMouseEnter={(event) => onPreview.show(operator, anchorOf(event.currentTarget))}
                        onMouseLeave={() => onPreview.hide()}
                        onFocus={(event) => onPreview.show(operator, anchorOf(event.currentTarget), true)}
                        onBlur={() => onPreview.hide(true)}
                    >
                        {operator}
                    </S.Operator>
                ))}
            </S.Chips>
        </Section>
    );
}
