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
import { workspace } from "vscode";
import { z } from "zod";
import { ExpressionProperty, AssistFlowChange, FormAssistQuestion, FormAssistRequest, FormAssistResponse, FormAssistSlot } from "@wso2/ballerina-core";
import { Enclosing, FORM_SYSTEM_PROMPT, buildFormPrompt, choices, scopeNames } from "./prompts";
import { AssistSite, checkExpression, describeEnclosing, describeScope, stripSemicolon, subjectCode } from "./context";
import { candidateImports, lookupTools, usagesTool } from "./tools";
import { AttemptState, FLOW_CHANGE_INPUT, attemptFeedback, checkValue, explainTool, groundedCannotDoTool, handOffRequestErrors, newAttemptState, recordAttempt } from "./attempt";
import { runAssist } from "./run";
import { ANTHROPIC_HAIKU, ANTHROPIC_SONNET, AnthropicModel } from "../utils/ai-client";

// A form needs more compile rounds than one field: several values can fail at once.
const MAX_STEPS = 8;
const TIMEOUT_MS = 30_000;
const IDENTIFIER = /^'?[A-Za-z_][A-Za-z0-9_]*$/;
const NO_FLOW = "A type has no flow. Values that belong together go in a field with an inline record type, e.g. record {| string city; string zip; |}. "
    + "Submit that, or call cannot_do.";

interface FormCandidate {
    values: Record<string, string>;
    groups: Record<string, Record<string, string>[]>;
    imports: Record<string, string>;
    actions: { id: string; request: string }[];
    note: string;
    sources?: Record<string, string>;
    samples?: string[];
    flowChange?: AssistFlowChange;
    skipped?: string;
    purpose?: string;
    errors: string[];
}

type FormRunState = AttemptState<FormCandidate> & {
    question?: FormAssistQuestion;
    explanation?: string;
    // Each submit with its errors, so an escalated run starts from them.
    tries: string[];
    // The loop ran to its end, so it was neither stopped nor timed out.
    finished?: boolean;
    // A new node's made-up name was sent back once for a real one.
    askedName?: boolean;
};

const newFormRun = (): FormRunState => ({ ...newAttemptState<FormCandidate>(), tries: [] });

// A run that ended on compiler errors, and no answer that needs the user, goes to a stronger model with what was tried.
export async function assistForm(req: FormAssistRequest): Promise<FormAssistResponse> {
    const run = newFormRun();
    const response = await runForm(req, run, ANTHROPIC_HAIKU, "");
    const failed = run.finished && !run.verified && !run.declined && !run.question && !run.explanation;
    if (!failed || !workspace.getConfiguration("ballerina.copilot").get<boolean>("formAssistEscalation")) {
        return response;
    }
    const tried = run.tries.map((attempt, index) => `${index + 1}. ${attempt}`).join("\n");
    const escalated = await runForm(req, newFormRun(), ANTHROPIC_SONNET, `\n\nA faster model tried this first and failed. Its submits and their compiler errors:\n${tried || "(no submits)"}\nFind values that compile; a different approach is fine.`);
    // shortcut: dev-only trace of the first run, so the eval counts both runs' tokens; remove with the trace in run.ts.
    const traced = escalated as { trace?: object };
    return traced.trace ? { ...escalated, trace: { ...traced.trace, first: (response as { trace?: object }).trace } } as FormAssistResponse : escalated;
}

// The function holding what the form edits; a subject with no function around it, e.g. a service, is read from its own range.
async function describeSubject(req: FormAssistRequest): Promise<Enclosing> {
    if (!req.subjectRange) {
        return describeEnclosing(req);
    }
    const enclosing = await describeEnclosing({ ...req, context: { ...req.context, startLine: req.subjectRange.startLine } });
    return enclosing.code ? enclosing : { signature: "", code: await subjectCode(req, req.subjectRange) };
}

function runForm(req: FormAssistRequest, run: FormRunState, model: AnthropicModel, earlierTries: string): Promise<FormAssistResponse> {
    return runAssist({
        requestId: req.requestId,
        timeoutMs: TIMEOUT_MS,
        model,
        prepare: async () => {
            const [scope, enclosing] = await Promise.all([
                describeScope(req),
                describeSubject(req),
            ]);
            const prompt = buildFormPrompt(req, scope, enclosing) + earlierTries;
            run.seen.push(prompt);
            return {
                system: FORM_SYSTEM_PROMPT,
                prompt,
                tools: buildTools(req, run, scopeNames(scope)),
                maxSteps: MAX_STEPS,
                maxOutputTokens: 2048,
                // A stalled run ends on its compiler error; a decline here would need an invented reason.
                done: () => run.verified || run.stalled || !!run.declined || !!run.question || !!run.explanation,
            };
        },
        finish: () => {
            run.finished = true;
            return toResponse(run);
        },
        describe: () => `form ${req.node} on ${model} (verified=${run.verified})`,
    });
}

