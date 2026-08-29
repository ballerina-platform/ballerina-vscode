import test from "node:test";
import assert from "node:assert/strict";

import {
    evaluateClientRules,
    buildValidate,
    interpolateMessage,
    evaluateAsyncClientRules,
    hasAsyncClientRules,
} from "../lib/components/Form/validationRules.js";
import { mergeFieldDiagnostics } from "../lib/components/Form/DiagnosticsStore.js";

// Validations now live on the active `types[]` member, so the helper nests them under a single
// selected member whose fieldType is the field's `type`.
const field = (label, validations, overrides = {}) => {
    const fieldType = overrides.type ?? "TEXT";
    return {
        key: "field",
        label,
        type: fieldType,
        optional: false,
        editable: true,
        enabled: true,
        documentation: "",
        value: "",
        types: [{ fieldType, selected: true, validations }],
        ...overrides,
    };
};

const rule = (id, extra = {}) => ({ rule: id, ...extra });

const messages = (failures) => failures.map((failure) => failure.message);

// ---- type-scoped validations ------------------------------------------------------------------

test("a rule runs only while its own type member is the active input mode", () => {
    // The RabbitMQ port shape: NUMBER member carries the rule, EXPRESSION member carries none.
    const portField = {
        key: "port",
        label: "Port",
        type: "NUMBER",
        optional: false,
        editable: true,
        enabled: true,
        documentation: "",
        value: "0",
        types: [
            {
                fieldType: "NUMBER",
                selected: true,
                validations: [rule("common.validate.port", {
                    severity: "WARNING",
                    args: { min: 1, max: 65535 },
                    message: "Port must be between {min} and {max}",
                })],
            },
            { fieldType: "EXPRESSION", selected: false },
        ],
    };
    // Editing the NUMBER member: the rule fires.
    assert.deepEqual(
        messages(evaluateClientRules(portField, "0", { activeFieldType: "NUMBER" })),
        ["Port must be between 1 and 65535"]
    );
    // Switched to the EXPRESSION member (a variable reference we cannot evaluate): rule skipped.
    assert.deepEqual(evaluateClientRules(portField, "myPortVar", { activeFieldType: "EXPRESSION" }), []);
});

test("without an explicit active member, rules come from the selected member", () => {
    const portField = {
        key: "port", label: "Port", type: "NUMBER", optional: false, editable: true, enabled: true,
        documentation: "", value: "0",
        types: [
            { fieldType: "NUMBER", selected: true, validations: [rule("common.validate.non.negative")] },
            { fieldType: "EXPRESSION", selected: false },
        ],
    };
    assert.deepEqual(messages(evaluateClientRules(portField, "-1")), ["Port cannot be negative"]);
});

// ---- common.* ---------------------------------------------------------------------------------

test("required fails on blank and passes on a value", () => {
    const target = field("Client Secret", [rule("common.validate.required")]);
    assert.deepEqual(messages(evaluateClientRules(target, "")), ["Client Secret is required"]);
    assert.deepEqual(evaluateClientRules(target, "shh"), []);
});

test("identifier rejects reserved words but accepts the quoted form", () => {
    const target = field("Listener Name", [rule("common.validate.identifier")]);
    assert.equal(evaluateClientRules(target, "service").length, 1);
    assert.deepEqual(evaluateClientRules(target, "'service"), []);
    assert.deepEqual(evaluateClientRules(target, "kafkaListener"), []);
});

test("identifier leaves emptiness to the required rule", () => {
    assert.deepEqual(evaluateClientRules(field("Name", [rule("common.validate.identifier")]), ""), []);
});

test("number.range interpolates whichever bounds are present", () => {
    const both = field("Port", [rule("common.validate.number.range", { args: { min: 1, max: 65535 } })]);
    assert.deepEqual(messages(evaluateClientRules(both, "70000")), ["Port must be between 1 and 65535"]);

    const lower = field("Retries", [rule("common.validate.number.range", { args: { min: 0 } })]);
    assert.deepEqual(messages(evaluateClientRules(lower, "-1")), ["Retries must be at least 0"]);
});

test("port bakes its effective bounds into the message instead of leaving placeholders", () => {
    // Regression: the bounds come from the rule's own defaults, so {min}/{max} have no args to
    // resolve against and would otherwise render literally.
    const target = field("Listen On", [rule("common.validate.port", { severity: "WARNING" })]);
    const failures = evaluateClientRules(target, "99999");
    assert.deepEqual(messages(failures), ["Listen On must be a valid port (1–65535)"]);
    assert.equal(failures[0].severity, "WARNING");
});

test("port skips a non-numeric value because the field may hold a listener expression", () => {
    assert.deepEqual(evaluateClientRules(field("Listen On", [rule("common.validate.port")]), "httpListener"), []);
});

