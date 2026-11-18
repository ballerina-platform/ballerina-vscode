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

// L1: what a connection form tells the language server about a field whose value is the argument itself, and how an
// existing connection's configurables open in it.

import type { ConnectionConfigurablePreview, FlowNode } from "@wso2/ballerina-core";
import { FormField, InputMode } from "@wso2/ballerina-side-panel";
import {
    adoptExistingConfigurables,
    connectionRangeAfterRename,
    fieldChoiceToSend,
    hasValue,
    isArgumentKind,
    isSameLineRange,
    mayUseConfigurable
} from "../../../../../views/BI/Forms/FlowNodeForm/fieldConfigurables";
import { isConfigurableValue } from "../../../../../views/BI/HelperPaneNew/Components/RecordFormView/configurables";

const TYPED = [InputMode.TEXT, InputMode.NUMBER, InputMode.BOOLEAN];
const NOT_TYPED = [InputMode.EXP, InputMode.SELECT, InputMode.RECORD, InputMode.TEXT_ARRAY];

describe("fieldChoiceToSend", () => {
    it("INVARIANT: a required field typed in is made configurable under the server's name", () => {
        TYPED.forEach((mode) => expect(fieldChoiceToSend(true, mode, undefined)).toBeUndefined());
    });

    it("INVARIANT: an optional field stays in source until the user checks it", () => {
        TYPED.forEach((mode) => {
            expect(fieldChoiceToSend(false, mode, undefined)).toEqual({ keep: true });
            expect(fieldChoiceToSend(false, mode, { keep: false })).toBeUndefined();
        });
    });

    it("INVARIANT: a value written as an expression, or chosen from a list, stays in source", () => {
        NOT_TYPED.forEach((mode) => {
            expect(fieldChoiceToSend(true, mode, undefined)).toEqual({ keep: true });
            expect(fieldChoiceToSend(true, mode, { name: "x" })).toEqual({ keep: true });
        });
    });

    it("a field the form hasn't shown is configured only when required", () => {
        expect(fieldChoiceToSend(true, undefined, undefined)).toBeUndefined();
        expect(fieldChoiceToSend(false, undefined, undefined)).toEqual({ keep: true });
    });

    it("an unchecked required field stays in source", () => {
        expect(fieldChoiceToSend(true, InputMode.TEXT, { keep: true })).toEqual({ keep: true });
    });

    it("sends the name the user gave, and whether the connection already uses it", () => {
        expect(fieldChoiceToSend(true, InputMode.TEXT, { name: "brokers" })).toEqual({ name: "brokers" });
        expect(fieldChoiceToSend(false, InputMode.TEXT, { name: "brokers", existing: true, declaration: { filePath: "/p/config.bal", line: 0, offset: 16 } }))
            .toEqual({ name: "brokers", existing: true });
    });
});

describe("field rules", () => {
    it("a choice that only names the configurable keeps it configurable", () => {
        expect(isConfigurableValue(false, { name: "brokers", existing: true })).toBe(true);
        expect(isConfigurableValue(true, { keep: true })).toBe(false);
        expect(isConfigurableValue(true, undefined)).toBe(true);
    });

    it("an empty string as the text box writes it is no value", () => {
        ["", "  ", "\"\"", "string ``", undefined, null].forEach((value) => expect(hasValue(value)).toBe(false));
        ["\"a\"", "string `a`", "0", "false"].forEach((value) => expect(hasValue(value)).toBe(true));
    });

    it("only an init parameter's argument can be a configurable", () => {
        ["REQUIRED", "DEFAULTABLE", "INCLUDED_FIELD"].forEach((kind) => expect(isArgumentKind(kind)).toBe(true));
        [undefined, "INCLUDED_RECORD_REST", "REST_PARAMETER"].forEach((kind) => expect(isArgumentKind(kind)).toBe(false));
    });

    it("a configurable is a plain name, not a literal", () => {
        expect(mayUseConfigurable("kafkaBootstrapServers")).toBe(true);
        expect(mayUseConfigurable("'client")).toBe(true);
        ["true", "false", "\"a\"", "5", "kafka:DES_BYTE_ARRAY", "", undefined].forEach((value) =>
            expect(mayUseConfigurable(value)).toBe(false));
    });
});

