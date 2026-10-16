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

import { getFunctionSectionPage, PAGINATED_LIBRARY_SECTIONS, withPendingSections } from "./function-pagination";

describe("pending function sections", () => {
    it("adds only missing continuing sections without mutating or duplicating categories", () => {
        const original = [{ label: "Standard Library", items: [{ label: "first", insertText: "first" }] }];
        const result = withPendingSections(original, { "Standard Library": true, "Extended Library": true });
        expect(result).toEqual([...original, { label: "Extended Library", items: [] }]);
        expect(original).toHaveLength(1);
        expect(result[0]).toBe(original[0]);
        expect(withPendingSections([], { "Extended Library": false })).toEqual([]);
    });
});

// The registry page, not its post-filtering visible count, determines continuation for every library section.
describe.each(PAGINATED_LIBRARY_SECTIONS)("$title continuation", ({ org }) => {
    it.each([0, 1, 59, 60, 100])("honors raw continuation with %i visible rows", (visibleCount) => {
        expect(getFunctionSectionPage({ [org]: { hasMore: true, nextOffset: 180 } }, org,
            visibleCount, 60)).toEqual({ hasMore: true, nextOffset: 180 });
    });

    it.each([0, 1, 60, 100])("honors registry exhaustion with %i visible rows", (visibleCount) => {
        expect(getFunctionSectionPage({ [org]: { hasMore: false, nextOffset: 125 } }, org,
            visibleCount, 60, 120)).toEqual({ hasMore: false, nextOffset: 125 });
    });

    it.each([0, 1, 59, 60, 100])("retains legacy-server paging with %i visible rows", (visibleCount) => {
        expect(getFunctionSectionPage(undefined, org, visibleCount, 60, 120)).toEqual({
            hasMore: visibleCount >= 60, nextOffset: 180,
        });
    });

    it.each(["central", "index"] as const)("retains the %s source that owns the raw offset", (source) => {
        expect(getFunctionSectionPage({ [org]: { hasMore: true, nextOffset: 180, source } }, org,
            1, 60)).toEqual({ hasMore: true, nextOffset: 180, source });
    });

    it("does not reuse another section's continuation", () => {
        const otherOrg = org === "ballerina" ? "ballerinax" : "ballerina";
        expect(getFunctionSectionPage({ [otherOrg]: { hasMore: true, nextOffset: 500 } }, org,
            1, 60)).toEqual({ hasMore: false, nextOffset: 60 });
    });

    it("stops a non-advancing continuation instead of looping", () => {
        expect(getFunctionSectionPage({ [org]: { hasMore: true, nextOffset: 120 } }, org,
            0, 60, 120)).toEqual({ hasMore: false, nextOffset: 120 });
    });
});
