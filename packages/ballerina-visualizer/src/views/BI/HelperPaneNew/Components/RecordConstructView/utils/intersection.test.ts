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

import { TypeField } from "@wso2/ballerina-core";
import {
    isUnwrappableIntersection,
    normalizeIntersections,
    unwrapIntersection,
} from "./intersection";

const readonlyMember: TypeField = { typeName: "readonly", optional: false, defaultable: false, selected: false };

const plainRecord: TypeField = {
    typeName: "record",
    fields: [
        { typeName: "string", name: "name", optional: false, defaultable: false, selected: false },
        { typeName: "int", name: "id", optional: true, defaultable: false, selected: false },
    ],
    hasRestType: true,
    restType: { typeName: "anydata", optional: false, defaultable: false, isRestType: false, selected: false },
    optional: false,
    defaultable: false,
    selected: false,
};

const intersectionPet: TypeField = {
    typeName: "intersection",
    members: [
        readonlyMember,
        {
            typeName: "record",
            fields: [
                {
                    typeName: "array",
                    name: "photoUrls",
                    memberType: { typeName: "string", optional: false, defaultable: false, selected: false },
                    optional: false,
                    defaultable: false,
                    selected: false,
                },
                { typeName: "string", name: "name", optional: false, defaultable: false, selected: false },
                { typeName: "int", name: "id", optional: true, defaultable: false, selected: false },
            ],
            hasRestType: true,
            restType: { typeName: "anydata", optional: false, defaultable: false, isRestType: false, selected: false },
            optional: false,
            defaultable: false,
            selected: false,
        },
    ],
    optional: false,
    defaultable: false,
    selected: false,
};

/** `readonly & ServerCacheConfig` as a *field* of a record — the shape behind #1839. */
const cacheConfigField: TypeField = {
    name: "cacheConfig",
    typeName: "intersection",
    typeInfo: { name: "ServerCacheConfig", orgName: "ballerina", moduleName: "graphql", version: "1.16.0" },
    documentation: "The cache configurations for the fields",
    optional: true,
    defaultable: false,
    selected: false,
    members: [
        readonlyMember,
        {
            typeName: "record",
            hasRestType: false,
            fields: [
                { typeName: "boolean", name: "enabled", optional: false, defaultable: true, selected: false },
                { typeName: "decimal", name: "maxAge", optional: false, defaultable: true, selected: false },
                { typeName: "int", name: "maxSize", optional: false, defaultable: true, selected: false },
            ],
            optional: false,
            defaultable: false,
            selected: false,
        },
    ],
};

function clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value));
}

describe("isUnwrappableIntersection", () => {
    it("returns false for a plain record", () => {
        expect(isUnwrappableIntersection(plainRecord)).toBe(false);
    });

    it("returns true for an intersection with a single shape member", () => {
        expect(isUnwrappableIntersection(intersectionPet)).toBe(true);
        expect(isUnwrappableIntersection(cacheConfigField)).toBe(true);
    });

    it("returns true regardless of what the shape member is", () => {
        const cases = ["json", "map", "array", "union", "object", "[int, decimal]"];
        cases.forEach((typeName) => {
            expect(isUnwrappableIntersection({
                typeName: "intersection",
                members: [readonlyMember, { typeName, selected: false }],
            })).toBe(true);
        });
    });

    it("returns false when no single member carries the shape", () => {
        // Nothing to render in the intersection's place: two shape members, or none at all.
        expect(isUnwrappableIntersection({
            typeName: "intersection",
            members: [{ typeName: "record", selected: false }, { typeName: "record", selected: false }],
        })).toBe(false);
        expect(isUnwrappableIntersection({ typeName: "intersection", members: [readonlyMember] })).toBe(false);
        expect(isUnwrappableIntersection({ typeName: "intersection" })).toBe(false);
    });

    it("returns false for null/undefined", () => {
        expect(isUnwrappableIntersection(null)).toBe(false);
        expect(isUnwrappableIntersection(undefined)).toBe(false);
    });
});

