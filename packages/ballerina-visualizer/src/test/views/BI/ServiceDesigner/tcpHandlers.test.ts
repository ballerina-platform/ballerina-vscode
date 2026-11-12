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
    getMissingTcpConnectionHandlers,
    getTcpConnectionHandlers,
    TCP_HANDLER_DESCRIPTIONS,
} from "../../../../views/BI/ServiceDesigner/tcpHandlers";

jest.mock("@wso2/ballerina-core", () => ({}));

const fn = (name: string, kind = "REMOTE", enabled = true) =>
    ({ name: { value: name }, kind, enabled } as unknown as FunctionModel);
// A handler the class does not declare yet, as the language server sends it.
const template = (name: string) => fn(name, "REMOTE", false);
const names = (handlers: FunctionModel[]) => handlers.map((handler) => handler.name.value);

// L1: the TCP service designer leads with the handlers a user implements, onBytes first, whatever order the class
// declares them in. Anything it does not know keeps its source order after them, and non-remote methods are not
// connection handlers at all. The handlers the class lacks arrive as disabled templates and are offered to add.
describe("TCP connection handlers", () => {
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
        expect(getMissingTcpConnectionHandlers(undefined)).toEqual([]);
    });

    it("splits declared handlers from the templates of the missing ones, both in handler order", () => {
        const functions = [template("onClose"), fn("onError"), template("onBytes")];

        expect(names(getTcpConnectionHandlers(functions))).toEqual(["onError"]);
        expect(names(getMissingTcpConnectionHandlers(functions))).toEqual(["onBytes", "onClose"]);
    });

    it.each([
        ["an older language server", false],
        ["the language server", true],
    ])("marks every declared handler removable, whatever %s says", (_source, optional) => {
        const functions = ["onBytes", "onError", "onClose", "custom"].map((name) => ({ ...fn(name), optional }));

        expect(getTcpConnectionHandlers(functions).every((handler) => handler.optional)).toBe(true);
    });

    it("leaves the class's own models untouched", () => {
        const onBytes = { ...fn("onBytes"), optional: false } as FunctionModel;

        getTcpConnectionHandlers([onBytes]);

        expect(onBytes.optional).toBe(false);
    });

    it("describes every handler it ranks", () => {
        for (const description of Object.values(TCP_HANDLER_DESCRIPTIONS)) {
            expect(description.trim()).not.toBe("");
        }
    });
});
