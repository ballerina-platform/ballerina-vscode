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
import React, { useState } from "react";

import { VSCodeCheckbox } from "@vscode/webview-ui-toolkit/react";
import { Typography } from "@wso2/ui-toolkit";

import { TypeProps } from "../..";
import { useStmtEditorHelperPanelStyles } from "../../../../styles";
import { ParameterBranch } from "../../ParameterBranch";
import { getOptionalityLabel, isAllDefaultableFields, isRequiredParam } from "../../utils";

export default function InclusionType(props: TypeProps) {
    const { param, depth, onChange } = props;
    const stmtEditorHelperClasses = useStmtEditorHelperPanelStyles();
    const requiredParam = isRequiredParam(param);
    const isAllIncludedParamDefaultable = isAllDefaultableFields(param.inclusionType?.fields);

    const [paramSelected, setParamSelected] = useState(
        param.selected || (requiredParam && !isAllIncludedParamDefaultable)
    );

    const toggleParamCheck = () => {
        param.selected = !paramSelected;
        param.inclusionType.selected = !paramSelected;
        setParamSelected(!paramSelected);
        onChange();
    };

    const handleOnChange = () => {
        param.selected = param.inclusionType.selected;
        onChange();
    };

    return (
        <div className={stmtEditorHelperClasses.docListDefault}>
            <div className={stmtEditorHelperClasses.listItemMultiLine} data-testid="inclusion-arg">
                <div className={stmtEditorHelperClasses.listItemHeader}>
                    <VSCodeCheckbox
                        checked={paramSelected}
                        {...(requiredParam && !isAllIncludedParamDefaultable && { disabled: true })}
                        onClick={toggleParamCheck}
                        className={stmtEditorHelperClasses.parameterCheckbox}
                        data-testid="arg-check"
                    />
                    <Typography
                        variant="body3"
                        sx={{margin: '0px 5px'}}
                    >
                        {param.name}
                    </Typography>
                    {param.inclusionType?.typeInfo && (
                        <Typography
                            className={stmtEditorHelperClasses.suggestionDataType}
                            variant="body3"
                            data-testid="arg-type"
                        >
                            {getOptionalityLabel(param)} *
                                    {param.inclusionType.typeInfo.name}
                        </Typography>
                    )}
                </div>
                {param.documentation && (
                    <div className={stmtEditorHelperClasses.documentationWrapper}>
                        <Typography
                            className={stmtEditorHelperClasses.paramTreeDescriptionText}
                            variant="body3"
                        >
                            {param.documentation}
                        </Typography>
                    </div>
                )}
                {paramSelected && param.inclusionType?.fields?.length > 0 && (
                    <div className={stmtEditorHelperClasses.listItemBody}>
                        <ParameterBranch
                            parameters={param.inclusionType.fields}
                            depth={depth + 1}
                            onChange={handleOnChange}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
