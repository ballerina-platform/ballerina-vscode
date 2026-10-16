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

import React, { useMemo, useState } from 'react';
import { Label, Slider, SwitchWrapper } from './styles';
import { InputMode, getInputModeLabel } from '../editors/MultiModeExpressionEditor/ChipExpressionEditor/types';
import { getDefaultExpressionMode, getSecondaryMode } from '../editors/MultiModeExpressionEditor/ChipExpressionEditor/utils';
import { InputType } from '@wso2/ballerina-core';
import { getEditorConfiguration } from '../editors/ExpressionField';
import { useFormContext } from '../../context';
import WarningPopup from '../WarningPopup';

// Show the full mode name as a tooltip only when the label is ellipsized at its max width.
const showTitleIfTruncated = (event: React.MouseEvent<HTMLElement>) => {
    const label = event.currentTarget;
    label.title = label.scrollWidth > label.clientWidth ? label.dataset.text ?? '' : '';
};

interface ModeSwitcherProps {
    value: InputMode;
    //TODO: Should be removed once fields with type field is fixed to
    // update the types property correctly when changing the type.
    isRecordTypeField: boolean;
    onChange: (value: InputMode) => void;
    types: InputType[];
    fieldKey: string;
}

const ModeSwitcher: React.FC<ModeSwitcherProps> = ({ value, isRecordTypeField, onChange, types, fieldKey }) => {

    const { form } = useFormContext();
    const { getValues, setValue } = form;
    const [showWarning, setShowWarning] = useState(false);
    const [pendingMode, setPendingMode] = useState<InputMode | null>(null);

    const defaultMode = useMemo(
        //TODO: Should only return the getDefaultExpressionMode(types) once fields with type field is fixed to
        // update the types property correctly when changing the type.
        () => isRecordTypeField ? InputMode.RECORD : getDefaultExpressionMode(types),
        [types, isRecordTypeField]
    );

    const secondaryMode = useMemo(
        //TODO: Should only return the getSecondaryMode(types) once fields with type field is fixed to
        // update the types property correctly when changing the type.
        () => isRecordTypeField ? InputMode.EXP : getSecondaryMode(types),
        [types, isRecordTypeField]
    );

    const handleModeSwitch = (mode: InputMode) => {
        const currentFieldValue = getValues(fieldKey);
        const configForNewMode = getEditorConfiguration(mode);
        let isValueCompatible = true;
        if (mode === InputMode.BOOLEAN) {
            isValueCompatible = false;
        }
        else {
            isValueCompatible = configForNewMode.getIsValueCompatible ? configForNewMode.getIsValueCompatible(currentFieldValue) : true;
        }

        if (!isValueCompatible) {
            setPendingMode(mode);
            setShowWarning(true);
        } else {
            onChange(mode);
        }
    };

    const handleConfirmSwitch = () => {
        if (pendingMode) {
            setValue(fieldKey, "", { shouldDirty: true });
            onChange(pendingMode);
            setPendingMode(null);
        }
        setShowWarning(false);
    };

    const handleCancelSwitch = () => {
        setPendingMode(null);
        setShowWarning(false);
    };

    const isChecked = value === secondaryMode;
    const defaultLabel = getInputModeLabel(defaultMode);
    const secondaryLabel = getInputModeLabel(secondaryMode);

    return (
        <>
            <SwitchWrapper>
                <Slider checked={isChecked} data-testid={`mode-switcher-slider-${fieldKey}`}>
                    <Label data-testid="primary-mode" active={!isChecked} onMouseEnter={showTitleIfTruncated} data-text={defaultLabel} onClick={() => handleModeSwitch(defaultMode)}>{defaultLabel}</Label>
                    <Label data-testid="expression-mode" active={isChecked} onMouseEnter={showTitleIfTruncated} data-text={secondaryLabel} onClick={() => handleModeSwitch(secondaryMode)}>{secondaryLabel}</Label>
                </Slider>
            </SwitchWrapper>
            <WarningPopup
                isOpen={showWarning}
                onContinue={handleConfirmSwitch}
                onCancel={handleCancelSwitch}
            />
        </>
    );
};

export default ModeSwitcher;
