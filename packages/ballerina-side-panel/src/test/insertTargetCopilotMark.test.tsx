/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import React, { useEffect } from "react";
import { act } from "@testing-library/react";
import type { FormField } from "../components/Form/types";
import { renderWithForm } from "./formHarness";
import { InsertTarget, InsertTargetContext, useInsertTarget } from "../context/insertTarget";
import { AppliedMark, AssistHostProvider, AssistHostValue, useAssistHost } from "../components/editors/FieldAssist/AssistHost";

const field = { key: "expression", label: "Expression", types: [{ fieldType: "EXPRESSION", ballerinaType: "decimal", selected: true }] } as unknown as FormField;
const mark = (label: string) => ({ label, before: "subtotal", after: "subtotal * 0.9d", request: "take 10% off", revert: jest.fn() } as AppliedMark);

let host: AssistHostValue;
let target: InsertTarget | null = null;
const inserted = jest.fn();

function Field() {
    host = useAssistHost()!;
    const { register } = useInsertTarget(inserted, field);
    useEffect(() => {
        host.setApplied({
            formId: "", revert: () => ({}),
            changes: { "expression:Expression": ["expression"], "variable:Name": ["variable"] },
            marks: { expression: mark("Expression"), variable: mark("Name") },
        });
        register();
    }, []);
    return null;
}

describe("a value inserted from the Data Browser", () => {
    it("ends the review of Copilot's change to that field, as typing does", () => {
        renderWithForm(
            <AssistHostProvider>
                <InsertTargetContext.Provider value={{ target, setTarget: (next) => { target = typeof next === "function" ? next(target) : next; } }}>
                    <Field />
                </InsertTargetContext.Provider>
            </AssistHostProvider>
        );
        expect(Object.keys(host.applied!.marks)).toEqual(["expression", "variable"]);
        act(() => target!.insert("subtotal"));
        expect(inserted).toHaveBeenCalledWith("subtotal");
        expect(Object.keys(host.applied!.marks)).toEqual(["variable"]);
    });
});
