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

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { Type, TypeFunctionModel } from "@wso2/ballerina-core";
import { TypeDiagram } from "../../../../../Diagram";
import typeModel from "../../../../../stories/type-model.json";

// Invariant: when the host can open a class method, every method of a class whose source can be matched (all but
// resource methods, which the type model names by symbol rather than path) is a link; a plain click opens it,
// Ctrl/Cmd+click still goes to source, and nothing else in the diagram is a method link.

const fixtureTypes = (typeModel as any).types as Type[];
const fixtureClass = fixtureTypes.find((type) => type.codedata?.node === "CLASS");
const fixtureRecord = fixtureTypes.find((type) => type.codedata?.node === "RECORD");
const fixtureMethod = fixtureClass.functions[0];

const method = (name: string, kind: TypeFunctionModel["kind"], qualifiers: string[]): TypeFunctionModel =>
    ({ ...fixtureMethod, name, kind, qualifiers, accessor: kind === "RESOURCE" ? "get" : undefined });

const OPENABLE = [
    method("onBytes", "REMOTE", ["REMOTE"]),
    method("onClose", "REMOTE", ["REMOTE"]),
    method("init", "FUNCTION", []),
    method("helper", "FUNCTION", ["PRIVATE"]),
];
const RESOURCES = [method("status", "RESOURCE", ["RESOURCE"])];

const serviceClass: Type = {
    ...fixtureClass,
    name: "TcpEchoService",
    functions: [...OPENABLE, ...RESOURCES],
};
const recordFieldNames = Object.values(fixtureRecord.members ?? {}).map((member: any) => member.name as string);

function renderDiagram(onFunctionOpen?: jest.Mock) {
    const goToSource = jest.fn();
    render(
        <TypeDiagram
            typeModel={[serviceClass, fixtureRecord]}
            goToSource={goToSource}
            onFunctionOpen={onFunctionOpen}
            onTypeEdit={jest.fn()}
            onTypeDelete={jest.fn()}
            verifyTypeDelete={jest.fn().mockResolvedValue(true)}
        />
    );
    return { goToSource };
}

describe("Type diagram class method links", () => {
    test("opens every matchable method of a class on a plain click", async () => {
        const onFunctionOpen = jest.fn();
        renderDiagram(onFunctionOpen);

        for (const func of OPENABLE) {
            const name = await screen.findByText(func.name);
            expect(name).toHaveStyle("cursor: pointer");
            fireEvent.click(name);
            expect(onFunctionOpen).toHaveBeenLastCalledWith(
                expect.objectContaining({ name: serviceClass.name }),
                expect.objectContaining({ name: func.name, kind: func.kind })
            );
        }
        expect(onFunctionOpen).toHaveBeenCalledTimes(OPENABLE.length);
    }, 15000);

    test("leaves resource methods and record fields as plain text", async () => {
        const onFunctionOpen = jest.fn();
        renderDiagram(onFunctionOpen);
        await screen.findByText(OPENABLE[0].name);

        expect(recordFieldNames.length).toBeGreaterThan(0);
        for (const name of [...RESOURCES.map((func) => func.name), ...recordFieldNames]) {
            screen.getAllByText(name).forEach((element) => {
                expect(element).not.toHaveStyle("cursor: pointer");
                fireEvent.click(element);
            });
        }
        expect(onFunctionOpen).not.toHaveBeenCalled();
    }, 15000);

    test("exposes every link as a focusable button that opens on Enter and Space", async () => {
        const onFunctionOpen = jest.fn();
        renderDiagram(onFunctionOpen);

        for (const func of OPENABLE) {
            const link = await screen.findByRole("button", { name: `Open ${func.name}` });
            expect(link).toHaveAttribute("tabindex", "0");
            fireEvent.keyDown(link, { key: "Enter" });
            fireEvent.keyDown(link, { key: " " });
            fireEvent.keyDown(link, { key: "a" });
        }
        expect(onFunctionOpen).toHaveBeenCalledTimes(OPENABLE.length * 2);
        for (const name of [...RESOURCES.map((func) => func.name), ...recordFieldNames]) {
            expect(screen.queryByRole("button", { name: `Open ${name}` })).toBeNull();
        }
    }, 15000);

    test("keeps Ctrl/Cmd+click going to source", async () => {
        const onFunctionOpen = jest.fn();
        const { goToSource } = renderDiagram(onFunctionOpen);
        const name = await screen.findByText(OPENABLE[0].name);

        fireEvent.click(name, { ctrlKey: true });
        fireEvent.click(name, { metaKey: true });

        expect(onFunctionOpen).not.toHaveBeenCalled();
        expect(goToSource).toHaveBeenCalledTimes(2);
    }, 15000);

    test("makes no method a link when the host cannot open methods", async () => {
        // A click wired without a handler would throw inside React's event dispatch, which surfaces only as a
        // reported error, so the error channel is watched rather than relying on fireEvent to fail.
        const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
        const onWindowError = jest.fn((event: ErrorEvent) => event.preventDefault());
        window.addEventListener("error", onWindowError);
        try {
            const { goToSource } = renderDiagram();

            for (const func of OPENABLE) {
                const name = await screen.findByText(func.name);
                expect(name).not.toHaveStyle("cursor: pointer");
                fireEvent.click(name);
            }
            expect(goToSource).not.toHaveBeenCalled();
            expect(onWindowError).not.toHaveBeenCalled();
            expect(consoleError).not.toHaveBeenCalledWith(expect.stringMatching(/Uncaught|TypeError/), expect.anything());
        } finally {
            window.removeEventListener("error", onWindowError);
            consoleError.mockRestore();
        }
    }, 15000);
});
