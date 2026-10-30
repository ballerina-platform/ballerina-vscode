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
// tslint:disable: jsx-no-multiline-js

import React from 'react';

import { ActionButtons, Divider, Dropdown, TextField, Typography } from '@wso2/ui-toolkit';
import { VSCodeCheckbox } from "@vscode/webview-ui-toolkit/react";
import { EditorContainer, EditorContent } from '../../../styles';
import { TypeBrowser } from '../../../components/TypeBrowser/TypeBrowser';
import { PARAM_TYPES } from '../../../definitions';
import { ParameterModel, PropertyModel } from '@wso2/ballerina-core';

const options = [{ id: "0", value: "QUERY" }, { id: "1", value: "HEADER" }];

export interface ParamProps {
    param: ParameterModel;
    hideType?: boolean;
    onChange: (param: ParameterModel) => void;
    onSave?: (param: ParameterModel) => void;
    onCancel?: (param?: ParameterModel) => void;
}

export function ParamEditor(props: ParamProps) {
    const { param, hideType = false, onChange, onSave, onCancel } = props;

    const handleOnSelect = (value: string) => {
        onChange({ ...param, httpParamType: value as "QUERY" | "HEADER" | "PAYLOAD" });
    };

    const handleTypeChange = (value: string) => {
        onChange({ ...param, type: { ...param.type, value } });
    };

    const handleChange = (value: string) => {
        onChange({ ...param, name: { ...param.name, value } });
    };

    const handleValueChange = (value: string) => {
        onChange({ ...param, defaultValue: { ...(param.defaultValue as PropertyModel), value } });
    };

    const handleReqFieldChange = () => {
        const kind = param.kind === 'REQUIRED' ? "OPTIONAL" : "REQUIRED";
        onChange({ ...param, kind });
    };

    const handleOnCancel = () => {
        onCancel(param);
    };

    const handleOnSave = () => {
        onSave(param);
    };

    return (
        <EditorContainer>
            {param.httpParamType && <Typography sx={{ marginBlockEnd: 10 }} variant="h4">{param.httpParamType === "PAYLOAD" ? "Payload" : "Parameter"} Configuration</Typography>}
            {!param.httpParamType && <Typography sx={{ marginBlockEnd: 10 }} variant="h4">{param.metadata.label} Configuration</Typography>}
            <Divider />
            {param.httpParamType && param.httpParamType !== "PAYLOAD" && (
                <Dropdown
                    id="param-type-selector"
                    sx={{ zIndex: 2, width: 172 }}
                    isRequired
                    items={options}
                    label="Param Type"
                    onValueChange={handleOnSelect}
                    value={param.httpParamType}
                />
            )}
            <EditorContent>
                {!hideType && (
                    <TypeBrowser
                        sx={{ zIndex: 1, position: "relative", width: "100%" }}
                        borderBox={true}
                        label="Type"
                        selectedItem={param.type.value}
                        onChange={handleTypeChange}
                    />
                )}
                <TextField
                    label='Name'
                    size={21}
                    required
                    sx={{ width: "100%" }}
                    placeholder='Enter name'
                    value={param.name.value}
                    errorMsg={""}
                    onTextChange={handleChange}
                />
                {param.defaultValue && (
                    <TextField
                        label='Default Value'
                        size={21}
                        sx={{ width: "100%" }}
                        placeholder='Enter default value'
                        errorMsg={""}
                        value={(param.defaultValue as PropertyModel).value}
                        onTextChange={handleValueChange}
                    />
                )}
            </EditorContent>
            {param.httpParamType === PARAM_TYPES.DEFAULT && (
                <VSCodeCheckbox checked={param.kind === "REQUIRED"} onChange={handleReqFieldChange} id="is-req-checkbox">
                    Is Required?
                </VSCodeCheckbox>
            )}
            <ActionButtons
                primaryButton={{ text: "Save", onClick: handleOnSave }}
                secondaryButton={{ text: "Cancel", onClick: handleOnCancel }}
                sx={{ justifyContent: "flex-end" }}
            />
        </EditorContainer >
    );
}
