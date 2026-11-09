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
// it catches the whole class of bug (#1491, #105, and any future connector), not one
// case. Grow coverage by adding actions to ACTIONS; the rules stay the same.
// Requires the sampled connectors to be resolvable (cached or pulled); skips with no
// Ballerina distribution.

import * as fs from "fs";
import * as path from "path";
import { LsHarness, resolveBalCommand } from "@wso2/test-config/ls-harness";

const bal = resolveBalCommand();
const projectRoot = path.join(__dirname, "fixtures", "mysql-batch");
const mainBal = path.join(projectRoot, "main.bal");

// Connector actions to sample. Each is one data point the invariants run over.
// Add more (any org/module/object/symbol resolvable in the fixture project) to widen coverage.
const ACTIONS = [
    { org: "ballerinax", module: "mysql", object: "Client", symbol: "batchExecute" },
    { org: "ballerinax", module: "mysql", object: "Client", symbol: "query" },
    { org: "ballerinax", module: "mysql", object: "Client", symbol: "execute" },
];

const ARRAY_EDITOR_TYPES = new Set(["REPEATABLE_LIST"]);

function isArrayTyped(prop: any): boolean {
    return (
        /\[\]\s*$/.test(prop?.valueTypeConstraint ?? "") ||
        (prop?.typeMembers ?? []).some((m: any) => m?.kind === "ARRAY_TYPE")
    );
}

interface Prop { key: string; action: string; prop: any; }

const describeLs = bal ? describe : describe.skip;

describeLs("node-template form-field type invariants", () => {
    const allProps: Prop[] = [];
    let sampled = 0;

    beforeAll(async () => {
        const ls = new LsHarness(bal!);
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
                continue;
            }
            sampled++;
            for (const [key, prop] of Object.entries(props)) {
                allProps.push({ key, action: `${a.module}.${a.symbol}`, prop });
            }
        }
        await ls.shutdown();
        if (sampled === 0) {
            // eslint-disable-next-line no-console
            console.warn("[node-template invariants] no connector actions resolved; assertions no-op.");
        }
    }, 120_000);

    // INVARIANT: a property whose type is an array must be offered as an array editor,
    // never a singular EXPRESSION/SQL editor.
    // This is INTENTIONALLY LEFT FAILING (red) — it surfaces open LS node-template bugs
    // (#1491, and the same class for #105). Do NOT silence it by deleting/skipping; it
    // turns green only once the LS maps every array-typed param to REPEATABLE_LIST.
    // Runs in the L3 (ls-integration) job, not the fast PR gate.
    it("array-typed params are offered as array editors (REPEATABLE_LIST)", () => {
        if (sampled === 0) {
            throw new Error("no connector actions resolved — cannot verify");
        }
        const violations = allProps
            .filter(({ prop }) => isArrayTyped(prop) && !ARRAY_EDITOR_TYPES.has(prop.valueType))
            .map(({ action, key, prop }) => `${action}.${key}: ${prop.valueTypeConstraint} offered as ${prop.valueType}`);
        // eslint-disable-next-line no-console
        if (violations.length) { console.log("[invariant violations]\n  " + violations.join("\n  ")); }
        expect(violations).toEqual([]);
    });

    // INVARIANT (should already hold): every editable, non-hidden property has a
    // non-empty valueType — a guard against malformed node templates.
    it("every editable property has a valueType", () => {
        if (sampled === 0) {
            return;
        }
        const missing = allProps
            .filter(({ prop }) => prop.editable && !prop.hidden)
            .filter(({ prop }) => !prop.valueType)
            .map(({ action, key }) => `${action}.${key}`);
        expect(missing).toEqual([]);
    });
});
