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

// Only the pure helpers are under test; the hooks' RPC and editor dependencies stay out.
jest.mock("@wso2/ballerina-rpc-client", () => ({}));
jest.mock("../../../utils/bi", () => ({}));

import { canCompare, canExpand, comparisonsWith, DataItem, fieldItem, firstItem, fitsType, hintFor, hintScore, literalValues, rankByHint, recordStartersFrom } from "./useDataTree";

const item = (path: string, type = "string"): DataItem => ({ path, name: path.split(".").pop()!, type });

describe("fitsType", () => {
    it.each([
        ["string", "string", true],
        ["string|error", "string", true],
        ["string?", "string", false],
        ["string?", "string?", true],
        ["string", "string?", true],
        ["Order", "Invoice|http:BadRequest|error", false],
        ["Invoice", "Invoice | http:BadRequest | error", true],
        ["int", "decimal", false],
        ["string", "any", false],
        ["string", undefined, false],
        [undefined, "string", false],
    ])("%s fits %s: %s", (type, expected, fits) => {
        expect(fitsType(type, expected)).toBe(fits);
    });
});

describe("hints", () => {
    it("keeps a variable's name but drops labels every field has", () => {
        expect(hintFor("patientName", "Expression")).toBe("patientName");
        expect(hintFor(undefined, "Patient Id")).toBe(" patient id");
    });

    it("scores shared words, including name", () => {
        expect(hintScore(item("summary.patient.name"), "patientName")).toBe(2);
        expect(hintScore(item("summary.patient.ehr"), "patientName")).toBe(1);
        expect(hintScore(item("ehr"), "patientName")).toBe(0);
    });

    it("ranks the closest name first, then the one with fewer other words", () => {
        const ranked = rankByHint(
            [item("summary.patient.ehr"), item("summary.patient.ehrName"), item("ord.customer.patient.name"), item("summary.patient.name")],
            "patientName"
        );
        expect(ranked.map((entry) => entry.path))
            .toEqual(["summary.patient.name", "summary.patient.ehrName", "ord.customer.patient.name", "summary.patient.ehr"]);
    });
});

describe("canExpand", () => {
    it("opens the record inside a nil union, and a list written either way", () => {
        expect(canExpand(item("card", "PatientCard?"))).toBe(true);
        expect(canExpand(item("parts", "gmail:MessagePart[]|()"))).toBe(true);
    });

    it("does not open a value that may be an error, as field access on it does not compile", () => {
        expect(canExpand(item("summary", "PatientSummary|error"))).toBe(false);
        expect(canExpand(item("value", "string|error"))).toBe(false);
        expect(canExpand(item("either", "Order|Invoice"))).toBe(false);
    });

    it("follows the type's definition when the server knows it", () => {
        expect(canExpand({ ...item("country_code", "orders:CountryCode?"), opens: false })).toBe(false);
        expect(canExpand({ ...item("bancontact", "orders:Bancontact?"), opens: true })).toBe(true);
    });
});

describe("canCompare", () => {
    it("opens a value whose type allows listed values, besides what opens anyway", () => {
        expect(canCompare({ ...item("intent", "orders:CheckoutPaymentIntent?"), opens: false, values: ['"CAPTURE"'] })).toBe(true);
        expect(canCompare({ ...item("country_code", "orders:CountryCode?"), opens: false, values: [] })).toBe(false);
        expect(canCompare({ ...item("payer", "orders:Payer?"), opens: true, values: [] })).toBe(true);
    });
});

