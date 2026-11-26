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

import { ExpressionAssistRequest, FormAssistGroup, FormAssistRequest, FormAssistSlot } from "@wso2/ballerina-core";
import { NIL_RULES } from "../agent/nil-rules";

const SURROUNDING_CODE_RULE = "The surrounding code marks where this value's node is, or where a new node goes. Only the if, else and loop blocks that contain the marker apply: their conditions say what is true where the value runs, so use them to make values and messages specific. Code elsewhere in the function is background; do not copy its values or messages.";

const CONDITION_RULE = `- A condition says when its branch runs. A request to act on a condition ("stop if X", "skip when X") makes the
  condition X itself; the action happens inside the branch.`;

// Language facts nearly every value needs; library functions are looked up with the tools instead.
const BALLERINA_REMINDERS = `Ballerina reminders:
- Field access: a.b.c.
${NIL_RULES}
- An optional list has no ?[ ]: default it, then guard the index: let var xs = a.list ?: [] in xs.length() > 0 ? xs[0] : ().
- Lang library methods are called on the value: s.trim(), s.length(), xs.length(), d.round(2), s.toUpperAscii().
  A method declared with no return type gives nil, so a call to it never yields the object it changed.
- Conversions such as int:fromString(s) return a value or an error; use check only if the expected type allows the error.
- Numbers do not mix: convert with <decimal>x, <int>x or <float>x. Every literal in a decimal expression needs d: 0.5d.
- Text values are string literals in double quotes. String templates: string \`Hello \${name}\`. a + b joins strings, never nil:
  write (x ?: "") for an optional string.
- Avoid runtime panics: guard substring lengths, list indexes and divisions with a condition.
- Conditional: c ? a : b. Equality: ==, !=. Logical: &&, ||, !.
- Errors are values: error("message") fits any expected type that includes error.
- A union of several records (or http status records) needs a cast to pick one: <T>{...}. Enum members are used by name.
- Records: {a: x, b: y}. Lists: [a, b]. Queries: from var x in xs where cond select expr. An aggregate takes a plain
  variable that the query binds: from var {v} in xs collect sum(v), or let decimal v = ... collect sum(v). A decimal
  avg or max can be nil; a float one cannot. A count: (from var x in xs where cond select x).length().
  A map from a list: map from var x in xs select [key, value].
- Join strings: string:'join(", ", ...xs). Text has no split or replaceAll method; use a regex: re \`,\`.split(s), re \`\\d\`.replaceAll(s, "*").
- json: field access returns json|error, an error when the key is missing; check fails the whole node on it. A json
  number may be an int, float or decimal: convert it with ensureType, never an is test: check (check j.amount).ensureType(decimal).
  To fall back when a key is missing, narrow instead: let json|error v = j.key in v is string ? v : "".
  ensureType takes no type with []; test those with is.
- Add a field to a json value: x is map<json> ? check x.clone().mergeJson({k: v}) : {value: x, k: v}. mergeJson changes
  its first value, so clone it first; never spread json.
- xml: (doc/<name>).data() is the text of an element.
- Library functions take a module prefix (time:utcNow()); add a module the file does not import to imports, e.g.
  {"time": "ballerina/time"}. Never guess a library function: find it with search_functions (one or two keywords, at
  most two searches) and read it with function_docs. Methods on a value are not in search_functions: value_methods
  lists what can be called on a value. type_info
  shows a record's fields, or how a class is made and its methods.`;

// Rules both the field and the form Copilot follow; each prompt adds only its own output rules.
const sharedRules = (submit: string, noteWords: number) => `- Use only the values listed as in scope, literals, and library functions.
- ${submit} compiles what you send and returns the errors. Fix them and submit again. Never give up after one error.
- Compiling is not enough: check that every value does exactly what was asked (no always-true or always-false parts).
- ${SURROUNDING_CODE_RULE}
- When refining, keep what the user did not ask to change.
- Use exactly the data the request names. When it gives a fallback for a missing value, use that fallback; never
  another field in its place.
- Never write a key, password or token into a value or a note.
- Call create_configurable when the user asks for a configurable, or to move a value out of the code. Set
  useFieldValue when the value has a current one to keep, including one marked withheld.
- The note is one short plain-language sentence for a non-programmer (max ${noteWords} words), with no type or code names.`;

// When to ask instead of guessing; `changes` is what a wrong guess would change, e.g. "the value".
const askRule = (changes: string) => `ask_user when the request leaves open a choice that changes ${changes}: it names a kind of value
  (a configurable, a variable, a field) and two or more in scope are of that kind, with nothing in the request, the node
  or the other values that picks one. Ask one short question with 2 to 4 plain answers, each one of those values. Never
  pick one of them by its name alone. When the request or the context picks one, take it.`;

