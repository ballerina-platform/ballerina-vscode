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

const SURROUNDING_CODE_RULE = "The surrounding code marks where this value's node is, or where a new node goes. Only the if, else and loop blocks that contain the marker apply: use their conditions to make values and messages specific (inside if items.length() == 0, an error says there are no items). Code elsewhere in the function is background; do not copy its values or messages.";

const CONDITION_RULE = `- A condition says when its branch runs. "Stop if X", "return if X" or "skip when X" make the condition X itself,
  e.g. "stop if there are no orders" is orders.length() == 0; the stopping happens inside the branch.`;

const BALLERINA_REMINDERS = `Ballerina reminders:
- Field access: order.customer.name.
${NIL_RULES}
- An optional list has no ?[ ]: default it, then guard the index: let var items = order.items ?: [] in items.length() > 0 ? items[0].name : "".
- Lang library methods are called on the value: name.trim(), text.length(), items.length(), price.round(2), str.toUpperAscii().
- Conversions: int:fromString(s) and decimal:fromString(s) return a value or an error; use check (e.g. check int:fromString(s)) only if the error is allowed by the expected type.
- Numbers do not mix: convert with <decimal>x, <int>x, <float>x. With decimal values every literal needs d: 0.08d, 100d.
- Text values are string literals in double quotes: "0.0.0.0", "localhost". String templates: string \`Hello \${name}\`. Concatenation: a + b (strings only, never nil: write (x ?: "") for an optional string x).
- Avoid runtime panics: s.substring(0, n) needs s.length() >= n, so write s.length() > n ? s.substring(0, n) : s; guard list indexes and divisions the same way.
- Case-insensitive comparison: lower-case the value once and compare with lower-case literals, e.g. name.toLowerAscii() == "hi".
- Conditional: cond ? a : b. Equality: ==, !=. Logical: &&, ||, !.
- Errors are values: error("Order has no items") fits any expected type that includes error, such as a return value.
- When the expected type is a union with more than one record (or an http status record), cast the mapping to pick one:
  <http:BadRequest>{body: "Order has no items"}. Enum members are used by name: status == CANCELLED.
- Records: {name: n, total: t}. Lists: [a, b]. Query: from var item in items where item.qty > 0 select item.name.
- Totals: sum() takes a plain variable, never item.field. Bind the field, or name the value with let:
  from var {quantity} in items collect sum(quantity)
  from var item in items where item.unitPrice > 100d let decimal amount = <decimal>item.quantity * item.unitPrice collect sum(amount)
  A field that can be nil gets its default in the let: from var item in items let int quantity = item?.quantity ?: 0 collect sum(quantity)
- Other aggregates work the same: from var {humidity} in readings collect max(humidity); from var {salary} in team collect avg(salary) ?: 0d (decimal results can be nil; float ones cannot, so no ?:).
- Counts: (from var item in items where item.qty > 5 select item).length().
- A map from a list: map from var item in items select [item.sku, item.quantity].
- Join strings: string:'join(", ", ...names), or spread a query: string:'join(", ", ...from var i in items select i.name).
- Text has no split or replaceAll method; use a regex: re \` \`.split(name) (a string[]), re \`\\d\`.replaceAll(s, "*").
- json: field access returns json|error, and the error means the key is missing; check fails the whole node on it. Use check
  unless the request gives a value for a missing key: check payload.customer.name. A json number may be an int, float or
  decimal, so convert numbers with ensureType, never an is test: check (check payload.amount).ensureType(decimal).
  When the request gives a value for a missing key, narrow instead: let json|error email = body.customer.email in
  email is string ? email : "", or for a number let json|error amount = body.amount in amount is json ? check amount.ensureType(decimal) : 0d.
  A type with [] cannot be an argument (ensureType(json[]) does not parse); test it with is: items is json[] ? items.length() : 0.
- Add a field to a json value: result is map<json> ? check result.clone().mergeJson({timestamp: t}) : {result, timestamp: t}.
  mergeJson changes its first value, so clone it first. Never spread json ({...result}): it may not be a mapping, and a spread cannot sit beside a key it may already hold.
- xml: (doc/<name>).data() is the text of the name element.
- Library functions use a module prefix (time:utcNow(), uuid:createType4AsString()). If a module is not imported, add it to imports, e.g. {"time": "ballerina/time"}.
- Common library calls: time:utcNow() (current time), time:utcToString(time:utcNow()) (ISO text; .substring(0, 10) is yyyy-MM-dd),
  time:utcToEmailString(time:utcNow()) (readable date, "Thu, 5 Nov 2026 06:48:09 +0000"), time:utcToCivil(t),
  time:utcAddSeconds(time:utcNow(), 30 * 86400) (30 days later), time:utcDiffSeconds(later, earlier) (decimal seconds),
  check time:utcFromString("2026-03-14T09:30:00Z") (full ISO time to time:Utc; it fails on date-only text, so for a year or month read the parts, which works on both: check int:fromString(d.substring(0, 4))), [ms / 1000, <decimal>(ms % 1000) / 1000] (epoch milliseconds to time:Utc),
  uuid:createType4AsString(). Regex match: re \`[0-9]+\`.isFullMatch(s).
  Bytes and hashes: s.toBytes().toBase64(), check string:fromBytes(bytes), crypto:hashMd5(s.toBytes()).toBase16(),
  crypto:hashSha256(s.toBytes()).toBase16(), check url:encode(s, "UTF-8").
- Use search_functions only for a library function you do not know (at most two searches); its results include signatures.
  function_docs reads one in full; type_info shows a record type's fields.`;

