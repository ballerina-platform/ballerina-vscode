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

import { tool } from "ai";
import { z } from "zod";
import { ExpressionAssistAction, ExpressionAssistRequest, ExpressionAssistResponse } from "@wso2/ballerina-core";
import { SYSTEM_PROMPT, buildUserPrompt, fixedChoices, scopeNames } from "./prompts";
import { createConfigurableTool } from "./configurable";
import { checkExpression, describeEnclosing, describeExpectedType, describeScope, stripSemicolon } from "./context";
import { candidateImports, lookupTools } from "./tools";
import { AttemptState, attemptFeedback, cannotDoTool, checkValue, explainTool, newAttemptState, recordAttempt } from "./attempt";
import { abortAssist, runAssist } from "./run";

// Enough for a lookup, a docs read and two compile retries; a stuck run stops instead of making the user wait.
const MAX_STEPS = 6;
const TIMEOUT_MS = 20_000;

export const abortExpressionAssist = abortAssist;

interface Candidate {
    expression: string;
    imports: Record<string, string>;
    note: string;
    errors: string[];
    actions?: ExpressionAssistAction[];
}

interface RunState extends AttemptState<Candidate> {
    editsOtherFields?: boolean;
    explanation?: string;
}

export async function assistExpression(req: ExpressionAssistRequest): Promise<ExpressionAssistResponse> {
    const run: RunState = newAttemptState<Candidate>();
    return runAssist({
        requestId: req.requestId,
        timeoutMs: TIMEOUT_MS,
        prepare: async () => {
            const value = req.context.expression.trim();
            const [scope, type, errors, enclosing] = await Promise.all([
                describeScope(req),
                describeExpectedType(req),
                req.diagnostics ?? (req.mode === "fix" && value ? checkExpression(req, value, {}) : Promise.resolve([])),
                describeEnclosing(req),
            ]);
            return {
                system: SYSTEM_PROMPT,
                prompt: buildUserPrompt(req, scope, type, errors, enclosing),
                tools: buildTools(req, run, type, scopeNames(scope)),
                maxSteps: MAX_STEPS,
                done: () => run.verified || run.stalled || !!run.declined || !!run.editsOtherFields || !!run.explanation,
            };
        },
        finish: () => toResponse(run),
        describe: () => `${req.mode} (verified=${run.verified})`,
    });
}

function toResponse({ best, declined, editsOtherFields, explanation }: RunState): ExpressionAssistResponse {
    if (editsOtherFields) {
        return { editsOtherFields };
    }
    if (explanation) {
        return { explanation };
    }
    if (declined) {
        return { error: declined };
    }
    if (!best) {
        return { error: "Couldn't come up with a value. Try describing it differently." };
    }
    // A value that does not compile would only move the error into the field.
    if (best.errors.length > 0) {
        return { error: `Couldn't find a value that works here: ${best.errors[0]}`, errors: best.errors };
    }
    return {
        expression: best.expression,
        imports: Object.keys(best.imports).length ? best.imports : undefined,
        actions: best.actions,
        note: best.note,
    };
}

function buildTools(req: ExpressionAssistRequest, run: RunState, expectedType: string, names: string[]) {
    return {
        submit: tool({
            description: "Compile the expression for this field. Returns OK, or the compiler errors to fix.",
            inputSchema: z.object({
                expression: z.string().describe("One Ballerina expression, written exactly as source. A string literal keeps its own quotes inside this value: \"\\\"localhost\\\"\""),
                imports: z.record(z.string(), z.string()).optional()
                    .describe("Modules to import, prefix to module id, e.g. {\"time\": \"ballerina/time\"}"),
                note: z.string().describe("One short plain-language sentence about the value"),
            }),
            execute: async ({ expression, imports = {}, note }) => {
                const clean = stripSemicolon(expression);
                const used = candidateImports(clean, run, imports);
                // An empty value is the model deciding the field should stay empty, which only an optional field can.
                if (!clean.trim()) {
                    if (req.context.property.optional) {
                        run.declined = "This field is optional and can stay empty here.";
                        return "Noted.";
                    }
                    return "This field is required: submit a value.";
                }
                const allowed = fixedChoices(req.context.property);
                if (allowed.length && !allowed.includes(clean)) {
                    return `The value must be one of ${allowed.join(", ")}.`;
                }
                const checked = await checkValue(req, clean, used, names);
                const candidate = { expression: checked.expression, imports: used, note, errors: checked.errors };
                return recordAttempt(run, candidate) ? "OK" : attemptFeedback(candidate.errors, checked.hints, [
                    `The value must be: ${expectedType}. A record written {| ... |} allows only the fields listed.`,
                    "Fix and submit again, or call cannot_do if that type cannot hold what was asked.",
                ]);
            },
        }),
        create_configurable: createConfigurableTool(
            (expression) => checkExpression(req, expression, {}),
            (action) => {
                run.best = { expression: action.name, imports: {}, note: action.documentation ?? "", errors: [], actions: [action] };
                run.verified = true;
            }
        ),
        cannot_do: cannotDoTool(run, "Use when the request cannot work for this field, e.g. it asks for a field the expected type does not have."),
        explain: explainTool(run,
            "Only for a request to explain what this field or its value means; it changes nothing. Never for a request to suggest or write a value.",
            "Two or three plain sentences that answer the question asked; for \"explain this\", what the field is for and what the current value does; no code", "submit"),
        ...lookupTools(req, run),
        ...(req.formParts?.length ? { edit_other_fields: editOtherFieldsTool(run) } : {}),
    };
}

function editOtherFieldsTool(run: RunState) {
    return tool({
        description: "Hand the request to the whole form when it also needs other fields changed or added, e.g. another branch, "
            + "a variable's name or type, or a second value. Not for a request this field alone can satisfy.",
        inputSchema: z.object({}),
        execute: async () => {
            run.editsOtherFields = true;
            return "Handed over.";
        },
    });
}
