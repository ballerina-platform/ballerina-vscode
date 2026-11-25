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

import { AvailableNode, CodeData, Imports, LineRange, NodeKind } from '@wso2/ballerina-core';
import React, { createContext, FC, useContext } from 'react';
import {
    Control,
    FieldValues,
    UseFormWatch,
    UseFormRegister,
    UseFormSetValue,
    UseFormUnregister,
    UseFormSetError,
    UseFormClearErrors,
    FieldErrors,
    UseFormGetValues,
    UseFormTrigger,
    UseFormGetFieldState
} from 'react-hook-form';
import { FormExpressionEditorProps, FormField } from '../components/Form/types';
import type { IdentifierRenameLog } from '../components/editors/identifierRenames';
import type { AssistHostValue } from '../components/editors/FieldAssist/AssistHost';

export interface FormContext {
    form: {
        control: Control<FieldValues, any>;
        getValues: UseFormGetValues<FieldValues>;
        setValue: UseFormSetValue<FieldValues>;
        watch: UseFormWatch<any>;
        register: UseFormRegister<FieldValues>;
        unregister: UseFormUnregister<FieldValues>;
        setError: UseFormSetError<FieldValues>;
        clearErrors: UseFormClearErrors<FieldValues>;
        trigger?: UseFormTrigger<FieldValues>;
        // Whether the user or Copilot changed a value, so a default never overwrites it.
        getFieldState?: UseFormGetFieldState<FieldValues>;
        formState: { isValidating: boolean; errors: FieldErrors<FieldValues> };
    };
    expressionEditor?: FormExpressionEditorProps;
    // Records the imports a value inserted into a field needs, so saving the node adds them.
    updateImports?: (key: string, imports: Imports) => void;
    /**
     * Drops the diagnostics stored for one field, at once. Unlike a `showDiagnostics=false` call to
     * the host's diagnostics handler, it does not go through that handler's form-wide debounce, so
     * it cannot cancel a fetch pending for another field. `arrivedWith` is the field's own
     * `diagnostics`, which are dropped too.
     */
    clearFieldDiagnostics?: (key: string, arrivedWith?: FormField["diagnostics"]) => void;
    /** Per field, the arrived-with `diagnostics` array dropped by `clearFieldDiagnostics`. */
    droppedFieldDiagnostics?: Record<string, FormField["diagnostics"]>;
    targetLineRange: LineRange;
    fileName: string;
    popupManager: {
        addPopup: (modal: React.ReactNode, id: string, title: string, height?: number, width?: number, onClose?: () => void) => void;
        removeLastPopup: () => void;
        closePopup: (id: string) => void;

    },
    nodeInfo: {
        kind: NodeKind;
        // The node's Ballerina module, e.g. `ai.anthropic` for an Anthropic model provider.
        module?: string;
    },
    fields?: FormField[];
    onRequestCreateConnection?: (params: {
        selectedConnector: AvailableNode;
        onSaved: (variableName: string) => void;
    }) => void;
    onCreateNode?: (
        kind: string,
        onCreated: (variableName: string) => void,
        nodeCodeData?: CodeData
    ) => void;
    /** The form's in-place rename log (see IdentifierRenameLog). A nested form shares its parent's. */
    renameLog?: IdentifierRenameLog;
    /** The Copilot host the form's fields describe themselves to. */
    assistHost?: AssistHostValue;
    /** A form inside another form's field under the same host, e.g. one row of a list; that field is the Copilot's part. */
    partOfParentForm?: boolean;
}

const defaultState: any = {};
export const Context = createContext<FormContext>(defaultState);

export const Provider: FC<React.PropsWithChildren<FormContext>> = (props) => {
    const { children, ...restProps } = props;

    return <Context.Provider value={restProps}>{children}</Context.Provider>;
};

export const useFormContext = () => useContext(Context);
