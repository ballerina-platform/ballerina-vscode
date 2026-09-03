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

import React from "react";

import { Imports, InputType, isDropDownType, isTemplateType, NodeKind, NodeProperties, RecordTypeField, SubPanel, SubPanelView } from "@wso2/ballerina-core";

import { FormField } from "../Form/types";
import { MultiSelectEditor } from "./MultiSelectEditor";
import { TextEditor } from "./TextEditor";
import { TypeEditor } from "./TypeEditor";
import { ContextAwareExpressionEditor, DataMapperJoinClauseRhsEditor } from "./ExpressionEditor";
import { ParamManagerEditor } from "../ParamManager/ParamManager";
import { DropdownEditor } from "./DropdownEditor";
import { FileSelect } from "./FileSelect";
import { ProjectFileSelect } from "./ProjectFileSelect";
import { CheckBoxEditor } from "./CheckBoxEditor";
import { ChoiceForm } from "./ChoiceForm";

import { FormMapEditor } from "./FormMapEditor";
import { TextAreaEditor } from "./TextAreaEditor";
import { DropdownChoiceForm } from "./DropdownChoiceForm";
import { IdentifierEditor } from "./IdentifierEditor";
import { ReadonlyField } from "./ReadonlyField";
import { ContextAwareRawExpressionEditor } from "./RawExpressionEditor";
import { IdentifierField } from "./IdentifierField";
import { PathEditor } from "./PathEditor";
import { HeaderSetEditor } from "./HeaderSetEditor";
import { CompletionItem } from "@wso2/ui-toolkit";
import { CustomDropdownEditor } from "./CustomDropdownEditor";
import { SliderEditor } from "./SliderEditor";
import { CheckBoxConditionalEditor } from "./CheckBoxConditionalEditor";
import { ActionTypeEditor } from "./ActionTypeEditor";
import { AutoCompleteEditor } from "./AutoCompleteEditor";
import { FormArrayEditorWrapper } from "./FormArrayEditorWrapper";
import { FormMapEditorWrapper } from "./FormMapEditorNewWrapper";
import { InputMode } from "./MultiModeExpressionEditor/ChipExpressionEditor/types";
import { ArgManagerEditor } from "../ParamManager/ArgManager";
import { DependentTypeEditor } from "./DependentTypeEditor";
import { FieldFactory } from "./FieldFactory";
import { GroupSectionEditor } from "./GroupSectionEditor";
import { ConnectionEditor } from "./ConnectionEditor/ConnectionEditor";

export interface FormFieldEditorProps {
    field: FormField;
    fieldInputType: InputType;
    selectedNode?: NodeKind;
    openRecordEditor?: (open: boolean, newType?: string | NodeProperties) => void;
    openSubPanel?: (subPanel: SubPanel) => void;
    subPanelView?: SubPanelView;
    handleOnFieldFocus?: (key: string) => void;
    onBlur?: () => void | Promise<void>;
    autoFocus?: boolean;
    handleOnTypeChange?: () => void;
    recordTypeFields?: RecordTypeField[];
    onIdentifierEditingStateChange?: (isEditing: boolean) => void;
    setSubComponentEnabled?: (isAdding: boolean) => void;
    handleNewTypeSelected?: (type: string | CompletionItem) => void;
    scopeFieldAddon?: React.ReactNode;
    isContextTypeEditorSupported?: boolean;
    openFormTypeEditor?: (open: boolean, newType?: string) => void;
    updateImports?: (key: string, imports: Imports) => void;
}

