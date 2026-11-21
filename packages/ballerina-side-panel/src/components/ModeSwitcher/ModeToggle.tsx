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

import React from 'react';
import { Label, Slider, SwitchWrapper } from './styles';

// Show the full mode name as a tooltip only when the label is ellipsized at its max width.
const showTitleIfTruncated = (event: React.MouseEvent<HTMLElement>) => {
    const label = event.currentTarget;
    label.title = label.scrollWidth > label.clientWidth ? label.dataset.text ?? '' : '';
};

export interface ModeToggleProps {
    /** Label of the first mode, such as "Text". */
    primaryLabel: string;
    /** Label of the second mode, such as "Expression". */
    secondaryLabel: string;
    /** Whether the second mode is the current one. */
    secondary: boolean;
    /** Called with the mode the user picked; `true` for the second. */
    onChange: (secondary: boolean) => void;
    testId?: string;
}

/**
 * The two-way mode switch a form field shows beside its description, without any form state. `ModeSwitcher`
 * builds on it for side-panel fields; other forms use it to look the same.
 */
export const ModeToggle: React.FC<ModeToggleProps> = ({ primaryLabel, secondaryLabel, secondary, onChange, testId }) => (
    <SwitchWrapper>
        <Slider checked={secondary} data-testid={testId}>
            <Label data-testid="primary-mode" active={!secondary} onMouseEnter={showTitleIfTruncated}
                data-text={primaryLabel} onClick={() => onChange(false)}>{primaryLabel}</Label>
            <Label data-testid="expression-mode" active={secondary} onMouseEnter={showTitleIfTruncated}
                data-text={secondaryLabel} onClick={() => onChange(true)}>{secondaryLabel}</Label>
        </Slider>
    </SwitchWrapper>
);

export default ModeToggle;