// Rules both the field and the form Copilot follow; each prompt adds only its own output rules.
const sharedRules = (submit: string, noteWords: number) => `- Use only the values listed as in scope, literals, and library functions.
- ${submit} compiles what you send and returns the errors. Fix them and submit again. Never give up after one error.
- Compiling is not enough: check that every value does exactly what was asked (no always-true or always-false parts).
- ${SURROUNDING_CODE_RULE}
- When refining, keep what the user did not ask to change.
- Read the field the request names: an ID is an id field, not a slug or a name. A missing optional value gets the fallback
  the request names ("or unassigned" gives "unassigned"), else an empty default; never another field in its place.
- Never write a key, password or token into a value or a note.
- The note is one short plain-language sentence for a non-programmer (max ${noteWords} words), with no type or code names, e.g. "Adds 8% tax to the order total".`;

export const SYSTEM_PROMPT = `You write one Ballerina expression for a single field in a low-code integration editor.

Output rules:
- Call submit with exactly one Ballerina expression: no statements, no semicolon, no variable declaration, no markdown.
- The expression must have the field's expected type.
${CONDITION_RULE}
- Read the node, the surrounding code and the form's other fields to judge what the value is for (a variable named customerName wants the customer's name).
- When fixing, change as little as possible, but complete an unfinished value (e.g. one ending in a dot) to fit what the form is for.
- If the instruction is unclear or not about this value, call cannot_do and ask for a clearer description.
- Call explain only when the request asks what the field or its value means ("explain this field"). Every other
  request, including "suggest a value", submits a value.
- "Suggest a value" asks for your best guess: the most likely value given the node, the form's other fields, the
  surrounding code and what is in scope. Never call cannot_do for it as too vague.
- Read the expected type first. If the request cannot work for it (a field the type does not have, a value of the wrong kind), call cannot_do right away with a short reason; do not submit or search first.
- When the user asks for a configurable, or to move a value out of the code, call create_configurable instead of submit.
  Set useFieldValue to true when the field has a current value to keep, including one marked withheld.
${sharedRules("submit", 12)}

${BALLERINA_REMINDERS}`;

