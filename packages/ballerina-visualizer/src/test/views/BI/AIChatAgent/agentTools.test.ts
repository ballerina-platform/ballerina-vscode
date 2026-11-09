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

import { CodeData, Property } from "@wso2/ballerina-core";
import { updateResourcePathProperty } from "../../../../views/BI/AIChatAgent/agentTools";

const makeProperty = (value: Property["value"], codedata?: CodeData): Property => ({
    metadata: { label: "Resource Path", description: "" },
    value,
    codedata,
    optional: false,
    editable: true,
});

describe("updateResourcePathProperty", () => {
    it("substitutes the matching path param in both value and originalName", () => {
        const prop = makeProperty("/pets/[petId]", { originalName: "/pets/[petId]" });
        const result = updateResourcePathProperty(prop, "petId", "42");
        expect(result.value).toBe("/pets/[42]");
        expect(result.codedata?.originalName).toBe("/pets/[42]");
    });

    it("preserves hyphen escaping in value while replacing in originalName", () => {
        // Display value carries the LS-escaped kebab segment; originalName is canonical.
        // The fix must replace only `[id]` and keep each field's escaping intact.
        const prop = makeProperty("/foo\\-bar/[id]", { originalName: "/foo-bar/[id]" });
        const result = updateResourcePathProperty(prop, "id", "9");
        expect(result.value).toBe("/foo\\-bar/[9]");
        expect(result.codedata?.originalName).toBe("/foo-bar/[9]");
    });

    it("falls back to value as the source when originalName is missing", () => {
        const prop = makeProperty("/items/[itemId]", { resourcePath: "/items/[itemId]" });
        const result = updateResourcePathProperty(prop, "itemId", "abc");
        expect(result.value).toBe("/items/[abc]");
        expect(result.codedata?.originalName).toBe("/items/[abc]");
    });

    it("creates codedata with originalName when the property has none", () => {
        const prop = makeProperty("/users/[userId]");
        const result = updateResourcePathProperty(prop, "userId", "u-1");
        expect(result.value).toBe("/users/[u-1]");
        expect(result.codedata?.originalName).toBe("/users/[u-1]");
    });

    it("leaves non-matching params and adjacent segments untouched", () => {
        const prop = makeProperty("/orgs/[orgId]/users/[userId]", {
            originalName: "/orgs/[orgId]/users/[userId]",
        });
        const result = updateResourcePathProperty(prop, "userId", "u9");
        expect(result.value).toBe("/orgs/[orgId]/users/[u9]");
        expect(result.codedata?.originalName).toBe("/orgs/[orgId]/users/[u9]");
    });

    it("returns the value unchanged when it is not a string", () => {
        const prop = makeProperty(["/a", "/b"], { originalName: "/a/[k]" });
        const result = updateResourcePathProperty(prop, "k", "v");
        expect(result.value).toEqual(["/a", "/b"]);
        expect(result.codedata?.originalName).toBe("/a/[v]");
    });

    it("does not mutate the input property", () => {
        const codedata: CodeData = { originalName: "/things/[id]" };
        const prop = makeProperty("/things/[id]", codedata);
        const snapshot = JSON.parse(JSON.stringify(prop));
        updateResourcePathProperty(prop, "id", "7");
        expect(prop).toEqual(snapshot);
    });

    it("is composable across successive replacements (matches per-key iteration)", () => {
        // The caller iterates over each form param; each call should apply only
        // its own substitution and feed forward into the next call.
        let prop = makeProperty("/orgs/[orgId]/users/[userId]", {
            originalName: "/orgs/[orgId]/users/[userId]",
        });
        prop = updateResourcePathProperty(prop, "orgId", "wso2");
        prop = updateResourcePathProperty(prop, "userId", "dan");
        expect(prop.value).toBe("/orgs/[wso2]/users/[dan]");
        expect(prop.codedata?.originalName).toBe("/orgs/[wso2]/users/[dan]");
    });
});
