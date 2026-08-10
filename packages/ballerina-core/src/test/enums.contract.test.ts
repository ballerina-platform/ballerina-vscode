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

// L1 (contract) — enum contract INVARIANTS.
//
// `@wso2/ballerina-core` is ~95% compile-time-only types; the runtime-testable
// contract surface is its enums, which are the discriminants that both the
// extension host and the webviews branch on and that cross the LS/RPC wire as
// JSON. These are NOT per-enum hand-written tests — every enum exported by the
// contract modules is auto-discovered and each rule is asserted over ALL of them,
// so a newly added enum is covered for free and a whole class of bug (duplicate
// values, non-string wire values, barrel name collisions) is caught for present
// and future enums alike.
//
// The enum-bearing contract modules are imported directly from source (not the
// `../index` barrel, which drags React/vscode runtime deps unsuitable for a node
// env). Their type-only imports are elided by ts-jest, so this stays dependency-free.

import * as ballerina from "../interfaces/ballerina";
import * as ai from "../interfaces/ai-panel";
import * as bi from "../interfaces/bi";
import * as common from "../interfaces/common";
import * as component from "../interfaces/component";
import * as configSpec from "../interfaces/config-spec";
import * as dataMapper from "../interfaces/data-mapper";
import * as performance from "../interfaces/performance";
import * as service from "../interfaces/service";
import * as sharedTypes from "../interfaces/shared-types";
import * as store from "../interfaces/store";
import * as extendedLangClient from "../interfaces/extended-lang-client";

// Each entry is a contract module namespace. Add a module here when it starts
// exporting enums; discovery does the rest.
const MODULES: Record<string, Record<string, unknown>> = {
    "ballerina.ts": ballerina,
    "ai-panel.ts": ai,
    "bi.ts": bi,
    "common.ts": common,
    "component.ts": component,
    "config-spec.ts": configSpec,
    "data-mapper.ts": dataMapper,
    "performance.ts": performance,
    "service.ts": service,
    "shared-types.ts": sharedTypes,
    "store.ts": store,
    "extended-lang-client.ts": extendedLangClient,
};

// Enums whose values are intentionally NUMERIC (not string), each verified by hand:
//   - GenerationType, WizardType: webview-internal UI state, never serialized to the
//     LS/RPC wire. If one ever becomes part of a wire contract, convert it to a string
//     enum and remove it here.
//   - TriggerKind: intentionally mirrors the LSP `CompletionTriggerKind` protocol enum
//     (INVOKED=1, TRIGGER_CHARACTER=2, …), which the LSP spec defines as integers; the
//     LS expects the integer, so numeric is correct on the wire here.
// The wire-safety invariant fails closed for any NEW numeric enum, forcing a conscious
// decision rather than a silent regression.
const KNOWN_NUMERIC_ENUMS = new Set<string>(["GenerationType", "WizardType", "TriggerKind"]);

interface DiscoveredEnum {
    module: string;
    name: string;
    /** forward key→value entries only (numeric enums also carry a reverse map) */
    entries: Array<[string, string | number]>;
    numeric: boolean;
}

/**
 * A TS enum compiles to a plain object. String enums are `{KEY: "value"}`; numeric
 * enums additionally carry a reverse mapping `{0: "KEY"}`. Treat an export as
 * enum-like when it is a plain object whose values are all primitive strings/numbers.
 * Returns the forward entries (dropping numeric reverse-map keys) or null.
 */
function asEnum(value: unknown): { entries: Array<[string, string | number]>; numeric: boolean } | null {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        return null;
    }
    const all = Object.entries(value as Record<string, unknown>);
    if (all.length === 0) {
        return null;
    }
    // every value must be a primitive string or number to qualify as an enum
    if (!all.every(([, v]) => typeof v === "string" || typeof v === "number")) {
        return null;
    }
    const numeric = all.some(([, v]) => typeof v === "number");
    // forward entries: for numeric enums, keep only name→number (drop the numeric
    // reverse-map keys, which are numeric strings pointing back to the member name).
    const entries = numeric
        ? all.filter(([k, v]) => typeof v === "number" && !/^\d+$/.test(k)) as Array<[string, number]>
        : all as Array<[string, string]>;
    if (entries.length === 0) {
        return null;
    }
    return { entries, numeric };
}

function discoverEnums(): DiscoveredEnum[] {
    const found: DiscoveredEnum[] = [];
    for (const [module, ns] of Object.entries(MODULES)) {
        for (const [name, exported] of Object.entries(ns)) {
            const e = asEnum(exported);
            if (e) {
                found.push({ module, name, entries: e.entries, numeric: e.numeric });
            }
        }
    }
    return found;
}

const ENUMS = discoverEnums();
const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

describe("ballerina-core enum contracts", () => {
    it("discovers the enum surface (guards against a broken import graph)", () => {
        // 28 `export enum`s exist across the contract modules today. A collapse to
        // near-zero means an import failed silently and every per-enum rule below
        // would vacuously pass — so assert the surface is present.
        expect(ENUMS.length).toBeGreaterThanOrEqual(25);
    });

    it("enum names are unique across contract modules (no barrel `export *` collision)", () => {
        // ../index re-exports every module with `export *`; two enums sharing a name
        // silently shadow each other at the barrel. Assert names are globally unique.
        const byName = new Map<string, string[]>();
        for (const e of ENUMS) {
            byName.set(e.name, [...(byName.get(e.name) ?? []), e.module]);
        }
        const collisions = [...byName.entries()].filter(([, mods]) => mods.length > 1);
        expect(collisions).toEqual([]);
    });

    describe.each(ENUMS.map((e) => [`${e.module} · ${e.name}`, e] as [string, DiscoveredEnum]))(
        "%s",
        (_label, e) => {
            it("has at least one member", () => {
                expect(e.entries.length).toBeGreaterThan(0);
            });

            it("member keys are valid identifiers", () => {
                const bad = e.entries.map(([k]) => k).filter((k) => !IDENTIFIER.test(k));
                expect(bad).toEqual([]);
            });

            it("member values are unique (no accidental duplicate/copy-paste)", () => {
                const values = e.entries.map(([, v]) => v);
                expect(new Set(values).size).toBe(values.length);
            });

            it("string members are non-empty", () => {
                const empties = e.entries.filter(([, v]) => v === "");
                expect(empties).toEqual([]);
            });
        }
    );

    // Wire-safety: enums crossing the LS/RPC boundary are serialized as JSON, where a
    // string enum round-trips as its value but a numeric enum round-trips as an opaque
    // integer that the other side cannot map back to the member. So every enum must be
    // string-valued unless explicitly known to be webview-internal (KNOWN_NUMERIC_ENUMS).
    describe("wire-safety: enums are string-valued", () => {
        it.each(ENUMS.map((e) => [`${e.module} · ${e.name}`, e] as [string, DiscoveredEnum]))(
            "%s",
            (_label, e) => {
                if (KNOWN_NUMERIC_ENUMS.has(e.name)) {
                    // documented internal exception — assert it is still numeric so the
                    // allowlist doesn't silently outlive the enum it was granted for.
                    expect(e.numeric).toBe(true);
                    return;
                }
                expect(e.numeric).toBe(false);
                expect(e.entries.every(([, v]) => typeof v === "string")).toBe(true);
            }
        );
    });
});
