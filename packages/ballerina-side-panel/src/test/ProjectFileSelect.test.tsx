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

// ProjectFileSelect render + pick behaviour, modelled on FileSelect.test.tsx. Unlike FileSelect,
// this editor calls `selectProjectRelativeFile` (not `selectFileOrDirPath`) — no `isFile` flag,
// since the host always resolves against the current integration.

import React from "react";
import { fireEvent, waitFor } from "@testing-library/react";
import type { FormField } from "../components/Form/types";
import { renderWithForm } from "./formHarness";
import { TestRpcContext } from "./rpcHarness";
import { ProjectFileSelect } from "../components/editors/ProjectFileSelect";

// ProjectFileSelect reads `useRpcContext` from the @wso2/ballerina-rpc-client barrel
// (ESM-compiled — jest can't load it through the symlink), so redirect it to the
// harness context that the test wraps the component with below.
jest.mock("@wso2/ballerina-rpc-client", () => {
    const h = require("./rpcHarness");
    return { __esModule: true, useRpcContext: h.useRpcContext };
});

const field = (value = ""): FormField => ({
    key: "sapJcoDriverPath",
    label: "SAP JCo Library JAR",
    type: "PROJECT_FILE_SELECT",
    value,
    optional: false,
    editable: true,
    enabled: true,
    documentation: "",
    types: [{ fieldType: "PROJECT_FILE_SELECT", selected: true, extensions: ["jar"] }],
});

type ProjectFileSelectRpcClient = {
    getCommonRpcClient: () => { selectProjectRelativeFile: jest.Mock };
};

function renderProjectFileSelect(rpcClient: ProjectFileSelectRpcClient, initial = "") {
    return renderWithForm(
        <TestRpcContext.Provider value={{ rpcClient }}>
            <ProjectFileSelect field={field(initial)} />
        </TestRpcContext.Provider>,
        { defaultValues: { sapJcoDriverPath: initial } }
    );
}

describe("ProjectFileSelect", () => {
    it("renders a file-select control labelled from the field", () => {
        const rpcClient = { getCommonRpcClient: () => ({ selectProjectRelativeFile: jest.fn() }) };
        const { container } = renderProjectFileSelect(rpcClient);
        expect(container.textContent).toContain("SAP JCo Library JAR");
    });

    it("seeds the control with the model value", () => {
        const rpcClient = { getCommonRpcClient: () => ({ selectProjectRelativeFile: jest.fn() }) };
        const { getForm } = renderProjectFileSelect(rpcClient, "./resources/sapjco3.jar");
        expect(getForm().getValues("sapJcoDriverPath")).toBe("./resources/sapjco3.jar");
    });

    it("writes the host-resolved integration-relative path into the form on pick", async () => {
        const selectProjectRelativeFile = jest.fn().mockResolvedValue({
            path: "./resources/sapjco3.jar",
            absolutePath: "/integration/resources/sapjco3.jar",
            copied: true,
        });
        const rpcClient = { getCommonRpcClient: () => ({ selectProjectRelativeFile }) };
        const { getByText, getForm } = renderProjectFileSelect(rpcClient);

        fireEvent.click(getByText("Select File"));

        await waitFor(() => expect(getForm().getValues("sapJcoDriverPath")).toBe("./resources/sapjco3.jar"));
        // No `isFile` flag — the host always resolves the pick against the integration root.
        expect(selectProjectRelativeFile).toHaveBeenCalledWith({ filters: { "SAP JCo Library JAR": ["jar"] } });
    });

    it("keeps the previous value when the dialog is dismissed", async () => {
        const selectProjectRelativeFile = jest.fn().mockResolvedValue({ path: "" });
        const rpcClient = { getCommonRpcClient: () => ({ selectProjectRelativeFile }) };
        const { getByText, getForm } = renderProjectFileSelect(rpcClient, "./resources/sapjco3.jar");

        fireEvent.click(getByText("Select File"));

        await waitFor(() => expect(selectProjectRelativeFile).toHaveBeenCalled());
        expect(getForm().getValues("sapJcoDriverPath")).toBe("./resources/sapjco3.jar");
    });

    it("surfaces a form error when the RPC call rejects", async () => {
        const selectProjectRelativeFile = jest.fn().mockRejectedValue(new Error("host unavailable"));
        const rpcClient = { getCommonRpcClient: () => ({ selectProjectRelativeFile }) };
        const { getByText, findByText } = renderProjectFileSelect(rpcClient);

        fireEvent.click(getByText("Select File"));

        await findByText(/Failed to select SAP JCo Library JAR/i);
    });
});
