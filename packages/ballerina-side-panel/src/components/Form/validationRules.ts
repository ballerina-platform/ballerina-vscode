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

import { ValidationRule, ValidationSeverity } from "@wso2/ballerina-core";
import { FormField } from "./types";

/**
 * Client-side execution of the connector-shipped `validations[]` contract.
 *
 * Only the `common.*` and `vscode.*` namespaces run here — `ls.*` ids need project context and are
 * left for the language server. The vocabulary is open: an unknown id is skipped with a console
 * warning rather than failing the field, so a model referencing a newer rule still loads.
 *
 * A validator returns `undefined` to pass (or to skip — a rule that cannot meaningfully judge the
 * value, such as `port` against an `http:Listener` expression, passes) and a default message
 * template to fail. The caller decides the final text: a model-supplied `message` always wins.
 */

type RuleArgs = Record<string, unknown>;

/** `undefined` = pass/skip; a string = the rule's default (uninterpolated) message template. */
type RuleOutcome = string | undefined;

type ClientRule = (value: unknown, args: RuleArgs, field: FormField, context: ClientRuleContext) => RuleOutcome;

/**
 * Extra state a few `vscode.*` rules need beyond the value itself. Every entry is optional: a rule
 * whose context is absent skips rather than guessing.
 */
export interface ClientRuleContext {
    /** Sibling values sharing a `scope`, for the in-form uniqueness rule. */
    getSiblingValues?: (scope: string) => unknown[];
    /**
     * The fieldType of the member the user is currently editing. Rules are scoped to a `types[]`
     * member, so this selects whose validations run — e.g. a NUMBER member's `port` rule is skipped
     * once the user switches the field to its EXPRESSION member. Defaults to the selected/primary
     * member when omitted (the common single-type case).
     */
    activeFieldType?: string;
}

const NO_CONTEXT: ClientRuleContext = {};

/**
 * The validation rules that apply right now: those on the active `types[]` member. Rules live on
 * the member whose value they judge, so only the active member's rules should run.
 */
export function resolveActiveValidations(field: FormField, activeFieldType?: string): ValidationRule[] {
    const types = field?.types ?? [];
    if (types.length === 0) {
        return [];
    }
    const active = (activeFieldType && types.find((type) => type.fieldType === activeFieldType))
        || types.find((type) => type.selected)
        || types[0];
    return active?.validations ?? [];
}

export interface ClientValidationFailure {
    rule: string;
    message: string;
    severity: ValidationSeverity;
}

// Reserved words rejected by `common.validate.identifier`. The language server re-checks with the
// real lexer at save time (`ls.validate.identifier`); this list only needs to catch the common
// mistakes while typing.
const BALLERINA_RESERVED_WORDS = new Set([
    "abstract", "annotation", "any", "anydata", "as", "boolean", "break", "byte", "catch", "channel",
    "check", "checkpanic", "client", "commit", "const", "continue", "decimal", "distinct", "do",
    "else", "enum", "error", "external", "fail", "false", "final", "finally", "float", "flush",
    "fork", "function", "future", "handle", "if", "import", "in", "int", "is", "isolated", "join",
    "json", "let", "limit", "listener", "lock", "map", "match", "never", "new", "null", "object",
    "on", "outer", "panic", "parameterized", "private", "public", "readonly", "record", "remote",
    "resource", "retry", "return", "returns", "rollback", "service", "start", "stream", "string",
    "table", "transaction", "transactional", "trap", "true", "type", "typedesc", "typeof", "var",
    "wait", "while", "worker", "xml", "xmlns",
]);

const IDENTIFIER_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/** Quoted identifiers (`'foo`, and by extension `'service`) bypass the reserved-word check. */
const isQuotedIdentifier = (value: string): boolean => value.startsWith("'");

const asString = (value: unknown): string => {
    if (value === undefined || value === null) {
        return "";
    }
    return typeof value === "string" ? value : String(value);
};

