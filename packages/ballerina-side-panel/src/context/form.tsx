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

import { AvailableNode, CodeData, LineRange, NodeKind } from '@wso2/ballerina-core';
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
    UseFormGetValues
} from 'react-hook-form';
import { FormExpressionEditorProps } from '../components/Form/types';

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
        formState: { isValidating: boolean; errors: FieldErrors<FieldValues> };
    };
    expressionEditor?: FormExpressionEditorProps;
    targetLineRange: LineRange;
    fileName: string;
    popupManager: {
        addPopup: (modal: React.ReactNode, id: string, title: string, height?: number, width?: number, onClose?: () => void) => void;
        removeLastPopup: () => void;
        closePopup: (id: string) => void;

    },
    nodeInfo: {
        kind: NodeKind
    },
    onRequestCreateConnection?: (params: {
        selectedConnector: AvailableNode;
        onSaved: (variableName: string) => void;
    }) => void;
    onCreateConnection?: (
        kind: string,
        onCreated: (variableName: string) => void,
        connectorCodeData?: CodeData
    ) => void;
}

const defaultState: any = {};
export const Context = createContext<FormContext>(defaultState);

export const Provider: FC<React.PropsWithChildren<FormContext>> = (props) => {
    const { children, ...restProps } = props;

    return <Context.Provider value={restProps}>{children}</Context.Provider>;
};

export const useFormContext = () => useContext(Context);
