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

// Unlike AutoCompleteEditor.test.tsx (which stubs the ui-toolkit AutoComplete), this suite renders
// the REAL AutoComplete and its Headless UI Combobox, so the blur behaviour of a nullable Combobox
// is exercised end to end: input -> Combobox -> AutoComplete.onValueChange -> editor -> form value.

import React from "react";

jest.mock("@wso2/ballerina-rpc-client", () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const h = require("./rpcHarness");
    return { __esModule: true, useRpcContext: h.useRpcContext, Context: h.TestRpcContext };
});

import { act, fireEvent, screen } from "@testing-library/react";
import type { FormField } from "../components/Form/types";
import { renderWithForm } from "./formHarness";
import { AutoCompleteEditor } from "../components/editors/AutoCompleteEditor";

const KEY = "approvalFunction";
const EXISTING = "rejectFn";
const NEW_NAME = "isHighValue";

const autoCompleteField = (optional: boolean, value: string, overrides: Partial<FormField> = {}): FormField =>
    ({
        key: KEY,
        label: "Approval Function",
        type: "AUTOCOMPLETE",
        items: ["approveFn", EXISTING],
        value,
        optional,
        editable: true,
        enabled: true,
        documentation: "",
        ...overrides,
    } as unknown as FormField);

function renderEditor(optional: boolean, initial: string, overrides: Partial<FormField> = {}) {
    const utils = renderWithForm(<AutoCompleteEditor field={autoCompleteField(optional, initial, overrides)} />, {
        defaultValues: { [KEY]: initial },
    });
    const input = screen.getByRole("combobox") as HTMLInputElement;
    return { ...utils, input };
}

/** Focus the input and type `text` (a change event opens the Combobox, as real typing does). */
function type(input: HTMLInputElement, text: string) {
    act(() => {
        fireEvent.focus(input);
        fireEvent.change(input, { target: { value: text } });
    });
}

/**
 * Focus the input and type `text` one character at a time, with a render between keystrokes, as a
 * user does. Needed to catch state that goes stale while the open Combobox's options stay the same.
 */
function typeByChar(input: HTMLInputElement, text: string) {
    act(() => {
        fireEvent.focus(input);
    });
    for (let i = 1; i <= text.length; i++) {
        act(() => {
            fireEvent.change(input, { target: { value: text.slice(0, i) } });
        });
    }
}

/** Move focus away without confirming (no Enter, no option click). */
function blur(input: HTMLInputElement) {
    act(() => {
        fireEvent.blur(input);
    });
}

