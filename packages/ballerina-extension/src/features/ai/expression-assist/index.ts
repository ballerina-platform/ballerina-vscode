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
import { AssistFlowChange, CreateConfigurableAction, ExpressionAssistAction, ExpressionAssistRequest, ExpressionAssistResponse, FormAssistQuestion } from "@wso2/ballerina-core";
import { SYSTEM_PROMPT, buildUserPrompt, fixedChoices, scopeNames } from "./prompts";
import { asDeclared, createConfigurableTool, namedIn } from "./configurable";
import { checkExpression, describeEnclosing, describeExpectedType, describeScope, stripSemicolon } from "./context";
import { candidateImports, lookupTools, undefinedFunctionHints } from "./tools";
import { ALWAYS_NIL, AttemptState, FLOW_CHANGE_INPUT, alwaysNil, askUserTool, attemptFeedback, checkValue, explainTool, firstCall, groundedCannotDoTool, handOffRequestErrors, newAttemptState, recordAttempt } from "./attempt";
import { abortAssist, runAssist, withEscalation } from "./run";
import { AnthropicModel } from "../utils/ai-client";

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
    // Configurables proposed for part of the value; a submitted value names the ones it uses.
    configurables: CreateConfigurableAction[];
    editsOtherFields?: boolean;
    flowChange?: AssistFlowChange;
    explanation?: string;
    question?: FormAssistQuestion;
    // The loop ran to its end, so it was neither stopped nor timed out.
    finished?: boolean;
}

const newRun = (): RunState => ({ ...newAttemptState<Candidate>(), configurables: [] });

// A run that ended without a value that compiles, and no answer that needs the user, goes to a stronger model.
export function assistExpression(req: ExpressionAssistRequest): Promise<ExpressionAssistResponse> {
    return withEscalation(
        (run, model, earlierTry) => runField(req, run, model, earlierTry),
        newRun,
        (run) => run.finished && !run.verified && !run.declined && !run.question && !run.editsOtherFields && !run.flowChange && !run.explanation,
        ({ best }) => `Its closest try:\n${best ? `${best.expression}\n   errors: ${best.errors.join("; ")}` : "(no submits)"}\nFind a value that compiles.`,
    );
}

function runField(req: ExpressionAssistRequest, run: RunState, model: AnthropicModel, earlierTry: string): Promise<ExpressionAssistResponse> {
    return runAssist({
        requestId: req.requestId,
        timeoutMs: TIMEOUT_MS,
        model,
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
                prompt: buildUserPrompt(req, scope, type, errors, enclosing) + earlierTry,
                tools: buildTools(req, run, type, scopeNames(scope)),
                maxSteps: MAX_STEPS,
                done: () => run.verified || run.stalled || !!run.declined || !!run.question || !!run.editsOtherFields || !!run.flowChange || !!run.explanation,
            };
        },
        finish: () => {
            run.finished = true;
            return toResponse(run);
        },
        describe: () => `${req.mode} on ${model} (verified=${run.verified})`,
    });
}

// A verified value outranks an explanation sent beside it in the same step, as in the form.
function toResponse({ best, declined, question, editsOtherFields, flowChange, explanation, verified }: RunState): ExpressionAssistResponse {
    if (question) {
        return { question };
    }
    if (editsOtherFields) {
        return { editsOtherFields };
    }
    if (flowChange) {
        return { flowChange, ...(verified && best ? valueOf(best) : {}) };
    }
    if (explanation && !verified) {
        return { explanation };
    }
    if (declined) {
        return { error: declined, declined: true };
    }
    if (!best) {
        return { error: "Couldn't come up with a value. Try describing it differently." };
    }
    // A value that does not compile would only move the error into the field.
    if (best.errors.length > 0) {
        return { error: `Couldn't find a value that works here: ${best.errors[0]}`, errors: best.errors };
    }
    return valueOf(best);
}

const valueOf = (best: Candidate): ExpressionAssistResponse => ({
    expression: best.expression,
    imports: Object.keys(best.imports).length ? best.imports : undefined,
    actions: best.actions,
    note: best.note,
});

interface SubmittedValue {
    expression: string;
    imports?: Record<string, string>;
    note: string;
}

