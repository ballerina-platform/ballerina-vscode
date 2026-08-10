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

import { RefObject } from "react";
import { DiagnosticMessage, FormDiagnostics, TextEdit, PropertyModel, LinePosition, LineRange, ExpressionProperty, Metadata, RecordTypeField, Imports, ConfigProperties } from "@wso2/ballerina-core";
import { ParamConfig } from "../ParamManager/ParamManager";
import { CompletionItem, FormExpressionEditorRef, HelperPaneHeight, HelperPaneOrigin, OptionProps } from "@wso2/ui-toolkit";
import { InputMode } from "../editors/MultiModeExpressionEditor/ChipExpressionEditor/types";
import { InputType } from "@wso2/ballerina-core/lib/interfaces/bi";


export type FormValues = {
    [key: string]: any;
};

export type FieldDerivation = {
    sourceField: string;
    targetField: string;
    deriveFn: (sourceValue: any) => any;
    breakOnManualEdit?: boolean;
};

export type FormField = {
    key: string;
    label: string;
    type: null | string;
    optional: boolean;
    advanced?: boolean;
    editable: boolean;
    hidden?: boolean;
    /** Render this field indented under the preceding field, to show it belongs to it (e.g. a
     * fixed-value input that belongs to the checkbox above it). */
    indent?: boolean;
    placeholder?: string;
    defaultValue?: string;
    documentation: string;
    value: string | any;
    advanceProps?: FormField[];
    diagnostics?: DiagnosticMessage[];
    items?: string[];
    itemOptions?: OptionProps[]
    choices?: PropertyModel[];
    dynamicFormFields?: { [key: string]: FormField[] }
    paramManagerProps?: ParamConfig;
    types: InputType[];
    groupNo?: number;
    groupName?: string;
    addNewButton?: boolean;
    addNewButtonLabel?: string;
    enabled: boolean;
    lineRange?: LineRange;
    metadata?: Metadata;
    isContextTypeSupported?: boolean;
    codedata?: { [key: string]: any };
    imports?: { [key: string]: string };
    actionLabel?: string | JSX.Element;
    properties?: ConfigProperties;
    actionCallback?: () => void;
    onValueChange?: (value: string | boolean) => void;
    isGraphqlId?: boolean;
    sliderProps?: {
        min?: number;
        max?: number;
        step?: number;
        showValue?: boolean;
        showMarkers?: boolean;
        valueFormatter?: (value: number) => string;
    };
};

export type ParameterValue = {
    value: {
        variable: { value: string };
        type: { value: string };
        parameterDescription: { value: string };
    };
};

export type ExpressionFormField = {
    key: string;
    value: string;
    cursorPosition: LinePosition;
    isConfigured?: boolean
};

export type HelperPaneCompletionItem = {
    label: string;
    type?: string;
    insertText: string;
    kind?: string;
    codedata?: any;
}

export type HelperPaneCompletionCategory = {
    label: string;
    items: HelperPaneCompletionItem[];
}


export type HelperpaneOnChangeOptions = {
    closeHelperPane?: boolean;
    replaceFullText?: boolean;
}

export type HelperPaneVariableInfo = {
    category: HelperPaneCompletionCategory[];
}

export type HelperPaneFunctionCategory = {
    label: string;
    items?: HelperPaneCompletionItem[];
    subCategory?: HelperPaneFunctionCategory[];
}

export type HelperPaneFunctionInfo = {
    category: HelperPaneFunctionCategory[];
}

export type HelperPaneData = HelperPaneVariableInfo | HelperPaneFunctionInfo;

type FormCompletionConditionalProps = {
    completions: CompletionItem[];
    triggerCharacters: readonly string[];
    retrieveCompletions: (
        value: string,
        property: ExpressionProperty,
        offset: number,
        triggerCharacter?: string
    ) => Promise<void>;
    extractArgsFromFunction?: (
        value: string,
        property: ExpressionProperty,
        cursorPosition: number
    ) => Promise<{
        label: string;
        args: string[];
        currentArgIndex: number;
    }>;
} | {
    completions?: never;
    triggerCharacters?: never;
    retrieveCompletions?: never;
    extractArgsFromFunction?: never;
}