// A verified change outranks an explanation sent beside it in the same step.
export function toResponse({ best, declined, question, explanation, verified }: FormRunState): FormAssistResponse {
    if (question) {
        return { question };
    }
    if (explanation && !verified) {
        return { explanation };
    }
    if (declined) {
        return { error: declined, declined: true };
    }
    if (!best) {
        return { error: "Couldn't fill this form. Try describing it differently." };
    }
    if (best.errors.length > 0) {
        return { error: `Couldn't find values that work here: ${best.errors[0]}`, errors: best.errors };
    }
    return {
        values: best.values,
        groups: Object.keys(best.groups).length ? best.groups : undefined,
        imports: Object.keys(best.imports).length ? best.imports : undefined,
        actions: best.actions.length ? best.actions : undefined,
        note: best.note,
        sources: best.sources,
        samples: best.samples,
        flowChange: best.flowChange,
        skipped: best.skipped,
    };
}

function buildTools(req: FormAssistRequest, run: FormRunState, names: string[]) {
    return {
        submit_form: tool({
            description: "Compile the form's new values. Returns OK, or the compiler errors per path to fix.",
            inputSchema: z.object({
                values: z.record(z.string(), z.string()).optional()
                    .describe("Slot path to one Ballerina expression, written exactly as source; only the listed slot paths"),
                groups: z.record(z.string(), z.array(z.record(z.string(), z.string()))).optional()
                    .describe("Group id to its full new row list; each row maps item keys to expressions"),
                imports: z.record(z.string(), z.string()).optional()
                    .describe("Modules to import, prefix to module id, e.g. {\"time\": \"ballerina/time\"}"),
                actions: z.array(z.object({
                    id: z.string(),
                    request: z.string().describe("What to fill in the form the action opens, as the user would ask it"),
                })).max(1).optional().describe("At most one listed action to open after the values apply"),
                note: z.string().describe("One short plain-language sentence about only what this call changes and opens"),
                sources: z.record(z.string(), z.string()).optional()
                    .describe("Slot path to where its value comes from in a few plain words, naming the variable and where it is from"),
                samples: z.array(z.string()).optional().describe("Slot paths whose values are made up, not from the request or scope"),
                skipped: z.string().optional()
                    .describe("Only when this call leaves part of the user's request undone: one plain sentence naming that part and why, no code words; never a value the request did not mention"),
                purpose: z.string().optional()
                    .describe("Only when a name is marked (generated): what the user's request says this node is for, in the request's own words, e.g. \"billing questions\"; empty when the request only sets other values"),
            }),
            execute: async ({ values = {}, groups = {}, imports = {}, actions = [], note, sources, samples, skipped, purpose }) =>
                submitCandidate(req, run, names, { values, groups, imports, actions, note, sources, samples, skipped, purpose, errors: [] }),
        }),
        needs_flow_change: tool({
            description: "Use when the request needs a change outside this form: an If around this node, a new or moved node, "
                + "something a required value needs that does not exist yet, or an error no value here can clear. "
                + "The main Copilot makes it in the chat. Pass the values this form should hold.",
            inputSchema: z.object({
                ...FLOW_CHANGE_INPUT,
                values: z.record(z.string(), z.string()).optional()
                    .describe("Slot path to one Ballerina expression this form keeps"),
                imports: z.record(z.string(), z.string()).optional().describe("Modules the values use, prefix to module id"),
            }),
            // Values for paths this form lacks belong to the new node, which the request already describes.
            execute: async ({ reason, request, values = {}, imports = {} }) => req.node.startsWith("TYPE") ? NO_FLOW : submitCandidate(req, run, names, {
                values: Object.fromEntries(Object.entries(values).filter(([path]) => req.slots.some((slot) => slot.path === path))),
                groups: {}, imports, actions: [], note: "", flowChange: { reason, request }, errors: handOffRequestErrors(request),
            }),
        }),
        ask_user: tool({
            description: "Ask one short question when at least two real values in scope could fill a needed choice. When nothing in scope can fill it, call cannot_do instead.",
            inputSchema: z.object({
                question: z.string().describe("One short plain-language question with no code"),
                options: z.array(z.string()).min(2).max(4)
                    .describe("Values in scope to pick from, in plain words; never actions such as cancel, search or name them myself"),
            }),
            execute: async ({ question, options }) => {
                run.question = { text: question, options };
                return "Asked.";
            },
        }),
        cannot_do: groundedCannotDoTool(run, "Use when the request cannot work for this form: cite the compiler error, the missing name, or that it is not about this node."),
        explain: explainTool(run,
            "Only to say what this node or one of its current values means or does; it changes nothing. Never for what to add, change or suggest, even when asked as a question: submit those.",
            "One to three plain sentences; the first one answers the question asked, with no lead-in about what the node is. For \"explain this\", "
                + "what the node does and what its values are for; asked what is missing or what else fits, the likely additions. Name values by their labels; no code, types or module names", "submit_form"),
        ...lookupTools(req, run),
        ...(req.subjectRange ? { find_usages: usagesTool(req, req.subjectRange) } : {}),
    };
}

