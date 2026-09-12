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

// L2 (P0): FileSelect render behaviour (docs/TEST_BACKLOG.md L2-05). Renders the real
// editor via formHarness: shows the file-select label derived from the field label, and
// (via the rpcHarness below) the extension-filter payload it sends to `selectFileOrDirPath`.

import React from "react";
import { fireEvent, waitFor } from "@testing-library/react";
import type { FormField } from "../components/Form/types";
import { renderWithForm } from "./formHarness";
import { TestRpcContext } from "./rpcHarness";
import { FileSelect } from "../components/editors/FileSelect";

// FileSelect reads `useRpcContext` from the @wso2/ballerina-rpc-client barrel
// (ESM-compiled — jest can't load it through the symlink), so redirect it to the
// harness context that the test wraps the component with below.
jest.mock("@wso2/ballerina-rpc-client", () => {
    const h = require("./rpcHarness");
    return { __esModule: true, useRpcContext: h.useRpcContext };
});

const field = (value = "", extensions?: string[]): FormField => ({
    key: "cert",
    label: "Certificate",
    type: "FILE_SELECT",
    value,
    optional: false,
    editable: true,
    enabled: true,
    documentation: "",
    types: [{ fieldType: "FILE_SELECT", selected: true, ...(extensions ? { extensions } : {}) }],
});

type FileSelectRpcClient = {
    getCommonRpcClient: () => { selectFileOrDirPath: jest.Mock };
};

function renderFileSelect(rpcClient: FileSelectRpcClient, initial = "", extensions?: string[]) {
    return renderWithForm(
        <TestRpcContext.Provider value={{ rpcClient }}>
            <FileSelect field={field(initial, extensions)} />
        </TestRpcContext.Provider>,
        { defaultValues: { cert: initial } }
    );
}

describe("FileSelect", () => {
    it("renders a file-select control labelled from the field", () => {
        const rpcClient = { getCommonRpcClient: () => ({ selectFileOrDirPath: jest.fn() }) };
        const { container } = renderFileSelect(rpcClient);
        // FileSelect renders `Select ${field.label} File`
        expect(container.textContent).toContain("Certificate");
    });

    it("seeds the control with the model value", () => {
        const rpcClient = { getCommonRpcClient: () => ({ selectFileOrDirPath: jest.fn() }) };
        const { getForm } = renderFileSelect(rpcClient, "/path/to/cert.pem");
        expect(getForm().getValues("cert")).toBe("/path/to/cert.pem");
    });

    it("passes extension filters through when the primary type declares extensions", async () => {
        const selectFileOrDirPath = jest.fn().mockResolvedValue({ path: "/path/to/cert.pem" });
        const rpcClient = { getCommonRpcClient: () => ({ selectFileOrDirPath }) };
        const { getByText } = renderFileSelect(rpcClient, "", ["pem", "crt"]);

        fireEvent.click(getByText("Select File"));

        await waitFor(() => expect(selectFileOrDirPath).toHaveBeenCalledWith({
            isFile: true,
            filters: { "Certificate": ["pem", "crt"] },
        }));
    });

    it("omits filters when the primary type has no extensions", async () => {
        const selectFileOrDirPath = jest.fn().mockResolvedValue({ path: "/path/to/cert.pem" });
        const rpcClient = { getCommonRpcClient: () => ({ selectFileOrDirPath }) };
        const { getByText } = renderFileSelect(rpcClient);

        fireEvent.click(getByText("Select File"));

        await waitFor(() => expect(selectFileOrDirPath).toHaveBeenCalledWith({
            isFile: true,
            filters: undefined,
        }));
    });
});