/** Empty for validation purposes: blank string, or an array with no non-blank entries. */
const isBlank = (value: unknown): boolean => {
    if (value === undefined || value === null) {
        return true;
    }
    if (Array.isArray(value)) {
        return value.length === 0 || value.every((entry) => isBlank(entry));
    }
    if (typeof value === "boolean") {
        return false;
    }
    return asString(value).trim() === "";
};

const toNumber = (value: unknown): number | undefined => {
    const raw = asString(value).trim();
    if (raw === "") {
        return undefined;
    }
    const parsed = Number(raw);
    return Number.isNaN(parsed) ? undefined : parsed;
};

const argAsNumber = (args: RuleArgs, key: string): number | undefined => {
    const raw = args?.[key];
    return raw === undefined || raw === null ? undefined : toNumber(raw);
};

const isMultiValue = (value: unknown): value is unknown[] => Array.isArray(value);

/** A `string \`...\`` template literal, as the text editors serialize their content. */
const STRING_TEMPLATE_PATTERN = /^string\s*`([\s\S]*)`$/;

/**
 * The content carried by a string literal — `"x"` and string`x` both yield `x`. A value that is not
 * a literal (a raw path, or an expression) is returned as-is, so this stays a pure unwrap rather
 * than a validity judgement. Mirrors `CommonRuleValidators.stringContent` on the server.
 */
const stringContent = (raw: string): string => {
    const trimmed = raw.trim();
    if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
        return trimmed.slice(1, -1).trim();
    }
    const template = STRING_TEMPLATE_PATTERN.exec(trimmed);
    if (template) {
        return template[1].trim();
    }
    return trimmed;
};

