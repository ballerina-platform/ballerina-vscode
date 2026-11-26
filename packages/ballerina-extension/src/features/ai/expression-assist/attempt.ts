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
import type { FormAssistQuestion } from "@wso2/ballerina-core";
import { z } from "zod";
import { AssistSite, Diagnosed, checkExpression, diagnoseExpression } from "./context";
import { ERROR_HINTS, PARSE_ERROR, isGrounded, keywordHints, looksLikePlainText } from "./prompts";
import { LookupState, newLookupState } from "./tools";

// Three compiles that still fail mean the model is guessing; stopping keeps a bad run short.
const MAX_FAILED_SUBMITS = 3;

export interface Attempt {
    errors: string[];
}

// What a run learns from its submits; the loop stops on a clean compile, a refusal, or the same errors twice.
export interface AttemptState<T extends Attempt> extends LookupState {
    best?: T;
    verified: boolean;
    stalled: boolean;
    declined?: string;
    lastErrors?: string;
    failedSubmits: number;
    errorsSeen: string[];
    // Boundary tools already called once, so their question is asked only once.
    called?: Set<string>;
}

export function newAttemptState<T extends Attempt>(): AttemptState<T> {
    return { verified: false, stalled: false, failedSubmits: 0, errorsSeen: [], ...newLookupState() };
}

// Keeps the attempt with the fewest errors and decides whether the run is done; true on a clean compile.
export function recordAttempt<T extends Attempt>(run: AttemptState<T>, attempt: T): boolean {
    if (!run.best || attempt.errors.length <= run.best.errors.length) {
        run.best = attempt;
    }
    run.verified = attempt.errors.length === 0;
    const errorKey = attempt.errors.join("\n");
    run.failedSubmits += run.verified ? 0 : 1;
    run.stalled = !run.verified && (errorKey === run.lastErrors || run.failedSubmits >= MAX_FAILED_SUBMITS);
    run.lastErrors = errorKey;
    run.errorsSeen.push(...attempt.errors);
    return run.verified;
}

// The compiler errors, every hint that matches them, then what to do next.
export function attemptFeedback(errors: string[], hints: string[], next: string[]): string {
    const matched = ERROR_HINTS.filter(({ test }) => errors.some((error) => test.test(error))).map(({ hint }) => `Hint: ${hint}`);
    return ["Compiler errors:", ...errors.map((error) => `- ${error}`), ...hints, ...matched, ...next].join("\n");
}

export interface CheckedValue {
    // The value as checked: plain text the model forgot to quote comes back quoted.
    expression: string;
    errors: string[];
    hints: string[];
}

// One value's compile check, as both the field and the form run it.
export async function checkValue(site: AssistSite, expression: string, imports: Record<string, string>, names: string[]): Promise<CheckedValue> {
    const diagnosed = await diagnoseExpression(site, expression, imports)
        .catch((error: Error): Diagnosed[] => [{ error: `The check could not run: ${error.message}` }]);
    const errors = diagnosed.map(({ error }) => error);
    // Unquoted plain text (0.0.0.0, claude-sonnet-4-6) reads as code; retry it as a literal, kept only when that compiles.
    if (errors.some((error) => PARSE_ERROR.test(error) || /^undefined symbol/.test(error)) && looksLikePlainText(expression, names)) {
        const quoted = JSON.stringify(expression);
        const quotedErrors = await checkExpression(site, quoted, imports).catch((): string[] => ["failed"]);
        if (quotedErrors.length === 0) {
            return { expression: quoted, errors: [], hints: [] };
        }
    }
    const fixes = diagnosed.flatMap(({ hint }) => hint ? [`Hint: ${hint}`] : []);
    return { expression, errors, hints: errors.length ? [...fixes, ...keywordHints(expression, names)] : [] };
}

const NIL_LITERAL = /^\(\s*\)$/;
export const ALWAYS_NIL = "this value is always nil, so the field would hold nothing; a call to a method with no return type gives nil";

// A value whose own type is nil compiles for any optional field but never holds anything, e.g. a call that returns nothing.
export async function alwaysNil(site: AssistSite, expression: string, imports: Record<string, string>): Promise<boolean> {
    const types = site.context.property.types ?? [];
    const takesNil = types.some((type) => /\?$|\(\)/.test(type.ballerinaType ?? ""));
    if (!takesNil || NIL_LITERAL.test(expression.trim())) {
        return false;
    }
    const nilOnly = { ...site.context.property, types: types.map((type) => ({ ...type, ballerinaType: "()" })) };
    const errors = await checkExpression({ ...site, context: { ...site.context, property: nilOnly } }, expression, imports)
        .catch((): string[] => ["failed"]);
    return errors.length === 0;
}

