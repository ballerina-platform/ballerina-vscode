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

import { createRequestGate } from "../../utils/request-gate";

/** A request whose response the test releases when it chooses, so the order the responses arrive in is controlled. */
const deferred = <T>() => {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((res) => {
        resolve = res;
    });
    return { promise, resolve };
};

describe("latest request gate", () => {
    // How FlowNodeForm and TypeHelper fetch types: take a token, await the response, publish only if still current.
    const fetchTypes = (gate: ReturnType<typeof createRequestGate>, published: string[]) =>
        async (response: Promise<string>) => {
            const token = gate.begin();
            const types = await response;
            if (gate.isCurrent(token)) {
                published.push(types);
            }
        };

    it("drops an earlier request that answers after a later one", async () => {
        const gate = createRequestGate();
        const published: string[] = [];
        const fetch = fetchTypes(gate, published);
        const forRecordField = deferred<string>();
        const forJsonField = deferred<string>();

        const first = fetch(forRecordField.promise);
        const second = fetch(forJsonField.promise);
        forJsonField.resolve("json types");
        await second;
        forRecordField.resolve("record types");
        await first;

        expect(published).toEqual(["json types"]);
    });

    it("drops a request still pending when its field closes", async () => {
        const gate = createRequestGate();
        const published: string[] = [];
        const pending = deferred<string>();

        const request = fetchTypes(gate, published)(pending.promise);
        gate.invalidate();
        pending.resolve("record types");
        await request;

        expect(published).toEqual([]);
    });

    it("publishes requests that do not overlap", async () => {
        const gate = createRequestGate();
        const published: string[] = [];
        const fetch = fetchTypes(gate, published);

        await fetch(Promise.resolve("record types"));
        await fetch(Promise.resolve("json types"));

        expect(published).toEqual(["record types", "json types"]);
    });
});