// The user's answer to a question Copilot asked; the same words for the field and the form.
const askedLine = (asked?: string) => (asked ? `You asked the user: ${asked}\nThe latest message is their answer.` : "");

export const SYSTEM_PROMPT = `You write one Ballerina expression for a single field in a low-code integration editor.

How to answer:
- Read the request, the node, the surrounding code, the form's other fields and what is in scope to judge what the value is for.
- Read the expected type first: it decides what a value can be. A record is built with a literal; a class or object is
  made with new and changed through its methods, so no literal builds it.
- A request for a value is answered with submit: one expression of the expected type; no statements, no semicolon, no
  variable declaration, no markdown. A request for a suggestion gets the most likely value from the context.
- Call explain only when the request asks what the field or its value means; it changes nothing.
- Call a hand-off tool, when one is offered, when the request needs more than this one value; the task's notes say when.
- Call ${askRule("the value")}
- Call cannot_do only when no value for this field can do what was asked and no hand-off fits: the request is not about
  this value, names a field or function the types do not have, or a submit failed in a way no value can fix.
- When fixing, change as little as possible, but complete an unfinished value to fit what the form is for.
- An explain answer opens with the answer itself, never with what the node is. Give a default only when a type or
  doc you read states it.
${CONDITION_RULE}
${sharedRules("submit", 12)}

${BALLERINA_REMINDERS}`;

export const FORM_SYSTEM_PROMPT = `You fill in a whole form in a low-code integration editor. Every value is one Ballerina expression,
except one marked "name" (a bare identifier) or "type" (a type descriptor such as string, decimal? or T[]).

What this form can do:
- Values: call submit_form with the values to set (by path) and the full new row list of every repeatable group you
  change. Leave out values and groups that stay as they are. Each value is one expression of its own expected type: no
  statements, no semicolon, no markdown.
- Groups: add or remove rows as the request needs, within each group's limits and description. Keep existing rows in
  order; new rows go after them unless the request says where. A toggle group (an else or default branch) has rows of
  no fields: [{}] turns it on, [] turns it off. Conditions in a row list must not overlap or repeat.
- Actions open another form for what this form cannot hold. To use one, list it in actions with a request saying what
  to fill there. A request to add something an action offers uses that action; never change an existing value to
  stand in for a new one.

Choose one outcome, and end with exactly one of submit_form, explain, ask_user, needs_flow_change or cannot_do:
- A request about this node's values is a change, also when it is asked as a question or asks for suggestions: submit
  it; the user reviews it before it applies.
- A question about what this node or its values mean or do is answered with explain, even while changes are proposed.
  Where this node is used, or what triggers it, is about this node too: call find_usages first when it is offered.
- A change this flow can make outside this node's values goes to needs_flow_change, never cannot_do: a new or moved
  node, an If around this node, a required value that nothing in scope can be and no sample can stand in for, or an
  error that is not about this form's values.
- Compare the action the request asks for with what this node does. An action this node does not perform (sending,
  posting, logging, notifying, storing, calling a service) or a change to when the flow runs (skip, stop, only for,
  retry) needs a new node or an If, whatever this node is: call needs_flow_change. Holding the value that action uses
  is not the action; fill this node's value only when the request says what the node itself holds. A node that ends the
  flow (Fail, Panic, Return) runs whenever it is reached, so a condition on it means an If around it; its value holds
  only what it returns or fails with. Pass the values this form should hold with the hand-off.
- ${askRule("what the node does")}
- cannot_do only when no change to this form or the flow can do what was asked, such as a question about anything
  other than this node and its values; the reason names what this form can change.

Filling values:
- "Fill this form" fills every empty required value, and an optional one the node is pointless without: a value in
  scope of the right type when one fits, otherwise a realistic sample, listed in samples. In sources, say where each
  value taken from the code or scope comes from.
- A credential (a key, token or password) never gets a sample or placeholder: use a configurable or variable in scope
  made for this form's own service, or a new one from create_configurable when the request asks for it; else leave it
  empty and say in the note that it still needs to be entered. A missing credential is never a flow change.
- When a list or map can be set as one value or as a group, and a variable in scope already holds it, set the value to
  that variable and leave the group out.
- A generated or default name is renamed only when the request says what the node is for; a request that only sets
  other values keeps it. With a name marked (generated), set purpose.
- Carry out the whole request in one submit. A part with no value of its own may live in a value's text, such as an
  output format in an agent's Instructions. A part no value here can hold but the project can make (a new store,
  connection or node, or a setting that lives on something this form only picks) goes to needs_flow_change with the
  values this form should hold. skipped is only for a part nothing in the project can do; never fill a value the
  request did not ask for.
- When current errors are listed, a request to fix them clears each one in this form's values, changing as little as possible.

Words the user sees:
- The note describes only what this call changes.
- Reasons, notes and requests use plain words, never a type, module or node kind; call it a node, never a step.
- A needs_flow_change request is what the user would type to get that change: one or two imperative sentences that
  name the node or agent it changes; it never mentions this form, Copilot or the user, and never advises or asks.
- An explain answer opens with the answer itself, never with what the node is. Give a default only when a type or
  doc you read states it.
${CONDITION_RULE}
${sharedRules("submit_form", 15)}

${BALLERINA_REMINDERS}`;

