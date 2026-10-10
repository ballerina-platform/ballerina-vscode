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

import React, { createContext, useContext, useState, ReactNode } from "react";
import { FormField } from "../Form/types";

type FieldContextType = {
    field: FormField | null;
    setField: (field: FormField) => void;
    triggerCharacters: readonly string[];
};

const FieldContext = createContext<FieldContextType | undefined>(undefined);

export const useFieldContext = () => {
    const context = useContext(FieldContext);
    if (!context) {
        throw new Error("useFieldContext must be used within a FieldProvider");
    }
    return context;
};

export const useOptionalFieldContext = () => useContext(FieldContext);

export const FieldProvider = ({ children, initialField, triggerCharacters }: { children: ReactNode; initialField?: FormField, triggerCharacters: readonly string[] }) => {
    const [field, setField] = useState<FormField | null>(initialField ?? null);

    return (
        <FieldContext.Provider value={{ field, setField, triggerCharacters }}>
            {children}
        </FieldContext.Provider>
    );
};
