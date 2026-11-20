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

import React from "react";
import { createRoot, Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import type { ContextEntry } from "@wso2/ballerina-core";

// The expression check the editor waits on before saving; each test settles it when it chooses.
let settleCheck: (diagnostics: { severity: number }[]) => void;
// Types into the expression field, as the shared editor would.
let typeExpression: (value: string) => void;

jest.mock("@wso2/ui-toolkit", () => {
    const Plain = (props: { children?: React.ReactNode }) => <div>{props.children}</div>;
    type Action = { text: string; onClick: () => void; disabled?: boolean };
    return {
        ActionButtons: (props: { primaryButton: Action; secondaryButton: Action }) => (
            <div>
                {[props.primaryButton, props.secondaryButton].map((action) => (
                    <button key={action.text} disabled={action.disabled} onClick={action.onClick}>{action.text}</button>
                ))}
            </div>
        ),
        CheckBox: () => <div />,
        Divider: () => <hr />,
        Dropdown: () => <div />,
        TextField: () => <div />,
        Typography: Plain,
    };
});
jest.mock("../../../../views/BI/ServiceDesigner/styles", () => {
    const Plain = (props: { children?: React.ReactNode }) => <div>{props.children}</div>;
    return { EditorContainer: Plain, EditorContent: Plain };
});
jest.mock("../../../../views/BI/ServiceDesigner/Forms/TriggerHandlerForm/AnnotationExpressionField", () => {
    const { forwardRef, useImperativeHandle } = require("react");
    return {
        AnnotationExpressionField: forwardRef((props: { onChange: (value: string) => void }, ref: unknown) => {
            typeExpression = props.onChange;
            useImperativeHandle(ref, () => ({
                revalidate: () => new Promise((resolve) => {
                    settleCheck = resolve;
                }),
            }));
            return <div />;
        }),
    };
});

import { ContextValueEditor } from "../../../../views/GraphQLDiagram/RequestContext/ContextValueEditor";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const entry: ContextEntry = { key: "tenant", source: "expression", value: "request.rawPath", required: false };
const expressionScope = {
    filePath: "/project/functions.bal",
    lineRange: { startLine: { line: 3, offset: 4 }, endLine: { line: 3, offset: 4 } },
};

describe("ContextValueEditor", () => {
    let root: Root;
    let container: HTMLDivElement;
    let onSave: jest.Mock;

    beforeEach(() => {
        onSave = jest.fn();
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
        act(() => {
            root.render(<ContextValueEditor entry={entry} others={[]} isNew={false}
                expressionScope={expressionScope} onSave={onSave} onCancel={jest.fn()} />);
        });
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
    });

    const clickSave = async () => {
        const save = Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Save");
        await act(async () => {
            save.click();
        });
    };

    it("saves once the expression check finds no errors", async () => {
        await clickSave();
        await act(async () => settleCheck([]));
        expect(onSave).toHaveBeenCalledWith(entry);
    });

    it("checks and saves the value edited while the expression was being checked", async () => {
        await clickSave();
        act(() => typeExpression("request.method"));
        await act(async () => settleCheck([]));
        expect(onSave).not.toHaveBeenCalled();
        await act(async () => settleCheck([]));
        expect(onSave).toHaveBeenCalledWith({ ...entry, value: "request.method" });
    });

    it("does not save when the editor closed while the expression was being checked", async () => {
        await clickSave();
        act(() => root.render(<div />));
        await act(async () => settleCheck([]));
        expect(onSave).not.toHaveBeenCalled();
    });
});