// Marks where the field's node is in the surrounding code: an existing statement right after it, or a new one added there.
export const NODE_MARKER = "/* <-- this value's node */";
export const NEW_NODE_MARKER = "/* the new node goes here */";

export interface Enclosing {
    signature: string;
    code: string;
}

// A flow function this short goes in whole; a longer one only around the field, so the prompt stays small.
const CODE_LINE_LIMIT = 80;
const CODE_WINDOW = 25;

/** A function's source starting at `firstLine`, with the marker at `at`; empty when `at` is outside it. */
export function markNode(source: string, firstLine: number, at: { line: number; offset: number }): string {
    const lines = source.replace(/\s+$/, "").split(/\r?\n/);
    let index = at.line - firstLine;
    if (index < 0 || index >= lines.length) {
        return "";
    }
    const before = lines[index].padEnd(at.offset).slice(0, at.offset);
    const after = lines[index].slice(at.offset);
    const newNode = `${before.slice(0, before.length - before.trimStart().length)}${NEW_NODE_MARKER}`;
    if (after.trim()) {
        lines[index] = `${before}${NODE_MARKER} ${after}`.trimEnd();
    } else if (before.trim()) {
        // A new node's position is the end of the statement before it, so it gets a line of its own.
        lines.splice(++index, 0, newNode);
    } else {
        lines[index] = newNode;
    }
    if (lines.length <= CODE_LINE_LIMIT) {
        return lines.join("\n");
    }
    const from = Math.max(1, index - CODE_WINDOW);
    const to = Math.min(lines.length, index + CODE_WINDOW + 1);
    return [lines[0], from > 1 ? "    ..." : "", ...lines.slice(from, to), to < lines.length ? "    ..." : ""].filter(Boolean).join("\n");
}

// Sent only with the form's other parts, so requests that cannot hand over never read it.
const OTHER_FIELDS_RULE = "If the request needs any of these parts (a branch, case or row, an else or default, a name or type elsewhere), call edit_other_fields right away instead of submitting, even when this value itself stays the same. Never fold another part's job into this value. Only the parts listed here count: code that must run before this node is not one of them.";

// Sent only when the main Copilot can take a change, so a field with no way out never reads it.
const FLOW_CHANGE_RULE = "If part of the request needs more than this value can do, call needs_flow_change for that part: code to run before this node (a new node, a variable that does not exist yet, or a value of a class that only its methods can fill), an action this node does not perform (sending, posting, logging, notifying, storing, calling a service), or a change to when the flow runs (skip, stop, only for, retry). When the request also says what this field holds, pass that value with it. Its reason says in plain words what has to happen outside this field; its request names the node and what it does. A value one expression can build, however long, is submitted.";

const VARIABLE_TARGET_RULE = "This field names the variable to change: a variable in scope or a field of one, never a computed value.";

const PROMPT_FIELD_RULE = "This field is a prompt: write a bare backtick template with no string tag, e.g. `Summarize this: ${input}`. ai:Prompt is the template's own type; never look it up.";

// A prompt typed string, e.g. an agent's role, takes a string template; a bare one is only an ai:Prompt.
const STRING_PROMPT = "a prompt: a string template, e.g. string `Summarize this: ${input}`";
const isStringPrompt = (type?: { fieldType?: string; ballerinaType?: string }) => type?.fieldType === "PROMPT" && type.ballerinaType === "string";

const selectedType = (property: ExpressionAssistRequest["context"]["property"]) =>
    property.types?.find((type) => type.selected) ?? property.types?.[0];

export const selectedKind = (property: ExpressionAssistRequest["context"]["property"]) => selectedType(property)?.fieldType;

const promptFieldRule = (property: ExpressionAssistRequest["context"]["property"]) =>
    isStringPrompt(selectedType(property)) ? `This field is ${STRING_PROMPT}.` : PROMPT_FIELD_RULE;

const namesVariable = (property: ExpressionAssistRequest["context"]["property"]) => selectedKind(property) === "LV_EXPRESSION";

