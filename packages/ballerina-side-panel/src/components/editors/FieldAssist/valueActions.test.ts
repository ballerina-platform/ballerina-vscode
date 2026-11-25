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

import { CreateConfigurableAction, FormAssistSlot } from "@wso2/ballerina-core";
import { prepareValues } from "./FormAssist";

const action: CreateConfigurableAction = { kind: "createConfigurable", name: "botToken", type: "string", documentation: "The bot's token.", useFieldValue: true };
const before = { slots: [{ path: "token", label: "Token", value: "\"abc\"", property: { types: [] } } as unknown as FormAssistSlot], groups: [] };
const response = { values: { token: "botToken" }, valueActions: { token: [action] } };

describe("form Copilot value actions", () => {
    it("declares what a value names, with the value it replaces, before the values land", async () => {
        const run = jest.fn().mockResolvedValue(undefined);
        await expect(prepareValues(response, before, run)).resolves.toBe(response);
        expect(run).toHaveBeenCalledWith([action], "\"abc\"");
    });

    it("fails a change that needs a configurable when the form can't declare one", async () => {
        await expect(prepareValues(response, before)).rejects.toThrow("can't create configurables");
        await expect(prepareValues({ values: { token: "\"x\"" } }, before)).resolves.toEqual({ values: { token: "\"x\"" } });
    });
});
