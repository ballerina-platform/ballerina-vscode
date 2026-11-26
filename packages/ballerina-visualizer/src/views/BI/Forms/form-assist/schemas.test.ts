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

import * as fs from "fs";
import * as path from "path";
import type { FlowNode, Property } from "@wso2/ballerina-core";

// The core barrel loads an ESM-only dependency jest can't parse; the registry only needs alignRows from it.
jest.mock("@wso2/ballerina-core", () => jest.requireActual("@wso2/ballerina-core/lib/utils/form-property-utils"));
import { nodeAssistSchema } from "./schemas";

// The node templates the language server sends, as its own tests pin them.
const template = (name: string): unknown => JSON.parse(fs.readFileSync(path.resolve(__dirname,
    "../../../../../../ballerina-language-server/flow-model-generator/modules/flow-model-generator-ls-extension/src/test/resources/node_template/config",
    `${name}.json`), "utf8")).output;
const ifNode = template("if");
const matchNode = template("match");
const forkNode = template("fork");
const logNode = template("function_call-log-printInfo");
const waitNode = template("wait");
const variableNode = template("variable");
const dataMapperNode = template("data_mapper-creation");

const node = (json: unknown) => structuredClone(json) as FlowNode;
const selectedMode = (property: Property) => (property.types?.find((type) => type.selected) ?? property.types?.[0])?.fieldType;
const roundTrip = (json: unknown, patch: Parameters<NonNullable<ReturnType<typeof nodeAssistSchema>>["apply"]>[1]) => {
    const schema = nodeAssistSchema(node(json))!;
    const applied = schema.apply(node(json), patch);
    return { applied, described: schema.describe(applied) };
};

