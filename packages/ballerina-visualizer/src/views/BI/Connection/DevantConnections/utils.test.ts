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

import { MarketplaceItem } from "@wso2/wso2-platform-core";
import { KB_SERVICE_TAG, filterConnectionMarketplaceItems } from "./utils";

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
});
