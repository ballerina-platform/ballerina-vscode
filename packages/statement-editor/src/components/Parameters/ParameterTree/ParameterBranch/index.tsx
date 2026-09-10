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

import { TypeField } from "@wso2/ballerina-core";
import { Button } from "@wso2/ui-toolkit";

import { TypeProps } from "..";
import { useStmtEditorHelperPanelStyles } from "../../../styles";
import { isAnyFieldSelected, isOptionalParam } from "../utils";

import * as Types from "./../Types";

export interface ParameterBranchProps {
    parameters: TypeField[];
    depth: number;
    onChange: () => void;
}

export function ParameterBranch(props: ParameterBranchProps) {
    const { parameters, depth, onChange } = props;
    const stmtEditorHelperClasses = useStmtEditorHelperPanelStyles();

    const [showOptionalParams, setShowOptionalParams] = useState(isAnyFieldSelected(parameters));

    const inlineParams: JSX.Element[] = []; // required and defaultable fields
    const optionalParams: JSX.Element[] = [];

    parameters?.forEach((param: TypeField, index: number) => {
        let TypeComponent = (Types as any)[param.typeName];
        const typeProps: TypeProps = {
            param,
            depth,
            onChange,
        };
        if (!TypeComponent) {
            TypeComponent = (Types as any).custom;
        }
        if (isOptionalParam(param)) {
            optionalParams.push(<TypeComponent key={index} {...typeProps} />);
        } else {
            inlineParams.push(<TypeComponent key={index} {...typeProps} />);
        }
    });

    function toggleOptionalParams(e: any) {
        setShowOptionalParams(!showOptionalParams);
    }

    return (
        <div data-testid="parameter-branch">
            {inlineParams}
            {optionalParams.length > 0 && (
                <div className={stmtEditorHelperClasses.listOptionalWrapper}>
                    <div className={stmtEditorHelperClasses.listOptionalHeader}>Optional fields </div>
                    <Button
                        data-testid="optional-toggle-button"
                        className={stmtEditorHelperClasses.listOptionalBtn}
                        onClick={toggleOptionalParams}
                        appearance="secondary"
                    >
                        {showOptionalParams ? "Hide" : "Show"}
                    </Button>
                </div>
            )}
            {showOptionalParams && optionalParams.length > 0 && optionalParams}
        </div>
    );
}

export const MemoizedParameterBranch = React.memo(ParameterBranch);
