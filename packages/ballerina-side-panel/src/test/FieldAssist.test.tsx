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

import React, { useEffect, useState } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ExpressionAssistResponse } from "@wso2/ballerina-core";
import {
    AssistButton,
    AssistExpression,
    FieldAssistInput,
    FieldAssistPanel,
    FieldThread,
    useFieldAssist,
} from "../components/editors/FieldAssist/FieldAssist";
import { DialogFieldAssist, useFieldThread } from "../components/editors/FieldAssist/StructuredFieldAssist";
import { FormAssistDescription, changesOf, keepUnsavedEdits } from "../components/editors/FieldAssist/FormAssist";
import { AppliedMark, AssistHeaderButton, AssistHostProvider, AssistHostValue, FormController, markUndone, useAssistHost } from "../components/editors/FieldAssist/AssistHost";
import { FormExpressionEditorProps, FormField } from "../components/Form/types";
import { AssistShell } from "../components/editors/FieldAssist/AssistShell";
import { ReviewDiff } from "../components/editors/FieldAssist/ChangeReview";

interface HarnessProps {
    initial: string;
    assist: AssistExpression;
    abort?: (id: string) => void;
    sensitive?: boolean;
    onApply?: (expression: string) => void | Promise<void>;
    thread?: FieldThread;
    review?: Parameters<typeof useFieldAssist>[0]["review"];
    continueInChat?: Parameters<typeof useFieldAssist>[0]["continueInChat"];
}