export function buildUserPrompt(req: ExpressionAssistRequest, scope: string, expectedType: string, errors: string[], enclosing: Enclosing): string {
    const value = req.context.expression.trim();
    const otherFields = req.form?.fields ?? [];
    const context = [
        req.form?.node ? `Node: ${req.form.node}` : "",
        enclosing.code ? `Surrounding code:\n${enclosing.code}` : enclosing.signature ? `Inside: ${enclosing.signature}` : "",
        otherFields.length ? `Other fields in this form:\n${otherFields.map(({ label, value }) => `- ${label}: ${value}`).join("\n")}` : "",
        req.formParts?.length ? `Other parts of this form:\n${req.formParts.map((part) => `- ${part}`).join("\n")}\n${OTHER_FIELDS_RULE}` : "",
        req.canChangeFlow ? FLOW_CHANGE_RULE : "",
        `Field: ${req.field.label}`,
        req.field.description ? `Description: ${req.field.description}` : "",
        `Expected type: ${expectedType || "any"}`,
        namesVariable(req.context.property) ? VARIABLE_TARGET_RULE : "",
        selectedKind(req.context.property) === "PROMPT" ? promptFieldRule(req.context.property) : "",
        listedValues(req.context.property).length ? `Allowed values, written exactly so; any other is rejected: ${listedValues(req.context.property).join(" | ")}` : "",
        `Current value: ${req.valueWithheld ? "(withheld: it looks like a secret, so it is not shown)" : value || "(empty)"}`,
        errors.length ? `Current errors:\n${errors.map((e) => `- ${e}`).join("\n")}` : "",
        `In scope:\n${scope || "(nothing)"}`,
        req.earlier?.length ? `Earlier requests for this field, oldest first (the current value includes their changes):\n${req.earlier.map((text, index) => `${index + 1}. ${text.trim()}`).join("\n")}` : "",
        askedLine(req.asked),
    ].filter(Boolean).join("\n");
    return `${context}\n\n${taskLine(req, value)}`;
}

function taskLine(req: ExpressionAssistRequest, value: string): string {
    const instruction = req.instruction?.trim();
    if (req.mode === "fix") {
        return `Task: fix the current value so it compiles${instruction ? `. Also: ${instruction}` : ""}.`;
    }
    if (req.mode === "refine" && (value || req.valueWithheld)) {
        return `Task: change the current value as follows: ${instruction}`;
    }
    return `Task: write a value for this field: ${instruction}`;
}

// The names listed in scope, e.g. `'order` for a parameter named with a keyword.
export function scopeNames(scope: string): string[] {
    return [...scope.matchAll(/^- ([^:\s]+):/gm)].map((match) => match[1]);
}

