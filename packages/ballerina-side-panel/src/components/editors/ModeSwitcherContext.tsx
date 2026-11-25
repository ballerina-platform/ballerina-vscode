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

import React, { createContext, useContext, ReactNode } from "react";
import { InputType } from "@wso2/ballerina-core";
import { InputMode } from "./MultiModeExpressionEditor/ChipExpressionEditor/types";

export type ModeSwitcherContextType = {
    inputMode: InputMode;
    onModeChange: (mode: InputMode) => void;
    types: InputType[];
    isRecordTypeField: boolean;
    isModeSwitcherEnabled: boolean;
    // The editor in view replaced another one, so it should load in place rather than as a fresh form.
    hasSwitchedMode?: boolean;
};

const ModeSwitcherContext = createContext<ModeSwitcherContextType | undefined>(undefined);

export const useModeSwitcherContext = () => {
    const context = useContext(ModeSwitcherContext);
    return context;
};

type ModeSwitcherProviderProps = {
    children: ReactNode;
    inputMode: InputMode;
    onModeChange: (mode: InputMode) => void;
    types: InputType[];
    isRecordTypeField: boolean;
    isModeSwitcherEnabled: boolean;
    hasSwitchedMode?: boolean;
};

export const ModeSwitcherProvider = ({
    children,
    inputMode,
    onModeChange,
    types,
    isRecordTypeField,
    isModeSwitcherEnabled,
    hasSwitchedMode
}: ModeSwitcherProviderProps) => {
    return (
        <ModeSwitcherContext.Provider
            value={{
                inputMode,
                onModeChange,
                types,
                isRecordTypeField,
                isModeSwitcherEnabled,
                hasSwitchedMode
            }}
        >
            {children}
        </ModeSwitcherContext.Provider>
    );
};
