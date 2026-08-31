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

import { VSCodeCheckbox } from "@vscode/webview-ui-toolkit/react";
import { Codicon, Tooltip, Typography } from "@wso2/ui-toolkit";

import { TypeProps } from "../../ParameterBranch";
import { useHelperPaneStyles } from "../../styles";
import { MemoizedParameterBranch } from "../../ParameterBranch";
import { isRequiredParam, updateFieldsSelection, resetFieldValues } from "../../utils";

export default function RecordType(props: TypeProps) {
    const { param, depth, onChange } = props;
    const helperStyleClass = useHelperPaneStyles();
    const requiredParam = isRequiredParam(param) && depth > 1; // Only apply required param logic after depth 1
    if (requiredParam) {
        param.selected = true;
    }

    const [paramSelected, setParamSelected] = useState(param.selected || requiredParam);

    const toggleParamCheck = () => {
        if (!requiredParam) {
            const newSelectedState = !paramSelected;
            param.selected = newSelectedState;

            // When unchecking, reset the field values
            if (!newSelectedState) {
                resetFieldValues(param);
            }

            // If the record has fields, update their selection state
            if (param.fields && param.fields.length > 0) {
                updateFieldsSelection(param.fields, newSelectedState);
            }

            setParamSelected(newSelectedState);
            onChange();
        }
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
                        aria-label={param.name}
                        data-testid={`record-field-checkbox-${param.name}`}
                    />
                    <Typography
                        variant="body3"
                        sx={{ margin: '0px 5px' }}
                    >
                        {param.name}
                    </Typography>
                    {param.typeInfo && (
                        <Typography
                            className={helperStyleClass.suggestionDataType}
                            variant="body3"
                        >
                            {(param.optional || param.defaultable) && " (Optional)"} {param.typeInfo.name}
                        </Typography>
                    )}
                    {param.documentation && (
                        <Tooltip
                            content={
                                    <Typography
                                        className={helperStyleClass.paramTreeDescriptionText}
                                        variant="body3"
                                    >
                                        {param.documentation}
                                    </Typography>
                            }
                            position="right"
                            sx={{ maxWidth: '300px', whiteSpace: 'normal', pointerEvents: 'none' }}
                        >
                            <Codicon
                                name="info"
                                sx={{ marginLeft: '4px' }}
                            />
                        </Tooltip>
                    )}
                </div>
                {paramSelected && param.fields?.length > 0 && (
                    <div className={helperStyleClass.listItemBody}>
                        <MemoizedParameterBranch parameters={param.fields} depth={depth + 1} onChange={onChange} />
                    </div>
                )}
            </div>
        </div>
    );
}
