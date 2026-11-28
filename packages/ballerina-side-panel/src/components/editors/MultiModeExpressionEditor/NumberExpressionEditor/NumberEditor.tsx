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
import { getValueForTextModeEditor } from "../../utils";
import { ChipExpressionEditorComponent, ChipExpressionEditorComponentProps } from "../ChipExpressionEditor/components/ChipExpressionEditor";
import { NumberExpressionEditorConfig } from "../Configurations";

export const NumberExpressionEditor: React.FC<ChipExpressionEditorComponentProps & { onRejectedInput?: () => void }> = (props) => {

    return (
        <ChipExpressionEditorComponent
            getHelperPane={props.getHelperPane}
            isExpandedVersion={false}
            completions={props.completions}
            onChange={props.onChange}
            value={getValueForTextModeEditor(props.value)}
            sanitizedExpression={props.sanitizedExpression}
            rawExpression={props.rawExpression}
            fileName={props.fileName}
            targetLineRange={props.targetLineRange}
            extractArgsFromFunction={props.extractArgsFromFunction}
            onOpenExpandedMode={props.onOpenExpandedMode}
            onRemove={props.onRemove}
            isInExpandedMode={props.isInExpandedMode}
            configuration={new NumberExpressionEditorConfig(props.onRejectedInput)}
            placeholder={props.placeholder}
            onLoadingStateChange={props.onLoadingStateChange}
            onNormalizeValue={props.onNormalizeValue}
        />
    );
};

export default NumberExpressionEditor
