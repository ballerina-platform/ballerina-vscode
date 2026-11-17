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

// L1: a field's expression mode is the one its diagnostics, mode switcher and data-mapper entry all
// key off. The language server types some expressions ACTION_OR_EXPRESSION (a variable's
// initializer, a return value) so that an action parses; that type must still read as the
// expression mode, or a switcher pairing it with another mode can never select it.

import type { InputType } from "@wso2/ballerina-core";
import { InputMode } from "../components/editors/MultiModeExpressionEditor/ChipExpressionEditor/types";
import { getInputModeFromTypes } from "../components/editors/MultiModeExpressionEditor/ChipExpressionEditor/utils";

const EXPRESSION_FIELD_TYPES: InputType["fieldType"][] = ["EXPRESSION", "ACTION_OR_EXPRESSION"];

describe("getInputModeFromTypes", () => {
    it.each(EXPRESSION_FIELD_TYPES)("reads %s as the expression mode", (fieldType) => {
        expect(getInputModeFromTypes({ fieldType, selected: false })).toBe(InputMode.EXP);
    });
});
