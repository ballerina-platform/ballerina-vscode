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
// Requires the sampled connectors to be resolvable (cached or pulled); skips with no
// locally built LS jar and no Ballerina distribution.

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

// The form shows only the first and the last mode of a property (FieldFactory.tsx), and
// opens the selected one, else the first.
function arrayModeViolation(prop: any): string | undefined {
    const types: any[] = prop?.types ?? [];
    const arrayIndex = types.findIndex((t) => t?.fieldType === "REPEATABLE_LIST");
    if (arrayIndex < 0) {
        return undefined;
    }
    const modes = types.map((t) => `${t?.fieldType}${t?.selected ? "*" : ""}`).join(", ");
    if (arrayIndex !== 0 && arrayIndex !== types.length - 1) {
        return `array mode is hidden in [${modes}]`;
    }
    const selected = types.find((t) => t?.selected);
    if (selected && !["REPEATABLE_LIST", "EXPRESSION"].includes(selected.fieldType)) {
        return `${selected.fieldType} is selected over the array mode in [${modes}]`;
    }
    return undefined;
}

interface Prop { key: string; action: string; prop: any; }

const describeLs = launch ? describe : describe.skip;

describeLs("node-template form-field type invariants", () => {
    const allProps: Prop[] = [];
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
                // eslint-disable-next-line no-console
                console.warn(`[node-template invariants] ${a.module}.${a.symbol} not resolved: `
                    + (resp?.errorMsg ?? "no response"));
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

    // INVARIANT: a property that has an array mode must offer it — the form shows that mode,
    // and no singular editor such as SQL is pre-selected over it (#1491).
    // Runs in the L3 (ls-integration) job, not the fast PR gate.
    it("array modes are offered by the form (REPEATABLE_LIST)", () => {
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