type FormTypeConditionalProps = {
    types: CompletionItem[];
    referenceTypes: CompletionItem[];
    retrieveVisibleTypes: (
        value: string,
        cursorPosition: number,
        fetchReferenceTypes: boolean,
        types: InputType[],
        fieldKey?: string
    ) => Promise<void>;
    getTypeHelper: (
        fieldKey: string,
        types: InputType[],
        typeBrowserRef: RefObject<HTMLDivElement>,
        currentType: string,
        currentCursorPosition: number,
        typeHelperState: boolean,
        onChange: (newType: string, newCursorPosition: number) => void,
        changeTypeHelperState: (isOpen: boolean) => void,
        helperPaneHeight: HelperPaneHeight,
        onTypeCreate: () => void,
        exprRef?: RefObject<FormExpressionEditorRef>,
    ) => JSX.Element;
    helperPaneOrigin?: HelperPaneOrigin;
    helperPaneHeight: HelperPaneHeight;
} | {
    types?: never;
    referenceTypes?: never;
    retrieveVisibleTypes?: never;
    getTypeHelper?: never;
    helperPaneOrigin?: never;
    helperPaneHeight?: never;
}

type FormHelperPaneConditionalProps = {
    getHelperPane: (
        fieldKey: string,
        exprRef: RefObject<FormExpressionEditorRef>,
        anchorRef: RefObject<HTMLDivElement>,
        defaultValue: string,
        value: string,
        onChange: (value: string, options?: HelperpaneOnChangeOptions) => void,
        changeHelperPaneState: (isOpen: boolean) => void,
        helperPaneHeight: HelperPaneHeight,
        recordTypeField?: RecordTypeField,
        isAssignIdentifier?: boolean,
        inputTypes?: InputType[],
        inputMode?: InputMode
    ) => JSX.Element;
    helperPaneOrigin?: HelperPaneOrigin;
    helperPaneHeight: HelperPaneHeight;
} | {
    getHelperPane?: never;
    helperPaneOrigin?: never;
    helperPaneHeight?: never;
}

type FormExpressionEditorBaseProps = {
    growRange?: { start: number; offset: number };
    getExpressionEditorDiagnostics?: (
        showDiagnostics: boolean,
        expression: string,
        key: string,
        property: ExpressionProperty
    ) => Promise<void>;
    getExpressionFormDiagnostics?: (
        showDiagnostics: boolean,
        expression: string,
        key: string,
        property: ExpressionProperty,
        setDiagnosticsInfo: (diagnostics: FormDiagnostics) => void,
        shouldUpdateNode?: boolean,
        variableType?: string
    ) => Promise<void>;
    onCompletionItemSelect?: (value: string, fieldKey: string, additionalTextEdits?: TextEdit[]) => Promise<void>;
    onFocus?: () => void | Promise<void>;
    onBlur?: () => void | Promise<void>;
    onCancel?: () => void;
    onSave?: (value: string) => void | Promise<void>;
    onRemove?: () => void;
    onSaveConfigurables?: (values: any) => void;
    onOpenRecordConfigPage?: (fieldKey: string, currentValue: string, recordTypeField: any, onChange: (value: string) => void) => void;
}

type ExpressionEditorRPCManager = {
    getExpressionTokens: (
        expression: string,
        filePath: string,
        position: LinePosition
    ) => Promise<number[]>;
}

type ExpressionEditorFormProps = {
    rpcManager: ExpressionEditorRPCManager;
}

type SanitizedExpressionEditorProps = {
    rawExpression?: (expression: string) => string; // original expression
    sanitizedExpression?: (expression: string) => string; // sanitized expression that will be rendered in the editor
}

export type ExpressionEditorDevantProps = {
    devantConfigs?: string[];
    onAddDevantConfig?: (name: string, value: string, isSecret: boolean) => Promise<void>;
}

export type FormExpressionEditorProps =
    FormCompletionConditionalProps &
    FormTypeConditionalProps &
    FormHelperPaneConditionalProps &
    FormExpressionEditorBaseProps &
    ExpressionEditorFormProps &
    SanitizedExpressionEditorProps &
    ExpressionEditorDevantProps;

export type FormImports = {
    [fieldKey: string]: Imports;
}
