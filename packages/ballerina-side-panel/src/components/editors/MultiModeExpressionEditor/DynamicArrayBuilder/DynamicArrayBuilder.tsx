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

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Codicon } from "@wso2/ui-toolkit";

import type { ExpressionFieldProps } from "../../ExpressionField";
import { ChipExpressionEditorComponent } from "../ChipExpressionEditor/components/ChipExpressionEditor";
import { useFormContext } from "../../../../context";
import { S } from "../styles";
import { ChipExpressionEditorDefaultConfiguration } from "../ChipExpressionEditor/ChipExpressionDefaultConfig";
import { StringTemplateEditorConfig } from "../Configurations";

interface DynamicArrayBuilderProps {
    label: string;
    value: string | any[];
    onChange?: (value: string) => void;
    expressionFieldProps: ExpressionFieldProps;
}

/**
 * DynamicArrayBuilder component for managing array inputs with validation.
 * Supports minItems and defaultItems configuration from the field's EXPRESSION_SET or TEXT_SET type.
 */
export const DynamicArrayBuilder = (props: DynamicArrayBuilderProps) => {
    const { label, value, onChange, expressionFieldProps } = props;
    const { form } = useFormContext();
    const { setValue } = form;

    // Extract configuration from EXPRESSION_SET or TEXT_SET type definition
    const expressionSetType = expressionFieldProps.field.types.find(t => t.fieldType === "EXPRESSION_SET" || t.fieldType === "TEXT_SET");
    const minItems = expressionSetType?.minItems ?? 1;
    const defaultItems = expressionSetType?.defaultItems ?? 1;
    const isTextSet = expressionSetType?.fieldType === "TEXT_SET";

    const [isInitialized, setIsInitialized] = useState(false);
    const currentValuesRef = useRef<string[]>([]);
    const paddedRef = useRef(false);

    // Helper function to update array value using form context setValue
    // Note: We don't use the onChange prop here to preserve type information (e.g., numbers stay as numbers)
    const updateArrayValue = useCallback((updatedArray: string[], options?: { shouldValidate?: boolean; shouldDirty?: boolean }) => {
        setValue(expressionFieldProps.field.key, updatedArray, options);
    }, [setValue, expressionFieldProps.field.key]);

    /**
     * Converts the incoming value to an array, using defaultItems if empty.
     */
    const getInitialValue = (): string[] => {
        // If value is already an array, use it
        if (Array.isArray(value) && value.length > 0) {
            return value;
        }

        // If value is a JSON string, parse it
        if (typeof value === 'string' && value.trim() !== '' && value !== '[]') {
            try {
                const parsed = JSON.parse(value);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    return parsed;
                }
            } catch (e) {
                // If parsing fails, treat as empty
            }
        }

        const isEmpty = !value ||
            value === '' ||
            value === '[]' ||
            (Array.isArray(value) && value.length === 0);

        return isEmpty && defaultItems > 0 ? Array(defaultItems).fill("") : [];
    };

    // Initialize the field with default items on mount
    useEffect(() => {
        const initialValue = getInitialValue();
        const shouldInitialize = initialValue.length > 0 && (
            !value ||
            value === '' ||
            value === '[]' ||
            (Array.isArray(value) && value.length === 0)
        );

        if (shouldInitialize) {
            currentValuesRef.current = initialValue;
            updateArrayValue(initialValue, { shouldValidate: false, shouldDirty: false });
        }
        setIsInitialized(true);
    }, []);

    // Update ref when value changes from parent
    useEffect(() => {
        if (isInitialized) {
            currentValuesRef.current = getInitialValue();
        }
    }, [value, isInitialized]);

    // Compute current array values
    const arrayValues = useMemo(() => {
        if (!isInitialized) {
            return currentValuesRef.current;
        }
        return getInitialValue();
    }, [value, isInitialized]);

    // Ensure minimum number of items are always visible
    useEffect(() => {
        if (!isInitialized) {
            paddedRef.current = false;
            return;
        }

        const requiredCount = Math.max(minItems, defaultItems);

        // Reset padding flag when arrayValues length falls below required count or dependencies change
        if (arrayValues.length < requiredCount) {
            paddedRef.current = false;
        }

        // Only apply padding if not already padded
        if (requiredCount > 0 && arrayValues.length < requiredCount && !paddedRef.current) {
            const paddedArray = [...arrayValues];
            while (paddedArray.length < requiredCount) {
                paddedArray.push('');
            }
            currentValuesRef.current = paddedArray;
            updateArrayValue(paddedArray, { shouldValidate: true });
            paddedRef.current = true;
        }
    }, [arrayValues, isInitialized, minItems, defaultItems, updateArrayValue]);

    // A text item is one name, so neither Enter nor normalization may put a line break into it.
    const textItem = (value: string) => isTextSet && typeof value === "string" ? value.replace(/[\r\n]+/g, "") : value;

    const handleInputChange = (index: number, newValue: string) => {
        const updatedArray = [...currentValuesRef.current];
        updatedArray[index] = textItem(newValue);
        currentValuesRef.current = updatedArray;
        updateArrayValue(updatedArray, { shouldValidate: true, shouldDirty: true });
    };

    const handleDelete = (index: number) => {
        const updatedArray = currentValuesRef.current.filter((_, i) => i !== index);
        currentValuesRef.current = updatedArray;
        updateArrayValue(updatedArray, { shouldValidate: true, shouldDirty: true });
    };

    const handleAdd = () => {
        const updatedArray = [...currentValuesRef.current, ''];
        currentValuesRef.current = updatedArray;
        updateArrayValue(updatedArray, { shouldValidate: true, shouldDirty: true });
    };

    return (
        <S.Container>
            {arrayValues.map((itemValue, index) => (
                <S.ItemContainer key={`${expressionFieldProps.field.key}-${index}`}>
                    <ChipExpressionEditorComponent
                        getHelperPane={props.expressionFieldProps.getHelperPane}
                        isExpandedVersion={false}
                        completions={props.expressionFieldProps.completions}
                        onChange={(value) => handleInputChange(index, value)}
                        value={itemValue}
                        sanitizedExpression={props.expressionFieldProps.sanitizedExpression}
                        rawExpression={props.expressionFieldProps.rawExpression}
                        fileName={props.expressionFieldProps.fileName}
                        targetLineRange={props.expressionFieldProps.targetLineRange}
                        extractArgsFromFunction={props.expressionFieldProps.extractArgsFromFunction}
                        onOpenExpandedMode={props.expressionFieldProps.onOpenExpandedMode}
                        onRemove={props.expressionFieldProps.onRemove}
                        isInExpandedMode={props.expressionFieldProps.isInExpandedMode}
                        //HACK: always use Expression mode for array items. this should be fixed to
                        //show the type related editor in the field editor and the whole editor should
                        //have a switch to show the array editor mode and the expression mode.
                        //Exception: TEXT_SET uses StringTemplateEditorConfig for TEXT mode
                        configuration={isTextSet ? new StringTemplateEditorConfig() : new ChipExpressionEditorDefaultConfiguration()}
                        placeholder={expressionFieldProps.field.placeholder}
                        onNormalizeValue={(normalizedValue) => {
                            const updatedArray = [...currentValuesRef.current];
                            updatedArray[index] = textItem(normalizedValue);
                            currentValuesRef.current = updatedArray;
                            updateArrayValue(updatedArray, { shouldValidate: false, shouldDirty: false });
                        }}
                    />
                    <S.DeleteButton
                        appearance="icon"
                        onClick={() => handleDelete(index)}
                        disabled={arrayValues.length <= minItems}
                    >
                        <Codicon name="trash" />
                    </S.DeleteButton>
                </S.ItemContainer>
            ))}
            <S.AddButton
                onClick={handleAdd}
                appearance="secondary"
            >
                <Codicon name="add" sx={{ marginRight: "5px" }} />
                Add Item
            </S.AddButton>
        </S.Container>
    );
};
