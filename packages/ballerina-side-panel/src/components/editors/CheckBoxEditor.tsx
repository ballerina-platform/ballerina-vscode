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

import React, { useEffect } from "react";
import { FormField } from "../Form/types";
import { CheckBoxGroup, FormCheckBox } from "@wso2/ui-toolkit";
import { useFormContext } from "../../context";
import styled from "@emotion/styled";
import { FieldFactory } from "./FieldFactory";
import { withHeldValue } from "./utils";

const Container = styled.div`
    display: grid;
    gap: 20px;
    width: 100%;
`;

const Label = styled.div`
    font-family: var(--font-family);
    color: var(--vscode-editor-foreground);
    text-align: left;
    text-transform: capitalize;
`;
const Description = styled.div`
    font-family: var(--font-family);
    color: var(--vscode-list-deemphasizedForeground);
    text-align: left;
`;
const LabelGroup = styled.div`
    display: flex;
    flex-direction: column;
    gap: 2px;
`;
const BoxGroup = styled.div`
    display: flex;
    flex-direction: row;
    width: 100%;
    align-items: flex-start;
`;

interface TextEditorProps {
    field: FormField;
    handleOnFieldFocus?: (key: string) => void;
}

export function CheckBoxEditor(props: TextEditorProps) {
    const { field } = props;
    const { form } = useFormContext();
    const { register, control, setValue, watch } = form;

    useEffect(() => {
        if (getBooleanValue(field.value)) {
            setValue(field.key, true);
        } else {
            setValue(field.key, false);
        }
    }, [field.value]);

    const getBooleanValue = (value: any) => {
        if (field.type === "FLAG") {
            return value === "true" || value === true;
        }
        return value;
    };

    const handleChange = (e: any) => {
        const checked = e.target.value;
        setValue(field.key, checked);
        field.onValueChange?.(checked);
    };

    // Fields that belong to one state of the box (`dynamicFormFields.true` / `.false`) render under it
    // while that state holds — the same per-branch model the dropdown choice uses, for a flag whose
    // states ask for different input.
    const checked = watch(field.key, getBooleanValue(field.value));
    // Watch the branch fields by name rather than the whole form, so a keystroke in an unrelated field
    // does not re-render this editor and hand its children a fresh field object.
    const branchFieldKeys = React.useMemo(
        () => Object.values(field.dynamicFormFields ?? {}).flatMap((fields) => fields.map((f) => f.key)),
        [field.dynamicFormFields]
    );
    const watchedBranchValues = watch(branchFieldKeys);
    const heldValues: Record<string, any> = {};
    branchFieldKeys.forEach((key, index) => {
        heldValues[key] = watchedBranchValues?.[index];
    });
    const stateFields = (field.dynamicFormFields?.[String(Boolean(checked))] ?? []).map((stateField) =>
        withHeldValue(stateField, heldValues)
    );

    return (
        <Container>
            <CheckBoxGroup containerSx={{ width: "100%" }}>
                <BoxGroup>
                    <FormCheckBox
                        name={field.key}
                        {...register(field.key, {
                            value: getBooleanValue(field.value),
                            onChange: handleChange
                        })}
                        control={control as any}
                    />
                    <LabelGroup>
                        <Label>{field.label}</Label>
                        <Description>{field.documentation}</Description>
                    </LabelGroup>
                </BoxGroup>
            </CheckBoxGroup>
            {stateFields.map((stateField) => (
                <FieldFactory key={stateField.key} field={stateField} />
            ))}
        </Container>
    );
}
