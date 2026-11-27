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

jest.mock("@wso2/ballerina-rpc-client", () => ({ useRpcContext: () => ({ rpcClient: {} }) }));

import React, { useState } from "react";
import { render } from "@testing-library/react";
import { Parameter, useHeldParameters } from "../components/ParamManager/ParamManager";

const row = (key: string): Parameter => ({ id: 0, key, value: key, icon: "", identifierEditable: true, identifierRange: undefined, formValues: { variable: key } });

let shown: Parameter[] = [];
function Rows({ value, adding }: { value: Parameter[]; adding?: Parameter }) {
    const [parameters, setParameters] = useState<Parameter[]>(adding ? [adding] : []);
    useHeldParameters(value, parameters, setParameters);
    shown = parameters;
    return null;
}

describe("rows held from the form value", () => {
    it("keeps a row being added when the form re-renders the same list", () => {
        const { rerender } = render(<Rows value={[]} adding={row("payment")} />);
        rerender(<Rows value={[]} adding={row("payment")} />);
        expect(shown.map((param) => param.key)).toEqual(["payment"]);
    });

    it("follows a new list written into the form", () => {
        const { rerender } = render(<Rows value={[]} />);
        rerender(<Rows value={[row("a"), row("b")]} />);
        expect(shown.map((param) => param.key)).toEqual(["a", "b"]);
    });
});
