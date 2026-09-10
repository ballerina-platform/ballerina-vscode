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

// BooleanEditor selection behaviour: which of True/False/No Selection the
// dropdown presents as the current one. An empty field applies the declared
// default of the parameter, which `defaultValue` holds and the documentation of
// the field states, so the entry standing for that default is presented.

import React from "react";
import { act, render } from "@testing-library/react";
import type { FormField } from "../components/Form/types";
import { BooleanEditor } from "../components/editors/MultiModeExpressionEditor/BooleanEditor/BooleanEditor";

const NONE_SELECTED = "__none__";

const booleanField = (defaultValue?: string, placeholder?: string): FormField =>
    ({
        key: "validation",
        label: "Validation",
        type: "EXPRESSION",
        defaultValue,
        placeholder,
        optional: true,
        editable: true,
        enabled: true,
        documentation: ""
    } as unknown as FormField);

const renderEditor = (value: any, defaultValue?: string, placeholder?: string) => {
    const onChange = jest.fn();
    const { container } = render(
        <BooleanEditor value={value} field={booleanField(defaultValue, placeholder)} onChange={onChange} />
    );
    const dropdown = container.querySelector("vscode-dropdown") as HTMLElement & { value?: string };
    return {
        onChange,
        contents: Array.from(container.querySelectorAll("vscode-option")).map(o => o.textContent?.trim()),
        selected: dropdown?.value ?? dropdown?.getAttribute("value")
    };
};

describe("BooleanEditor", () => {
    it("offers True, False and the empty selection", () => {
        expect(renderEditor("", "true").contents).toEqual(["True", "False", "No Selection"]);
    });

    it("presents the declared default as the current entry while the field is empty", () => {
        // The placeholder is derived from the type, which yields false for every boolean, hence it is the
        // declared default that decides the entry rather than the placeholder
        expect(renderEditor("", "true", "false").selected).toBe("true");
        expect(renderEditor("", "false", "false").selected).toBe("false");
    });

    it("presents the empty selection when the parameter declares no default", () => {
        expect(renderEditor("", undefined, "false").selected).toBe(NONE_SELECTED);
        expect(renderEditor(undefined, undefined, "false").selected).toBe(NONE_SELECTED);
    });

    it("presents the empty selection for a default that is not a boolean literal", () => {
        expect(renderEditor("", "isEnabled", "false").selected).toBe(NONE_SELECTED);
    });

    it("presents the value held by the field over the declared default", () => {
        expect(renderEditor("false", "true").selected).toBe("false");
        expect(renderEditor(true, "false").selected).toBe("true");
    });

    it("presents the empty selection for a value that is neither boolean", () => {
        expect(renderEditor("someVariable", "true").selected).toBe(NONE_SELECTED);
    });

    it("clears the field when the empty selection is picked", () => {
        const { onChange } = renderEditor("true", "true");
        const select = document.querySelector("vscode-dropdown") as HTMLElement & { value: string };
        select.value = NONE_SELECTED;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        expect(onChange).toHaveBeenLastCalledWith("", 0);
    });

    it("writes the picked boolean to the field", () => {
        const { onChange } = renderEditor("", "true");
        const select = document.querySelector("vscode-dropdown") as HTMLElement & { value: string };
        select.value = "false";
        select.dispatchEvent(new Event("change", { bubbles: true }));
        expect(onChange).toHaveBeenLastCalledWith("false", "false".length);
    });

    // Every entry of the dropdown, so that what a pick writes is pinned for all of them rather than
    // for one. The list is the only source of what can be picked, hence a pick never stands for
    // something the entries do not offer and needs no value to fall back on.
    it.each([
        ["true", "true"],
        ["false", "false"],
        [NONE_SELECTED, ""]
    ])("writes %s to the field as %s", (picked, written) => {
        const { onChange } = renderEditor("", "true");
        const select = document.querySelector("vscode-dropdown") as HTMLElement & { value: string };
        select.value = picked;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        expect(onChange).toHaveBeenLastCalledWith(written, written.length);
    });
    // The field carries the same empty value whether it was never touched or just emptied on purpose, so
    // these drive the editor through a real change event and let it re-render with the value it asked for.
    const Controlled = ({ initial, defaultValue }: { initial: any; defaultValue?: string }) => {
        const [value, setValue] = React.useState(initial);
        return (
            <BooleanEditor
                value={value}
                field={booleanField(defaultValue)}
                onChange={next => setValue(next)}
            />
        );
    };

    const pick = (value: string) => {
        const dropdown = document.querySelector("vscode-dropdown") as HTMLElement & { value: string };
        act(() => {
            dropdown.value = value;
            dropdown.dispatchEvent(new Event("change", { bubbles: true }));
        });
    };

    // React writes the value onto the custom element as a property, so this reads back what the editor
    // rendered, overwriting whatever the change event above set. A snap-back to the default is therefore
    // visible here rather than hidden behind the value the event carried.
    const presented = () =>
        (document.querySelector("vscode-dropdown") as HTMLElement & { value?: string })?.value;

    it("keeps the empty selection presented once it is picked over a declared default", () => {
        render(<Controlled initial="true" defaultValue="true" />);
        pick(NONE_SELECTED);
        expect(presented()).toBe(NONE_SELECTED);
    });

    it("presents False picked after the empty selection, rather than treating it as empty", () => {
        render(<Controlled initial="" defaultValue="true" />);
        pick(NONE_SELECTED);
        expect(presented()).toBe(NONE_SELECTED);
        pick("false");
        expect(presented()).toBe("false");
    });
});
