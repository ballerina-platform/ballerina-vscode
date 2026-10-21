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
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

// L2: the one setting a chat agent's chat/decision resource offers. What matters is that the
// toggle reflects the model, that saving sends back the whole model with only that parameter's
// `enabled` flipped (the language server edits just the parameter list from it), and that a
// resource with no headers option is not offered a form to save.

import React from "react";
import { createRoot, Root } from "react-dom/client";
import { act } from "react-dom/test-utils";

jest.mock("@wso2/ui-toolkit", () => ({
    __esModule: true,
    ActionButtons: ({ primaryButton, secondaryButton }: any) => (
        <div>
            <button data-testid="save" disabled={primaryButton.disabled} onClick={primaryButton.onClick}>
                {primaryButton.text}
            </button>
            <button data-testid="cancel" disabled={secondaryButton.disabled} onClick={secondaryButton.onClick}>
                {secondaryButton.text}
            </button>
        </div>
    ),
    CheckBox: ({ label, checked, onChange }: any) => (
        <label>
            {label}
            <input type="checkbox" data-testid="headers" checked={checked}
                onChange={(e) => onChange(e.target.checked)} />
        </label>
    ),
    Divider: (): null => null,
    ProgressIndicator: () => <div data-testid="progress" />,
    SidePanelBody: ({ children }: any) => <div>{children}</div>,
}));

// The real component pulls in the HTTP form's editors; only what it is given matters here.
jest.mock("../ResourceForm/ResourcePath/ResourcePath", () => ({
    __esModule: true,
    ResourcePath: ({ method, path, readonly }: any) => (
        <div data-testid="resource-path" data-readonly={String(readonly)}>{`${method.value} ${path.value}`}</div>
    ),
}));

import { AiResourceForm, findHeadersOption } from "./index";

const payload: any = {
    kind: "REQUIRED",
    type: { value: "ai:ChatReqMessage", editable: false },
    name: { value: "request", editable: false },
    enabled: true,
    editable: false,
};

function headersParam(enabled: boolean): any {
    return {
        kind: "REQUIRED",
        metadata: { label: "Headers", description: "Access all HTTP headers sent by the client in the request." },
        type: { value: "http:Headers", editable: false },
        name: { value: "headers", editable: false },
        enabled,
        editable: true,
        advanced: true,
    };
}

function resource(parameters: any[]): any {
    return { accessor: { value: "post" }, name: { value: "chat" }, parameters };
}

describe("AiResourceForm", () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
    });

    const render = (model: any, onSave = jest.fn(), onClose = jest.fn(), isSaving = false) => {
        act(() => root.render(<AiResourceForm model={model} isSaving={isSaving} onSave={onSave} onClose={onClose} />));
        return { onSave, onClose };
    };
    const checkbox = () => container.querySelector<HTMLInputElement>("[data-testid=headers]");
    const save = () => container.querySelector<HTMLButtonElement>("[data-testid=save]");
    const click = (el: HTMLElement) => act(() => { el.click(); });

    it("shows the resource read-only and an unticked option when the resource takes no headers", () => {
        render(resource([payload, headersParam(false)]));

        const resourcePath = container.querySelector("[data-testid=resource-path]");
        expect(resourcePath?.textContent).toBe("post chat");
        expect(resourcePath?.getAttribute("data-readonly")).toBe("true");
        expect(checkbox()?.checked).toBe(false);
    });

    it("shows a ticked option when the resource takes the headers", () => {
        render(resource([payload, headersParam(true)]));

        expect(checkbox()?.checked).toBe(true);
    });

    it("cannot be saved until the option changes", () => {
        render(resource([payload, headersParam(false)]));
        expect(save()?.disabled).toBe(true);

        click(checkbox()!);
        expect(save()?.disabled).toBe(false);

        click(checkbox()!);
        expect(save()?.disabled).toBe(true);
    });

    it("saves the whole model with only the headers parameter's enabled flag changed", () => {
        const model = resource([payload, headersParam(false)]);
        const { onSave } = render(model);

        click(checkbox()!);
        click(save()!);

        expect(onSave).toHaveBeenCalledTimes(1);
        const saved = onSave.mock.calls[0][0];
        expect(saved.parameters[0]).toBe(payload);
        expect(saved.parameters[1]).toEqual({ ...headersParam(false), enabled: true });
        expect(saved.name).toBe(model.name);
    });

    it("saves an unticked option as disabled", () => {
        const { onSave } = render(resource([payload, headersParam(true)]));

        click(checkbox()!);
        click(save()!);

        expect(onSave.mock.calls[0][0].parameters[1].enabled).toBe(false);
    });

    it("closes without saving on cancel", () => {
        const { onSave, onClose } = render(resource([payload, headersParam(false)]));

        click(container.querySelector<HTMLButtonElement>("[data-testid=cancel]")!);

        expect(onClose).toHaveBeenCalledTimes(1);
        expect(onSave).not.toHaveBeenCalled();
    });

    it("shows progress and blocks both buttons while saving", () => {
        render(resource([payload, headersParam(false)]), jest.fn(), jest.fn(), true);

        expect(container.querySelector("[data-testid=progress]")).not.toBeNull();
        expect(save()?.textContent).toBe("Saving...");
        expect(save()?.disabled).toBe(true);
        expect(container.querySelector<HTMLButtonElement>("[data-testid=cancel]")?.disabled).toBe(true);
    });

    it("offers nothing to save for a resource without the headers option", () => {
        render(resource([payload]));

        expect(checkbox()).toBeNull();
        expect(save()?.disabled).toBe(true);
    });
});

describe("findHeadersOption", () => {
    it("finds the option whatever the import prefix", () => {
        const aliased = { ...headersParam(false), type: { value: "h:Headers" } };

        expect(findHeadersOption(resource([payload, aliased]))).toBe(aliased);
    });

    it("ignores a fixed payload parameter and a resource with no parameters", () => {
        expect(findHeadersOption(resource([payload]))).toBeUndefined();
        expect(findHeadersOption(undefined)).toBeUndefined();
    });
});
