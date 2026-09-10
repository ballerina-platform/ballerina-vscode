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

// L1: what the record editor requires of every record config the LS hands it, asserted over a
// corpus of captured `typesManager/recordConfig` + `typesManager/findMatchingType` payloads.
//
// `ParameterBranch` dispatches on `typeName` and falls back to the leaf renderer for anything it
// does not know, and `RecordValueGenerator` (LS) falls back to emitting the type name as a string
// literal. So a node the dispatcher cannot place is not a cosmetic problem: it silently generates
// uncompilable source (product-integrator#1839, #710). Add a fixture under fixtures/recordConfigs/
// to guard a new shape — the invariants below run over it automatically.
//
// These payloads were captured from a language server that did not yet collapse intersections
// itself. A current one does (`IntersectionNormalizer`), so the corpus stands for what an older,
// distribution-provided LS still sends — which is exactly what `normalizeIntersections` is for.

import { TypeField } from "@wso2/ballerina-core";
import { loadFixtures } from "@wso2/test-config/fixtures";
import { isUnwrappableIntersection, normalizeIntersections } from "./intersection";

/** typeNames `Types/index.ts` maps to a renderer that descends into its children. */
const DISPATCHED_TYPE_NAMES = new Set(["record", "union", "enum", "array", "inclusion"]);

interface RecordConfigFixture {
    description?: string;
    recordConfig: TypeField;
}

const fixtures = loadFixtures<RecordConfigFixture>(__dirname, "fixtures", "recordConfigs");

/** Every node of the tree, paired with a path that names the offender when an invariant fails. */
function walk(node: TypeField, path = "root"): [string, TypeField][] {
    const label = (child: TypeField, slot: string, index?: number) =>
        `${path}.${slot}${index === undefined ? "" : `[${index}]`}${child.name ? `(${child.name})` : ""}`;

    const nodes: [string, TypeField][] = [[path, node]];
    (["fields", "members", "elements"] as const).forEach((slot) => {
        (node[slot] ?? []).forEach((child, index) => {
            if (child) {
                nodes.push(...walk(child, label(child, slot, index)));
            }
        });
    });
    (["memberType", "inclusionType", "restType"] as const).forEach((slot) => {
        const child = node[slot];
        if (child) {
            nodes.push(...walk(child, label(child, slot)));
        }
    });
    return nodes;
}

/** A node the user has to be able to open — it has something inside worth constructing. */
function hasConstructibleChildren(node: TypeField): boolean {
    return Boolean(node.fields?.length || node.members?.length || node.elements?.length ||
        node.inclusionType || node.memberType);
}

describe("record config invariants", () => {
    it("has fixtures to run", () => {
        expect(fixtures.length).toBeGreaterThan(0);
    });

    it("the corpus exercises intersections", () => {
        const wrapped = fixtures.filter(({ data }) =>
            walk(data.recordConfig).some(([, node]) => node.typeName === "intersection"));
        expect(wrapped.map(({ name }) => name).length).toBeGreaterThan(0);
    });

    describe.each(fixtures.map(({ name, data }) => [name, data] as [string, RecordConfigFixture]))(
        "%s",
        (_name, fixture) => {
            const normalized = normalizeIntersections(fixture.recordConfig);

            it("leaves no intersection wrapping a type the editor could have rendered", () => {
                const wrapped = walk(normalized)
                    .filter(([, node]) => isUnwrappableIntersection(node))
                    .map(([nodePath]) => nodePath);
                expect(wrapped).toEqual([]);
            });

            it("renders every node that has children through a renderer that descends", () => {
                const undispatched = walk(normalized)
                    .filter(([, node]) => hasConstructibleChildren(node) &&
                        !DISPATCHED_TYPE_NAMES.has(node.typeName))
                    .map(([nodePath, node]) => `${nodePath}: ${node.typeName}`);
                expect(undispatched).toEqual([]);
            });
        }
    );
});