// Compiles a value for this field and records it; `next` says what to do when it fails.
async function submitValue(req: ExpressionAssistRequest, run: RunState, names: string[], { expression, imports = {}, note }: SubmittedValue, next: string[]): Promise<string> {
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
    const named = namedIn(clean, run.configurables);
    const checked = await checkValue(req, asDeclared(clean, named), used, names);
    const nil = !checked.errors.length && await alwaysNil(req, checked.expression, used);
    // The let around a value that names a new configurable is there only for the check.
    const value = named.length ? { expression: clean, actions: named } : { expression: checked.expression };
    const candidate = { ...value, imports: used, note, errors: nil ? [ALWAYS_NIL] : checked.errors };
    const hints = [...checked.hints, ...await undefinedFunctionHints(req, checked.errors, clean, run)];
    return recordAttempt(run, candidate) ? "OK" : attemptFeedback(candidate.errors, hints, next);
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
            execute: (value) => submitValue(req, run, names, value, [
                `The value must be: ${expectedType}. A record written {| ... |} allows only the fields listed.`,
                "Fix and submit again, or call cannot_do if that type cannot hold what was asked.",
                ...(req.canChangeFlow ? ["If part of it needs code or an action outside this value, call needs_flow_change."] : []),
            ]),
        }),
        create_configurable: createConfigurableTool(
            (expression) => checkExpression(req, expression, {}),
            (action) => {
                run.best = { expression: action.name, imports: {}, note: action.documentation ?? "", errors: [], actions: [action] };
                run.verified = true;
            },
            (action) => { run.configurables.push(action); }
        ),
        ask_user: askUserTool(run, "Ask one short question when at least two real values in scope could fill a needed choice. When nothing in scope can fill it, call cannot_do instead."),
        cannot_do: groundedCannotDoTool(run, "Use when no value for this field can do what was asked: cite the compiler error, the missing name, or that it is not about this field."
            + (req.canChangeFlow ? " Not for one that needs code before this node: call needs_flow_change." : ""), !!req.canChangeFlow),
        explain: explainTool(run,
            "Only for a request to explain what this field or its value means; it changes nothing. Never for a request to suggest or write a value.",
            "One to three plain sentences; the first one answers the question asked, with no lead-in about what the field is. For \"explain this\", what the field is for and what the current value does; no code", "submit"),
        ...lookupTools(req, run),
        ...(req.formParts?.length ? { edit_other_fields: editOtherFieldsTool(run) } : {}),
        ...(req.canChangeFlow ? { needs_flow_change: needsFlowChangeTool(run, (value) => submitValue(req, run, names, value, [
            `The value must be: ${expectedType}. Call needs_flow_change again with the value fixed, or without one.`,
        ])) } : {}),
    };
}

function needsFlowChangeTool(run: RunState, submit: (value: SubmittedValue) => Promise<string>) {
    return tool({
        description: "Hand the part of the request this field's value cannot do to the main Copilot: code before this node (a new "
            + "node, a variable that does not exist yet, or a class value only its methods can fill), or an action this node does "
            + "not perform. Pass the value this field holds with it when the request says what it holds.",
        inputSchema: z.object({
            ...FLOW_CHANGE_INPUT,
            expression: z.string().optional().describe("The value this field holds alongside the change, when the request says what it holds; it is compiled like a submit"),
            imports: z.record(z.string(), z.string()).optional().describe("Modules the value uses, prefix to module id"),
        }),
        execute: async ({ reason, request, expression, imports }) => {
            if (firstCall(run, "needs_flow_change")) {
                return "Before handing over: could one expression of the expected type do all that was asked, however long? "
                    + "If so, submit it. If not, call needs_flow_change again, with the value this field holds when the request says what it holds.";
            }
            const errors = handOffRequestErrors(request);
            if (errors.length) {
                return `${errors[0]}. Call needs_flow_change again.`;
            }
            const checked = expression?.trim() ? await submit({ expression, imports, note: "" }) : "OK";
            if (checked !== "OK") {
                return checked;
            }
            run.flowChange = { reason, request };
            return "Handed over.";
        },
    });
}

function editOtherFieldsTool(run: RunState) {
    return tool({
        description: "Hand the request to the whole form when it also needs other fields changed or added, e.g. another branch, "
            + "a variable's name or type, or a second value. Not for a request this field alone can satisfy, nor for code before this node.",
        inputSchema: z.object({}),
        execute: async () => {
            run.editsOtherFields = true;
            return "Handed over.";
        },
    });
}