describe("unwrapIntersection", () => {
    it("returns the input by identity when there is nothing to collapse", () => {
        const ambiguous: TypeField = {
            typeName: "intersection",
            members: [{ typeName: "record", selected: false }, { typeName: "record", selected: false }],
        };
        expect(unwrapIntersection(plainRecord)).toBe(plainRecord);
        expect(unwrapIntersection(ambiguous)).toBe(ambiguous);
    });

    it("extracts the inner record from an intersection", () => {
        const result = unwrapIntersection(intersectionPet);
        expect(result.typeName).toBe("record");
        expect(result.fields?.map((f) => f.name)).toEqual(["photoUrls", "name", "id"]);
    });

    it("extracts a non-record shape member too", () => {
        const result = unwrapIntersection({
            name: "chunking",
            typeName: "intersection",
            members: [
                { typeName: "union", members: [{ typeName: "AUTO" }, { typeName: "ALWAYS" }], selected: false },
                readonlyMember,
            ],
        });
        expect(result.typeName).toBe("union");
        expect(result.members?.map((m) => m.typeName)).toEqual(["AUTO", "ALWAYS"]);
    });

    it("carries the wrapper's identity onto the member", () => {
        const result = unwrapIntersection(cacheConfigField);
        expect(result.typeName).toBe("record");
        expect(result.name).toBe("cacheConfig");
        expect(result.typeInfo?.name).toBe("ServerCacheConfig");
        expect(result.optional).toBe(true);
        expect(result.defaultable).toBe(false);
        expect(result.documentation).toBe("The cache configurations for the fields");
    });

    it("keeps what the member itself states about the value", () => {
        const result = unwrapIntersection({
            name: "port",
            typeName: "intersection",
            documentation: "wrapper doc",
            value: "8080",
            members: [readonlyMember, { typeName: "int", documentation: "member doc", value: "9090" }],
        });
        expect(result.documentation).toBe("member doc");
        expect(result.value).toBe("9090");
    });

    it("collapses nested wrappers to a fixpoint", () => {
        const result = unwrapIntersection({
            name: "nested",
            typeName: "intersection",
            members: [
                readonlyMember,
                { typeName: "intersection", members: [readonlyMember, { typeName: "string" }] },
            ],
        });
        expect(result.typeName).toBe("string");
        expect(result.name).toBe("nested");
    });

    it("does not mutate the input", () => {
        const before = clone(cacheConfigField);
        unwrapIntersection(cacheConfigField);
        expect(cacheConfigField).toEqual(before);
    });
});

describe("normalizeIntersections", () => {
    it("returns the input by identity when the tree has no intersection", () => {
        expect(normalizeIntersections(plainRecord)).toBe(plainRecord);
    });

    it("collapses an intersection at the root", () => {
        expect(normalizeIntersections(intersectionPet).typeName).toBe("record");
    });

    it("collapses an intersection nested in a record field", () => {
        const config: TypeField = {
            name: "GraphqlResourceConfig",
            typeName: "record",
            fields: [
                { typeName: "int", name: "complexity", optional: true, defaultable: false, selected: false },
                cacheConfigField,
            ],
            optional: false,
            defaultable: false,
            selected: true,
        };

        const cacheConfig = normalizeIntersections(config).fields?.[1];
        expect(cacheConfig?.typeName).toBe("record");
        expect(cacheConfig?.name).toBe("cacheConfig");
        expect(cacheConfig?.typeInfo?.name).toBe("ServerCacheConfig");
        expect(cacheConfig?.fields?.map((f) => f.name)).toEqual(["enabled", "maxAge", "maxSize"]);
    });

    it("collapses an intersection nested in a union member", () => {
        const union: TypeField = { typeName: "union", members: [{ typeName: "string" }, cacheConfigField] };
        expect(normalizeIntersections(union).members?.[1].typeName).toBe("record");
    });

    it("collapses an intersection nested in an array's member type and elements", () => {
        const array: TypeField = {
            name: "configs",
            typeName: "array",
            memberType: cacheConfigField,
            elements: [cacheConfigField],
        };
        const result = normalizeIntersections(array);
        expect(result.memberType?.typeName).toBe("record");
        expect(result.elements?.[0].typeName).toBe("record");
    });

    it("collapses an intersection nested in an inclusion type", () => {
        const inclusion: TypeField = {
            typeName: "inclusion",
            inclusionType: { typeName: "record", fields: [cacheConfigField] },
        };
        expect(normalizeIntersections(inclusion).inclusionType?.fields?.[0].typeName).toBe("record");
    });

    it("collapses an intersection nested in a record's rest type", () => {
        const record: TypeField = { typeName: "record", hasRestType: true, restType: cacheConfigField };
        expect(normalizeIntersections(record).restType?.typeName).toBe("record");
    });

    it("shares every subtree it did not have to change", () => {
        const untouched: TypeField = { typeName: "string", name: "prefetchMethodName" };
        const config: TypeField = {
            typeName: "record",
            fields: [untouched, cacheConfigField],
            optional: false,
            defaultable: false,
            selected: true,
        };
        expect(normalizeIntersections(config).fields?.[0]).toBe(untouched);
    });

    it("does not mutate the input", () => {
        const config: TypeField = { typeName: "record", fields: [cacheConfigField] };
        const before = clone(config);
        normalizeIntersections(config);
        expect(config).toEqual(before);
    });
});
