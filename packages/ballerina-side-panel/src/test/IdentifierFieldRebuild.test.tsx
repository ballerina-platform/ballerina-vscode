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

// L2: an identifier field takes the value its form field carries, so a name set from outside reaches
// the form (a sibling field's onValueChange). Once the user has typed a name, that name stays whatever
// the field carries next. A flow node form is rebuilt from its node when a "+ New Variable" saves
// through it (issue-1770), which hands the field the name the node opened with: the node was then
// saved under that name instead of the one the user typed.

import React from "react";
import { act, fireEvent } from "@testing-library/react";
import type { FormField } from "../components/Form/types";
import { renderWithForm } from "./formHarness";
import { TestRpcContext } from "./rpcHarness";
import { IdentifierField } from "../components/editors/IdentifierField";
import fixture from "./fixtures/fields/issue-1770.json";

jest.mock("@wso2/ballerina-rpc-client", () => {
    const h = require("./rpcHarness");
    return { __esModule: true, useRpcContext: h.useRpcContext };
});

const rpcClient = {
    getBIDiagramRpcClient: () => ({ getExpressionDiagnostics: jest.fn().mockResolvedValue({ diagnostics: [] }) }),
};

const fieldCarrying = (value: string): FormField => ({ ...fixture.field, value } as FormField);

// The field as its form rebuilds it: `carry` hands it the value the rebuilt form field carries.
let carry: (value: string) => void;
const RebuiltField = ({ opensWith }: { opensWith: string }) => {
    const [value, setValue] = React.useState(opensWith);
    carry = setValue;
    return (
        <TestRpcContext.Provider value={{ rpcClient }}>
            <IdentifierField field={fieldCarrying(value)} />
        </TestRpcContext.Provider>
    );
};

describe.each(fixture.rebuilds)("an identifier field whose form is rebuilt: $name", ({ opensWith, typed, carries, keeps }) => {
    test(`holds "${keeps}"`, async () => {
        const { getForm, container } = renderWithForm(
            <RebuiltField opensWith={opensWith} />, { defaultValues: { [fixture.field.key]: opensWith } }
        );
        await act(async () => undefined);
        if (typed !== null) {
            // The toolkit's text field is a web component: typing reaches the form as its input event.
            const textField = container.querySelector("vscode-text-field") as HTMLInputElement;
            Object.defineProperty(textField, "value", { value: typed, writable: true, configurable: true });
            await act(async () => { fireEvent.input(textField); });
        }
        for (const value of carries) {
            await act(async () => carry(value));
        }
        expect(getForm().getValues(fixture.field.key)).toBe(keeps);
    });
});