export const CLIENT_VALIDATION_RULES: Record<string, ClientRule> = {
    // ---- common.* — context-free, mirrored by the language server at save time ----

    "common.validate.required": (value) =>
        isBlank(value) ? "{label} is required" : undefined,

    // Rejects a string field whose *content* is empty. `required` only sees whether the node holds a
    // value at all, and a text field holds its value as a string literal — so an empty entry arrives
    // as `""` (or string ``), two characters `required` accepts while the generated source binds an
    // empty string. Mirrored server-side by `common.validate.non.empty`.
    "common.validate.non.empty": (value) =>
        stringContent(asString(value)) === "" ? "{label} cannot be empty" : undefined,

    "common.validate.identifier": (value) => {
        const raw = asString(value).trim();
        if (raw === "") {
            return undefined; // emptiness is `required`'s job, not this rule's
        }
        if (isQuotedIdentifier(raw)) {
            return IDENTIFIER_PATTERN.test(raw.slice(1))
                ? undefined
                : "{label} must be a valid Ballerina identifier";
        }
        if (!IDENTIFIER_PATTERN.test(raw) || BALLERINA_RESERVED_WORDS.has(raw)) {
            return "{label} must be a valid Ballerina identifier";
        }
        return undefined;
    },

    "common.validate.regex": (value, args) => {
        const pattern = args?.pattern;
        if (typeof pattern !== "string") {
            console.warn("[validation] common.validate.regex is missing its required `pattern` arg — skipping");
            return undefined;
        }
        let regex: RegExp;
        try {
            regex = new RegExp(pattern, typeof args?.flags === "string" ? args.flags : undefined);
        } catch (error) {
            // An unparseable pattern is an authoring error, never a user error — skip the rule.
            console.warn(`[validation] common.validate.regex has an invalid pattern '${pattern}' — skipping`, error);
            return undefined;
        }
        // Multi-value fields (TEXT_SET/EXPRESSION_SET) are checked per item, matching how the legacy
        // type-level `pattern` behaved — testing the comma-joined array would be meaningless. A
        // scalar's empty value is `required`'s concern, so it is skipped here.
        if (isMultiValue(value)) {
            return value.some((item) => !regex.test(asString(item))) ? "{label} has an invalid format" : undefined;
        }
        const raw = asString(value);
        if (raw === "") {
            return undefined;
        }
        return regex.test(raw) ? undefined : "{label} has an invalid format";
    },

    "common.validate.number.range": (value, args) => {
        const raw = asString(value).trim();
        if (raw === "") {
            return undefined;
        }
        const parsed = toNumber(raw);
        const min = argAsNumber(args, "min");
        const max = argAsNumber(args, "max");
        if (parsed === undefined) {
            return rangeMessage(min, max);
        }
        if ((min !== undefined && parsed < min) || (max !== undefined && parsed > max)) {
            return rangeMessage(min, max);
        }
        return undefined;
    },

    // Sugar over number.range with port defaults, kept as its own id because shipped models
    // reference it. Non-numeric values are skipped: the field may legally hold an
    // `http:Listener` expression instead of a port number.
    "common.validate.port": (value, args) => {
        const raw = asString(value).trim();
        if (raw === "") {
            return undefined;
        }
        const parsed = toNumber(raw);
        if (parsed === undefined) {
            return undefined;
        }
        const min = argAsNumber(args, "min") ?? 1;
        const max = argAsNumber(args, "max") ?? 65535;
        if (parsed >= min && parsed <= max) {
            return undefined;
        }
        // The bounds are baked into the message rather than left as {min}/{max} placeholders: they
        // usually come from this rule's own defaults, and interpolation only sees model args.
        return `{label} must be a valid port (${min}–${max})`;
    },

    "common.validate.min.length": (value, args) => {
        const min = argAsNumber(args, "min");
        if (min === undefined) {
            console.warn("[validation] common.validate.min.length is missing its required `min` arg — skipping");
            return undefined;
        }
        const fail = "{label} must be at least {min} characters";
        if (isMultiValue(value)) {
            return value.some((item) => asString(item).trim().length < min) ? fail : undefined;
        }
        const raw = asString(value).trim();
        if (raw === "") {
            return undefined;
        }
        return raw.length < min ? fail : undefined;
    },

    "common.validate.max.length": (value, args) => {
        const max = argAsNumber(args, "max");
        if (max === undefined) {
            console.warn("[validation] common.validate.max.length is missing its required `max` arg — skipping");
            return undefined;
        }
        const fail = "{label} must be at most {max} characters";
        if (isMultiValue(value)) {
            return value.some((item) => asString(item).trim().length > max) ? fail : undefined;
        }
        return asString(value).trim().length > max ? fail : undefined;
    },

    "common.validate.url": (value, args) => {
        const raw = asString(value).trim();
        if (raw === "") {
            return undefined;
        }
        // Models carry URL defaults as Ballerina string literals — judge the literal's contents.
        const unquoted = stripQuotes(raw);
        let parsed: URL;
        try {
            parsed = new URL(unquoted);
        } catch {
            return "{label} must be a valid URL";
        }
        const schemes = Array.isArray(args?.schemes) ? (args.schemes as unknown[]).map(asString) : undefined;
        if (schemes?.length) {
            const scheme = parsed.protocol.replace(/:$/, "");
            if (!schemes.includes(scheme)) {
                return "{label} must be a valid URL";
            }
        }
        return undefined;
    },

    "common.validate.service.path": (value) => {
        const raw = stripQuotes(asString(value).trim());
        if (raw === "") {
            return undefined;
        }
        return isValidServicePath(raw) ? undefined : "{label} must be a valid service path";
    },

    "common.validate.enum": (value, args) => {
        const values = Array.isArray(args?.values) ? (args.values as unknown[]).map(asString) : undefined;
        if (!values?.length) {
            console.warn("[validation] common.validate.enum is missing its required `values` arg — skipping");
            return undefined;
        }
        const raw = asString(value).trim();
        if (raw === "") {
            return undefined;
        }
        return values.includes(raw) ? undefined : "{label} must be one of: {values}";
    },

    "common.validate.non.negative": (value) => {
        const parsed = toNumber(value);
        if (parsed === undefined) {
            return undefined;
        }
        return parsed < 0 ? "{label} cannot be negative" : undefined;
    },

    // ---- vscode.* — client-environment checks ----
    // `vscode.validate.file.exists` and `vscode.validate.unique.in.form` need host RPC / sibling
    // scope plumbing and are intentionally not registered yet; they degrade to "unknown rule".

    "vscode.validate.status.code": (value, args) => {
        const parsed = toNumber(value);
        if (parsed === undefined) {
            return undefined;
        }
        const min = argAsNumber(args, "min") ?? 100;
        const max = argAsNumber(args, "max") ?? 599;
        if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
            return "{label} must be a valid HTTP status code";
        }
        return undefined;
    },

    "vscode.validate.resource.path": (value) => {
        const raw = stripQuotes(asString(value).trim());
        if (raw === "") {
            return undefined;
        }
        return isValidResourcePath(raw) ? undefined : "{label} is not a valid resource path";
    },

    // Uniqueness among sibling values inside the current form only (e.g. repeated param names in a
    // REPEATABLE_LIST) — no project context needed, so it stays client-side.
    "vscode.validate.unique.in.form": (value, args, field, context) => {
        const scope = asString(args?.scope ?? "").trim();
        if (scope === "" || !context.getSiblingValues) {
            return undefined;
        }
        const raw = asString(value).trim();
        if (raw === "") {
            return undefined;
        }
        const siblings = context.getSiblingValues(scope) ?? [];
        // The field's own value is among the siblings; a duplicate means more than one match.
        const matches = siblings.filter((sibling) => asString(sibling).trim() === raw).length;
        return matches > 1 ? "{label} must be unique" : undefined;
    },
};

