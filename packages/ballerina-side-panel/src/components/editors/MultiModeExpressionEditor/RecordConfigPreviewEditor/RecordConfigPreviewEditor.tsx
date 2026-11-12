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

import { ExpressionFieldProps } from "../../ExpressionField";
import React, { useMemo } from "react";
import { getValueForTextModeEditor } from "../../utils";
import styled from "@emotion/styled";
import { FloatingToggleButton } from "../ChipExpressionEditor/components/FloatingToggleButton";
import { ExpandIcon } from "../ChipExpressionEditor/components/FloatingButtonIcons";
import { ChipExpressionEditorComponent } from "../ChipExpressionEditor/components/ChipExpressionEditor";
import { RecordPreviewEditorConfig } from "../Configurations";

const EditorContainer = styled.div`
    width: 100%;
    position: relative;

    #text-mode-editor-expand {
        opacity: 0;
        transition: opacity 0.2s ease-in-out;
    }

    &:hover #text-mode-editor-expand {
        opacity: 1;
    }
`;

type RecordConfigPreviewEditorProps = Pick<ExpressionFieldProps, 'value' | 'fileName' | 'targetLineRange' | 'autoFocus' | 'ariaLabel' | 'placeholder' | 'onChange' | 'onFocus' | 'onBlur' | 'onOpenExpandedMode' | 'isInExpandedMode'>;

export const RecordConfigPreviewEditor: React.FC<RecordConfigPreviewEditorProps> = ({
    value,
    fileName,
    targetLineRange,
    autoFocus,
    ariaLabel,
    placeholder,
    onChange,
    onFocus,
    onBlur,
    onOpenExpandedMode,
    isInExpandedMode,
}) => {
    const configuration = useMemo(() => new RecordPreviewEditorConfig(), []);

    const handleOnChange = async (value: string, updatedCursorPosition: number) => {
        const newValue = "\"" + value + "\"";
        onChange(newValue, updatedCursorPosition);
    }

    return (
        <EditorContainer>
            {/* Focus bubbles up from the editor, so focusing it still opens the record
                configuration modal through onFocus. Kept off the expand button. */}
            <div onFocus={onFocus}>
                <ChipExpressionEditorComponent
                    completions={[]}
                    value={getValueForTextModeEditor(value)}
                    onChange={handleOnChange}
                    onBlur={onBlur}
                    fileName={fileName}
                    targetLineRange={targetLineRange}
                    configuration={configuration}
                    isExpandedVersion={false}
                    placeholder={placeholder}
                    ariaLabel={ariaLabel}
                    onEditorViewReady={autoFocus ? (view) => view.focus() : undefined}
                />
            </div>
            {onOpenExpandedMode && !isInExpandedMode && (
                <div id="text-mode-editor-expand" style={{ position: 'absolute', bottom: '9px', right: '8px' }}>
                    <FloatingToggleButton onClick={onOpenExpandedMode} title="Expand Editor">
                        <ExpandIcon />
                    </FloatingToggleButton>
                </div>
            )}
        </EditorContainer>
    );
};

export default RecordConfigPreviewEditor