describe("AutoCompleteEditor blur with the real Combobox", () => {
    // Optional + empty initial value is the reported case (Approval Function on a new tool): the
    // editor hands the Combobox a strict null, which makes Headless UI emit onChange(null) on blur.
    describe.each([
        ["optional", true],
        ["required", false],
    ])("%s field", (_label, optional) => {
        it("INVARIANT: a typed new name is kept on blur", () => {
            const { input, getForm } = renderEditor(optional, "");
            type(input, NEW_NAME);
            blur(input);
            expect(getForm().getValues(KEY)).toBe(NEW_NAME);
        });

        it("INVARIANT: a typed existing name is kept on blur", () => {
            const { input, getForm } = renderEditor(optional, "");
            type(input, EXISTING);
            blur(input);
            expect(getForm().getValues(KEY)).toBe(EXISTING);
        });

        it("INVARIANT: every character of a name typed key by key is kept on blur", () => {
            const { input, getForm } = renderEditor(optional, "");
            typeByChar(input, "ABCDE");
            blur(input);
            expect(getForm().getValues(KEY)).toBe("ABCDE");
            expect(input.value).toBe("ABCDE");
        });

        it("INVARIANT: an existing name typed key by key is kept on blur", () => {
            const { input, getForm } = renderEditor(optional, "");
            typeByChar(input, EXISTING);
            blur(input);
            expect(getForm().getValues(KEY)).toBe(EXISTING);
        });

        describe.each([
            ["deleting the text first", true],
            ["typing over the selected text", false],
        ])("editing a value saved on blur, by %s", (_how, deleteFirst) => {
            it.each([
                ["a new name", "a"],
                ["an existing name", EXISTING],
            ])("INVARIANT: replacing it with %s is kept on the next blur", (_what, next) => {
                const { input, getForm } = renderEditor(optional, "");
                typeByChar(input, "abcde");
                blur(input);
                expect(getForm().getValues(KEY)).toBe("abcde");

                // Click back in (which selects the text and opens the dropdown), then edit.
                act(() => {
                    fireEvent.focus(input);
                    fireEvent.click(input);
                });
                if (deleteFirst) {
                    act(() => {
                        fireEvent.change(input, { target: { value: "" } });
                    });
                }
                for (let i = 1; i <= next.length; i++) {
                    act(() => {
                        fireEvent.change(input, { target: { value: next.slice(0, i) } });
                    });
                }
                blur(input);
                expect(getForm().getValues(KEY)).toBe(next);
                expect(input.value).toBe(next);
            });
        });

        it("INVARIANT: text typed over a saved value is kept on blur after the pointer crosses a suggestion", () => {
            const { input, getForm } = renderEditor(optional, "");
            typeByChar(input, "abcde");
            blur(input);
            expect(getForm().getValues(KEY)).toBe("abcde");

            act(() => {
                fireEvent.focus(input);
                fireEvent.click(input);
            });
            typeByChar(input, "a");
            // Moving the pointer onto the "approveFn" suggestion and off it again (on the way to a blank
            // spot) leaves no option active. Headless UI only reacts to a leave after a real move.
            const suggestion = screen.getByRole("option", { name: "approveFn", hidden: true });
            // React derives enter/leave from mouseover/mouseout. Separate acts, so the option renders as
            // active (from the move) before the leave is handled.
            act(() => {
                fireEvent.mouseOver(suggestion, { screenX: 10, screenY: 10 });
            });
            act(() => {
                fireEvent.mouseMove(suggestion, { screenX: 12, screenY: 12 });
            });
            expect(input.getAttribute("aria-activedescendant")).toBe(suggestion.id);
            act(() => {
                fireEvent.mouseOut(suggestion, { screenX: 40, screenY: 40, relatedTarget: document.body });
            });
            expect(input.getAttribute("aria-activedescendant")).toBeNull();
            blur(input);
            expect(getForm().getValues(KEY)).toBe("a");
            expect(input.value).toBe("a");
        });

        it.each(["Tab", "Enter"])(
            "INVARIANT: text typed over a saved value is kept on %s after the pointer crosses a suggestion",
            (key) => {
                const { input, getForm } = renderEditor(optional, "");
                typeByChar(input, "abcde");
                blur(input);

                act(() => {
                    fireEvent.focus(input);
                    fireEvent.click(input);
                });
                typeByChar(input, "a");
                const suggestion = screen.getByRole("option", { name: "approveFn", hidden: true });
                act(() => {
                    fireEvent.mouseOver(suggestion, { screenX: 10, screenY: 10 });
                });
                act(() => {
                    fireEvent.mouseMove(suggestion, { screenX: 12, screenY: 12 });
                });
                act(() => {
                    fireEvent.mouseOut(suggestion, { screenX: 40, screenY: 40, relatedTarget: document.body });
                });
                expect(input.getAttribute("aria-activedescendant")).toBeNull();
                act(() => {
                    fireEvent.keyDown(input, { key });
                });
                if (key === "Tab") {
                    blur(input);
                }
                expect(getForm().getValues(KEY)).toBe("a");
                expect(input.value).toBe("a");
            }
        );

        it("INVARIANT: text typed after opening with the chevron is kept when focus leaves the page", () => {
            const { input, getForm } = renderEditor(optional, "");
            const chevron = document.getElementById(`autocomplete-dropdown-button-${KEY}`) as HTMLElement;
            // A real chevron click records the button in Headless UI's focus history.
            act(() => {
                fireEvent.mouseDown(chevron);
                fireEvent.click(chevron);
            });
            act(() => {
                fireEvent.focus(input);
            });
            typeByChar(input, NEW_NAME);
            blur(input);
            expect(getForm().getValues(KEY)).toBe(NEW_NAME);
            expect(input.value).toBe(NEW_NAME);
        });

        it("INVARIANT: picking an option from the dropdown commits it", () => {
            const { input, getForm } = renderEditor(optional, "");
            type(input, "rej");
            act(() => {
                fireEvent.click(screen.getByRole("option", { name: EXISTING }));
            });
            expect(getForm().getValues(KEY)).toBe(EXISTING);
        });

        it("INVARIANT: an option highlighted with the arrow keys is committed on blur", () => {
            const { input, getForm } = renderEditor(optional, "");
            type(input, "Fn");
            const target = screen.getByRole("option", { name: EXISTING });
            // Arrow down until the target is the active option, as a user would.
            for (let i = 0; i < 5 && input.getAttribute("aria-activedescendant") !== target.id; i++) {
                act(() => {
                    fireEvent.keyDown(input, { key: "ArrowDown" });
                });
            }
            expect(input.getAttribute("aria-activedescendant")).toBe(target.id);
            blur(input);
            expect(getForm().getValues(KEY)).toBe(EXISTING);
        });

        it("INVARIANT: without item creation, a partial name commits the first matching option on blur", () => {
            const { input, getForm } = renderEditor(optional, "", { allowItemCreate: false });
            type(input, "rej");
            blur(input);
            expect(getForm().getValues(KEY)).toBe(EXISTING);
        });
    });

    it("INVARIANT: a typed name replacing a saved value is kept on blur (optional)", () => {
        const { input, getForm } = renderEditor(true, "approveFn");
        type(input, NEW_NAME);
        blur(input);
        expect(getForm().getValues(KEY)).toBe(NEW_NAME);
    });

    it("INVARIANT: clearing a saved optional value stays cleared on blur (#2270)", () => {
        const { input, getForm } = renderEditor(true, "approveFn");
        type(input, "");
        blur(input);
        expect(getForm().getValues(KEY)).toBe("");
        expect(input.value).toBe("");
    });

    it("INVARIANT: typing then clearing an optional value stays cleared on blur", () => {
        const { input, getForm } = renderEditor(true, "");
        type(input, NEW_NAME);
        act(() => {
            fireEvent.change(input, { target: { value: "" } });
        });
        blur(input);
        expect(getForm().getValues(KEY)).toBe("");
    });

    it("INVARIANT: Escape discards uncommitted text on an empty optional field", () => {
        const { input, getForm } = renderEditor(true, "");
        type(input, NEW_NAME);
        act(() => {
            fireEvent.keyDown(input, { key: "Escape" });
        });
        expect(getForm().getValues(KEY)).toBe("");
    });

    it("INVARIANT: Escape still discards after an earlier blur and refocus (blur flag is reset on focus)", () => {
        const { input, getForm } = renderEditor(true, "");
        // A blur with nothing typed leaves the field empty; the refocus must clear the blur flag.
        act(() => {
            fireEvent.focus(input);
        });
        blur(input);
        type(input, NEW_NAME);
        act(() => {
            fireEvent.keyDown(input, { key: "Escape" });
        });
        expect(getForm().getValues(KEY)).toBe("");
    });

    describe("optional field without item creation", () => {
        it("INVARIANT: a typed existing name is kept on blur", () => {
            const { input, getForm } = renderEditor(true, "", { allowItemCreate: false });
            type(input, EXISTING);
            blur(input);
            expect(getForm().getValues(KEY)).toBe(EXISTING);
        });

        it("INVARIANT: typed text matching no item is not committed on blur", () => {
            const { input, getForm } = renderEditor(true, "", { allowItemCreate: false });
            type(input, NEW_NAME);
            blur(input);
            expect(getForm().getValues(KEY)).toBe("");
        });
    });
});
