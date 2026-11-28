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

import { DropdownType, InputType, TemplateType } from "../interfaces/bi";

const STRING_TEMPLATE = /^string\s*`[^`]*`$/;
const RAW_TEMPLATE = /^`[^`]*`$/;
const STRING_LITERAL = /^"(?:[^"\\]|\\.)*"$/;

/**
 * Removes the wrapper from a complete Ballerina string literal or template.
 * Expressions are returned unchanged.
 */
export function unwrapBallerinaString(value?: string): string {
  const trimmed = value?.trim() ?? "";
  if (STRING_TEMPLATE.test(trimmed)) {
    return trimmed.replace(/^string\s*`/, "").slice(0, -1);
  }
  if (RAW_TEMPLATE.test(trimmed)) {
    return trimmed.slice(1, -1);
  }
  if (STRING_LITERAL.test(trimmed)) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export const getPrimaryInputType = (types: InputType[]): InputType | undefined => {
  if (!types || types.length === 0) return undefined;
  return types[0];
}

// The type shown as a field's type hint. The primary input type is often a narrowed input mode — e.g.
// a `string|string[]` field is split into a `TEXT string` mode first, and an optional `time:Duration?`
// into a `RECORD_MAP time:Duration` mode first — while the field's full declared type lives on the
// EXPRESSION entry. Prefer that so unions/optionals (and dynamic activity params) display their full type.
export const getFieldTypeLabel = (types?: InputType[]): string | undefined => {
  if (!types || types.length === 0) return undefined;
  const expressionType = types.find((t) => t.fieldType === "EXPRESSION" && !!t.ballerinaType);
  return expressionType?.ballerinaType ?? getPrimaryInputType(types)?.ballerinaType;
}

export const getSecondaryInputType = (inputTypes: InputType[]) => {
    return inputTypes?.length ? inputTypes[inputTypes.length - 1] : undefined;
}

export const isTemplateType = (
  value: InputType
): value is TemplateType => {
  return value !== null && typeof value === "object" && "template" in value;
};

export const isDropDownType = (
  value: InputType
): value is DropdownType => {
  return (
    value !== null && 
    "options" in value &&
    (value?.fieldType === "SINGLE_SELECT" || value?.fieldType === "MULTIPLE_SELECT")
  );
};

export interface RowStep {
    before?: number;
    after?: number;
    was?: string;
    now?: string;
}

// Lines rows up by content, so a row inserted at the top reads as one addition, not every row changing.
export function alignRows(before: string[], after: string[]): RowStep[] {
    const common: number[][] = Array.from({ length: before.length + 1 }, () => new Array(after.length + 1).fill(0));
    for (let i = before.length - 1; i >= 0; i--) {
        for (let j = after.length - 1; j >= 0; j--) {
            common[i][j] = before[i] === after[j] ? common[i + 1][j + 1] + 1 : Math.max(common[i + 1][j], common[i][j + 1]);
        }
    }
    const steps: RowStep[] = [];
    let [i, j] = [0, 0];
    while (i < before.length || j < after.length) {
        if (i < before.length && j < after.length && before[i] === after[j]) {
            steps.push({ before: i, after: j, was: before[i++], now: after[j++] });
        } else if (j < after.length && (i === before.length || common[i][j + 1] >= common[i + 1][j])) {
            steps.push({ after: j, now: after[j++] });
        } else {
            steps.push({ before: i, was: before[i++] });
        }
    }
    return pairEdits(steps);
}

// Between two kept rows, the removed and added rows pair up in order as edited rows, e.g. two renamed workers.
function pairEdits(steps: RowStep[]): RowStep[] {
    const result: RowStep[] = [];
    let removed: RowStep[] = [];
    let added: RowStep[] = [];
    const flush = () => {
        const pairs = Math.min(removed.length, added.length);
        for (let k = 0; k < pairs; k++) {
            result.push({ before: removed[k].before, after: added[k].after, was: removed[k].was, now: added[k].now });
        }
        result.push(...removed.slice(pairs), ...added.slice(pairs));
        removed = [];
        added = [];
    };
    for (const step of steps) {
        if (step.was !== undefined && step.now !== undefined) {
            flush();
            result.push(step);
        } else if (step.now === undefined) {
            removed.push(step);
        } else {
            added.push(step);
        }
    }
    flush();
    return result;
}