describe("recordStartersFrom", () => {
    it("turns the fill completion into a record literal with its placeholders' defaults", () => {
        const items = [
            { label: "readonly", insertText: "readonly " },
            { label: "Fill ai:ChatRespMessage Required Fields", insertText: 'message: ${1:""}, count: ${2:0}, tags: ${3:[]}' },
            { label: "message", insertText: 'message: ${1:""}' },
        ];
        expect(recordStartersFrom(items)).toEqual([{ name: "ai:ChatRespMessage", template: '{message: "", count: 0, tags: []}' }]);
    });

    it("fills nilable fields with nil and keeps the record on one line", () => {
        const items = [{ label: "Fill PatientSummary Required Fields", insertText: 'flags: [${1}],\npatient: {id: ${2:""}, age: ${3:}}' }];
        expect(recordStartersFrom(items)[0].template).toBe('{flags: [], patient: {id: "", age: ()}}');
    });

    it("offers one record per record in a union, in the type's order", () => {
        const items = [
            { label: "Fill Order Required Fields", insertText: 'id: ${1:""}' },
            { label: "Fill http:BadRequest Required Fields", insertText: "body: ${1:()}" },
        ];
        expect(recordStartersFrom(items).map((record) => record.name)).toEqual(["Order", "http:BadRequest"]);
    });

    it("offers nothing when the type is not a record", () => {
        expect(recordStartersFrom([{ label: "readonly", insertText: "readonly " }])).toEqual([]);
    });
});

describe("literalValues", () => {
    it("lists the strings of a union written in the type", () => {
        expect(literalValues('"GET"|"POST"')).toEqual(['"GET"', '"POST"']);
        expect(literalValues('"GET" | "POST"?')).toEqual(['"GET"', '"POST"']);
    });

    it("lists nothing for a named type or a union that takes other values", () => {
        expect(literalValues("orders:CheckoutPaymentIntent")).toEqual([]);
        expect(literalValues('string|"GET"')).toEqual([]);
        expect(literalValues("")).toEqual([]);
    });
});

describe("comparisonsWith", () => {
    it("compares the value with each allowed value", () => {
        const intent: DataItem = { path: "order.intent", name: "intent", type: "orders:CheckoutPaymentIntent?" };
        expect(comparisonsWith(intent, ['"CAPTURE"'])).toEqual([
            { path: 'order.intent == "CAPTURE"', name: '== "CAPTURE"', type: "boolean", enumMember: true },
        ]);
    });
});

describe("firstItem", () => {
    it("indexes a list that may be nil through ?: [], so the item and its fields compile", () => {
        const parts: DataItem = { path: "message.payload?.parts", name: "parts", type: "gmail:MessagePart[]?", opens: true };
        expect(firstItem(parts, "gmail:MessagePart")).toEqual({
            path: "(message.payload?.parts ?: [])[0]",
            name: "parts[0]",
            type: "gmail:MessagePart",
            elementOf: "(message.payload?.parts ?: [])",
            opens: true,
            nilable: false,
        });
    });

    it("indexes a list through ?: [] when a value before it may be nil", () => {
        const items: DataItem = { path: "order?.items", name: "items", type: "Item[]", nilable: true };
        expect(firstItem(items, "Item").path).toBe("(order?.items ?: [])[0]");
    });

    it("indexes a list that is always there directly", () => {
        const items: DataItem = { path: "order.items", name: "items", type: "Item[]" };
        expect(firstItem(items, "Item")).toMatchObject({ path: "order.items[0]", elementOf: "order.items" });
    });
});

describe("fieldItem", () => {
    const phone: DataItem = { path: "paypalOrder.payer?.phone?.phone_number", name: "phone_number", type: "orders:Phone", nilable: true };

    it("reads every field after a value that may be nil with ?.", () => {
        expect(fieldItem(phone, "country_code", "country_code", "string")).toEqual({
            path: "paypalOrder.payer?.phone?.phone_number?.country_code",
            name: "country_code",
            type: "string",
            nilable: true,
        });
    });

    it("writes the quoted name for a field named like a keyword, and shows it plain", () => {
        const card: DataItem = { path: "order.card", name: "card", type: "Card" };
        expect(fieldItem(card, "'type", "type", "string")).toMatchObject({ path: "order.card.'type", name: "type", nilable: false });
    });

    it("lets an optional field make the values after it nilable", () => {
        const order: DataItem = { path: "order", name: "order", type: "Order" };
        expect(fieldItem(order, "payer", "payer", "Payer?").nilable).toBe(true);
    });
});
