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

// L2: the record editor's form view. It shows each field checked in the tree, one per row, and writes
// what is typed into the record model as source — the model the modal turns into the record's value.
// The expression editor is injected by the modal, so here it is a stand-in that records what it was given.

import React from "react";
import { createRoot, Root } from "react-dom/client";
import { act } from "react-dom/test-utils";

import type { TypeField } from "@wso2/ballerina-core";
import { loadFixtures } from "@wso2/test-config/fixtures";

jest.mock("@wso2/ballerina-core", () => ({
    __esModule: true,
    keywords: [] as string[],
    ...jest.requireActual("@wso2/ballerina-core/lib/utils/optionality-utils"),
}));

// Stubbed so the assertions read plain inputs and selects, not toolkit web components.
jest.mock("@wso2/ui-toolkit", () => ({
    __esModule: true,
    Codicon: (): null => null,
    ThemeColors: new Proxy({}, { get: () => "#000" }),
    TextField: ({ id, value, onTextChange, errorMsg }: any) => (
        <>
            <input id={id} data-testid={id} value={value} onChange={(e) => onTextChange(e.target.value)} />
            {errorMsg && <span role="alert">{errorMsg}</span>}
        </>
    ),
    Dropdown: ({ id, value, items, onValueChange }: any) => (
        <select id={id} data-testid={id} value={value} onChange={(e) => onValueChange(e.target.value)}>
            {items.map((item: any) => <option key={item.value} value={item.value}>{item.content}</option>)}
        </select>
    ),
}));

jest.mock("@wso2/ballerina-side-panel", () => ({
    __esModule: true,
    TypeChip: ({ label }: any) => <span data-testid="type-chip">{label}</span>,
    ModeToggle: ({ primaryLabel, secondaryLabel, secondary, onChange, testId }: any) => (
        <span data-testid={testId} data-secondary={String(secondary)}>
            <button type="button" data-testid={`${testId}-primary`} onClick={() => onChange(false)}>{primaryLabel}</button>
            <button type="button" data-testid={`${testId}-secondary`} onClick={() => onChange(true)}>{secondaryLabel}</button>
        </span>
    ),
}));

import { RecordFormView, ExpressionEditorArgs } from "../../../../../../views/BI/HelperPaneNew/Components/RecordFormView";
import { normalizeIntersections } from "../../../../../../views/BI/HelperPaneNew/Components/RecordConstructView/utils/intersection";

