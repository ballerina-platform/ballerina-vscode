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

import type { PlatformExtState } from "@wso2/ballerina-core/lib/rpc-types/platform-ext/interfaces";
import { MarketplaceItem } from "@wso2/wso2-platform-core";
import { KB_SERVICE_TAG, devantIdsOf, filterConnectionMarketplaceItems, generateInitialConnectionName, hasDevantProject, isValidDevantConnName } from "./utils";

const PAGE_SIZE = 24;

// Minimal MarketplaceItem stub; the filter only reads name, tags, and component.componentId.
const svc = (name: string, tags: string[] = [], componentId?: string): MarketplaceItem =>
    ({ name, tags, ...(componentId ? { component: { componentId } } : {}) } as unknown as MarketplaceItem);

const names = (items: MarketplaceItem[]) => items.map((item) => item.name);

describe("filterConnectionMarketplaceItems", () => {
    it("excludes knowledge base services", () => {
        const items = [svc("a"), svc("kb-1", [KB_SERVICE_TAG]), svc("b"), svc("kb-2", [KB_SERVICE_TAG])];

        const result = filterConnectionMarketplaceItems(items, "all", undefined, PAGE_SIZE);

        expect(names(result)).toEqual(["a", "b"]);
        expect(result.some((item) => item.tags?.includes(KB_SERVICE_TAG))).toBe(false);
    });

    it("preserves the order of the remaining items", () => {
        const items = [svc("c"), svc("kb", [KB_SERVICE_TAG]), svc("a"), svc("b")];

        const result = filterConnectionMarketplaceItems(items, "all", undefined, PAGE_SIZE);

        expect(names(result)).toEqual(["c", "a", "b"]);
    });

    it("caps the result at the page size", () => {
        const items = Array.from({ length: 30 }, (_, i) => svc(`svc-${i}`));

        const result = filterConnectionMarketplaceItems(items, "all", undefined, PAGE_SIZE);

        expect(result).toHaveLength(PAGE_SIZE);
        expect(result[0].name).toBe("svc-0");
        expect(result[PAGE_SIZE - 1].name).toBe("svc-23");
    });

    it("keeps a full page of connections even when knowledge bases are mixed in", () => {
        // Interleave knowledge bases with connections; KBs must not consume page slots.
        const items: MarketplaceItem[] = [];
        for (let i = 0; i < 30; i++) {
            items.push(svc(`svc-${i}`));
            if (i % 3 === 0) {
                items.push(svc(`kb-${i}`, [KB_SERVICE_TAG]));
            }
        }

        const result = filterConnectionMarketplaceItems(items, "all", undefined, PAGE_SIZE);

        expect(result).toHaveLength(PAGE_SIZE);
        expect(result.some((item) => item.tags?.includes(KB_SERVICE_TAG))).toBe(false);
        expect(result[0].name).toBe("svc-0");
    });

    it("excludes the selected component's own service in internal-services mode", () => {
        const items = [svc("own", [], "comp-1"), svc("other", [], "comp-2")];

        const result = filterConnectionMarketplaceItems(items, "internal-services", "comp-1", PAGE_SIZE);

        expect(names(result)).toEqual(["other"]);
    });

    it("keeps componentless services in internal-services mode when no component is selected", () => {
        // Regression: with selectedComponentId undefined, `componentId !== undefined` used to drop
        // every componentless item. With no component to exclude, all non-KB items should be kept.
        const items = [svc("no-comp-1"), svc("has-comp", [], "comp-2"), svc("no-comp-2")];

        const result = filterConnectionMarketplaceItems(items, "internal-services", undefined, PAGE_SIZE);

        expect(names(result)).toEqual(["no-comp-1", "has-comp", "no-comp-2"]);
    });
});

describe("hasDevantProject", () => {
    const state = (devant: Record<string, unknown> | undefined, isLoggedIn = true) =>
        ({ isLoggedIn, devant, integrations: [], session: null }) as unknown as PlatformExtState;
    const project = { id: "p1" };
    const org = { id: 101, handle: "acme" };

    it.each([
        ["a project and its organization, signed in", state({ selectedContext: { project, org } }), true],
        ["signed out", state({ selectedContext: { project, org } }, false), false],
        ["a project whose organization is not known yet", state({ selectedContext: { project } }), false],
        ["an organization with no project", state({ selectedContext: { org } }), false],
        ["no linked context", state({}), false],
        ["no Devant state", state(undefined), false],
    ])("%s", (_name, platformExtState, expected) => {
        expect(hasDevantProject(platformExtState)).toBe(expected);
    });

    it("answers false for no state at all", () => {
        expect(hasDevantProject(undefined)).toBe(false);
        expect(hasDevantProject(null)).toBe(false);
    });
});

describe("generateInitialConnectionName on Devant", () => {
    it("suggests a name the validator accepts, whatever the service is called", () => {
        for (const service of ["Orders / v1", "orders-api", "billing service", "2fa", "a"]) {
            const name = generateInitialConnectionName([], [], service);
            expect(isValidDevantConnName(name, [], [], false)).toBeFalsy();
        }
        expect(generateInitialConnectionName([], [], "Orders / v1")).toBe("Orders_v1");
        expect(generateInitialConnectionName([], [], "orders-api")).toBe("orders_api");
    });

    it("does not suggest a Ballerina keyword", () => {
        expect(generateInitialConnectionName([], [], "string")).toBe("string_conn");
        expect(generateInitialConnectionName([], [], "map")).toBe("map_conn");
    });

    it("counts up past a name taken in the diagram or in Devant", () => {
        expect(generateInitialConnectionName(["orders"], [], "orders")).toBe("orders1");
        expect(generateInitialConnectionName(["orders"], ["orders1"], "orders")).toBe("orders2");
        expect(generateInitialConnectionName([], ["orders-api"], "orders-api")).toBe("orders_api1");
    });
});

describe("devantIdsOf", () => {
    it("answers Devant's ids: the numeric organization, the component, the project and the environment's template", () => {
        const state = {
            devant: {
                selectedContext: { org: { id: 101, handle: "acme" }, project: { id: "proj-uuid" } },
                selectedComponent: { metadata: { id: "comp-uuid" } },
                selectedEnv: { id: "env-1", templateId: "tpl-dev" },
            },
        } as unknown as PlatformExtState;
        expect(devantIdsOf(state)).toEqual({ orgId: "101", componentId: "comp-uuid", projectId: "proj-uuid", envKey: "tpl-dev" });
    });

    it("answers blanks for what is not selected", () => {
        expect(devantIdsOf(undefined)).toEqual({ orgId: "", componentId: "", projectId: "", envKey: undefined });
    });
});
