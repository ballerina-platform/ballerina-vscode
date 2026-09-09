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

// L2: the wizard's one migration-specific question — "Output Structure" — as the step
// actually renders it.
//
// Three things are pinned here because each is a silent failure on screen rather than a
// type error. The section is gated on `keepStructureParam`, so a tool that does not declare
// the option must show no checkbox at all; label and description come from that param, not
// from a literal in this file, so a tool's wording change must reach the UI; and the
// checkbox is fully controlled — it renders `keepStructure` and reports the *new* boolean
// through `onKeepStructureChange`, never toggling itself.

import React from "react";
import { createRoot, Root } from "react-dom/client";
import { act } from "react-dom/test-utils";

// Stubbed so the assertions read a real <input type="checkbox"> instead of the toolkit's
// VSCode custom element, which jsdom does not define. `onChange` keeps the toolkit's
// contract: it hands out the new checked state as a boolean.
jest.mock("@wso2/ui-toolkit", () => ({
    __esModule: true,
    CheckBox: ({ label, checked, onChange }: any) => (
        <label>
            <input
                type="checkbox"
                checked={checked}
                onChange={(e: any) => onChange(e.target.checked)}
            />
            {label}
        </label>
    ),
    Codicon: (): null => null,
    Typography: ({ children }: any) => <div>{children}</div>,
    TextField: (): null => null,
}));

// The destination fields are the Create flow's own component, exercised by its own tests.
// Stubbed down to the one seam this step uses: `additionalSection`, where the Output
// Structure block is injected.
jest.mock("../ProjectForm/embedded/integrator-form/shared/ProjectDestinationForm", () => ({
    __esModule: true,
    ProjectDestinationForm: ({ additionalSection }: any) => <div>{additionalSection}</div>,
}));

jest.mock("../wsManager/WsClientContext", () => ({
    __esModule: true,
    useBiWsContext: () => ({ wsClient: {}, onBack: (): void => undefined }),
}));

jest.mock("../../../providers/platform-ext-ctx-provider", () => ({
    __esModule: true,
    usePlatformExtContext: () => ({ platformExtState: { isLoggedIn: false } }),
}));

import { ConfigureProjectForm } from "./ConfigureProjectForm";
import { ConfigureProjectFormProps } from "./types";

(global as any).IS_REACT_ACT_ENVIRONMENT = true;

// The shared jest preset transforms TSX with the classic JSX runtime (`jsx: "react"`) while
// this package builds with `react-jsx`, so a production module written against the automatic
// runtime calls `React.createElement` without importing React. Put React in scope for it here
// rather than adding a test-only import to the component.
(globalThis as any).React = React;

const KEEP_STRUCTURE_PARAM: NonNullable<ConfigureProjectFormProps["keepStructureParam"]> = {
    key: "keepStructure",
    label: "Keep the original project structure",
    description: "Mirrors the source layout instead of grouping by artifact type.",
    valueType: "boolean",
    defaultValue: false,
};

describe("ConfigureProjectForm output structure option", () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
    });

    const renderForm = (props: Partial<ConfigureProjectFormProps> = {}) => {
        const onKeepStructureChange = jest.fn();
        act(() => {
            root.render(
                <ConfigureProjectForm
                    isMultiProject={false}
                    keepStructure={false}
                    keepStructureParam={KEEP_STRUCTURE_PARAM}
                    onKeepStructureChange={onKeepStructureChange}
                    onNext={jest.fn()}
                    onBack={jest.fn()}
                    {...props}
                />
            );
        });
        return { onKeepStructureChange };
    };

    const checkbox = () => container.querySelector<HTMLInputElement>('input[type="checkbox"]');

    it("renders the section with the tool's own label and description", () => {
        renderForm();

        expect(container.textContent).toContain("Output Structure");
        expect(container.textContent).toContain(KEEP_STRUCTURE_PARAM.label);
        expect(container.textContent).toContain(KEEP_STRUCTURE_PARAM.description);
    });

    it.each<[string, ConfigureProjectFormProps["keepStructureParam"]]>([
        ["a tool that does not declare it", undefined],
        ["a tool whose declaration is null", null],
    ])("renders no output structure section for %s", (_label, keepStructureParam) => {
        renderForm({ keepStructureParam });

        expect(container.textContent).not.toContain("Output Structure");
        expect(checkbox()).toBeNull();
    });

    it.each([[false], [true]])("renders keepStructure=%s as the checked state", (keepStructure) => {
        renderForm({ keepStructure });

        expect(checkbox()?.checked).toBe(keepStructure);
    });

    // Controlled: the click reports the new value up and nothing else. Were the component to
    // hold its own state, the box would move without the wizard's value following it.
    it.each([
        [false, true],
        [true, false],
    ])("reports the toggled boolean from keepStructure=%s", (keepStructure, expected) => {
        const { onKeepStructureChange } = renderForm({ keepStructure });

        act(() => {
            // A native click, so React's own value tracking sees the flip and fires onChange.
            checkbox()!.click();
        });

        expect(onKeepStructureChange).toHaveBeenCalledTimes(1);
        expect(onKeepStructureChange).toHaveBeenCalledWith(expected);
        // Still driven by the prop, which the parent has not changed.
        expect(checkbox()?.checked).toBe(keepStructure);
    });
});
