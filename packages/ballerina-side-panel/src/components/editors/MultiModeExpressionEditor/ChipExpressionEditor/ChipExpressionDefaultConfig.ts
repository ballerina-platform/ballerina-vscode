/**
 * Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
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

import FXButton from "./components/FxButton";
import { ParsedToken } from "./utils";

export enum HelperPaneMenuItem {
    VARIABLES = "VARIABLES",
    INPUTS = "INPUTS",
    CONFIGURABLES = "CONFIGURABLES",
    FUNCTIONS = "FUNCTIONS",
    DOCUMENTS = "DOCUMENTS",
}

export class ChipExpressionEditorDefaultConfiguration {
    getHelperValue(value: string, token?: ParsedToken) {
        return value;
    }
    getSerializationPrefix() {
        return "";
    }
    getSerializationSuffix() {
        return "";
    }
    serializeValue(value: string) {
        return value
    }
    deserializeValue(value: string) {
        return value;
    }
    showHelperPane() {
        return true;
    }
    getPlugins() {
        return [];
    }
    getAdornment() {
        return (FXButton)
    }
    getIsValueCompatible(value: string): boolean {
        return true;
    }

    getIsToggleHelperAvailable(): boolean {
        return true;
    }

    getHelperPaneHiddenItems(): HelperPaneMenuItem[] {
        return [];
    }

    // Whether tokens render as chips. When false the editor shows the raw source and never
    // fetches the token stream, so every chip behaviour (click-to-edit, guards) stays inert.
    showChips(): boolean {
        return true;
    }
}
