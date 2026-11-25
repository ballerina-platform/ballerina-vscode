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

import { InputMode } from "../components/editors/MultiModeExpressionEditor/ChipExpressionEditor/types";

jest.mock(
    "../components/editors/MultiModeExpressionEditor/ChipExpressionEditor/components/ChipExpressionEditor",
    () => ({ __esModule: true, ChipExpressionEditorComponent: (): null => null })
);

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { toPromptInterpolation } = require("../components/editors/ExpressionField");

describe("toPromptInterpolation", () => {
    it("turns an expression into an interpolation in a string prompt", () => {
        expect(toPromptInterpolation(InputMode.PROMPT, "instructions", "string")).toBe("string `${instructions}`");
        expect(toPromptInterpolation(InputMode.PROMPT, 'getRole() + " helper"', "string"))
            .toBe('string `${getRole() + " helper"}`');
    });

    it("leaves an ai:Prompt expression alone, since a prompt cannot be interpolated", () => {
        expect(toPromptInterpolation(InputMode.PROMPT, "question", "ai:Prompt")).toBeUndefined();
    });

    it("leaves literals and templates to the plain conversion", () => {
        expect(toPromptInterpolation(InputMode.PROMPT, '"Tutor"', "string")).toBeUndefined();
        expect(toPromptInterpolation(InputMode.PROMPT, "string `Tutor`", "string")).toBeUndefined();
    });

    it("applies only to prompt mode", () => {
        expect(toPromptInterpolation(InputMode.TEXT, "name", "string")).toBeUndefined();
        expect(toPromptInterpolation(InputMode.EXP, "name", "string")).toBeUndefined();
    });
});
