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

import React, { useState } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ExpressionAssistResponse } from "@wso2/ballerina-core";
import {
    AssistExpression,
    FieldAssistInput,
    FieldAssistPanel,
    useFieldAssist,
} from "../components/editors/FieldAssist/FieldAssist";

interface HarnessProps {
    initial: string;
    assist: AssistExpression;
    abort?: (id: string) => void;
    sensitive?: boolean;
    onApply?: (expression: string) => void | Promise<void>;
}

function Harness({ initial, assist, abort, sensitive, onApply }: HarnessProps) {
    const [value, setValue] = useState(initial);
    const fieldAssist = useFieldAssist({ assist, abort, getValue: () => value, sensitive });
    return (
        <>
            <output data-testid="value">{value}</output>
            <button onClick={fieldAssist.toggle}>open</button>
            <button onClick={() => fieldAssist.fix(["incompatible types"])}>fix</button>
            {fieldAssist.open && (
                <FieldAssistPanel
                    assist={fieldAssist}
                    value={value}
                    onApply={async (p) => {
                        await onApply?.(p.expression);
                        setValue(p.expression);
                    }}
                />
            )}
        </>
    );
}

const promptBox = () => screen.getByRole("textbox");

async function ask(text: string) {
    fireEvent.change(promptBox(), { target: { value: text } });
    await act(async () => {
        fireEvent.keyDown(promptBox(), { key: "Enter" });
    });
}

describe("FieldAssist", () => {
    it("writes a value for an empty field and inserts it with Tab", async () => {
        const assist = jest.fn(async (): Promise<ExpressionAssistResponse> => ({ expression: "0.08d * total", note: "Adds tax" }));
        render(<Harness initial="" assist={assist} />);

        fireEvent.click(screen.getByText("open"));
        await ask("8% tax on the total");

        expect(assist).toHaveBeenCalledWith(expect.objectContaining({ mode: "generate", value: "", instruction: "8% tax on the total" }));
        expect(await screen.findByText("Insert")).toBeTruthy();
        expect(screen.getByText("Adds tax")).toBeTruthy();

        await act(async () => {
            fireEvent.keyDown(promptBox(), { key: "Tab" });
        });
        expect(screen.getByTestId("value").textContent).toBe("0.08d * total");
        expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("refines the latest suggestion rather than the saved value", async () => {
        const assist = jest.fn(async (input: FieldAssistInput): Promise<ExpressionAssistResponse> =>
            ({ expression: `${input.value}.trim()` }));
        render(<Harness initial="name" assist={assist} />);

        fireEvent.click(screen.getByText("open"));
        await ask("trim it");
        await screen.findByText("Replace");
        await ask("again");

        expect(assist.mock.calls.map(([input]) => [input.mode, input.value])).toEqual([
            ["refine", "name"],
            ["refine", "name.trim()"],
        ]);
    });

    it("fixes with the field's errors and shows the reason when no value works", async () => {
        const assist = jest.fn(async (): Promise<ExpressionAssistResponse> => ({ error: "The type has no status field." }));
        render(<Harness initial="request.message" assist={assist} />);

        await act(async () => {
            fireEvent.click(screen.getByText("fix"));
        });

        expect(assist).toHaveBeenCalledWith(expect.objectContaining({ mode: "fix", diagnostics: ["incompatible types"] }));
        expect(await screen.findByRole("alert")).toHaveProperty("textContent", "The type has no status field.");
        expect(screen.queryByText("Replace")).toBeNull();
    });

    it("cancels the pending request when closed with Escape", async () => {
        let requestId = "";
        const assist = jest.fn((input: FieldAssistInput) => {
            requestId = input.requestId;
            return new Promise<ExpressionAssistResponse>(() => undefined);
        });
        const abort = jest.fn();
        render(<Harness initial="" assist={assist} abort={abort} />);

        fireEvent.click(screen.getByText("open"));
        await ask("anything");
        fireEvent.keyDown(promptBox(), { key: "Escape" });

        await waitFor(() => expect(abort).toHaveBeenCalledWith(requestId));
        expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("withholds a secret from the request and says so", async () => {
        const assist = jest.fn(async (): Promise<ExpressionAssistResponse> => ({
            expression: "anthropicApiKey",
            actions: [{ kind: "createConfigurable", name: "anthropicApiKey", type: "string", useFieldValue: true }],
        }));
        render(<Harness initial={"\"my-secret\""} assist={assist} sensitive />);

        fireEvent.click(screen.getByText("open"));
        await ask("make this a configurable");

        expect(assist).toHaveBeenCalledWith(expect.objectContaining({ value: "", valueWithheld: true }));
        expect(JSON.stringify(assist.mock.calls)).not.toContain("my-secret");
        expect(screen.getByText(/wasn't sent to Copilot/)).toBeTruthy();
        expect(await screen.findByText(/Creates the configurable anthropicApiKey \(string\), holding the current value/)).toBeTruthy();
    });

    it("holds back a prompt that contains a key", async () => {
        const assist = jest.fn();
        render(<Harness initial="" assist={assist} />);

        fireEvent.click(screen.getByText("open"));
        await ask("use sk-ant-api03-abcdefghijklmnopqrstuv as the value");

        expect(assist).not.toHaveBeenCalled();
        expect(screen.getByRole("alert").textContent).toMatch(/wasn't sent/);
        expect((promptBox() as HTMLTextAreaElement).value).toContain("sk-ant");
    });

    it("keeps the suggestion open when applying it fails", async () => {
        const assist = jest.fn(async (): Promise<ExpressionAssistResponse> => ({ expression: "apiKey" }));
        const onApply = jest.fn(async () => {
            throw new Error("Couldn't create the configurable.");
        });
        render(<Harness initial="" assist={assist} onApply={onApply} />);

        fireEvent.click(screen.getByText("open"));
        await ask("a configurable");
        await act(async () => {
            fireEvent.click(await screen.findByText("Insert"));
        });

        expect(screen.getByRole("alert").textContent).toBe("Couldn't create the configurable.");
        expect(screen.getByTestId("value").textContent).toBe("");
    });

});
