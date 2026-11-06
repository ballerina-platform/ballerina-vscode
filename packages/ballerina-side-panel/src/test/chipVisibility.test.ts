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

// L1: Expression mode shows plain Ballerina source; every other mode keeps chips.

import { InputMode } from "../components/editors/MultiModeExpressionEditor/ChipExpressionEditor/types";
import { getEditorConfiguration } from "../components/editors/ExpressionField";
import { ExpressionModeEditorConfig } from "../components/editors/MultiModeExpressionEditor/Configurations";

const ALL_MODES = Object.values(InputMode) as InputMode[];

describe("chip rendering per input mode", () => {
    it("only Expression mode turns chips off", () => {
        for (const mode of ALL_MODES) {
            expect(getEditorConfiguration(mode).showChips()).toBe(mode !== InputMode.EXP);
        }
    });

    it("the expanded Expression mode config turns chips off", () => {
        expect(new ExpressionModeEditorConfig().showChips()).toBe(false);
    });
});