function rangeMessage(min: number | undefined, max: number | undefined): string {
    if (min !== undefined && max !== undefined) {
        return "{label} must be between {min} and {max}";
    }
    if (min !== undefined) {
        return "{label} must be at least {min}";
    }
    if (max !== undefined) {
        return "{label} must be at most {max}";
    }
    return "{label} must be a number";
}

function stripQuotes(value: string): string {
    return value.length >= 2 && value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;
}

/** Path segments are identifiers or string literals; a leading `/` is optional; no spaces. */
function isValidServicePath(path: string): boolean {
    if (/\s/.test(path)) {
        return false;
    }
    if (path === "/") {
        return true;
    }
    const segments = path.replace(/^\//, "").split("/");
    return segments.every((segment) => {
        if (segment === "") {
            return false;
        }
        const bare = isQuotedIdentifier(segment) ? segment.slice(1) : segment;
        return IDENTIFIER_PATTERN.test(bare);
    });
}

/** As a service path, but segments may also be path params — `[string id]`. */
function isValidResourcePath(path: string): boolean {
    if (/\s{2,}/.test(path)) {
        return false;
    }
    if (path === "/" || path === ".") {
        return true;
    }
    const segments = path.replace(/^\//, "").split("/");
    return segments.every((segment) => {
        if (segment === "") {
            return false;
        }
        const pathParam = segment.match(/^\[\s*([a-zA-Z_][a-zA-Z0-9_:]*)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\]$/);
        if (pathParam) {
            return true;
        }
        const bare = isQuotedIdentifier(segment) ? segment.slice(1) : segment;
        return IDENTIFIER_PATTERN.test(bare);
    });
}

/**
 * Substitutes `{placeholder}` occurrences from the rule's `args`, plus the built-ins `{label}` and
 * `{value}`. An unmatched placeholder is left as-is so an authoring mistake stays visible.
 */
export function interpolateMessage(
    template: string,
    args: RuleArgs | undefined,
    field: FormField,
    value: unknown
): string {
    return template.replace(/\{(\w+)\}/g, (match, key: string) => {
        if (key === "label") {
            return field.label ?? field.key ?? "";
        }
        if (key === "value") {
            return asString(value);
        }
        const arg = args?.[key];
        if (arg === undefined || arg === null) {
            return match;
        }
        return Array.isArray(arg) ? arg.map(asString).join(", ") : asString(arg);
    });
}

const severityOf = (rule: ValidationRule): ValidationSeverity =>
    rule.severity === "WARNING" ? "WARNING" : "ERROR";

/**
 * A field is exempt from validation when it cannot contribute to generated source: read-only
 * values are resolved by the language server, and an unchecked optional field is simply absent.
 */
function isExemptFromValidation(field: FormField): boolean {
    return field.editable === false || field.enabled === false;
}

/**
 * Runs every client-runnable rule attached to `field` against `value`.
 * Rules of both severities are returned; the caller decides what blocks submit.
 */
/** Runs a single rule; returns the failure or `undefined` on pass/skip. Shared by the loop below
 * and by `buildValidate`, so both agree on skip/interpolation semantics. */
function evaluateRule(
    rule: ValidationRule,
    field: FormField,
    value: unknown,
    context: ClientRuleContext
): ClientValidationFailure | undefined {
    if (!rule?.rule || rule.rule.startsWith("ls.")) {
        // `ls.*` ids are the language server's to run — not unknown, just not ours.
        return undefined;
    }
    const validator = CLIENT_VALIDATION_RULES[rule.rule];
    if (!validator) {
        console.warn(`[validation] Unknown rule id '${rule.rule}' on field '${field.key}' — skipping`);
        return undefined;
    }
    const args = rule.args ?? {};
    let defaultMessage: RuleOutcome;
    try {
        defaultMessage = validator(value, args, field, context);
    } catch (error) {
        // A throwing validator must never make a field unusable.
        console.warn(`[validation] Rule '${rule.rule}' threw on field '${field.key}' — skipping`, error);
        return undefined;
    }
    if (defaultMessage === undefined) {
        return undefined;
    }
    return {
        rule: rule.rule,
        message: interpolateMessage(rule.message ?? defaultMessage, args, field, value),
        severity: severityOf(rule),
    };
}

/**
 * Runs every client-runnable rule on the active `types[]` member against `value`.
 * Rules of both severities are returned; the caller decides what blocks submit.
 */
export function evaluateClientRules(
    field: FormField,
    value: unknown,
    context: ClientRuleContext = NO_CONTEXT
): ClientValidationFailure[] {
    const validations = resolveActiveValidations(field, context.activeFieldType);
    if (!validations.length || isExemptFromValidation(field)) {
        return [];
    }
    const failures: ClientValidationFailure[] = [];
    for (const rule of validations) {
        const failure = evaluateRule(rule, field, value, context);
        if (failure) {
            failures.push(failure);
        }
    }
    return failures;
}

/** WARNING-severity failures only — rendered inline but never blocking. */
export function collectClientWarnings(
    field: FormField,
    value: unknown,
    context: ClientRuleContext = NO_CONTEXT
): ClientValidationFailure[] {
    return evaluateClientRules(field, value, context).filter((failure) => failure.severity === "WARNING");
}

/**
 * Folds the field's ERROR-severity rules into a react-hook-form `validate` map, so they compose
 * with the `required`/`pattern` rules the editors already register. Each entry returns `true` to
 * pass or the message to show. WARNINGs are excluded — they must not mark the form invalid.
 */
export function buildValidate(
    field: FormField,
    activeFieldType?: string
): Record<string, (value: unknown) => true | string> {
    const validate: Record<string, (value: unknown) => true | string> = {};
    const validations = resolveActiveValidations(field, activeFieldType);
    if (!validations.length) {
        return validate;
    }

    validations.forEach((rule, index) => {
        if (!rule?.rule || rule.rule.startsWith("ls.") || severityOf(rule) !== "ERROR") {
            return;
        }
        if (!CLIENT_VALIDATION_RULES[rule.rule]) {
            return; // evaluateClientRules already warns about unknown ids
        }
        // Rule ids may repeat on one field (e.g. two regex rules) — index keeps the keys distinct.
        validate[`${rule.rule}#${index}`] = (value: unknown) => {
            const failure = evaluateRule(rule, field, value, NO_CONTEXT);
            return failure ? failure.message : true;
        };
    });
    return validate;
}

// ---- host-backed vscode.* rules ---------------------------------------------------------------

/**
 * The `vscode.*` rules that must reach the host and therefore cannot run in the synchronous
 * registry above. They live in this module rather than a separate one so they share its helpers and
 * message interpolation outright — an earlier split duplicated both, which was one edit away from
 * the live and save-time messages drifting apart.
 *
 * Paths resolve against the workspace file listing the host already exposes rather than a new
 * `fs.stat` RPC: one less surface to maintain, and it is the same listing the file pickers browse.
 */

export interface WorkspaceFile {
    relativePath: string;
    path: string;
}

export interface AsyncRuleContext {
    listWorkspaceFiles?: () => Promise<{ workspaceRoot: string; files: WorkspaceFile[] }>;
    /** The active `types[]` member; scopes which rules apply (see ClientRuleContext.activeFieldType). */
    activeFieldType?: string;
}

const normalisePath = (path: string): string => path.replace(/\\/g, "/").replace(/^\.\//, "");

/** Whether the active type member carries any rule this module handles — lets callers skip the round trip. */
export function hasAsyncClientRules(field: FormField, activeFieldType?: string): boolean {
    return resolveActiveValidations(field, activeFieldType)
        .some((rule) => rule?.rule === "vscode.validate.file.exists");
}

/**
 * Runs the host-backed rules on the active type member. Like every other producer here it fails
 * toward passing: if the listing is unavailable or the call throws, it yields nothing rather than
 * claiming a file is missing.
 */
export async function evaluateAsyncClientRules(
    field: FormField,
    value: unknown,
    context: AsyncRuleContext
): Promise<ClientValidationFailure[]> {
    const rules = resolveActiveValidations(field, context.activeFieldType)
        .filter((rule) => rule?.rule === "vscode.validate.file.exists");
    if (rules.length === 0 || isExemptFromValidation(field) || !context.listWorkspaceFiles) {
        return [];
    }

    const raw = stripQuotes(asString(value).trim());
    if (raw === "") {
        // Emptiness is `required`'s concern.
        return [];
    }

    let files: WorkspaceFile[];
    try {
        files = (await context.listWorkspaceFiles()).files ?? [];
    } catch (error) {
        console.warn("[validation] Could not list workspace files — skipping file.exists", error);
        return [];
    }

    const target = normalisePath(raw);
    const exists = files.some((file) =>
        normalisePath(file.path) === target
        || normalisePath(file.relativePath) === target
        || normalisePath(file.path).endsWith(`/${target}`));

    const failures: ClientValidationFailure[] = [];
    for (const rule of rules) {
        const args = rule.args ?? {};
        if (!exists) {
            failures.push({
                rule: rule.rule,
                message: interpolateMessage(rule.message ?? "File not found: {value}", args, field, value),
                severity: severityOf(rule),
            });
            continue;
        }
        const extensions = Array.isArray(args.extensions) ? (args.extensions as unknown[]).map(asString) : [];
        if (extensions.length > 0 && !extensions.some((extension) => target.endsWith(extension))) {
            failures.push({
                rule: rule.rule,
                message: interpolateMessage(
                    rule.message ?? `{label} must be one of: ${extensions.join(", ")}`, args, field, value),
                severity: severityOf(rule),
            });
        }
    }
    return failures;
}
