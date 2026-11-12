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

// L3-07: node-template form-field type INVARIANTS. These are not per-issue tests —
// each is a rule asserted over every property of every sampled connector action, so
// it catches the whole class of bug (#1491 and any future connector), not one
// case. Grow coverage by adding actions to ACTIONS; the rules stay the same.
// Every sampled connector must resolve (cached or pulled); skips with no locally built
// LS jar and no Ballerina distribution.
//
// Not run in CI: no workflow runs `test:ls-integration`. Run it locally after packing the
// LS (`./gradlew build pack -x test` in packages/ballerina-language-server): `pack` writes
// build/ballerina-language-server-<version>.jar, the jar this suite runs, so that it checks
// this repository's LS. `build` alone does not, and leaves any older jar in place to be
// tested instead. Without that jar it falls back to the LS of the installed Ballerina
// distribution, which lags this repository and can fail for bugs already fixed here.

import * as fs from "fs";
import * as path from "path";
import { LsHarness, resolveBalCommand, resolveLocalLsCommand } from "@wso2/test-config/ls-harness";

// Prefer the locally built LS jar, so the rules check this repository's LS rather than the one
// bundled with the installed distribution.
const launch = resolveLocalLsCommand() ?? resolveBalCommand();
const projectRoot = path.join(__dirname, "fixtures", "mysql-batch");
const mainBal = path.join(projectRoot, "main.bal");

// Connector actions to sample. Each is one data point the invariants run over.
// Add more (any org/module/packageName/object/symbol resolvable in the fixture project) to widen coverage.
// packageName is required: without it the LS looks up `<org>/null` on Central and returns an error.
const ACTIONS = [
    { org: "ballerinax", module: "mysql", packageName: "mysql", object: "Client", symbol: "batchExecute" },
    { org: "ballerinax", module: "mysql", packageName: "mysql", object: "Client", symbol: "query" },
    { org: "ballerinax", module: "mysql", packageName: "mysql", object: "Client", symbol: "execute" },
];

/** Splits a type at its top-level `separator`, leaving any inside brackets (`(int|string)[]`) alone. */
function splitTopLevel(type: string, separator: "|" | "&"): string[] {
    const members: string[] = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < type.length; i++) {
        const ch = type[i];
        if ("([{<".includes(ch)) {
            depth++;
        } else if (")]}>".includes(ch)) {
            depth--;
        } else if (ch === separator && depth === 0) {
            members.push(type.slice(start, i));
            start = i + 1;
        }
    }
    members.push(type.slice(start));
    return members.map((member) => member.trim());
}

/** Whether the type is wrapped in one pair of parentheses: `(T[])`, but not `(A)|(B)`. */
function isParenthesized(type: string): boolean {
    if (!type.startsWith("(") || !type.endsWith(")")) {
        return false;
    }
    let depth = 0;
    for (let i = 0; i < type.length - 1; i++) {
        depth += type[i] === "(" ? 1 : type[i] === ")" ? -1 : 0;
        if (depth === 0) {
            return false;
        }
    }
    return true;
}

/**
 * Whether the type is an array, or holds one as a union or intersection member: `T[]`, `T[3]`,
 * `T[]?`, `(T[])?`, `T[]|U`, `readonly & T[]`.
 */
function isArrayTyped(type: string | undefined): boolean {
    let t = type?.trim();
    if (!t) {
        return false;
    }
    if (t.endsWith("?")) {
        t = t.slice(0, -1).trim();
    }
    if (isParenthesized(t)) {
        return isArrayTyped(t.slice(1, -1));
    }
    for (const separator of ["|", "&"] as const) {
        const members = splitTopLevel(t, separator);
        if (members.length > 1) {
            return members.some(isArrayTyped);
        }
    }
    // A tuple (`[int, string]`) does not end in `[]` or `[N]`, so it is not taken for an array
    return /\[\s*\d*\s*\]$/.test(t);
}

// The LS offers an SQL editor for these types (Property.handlePrimitiveType)
const SQL_QUERY_TYPES = ["sql:ParameterizedQuery", "sql:ParameterizedCallQuery"];