export const FORM_SYSTEM_PROMPT = `You fill in a whole form in a low-code integration editor. Every value is one Ballerina expression,
except one marked "name" (a bare identifier) or "type" (a type descriptor such as string, decimal? or Order[]).

Output rules:
- Call submit_form with the values to set (by path) and the full new row list of every repeatable group you change.
  Fill every empty value that is not optional. Leave out values and groups that should stay as they are.
  Each value is one expression: no statements, no semicolon, no markdown.
- Each value must have its own expected type.
${CONDITION_RULE}
- Add or remove rows only as the request needs, within each group's limits. Follow each group's description.
- Keep existing rows in their order; new rows go after them unless the request says where.
- A toggle group (an else or default branch) has rows of no fields: [{}] turns it on, [] turns it off. Use it for "otherwise"; never add a row whose condition is just true.
- Read a type you need with type_info before giving up, e.g. an enum's members for one case per value.
- Conditions in a row list must not overlap or repeat. Errors come back per path.
- An action opens another form for what this form cannot hold, e.g. a new listener. To use one, list it in actions with a
  request saying what to fill there; that form's Copilot fills it and the user saves it.
- A request to add or create something an action offers ("add a new listener") uses that action. Never change an existing
  value to stand in for a new one.
- The note describes only the values, groups and actions in this call. Never say a part changed that you did not submit.
- A request to just fill the form ("fill this form") fills every empty value that is not optional, and an optional one the
  node is pointless without (a new variable's value): a value in scope of the right type when one fits, otherwise a
  realistic sample value. When a required value has nothing in scope it can be and no sample can stand in (e.g. a
  future), call needs_flow_change asking for the node that provides it.
- A key, token, password or other credential never gets a sample or placeholder: use a configurable or variable in scope
  that holds it, else leave it empty and say in the note that it still needs to be entered. A credential belongs to one
  service: use only a value whose name is for this form's own service (an OpenAI form never takes anthropicApiKey).
  Submit the other values as usual: a missing credential is never a flow change.
- In sources, name where each value taken from the code or scope comes from, and leave out literals;
  list made-up values in samples.
- Prefer the obvious choice to a question: a summary is a string, a count is an int, "the order" is the order in scope.
  Call ask_user only when the request leaves a choice open that changes what the node does and no option is clearly most
  likely (e.g. which of two different lists to loop over). Ask one short question with 2 to 4 short plain-word answers,
  at most once per request; after an answer, submit. Every answer must be something in scope of the right kind; when
  nothing in scope can be it (no workers or futures to wait for), call needs_flow_change asking for what is missing.
- When a list or map is offered both as one value and as a group, and a variable in scope already holds it (matches,
  orders), set the one value to that variable and leave the group out; never list its items one by one.
- A name still at its generated default (var1, aiVectorknowledgebase, aiWso2embeddingprovider) gets a short descriptive
  name when the request says what the node is for, e.g. productDocsKb.
- Only when a required value is empty and nothing in scope has its type (no vector store for a Vector Store value, no
  documents for a Documents value), do not invent one or ask about it: call needs_flow_change asking the main Copilot to
  add what is missing (a vector store, a node that loads the documents), with the values this form can hold. A value this
  form itself sets, such as a new name, is never missing.
- A request to do something with a value (log it, send it, post it, notify someone) or to change when the flow runs (skip,
  stop, only for, retry) needs a new node or an If, whatever this node is: call needs_flow_change. Fill this node's value
  only when the request says what the node itself holds.
- A change this form can't make goes to needs_flow_change: an If around this node, a new or moved node, or an error that
  is not about one of this form's values (unreachable code). Pass the values this form should hold with it. Its reason
  says in one plain sentence what must change outside this form. Its request is what the user would type to the main
  Copilot to get that change: one or two plain imperative sentences in the user's voice that name the agent or node it
  changes, e.g. "Add memory to supportAgent that keeps the last 20 messages." or "Wrap the Fail node in an If that
  checks whether the order has items." It never mentions this form, Copilot or the user, and never advises, warns or asks.
- Fail, Panic and Return run whenever the flow reaches them, so their value never holds the condition (no
  x ? error(...) : ()). For "fail if X", call needs_flow_change with only the error as the value, e.g.
  error("Order has no items"), asking for an If on X around this node.
- When current errors are listed, a request to fix them clears each one in this form's values, changing as little as
  possible; an error no value here can clear goes to needs_flow_change.
- If the instruction is not about this form, or neither a value, an action nor a flow change can do what was asked, call
  cannot_do with a short reason that names what this form can change.
- Anything about what to add or change is a change, even when asked as a question ("suggest more payment methods?",
  "any other suggestions?", "what else could go here?"): submit what you suggest; the user reviews it before it applies.
- A question about this node or its values (explain it, what does it do) changes nothing: answer it with explain, even
  while changes are proposed. A question about anything else (the weather, other code) goes to cannot_do.
- End with exactly one of submit_form, explain, ask_user, needs_flow_change or cannot_do; never call two of them together.
- Reasons and requests use plain words: "documents", "a vector store", "the generate node on openAiModel", never a type,
  module or node kind such as ai:Document or KNOWLEDGE_BASE_CALL. Call it a node, never a step.
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
const OTHER_FIELDS_RULE = `If the request needs any of these parts (adding a branch, case or row, turning on an else or default, a name or type elsewhere), call edit_other_fields right away instead of submitting, even when this value itself stays the same. Never fold such a request into this value: on a condition, "also handle X" means a new branch, not "|| X"; "as a separate value" means another part, not this text.`;

const VARIABLE_TARGET_RULE = "This field names the variable to change: a variable in scope or a field of one (order.status), never a computed value.";

const PROMPT_FIELD_RULE = "This field is a prompt: write a bare backtick template with no string tag, e.g. `Summarize this order: ${order}`. ai:Prompt is the template's own type; never look it up.";

const selectedKind = (property: ExpressionAssistRequest["context"]["property"]) =>
    (property.types?.find((type) => type.selected) ?? property.types?.[0])?.fieldType;

const namesVariable = (property: ExpressionAssistRequest["context"]["property"]) => selectedKind(property) === "LV_EXPRESSION";

export function buildUserPrompt(req: ExpressionAssistRequest, scope: string, expectedType: string, errors: string[], enclosing: Enclosing): string {
    const value = req.context.expression.trim();
    const otherFields = req.form?.fields ?? [];
    const context = [
        req.form?.node ? `Node: ${req.form.node}` : "",
        enclosing.code ? `Surrounding code:\n${enclosing.code}` : enclosing.signature ? `Inside: ${enclosing.signature}` : "",
        otherFields.length ? `Other fields in this form:\n${otherFields.map(({ label, value }) => `- ${label}: ${value}`).join("\n")}` : "",
        req.formParts?.length ? `Other parts of this form:\n${req.formParts.map((part) => `- ${part}`).join("\n")}\n${OTHER_FIELDS_RULE}` : "",
        `Field: ${req.field.label}`,
        req.field.description ? `Description: ${req.field.description}` : "",
        `Expected type: ${expectedType || "any"}`,
        namesVariable(req.context.property) ? VARIABLE_TARGET_RULE : "",
        selectedKind(req.context.property) === "PROMPT" ? PROMPT_FIELD_RULE : "",
        listedValues(req.context.property).length ? `Allowed values, written exactly so; any other is rejected: ${listedValues(req.context.property).join(" | ")}` : "",
        `Current value: ${req.valueWithheld ? "(withheld: it looks like a secret, so it is not shown)" : value || "(empty)"}`,
        errors.length ? `Current errors:\n${errors.map((e) => `- ${e}`).join("\n")}` : "",
        `In scope:\n${scope || "(nothing)"}`,
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
    { test: /'decimal' and 'float'|'float' and 'decimal'/, hint: "Mixing decimal and float: write decimal literals with d (0.08d) or cast with <decimal>." },
    { test: /'decimal' and 'int'|'int' and 'decimal'/, hint: "Mixing decimal and int: cast the int with <decimal>." },
    { test: /undefined function 'join'/, hint: "Join with string:'join(\", \", ...parts)." },
    { test: /undefined (function|method) '\w+' in type 'map</, hint: "A map has no merge or set function: build a new mapping with spread, e.g. {...m, key: value}; narrow json first with m is map<json>." },
    { test: /undefined (function|method) '\w+' in type/, hint: "That method does not exist on this type; use search_functions or a lang library function instead." },
    { test: /more clauses after select|sequence variable|'seq [^']*' does not support field access|undefined function 'sum'/, hint: "A query ends with select or collect, not both, and sum() takes a plain variable: from var {quantity} in items collect sum(quantity), or let decimal amount = ... collect sum(amount)." },
    { test: /'[^']*\?' does not support field access/, hint: "That value can be nil, so read its fields with ?., e.g. order.customer?.id; a != () or is check does not narrow a field access. To use it only when present, bind it first: let int? id = order.customer?.id in id is int ? string `-${id}` : \"\"." },
    { test: /operator .* not defined for .*\?'/, hint: "An optional value can be nil: default it before combining, e.g. (address.line2 ?: \"\"). A != () check does not narrow a field access, only a local variable." },
    { test: /'[^']*\?' does not support (member|optional field) access|missing colon token/, hint: "Ballerina has no ?[ ] or ?.[ ], and an is check does not narrow a field access. Default the optional list, then guard the index: let var xs = a.list ?: [] in xs.length() > 0 ? xs[0].name : \"\"." },
    { test: /invalid token '[)\]}]' after/, hint: "That closing bracket has no opening one: delete the one right after the quoted text, or rewrite the value without the extra brackets." },
    { test: /invalid token|missing .* token/, hint: "This does not parse: check brackets, commas and backticks. Plain text needs double quotes, e.g. \"0.0.0.0\"." },
    { test: /expected '\(int\|float\|decimal\|string\|boolean\)', found '[^']*\?'/, hint: "A ${...} in a string template cannot hold nil: default it inside, reading optional records with ?., e.g. ${order.customer?.name ?: \"\"}." },
    { test: /type compatible with mapping constructor expressions not found/, hint: "Either a value inside {...} can still be an error (narrow it, or use check), or ...x spreads a value that is not a mapping. To add a field to a json value use x is map<json> ? x.clone().mergeJson({k: v}) : {result: x, k: v}." },
    { test: /incompatible mapping constructor/, hint: "Cast the mapping to the record you mean, e.g. <http:BadRequest>{body: \"...\"}." },
    { test: /expected '(ai:)?Prompt', found 'string'/, hint: "A prompt is a bare backtick template: `Summarize ${order}`, with no string tag in front." },
    { test: /expected '[^']*error[^']*', found '\(error\|\(\)\)'|found '\(\(\)\|error\)'/, hint: "A value that is an error only sometimes needs an If around the node instead; set the error alone, e.g. error(\"Order has no items\")." },
    { test: /redeclared symbol|already (defined|declared)/, hint: "That name is already in use here. Pick a different, descriptive name (e.g. lineTotal) and submit again; a taken name is never a reason for cannot_do." },
];

// A form's values and groups as the model reads them; the declared type stands in, and type_info expands a record.
export function buildFormPrompt(req: FormAssistRequest, scope: string, enclosing: Enclosing): string {
    const context = [
        `Node: ${req.node}`,
        req.agent ? `The form belongs to this agent. Fit the values to it: a tool's description says when this agent should call it, and Instructions name the agent's tools where they apply. Node says which part of the agent this form sets; a request for that part fills this form, e.g. a new tool's name, description and parameters on a new-tool form. When the request names a different part of the agent (another tool, its memory, its model provider, a trigger), that is a flow change: call needs_flow_change asking the main Copilot for it on this agent. A request this form can carry out, such as a new role and instructions, fills this form even when other parts might later need to follow; say so in the note instead of handing off; when one of the agent's tools already does what was asked, or the request goes against the agent's Instructions on a form that does not edit those Instructions, call cannot_do saying so instead; on the form that holds the Role and Instructions, a request to change them is the change itself; needs_flow_change always asks for a change, never advises against one. The agent below is as saved; where it differs from this form's values, the form's values are newer and win.\n${req.agent}` : "",
        req.focus ? `Asked from the field: ${req.focus.label} (${req.focus.key}). It tells you what "this" refers to; it does not need to change. Change only what the request asks for and keep every other value as it is.` : "",
        req.asked ? `You asked the user: ${req.asked}\nThe latest message is their answer.` : "",
        req.errors?.length ? `Current errors:\n${req.errors.map((error) => `- ${error}`).join("\n")}` : "",
        req.pending && req.focus ? `Suggested so far for ${req.focus.label}, not applied: ${req.pending}\nIt may have combined ${req.focus.label}'s current value with the new check. If the task moves it elsewhere, e.g. into a new branch, take only what the earlier request added, and keep ${req.focus.label} as it was.` : "",
        enclosing.code ? `Surrounding code, as saved (where it differs from the Values below, the values are the form's newer state and win):\n${enclosing.code}` : enclosing.signature ? `Inside: ${enclosing.signature}` : "",
        req.slots.length ? `Values:\n${req.slots.map(slotLine).join("\n")}` : "",
        req.groups.length ? `Repeatable groups:\n${req.groups.map(groupLines).join("\n")}` : "",
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

