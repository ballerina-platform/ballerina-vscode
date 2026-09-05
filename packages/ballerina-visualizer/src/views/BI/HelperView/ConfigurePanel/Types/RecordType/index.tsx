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

import { TypeProps } from "../../index";
import { useStmtEditorHelperPanelStyles } from "../../styles";
import { MemoizedParameterBranch } from "../../index";
import { getOptionalityLabel, isRequiredParam } from "../../utils";

export default function RecordType(props: TypeProps) {
    const { param, depth, onChange } = props;
    const stmtEditorHelperClasses = useStmtEditorHelperPanelStyles();
    const requiredParam = isRequiredParam(param);

    const [paramSelected, setParamSelected] = useState(param.selected || requiredParam);

    const toggleParamCheck = () => {
        if (!requiredParam) {
            param.selected = !paramSelected;
            setParamSelected(!paramSelected);
            onChange();
        }
    };

    return (
        <div className={param.documentation ? stmtEditorHelperClasses.docListCustom : stmtEditorHelperClasses.docListDefault}>
            <div className={stmtEditorHelperClasses.listItemMultiLine} data-testid="record-arg">
                <div className={stmtEditorHelperClasses.listItemHeader}>
                    <VSCodeCheckbox
                        checked={paramSelected}
                        {...(requiredParam && { disabled: true })}
                        onClick={toggleParamCheck}
                        className={stmtEditorHelperClasses.parameterCheckbox}
                        data-testid="arg-check"
                    />
                    <Typography
                        variant="body3"
                        sx={{ margin: '0px 5px' }}
                    >
                        {param.name}
                    </Typography>
                    {param.typeInfo && (
                        <Typography
                            className={stmtEditorHelperClasses.suggestionDataType}
                            variant="body3"
                            data-testid="arg-type"
                        >
                            {getOptionalityLabel(param)} {param.typeInfo.name}
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
                {paramSelected && param.fields?.length > 0 && (
                    <div className={stmtEditorHelperClasses.listItemBody}>
                        <MemoizedParameterBranch parameters={param.fields} depth={depth + 1} onChange={onChange} />
                    </div>
                )}
            </div>
        </div>
    );
}