test("an unparseable regex pattern is skipped rather than failing the user", () => {
    const target = field("Topic", [rule("common.validate.regex", { args: { pattern: "[unclosed" } })]);
    assert.deepEqual(evaluateClientRules(target, "anything"), []);
});

test("regex validates each item of a TEXT_SET rather than the comma-joined array", () => {
    // The MSSQL `databases` field ships this: each entry must be a non-empty quoted/backtick string.
    const target = field("Databases", [
        rule("common.validate.regex", {
            args: { pattern: "^string `.+`$|^\".+\"$" },
            message: "Database name cannot be empty",
        }),
    ], { type: "TEXT_SET" });
    // All items valid → passes. Joining these with a comma would not match the per-item pattern,
    // so a passing result here proves the array is checked element-by-element.
    assert.deepEqual(evaluateClientRules(target, ['"db1"', '"db2"']), []);
    // One bad item → fails with the model's message.
    assert.deepEqual(messages(evaluateClientRules(target, ['"db1"', '""'])), ["Database name cannot be empty"]);
    assert.deepEqual(messages(evaluateClientRules(target, ['"db1"', "notquoted"])), ["Database name cannot be empty"]);
});

test("min/max length validate each item of a multi-value field", () => {
    const min = field("Tags", [rule("common.validate.min.length", { args: { min: 2 } })], { type: "TEXT_SET" });
    assert.deepEqual(evaluateClientRules(min, ["ab", "cde"]), []);
    assert.equal(evaluateClientRules(min, ["ab", "c"]).length, 1);

    const max = field("Tags", [rule("common.validate.max.length", { args: { max: 3 } })], { type: "TEXT_SET" });
    assert.deepEqual(evaluateClientRules(max, ["ab", "cde"]), []);
    assert.equal(evaluateClientRules(max, ["ab", "cdef"]).length, 1);
});

test("url accepts a quoted literal and enforces the scheme allow-list", () => {
    const plain = field("Callback", [rule("common.validate.url")]);
    assert.deepEqual(evaluateClientRules(plain, '"https://example.com/hook"'), []);
    assert.equal(evaluateClientRules(plain, "/hook").length, 1);

    const httpsOnly = field("Callback", [rule("common.validate.url", { args: { schemes: ["https"] } })]);
    assert.equal(evaluateClientRules(httpsOnly, "http://example.com").length, 1);
});

test("enum renders the allowed values into the message", () => {
    const target = field("Mode", [rule("common.validate.enum", { args: { values: ["SAFE", "SLOW"] } })]);
    assert.deepEqual(messages(evaluateClientRules(target, "FAST")), ["Mode must be one of: SAFE, SLOW"]);
});

// ---- message handling -------------------------------------------------------------------------

test("a model-supplied message wins over the rule default", () => {
    const target = field("Listen On", [
        rule("common.validate.number.range", {
            args: { min: 1, max: 65535 },
            message: "Port must be between {min} and {max}",
        }),
    ]);
    assert.deepEqual(messages(evaluateClientRules(target, "0")), ["Port must be between 1 and 65535"]);
});

test("interpolation substitutes label and value, and leaves unknown placeholders visible", () => {
    const target = field("Listener Name", []);
    assert.equal(interpolateMessage("{label}: '{value}'", {}, target, "1bad"), "Listener Name: '1bad'");
    assert.equal(interpolateMessage("{label} needs {nope}", {}, target, "x"), "Listener Name needs {nope}");
});

// ---- degradation ------------------------------------------------------------------------------

test("unknown and ls.* rule ids are skipped, never failed", () => {
    assert.deepEqual(evaluateClientRules(field("X", [rule("common.validate.from.the.future")]), ""), []);
    assert.deepEqual(evaluateClientRules(field("X", [rule("ls.validate.unique.listener.name")]), ""), []);
});

test("read-only and disabled fields are exempt", () => {
    const readOnly = field("X", [rule("common.validate.required")], { editable: false });
    const disabled = field("X", [rule("common.validate.required")], { enabled: false });
    assert.deepEqual(evaluateClientRules(readOnly, ""), []);
    assert.deepEqual(evaluateClientRules(disabled, ""), []);
});

// ---- buildValidate ----------------------------------------------------------------------------

test("buildValidate exposes only ERROR rules so warnings cannot block submit", () => {
    const target = field("Listen On", [
        rule("common.validate.required"),
        rule("common.validate.port", { severity: "WARNING" }),
    ]);
    const validate = buildValidate(target);
    const keys = Object.keys(validate);
    assert.equal(keys.length, 1);
    assert.ok(keys[0].startsWith("common.validate.required"));
    assert.equal(validate[keys[0]](""), "Listen On is required");
    assert.equal(validate[keys[0]]("8080"), true);
});