// What a hand-off to the main Copilot carries; the field and the form ask for it the same way.
export const FLOW_CHANGE_INPUT = {
    reason: z.string().describe("One plain sentence for a non-programmer that says what has to change outside this form, with no code words"),
    request: z.string().describe("What the user would type to get this change: one or two plain imperative sentences that name the node or agent it changes. No mention of the form, Copilot or the user; never advice or a question."),
};

const HAND_OFF_META = /\b(the user|this form|the form|copilot|confirm with)\b/i;

/** The hand-off request shows in the chat as if the user typed it, so it reads as a request in their voice. */
export function handOffRequestErrors(request: string): string[] {
    const text = request.trim();
    return HAND_OFF_META.test(text) || text.endsWith("?")
        ? ["needs_flow_change request: write what the user would type to the main Copilot, an imperative request naming the agent or node, with no mention of the form, Copilot or the user and no advice or question; to advise against the change, call cannot_do"]
        : [];
}

const REASON = z.string().describe("One short plain-language sentence for the user, with no type or code names");
// Asked once, as a reply rather than a schema field: a field every request reads pulls the model off ordinary values.
const FLOW_QUESTION = "Before refusing: could a new node, an If, or code before this node do what was asked? "
    + "If so, call needs_flow_change. If not, call cannot_do again with the same reason.";

// True the first time a run calls `name`, so a boundary call is confirmed once.
export function firstCall(run: { called?: Set<string> }, name: string): boolean {
    run.called ??= new Set();
    const first = !run.called.has(name);
    run.called.add(name);
    return first;
}

const GROUNDS = {
    evidence: z.enum(["compiler_error", "missing_name", "off_topic"])
        .describe("compiler_error: a submit failed in a way no value can fix; missing_name: the request needs a field or function the types do not have; off_topic: the request is not about this node"),
    cites: z.string().optional().describe("For compiler_error, the error as a submit returned it; for missing_name, the name alone, e.g. email"),
};

const UNGROUNDED = "Not accepted: cite a compiler error that a submit returned in this run, or a field or function "
    + "name that the types shown do not have. Otherwise submit your best value.";

type Refusal = { reason: string; evidence?: z.infer<typeof GROUNDS.evidence>; cites?: string };

export function cannotDoTool(run: { declined?: string; called?: Set<string> }, description: string, flowCheck = false, grounding?: { errorsSeen: string[]; seen: string[] }) {
    return tool({
        description,
        inputSchema: z.object(grounding ? { reason: REASON, ...GROUNDS } : { reason: REASON }) as z.ZodType<Refusal>,
        execute: async ({ reason, evidence, cites = "" }) => {
            if (flowCheck && evidence !== "off_topic" && firstCall(run, "cannot_do")) {
                return FLOW_QUESTION;
            }
            if (grounding && !isGrounded(grounding, evidence, cites.trim())) {
                return UNGROUNDED;
            }
            run.declined = reason;
            return "Noted.";
        },
    });
}

// A refusal the form makes must rest on something the run saw, so a request that can work is never declined with an invented reason.
export function groundedCannotDoTool(run: AttemptState<Attempt>, description: string, flowCheck = false) {
    return cannotDoTool(run, description, flowCheck, run);
}

// A question back to the user, when the request leaves open a choice that changes the result.
export function askUserTool(run: { question?: FormAssistQuestion }, description: string) {
    return tool({
        description,
        inputSchema: z.object({
            question: z.string().describe("One short plain-language question with no code"),
            options: z.array(z.string()).min(2).max(4)
                .describe("Values in scope to pick from, in plain words; never actions such as cancel, search or name them myself"),
        }),
        execute: async ({ question, options }) => {
            run.question = { text: question, options };
            return "Asked.";
        },
    });
}

// The answer comes first, then what it suggests changing; an answer that suggests a change goes back to the submit tool as one.
export function explainTool(run: { explanation?: string }, description: string, text: string, submit: string) {
    return tool({
        description,
        inputSchema: z.object({
            text: z.string().describe(text),
            change: z.string().describe("What this answer suggests changing, in a few words, or \"nothing\""),
        }),
        execute: async ({ text, change }) => {
            if (text.trim().split(/\s+/).length < MIN_ANSWER_WORDS) {
                return `That is not an answer. Write one to three plain sentences, or call ${submit} if the request asks for a value.`;
            }
            if (!NO_CHANGE.test(change)) {
                return `That answer suggests a change (${change}): call ${submit} with it and put the reason in its note; the user reviews it before it applies.`;
            }
            run.explanation = text;
            return "Answered.";
        },
    });
}

const NO_CHANGE = /^\s*(nothing|none|no change)?\W*$/i;
const MIN_ANSWER_WORDS = 4;
