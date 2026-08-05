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

import React from "react";
import { EditorModeExpressionProps } from "./types";
import { ExpressionContainer } from "./styles";
import { ChipExpressionEditorComponent } from "../../MultiModeExpressionEditor/ChipExpressionEditor/components/ChipExpressionEditor";
import { getEditorConfiguration } from "../../ExpressionField";
import { ErrorBanner } from "@wso2/ui-toolkit";

/**
 * Text mode editor - simple textarea without any formatting tools
 */
export const TextMode: React.FC<EditorModeExpressionProps> = ({
    value,
    onChange,
    completions = [],
    fileName,
    targetLineRange,
    sanitizedExpression,
    extractArgsFromFunction,
    getHelperPane,
    rawExpression,
    error,
    formDiagnostics,
    inputMode,
    readOnly
}) => {

    return (
        <>
            <ExpressionContainer>
                <ChipExpressionEditorComponent
                    value={value}
                    onChange={onChange}
                    completions={completions}
                    sanitizedExpression={sanitizedExpression}
                    fileName={fileName}
                    targetLineRange={targetLineRange}
                    extractArgsFromFunction={extractArgsFromFunction}
                    getHelperPane={getHelperPane}
                    rawExpression={rawExpression}
                    isInExpandedMode={true}
                    isExpandedVersion={true}
                    inputMode={inputMode}
                    configuration={getEditorConfiguration(inputMode)}
                    disabled={readOnly}
                />
            </ExpressionContainer>
            {error ?
                <ErrorBanner sx={{ maxHeight: "50px", overflowY: "auto" }} errorMsg={error.message.toString()} /> :
                formDiagnostics && formDiagnostics.length > 0 &&
                <ErrorBanner sx={{ maxHeight: "50px", overflowY: "auto" }} errorMsg={formDiagnostics.map(d => d.message).join('\n')} />
            }
        </>
    );
};
