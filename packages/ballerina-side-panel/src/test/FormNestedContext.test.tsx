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

// L2: a nested Form (an array element, a map entry) has no location of its own, so its
// editors take the parent form's. Without a file the language server returns no tokens
// (so no chips) and no diagnostics or completions for the nested editors.

import React from "react";
import { render } from "@testing-library/react";
import type { FormField } from "../components/Form/types";

// Every field renders a probe that prints the location its editors would see. The
// "parent" field renders a nested Form, like the array and map editors do.
jest.mock("../components/editors/FieldFactory", () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const react = require("react");
    return {
        __esModule: true,
        FieldFactory: ({ field }: { field: FormField }) => {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const { useFormContext } = require("../context");
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const { Form } = require("../components/Form");
            const { fileName, targetLineRange } = useFormContext();
            const probe = react.createElement("span", {
                "data-testid": `location-${field.key}`,
                "data-file": String(fileName),
                "data-line": String(targetLineRange?.startLine?.line),
            });
            if (field.key !== "parent") {
                return probe;
            }
            return react.createElement(
                react.Fragment,
                null,
                probe,
                react.createElement(Form, {
                    formFields: [childField],
                    submitText: "Save",
                    nestedForm: (field as any).nestedChild,
                })
            );
        },
    };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Form } = require("../components/Form");

const textField = (key: string): FormField =>
    ({
        key,
        label: key,
        type: "EXPRESSION",
        value: "",
        optional: true,
        editable: true,
        enabled: true,
        hidden: false,
        documentation: "",
        types: [{ fieldType: "EXPRESSION", selected: true }],
    } as unknown as FormField);

const childField = textField("child");

const renderParent = (nestedChild: boolean) =>
    render(
        <Form
            formFields={[{ ...textField("parent"), nestedChild } as FormField]}
            submitText="Save"
            onSubmit={() => {}}
            fileName="main.bal"
            targetLineRange={{ startLine: { line: 7, offset: 0 }, endLine: { line: 7, offset: 0 } }}
            nodeInfo={{ kind: "" as any }}
        />
    );

const location = (container: HTMLElement, key: string) => {
    const probe = container.querySelector(`[data-testid="location-${key}"]`)!;
    return { file: probe.getAttribute("data-file"), line: probe.getAttribute("data-line") };
};

describe("nested Form location", () => {
    it("a nested form's editors get the parent form's file and line", () => {
        const { container } = renderParent(true);
        expect(location(container, "parent")).toEqual({ file: "main.bal", line: "7" });
        expect(location(container, "child")).toEqual({ file: "main.bal", line: "7" });
    });

    it("a form that isn't nested does not pick up an enclosing form's location", () => {
        const { container } = renderParent(false);
        expect(location(container, "child")).toEqual({ file: "undefined", line: "undefined" });
    });
});