async function submitCandidate(req: FormAssistRequest, run: FormRunState, names: string[], candidate: FormCandidate): Promise<string> {
    candidate.values = mapValues(candidate.values, stripSemicolon);
    candidate.groups = mapValues(candidate.groups, (rows) => rows.map((row) => mapValues(row, stripSemicolon)));
    candidate.imports = candidateImports(allExpressions(candidate).join(" "), run, candidate.imports);
    const hints = await checkForm(req, candidate, names);
    // An empty submit would pass every check and end the run with nothing changed.
    if (!candidate.flowChange && Object.keys(candidate.values).length + Object.keys(candidate.groups).length + candidate.actions.length === 0) {
        candidate.errors.push("submit_form: nothing to change; send the values the request asks for");
    }
    const nameError = generatedNameError(req, run, candidate);
    if (nameError) {
        candidate.errors.push(nameError);
    }
    const groups = Object.keys(candidate.groups).length ? `, groups ${JSON.stringify(candidate.groups)}` : "";
    run.tries.push(`values ${JSON.stringify(candidate.values)}${groups}\n   errors: ${candidate.errors.join("; ") || "none"}`);
    // A flow change that failed on a value is still the right call; only its values need fixing.
    const next = candidate.flowChange
        ? "Call needs_flow_change again with these values fixed, or with none."
        : "Fix and submit again with every value, or call cannot_do if the form cannot hold what was asked.";
    return recordAttempt(run, candidate) ? "OK" : attemptFeedback(candidate.errors, hints, [next]);
}

// A new node's made-up name follows what the request says the node is for, and stays when it says nothing.
function generatedNameError(req: FormAssistRequest, run: FormRunState, candidate: FormCandidate): string | undefined {
    const slot = req.slots.find((known) => known.generatedName);
    if (!slot || candidate.flowChange || candidate.purpose === undefined) {
        return undefined;
    }
    const purpose = candidate.purpose.trim();
    const renamed = (candidate.values[slot.path] ?? slot.value) !== slot.value;
    if (purpose && !renamed && !run.askedName) {
        run.askedName = true;
        return `${slot.path}: the request says this is for "${purpose}", so replace the generated name ${slot.value} with a short name after those words`;
    }
    return !purpose && renamed ? `${slot.path}: the request does not say what this is for, so keep the name ${slot.value}` : undefined;
}

// A group's row written as a value is the usual slip, so the error says where rows go.
function unknownPathError(req: FormAssistRequest, path: string): string {
    const group = req.groups.find((known) => path.startsWith(known.id));
    return group
        ? `not a value; ${group.id} rows go in groups only, so leave this path out of values`
        : `no such value in this form; values take only ${req.slots.map((slot) => slot.path).join(", ") || "no paths here"}`;
}

