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

import { FunctionModel } from "@wso2/ballerina-core";
import {
    getTcpConnectionHandlers,
    TCP_HANDLER_DESCRIPTIONS,
} from "../../../../views/BI/ServiceDesigner/tcpHandlers";

jest.mock("@wso2/ballerina-core", () => ({}));

const fn = (name: string, kind = "REMOTE") => ({ name: { value: name }, kind } as unknown as FunctionModel);
const names = (handlers: FunctionModel[]) => handlers.map((handler) => handler.name.value);

// L1: the TCP service designer leads with the handlers a user implements, onBytes first, whatever order the class
// declares them in. Anything it does not know keeps its source order after them, and non-remote methods are not
// connection handlers at all.
describe("getTcpConnectionHandlers", () => {
    it("puts the known handlers first, onBytes leading, whatever the source order", () => {
        expect(names(getTcpConnectionHandlers([fn("onClose"), fn("onError"), fn("onBytes")])))
            .toEqual(["onBytes", "onError", "onClose"]);
    });

    it("keeps other remote functions after the known ones, in source order", () => {
        expect(names(getTcpConnectionHandlers([fn("zeta"), fn("onClose"), fn("alpha"), fn("onBytes")])))
            .toEqual(["onBytes", "onClose", "zeta", "alpha"]);
    });

    it("leaves out functions that are not remote", () => {
        expect(names(getTcpConnectionHandlers([fn("helper", "DEFAULT"), fn("onBytes"), fn("init", "INIT")])))
            .toEqual(["onBytes"]);
    });

    it("returns nothing for a missing class model", () => {
        expect(getTcpConnectionHandlers(undefined)).toEqual([]);
    });

    it("describes every handler it ranks", () => {
        for (const description of Object.values(TCP_HANDLER_DESCRIPTIONS)) {
            expect(description.trim()).not.toBe("");
        }
    });
});