// The array editor reads the item template from the first mode (FormArrayEditor.tsx), so the
// array mode has to lead. The form opens the selected mode, else the first. Returns why the
// property breaks the rule, or undefined when it keeps it.
function arrayModeViolation(prop: any): string | undefined {
    const types: any[] = prop?.types ?? [];
    const modes = types.map((t) => `${t?.fieldType}${t?.selected ? "*" : ""}`).join(", ");
    const arrayIndex = types.findIndex((t) => t?.fieldType === "REPEATABLE_LIST");
    if (arrayIndex < 0) {
        // The declared type is on the expression mode; an array type with no array mode is #1491 itself
        const declaredType = types.find((t) => t?.fieldType === "EXPRESSION")?.ballerinaType;
        return isArrayTyped(declaredType) ? `${declaredType} has no array mode in [${modes}]` : undefined;
    }
    if (arrayIndex !== 0) {
        return `array mode is not the first in [${modes}]`;
    }
    const selected = types.find((t) => t?.selected);
    if (selected && !["REPEATABLE_LIST", "EXPRESSION"].includes(selected.fieldType)) {
        return `${selected.fieldType} is selected over the array mode in [${modes}]`;
    }
    // A new item of an array of SQL queries opens in the SQL editor: the item template, which
    // the array editor builds each new item from, leads with a selected SQL mode (#1491)
    const itemTypes: any[] = types[0]?.template?.types ?? [];
    const itemType = itemTypes.find((t) => t?.fieldType === "EXPRESSION")?.ballerinaType;
    if (SQL_QUERY_TYPES.includes(itemType)
        && !itemTypes.some((t) => t?.fieldType === "SQL_QUERY" && t?.selected)) {
        const itemModes = itemTypes.map((t) => `${t?.fieldType}${t?.selected ? "*" : ""}`).join(", ");
        return `an item of ${itemType} has no selected SQL mode in [${itemModes}]`;
    }
    return undefined;
}

interface Prop { key: string; action: string; prop: any; }

const describeLs = launch ? describe : describe.skip;

describeLs("node-template form-field type invariants", () => {
    const allProps: Prop[] = [];
    const unresolved: string[] = [];
    let sampled = 0;

    beforeAll(async () => {
        const ls = new LsHarness(launch!);
        ls.start();
        await ls.initialize(projectRoot);
        ls.didOpen(mainBal, fs.readFileSync(mainBal, "utf8"));
        for (const a of ACTIONS) {
            const resp = await ls.request<any>("flowDesignService/getNodeTemplate", {
                filePath: mainBal,
                id: { node: "REMOTE_ACTION_CALL", ...a },
                position: { line: 2, offset: 4 },
                isLibrary: true,
            }).catch(() => undefined);
            const props = resp?.flowNode?.properties;
            if (!props) {
                unresolved.push(`${a.module}.${a.symbol}: ${resp?.errorMsg ?? "no response"}`);
                continue;
            }
            sampled++;
            for (const [key, prop] of Object.entries(props)) {
                allProps.push({ key, action: `${a.module}.${a.symbol}`, prop });
            }
        }
        await ls.shutdown();
    }, 120_000);

    // Every sampled action must resolve: an unresolved one (Central lookup, version mismatch)
    // would leave its properties out of every rule below, and the rules would pass without them.
    it("every sampled action resolves", () => {
        expect(unresolved).toEqual([]);
    });

    // INVARIANT: an array-typed property is offered as an array editor: it has an array mode,
    // that mode leads, no singular editor such as SQL is pre-selected over it, and each new item
    // of an array of SQL queries opens in the SQL editor (#1491).
    it("array-typed params are offered as array editors (REPEATABLE_LIST)", () => {
        if (sampled === 0) {
            throw new Error("no connector actions resolved — cannot verify");
        }
        const violations = allProps
            .map(({ action, key, prop }) => {
                const reason = arrayModeViolation(prop);
                return reason ? `${action}.${key}: ${reason}` : undefined;
            })
            .filter((v): v is string => v !== undefined);
        // eslint-disable-next-line no-console
        if (violations.length) { console.log("[invariant violations]\n  " + violations.join("\n  ")); }
        expect(violations).toEqual([]);
    });

    // INVARIANT (should already hold): every editable, non-hidden property has at least
    // one input mode — a guard against malformed node templates.
    it("every editable property has an input mode", () => {
        if (sampled === 0) {
            return;
        }
        const missing = allProps
            .filter(({ prop }) => prop.editable && !prop.hidden)
            .filter(({ prop }) => !(prop.types?.length > 0))
            .map(({ action, key }) => `${action}.${key}`);
        expect(missing).toEqual([]);
    });
});
