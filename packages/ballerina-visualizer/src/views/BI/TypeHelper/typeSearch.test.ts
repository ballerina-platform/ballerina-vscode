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

import type { TypeHelperItem } from "@wso2/type-editor";
import { canCreateType, matchType, rankTypes, replaceTypeAt, toTypeOptions, typeQueryAt, TypeOption } from "./typeSearch";

const option = (name: string, source: TypeOption["source"], module?: string): TypeOption =>
    ({ item: { name, insertText: name } as TypeHelperItem, source, module });

describe("typeSearch", () => {
    const options = [
        option("HtmlChunkStrategy", "imported", "ai"),
        option("StringSchema", "imported", "ai"),
        option("Order", "project"),
        option("OrderStatus", "project"),
        option("string", "builtin"),
        option("stream", "builtin"),
        option("int", "builtin"),
    ];

    it("ranks exact, prefix and built-in matches above inner words", () => {
        expect(rankTypes(options, "str").map((o) => o.item.name)).toEqual(["string", "stream", "StringSchema", "HtmlChunkStrategy"]);
        expect(rankTypes(options, "string").map((o) => o.item.name)).toEqual(["string", "StringSchema"]);
        expect(rankTypes(options, "order")[0].item.name).toBe("Order");
        expect(rankTypes(options, "status").map((o) => o.item.name)).toEqual(["OrderStatus"]);
    });

    it("puts the standard library ahead of other Central packages", () => {
        const libraries = [
            { ...option("JWT", "library", "health.fhir.r4"), item: { name: "JWT", insertText: "JWT", codedata: { org: "ballerinax" } } as TypeHelperItem },
            { ...option("JwtIssuerConfig", "library", "jwt"), item: { name: "JwtIssuerConfig", insertText: "JwtIssuerConfig", codedata: { org: "ballerina" } } as TypeHelperItem },
            { ...option("JWT", "library", "plaid"), item: { name: "JWT", insertText: "JWT", codedata: { org: "someone" } } as TypeHelperItem },
        ];
        expect(rankTypes(libraries, "jwt").map((o) => o.module)).toEqual(["health.fhir.r4", "plaid", "jwt"]);
        expect(rankTypes(libraries, "jwtiss").map((o) => o.module)).toEqual(["jwt"]);
    });

    it("narrows a module-qualified name to that module", () => {
        const typed = [option("Client", "imported", "http"), option("Client", "imported", "graphql"), option("ClientError", "imported", "http")];
        expect(rankTypes(typed, "http:Cli").map((o) => `${o.module}:${o.item.name}`)).toEqual(["http:Client", "http:ClientError"]);
        expect(rankTypes(typed, "http:").length).toBe(2);
        expect(rankTypes([option("JWT", "library", "health.fhir.r4")], "r4:JW").length).toBe(1);
    });

    it("locates the match so it can be highlighted", () => {
        expect(matchType("HtmlChunkStrategy", "strat")).toEqual({ rank: 3, start: 9 });
        expect(matchType("myOrders", "der")).toEqual({ rank: 4, start: 4 });
        expect(matchType("int", "x")).toBeUndefined();
    });

    it("drops anonymous type descriptors and duplicates", () => {
        const categories = [{ category: "Imported", items: [
            { name: "isolated service object {isolated resource function get x() returns int;}", insertText: "" },
            { name: "Client", insertText: "Client", codedata: { module: "http" } },
            { name: "Client", insertText: "Client", codedata: { module: "http" } },
        ] }] as never;
        expect(toTypeOptions(categories, "imported").map((o) => `${o.module}:${o.item.name}`)).toEqual(["http:Client"]);
    });

    it("replaces only the type name around the cursor", () => {
        expect(typeQueryAt("map<str", 7)).toBe("str");
        expect(replaceTypeAt("map<str>", 7, "string")).toEqual({ text: "map<string>", cursor: 10 });
        expect(replaceTypeAt("stri", 2, "string")).toEqual({ text: "string", cursor: 6 });
    });

    it("offers to create a type only for a new plain name", () => {
        expect(canCreateType("Invoice", options)).toBe(true);
        expect(canCreateType("Order", options)).toBe(false);
        expect(canCreateType("map<int>", options)).toBe(false);
    });
});