declare global {
    var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

interface RecordConfigFixture {
    recordConfig: TypeField;
}

const fixtures = loadFixtures<RecordConfigFixture>(
    __dirname, "..", "RecordConstructView", "utils", "fixtures", "recordConfigs");

/** A connection config: a required bearer token, an optional URL and timeout, a choice, a boolean, a list. */
function connectionConfig(): TypeField {
    return {
        typeName: "record",
        name: "ConnectionConfig",
        selected: true,
        fields: [
            {
                typeName: "record", name: "auth", selected: true, typeInfo: { name: "BearerTokenConfig" } as any,
                fields: [{ typeName: "string", name: "token", selected: true, value: "\"abc\"" }],
            },
            { typeName: "string", name: "baseUrl", selected: true, optional: true, documentation: "Base URL." },
            { typeName: "decimal", name: "timeout", selected: true, defaultable: true, value: "30" },
            { typeName: "string", name: "forwarded", selected: false, defaultable: true },
            {
                typeName: "union", name: "httpVersion", selected: true, defaultable: true,
                members: [{ typeName: "HTTP_1_1" }, { typeName: "HTTP_2_0", selected: true }],
            },
            { typeName: "boolean", name: "validation", selected: true, defaultable: true, value: "true" },
            {
                typeName: "array", name: "tags", selected: true, defaultable: true,
                memberType: { typeName: "string" }, elements: [],
            },
        ],
    };
}

describe("RecordFormView", () => {
    let container: HTMLDivElement;
    let root: Root;
    let onValueChange: jest.Mock;
    let onStructureChange: jest.Mock;
    let expressionEditors: ExpressionEditorArgs[];

    beforeEach(() => {
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
        onValueChange = jest.fn();
        onStructureChange = jest.fn();
        expressionEditors = [];
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
    });

    const render = (record: TypeField) => {
        act(() => {
            root.render(
                <RecordFormView
                    record={record}
                    onValueChange={onValueChange}
                    onStructureChange={onStructureChange}
                    renderExpressionEditor={(args) => {
                        expressionEditors.push(args);
                        return <textarea data-testid={`expression-${args.id}`} defaultValue={args.value} />;
                    }}
                />
            );
        });
    };

    const byTestId = (id: string) => container.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

    /** Types into a React-controlled input or select the way a user does. */
    const typeInto = (element: HTMLElement, value: string) => {
        const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value);
        act(() => {
            element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
        });
    };

    const click = (element: HTMLElement) => act(() => { element.click(); });

    describe("over the captured record configs", () => {
        it.each(fixtures.map(({ name, data }) => [name, data] as [string, RecordConfigFixture]))(
            "%s shows every checked field once, and no unchecked one",
            (_name, fixture) => {
                const record = normalizeIntersections(fixture.recordConfig);
                (record.fields ?? []).forEach((field, index) => { field.selected = index % 2 === 0; });
                render(record);
                (record.fields ?? []).forEach((field) => {
                    const shown = container.querySelectorAll(
                        `[data-testid="record-form-field-${field.name}"], [data-testid="record-form-section-${field.name}"]`);
                    expect({ field: field.name, count: shown.length }).toEqual({ field: field.name, count: field.selected ? 1 : 0 });
                });
            });
    });

    it("asks for fields when none is checked", () => {
        render({ typeName: "record", name: "Empty", fields: [{ typeName: "string", name: "a", selected: false }] });
        expect(byTestId("record-form-empty")).not.toBeNull();
    });

    it("shows a nested record as a section with its own fields, and no Record | Expression switch", () => {
        render(connectionConfig());
        expect(byTestId("record-form-section-auth")).not.toBeNull();
        expect(byTestId("record-form-field-auth.token")).not.toBeNull();
        expect(byTestId("record-form-mode-auth")).toBeNull();
    });

    it("names a section by its field, not its record type, while its fields keep their types", () => {
        render(connectionConfig());
        const chips = Array.from(container.querySelectorAll('[data-testid="type-chip"]')).map((chip) => chip.textContent);
        expect(chips).not.toContain("BearerTokenConfig");
        expect(chips).toContain("string");
        expect(chips).toContain("string[]");
    });

    it("writes typed text as a string literal", () => {
        const record = connectionConfig();
        render(record);
        typeInto(byTestId("record-form-baseUrl")!, "https://api.example.com/v1");
        expect(record.fields![1].value).toBe("\"https://api.example.com/v1\"");
        expect(onValueChange).toHaveBeenCalled();
    });

    it("shows a literal as its text, not its source", () => {
        render(connectionConfig());
        expect((byTestId("record-form-auth.token") as HTMLInputElement).value).toBe("abc");
    });

    it("does not write a number that does not parse, and says why", () => {
        const record = connectionConfig();
        render(record);
        typeInto(byTestId("record-form-timeout")!, "thirty");
        expect(record.fields![2].value).toBe("30");
        expect(container.querySelector("[role=alert]")?.textContent).toBe("Enter a number");
    });

    it("offers a boolean as a true/false dropdown", () => {
        const record = connectionConfig();
        render(record);
        const select = byTestId("record-form-validation") as HTMLSelectElement;
        expect(select.tagName).toBe("SELECT");
        typeInto(select, "false");
        expect(record.fields![5].value).toBe("false");
    });

    it("hands a field switched to Expression to the expression editor, with its value", () => {
        render(connectionConfig());
        click(byTestId("record-form-mode-timeout-secondary")!);
        expect(byTestId("expression-timeout")).not.toBeNull();
        expect(expressionEditors.find((args) => args.id === "timeout")?.value).toBe("30");
    });

    it("opens a value that is no literal in the expression editor", () => {
        const record = connectionConfig();
        record.fields![1].value = "config.url";
        render(record);
        expect(byTestId("expression-baseUrl")).not.toBeNull();
    });

    it("clears an expression a literal input can't show when switched back", () => {
        const record = connectionConfig();
        record.fields![1].value = "config.url";
        render(record);
        click(byTestId("record-form-mode-baseUrl-primary")!);
        expect(record.fields![1].value).toBe("");
        expect(byTestId("record-form-baseUrl")).not.toBeNull();
    });

    it("selects one name of a choice", () => {
        const record = connectionConfig();
        render(record);
        typeInto(byTestId("record-form-httpVersion")!, "HTTP_1_1");
        expect(record.fields![4].members!.map((member) => !!member.selected)).toEqual([true, false]);
        expect(onStructureChange).toHaveBeenCalled();
    });

    it("adds and removes values of a list", () => {
        const record = connectionConfig();
        render(record);
        const tags = record.fields![6];
        click(byTestId("record-form-add-tags")!);
        expect(tags.elements).toHaveLength(1);
        expect(onStructureChange).toHaveBeenCalledTimes(1);
        render(record);
        typeInto(byTestId("record-form-tags[0]")!, "gift");
        expect(tags.elements![0].value).toBe("\"gift\"");
        click(container.querySelector("[aria-label='Remove value 1']") as HTMLElement);
        expect(tags.elements).toHaveLength(0);
    });
});
