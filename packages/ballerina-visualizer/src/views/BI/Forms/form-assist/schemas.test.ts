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

import type { FlowNode, Property } from "@wso2/ballerina-core";

// The core barrel loads an ESM-only dependency jest can't parse; the registry only needs alignRows from it.
jest.mock("@wso2/ballerina-core", () => jest.requireActual("@wso2/ballerina-core/lib/utils/form-property-utils"));
import { nodeAssistSchema } from "./schemas";
import ifNode from "./__fixtures__/if.json";
import matchNode from "./__fixtures__/match.json";
import forkNode from "./__fixtures__/fork.json";
import logNode from "./__fixtures__/log.json";
import waitNode from "./__fixtures__/wait.json";
import variableNode from "./__fixtures__/variable.json";
import dataMapperNode from "./__fixtures__/data_mapper_creation.json";

const node = (json: unknown) => structuredClone(json) as FlowNode;
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

    it("fills a call's message and its key-value map", () => {
        const { applied, described } = roundTrip(logNode, {
            values: { "properties.msg": "string `VIP order ${ord.id}`" },
            groups: { additionalValues: [{ key: "orderId", value: "ord.id" }] },
        });
        const msg = applied.properties.msg as Property;
        expect((msg.types.find((type) => type.selected) ?? msg.types[0]).fieldType).toBe("TEXT");
        expect(described.groups.find((group) => group.id === "additionalValues")!.rows).toEqual([{ key: "orderId", value: "ord.id" }]);
    });

    it("keeps a text field in text mode for a plain string", () => {
        const { applied } = roundTrip(logNode, { values: { "properties.msg": "\"VIP order\"" } });
        const selected = (applied.properties.msg as Property).types.find((type) => type.selected) ?? (applied.properties.msg as Property).types[0];
        expect(selected.fieldType).toBe("TEXT");
    });

    it("keeps a text field in text mode for a string template", () => {
        const { applied } = roundTrip(logNode, { values: { "properties.msg": "string `${line.name}: ${line.quantity}`" } });
        const selected = (applied.properties.msg as Property).types.find((type) => type.selected) ?? (applied.properties.msg as Property).types[0];
        expect(selected.fieldType).toBe("TEXT");
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

    it("fills a select that also takes an expression, switching it to its expression mode", () => {
        const withMaxIter = node(variableNode);
        withMaxIter.properties.maxIter = {
            metadata: { label: "Maximum Iterations", description: "" }, value: "", optional: true, editable: true, advanced: true,
            types: [
                { fieldType: "SINGLE_SELECT", selected: true, options: [{ label: "Tool Count", value: "INFER_TOOL_COUNT" }] },
                { fieldType: "EXPRESSION", ballerinaType: "int", selected: false },
            ],
        } as unknown as Property;
        const schema = nodeAssistSchema(withMaxIter)!;
        const slot = schema.describe(withMaxIter).slots.find((candidate) => candidate.path === "properties.maxIter")!;
        expect(slot.property.types?.find((type) => type.selected)?.fieldType).toBe("EXPRESSION");
        const selected = (applied: FlowNode) => (applied.properties.maxIter as Property).types?.find((type) => type.selected)?.fieldType;
        expect(selected(schema.apply(withMaxIter, { values: { "properties.maxIter": "100" } }))).toBe("EXPRESSION");
        expect(selected(schema.apply(withMaxIter, { values: { "properties.maxIter": "INFER_TOOL_COUNT" } }))).toBe("SINGLE_SELECT");
    });

    it("switches a record field to its expression mode for anything but a record literal", () => {
        const call = node(variableNode);
        call.properties.order = {
            metadata: { label: "Order", description: "" }, value: "", optional: false, editable: true,
            types: [
                { fieldType: "RECORD_MAP_EXPRESSION", ballerinaType: "Order", selected: true },
                { fieldType: "EXPRESSION", ballerinaType: "Order", selected: false },
            ],
        } as unknown as Property;
        const schema = nodeAssistSchema(call)!;
        const selected = (applied: FlowNode) => (applied.properties.order as Property).types?.find((type) => type.selected)?.fieldType;
        expect(selected(schema.apply(call, { values: { "properties.order": "orders[0]" } }))).toBe("EXPRESSION");
        expect(selected(schema.apply(call, { values: { "properties.order": "{id: \"ORD-1\"}" } }))).toBe("RECORD_MAP_EXPRESSION");
    });

    it("fills a prompt field, switching it to its expression mode for anything but a template", () => {
        const generate = node(variableNode);
        generate.properties.prompt = {
            metadata: { label: "Prompt", description: "" }, value: "", optional: false, editable: true,
            types: [
                { fieldType: "PROMPT", ballerinaType: "ai:Prompt", selected: true },
                { fieldType: "EXPRESSION", ballerinaType: "ai:Prompt", selected: false },
            ],
        } as unknown as Property;
        const schema = nodeAssistSchema(generate)!;
        expect(schema.describe(generate).slots.some((slot) => slot.path === "properties.prompt")).toBe(true);
        const selected = (applied: FlowNode) => (applied.properties.prompt as Property).types?.find((type) => type.selected)?.fieldType;
        expect(selected(schema.apply(generate, { values: { "properties.prompt": "`Summarize ${order}`" } }))).toBe("PROMPT");
        expect(selected(schema.apply(generate, { values: { "properties.prompt": "query" } }))).toBe("EXPRESSION");
    });

    it("sets a list that also takes an expression as one value, switching it to its expression mode", () => {
        const augment = node(variableNode);
        augment.properties.context = {
            metadata: { label: "Context", description: "" }, value: [], optional: false, editable: true,
            types: [
                { fieldType: "REPEATABLE_LIST", ballerinaType: "ai:QueryMatch[]", selected: true },
                { fieldType: "EXPRESSION", ballerinaType: "ai:QueryMatch[]", selected: false },
            ],
        } as unknown as Property;
        const schema = nodeAssistSchema(augment)!;
        expect(schema.describe(augment).slots.some((slot) => slot.path === "properties.context")).toBe(true);
        const applied = schema.apply(augment, { values: { "properties.context": "matches" } });
        const context = applied.properties.context as Property;
        expect(context.value).toBe("matches");
        expect(context.types?.find((type) => type.selected)?.fieldType).toBe("EXPRESSION");
    });

    it("fills a SQL query, switching it to its expression mode for anything but a template", () => {
        const query = node(variableNode);
        query.properties.sqlQuery = {
            metadata: { label: "SQL Query", description: "" }, value: "", optional: false, editable: true,
            types: [
                { fieldType: "SQL_QUERY", ballerinaType: "sql:ParameterizedQuery", selected: true },
                { fieldType: "EXPRESSION", ballerinaType: "sql:ParameterizedQuery", selected: false },
            ],
        } as unknown as Property;
        const schema = nodeAssistSchema(query)!;
        expect(schema.describe(query).slots.some((slot) => slot.path === "properties.sqlQuery")).toBe(true);
        const selected = (applied: FlowNode) => (applied.properties.sqlQuery as Property).types?.find((type) => type.selected)?.fieldType;
        expect(selected(schema.apply(query, { values: { "properties.sqlQuery": "`SELECT * FROM orders WHERE id = ${id}`" } }))).toBe("SQL_QUERY");
        expect(selected(schema.apply(query, { values: { "properties.sqlQuery": "ordersQuery" } }))).toBe("EXPRESSION");
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
