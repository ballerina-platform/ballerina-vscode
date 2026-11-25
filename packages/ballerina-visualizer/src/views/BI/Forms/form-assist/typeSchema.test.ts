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

import type { Member, Type } from "@wso2/ballerina-core";

// The core barrel loads an ESM-only dependency jest can't parse; the schema needs only these helpers.
jest.mock("@wso2/ballerina-core", () => ({
    ...jest.requireActual("@wso2/ballerina-core/lib/utils/form-property-utils"),
    ...jest.requireActual("@wso2/ballerina-core/lib/utils/text-array"),
}));
import { applyToType, describeType } from "./typeSchema";

const field = (name: string, type: string | Type, extra: Partial<Member> = {}): Member =>
    ({ kind: "FIELD", name, type, refs: ["ref"], docs: "", ...extra });

const record = (members: Member[]): Type => ({
    name: "Order", editable: true, metadata: { label: "", description: "" } as Type["metadata"], properties: {},
    codedata: { node: "RECORD" } as Type["codedata"], members, allowAdditionalFields: false,
});

describe("type form Copilot schema", () => {
    it("describes a record's name, flags and fields, with the project's types", () => {
        const described = describeType(record([field("id", "string", { docs: "Order \"ID\"", optional: true })]), ["Customer"]);
        expect(described.slots.map((slot) => slot.path)).toEqual(["name", "kind", "allowAdditionalFields", "isReadOnly", "isPublic"]);
        const [fields] = described.groups;
        expect(fields.rows).toEqual([{ name: "id", type: "string", optional: "true", defaultValue: "", docs: "\"Order \\\"ID\\\"\"", readonly: "false" }]);
        expect(fields.item.find((item) => item.key === "defaultValue").typeFrom).toBe("type");
        expect(fields.description).toContain("Customer");
    });

    it("has no schema for kinds Copilot can't fill yet", () => {
        expect(describeType({ ...record([]), codedata: { node: "CLASS" } as Type["codedata"] })).toBeUndefined();
    });

    it("applies rows by field name, keeping what the form doesn't show", () => {
        const inline = { name: "", members: [] } as unknown as Type;
        const before = record([field("id", "string"), field("address", inline, { typeName: "record {}" })]);
        const after = applyToType(before, {
            values: { name: "Shipment", isReadOnly: "true" },
            groups: { fields: [
                { name: "id", type: "string", optional: "false", docs: "\"The ID\"" },
                { name: "address", type: "record {}" },
                { name: "createdAt", type: "time:Utc", optional: "true", defaultValue: "" },
            ] },
            imports: { time: "ballerina/time" },
        });
        expect(after.name).toBe("Shipment");
        expect(after.properties.isReadOnly.value).toBe("true");
        expect(after.members.map((member) => member.name)).toEqual(["id", "address", "createdAt"]);
        expect(after.members[0]).toMatchObject({ refs: ["ref"], docs: "The ID", optional: false });
        expect(after.members[1].type).toBe(inline);
        expect(after.members[2]).toMatchObject({ kind: "FIELD", type: "time:Utc", optional: true, defaultValue: undefined, imports: { time: "ballerina/time" } });
    });

    it("fills an enum's members", () => {
        const enumType = { ...record([]), codedata: { node: "ENUM" } as Type["codedata"] };
        const after = applyToType(enumType, { groups: { members: [{ name: "CARD" }, { name: "WALLET" }] } });
        expect(after.members).toEqual([
            { kind: "ENUM_MEMBER", name: "CARD", type: "string", refs: [] },
            { kind: "ENUM_MEMBER", name: "WALLET", type: "string", refs: [] },
        ]);
    });

    it("switches a record to an enum with the members the reply lists", () => {
        const next = applyToType(record([field("method", "string")]), {
            values: { kind: "ENUM", name: "PaymentMethod" },
            groups: { members: [{ name: "CARD" }, { name: "CASH" }, { name: "APPLE_PAY" }] },
        });
        expect(next.codedata.node).toBe("ENUM");
        expect(next.name).toBe("PaymentMethod");
        expect(next.members.map((member) => [member.kind, member.name])).toEqual([["ENUM_MEMBER", "CARD"], ["ENUM_MEMBER", "CASH"], ["ENUM_MEMBER", "APPLE_PAY"]]);
    });

    it("fills a union's member types and an array's element and size", () => {
        const union = applyToType(record([]), { values: { kind: "UNION" }, groups: { unionMembers: [{ type: "string" }, { type: "int" }] } });
        expect(union.codedata.node).toBe("UNION");
        expect(union.members.map((member) => member.type)).toEqual(["string", "int"]);
        const array = applyToType(record([]), { values: { kind: "ARRAY", elementType: "Order", arraySize: "3" } });
        expect(array.members.map((member) => member.type)).toEqual(["Order"]);
        expect(array.properties?.arraySize?.value).toBe("3");
    });

    it("sets an enum member's value", () => {
        const next = applyToType(record([]), { values: { kind: "ENUM" }, groups: { members: [{ name: "CARD", value: "\"card\"" }] } });
        expect(next.members[0].defaultValue).toBe("\"card\"");
    });

    it("keeps a saved type's name and kind", () => {
        const saved = record([field("id", "string")]);
        expect(describeType(saved, [], false).slots.map((slot) => slot.path)).not.toContain("name");
        const savedEnum = { ...saved, codedata: { ...saved.codedata, node: "ENUM" } } as Type;
        const described = describeType(savedEnum, [], false)!;
        expect(described.groups.map((group) => group.id)).toEqual(["members"]);
        expect(described.slots).toEqual([]);
        const next = applyToType(saved, { values: { name: "Other", kind: "ENUM" } }, false);
        expect([next.name, next.codedata.node]).toEqual([saved.name, "RECORD"]);
    });
});
