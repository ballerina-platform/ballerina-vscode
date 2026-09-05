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
import React, { useRef, useState } from "react";

import { VSCodeCheckbox } from "@vscode/webview-ui-toolkit/react";
import { TypeField } from "@wso2/ballerina-core";
import { Dropdown, Typography } from "@wso2/ui-toolkit";

import { TypeProps } from "../..";
import { useStmtEditorHelperPanelStyles } from "../../../../styles";
import { ParameterBranch } from "../../ParameterBranch";
import { getOptionalityLabel, getSelectedUnionMember, isRequiredParam } from "../../utils";

export default function UnionType(props: TypeProps) {
    const { param, depth, onChange } = props;
    const stmtEditorHelperClasses = useStmtEditorHelperPanelStyles();

    const requiredParam = isRequiredParam(param);
    const memberTypes = param.members?.map((field, index) => ({ id: index.toString(), value: getUnionParamName(field) }));
    const initSelectedMember = getSelectedUnionMember(param);

    const [paramSelected, setParamSelected] = useState(param.selected || requiredParam);
    const [selectedMemberType, setSelectedMemberType] = useState(getUnionParamName(initSelectedMember));
    const [parameter, setParameter] = useState<TypeField>(initSelectedMember);
    const initialRendering = useRef(false);

    if (!(param.members && param.members.length > 0)) {
        return <></>;
    }

    const updateFormFieldMemberSelection = (unionField: TypeField) => {
        const unionFieldName = getUnionParamName(unionField);
        param.members.forEach((field) => {
            field.selected = getUnionParamName(field) === unionFieldName;
        });
    };

    const handleMemberType = (type: string) => {
        const selectedMember = param.members.find((field) => getUnionParamName(field) === type);
        updateFormFieldMemberSelection(selectedMember);
        setSelectedMemberType(type);
        setParameter(selectedMember);
        if (initialRendering.current) {
            // INFO: avoid onChange call in initial rendering to prevent multiple rendering.
            onChange();
        }
        initialRendering.current = true;
    };

    const toggleParamCheck = () => {
        param.selected = !paramSelected;
        setParamSelected(!paramSelected);
        onChange();
    };

    return (
        <div className={stmtEditorHelperClasses.docListDefault}>
            <div className={stmtEditorHelperClasses.listItemMultiLine} data-testid="union-arg">
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
                        sx={{margin: '0px 5px'}}
                    >
                        {param.name}
                    </Typography>
                    {param.optional && (
                        <Typography
                            className={stmtEditorHelperClasses.suggestionDataType}
                            variant="body3"
                            data-testid="arg-type"
                        >
                            {getOptionalityLabel(param).trim()}
                        </Typography>
                    )}
                    <div className={stmtEditorHelperClasses.listDropdownWrapper} data-testid="arg-dropdown">
                        <Dropdown
                            onValueChange={handleMemberType}
                            id="arg-dropdown"
                            value={selectedMemberType}
                            items={memberTypes}
                            data-testid="arg-dropdown-component"
                            sx={{ marginLeft: '5px' }}
                        />
                    </div>
                </div>
                {param.documentation && (
                    <div className={stmtEditorHelperClasses.documentationWrapper}>
                        <Typography
                            className={stmtEditorHelperClasses.docParamDescriptionText}
                            variant="body3"
                            data-testid="arg-documentation"
                        >
                            {param.documentation}
                        </Typography>
                    </div>
                )}
                {paramSelected && parameter && (
                    <div className={stmtEditorHelperClasses.listItemBody}>
                        <ParameterBranch parameters={[parameter]} depth={depth + 1} onChange={onChange} />
                    </div>
                )}
            </div>
        </div>
    );
}

export function getUnionParamName(param: TypeField) {
    return param ? param.name || param.typeName : "";
}
