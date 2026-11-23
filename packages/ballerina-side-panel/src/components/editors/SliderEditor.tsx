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

import React, { useEffect } from "react";
import { FormField } from "../Form/types";
import { Slider } from "@wso2/ui-toolkit";
import { useFormContext } from "../../context";

interface SliderEditorProps {
    field: FormField;
}

export function SliderEditor(props: SliderEditorProps) {
    const { field } = props;
    const { form } = useFormContext();
    const { register, setValue, watch, getValues } = form;

    const currentValue = watch(field.key);

    // Set initial value on mount
    useEffect(() => {
        const formValues = getValues();
        const currentFormValue = formValues[field.key];
        if (currentFormValue === undefined || currentFormValue === null || currentFormValue === "") {
            setValue(field.key, field.value || field.sliderProps?.min || 0);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Empty dependency array - only run on mount

    const handleChange = (e: any) => {
        const value = e.target.value;
        setValue(field.key, value, { shouldDirty: true });
        field.onValueChange?.(value);
    };

    // Extract slider configuration from field
    const min = field.sliderProps?.min ?? 0;
    const max = field.sliderProps?.max ?? 100;
    const step = field.sliderProps?.step ?? 1;
    const showValue = field.sliderProps?.showValue ?? true;
    const showMarkers = field.sliderProps?.showMarkers ?? true;
    const valueFormatter = field.sliderProps?.valueFormatter;

    return (
        <Slider
            {...register(field.key, {
                value: field.value,
                onChange: handleChange
            })}
            label={field.label}
            description={field.documentation}
            value={currentValue}
            min={min}
            max={max}
            step={step}
            showValue={showValue}
            showMarkers={showMarkers}
            valueFormatter={valueFormatter}
        />
    );
}
