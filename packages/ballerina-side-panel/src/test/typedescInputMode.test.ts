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

import { InputType } from "@wso2/ballerina-core";
import { InputMode } from "../components/editors/MultiModeExpressionEditor/ChipExpressionEditor/types";
import {
    getDefaultExpressionMode,
    getInputModeFromTypes,
    getSecondaryMode,
} from "../components/editors/MultiModeExpressionEditor/ChipExpressionEditor/utils";

// The input types the language server gives a typedesc parameter: the type editor, then the expression mode.
const typedescTypes = (constraint?: string): InputType[] => [
    { fieldType: "TYPE", ...(constraint && { ballerinaType: constraint }), selected: true },
    { fieldType: "EXPRESSION", ballerinaType: constraint ? `typedesc<${constraint}>` : "typedesc<any|error>", selected: false },
];

describe("typedesc input modes", () => {
    // A TYPE input type needs a mode of its own, whatever type it states: without one the switcher has nothing to
    // switch to and selecting the type editor cannot be told apart from selecting nothing.
    it.each(["record {|anydata...;|}", "string", "map<json>", undefined])(
        "gives the type editor the Type mode for a %s constraint",
        (constraint) => {
            expect(getInputModeFromTypes(typedescTypes(constraint)[0])).toBe(InputMode.TYPE);
        }
    );

    it("offers the type editor first and the expression mode second", () => {
        const types = typedescTypes("record {|anydata...;|}");
        expect(getDefaultExpressionMode(types)).toBe(InputMode.TYPE);
        expect(getSecondaryMode(types)).toBe(InputMode.EXP);
    });
});
