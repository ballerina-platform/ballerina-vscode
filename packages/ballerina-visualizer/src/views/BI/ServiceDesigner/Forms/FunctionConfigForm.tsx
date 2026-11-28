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

import React, { useState } from "react";
import { FunctionModel, ServiceModel } from "@wso2/ballerina-core";
import ButtonCard from "../../../../components/ButtonCard";

import { EditorContentColumn, PanelBody } from "../styles";

interface FunctionConfigFormProps {
    serviceModel: ServiceModel;
    onSubmit?: (model: FunctionModel) => void;
    onSelect?: (model: FunctionModel) => void;
    onBack?: () => void;
    isSaving: boolean;
}

export function FunctionConfigForm(props: FunctionConfigFormProps) {

    const { serviceModel, onSubmit, onSelect, onBack, isSaving } = props;

    const nonEnabledFunctions = serviceModel.functions.filter(func => !func.enabled);
    const [selectedFunctionName, setSelectedFunctionName] = useState<string | undefined>(
        nonEnabledFunctions.length > 0 ? nonEnabledFunctions[0].name.value : undefined
    );

    const handleOnSelect = (functionName: string) => {
        setSelectedFunctionName(functionName);
        const selectedFunction = serviceModel.functions.find(func => func.name.value === functionName);
        if (selectedFunction) {
            // If onSelect is provided, call it instead of onSubmit
            if (onSelect) {
                onSelect(selectedFunction);
            } else {
                // Fallback to old behavior if onSelect is not provided
                handleConfigSave();
            }
        }
    };

    const handleConfigSave = () => {
        if (selectedFunctionName) {
            const selectedFunction = serviceModel.functions.find(func => func.name.value === selectedFunctionName);
            if (selectedFunction) {
                selectedFunction.enabled = true;
                onSubmit(selectedFunction);
            }
        }
    };

    return (
        <PanelBody>
            <EditorContentColumn>
                {nonEnabledFunctions.map((func, index) => (
                    <ButtonCard
                        key={func.name.value}
                        id={`function-card-${index}`}
                        title={func.name.value}
                        tooltip={func.metadata?.description || ""}
                        onClick={() => handleOnSelect(func.name.value)}
                        disabled={isSaving}
                    />
                ))}
                {nonEnabledFunctions.length === 0 && (
                    <div>No functions available to enable.</div>
                )}
            </EditorContentColumn>
        </PanelBody>
    );
}

export default FunctionConfigForm;

