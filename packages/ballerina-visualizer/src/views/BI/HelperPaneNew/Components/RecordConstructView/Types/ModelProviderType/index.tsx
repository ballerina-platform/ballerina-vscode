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
import React, { useState } from "react";

import { VSCodeCheckbox } from "@vscode/webview-ui-toolkit/react";
import { Codicon, Tooltip, Typography } from "@wso2/ui-toolkit";
import { FormField } from "@wso2/ballerina-side-panel";
import { NodeReferenceSelectEditor } from "@wso2/ballerina-side-panel/lib/components/editors/MultiModeExpressionEditor/NodeReferenceSelectEditor/NodeReferenceSelectEditor";

import { TypeProps } from "../../ParameterBranch";
import { useHelperPaneStyles } from "../../styles";
import { isRequiredParam, resetFieldValues } from "../../utils";

export default function ModelProviderType(props: TypeProps) {
    const { param, onChange } = props;
    const helperStyleClass = useHelperPaneStyles();
    const requiredParam = isRequiredParam(param);
    if (requiredParam) {
        param.selected = true;
    }

    const [paramSelected, setParamSelected] = useState<boolean>(param.selected || requiredParam);

    const toggleParamCheck = () => {
        if (!requiredParam) {
            const newSelectedState = !paramSelected;
            param.selected = newSelectedState;

            if (!newSelectedState) {
                resetFieldValues(param);
            }

            setParamSelected(newSelectedState);
            onChange();
        }
    };

    const modelField: FormField = {
        key: param.name || "model",
        label: param.name || "Model",
        type: "ACTION_EXPRESSION",
        optional: param.optional ?? true,
        editable: true,
        documentation: param.documentation || "",
        value: typeof param.value === "string" ? param.value : "",
        types: [{ fieldType: "ACTION_EXPRESSION", selected: true }],
        enabled: true,
        codedata: { searchNodesKind: "MODEL_PROVIDER" }
    };

    const handleValueChange = (value: string) => {
        param.value = value;
        param.selected = true;
        onChange();
    };

    return (
        <div className={helperStyleClass.docListDefault}>
            <div className={helperStyleClass.listItemMultiLine}>
                <div className={helperStyleClass.listItemHeader}>
                    <VSCodeCheckbox
                        checked={paramSelected}
                        {...(requiredParam && { disabled: true })}
                        onClick={toggleParamCheck}
                        className={helperStyleClass.parameterCheckbox}
                    />
                    <Typography variant="body3" sx={{ margin: '0px 5px' }}>
                        {param.name}
                    </Typography>
                    <Typography className={helperStyleClass.suggestionDataType} variant="body3">
                        {param.optional || param.defaultable ? "ai:ModelProvider (Optional)" : "ai:ModelProvider"}
                    </Typography>
                    {param.documentation && (
                        <Tooltip
                            content={
                                <Typography className={helperStyleClass.paramTreeDescriptionText} variant="body3">
                                    {param.documentation}
                                </Typography>
                            }
                            position="right"
                            sx={{ maxWidth: '300px', whiteSpace: 'normal', pointerEvents: 'none' }}
                        >
                            <Codicon name="info" sx={{ marginLeft: '4px' }} />
                        </Tooltip>
                    )}
                </div>
                {paramSelected && (
                    <div style={{ marginTop: '4px', marginLeft: '24px' }}>
                        <NodeReferenceSelectEditor
                            value={modelField.value}
                            field={modelField}
                            onChange={(value) => handleValueChange(value)}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