describe("adoptExistingConfigurables", () => {
    const field = (key: string, value: string): FormField => ({
        key,
        label: key,
        type: "EXPRESSION",
        value,
        optional: false,
        editable: true,
        documentation: "",
        types: [{ fieldType: "TEXT", selected: false }, { fieldType: "EXPRESSION", selected: true }],
    } as unknown as FormField);
    const preview = (parameter: string, name: string, value?: string): ConnectionConfigurablePreview => ({
        parameter,
        fieldPath: "",
        name,
        type: "string",
        exists: true,
        kept: false,
        value,
        existing: true,
        declaration: { filePath: "config.bal", line: 1, offset: 20 },
    } as ConnectionConfigurablePreview);

    it("opens a field that uses a configurable on its value, in the mode a value is typed in", () => {
        const { fields, choices } = adoptExistingConfigurables(
            [field("bootstrapServers", "kafkaBootstrapServers"), field("groupId", "\"g\"")],
            [preview("bootstrapServers", "kafkaBootstrapServers", "\"localhost:9092\"")]
        );
        expect(fields[0].value).toBe("\"localhost:9092\"");
        expect(fields[0].types.map((type) => type.selected)).toEqual([true, false]);
        expect(fields[1].value).toBe("\"g\"");
        expect(choices).toEqual({
            bootstrapServers: {
                name: "kafkaBootstrapServers",
                existing: true,
                declaration: { filePath: "config.bal", line: 1, offset: 20 }
            }
        });
    });

    it("opens a field of a parameter keyed apart from a flow node's own property ($connection)", () => {
        const { fields, choices } = adoptExistingConfigurables(
            [field("$connection", "mongoUri")],
            [{ ...preview("connection", "mongoUri", "\"mongodb://h\""), key: "$connection" }]
        );
        expect(fields[0].value).toBe("\"mongodb://h\"");
        expect(choices.$connection?.name).toBe("mongoUri");
    });

    it("leaves a field alone when Config.toml has no value or the field uses something else", () => {
        const opened = [field("bootstrapServers", "kafkaBootstrapServers"), field("groupId", "otherName")];
        const { fields, choices } = adoptExistingConfigurables(opened, [
            preview("bootstrapServers", "kafkaBootstrapServers"),
            preview("groupId", "kafkaGroupId", "\"g\""),
            { ...preview("'clientId", "x", "\"c\""), fieldPath: "auth.token" },
        ]);
        expect(fields).toEqual(opened);
        expect(choices).toEqual({});
    });
});

describe("connectionRangeAfterRename", () => {
    const connection = (name: string, fileName: string, endOffset: number) => ({
        properties: { variable: { value: name } },
        codedata: {
            node: "NEW_CONNECTION",
            lineRange: { fileName, startLine: { line: 3, offset: 0 }, endLine: { line: 3, offset: endOffset } },
        },
    }) as unknown as FlowNode;

    it("finds the connection the form edits, where its source now ends", () => {
        const before = connection("kafkaConsumer", "connections.bal", 60);
        const after = connection("kafkaConsumer", "connections.bal", 66);
        expect(connectionRangeAfterRename(
            [connection("kafkaConsumer", "other.bal", 10), connection("salesforce", "connections.bal", 40), after],
            before
        )).toEqual(after.codedata.lineRange);
    });

    it("finds nothing for a new connection, or one no longer there", () => {
        const fresh = { properties: { variable: { value: "kafkaConsumer" } }, codedata: {} } as unknown as FlowNode;
        expect(connectionRangeAfterRename([connection("kafkaConsumer", "connections.bal", 60)], fresh)).toBeUndefined();
        expect(connectionRangeAfterRename([], connection("kafkaConsumer", "connections.bal", 60))).toBeUndefined();
        expect(connectionRangeAfterRename(undefined, connection("kafkaConsumer", "connections.bal", 60))).toBeUndefined();
    });
});

describe("isSameLineRange", () => {
    const range = (endOffset: number) =>
        ({ fileName: "connections.bal", startLine: { line: 3, offset: 0 }, endLine: { line: 3, offset: endOffset } });

    it("INVARIANT: the form's range is matched by where it is, not by which object holds it", () => {
        expect(isSameLineRange(range(60), range(60))).toBe(true);
        expect(isSameLineRange(range(60), range(63))).toBe(false);
        expect(isSameLineRange(range(60), { ...range(60), fileName: "main.bal" })).toBe(false);
        expect(isSameLineRange(undefined, range(60))).toBe(false);
    });
});