// Plain text the model forgot to quote (0.0.0.0, localhost); never code, nor text that starts with a value in scope.
export function looksLikePlainText(text: string, names: string[]): boolean {
    return !/["`(){}[\]+=?]/.test(text) && !names.some((name) => text.startsWith(`${name.replace(/^'/, "")}.`));
}

// `order` is a keyword, so a parameter named 'order keeps its quote wherever it is used.
export function keywordHints(expression: string, names: string[]): string[] {
    return names.filter((name) => name.startsWith("'") && new RegExp(`(^|[^'\\w])${name.slice(1)}\\.`).test(expression))
        .map((name) => `Hint: ${name.slice(1)} is a keyword; write ${name} with its quote, e.g. ${name}.id.`);
}

const MAPPING_CASCADE = /type compatible with mapping constructor expressions not found/;

// A field that fails inside `{...}` also fails the whole mapping; only the field's own error says what to fix.
export function withoutCascades(errors: string[]): string[] {
    const own = errors.filter((error) => !MAPPING_CASCADE.test(error));
    return own.length ? own : errors;
}

// `acme/order_hub:0.1.0:Customer` reads as `Customer` in its own package, and `ballerinax/trigger.github:1.0.0:Issue` as
// `github:Issue`: the org and version only cost tokens, and a library type needs its module prefix in code.
export function shortTypeNames(type: string, home = ""): string {
    return type.replace(/\b([\w.-]+\/([\w.]+)):[\w.-]+:(\w+)/g, (_, module: string, name: string, typeName: string) =>
        module === home ? typeName : `${name.split(".").pop()}:${typeName}`);
}

// The language server lists the type first, then each record it reaches, every one followed by indented field docs.
// Record lines go in before any docs, so a long description loses docs first and never ends mid-record.
export function fitTypeDescription(text: string, limit: number): string {
    const [[main, ...mainDocs], ...nested] = text.split(/\r?\n(?=\S)/).map((block) => block.split(/\r?\n/));
    if (main.length > limit) {
        return `${main.slice(0, main.lastIndexOf(";", limit) + 1)} …`;
    }
    let room = limit - main.length;
    const take = (line: string): boolean => {
        if (line.length >= room) {
            return false;
        }
        room -= line.length + 1;
        return true;
    };
    const records = [[main, ...mainDocs], ...nested.filter(([head]) => take(head))];
    return records.map(([head, ...docs]) => [head, ...docs.filter(take)].join("\n")).join("\n");
}

const IDENTIFIER = /^'?[A-Za-z_]\w*$/;

// Whether a refusal cites something the run saw: a compiler error it got, or a name no type it read declares.
export function isGrounded(run: { errorsSeen: string[]; seen: string[] }, evidence: string, cites: string): boolean {
    const cited = cites.replace(/^-\s*/, "");
    if (evidence === "compiler_error") {
        return cited.length >= 10 && run.errorsSeen.some((error) => error.includes(cited) || cited.includes(error));
    }
    if (evidence === "missing_name") {
        const names = codeNames(cited);
        return names.length > 0 && !run.seen.some((text) => names.some((name) => declares(text, name)));
    }
    return evidence === "off_topic";
}

// A cited name as code would spell it: `email` as is, `credit card number` as credit_card_number and creditCardNumber.
// shortcut: a phrase whose words exist only apart (login, id for "login id") passes; check each word if refusals get invented.
function codeNames(cited: string): string[] {
    const words = cited.replace(/^'/, "").split(/[\s_-]+/).filter((word) => /^[A-Za-z]\w*$/.test(word));
    const camel = words.map((word, index) => index ? word[0].toUpperCase() + word.slice(1) : word.toLowerCase()).join("");
    return words.length && words.length <= 4 ? [...new Set([words.join("_").toLowerCase(), camel])].filter((name) => IDENTIFIER.test(name)) : [];
}

// Declared as a record field (`name?;`), a value in scope (`name: type`) or a function (`name(`).
const declares = (text: string, name: string): boolean => new RegExp(`(^|[^\\w'])'?${name}\\??(;|: |\\()`, "m").test(text);

export const PARSE_ERROR = /invalid token|missing .* token/;
const PARSE_CONTEXT = 20;

// A parse error's range points into the expression; the text before it finds the spot, which the model cannot count to.
export function locateParseError(message: string, start: { line: number; character: number } | undefined, expression: string): string {
    if (!start || !PARSE_ERROR.test(message)) {
        return message;
    }
    const at = expression.split("\n").slice(0, start.line).reduce((offset, line) => offset + line.length + 1, start.character);
    const before = expression.slice(Math.max(0, at - PARSE_CONTEXT), at);
    return before.trim() ? `${message} after '${at > PARSE_CONTEXT ? "…" : ""}${before}'` : message;
}

const SPAN_LIMIT = 80;
const OPENERS: Record<string, string> = { "(": ")", "[": "]", "{": "}", "${": "}" };
const NIL_DEFAULTS: Record<string, string> = { string: "\"\"", int: "0", decimal: "0d", float: "0.0", boolean: "false" };

type Position = { line: number; character: number };
export interface CompileDiagnostic {
    message: string;
    code?: string | number;
    range?: { start: Position; end: Position };
}

// One compiler error as the model reads it: what is wrong, the code it is in, and the fix for that code when one is known.
export function describeDiagnostic({ message, code, range }: CompileDiagnostic, expression: string): { error: string; hint?: string } {
    const offset = (at: Position) => expression.split("\n").slice(0, at.line).reduce((sum, line) => sum + line.length + 1, at.character);
    const span = range ? expression.slice(offset(range.start), offset(range.end)).trim() : "";
    const located = span && span.length <= SPAN_LIMIT ? `${message} at \`${span}\`` : locateParseError(message, range?.start, expression);
    return { error: located, hint: span ? diagnosticFix(String(code ?? ""), message, span) : undefined };
}

const nilDefault = (type: string): string => NIL_DEFAULTS[type.replace(/\?$/, "")] ?? "a default";
const optionalAccess = (span: string, why: string): string => `Write ${span.replace(/(?<!\?)\.(?=[^.]*$)/, "?.")}: ${why}, so read it `
    + "and every field after it with ?., and default the result with ?: where a value is needed. A != () or is check does not narrow a field access.";
const leftOfDefault = (span: string): string => span.replace(/\s*\?:[\s\S]*$/, "");

// `a + b` where one side can be nil: the last operator splits the span, and the nilable side gets the default.
function nilOperand(span: string, [, operator, left, right]: RegExpMatchArray): string | undefined {
    const at = span.lastIndexOf(` ${operator} `);
    const [side, type] = right.endsWith("?") ? [span.slice(at + operator.length + 2), right] : [span.slice(0, at), left];
    return at > 0 && type.endsWith("?") ? `${side} can be nil: write (${side} ?: ${nilDefault(type)}).` : undefined;
}

// Fixes written out for the code at fault, keyed by diagnostic code; the general hints cover what these cannot name.
const DIAGNOSTIC_FIXES: { code: string; message?: RegExp; fix: (span: string, match: RegExpMatchArray) => string | undefined }[] = [
    { code: "BCE2118", fix: (span) => optionalAccess(span, "that field is optional and can be nil") },
    { code: "BCE2556", message: /'[^']*\?' does not support/, fix: (span) => optionalAccess(span, "the value before the last dot can be nil") },
    { code: "BCE2066", message: /expected '(\w+)', found '\1\?'/, fix: (span, [, type]) => `${span} can be nil: write (${span} ?: ${nilDefault(type)}).` },
    { code: "BCE2066", message: /expected '(\w+)', found '[^']*json[^']*'/,
        fix: (span, [, type]) => `${span} is json: narrow it, e.g. let json|error value = ${span.replace(/^check\s+/, "")} in value is ${type} ? value : ${nilDefault(type)}.` },
    { code: "BCE2066", message: /found '\(.*\|error\)'/, fix: (span) => `${span} can also be an error: write check ${span}, or narrow it with is first.` },
    { code: "BCE2642", message: /type '[^']*error[^']*'/, fix: (span) => `${leftOfDefault(span)} can be an error but never nil: drop the ?: default, and use check or narrow it with is.` },
    { code: "BCE2642", fix: (span) => `${leftOfDefault(span)} is never nil, so drop the ?: default.` },
    { code: "BCE2070", message: /operator '([^']+)' not defined for '([^']*)' and '([^']*)'/, fix: nilOperand },
];

function diagnosticFix(code: string, message: string, span: string): string | undefined {
    for (const entry of DIAGNOSTIC_FIXES.filter((known) => known.code === code)) {
        const match = entry.message ? message.match(entry.message) : [message];
        if (match) {
            return entry.fix(span, match as RegExpMatchArray);
        }
    }
    return undefined;
}

type Opened = { token: string; at: number };

// The language server reports a stray or missing bracket as a bad token somewhere later; this names the bracket itself.
export function unmatchedBracket(expression: string): string | undefined {
    const open: Opened[] = [];
    for (let at = 0; at < expression.length; at++) {
        const char = expression[at];
        const inside = open[open.length - 1]?.token;
        if (inside === "\"" || inside === "`") {
            at = readText(expression, at, inside, open);
        } else if (char === "\"" || char === "`" || OPENERS[char]) {
            open.push({ token: char, at });
        } else if (")]}".includes(char)) {
            if (OPENERS[inside ?? ""] !== char) {
                return `'${char}'${textBefore(expression, at)} has no opening bracket`;
            }
            open.pop();
        }
    }
    return neverClosed(expression, open);
}

// Inside a string or template: an escape skips a character, the closing quote ends it, and ${ opens code. Returns where to go on from.
function readText(expression: string, at: number, quote: string, open: Opened[]): number {
    if (quote === "\"" && expression[at] === "\\") {
        return at + 1;
    }
    if (expression[at] === quote) {
        open.pop();
    } else if (quote === "`" && expression.startsWith("${", at)) {
        open.push({ token: "${", at });
        return at + 1;
    }
    return at;
}

function neverClosed(expression: string, open: Opened[]): string | undefined {
    let unclosed = open.pop();
    // A template's closing backtick inside an open ${ reads as a new template; the ${ is the one left open.
    if (unclosed?.token === "`" && open[open.length - 1]?.token === "${") {
        unclosed = open.pop();
    }
    return unclosed && `'${unclosed.token}'${textBefore(expression, unclosed.at)} is never closed`;
}

const textBefore = (expression: string, at: number): string => {
    const before = expression.slice(Math.max(0, at - PARSE_CONTEXT), at);
    return before.trim() ? ` after '${at > PARSE_CONTEXT ? "…" : ""}${before}'` : " at the start";
};

// Hints for compiler errors Haiku tends to repeat; matched against each error of a failed submit.
export const ERROR_HINTS: { test: RegExp; hint: string }[] = [
    { test: /'decimal' and 'float'|'float' and 'decimal'/, hint: "Mixing decimal and float: write decimal literals with d (0.5d) or cast with <decimal>." },
    { test: /'decimal' and 'int'|'int' and 'decimal'/, hint: "Mixing decimal and int: cast the int with <decimal>." },
    { test: /undefined function 'join'/, hint: "Join with string:'join(\", \", ...parts)." },
    { test: /undefined (function|method) '\w+' in type 'map</, hint: "A map has no merge or set function: build a new mapping with spread, {...m, key: value}; narrow json first with m is map<json>." },
    { test: /invalid usage of record literal with type/, hint: "This type is not a record, so a {...} literal cannot make it; read how it is made with type_info." },
    { test: /undefined (function|method) '\w+' in type/, hint: "That method does not exist on this type; use search_functions or a lang library function instead." },
    { test: /more clauses after select|sequence variable|'seq [^']*' does not support field access|undefined function 'sum'/, hint: "A query ends with select or collect, not both, and an aggregate takes a plain variable the query binds: from var {v} in xs collect sum(v)." },
    { test: /'[^']*\?' does not support field access/, hint: "That value can be nil, so read its fields with ?.; a != () or is check does not narrow a field access. To use it only when present, bind it first with let and test the variable." },
    { test: /operator .* not defined for .*\?'/, hint: "An optional value can be nil: default it before combining, e.g. (x ?: \"\"). A != () check narrows only a local variable, not a field access." },
    { test: /'[^']*\?' does not support (member|optional field) access|missing colon token/, hint: "Ballerina has no ?[ ] or ?.[ ], and an is check does not narrow a field access. Default the optional list, then guard the index." },
    { test: /invalid token '[)\]}]' after/, hint: "That closing bracket has no opening one: delete the one right after the quoted text, or rewrite the value without the extra brackets." },
    { test: /invalid token|missing .* token/, hint: "This does not parse: check brackets, commas and backticks. Plain text needs double quotes." },
    { test: /expected '\(int\|float\|decimal\|string\|boolean\)', found '[^']*\?'/, hint: "A ${...} in a string template cannot hold nil: default it inside, e.g. ${x ?: \"\"}, reading optional fields with ?." },
    { test: /type compatible with mapping constructor expressions not found/, hint: "Either a value inside {...} can still be an error (narrow it, or use check), or ...x spreads a value that is not a mapping. To add a field to a json value use x is map<json> ? x.clone().mergeJson({k: v}) : {value: x, k: v}." },
    { test: /incompatible mapping constructor/, hint: "Cast the mapping to the record you mean: <T>{...}." },
    { test: /expected '(ai:)?Prompt', found 'string'/, hint: "A prompt is a bare backtick template, with no string tag in front." },
    { test: /expected '[^']*error[^']*', found '\(error\|\(\)\)'|found '\(\(\)\|error\)'/, hint: "A value that is an error only sometimes needs an If around the node instead; set the error alone." },
    { test: /redeclared symbol|already (defined|declared)/, hint: "That name is already in use here. Pick a different, descriptive name and submit again; a taken name is never a reason for cannot_do." },
];

// A form's values and groups as the model reads them; the declared type stands in, and type_info expands a record.
export function buildFormPrompt(req: FormAssistRequest, scope: string, enclosing: Enclosing, records: Record<string, string> = {}): string {
    const context = [
        `Node: ${req.node}`,
        req.agent ? `The form belongs to this agent. Fit the values to it: a tool's description says when the agent calls it, and its Instructions name the tools it uses. Node says which part of the agent this form sets: a request about that part fills this form; a request about another part (another tool, its memory, its model provider, a trigger) is a flow change on this agent. The agent below is as saved; where this form's values differ, they are newer and win.\n${req.agent}` : "",
        req.focus ? `Asked from the field: ${req.focus.label} (${req.focus.key}). It tells you what "this" refers to; it does not need to change. Change only what the request asks for and keep every other value as it is.` : "",
        askedLine(req.asked),
        req.errors?.length ? `Current errors:\n${req.errors.map((error) => `- ${error}`).join("\n")}` : "",
        req.pending && req.focus ? `Suggested so far for ${req.focus.label}, not applied: ${req.pending}\nIt may have combined ${req.focus.label}'s current value with the new check. If the task moves it elsewhere, e.g. into a new branch, take only what the earlier request added, and keep ${req.focus.label} as it was.` : "",
        enclosing.code ? `Surrounding code, as saved (where it differs from the Values below, the values are the form's newer state and win):\n${enclosing.code}` : enclosing.signature ? `Inside: ${enclosing.signature}` : "",
        req.slots.length ? `Values:\n${req.slots.map((slot) => slotLine(slot, records[slot.path])).join("\n")}` : "",
        req.groups.length ? `Repeatable groups:\n${req.groups.map(groupLines).join("\n")}` : "",
        req.shown?.length ? `Also on this form, read-only here (answer questions about them; a request to change them is a flow change):\n${req.shown.map((line) => `- ${line}`).join("\n")}` : "",
        req.actions?.length ? `Actions:\n${req.actions.map((action) => `- ${action.id} (${action.label}): ${action.description}`).join("\n")}` : "",
        `In scope:\n${scope || "(nothing)"}`,
    ].filter(Boolean).join("\n");
    return `${context}\n\n${formTask(req)}`;
}

// A follow-up like "as a new else-if" only makes sense with the messages before it; only the latest still needs an answer.
function formTask(req: FormAssistRequest): string {
    if (!req.earlier?.length) {
        return `Task: ${req.instruction.trim()}`;
    }
    const earlier = req.earlier.map((text, index) => `${index + 1}. ${text.trim()}`).join("\n");
    return `Earlier messages (the values above include the changes they made, except those marked (not done) or (explained, nothing changed)):\n${earlier}\n\n`
        + `Task, the latest message (it may refine the earlier ones): ${req.instruction.trim()}`;
}

// `record` is the language server's view of a record slot's fields, indented under its line.
function slotLine(slot: FormAssistSlot, record?: string): string {
    const about = slot.description ? ` — ${slot.description}` : "";
    const value = slot.withheld ? "(withheld: it has a secret value; keep it unless asked)"
        : slot.value || (slot.credential ? "(empty credential: leave it for the user unless a value in scope holds it)" : "(empty)");
    const type = slot.typeFrom ? `a value of the type in ${slot.typeFrom}; when the request needs another type, set ${slot.typeFrom} too`
        : record?.replace(/\n/g, "\n    ") ?? declaredType(slot.property);
    const previous = slot.previous !== undefined ? ` (before this thread: ${slot.previous || "(empty)"})` : "";
    const generated = slot.generatedName ? " (generated, not chosen by the user)" : "";
    return `- ${slot.path} (${slot.label}${slot.optional ? ", optional" : ""}): ${type} = ${value}${generated}${previous}${onlyWhen(slot.when)}${picks(slot.property)}${about}`;
}

// A value that picks a project item, e.g. a memory store: only an existing one fits here.
const picks = (property: FormAssistSlot["property"]): string => {
    const kind = (property.codedata as { searchNodesKind?: string } | undefined)?.searchNodesKind;
    const item = kind === "NEW_CONNECTION" ? "connection" : kind?.toLowerCase().replace(/_/g, " ");
    return item ? ` (picks an existing ${item}; a new one, or a change to its own settings, is made outside this form)` : "";
};

const onlyWhen = (when?: FormAssistSlot["when"]): string => when?.length
    ? ` (only when ${when.map(({ path, values }) => `${path} is ${values.map((option) => JSON.stringify(option)).join(" or ")}`).join(" and ")})`
    : "";

function groupLines(group: FormAssistGroup): string {
    const about = group.description ? ` ${group.description}` : "";
    if (group.item.length === 0) {
        return `- ${group.id} (${group.label}): toggle, now ${group.rows.length ? "on" : "off"}.${about}`;
    }
    const limits = `${group.min}..${group.max ?? "n"} rows`;
    const fields = group.item.map((field) => `${field.key} (${field.label}${field.property.optional ? ", optional" : ""}): ${field.typeFrom ? `a value of the row's ${field.typeFrom}` : declaredType(field.property)}`).join(", ");
    const rows = group.rows.map((row, index) => `    ${index + 1}. ${JSON.stringify(row)}`);
    const append = group.rows.length ? `    A new row goes after row ${group.rows.length} unless the request names a position.` : "";
    return [`- ${group.id} (${group.label}, ${limits})${onlyWhen(group.when)}; each row: ${fields}.${about}`, ...rows, append].filter(Boolean).join("\n");
}

// The values a select or a toggle accepts; empty when the select lists none.
export function choices(property: FormAssistSlot["property"]): string[] {
    const type = property.types?.find((option) => option.selected) ?? property.types?.[0];
    if (type?.fieldType === "FLAG") {
        return ["true", "false"];
    }
    return (type as { options?: { value: string }[] } | undefined)?.options?.map((option) => option.value) ?? [];
}

// A select or a toggle with no expression mode takes nothing but its listed values.
export const fixedChoices = (property: FormAssistSlot["property"]): string[] =>
    property.types?.some((type) => type.fieldType === "EXPRESSION") ? [] : choices(property);

const KIND_NAMES: Record<string, string> = {
    IDENTIFIER: "name",
    TYPE: "type",
    STRING: "plain text, written as is without quotes",
    LV_EXPRESSION: "the variable to change, e.g. x or x.field",
    PROMPT: "a prompt: a bare backtick template with no string tag, e.g. `Summarize this: ${input}`",
    SQL_QUERY: "a SQL query: a bare backtick template with no tag, values as ${...} parameters, e.g. `SELECT * FROM t WHERE id = ${id}`",
};

// The values a field's select lists, also when the field is in its expression mode, e.g. a connector's model names.
export function listedValues(property: FormAssistSlot["property"]): string[] {
    return [...new Set((property.types ?? []).flatMap((type) => (type as { options?: { value: string }[] }).options?.map((option) => option.value) ?? []))];
}

export function declaredType(property: FormAssistSlot["property"]): string {
    const type = property.types?.find((option) => option.selected) ?? property.types?.[0];
    const allowed = choices(property);
    if (allowed.length) {
        return `one of ${allowed.map((value) => JSON.stringify(value)).join(" | ")}, written bare`;
    }
    const base = (isStringPrompt(type) ? STRING_PROMPT : KIND_NAMES[type?.fieldType ?? ""]) ?? (type?.ballerinaType || "any");
    const listed = listedValues(property);
    return listed.length ? `${base}, one of ${listed.join(" | ")} written exactly so` : base;
}
