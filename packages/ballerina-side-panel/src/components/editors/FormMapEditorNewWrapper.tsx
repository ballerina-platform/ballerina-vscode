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

import React, { useMemo } from "react";
import { useController } from "react-hook-form";
import { useFormContext } from "../../context";
import { FormMapEditorNew } from "./FormMapEditorNew";
import { FormFieldEditorProps } from "./EditorFactory";
import { buildRequiredRepeatableRule, useRepeatableRequiredError } from "./utils";

export const FormMapEditorWrapper = (props: FormFieldEditorProps) => {
    const { form } = useFormContext();
    const { control } = form;

    const validateRequired = useMemo(
        () => buildRequiredRepeatableRule({ isRequired: !props.field.optional, label: props.field.label }),
        [props.field.optional, props.field.label]
    );
    const { field, fieldState } = useController({
        name: props.field.key,
        control,
        rules: { validate: validateRequired },
    });
    const error = useRepeatableRequiredError(field.value, fieldState.error?.message, validateRequired);

    return (
        <FormMapEditorNew
            {...props}
            value={field.value}
            onChange={field.onChange}
            error={error}
        />
    );
}
