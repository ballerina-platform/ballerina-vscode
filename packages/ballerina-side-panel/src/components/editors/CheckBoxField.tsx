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

import React from "react";
import styled from "@emotion/styled";
import { CheckBox } from "@wso2/ui-toolkit";

export const FieldLabel = styled.div`
    font-family: var(--font-family);
    color: var(--vscode-editor-foreground);
    text-align: left;
    text-transform: capitalize;
`;

export const FieldDescription = styled.div`
    font-family: var(--font-family);
    color: var(--vscode-list-deemphasizedForeground);
    text-align: left;
`;

const Root = styled.div`
    display: flex;
    flex-direction: column;
    & vscode-checkbox {
        margin: 0;
    }
`;

// Indented by the box and its gap, so the text starts under the label.
const CheckBoxDescription = styled(FieldDescription)`
    margin-top: 2px;
    padding-inline-start: 28px;
    user-select: text;
`;

export interface CheckBoxFieldProps {
    label: string;
    description?: string;
    checked: boolean;
    disabled?: boolean;
    onChange: (checked: boolean) => void;
}

/** A checkbox outside a form's field model, with the label and description of a form flag field. */
export function CheckBoxField({ label, description, checked, disabled, onChange }: CheckBoxFieldProps) {
    return (
        <Root>
            <CheckBox label={label} checked={checked} disabled={disabled} onChange={onChange} />
            {description && <CheckBoxDescription>{description}</CheckBoxDescription>}
        </Root>
    );
}
