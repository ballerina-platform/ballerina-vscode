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

import React, { FC, ReactNode } from "react";

jest.mock("@wso2/ballerina-rpc-client", () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const h = require("./rpcHarness");
    return { __esModule: true, useRpcContext: h.useRpcContext, Context: h.TestRpcContext };
});

// Stub the ui-toolkit TextField with a plain input, recording the error the field is asked to show.
const mockTextField: { props?: any } = {};
jest.mock("@wso2/ui-toolkit", () => {
    const actual = jest.requireActual("@wso2/ui-toolkit");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const react = require("react");
    return {
        __esModule: true,
        ...actual,
        TextField: react.forwardRef((props: any, ref: any) => {
            mockTextField.props = props;
            return react.createElement("input", {
                ref,
                name: props.name,
                "data-testid": "identifier-input",
                onChange: props.onChange,
                onBlur: props.onBlur,
            });
        }),
    };
});

import { act, fireEvent, render } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { getGraphqlNameError, GRAPHQL_NAME_RULE } from "@wso2/ballerina-core";
import type { FormField } from "../components/Form/types";
import { Provider as FormProvider } from "../context/form";
import { DiagnosticsStoreProvider } from "../components/Form/DiagnosticsStore";
import { IdentifierField } from "../components/editors/IdentifierField";

const KEY = "name";

const graphqlNameField = (): FormField =>
    ({
        key: KEY,
        label: "Field Name",
        type: "IDENTIFIER",
        types: [{ fieldType: "IDENTIFIER", selected: true, validations: [{ rule: GRAPHQL_NAME_RULE, severity: "ERROR" }] }],
        value: "",
        optional: false,
        editable: true,
        enabled: true,
        documentation: "",
    } as unknown as FormField);

// The side-panel Form validates in react-hook-form's default `onSubmit` mode, so a failing rule only marks the form
// invalid until submit; this harness keeps that mode rather than formHarness's `onChange`.
const SubmitModeHarness: FC<{ children: ReactNode }> = ({ children }) => {
    const rhf = useForm<any>({ defaultValues: { [KEY]: "" } });
    const ctx: any = {
        form: { ...rhf, formState: rhf.formState },
        targetLineRange: { startLine: { line: 0, offset: 0 }, endLine: { line: 0, offset: 0 } },
        fileName: "test.bal",
        nodeInfo: { kind: "" },
    };
    return (
        <FormProvider {...ctx}>
            <DiagnosticsStoreProvider>{children}</DiagnosticsStoreProvider>
        </FormProvider>
    );
};

describe("IdentifierField live rule errors", () => {
    beforeEach(() => {
        mockTextField.props = undefined;
    });

    it("shows a failing GraphQL name rule as the user types, before any submit", async () => {
        const { getByTestId } = render(
            <SubmitModeHarness>
                <IdentifierField field={graphqlNameField()} />
            </SubmitModeHarness>
        );

        await act(async () => {
            fireEvent.change(getByTestId("identifier-input"), { target: { value: "issue-number" } });
        });
        expect(mockTextField.props.errorMsg).toBe(getGraphqlNameError("issue-number"));

        await act(async () => {
            fireEvent.change(getByTestId("identifier-input"), { target: { value: "issueNumber" } });
        });
        expect(mockTextField.props.errorMsg).toBe("");
    });
});
