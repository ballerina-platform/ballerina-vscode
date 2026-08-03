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

// Real-form render harness for L2 editor-behaviour tests. Unlike helpers.tsx
// (which stubs editors to test EditorFactory *selection*), this renders the REAL
// editor inside a real react-hook-form instance wired through the side-panel
// FormContext — so tests can exercise what an editor renders and how it reads/writes
// form values. Used by L2-02…06.

import React, { FC, ReactNode } from "react";
import { render } from "@testing-library/react";
import { useForm, UseFormReturn } from "react-hook-form";
import { Provider as FormProvider } from "../context/form";

const Harness: FC<{
    defaultValues?: Record<string, any>;
    children: ReactNode;
    expose?: (form: UseFormReturn<any>) => void;
}> = ({ defaultValues, children, expose }) => {
    const rhf = useForm<any>({ defaultValues, mode: "onChange" });
    expose?.(rhf);
    const form = {
        control: rhf.control,
        getValues: rhf.getValues,
        setValue: rhf.setValue,
        watch: rhf.watch,
        register: rhf.register,
        unregister: rhf.unregister,
        setError: rhf.setError,
        clearErrors: rhf.clearErrors,
        formState: { isValidating: rhf.formState.isValidating, errors: rhf.formState.errors },
    };
    const ctx: any = {
        form,
        targetLineRange: { startLine: { line: 0, offset: 0 }, endLine: { line: 0, offset: 0 } },
        fileName: "test.bal",
        popupManager: { addPopup: jest.fn(), removeLastPopup: jest.fn(), closePopup: jest.fn() },
        nodeInfo: { kind: "" as any },
    };
    return <FormProvider {...ctx}>{children}</FormProvider>;
};

/**
 * Render `ui` inside a real react-hook-form + FormContext. Returns the usual RTL
 * utils plus getForm() to inspect form state (values/errors) after interaction.
 */
export function renderWithForm(ui: ReactNode, opts: { defaultValues?: Record<string, any> } = {}) {
    let formApi: UseFormReturn<any> | undefined;
    const utils = render(
        <Harness defaultValues={opts.defaultValues} expose={(f) => { formApi = f; }}>
            {ui}
        </Harness>
    );
    return { ...utils, getForm: () => formApi! };
}
