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

// In-place renames move the identifiers after them on the same line, while the form keeps the
// ranges it read at load. Renaming a data mapper and then one of its inputs sent the input's
// rename to its load-time column, where the LS found nothing to rename: the save then wrote the
// new name into the signature and left every usage under the old one.

import React from "react";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import type { LineRange } from "@wso2/ballerina-core";
import type { FormField } from "../components/Form/types";
import { IdentifierEditor } from "../components/editors/IdentifierEditor";
import {
    IdentifierRenameContext,
    IdentifierRenameLog,
    shiftRangeForRenames,
} from "../components/editors/identifierRenames";
import { renderWithForm } from "./formHarness";
import { TestRpcContext } from "./rpcHarness";

jest.mock("@wso2/ballerina-rpc-client", () => {
    const h = require("./rpcHarness");
    return { __esModule: true, useRpcContext: h.useRpcContext };
});

// `function transformPerson(Person person, Address address) returns Employee => ...` on line 4.
const range = (offset: number, name: string, line = 4): LineRange => ({
    fileName: "data_mappings.bal",
    startLine: { line, offset },
    endLine: { line, offset: offset + name.length },
});
const nameRange = () => range(9, "transformPerson");
const personRange = () => range(32, "person");
const addressRange = () => range(48, "address");

describe("shiftRangeForRenames", () => {
    const renameFunction = { fileName: "data_mappings.bal", line: 4, offset: 9, delta: -10 };

    it("moves what follows a rename on its line by the change in length", () => {
        expect(shiftRangeForRenames(personRange(), [renameFunction])).toEqual(range(22, "person"));
    });

    it("leaves the renamed identifier's start in place and moves its end", () => {
        expect(shiftRangeForRenames(nameRange(), [renameFunction])).toEqual(range(9, "toEmp"));
    });

    it("leaves what precedes a rename, or sits on another line or in another file, in place", () => {
        const before = range(2, "fn");
        const nextLine = range(32, "person", 5);
        const otherFile = { ...personRange(), fileName: "main.bal" };
        for (const unmoved of [before, nextLine, otherFile]) {
            expect(shiftRangeForRenames(unmoved, [renameFunction])).toBe(unmoved);
        }
    });

    it("applies renames in order, each in the coordinates the previous one left", () => {
        const renamePerson = { fileName: "data_mappings.bal", line: 4, offset: 22, delta: -5 };
        expect(shiftRangeForRenames(addressRange(), [renameFunction, renamePerson])).toEqual(range(33, "address"));
    });
});

describe("IdentifierRenameLog", () => {
    const rename = { fileName: "data_mappings.bal", line: 4, offset: 9, delta: -10 };

    it("moves a tracked range by the renames applied after it was tracked", () => {
        const log = new IdentifierRenameLog();
        const person = personRange();
        log.track(person);
        log.record(rename);
        expect(log.current(person)).toEqual(range(22, "person"));
    });

    // A form given the same fields again (e.g. after a type is created) keeps their place.
    it("keeps a range's place when it is tracked again", () => {
        const log = new IdentifierRenameLog();
        const person = personRange();
        log.track(person);
        log.record(rename);
        log.track(person);
        expect(log.current(person)).toEqual(range(22, "person"));
    });

    // A range read after the rename already reflects it.
    it("does not move a range first tracked after the rename", () => {
        const log = new IdentifierRenameLog();
        log.record(rename);
        const fresh = range(22, "person");
        log.track(fresh);
        expect(log.current(fresh)).toEqual(fresh);
    });

    it("returns an untracked range unchanged", () => {
        const log = new IdentifierRenameLog();
        log.record(rename);
        const untracked = personRange();
        expect(log.current(untracked)).toBe(untracked);
        expect(log.current(undefined)).toBeUndefined();
    });

    it("tracks the ranges of the fields and of the parameters they hold", () => {
        const log = new IdentifierRenameLog();
        const name = nameRange();
        const person = personRange();
        log.trackFields([
            { key: "functionName", lineRange: name },
            { key: "parameters", paramManagerProps: { paramValues: [{ identifierRange: person }] } },
        ] as unknown as FormField[]);
        log.record(rename);
        expect(log.current(name)).toEqual(range(9, "toEmp"));
        expect(log.current(person)).toEqual(range(22, "person"));
    });
});

// L2: the reported flow, through the real editor. The function name and an input are renamed in
// place one after the other, as from the data mapper's configure form and its input editor.
describe("IdentifierEditor in-place renames", () => {
    const identifierField = (key: string, value: string, lineRange: LineRange): FormField => ({
        key,
        label: key,
        type: "IDENTIFIER",
        value,
        optional: false,
        editable: false,
        enabled: true,
        documentation: "",
        lineRange,
        types: [{ fieldType: "IDENTIFIER", selected: true }],
    });

    // The toolkit renders web components, so they are found by their attributes and the edited
    // name is typed through `input`, which is what the toolkit's TextField listens to.
    const renameTo = async (fieldKey: string, fieldIndex: number, newName: string) => {
        fireEvent.click(document.querySelectorAll('[title="Rename"]')[fieldIndex]);
        const input = await waitFor(() => {
            const editing = document.querySelector(`vscode-text-field#${fieldKey}:not([readonly])`);
            expect(editing).not.toBeNull();
            return editing!;
        });
        (input as HTMLInputElement).value = newName;
        fireEvent.input(input);
        await act(async () => {
            fireEvent.click(screen.getByText("Save"));
        });
        await waitFor(() => expect(screen.queryByText("Save")).toBeNull());
    };

    it("renames each identifier where it is now, not where it was read", async () => {
        const renameIdentifier = jest.fn(async () => undefined);
        const rpcClient = {
            getBIDiagramRpcClient: () => ({
                renameIdentifier,
                getExpressionDiagnostics: jest.fn(async () => ({ diagnostics: [] })),
            }),
        };
        const fields = [
            identifierField("functionName", "transformPerson", nameRange()),
            identifierField("person", "person", personRange()),
            identifierField("address", "address", addressRange()),
        ];
        const log = new IdentifierRenameLog();
        log.trackFields(fields);

        renderWithForm(
            <TestRpcContext.Provider value={{ rpcClient }}>
                <IdentifierRenameContext.Provider value={log}>
                    {fields.map((field) => <IdentifierEditor key={field.key} field={field} />)}
                </IdentifierRenameContext.Provider>
            </TestRpcContext.Provider>,
            { defaultValues: { functionName: "transformPerson", person: "person", address: "address" } }
        );

        await renameTo("functionName", 0, "toEmp");
        await renameTo("person", 1, "p");
        await renameTo("address", 2, "addr");

        const positions = (renameIdentifier.mock.calls as unknown as [{ position: unknown; newName: string }][])
            .map(([request]) => [request.newName, request.position]);
        expect(positions).toEqual([
            ["toEmp", { line: 4, character: 9 }],
            ["p", { line: 4, character: 22 }],
            ["addr", { line: 4, character: 33 }],
        ]);
    });
});
