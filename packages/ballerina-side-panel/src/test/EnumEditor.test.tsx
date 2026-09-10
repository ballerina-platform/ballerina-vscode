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

// EnumEditor selection behaviour: which member the dropdown presents as the
// current one, and the entries it offers to choose from. The backend labels the
// options by their enum member name and puts the declared default of the
// parameter in `placeholder` (or clears it when the default resolves to none of
// the members), which is the contract these tests pin down.

import React from "react";
import { act, render } from "@testing-library/react";
import type { FormField } from "../components/Form/types";
import { EnumEditor } from "../components/editors/MultiModeExpressionEditor/EnumEditor/EnumEditor";

const NONE_SELECTED = "__none__";

const items = [
    { id: '"chat_completions"', content: "CHAT_COMPLETIONS", value: '"chat_completions"' },
    { id: '"responses"', content: "RESPONSES", value: '"responses"' }
];

const enumField = (placeholder?: string): FormField =>
    ({
        key: "apiType",
        label: "API Type",
        type: "SINGLE_SELECT",
        placeholder,
        optional: true,
        editable: true,
        enabled: true,
        documentation: ""
    } as unknown as FormField);

const renderEditor = (value: string, placeholder?: string) => {
    const onChange = jest.fn();
    const { container } = render(
        <EnumEditor value={value} field={enumField(placeholder)} onChange={onChange} items={items} />
    );
    const dropdown = container.querySelector("vscode-dropdown");
    const options = Array.from(container.querySelectorAll("vscode-option"));
    return {
        onChange,
        contents: options.map(option => option.textContent?.trim()),
        values: options.map(option => option.getAttribute("value")),
        selected: (dropdown as HTMLElement & { value?: string })?.value ?? dropdown?.getAttribute("value")
    };
};

describe("EnumEditor", () => {
    it("INVARIANT: offers the empty selection alongside the members when a default is declared", () => {
        const { contents } = renderEditor("", '"chat_completions"');
        expect(contents).toEqual(["CHAT_COMPLETIONS", "RESPONSES", "No Selection"]);
    });

    it("INVARIANT: offers the empty selection alongside the members when no default is declared", () => {
        const { contents } = renderEditor("");
        expect(contents).toEqual(["CHAT_COMPLETIONS", "RESPONSES", "No Selection"]);
    });

    it("presents the declared default as the current member while the field is empty", () => {
        expect(renderEditor("", '"chat_completions"').selected).toBe('"chat_completions"');
    });

    it("presents the empty selection when the parameter declares no default", () => {
        expect(renderEditor("").selected).toBe(NONE_SELECTED);
    });

    it("presents the value held by the field over the declared default", () => {
        expect(renderEditor('"responses"', '"chat_completions"').selected).toBe('"responses"');
    });

    it("presents the empty selection for a value that none of the members stands for", () => {
        expect(renderEditor("someVariable", '"chat_completions"').selected).toBe(NONE_SELECTED);
    });

    it("INVARIANT: presents the empty selection for a placeholder that is not one of the members", () => {
        // The backend puts the declared default in `placeholder`, or leaves it empty when the default
        // resolves to none of the members. A placeholder holding anything else (e.g. a sample value of
        // the type, such as `()` for a nilable enum) names no member, and must not select an arbitrary
        // one in its place.
        expect(renderEditor("", "()").selected).toBe(NONE_SELECTED);
        expect(renderEditor("", "object {}").selected).toBe(NONE_SELECTED);
    });

    it("clears the field when the empty selection is picked", () => {
        const { onChange } = renderEditor('"responses"', '"chat_completions"');
        const select = document.querySelector("vscode-dropdown") as HTMLElement & { value: string };
        select.value = NONE_SELECTED;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        expect(onChange).toHaveBeenLastCalledWith("", 0);
    });

    // The field carries the same empty value whether it was never touched or just emptied on purpose, so
    // these drive the editor through a real change event and let it re-render with the value it asked for.
    const Controlled = ({ initial, placeholder }: { initial: string; placeholder?: string }) => {
        const [value, setValue] = React.useState(initial);
        return (
            <EnumEditor
                value={value}
                field={enumField(placeholder)}
                onChange={next => setValue(next)}
                items={items}
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
        render(<Controlled initial={'"responses"'} placeholder={'"chat_completions"'} />);
        pick(NONE_SELECTED);
        expect(presented()).toBe(NONE_SELECTED);
    });

    it("presents a member picked after the empty selection", () => {
        render(<Controlled initial="" placeholder={'"chat_completions"'} />);
        pick(NONE_SELECTED);
        expect(presented()).toBe(NONE_SELECTED);
        pick('"responses"');
        expect(presented()).toBe('"responses"');
    });
});