// Checks every value with its own property into candidate.errors, each prefixed with where it is; returns the hints.
async function checkForm(req: FormAssistRequest, candidate: FormCandidate, names: string[]): Promise<string[]> {
    const checks: Promise<void>[] = [];
    const errors: string[] = [];
    const hints = new Set<string>();
    // A check the language server fails on leaves that value unchecked; it never fails the whole submit.
    const guarded = (where: string, pending: Promise<void>) => checks.push(pending.catch((failure) => {
        console.warn(`[ExpressionAssist] could not check ${where}`, failure);
    }));
    // `set` takes the value back when the check quoted plain text the model left bare.
    const check = (where: string, property: ExpressionProperty, expression: string, set: (value: string) => void) => {
        const kind = (property.types?.find((type) => type.selected) ?? property.types?.[0])?.fieldType;
        if (!expression.trim()) {
            return;
        }
        if (kind === "TYPE") {
            // A type has no plain-text or keyword fallback, so it skips checkValue.
            guarded(where, checkExpression(siteFor(req, property), expression, candidate.imports)
                .then((found) => { errors.push(...found.map((error) => `${where}: ${error}`)); }));
        } else if (kind === "IDENTIFIER") {
            if (!IDENTIFIER.test(expression)) {
                errors.push(`${where}: a name has letters, digits and _ only`);
                return;
            }
            // The language server also rejects keywords and names already in use, as the name field does.
            guarded(where, checkExpression(siteFor(req, property), expression, {})
                .then((found) => { errors.push(...found.map((error) => `${where}: ${error}`)); }));
        } else if (kind === "SINGLE_SELECT" || kind === "FLAG") {
            const allowed = choices(property);
            if (allowed.length && !allowed.includes(expression)) {
                errors.push(`${where}: must be one of ${allowed.join(", ")}`);
            }
        } else if (kind !== "STRING") {
            guarded(where, checkValue(siteFor(req, property), expression, candidate.imports, names).then((checked) => {
                set(checked.expression);
                errors.push(...checked.errors.map((error) => `${where}: ${error}`));
                checked.hints.forEach((hint) => hints.add(hint));
            }));
        }
    };
    for (const [path, expression] of Object.entries(candidate.values)) {
        const slot = req.slots.find((known) => known.path === path);
        if (slot) {
            check(path, slotProperty(req, candidate.values, slot), expression, (value) => { candidate.values[path] = value; });
        } else {
            errors.push(`${path}: ${unknownPathError(req, path)}`);
        }
    }
    // A list offered both whole and as rows takes one of the two.
    Object.keys(candidate.groups).filter((id) => candidate.values[`properties.${id}`]?.trim())
        .forEach((id) => errors.push(`${id}: set properties.${id} as one value or the ${id} rows, not both; leave the rows out when a variable holds the list`));
    // The form can't be saved with a required value empty, so a submit that leaves one is not done, unless the chat takes the step over.
    req.slots.filter((slot) => !candidate.flowChange && !slot.optional && !slot.withheld && !slot.credential && !slot.value.trim() && !candidate.values[slot.path]?.trim())
        .forEach((slot) => errors.push(`${slot.path} (${slot.label}): needs a value`));
    for (const { id } of candidate.actions) {
        if (!req.actions?.some((action) => action.id === id)) {
            errors.push(`${id}: no such action in this form`);
        }
    }
    for (const [id, rows] of Object.entries(candidate.groups)) {
        const group = req.groups.find((known) => known.id === id);
        if (!group) {
            errors.push(`${id}: no such group in this form`);
            continue;
        }
        if (rows.length < group.min || (group.max !== undefined && rows.length > group.max)) {
            errors.push(`${id}: needs ${group.min} to ${group.max ?? "any number of"} rows, got ${rows.length}`);
        }
        // Names in a group are declared side by side, so Ballerina rejects a repeat.
        group.item.filter((field) => field.property.types?.[0]?.fieldType === "IDENTIFIER").forEach((field) => {
            const names = rows.map((row) => row[field.key]?.trim()).filter(Boolean);
            const repeated = [...new Set(names.filter((name, index) => names.indexOf(name) !== index))];
            if (repeated.length) {
                errors.push(`${id}: each row needs its own ${field.label.toLowerCase()}; repeated: ${repeated.join(", ")}`);
            }
        });
        rows.forEach((row, index) => group.item.forEach((field) => {
            const value = row[field.key] ?? "";
            if (!value.trim() && !field.property.optional) {
                errors.push(`${id}[${index + 1}].${field.key}: needs a value`);
            }
            const property = field.typeFrom ? ofType(field.property, row[field.typeFrom]) : field.property;
            check(`${id}[${index + 1}].${field.key}`, property, value, (checked) => { row[field.key] = checked; });
        }));
    }
    await Promise.all(checks);
    candidate.errors = errors;
    return [...hints];
}

// A value whose type another value in its row names, e.g. a field's default.
const ofType = (property: ExpressionProperty, ballerinaType = ""): ExpressionProperty =>
    ({ ...property, types: property.types.map((type) => ({ ...type, ballerinaType: ballerinaType.trim() || type.ballerinaType })) });

// A slot whose type another slot names takes the new value of that slot, else its current one.
const slotProperty = (req: FormAssistRequest, values: Record<string, string>, slot: FormAssistSlot): ExpressionProperty =>
    slot.typeFrom ? ofType(slot.property, values[slot.typeFrom] ?? req.slots.find((known) => known.path === slot.typeFrom)?.value) : slot.property;

function siteFor(req: FormAssistRequest, property: ExpressionProperty): AssistSite {
    return { filePath: req.filePath, context: { ...req.context, property } };
}

function allExpressions({ values, groups }: FormCandidate): string[] {
    return [...Object.values(values), ...Object.values(groups).flatMap((rows) => rows.flatMap(Object.values))];
}

function mapValues<T, U>(record: Record<string, T>, map: (value: T) => U): Record<string, U> {
    return Object.fromEntries(Object.entries(record).map(([key, value]) => [key, map(value)]));
}