function slotLine(slot: FormAssistSlot): string {
    const about = slot.description ? ` — ${slot.description}` : "";
    const value = slot.withheld ? "(withheld: it has a secret value; keep it unless asked)"
        : slot.value || (slot.credential ? "(empty credential: leave it for the user unless a value in scope holds it)" : "(empty)");
    const type = slot.typeFrom ? `a value of the type in ${slot.typeFrom}; when the request needs another type, set ${slot.typeFrom} too` : declaredType(slot.property);
    const previous = slot.previous !== undefined ? ` (before this thread: ${slot.previous || "(empty)"})` : "";
    return `- ${slot.path} (${slot.label}${slot.optional ? ", optional" : ""}): ${type} = ${value}${previous}${about}`;
}

function groupLines(group: FormAssistGroup): string {
    const about = group.description ? ` ${group.description}` : "";
    if (group.item.length === 0) {
        return `- ${group.id} (${group.label}): toggle, now ${group.rows.length ? "on" : "off"}.${about}`;
    }
    const limits = `${group.min}..${group.max ?? "n"} rows`;
    const fields = group.item.map((field) => `${field.key} (${field.label}): ${field.typeFrom ? `a value of the row's ${field.typeFrom}` : declaredType(field.property)}`).join(", ");
    const rows = group.rows.map((row, index) => `    ${index + 1}. ${JSON.stringify(row)}`);
    const append = group.rows.length ? `    A new row goes after row ${group.rows.length} unless the request names a position.` : "";
    return [`- ${group.id} (${group.label}, ${limits}); each row: ${fields}.${about}`, ...rows, append].filter(Boolean).join("\n");
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
    LV_EXPRESSION: "the variable to change, e.g. orders or order.status",
    PROMPT: "a prompt: a bare backtick template with no string tag, e.g. `Summarize this order: ${order}`",
    SQL_QUERY: "a SQL query: a bare backtick template with no tag, values as ${...} parameters, e.g. `SELECT * FROM orders WHERE id = ${orderId}`",
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
    const base = KIND_NAMES[type?.fieldType ?? ""] ?? (type?.ballerinaType || "any");
    const listed = listedValues(property);
    return listed.length ? `${base}, one of ${listed.join(" | ")} written exactly so` : base;
}
