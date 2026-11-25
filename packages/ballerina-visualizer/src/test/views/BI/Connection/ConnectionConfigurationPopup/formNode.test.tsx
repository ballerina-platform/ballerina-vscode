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

// L1/L2: the node the Add Connection popup gives its form. A new object on every render made the form start over
// whenever the popup redrew, as it does while saving: the form read the end of connections.bal again, where the
// connection being saved had just been written, and checked the new connection's name there, reporting
// "This connection name is already used". The node must stay the same object while the selected node does.

import React from "react";
import { createRoot, Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import type { FlowNode } from "@wso2/ballerina-core";
import { formNodeOf, useFormNode } from "../../../../../views/BI/Connection/ConnectionConfigurationPopup/formNode";

declare global {
    var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const salesforce = (): FlowNode => ({
    id: "1",
    metadata: { label: "Salesforce", description: "Connects to Salesforce" },
    codedata: { node: "NEW_CONNECTION", org: "ballerinax", module: "salesforce", object: "Client", symbol: "init" },
    properties: { variable: { value: "salesforceClient" } },
} as unknown as FlowNode);

describe("the Add Connection popup's form node", () => {
    let container: HTMLDivElement;
    let root: Root;
    let seen: (FlowNode | undefined)[];

    function Popup({ node, saving }: { node: FlowNode | undefined; saving: boolean }) {
        seen.push(useFormNode(node));
        return <span>{saving ? "Saving..." : "Save Connection"}</span>;
    }

    beforeEach(() => {
        seen = [];
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
    });

    it("INVARIANT: stays the same object across redraws, such as the one saving starts", () => {
        const node = salesforce();
        act(() => root.render(<Popup node={node} saving={false} />));
        act(() => root.render(<Popup node={node} saving={true} />));
        act(() => root.render(<Popup node={node} saving={false} />));
        expect(seen).toHaveLength(3);
        expect(seen[1]).toBe(seen[0]);
        expect(seen[2]).toBe(seen[0]);
    });

    it("is a new object for a newly selected node", () => {
        act(() => root.render(<Popup node={salesforce()} saving={false} />));
        act(() => root.render(<Popup node={salesforce()} saving={false} />));
        expect(seen[1]).not.toBe(seen[0]);
        act(() => root.render(<Popup node={undefined} saving={false} />));
        expect(seen[2]).toBeUndefined();
    });

    it("leaves out the description the connector's card shows, without changing the selected node", () => {
        const node = salesforce();
        const formNode = formNodeOf(node);
        expect(formNode.metadata.description).toBeUndefined();
        expect(formNode.metadata.label).toBe("Salesforce");
        expect(node.metadata.description).toBe("Connects to Salesforce");
    });
});
