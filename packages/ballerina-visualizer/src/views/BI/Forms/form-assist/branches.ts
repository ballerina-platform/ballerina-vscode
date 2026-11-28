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

import type { Branch, Property } from "@wso2/ballerina-core";

// The branches the If, Match and Fork forms add, shared with the form assist that adds them too.

export const MATCH_DEFAULT_PATTERN = "_";

const blockCondition = (label: string): Property => ({
    metadata: {
        label,
        description: "Add condition to evaluate if the previous conditions are false",
    },
    value: "",
    types: [{ fieldType: "EXPRESSION", selected: false }],
    placeholder: "true",
    optional: false,
    editable: true,
});

export function newIfBranch(index: number): Branch {
    return {
        label: "branch-" + index,
        kind: "block",
        codedata: { node: "CONDITIONAL", lineRange: null },
        repeatable: "ONE_OR_MORE",
        properties: { condition: blockCondition("Else If Condition") },
        children: [],
    };
}

export function newElseBranch(): Branch {
    return {
        label: "Else",
        kind: "block",
        codedata: { node: "ELSE", lineRange: null },
        repeatable: "ZERO_OR_ONE",
        properties: { condition: blockCondition("Else") },
        children: [],
    };
}

const matchPatterns = (value: string): Property => ({
    metadata: { label: "Patterns", description: "Patterns to match the target against" },
    value: [
        {
            metadata: { label: "Pattern", description: "Pattern or value to match the target against" },
            value,
            types: [{ fieldType: "EXPRESSION", selected: false }],
            optional: false,
            editable: true,
            advanced: false,
            hidden: false,
        },
    ] as unknown as Property["value"],
    types: [{ fieldType: "SINGLE_SELECT", selected: false }],
    optional: false,
    editable: true,
    advanced: false,
    hidden: false,
});

export function newMatchCase(index: number, pattern = ""): Branch {
    return {
        label: "branch-" + index,
        kind: "block",
        codedata: { node: "CONDITIONAL", lineRange: null },
        repeatable: "ONE_OR_MORE",
        properties: { patterns: matchPatterns(pattern) },
        children: [],
    };
}

export function newMatchDefault(): Branch {
    return { ...newMatchCase(0, MATCH_DEFAULT_PATTERN), label: MATCH_DEFAULT_PATTERN };
}

export function newForkWorker(index: number): Branch {
    return {
        label: "branch-" + index,
        kind: "worker",
        codedata: { node: "WORKER", lineRange: null },
        repeatable: "ONE_OR_MORE",
        properties: {
            variable: {
                metadata: { label: "Worker " + (index + 1), description: "Name of the worker" },
                value: "worker" + (index + 1),
                optional: false,
                editable: true,
                advanced: false,
            },
            type: {
                metadata: { label: "Return Type", description: "Return type of the function/worker" },
                value: "",
                optional: true,
                editable: true,
                advanced: false,
            },
        },
        children: [],
    };
}

/** Where branch forms show changes that are not on a row of their own (`branch-N`): a group's removed rows, a toggle, the match target. */
export const BRANCH_MARKS = { conditions: "conditions", else: "else", cases: "cases", default: "default", workers: "workers", target: "matchTarget" } as const;
