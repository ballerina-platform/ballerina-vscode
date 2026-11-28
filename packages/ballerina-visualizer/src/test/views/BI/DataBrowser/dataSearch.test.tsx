/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import React from "react";
import { act } from "react-dom/test-utils";
import { createRoot, Root } from "react-dom/client";
import type { VisibleType } from "@wso2/ballerina-core";

jest.mock("@wso2/ballerina-rpc-client", () => ({}));
jest.mock("../../../../utils/bi", () => ({}));

import { DataItem, DataSearch, useDataSearch } from "../../../../views/BI/DataBrowser/useDataTree";

declare global {
    // eslint-disable-next-line no-var
    var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const LOINC = { path: "LOINC_SYSTOLIC", name: "LOINC_SYSTOLIC", type: "string", opens: false };
const order = { path: "order", name: "order", type: "Order", opens: true };
const sections = [{ title: "Module Variables", roots: [LOINC, order] }];
const source: VisibleType[] = [];

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
    jest.useFakeTimers();
    container = document.createElement("div");
    root = createRoot(container);
});
afterEach(() => {
    act(() => root.unmount());
    jest.useRealTimers();
});

function search(query: string, childrenOf: (parent: DataItem) => Promise<DataItem[]>) {
    const latest: { current?: DataSearch } = {};
    function Probe() {
        latest.current = useDataSearch(query, sections, childrenOf, source);
        return null;
    }
    act(() => root.render(<Probe />));
    return latest;
}

describe("useDataSearch", () => {
    it("shows top-level matches before the nested search finishes, and stays searching until it does", async () => {
        let resolveFields: (items: DataItem[]) => void = () => undefined;
        const childrenOf = jest.fn(() => new Promise<DataItem[]>((resolve) => (resolveFields = resolve)));
        const latest = search("loinc_sys", childrenOf);
        expect(latest.current.searching).toBe(true);

        await act(async () => jest.runOnlyPendingTimers());
        expect(latest.current.results?.["Module Variables"]).toEqual([LOINC]);
        expect(latest.current.searching).toBe(true);

        await act(async () => resolveFields([]));
        expect(latest.current.searching).toBe(false);
    });

    it("finishes with no matches only after the nested search", async () => {
        const childrenOf = jest.fn().mockResolvedValue([{ path: "order.id", name: "id", type: "string", opens: false }]);
        const latest = search("ldl", childrenOf);

        await act(async () => jest.runOnlyPendingTimers());
        expect(latest.current.results?.["Module Variables"]).toEqual([]);
        expect(latest.current.searching).toBe(false);
    });
});