export const EditorFactory = (props: FormFieldEditorProps) => {
    const {
        field,
        fieldInputType,
        selectedNode,
        openRecordEditor,
        openSubPanel,
        subPanelView,
        handleOnFieldFocus,
        onBlur,
        autoFocus,
        handleOnTypeChange,
        recordTypeFields,
        onIdentifierEditingStateChange,
        setSubComponentEnabled,
        handleNewTypeSelected,
        isContextTypeEditorSupported,
        openFormTypeEditor,
        updateImports,
    } = props;

    const showWithExpressionEditor = (
        fieldInputType.fieldType === "EXPRESSION" ||
        fieldInputType.fieldType === "LV_EXPRESSION" ||
        fieldInputType.fieldType === "ACTION_OR_EXPRESSION" ||
        fieldInputType.fieldType === "ACTION_EXPRESSION" ||
        fieldInputType.fieldType === "TEXT" ||
        fieldInputType.fieldType === "EXPRESSION_SET" ||
        fieldInputType.fieldType === "TEXT_SET" ||
        (fieldInputType.fieldType === "SINGLE_SELECT" && isDropDownType(fieldInputType)) ||
        fieldInputType.fieldType === "RECORD_MAP_EXPRESSION" ||
        fieldInputType.fieldType === "SQL_QUERY" ||
        fieldInputType.fieldType === "NUMBER" ||
        fieldInputType.fieldType === "PROMPT" ||
        (fieldInputType.fieldType === "FLAG" && field.types?.length > 1) ||
        fieldInputType.fieldType === "CLAUSE_EXPRESSION"
    )

    if (!field.enabled || field.hidden) {
        return <></>;
    } else if (fieldInputType.fieldType === "GROUP_SECTION") {
        return <GroupSectionEditor {...props} />;
    } else if (fieldInputType.fieldType === "RECORD_FIELD_SELECTOR" && field.codedata?.kind === "PARAM_FOR_TYPE_INFER") {
        return <DependentTypeEditor field={field} />;
    } else if (fieldInputType.fieldType === "SLIDER") {
        return <SliderEditor field={field} />;
    } else if (fieldInputType.fieldType === "MULTIPLE_SELECT") {
        return <MultiSelectEditor field={field} label={"Attach Another"} openSubPanel={openSubPanel} />;
    } else if (fieldInputType.fieldType === "HEADER_SET") {
        return <HeaderSetEditor field={field} />;
    } else if (fieldInputType.fieldType === "CHOICE") {
        return <ChoiceForm field={field} recordTypeFields={recordTypeFields} />;
    } else if (fieldInputType.fieldType === "DROPDOWN_CHOICE") {
        return <DropdownChoiceForm field={field} />;
    } else if (fieldInputType.fieldType === "TEXTAREA" || fieldInputType.fieldType === "STRING" || fieldInputType.fieldType === "DOC_TEXT") {
        return <TextAreaEditor field={field} inputMode={InputMode.SIMPLE_TEXT} />;
    } else if (fieldInputType.fieldType === "FLAG" && !showWithExpressionEditor) {
        return <CheckBoxEditor field={field} />;
    } else if (fieldInputType.fieldType === "EXPRESSION" && field.key === "resourcePath") {
        // HACK: this should fixed with the LS API. this is used to avoid the expression editor for resource path field.
        return <TextEditor field={field} handleOnFieldFocus={handleOnFieldFocus} />;
    } else if (fieldInputType.fieldType?.toUpperCase() === "ENUM") {
        // Enum is a dropdown field
        return <DropdownEditor field={field} openSubPanel={openSubPanel} />;
    } else if (fieldInputType.fieldType?.toUpperCase() === "AUTOCOMPLETE") {
        return <AutoCompleteEditor field={field} openSubPanel={openSubPanel} />;
    } else if (fieldInputType.fieldType === "CUSTOM_DROPDOWN") {
        return <CustomDropdownEditor field={field} openSubPanel={openSubPanel} />;
    } else if (fieldInputType.fieldType === "PROJECT_FILE_SELECT" && field.editable) {
        return <ProjectFileSelect field={field} />;
    } else if (fieldInputType.fieldType === "FILE_SELECT" && field.editable) {
        return <FileSelect field={field} />;
    } else if (fieldInputType.fieldType === "SINGLE_SELECT" && !showWithExpressionEditor && field.editable && field.dynamicFormFields) {
        return <DropdownChoiceForm field={field} />;
    } else if (fieldInputType.fieldType === "SINGLE_SELECT" && !showWithExpressionEditor && field.editable) {
        return <DropdownEditor field={field} openSubPanel={openSubPanel} />;
    } else if (!field.items && (fieldInputType.fieldType === "ACTION_TYPE") && field.editable) {
        return (
            <ActionTypeEditor
                field={field}
                openRecordEditor={openRecordEditor}
                handleOnFieldFocus={handleOnFieldFocus}
                autoFocus={autoFocus}
                handleOnTypeChange={handleOnTypeChange}
                handleNewTypeSelected={handleNewTypeSelected}
            />
        );
    } else if (fieldInputType.fieldType === "CONNECTION" && field.editable) {
        return <ConnectionEditor field={field} />;
    } else if (!field.items && fieldInputType.fieldType === "TYPE" && field.editable) {
        return (
            <TypeEditor
                field={field}
                openRecordEditor={openRecordEditor}
                openFormTypeEditor={openFormTypeEditor}
                isContextTypeEditorSupported={isContextTypeEditorSupported}
                handleOnFieldFocus={handleOnFieldFocus}
                autoFocus={autoFocus}
                onBlur={onBlur}
                handleOnTypeChange={handleOnTypeChange}
                handleNewTypeSelected={handleNewTypeSelected}

            />
        );
    } else if (!field.items && (fieldInputType.fieldType === "RAW_TEMPLATE" || fieldInputType.ballerinaType === "ai:Prompt") && field.editable) {
        return (
            <ContextAwareRawExpressionEditor
                field={field}
                fieldInputType={fieldInputType}
                openSubPanel={openSubPanel}
                subPanelView={subPanelView}
                handleOnFieldFocus={handleOnFieldFocus}
                onBlur={onBlur}
                autoFocus={autoFocus}
                recordTypeField={recordTypeFields?.find(recordField => recordField.key === field.key)}
            />
        );

    } else if (showWithExpressionEditor && field.editable) {
        // Expression field is a inline expression editor
        return (
            <ContextAwareExpressionEditor
                field={field}
                fieldInputType={fieldInputType}
                openSubPanel={openSubPanel}
                subPanelView={subPanelView}
                handleOnFieldFocus={handleOnFieldFocus}
                onBlur={onBlur}
                autoFocus={autoFocus}
                recordTypeField={recordTypeFields?.find(recordField => recordField.key === field.key)}
            />
        );
    } else if (fieldInputType.fieldType === "VIEW") {
        // Skip this property
        return <></>;
    } else if(fieldInputType.fieldType === "REPEATABLE_PROPERTY" && (selectedNode === "DATA_MAPPER_CREATION" || selectedNode === "FUNCTION_CREATION")) {
        return <ArgManagerEditor setSubComponentEnabled={setSubComponentEnabled} field={field} openRecordEditor={openRecordEditor} handleOnFieldFocus={handleOnFieldFocus} selectedNode={selectedNode} updateImports={updateImports} />;
    }else if (
        (fieldInputType.fieldType === "PARAM_MANAGER") ||
        (fieldInputType.fieldType === "REPEATABLE_PROPERTY" && isTemplateType(fieldInputType))
    ) {
        return <ParamManagerEditor setSubComponentEnabled={setSubComponentEnabled} field={field} openRecordEditor={openRecordEditor} handleOnFieldFocus={handleOnFieldFocus} selectedNode={selectedNode} />;
    } else if (fieldInputType.fieldType === "REPEATABLE_PROPERTY") {
        return <FormMapEditor field={field} label={"Add Another Key-Value Pair"} />;
    }

    else if (fieldInputType.fieldType === "REPEATABLE_LIST") {
        return <FormArrayEditorWrapper {...props} />;
    } else if (fieldInputType.fieldType === "REPEATABLE_MAP") {
        return <FormMapEditorWrapper {...props} />;
    } else if (fieldInputType.fieldType === "IDENTIFIER" && !field.editable && field?.lineRange) {
        return <IdentifierEditor
            field={field}
            handleOnFieldFocus={handleOnFieldFocus}
            autoFocus={autoFocus}
            onEditingStateChange={onIdentifierEditingStateChange}
        />;
    } else if (fieldInputType.fieldType !== "IDENTIFIER" && !field.editable) {
        return <ReadonlyField field={field} />;
    } else if (fieldInputType.fieldType === "IDENTIFIER" && field.editable) {
        return <IdentifierField field={field} handleOnFieldFocus={handleOnFieldFocus} autoFocus={autoFocus} onBlur={onBlur} />;
    } else if (fieldInputType.fieldType === "SERVICE_PATH" || fieldInputType.fieldType === "ACTION_PATH") {
        return <PathEditor field={field} handleOnFieldFocus={handleOnFieldFocus} autoFocus={autoFocus} />;
    } else if (fieldInputType.fieldType === "CONDITIONAL_FIELDS" && field.editable) {
        // Conditional fields is a group of fields which are conditionally shown based on a checkbox field
        return (
            <CheckBoxConditionalEditor
                field={field}
            />
        );
    } else if (fieldInputType.fieldType === "DM_JOIN_CLAUSE_RHS_EXPRESSION") {
        // Expression field for Data Mapper join on condition RHS
        const clauseExpressionField: FormField = {
            ...field,
            type: "CLAUSE_EXPRESSION",
            types: [{ fieldType: "CLAUSE_EXPRESSION", selected: false }]
        }; // Transforming to CLAUSE_EXPRESSION type to support diagnostics

        return (
            <DataMapperJoinClauseRhsEditor
                field={clauseExpressionField}
                fieldInputType={fieldInputType}
                openSubPanel={openSubPanel}
                subPanelView={subPanelView}
                handleOnFieldFocus={handleOnFieldFocus}
                onBlur={onBlur}
                autoFocus={autoFocus}
                recordTypeField={recordTypeFields?.find(recordField => recordField.key === field.key)}
            />
        );
    } else {
        // Default to text editor
        // Readonly fields are also treated as text editor
        return <TextEditor field={field} handleOnFieldFocus={handleOnFieldFocus} autoFocus={autoFocus} />;
    }
};