describe("form assist node schemas", () => {
    it("adds else-if branches and an else to an If", () => {
        const { applied, described } = roundTrip(ifNode, {
            groups: { conditions: [{ condition: "ord.status == CANCELLED" }, { condition: "ord.customer.vip" }], else: [{}] },
        });
        expect(applied.branches.map((branch) => branch.codedata.node)).toEqual(["CONDITIONAL", "CONDITIONAL", "ELSE"]);
        expect(applied.branches[1].properties.condition.modified).toBe(true);
        expect(described.groups.find((group) => group.id === "conditions")!.rows)
            .toEqual([{ condition: "ord.status == CANCELLED" }, { condition: "ord.customer.vip" }]);
        expect(described.groups.find((group) => group.id === "else")!.rows).toEqual([{}]);
    });

    it("keeps the If's first branch and drops a removed else", () => {
        const withElse = roundTrip(ifNode, { groups: { conditions: [{ condition: "a" }], else: [{}] } }).applied;
        const { applied } = roundTrip(withElse, { groups: { else: [] } });
        expect(applied.branches.map((branch) => branch.label)).toEqual(["Then"]);
        expect(applied.branches[0].properties.condition.value).toBe("a");
    });

    it("sets a Match target and cases, keeping its On Failure branch last", () => {
        const { applied, described } = roundTrip(matchNode, {
            values: { "properties.matchTarget": "ord.status" },
            groups: { cases: [{ pattern: "PENDING" }, { pattern: "PAID" }], default: [{}] },
        });
        expect(applied.properties.matchTarget.value).toBe("ord.status");
        expect(applied.branches.map((branch) => branch.codedata.node)).toEqual(["CONDITIONAL", "CONDITIONAL", "CONDITIONAL", "ON_FAILURE"]);
        expect(described.groups.find((group) => group.id === "cases")!.rows).toEqual([{ pattern: "PENDING" }, { pattern: "PAID" }]);
        expect(described.groups.find((group) => group.id === "default")!.rows).toEqual([{}]);
    });

    it("names Fork workers and adds one", () => {
        const { applied, described } = roundTrip(forkNode, {
            groups: { workers: [{ name: "stock", type: "boolean" }, { name: "fraud", type: "boolean" }, { name: "audit", type: "" }] },
        });
        expect(applied.branches).toHaveLength(3);
        expect(described.groups[0].rows).toEqual([
            { name: "stock", type: "boolean" }, { name: "fraud", type: "boolean" }, { name: "audit", type: "" },
        ]);
    });

    it("describes a Variable's name, type and value as slots", () => {
        const { slots } = nodeAssistSchema(node(variableNode))!.describe(node(variableNode));
        expect(slots.map((slot) => slot.path)).toEqual(expect.arrayContaining(["properties.variable", "properties.type", "properties.expression"]));
        expect(slots.find((slot) => slot.path === "properties.expression")?.typeFrom).toBe("properties.type");
    });

    it("keeps the proposal's imports on the filled property", () => {
        const { applied } = roundTrip(logNode, {
            values: { "properties.msg": "time:utcToString(time:utcNow())" },
            imports: { time: "ballerina/time" },
        });
        expect((applied.properties.msg as Property).imports).toEqual({ time: "ballerina/time" });
    });

    it("fills a call's message and its key-value map, keeping a string or a string template in text mode", () => {
        const { applied, described } = roundTrip(logNode, {
            values: { "properties.msg": "string `VIP order ${ord.id}`" },
            groups: { additionalValues: [{ key: "orderId", value: "ord.id" }] },
        });
        expect(selectedMode(applied.properties.msg as Property)).toBe("TEXT");
        expect(selectedMode(roundTrip(logNode, { values: { "properties.msg": "\"VIP order\"" } }).applied.properties.msg as Property)).toBe("TEXT");
        expect(described.groups.find((group) => group.id === "additionalValues")!.rows).toEqual([{ key: "orderId", value: "ord.id" }]);
    });

    it("types a list's rows as its elements, with the list's imports", () => {
        const chat = {
            codedata: { node: "REMOTE_ACTION_CALL" },
            properties: {
                messages: {
                    metadata: { label: "Messages" }, editable: true, imports: { ai: "ballerina/ai" }, value: [],
                    types: [{
                        fieldType: "REPEATABLE_LIST", ballerinaType: "ai:ChatMessage[]", selected: true,
                        template: { metadata: { label: "Message" }, value: "", types: [{ fieldType: "EXPRESSION", ballerinaType: "ai:ChatMessage" }] },
                    }],
                },
            },
        };
        const row = nodeAssistSchema(node(chat))!.describe(node(chat)).groups[0].item[0].property;
        expect(row.types[0].ballerinaType).toBe("ai:ChatMessage");
        expect(row.imports).toEqual({ ai: "ballerina/ai" });
    });

    it("fills Wait futures", () => {
        const { described } = roundTrip(waitNode, { groups: { futures: [{ key: "stock", value: "stockFuture" }] } });
        expect(described.groups.find((group) => group.id === "futures")!.rows).toEqual([{ key: "stock", value: "stockFuture" }]);
    });

    it("writes data mapper inputs as named parameters from the template", () => {
        const { applied, described } = roundTrip(dataMapperNode, {
            groups: { parameters: [{ key: "customerName", type: "string", variable: "customerName" }] },
        });
        const params = applied.properties.parameters.value as unknown as Record<string, { value: Record<string, Property> }>;
        expect(params.customerName.value.type.value).toBe("string");
        expect(params.customerName.value.variable.value).toBe("customerName");
        expect(described.groups.find((group) => group.id === "parameters")!.rows)
            .toEqual([{ key: "customerName", type: "string", variable: "customerName" }]);
    });

    it("keeps each If branch's steps with its condition when a condition is inserted first", () => {
        const twoBranches = roundTrip(ifNode, { groups: { conditions: [{ condition: "vip" }, { condition: "email" }] } }).applied;
        twoBranches.branches[0].children = [{ id: "vip-step" } as FlowNode];
        twoBranches.branches[1].children = [{ id: "email-step" } as FlowNode];
        const { applied } = roundTrip(twoBranches, { groups: { conditions: [{ condition: "cancelled" }, { condition: "vip" }, { condition: "email" }] } });
        expect(applied.branches.map((branch) => [branch.properties.condition.value, branch.children[0]?.id ?? null]))
            .toEqual([["cancelled", null], ["vip", "vip-step"], ["email", "email-step"]]);
        expect(applied.branches.map((branch) => branch.label === "Then")).toEqual([true, false, false]);
    });

    it("keeps an edited If condition's steps", () => {
        const one = roundTrip(ifNode, { groups: { conditions: [{ condition: "vip" }] } }).applied;
        one.branches[0].children = [{ id: "vip-step" } as FlowNode];
        const { applied } = roundTrip(one, { groups: { conditions: [{ condition: "vip && paid" }] } });
        expect(applied.branches[0].children[0].id).toBe("vip-step");
    });

    it.each<[string, object, string, Record<string, string>]>([
        ["a select", { fieldType: "SINGLE_SELECT", options: [{ label: "Tool Count", value: "INFER_TOOL_COUNT" }] }, "EXPRESSION",
            { "100": "EXPRESSION", INFER_TOOL_COUNT: "SINGLE_SELECT" }],
        ["a record field", { fieldType: "RECORD_MAP_EXPRESSION" }, "RECORD_MAP_EXPRESSION",
            { "orders[0]": "EXPRESSION", "{id: \"ORD-1\"}": "RECORD_MAP_EXPRESSION" }],
        ["a prompt", { fieldType: "PROMPT" }, "PROMPT",
            { "`Summarize ${order}`": "PROMPT", "string `Math Tutor`": "PROMPT", query: "EXPRESSION" }],
        ["a list", { fieldType: "REPEATABLE_LIST" }, "EXPRESSION", { matches: "EXPRESSION" }],
        ["a SQL query", { fieldType: "SQL_QUERY" }, "SQL_QUERY", { "`SELECT * FROM orders WHERE id = ${id}`": "SQL_QUERY", ordersQuery: "EXPRESSION" }],
    ])("fills %s that also takes an expression, switching it to its expression mode when the value needs it", (_, type, offered, modes) => {
        const withInput = node(variableNode);
        withInput.properties.input = {
            metadata: { label: "Input", description: "" }, value: "", optional: false, editable: true,
            types: [{ ...type, selected: true }, { fieldType: "EXPRESSION", selected: false }],
        } as unknown as Property;
        const schema = nodeAssistSchema(withInput)!;
        expect(selectedMode(schema.describe(withInput).slots.find((slot) => slot.path === "properties.input")!.property)).toBe(offered);
        Object.entries(modes).forEach(([value, mode]) => {
            const input = schema.apply(withInput, { values: { "properties.input": value } }).properties.input as Property;
            expect([input.value, selectedMode(input)]).toEqual([value, mode]);
        });
    });

    it("offers a select and a toggle with no expression mode as they are, keeping a toggle's boolean", () => {
        const register = node(variableNode);
        register.properties.agent = {
            metadata: { label: "Agent", description: "" }, value: "", optional: false, editable: true,
            types: [{ fieldType: "SINGLE_SELECT", selected: true, options: [{ label: "Support", value: "supportAgent" }] }],
        } as unknown as Property;
        register.properties.wait = {
            metadata: { label: "Wait", description: "" }, value: false, optional: true, editable: true,
            types: [{ fieldType: "FLAG", selected: true }],
        } as unknown as Property;
        const schema = nodeAssistSchema(register)!;
        const slots = schema.describe(register).slots;
        expect(slots.find((slot) => slot.path === "properties.agent")?.property.types?.[0].fieldType).toBe("SINGLE_SELECT");
        expect(slots.find((slot) => slot.path === "properties.wait")?.value).toBe("false");
        const applied = schema.apply(register, { values: { "properties.agent": "supportAgent", "properties.wait": "true" } });
        expect((applied.properties.agent as Property).value).toBe("supportAgent");
        expect((applied.properties.wait as Property).value).toBe(true);
    });

    it("covers agent calls", () => {
        expect(nodeAssistSchema({ ...node(variableNode), codedata: { node: "AGENT_CALL" } } as FlowNode)).toBeDefined();
    });
});
