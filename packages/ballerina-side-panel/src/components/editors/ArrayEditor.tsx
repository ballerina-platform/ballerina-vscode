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

import React, { useEffect, useRef, useState } from "react";

import { Button, Codicon, ThemeColors } from "@wso2/ui-toolkit";
import styled from "@emotion/styled";

import { FormField } from "../Form/types";
import { useFormContext } from "../../context";
import { SubPanelView } from "@wso2/ballerina-core";
import { SubPanel } from "@wso2/ballerina-core";
import { RecordTypeField } from "@wso2/ballerina-core";
import { ContextAwareExpressionEditor } from "./ExpressionEditor";
import { FieldTypeChip } from "./FieldTypeChip";

namespace S {
    export const Container = styled.div({
        width: "100%",
        display: "flex",
        flexDirection: "column",
        gap: "4px",
    });

    export const LabelContainer = styled.div({
        display: "flex",
        alignItems: "center",
    });

    export const Label = styled.label({
        color: "var(--vscode-editor-foreground)",
        textTransform: "capitalize",
    });

    export const Description = styled.div({
        color: "var(--vscode-list-deemphasizedForeground)",
    });

    export const EditorContainer = styled.div({
        display: "flex",
        gap: "8px",
        alignItems: "center",
        width: "100%",
    });

    export const AddNewButton = styled(Button)`
        & > vscode-button {
            color: var(--vscode-textLink-activeForeground);
            border-radius: 0px;
            padding: 3px 5px;
            margin-top: 4px;
        }
        & > vscode-button > * {
            margin-right: 6px;
        }
    `;

    export const DeleteButton = styled(Button)`
        & > vscode-button {
            color: ${ThemeColors.ERROR};
        }
    `;
}

interface ArrayEditorProps {
    field: FormField;
    label: string;
    openSubPanel?: (subPanel: SubPanel) => void;
    subPanelView?: SubPanelView;
    handleOnFieldFocus?: (key: string) => void;
    autoFocus?: boolean;
    visualizable?: boolean;
    recordTypeField?: RecordTypeField;
}

function ArrayEditor(props: ArrayEditorProps) {
    const { field, label, ...rest } = props;
    const { form } = useFormContext();
    const { unregister, setValue, watch } = form;

    // Initialize with array values or empty array
    const initialValues = Array.isArray(field.value) ? field.value : [];
    const [editorCount, setEditorCount] = useState(Math.max(initialValues.length, 0));

    // Watch all the individual text field values
    const values = [...Array(editorCount)]
        .map((_, index) => {
            const value = watch(`${field.key}-${index}`);

            let updatedValue = value;
            
            if (updatedValue === undefined) {
                // Use the initial array value if available
                updatedValue = Array.isArray(field.value) ? field.value[index] : "";
                setValue(`${field.key}-${index}`, updatedValue ?? "");
            }
            // HACK: When using expression editor and if the user deletes whole text then the value becomes
            // an empty value. 
            if (updatedValue === "") {
                setValue(`${field.key}-${index}`, " ");
            }

            return updatedValue;
        })

    // Update the main field.value array whenever individual fields change
    const previousValuesRef = useRef<string>();
    useEffect(() => {
        const serializedValues = JSON.stringify(values);
        if (previousValuesRef.current === serializedValues) {
            return;
        }

        // Prevent redundant form updates which would otherwise trigger endless rerenders.
        previousValuesRef.current = serializedValues;
        setValue(field.key, values);
    }, [values, field.key, setValue]);

    const onAddAnother = () => {
        setEditorCount((prev) => prev + 1);
    };

    const onDelete = (indexToDelete: number) => {
        // Unregister the deleted field
        unregister(`${field.key}-${indexToDelete}`);

        // Unregister and re-register fields after the deleted index to shift them up
        for (let i = indexToDelete + 1; i < editorCount; i++) {
            const value = watch(`${field.key}-${i}`);
            unregister(`${field.key}-${i}`);
            setValue(`${field.key}-${i - 1}`, value);
        }

        // Update the main field value
        const newValues = values.filter((_, i) => i !== indexToDelete);
        setValue(field.key, newValues);
        setEditorCount((prev) => prev - 1);
    };

    return (
        <S.Container>
            <S.LabelContainer>
                <S.Label>{field.label}</S.Label>
                <FieldTypeChip types={field.types} />
            </S.LabelContainer>
            <S.Description>{field.documentation}</S.Description>
            {[...Array(editorCount)].map((_, index) => (
                <S.EditorContainer key={`${field.key}-${index}`}>
                    {/* <ContextAwareExpressionEditor
                        {...rest}
                        field={field}
                        id={`${field.key}-${index}`}
                        fieldKey={`${field.key}-${index}`}
                        required={!field.optional && index === 0}
                        showHeader={false}
                    /> */}
                    <S.DeleteButton
                        appearance="icon"
                        onClick={() => onDelete(index)}
                        disabled={!field.editable}
                        tooltip="Delete"
                    >
                        <Codicon name="trash" />
                    </S.DeleteButton>
                </S.EditorContainer>
            ))}
            <S.AddNewButton appearance="icon" aria-label="add" onClick={onAddAnother}>
                <Codicon name="add" />
                {label}
            </S.AddNewButton>
        </S.Container>
    );
};
