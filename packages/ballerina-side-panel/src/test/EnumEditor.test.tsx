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

// The empty-selection option must never read as a chosen value: a required enum whose
// placeholder is the connector's default literal (e.g. "\"codex-mini-latest\"") looked
// selected while the form value was still empty, so Save stayed disabled.

import React from "react";
import { render } from "@testing-library/react";
import type { FormField } from "../components/Form/types";
import { EnumEditor } from "../components/editors/MultiModeExpressionEditor/EnumEditor/EnumEditor";

const enumField = (overrides: Partial<FormField>): FormField =>
    ({
        key: "modelType",
        label: "Model Type",
        type: "SINGLE_SELECT",
        optional: false,
        editable: true,
        enabled: true,
        documentation: "",
        value: "",
        ...overrides,
    } as unknown as FormField);

const items = [
    { id: "1", content: "codex-mini-latest", value: '"codex-mini-latest"' },
    { id: "2", content: "gpt-4o", value: '"gpt-4o"' },
];

describe("EnumEditor empty selection", () => {
    it("labels the empty option 'No Selection' for a required field with a default-value placeholder", () => {
        const { container } = render(
            <EnumEditor
                value=""
                field={enumField({ placeholder: '"codex-mini-latest"' })}
                onChange={jest.fn()}
                items={items}
            />
        );
        const options = Array.from(container.querySelectorAll("vscode-option"));
        const noneOption = options.find((option) => option.getAttribute("value") === "__none__");
        expect(noneOption?.textContent).toBe("No Selection");
    });

    it("keeps a descriptive placeholder as the empty option for an optional field", () => {
        const { container } = render(
            <EnumEditor
                value=""
                field={enumField({ optional: true, placeholder: "(default)" })}
                onChange={jest.fn()}
                items={items}
            />
        );
        const options = Array.from(container.querySelectorAll("vscode-option"));
        const noneOption = options.find((option) => option.getAttribute("value") === "__none__");
        expect(noneOption?.textContent).toBe("(default)");
    });

    it("unwraps a Ballerina string literal placeholder on an optional field", () => {
        const { container } = render(
            <EnumEditor
                value=""
                field={enumField({ optional: true, placeholder: '"2.0"' })}
                onChange={jest.fn()}
                items={items}
            />
        );
        const options = Array.from(container.querySelectorAll("vscode-option"));
        const noneOption = options.find((option) => option.getAttribute("value") === "__none__");
        expect(noneOption?.textContent).toBe("2.0");
    });
});