test("buildValidate keeps repeated rule ids distinct", () => {
    const target = field("Topic", [
        rule("common.validate.regex", { args: { pattern: "^[a-z]+$" } }),
        rule("common.validate.regex", { args: { pattern: "^.{3,}$" } }),
    ]);
    assert.equal(Object.keys(buildValidate(target)).length, 2);
});

// ---- vscode.validate.unique.in.form -----------------------------------------------------------

test("unique.in.form fails only when a sibling shares the value", () => {
    const target = field("Param", [rule("vscode.validate.unique.in.form", { args: { scope: "params" } })]);
    const duplicate = { getSiblingValues: () => ["id", "id", "name"] };
    const unique = { getSiblingValues: () => ["id", "name"] };
    assert.deepEqual(messages(evaluateClientRules(target, "id", duplicate)), ["Param must be unique"]);
    assert.deepEqual(evaluateClientRules(target, "id", unique), []);
});

test("unique.in.form skips when no sibling resolver is supplied", () => {
    const target = field("Param", [rule("vscode.validate.unique.in.form", { args: { scope: "params" } })]);
    assert.deepEqual(evaluateClientRules(target, "id"), []);
});

// ---- vscode.validate.file.exists --------------------------------------------------------------

test("file.exists reports a missing file and accepts a present one", async () => {
    const target = field("Private Key", [rule("vscode.validate.file.exists")]);
    const listWorkspaceFiles = async () => ({
        workspaceRoot: "/ws",
        files: [{ relativePath: "certs/key.pem", path: "/ws/certs/key.pem" }],
    });
    assert.deepEqual(
        (await evaluateAsyncClientRules(target, "certs/missing.pem", { listWorkspaceFiles })).map((f) => f.message),
        ["File not found: certs/missing.pem"]
    );
    assert.deepEqual(await evaluateAsyncClientRules(target, "certs/key.pem", { listWorkspaceFiles }), []);
});

test("file.exists enforces the extension allow-list", async () => {
    const target = field("Private Key", [
        rule("vscode.validate.file.exists", { args: { extensions: [".pem", ".key"] } }),
    ]);
    const listWorkspaceFiles = async () => ({
        workspaceRoot: "/ws",
        files: [{ relativePath: "certs/key.txt", path: "/ws/certs/key.txt" }],
    });
    assert.equal((await evaluateAsyncClientRules(target, "certs/key.txt", { listWorkspaceFiles })).length, 1);
});

test("file.exists stays silent when the host listing is unavailable", async () => {
    const target = field("Private Key", [rule("vscode.validate.file.exists")]);
    const throwing = async () => {
        throw new Error("host unreachable");
    };
    assert.deepEqual(await evaluateAsyncClientRules(target, "certs/key.pem", { listWorkspaceFiles: throwing }), []);
    assert.deepEqual(await evaluateAsyncClientRules(target, "certs/key.pem", {}), []);
});

test("hasAsyncClientRules gates the round trip", () => {
    assert.equal(hasAsyncClientRules(field("X", [rule("vscode.validate.file.exists")])), true);
    assert.equal(hasAsyncClientRules(field("X", [rule("common.validate.required")])), false);
});

// ---- merge ordering ---------------------------------------------------------------------------

const diagnostic = (message, severity, source, ruleId = "r") => ({ rule: ruleId, message, severity, source });

test("merge puts ERRORs before WARNINGs and orders producers fastest-first", () => {
    const merged = mergeFieldDiagnostics({
        client: [diagnostic("client warn", "WARNING", "client", "a"), diagnostic("client err", "ERROR", "client", "b")],
        ls: [diagnostic("ls err", "ERROR", "ls", "c")],
        compiler: [diagnostic("compiler err", "ERROR", "compiler", "d")],
        version: 1,
        isValidating: false,
    });
    assert.deepEqual(merged.map((d) => d.message),
        ["client err", "ls err", "compiler err", "client warn"]);
});

test("merge collapses the same failure reported by both the client and the server", () => {
    const merged = mergeFieldDiagnostics({
        client: [diagnostic("Name is required", "ERROR", "client", "common.validate.required")],
        ls: [diagnostic("Name is required", "ERROR", "ls", "common.validate.required")],
        compiler: [],
        version: 1,
        isValidating: false,
    });
    assert.equal(merged.length, 1);
    assert.equal(merged[0].source, "client");
});

test("merge keeps compiler diagnostics that rule results do not duplicate", () => {
    const merged = mergeFieldDiagnostics({
        client: [diagnostic("Name is required", "ERROR", "client", "common.validate.required")],
        ls: [],
        compiler: [diagnostic("undefined symbol 'x'", "ERROR", "compiler", "compiler")],
        version: 1,
        isValidating: false,
    });
    assert.equal(merged.length, 2, "compiler diagnostics are never suppressed by rule results");
});