function Harness({ initial, assist, abort, sensitive, onApply, thread, review, continueInChat }: HarnessProps) {
    const [value, setValue] = useState(initial);
    const fieldAssist = useFieldAssist({ assist, thread, abort, getValue: () => value, sensitive, review, continueInChat });
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

    it("stops the pending request with Escape and keeps the thread open, as the form does", async () => {
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
        expect(screen.getByRole("alert")).toHaveProperty("textContent", "Stopped. Nothing changed.");
        expect(screen.getByText("anything")).toBeTruthy();
    });

    it("sends the thread's earlier requests and shows a question's answers", async () => {
        const assist = jest.fn()
            .mockResolvedValueOnce({ question: { text: "Which total?", options: ["subtotal", "grandTotal"] } })
            .mockResolvedValueOnce({ expression: "0.08d * grandTotal" });
        render(<Harness initial="" assist={assist} />);

        fireEvent.click(screen.getByText("open"));
        await ask("8% tax on the total");
        await act(async () => {
            fireEvent.click(await screen.findByText("grandTotal"));
        });

        expect(assist).toHaveBeenLastCalledWith(expect.objectContaining({
            instruction: "grandTotal", earlier: ["8% tax on the total (not done)"], asked: "Which total?",
        }));
        expect(await screen.findByText("Insert")).toBeTruthy();
    });

    it("keeps the thread when the field's editor remounts, e.g. on a mode switch", async () => {
        const kept = new Map<string, string[]>();
        const marks = new Map<number, string>();
        const thread = (): FieldThread => ({ history: kept.get("total") ?? [], marks, keep: (history) => { kept.set("total", history); } });
        const assist = jest.fn(async (): Promise<ExpressionAssistResponse> => ({ expression: "subtotal * 1.08d" }));
        const first = render(<Harness initial="" assist={assist} thread={thread()} />);
        fireEvent.click(screen.getByText("open"));
        await ask("8% tax on the subtotal");
        first.unmount();

        render(<Harness initial="" assist={assist} thread={thread()} />);
        fireEvent.click(screen.getByText("open"));
        await ask("round it to 2 places");

        expect(assist).toHaveBeenLastCalledWith(expect.objectContaining({ earlier: ["8% tax on the subtotal"] }));
    });

    it("marks a request that changed nothing, so the next one does not read it as applied", async () => {
        const assist = jest.fn()
            .mockResolvedValueOnce({ error: "This took too long. Try again." })
            .mockResolvedValueOnce({ expression: "subtotal * 1.08d" });
        render(<Harness initial="" assist={assist} />);
        fireEvent.click(screen.getByText("open"));
        await ask("8% tax on the subtotal");
        await ask("8% tax on the subtotal");

        expect(assist).toHaveBeenLastCalledWith(expect.objectContaining({ earlier: ["8% tax on the subtotal (not done)"] }));
    });

    it("lands a value that comes with a hand-off for review, carrying the hand-off", async () => {
        const flowChange = { reason: "Sending the email needs a new node.", request: "Add an email node that sends the confirmation to confirmTo." };
        const review = jest.fn();
        const assist = jest.fn(async (): Promise<ExpressionAssistResponse> => ({ expression: "booking.lead.email", flowChange }));
        render(<Harness initial="" assist={assist} review={review} continueInChat={jest.fn()} />);
        fireEvent.click(screen.getByText("open"));
        await ask("email the booking confirmation to the guest");

        expect(review).toHaveBeenCalledWith(expect.objectContaining({ expression: "booking.lead.email", flowChange }), "email the booking confirmation to the guest");
        expect(screen.queryByText("Changes Required Outside This Form")).toBeNull();
    });

    it("lands a value that creates a configurable for review, and keeps the thread open with the reason when it can't land", async () => {
        const review = jest.fn().mockRejectedValueOnce(new Error("This form can't create configurables yet."));
        const assist = jest.fn(async (): Promise<ExpressionAssistResponse> => ({
            expression: "apiKey",
            actions: [{ kind: "createConfigurable", name: "apiKey", type: "string", documentation: "" }],
        }));
        render(<Harness initial='"abc"' assist={assist} review={review} />);
        fireEvent.click(screen.getByText("open"));
        await ask("move it to a configurable");

        expect(review).toHaveBeenCalledWith(expect.objectContaining({ expression: "apiKey" }), "move it to a configurable");
        expect(await screen.findByText("This form can't create configurables yet.")).toBeTruthy();
    });

    it("clears the thread, so the next request goes without the earlier ones", async () => {
        const assist = jest.fn(async (): Promise<ExpressionAssistResponse> => ({ explanation: "It adds tax." }));
        render(<Harness initial="subtotal" assist={assist} />);
        fireEvent.click(screen.getByText("open"));
        await ask("what does this do");
        fireEvent.click(screen.getByRole("button", { name: "Clear chat" }));

        expect(screen.queryByText("what does this do")).toBeNull();
        await ask("round it");
        expect(assist).toHaveBeenLastCalledWith(expect.objectContaining({ instruction: "round it", earlier: undefined }));
    });

    it("shows a decline as its own card", async () => {
        const assist = jest.fn(async (): Promise<ExpressionAssistResponse> => ({ error: "That is not about this value.", declined: true }));
        render(<Harness initial="" assist={assist} />);

        fireEvent.click(screen.getByText("open"));
        await ask("what's the weather");

        expect(await screen.findByText("Request Not Applied")).toBeTruthy();
        expect(screen.getByText("That is not about this value.")).toBeTruthy();
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

describe("DialogFieldAssist", () => {
    const field = {
        key: "serviceConfig",
        label: "Service Configuration",
        type: "EXPRESSION",
        types: [{ fieldType: "RECORD", ballerinaType: "http:HttpServiceConfig", selected: true }],
        optional: true,
        editable: true,
        enabled: true,
        documentation: "",
        value: "",
    } as unknown as FormField;
    const BEFORE = "{cors: {allowMethods: [\"GET\"]}}";
    const AFTER = "{cors: {allowMethods: [\"GET\", \"PUT\"]}}";

    function DialogHarness({ assistExpression, onApply }: { assistExpression: FormExpressionEditorProps["assistExpression"]; onApply: jest.Mock }) {
        const [value, setValue] = useState(BEFORE);
        return (
            <DialogFieldAssist
                field={field}
                value={value}
                expressionEditor={{ assistExpression } as FormExpressionEditorProps}
                errors={[]}
                onApply={(expression, imports) => {
                    onApply(expression, imports);
                    setValue(expression);
                }}
            >
                <output data-testid="value">{value}</output>
                <AssistButton />
            </DialogFieldAssist>
        );
    }

    it("writes the suggestion and its imports into the dialog's field, then reviews it and undoes it", async () => {
        const assistExpression = jest.fn(async (): Promise<ExpressionAssistResponse> => ({ expression: AFTER, imports: { http: "ballerina/http" }, note: "Adds PUT" }));
        const onApply = jest.fn();
        render(<DialogHarness assistExpression={assistExpression} onApply={onApply} />);

        fireEvent.click(screen.getByRole("button", { name: "Fill this field with Copilot" }));
        await ask("Also allow PUT");

        expect(assistExpression).toHaveBeenCalledWith(expect.objectContaining({
            key: "serviceConfig",
            value: BEFORE,
            property: expect.objectContaining({ types: [expect.objectContaining({ ballerinaType: "http:HttpServiceConfig" })] }),
        }));
        expect(onApply).toHaveBeenCalledWith(AFTER, { http: "ballerina/http" });
        expect(await screen.findByText("Changed by Copilot")).toBeTruthy();
        expect(screen.getByText("Adds PUT")).toBeTruthy();

        await act(async () => {
            fireEvent.click(screen.getByText("Undo"));
        });
        expect(onApply).toHaveBeenLastCalledWith(BEFORE, undefined);
        expect(screen.getByTestId("value").textContent).toBe(BEFORE);
    });
});

describe("hand-off values", () => {
    const description = (value: string) => ({ slots: [{ path: "expression", label: "Expression", value, property: { types: [] } }], groups: [] }) as unknown as FormAssistDescription;
    const handoff = (values: Record<string, string>) => ({
        response: { values, flowChange: { reason: "r", request: "q" } },
        before: description("subtotal * 0.10d"),
    });

    it("drop a value that would put the saved one back over an unsaved edit", () => {
        expect(keepUnsavedEdits(handoff({ expression: "subtotal" }), () => "subtotal").response.values).toEqual({});
    });

    it("keep a value that changes the form", () => {
        expect(keepUnsavedEdits(handoff({ expression: "subtotal * 0.2d" }), () => "subtotal").response.values).toEqual({ expression: "subtotal * 0.2d" });
    });
});

describe("a form's changes", () => {
    const proposal = (saved: string, value: string) => ({
        response: { values: { description: value } },
        before: { slots: [{ path: "description", label: "Description", value: saved, property: { types: [] } }], groups: [] } as unknown as FormAssistDescription,
    });

    it("leave out a value that differs only in surrounding whitespace", () => {
        expect(changesOf(proposal("Adds two numbers.\n", "Adds two numbers."))).toEqual([]);
    });

    it("list a value whose text changed", () => {
        expect(changesOf(proposal("Adds two numbers.\n", "Adds two integers."))).toHaveLength(1);
    });
});

describe("undone changes", () => {
    it("mark the request that made them in the field's thread, so the next request does not bring them back", () => {
        const thread = { history: ["10% of the subtotal", "round it"], marks: new Map<number, string>(), keep: jest.fn() };
        const host = { fieldThread: () => thread, formThread: { current: undefined } } as unknown as AssistHostValue;
        markUndone(host, "discount", { inField: true, request: "round it" } as AppliedMark);
        expect(thread.marks.get(1)).toBe("(undone)");
        expect(thread.marks.has(0)).toBe(false);
    });
});

describe("field threads in a host", () => {
    const assist = jest.fn(async (): Promise<ExpressionAssistResponse> => ({ expression: "1" }));
    function HostedField() {
        const host = useAssistHost()!;
        useEffect(() => host.registerField("expression", {} as never), [host.registerField]);
        return <Harness initial="" assist={assist} thread={host.fieldThread("expression")} />;
    }
    // `form` keys the form, as a rebuild does; no form is the node list between two forms.
    const Panel = ({ form }: { form?: number }) => <AssistHostProvider>{form !== undefined && <HostedField key={form} />}</AssistHostProvider>;

    async function askInFirstForm() {
        const view = render(<Panel form={1} />);
        fireEvent.click(screen.getByText("open"));
        await ask("the text hello world");
        return view;
    }

    it("keep a field's thread when its form rebuilds", async () => {
        const view = await askInFirstForm();
        view.rerender(<Panel form={2} />);
        fireEvent.click(screen.getByText("open"));

        expect(screen.getByText("the text hello world")).toBeTruthy();
    });

    it("start empty in a new form once the old one went away", async () => {
        const view = await askInFirstForm();
        view.rerender(<Panel />);
        view.rerender(<Panel form={2} />);
        fireEvent.click(screen.getByText("open"));

        expect(screen.queryByText("the text hello world")).toBeNull();
    });
});

describe("a field thread's replies", () => {
    it("go with the next request, so a follow-up can refer to them", async () => {
        const assist = jest.fn(async (input: FieldAssistInput): Promise<ExpressionAssistResponse> =>
            input.earlier ? { expression: "\"UPI\"" } : { question: { text: "Which method?", options: ["UPI", "WALLET"] } });
        render(<Harness initial="" assist={assist} />);
        fireEvent.click(screen.getByText("open"));
        await ask("a payment method");
        await ask("the first one");

        expect(assist.mock.calls[1][0]).toMatchObject({ earlier: ["a payment method (not done)"], replies: ["Which method? (UPI, WALLET)"] });
    });

    it("show the latest reply when the card opens again after a review, and not while the review takes over", async () => {
        const assist = jest.fn(async (): Promise<ExpressionAssistResponse> => ({ expression: "1", note: "Sets it to one." }));
        render(<Harness initial="" assist={assist} review={jest.fn()} />);
        fireEvent.click(screen.getByText("open"));
        await ask("one");
        expect(screen.queryByText("Sets it to one.")).toBeNull();

        fireEvent.click(screen.getByText("open"));
        fireEvent.click(screen.getByText("open"));
        expect(screen.getByText("Sets it to one.")).toBeTruthy();
    });
});

describe("a thread's earlier turns", () => {
    const Thread = ({ history }: { history: string[] }) => (
        <AssistShell history={history} replies={["Changed Name.", "Which ones? (UPI, WALLET)"]} placeholder="Ask" onSubmit={() => true} onClose={() => undefined} />
    );

    it("fold behind one row, and show with Copilot's replies when opened", () => {
        render(<Thread history={["name it Payment", "can we add anything else?", "ok add them"]} />);
        expect(screen.queryByText("name it Payment")).toBeNull();
        expect(screen.getByText("ok add them")).toBeTruthy();

        fireEvent.click(screen.getByRole("button", { name: "Show 4 Earlier Messages" }));
        expect(screen.getByText("name it Payment")).toBeTruthy();
        expect(screen.getByText("Which ones? (UPI, WALLET)")).toBeTruthy();
    });

    it("fold again once the next request is in", () => {
        const view = render(<Thread history={["name it Payment", "can we add anything else?"]} />);
        fireEvent.click(screen.getByRole("button", { name: "Show 2 Earlier Messages" }));
        view.rerender(<Thread history={["name it Payment", "can we add anything else?", "ok add them"]} />);

        expect(screen.queryByText("name it Payment")).toBeNull();
        expect(screen.getByRole("button", { name: "Show 4 Earlier Messages" }).getAttribute("aria-expanded")).toBe("false");
    });
});

describe("the form's first-use hint", () => {
    function CopilotForm() {
        const host = useAssistHost()!;
        useEffect(() => host.registerForm({} as FormController), [host.registerForm]);
        return <AssistHeaderButton />;
    }
    const openForm = () => render(<AssistHostProvider><CopilotForm /></AssistHostProvider>);
    const hint = () => screen.queryByRole("note");

    beforeEach(() => localStorage.clear());

    it("stays until dismissed, and does not come back on the next form", () => {
        const first = openForm();
        expect(hint()?.textContent).toBe("Use Copilot to fill this form");

        fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
        expect(hint()).toBeNull();
        first.unmount();

        openForm();
        expect(hint()).toBeNull();
    });
});

describe("Revise from a field's change card", () => {
    let host: AssistHostValue;
    function RevisedField({ assist }: { assist: AssistExpression }) {
        host = useAssistHost()!;
        const fieldAssist = useFieldAssist({ assist, thread: host.fieldThread("expression"), getValue: () => "subtotal", review: () => undefined });
        useFieldThread("expression", "Expression", fieldAssist, true);
        return null;
    }
    const revise = async (response: ExpressionAssistResponse) => {
        let answer: (value: ExpressionAssistResponse) => void = () => undefined;
        render(<AssistHostProvider><RevisedField assist={() => new Promise((resolve) => { answer = resolve; })} /></AssistHostProvider>);
        act(() => { host.reviseInField("expression", "round it"); });
        const whileRunning = host.fieldRunning;
        await act(async () => { answer(response); });
        return { whileRunning, after: host.fieldRunning, scope: host.scope };
    };

    it("runs in the card, which shows it working, and leaves the thread closed when a value lands", async () => {
        expect(await revise({ expression: "subtotal * 2" })).toEqual({ whileRunning: "expression", after: undefined, scope: undefined });
    });

    it("opens the thread for an answer the card can't show, e.g. a question", async () => {
        expect((await revise({ question: { text: "Which total?", options: ["a", "b"] } })).scope).toBe("field:expression");
    });
});

describe("ReviewDiff", () => {
    it("shows a replaced expression as code, with no chip for a value it names", () => {
        const { container } = render(<ReviewDiff before="order.total" after="{amount: 0d}" display="code" />);
        expect(container.textContent).toBe("−order.total");
        expect(container.querySelector("i, [class*='codicon'], [class*='fw-']")).toBeNull();
    });
});
