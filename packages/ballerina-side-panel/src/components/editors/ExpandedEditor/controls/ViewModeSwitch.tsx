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
import styled from "@emotion/styled";
import { Label, Slider, SwitchWrapper } from "../../../ModeSwitcher/styles";

// Sized to the toolbar's 32px buttons; back to the field's compact switch when the toolbar is narrow.
const ToolbarSwitch = styled(SwitchWrapper)`
    min-width: 132px;
    height: 28px;
    & span {
        padding: 0 10px;
        font-size: 12px;
    }
    @container (max-width: 700px) {
        min-width: 112px;
        height: 24px;
        & span {
            padding: 0 6px;
            font-size: 10px;
        }
    }
`;

interface ViewModeSwitchProps {
    isSourceView: boolean;
    onToggle: () => void;
}

/** Preview / Source in the same compact switch a field uses for its input mode. */
export function ViewModeSwitch({ isSourceView, onToggle }: ViewModeSwitchProps) {
    return (
        <ToolbarSwitch>
            <Slider checked={isSourceView}>
                <Label active={!isSourceView} data-text="Preview" onClick={() => isSourceView && onToggle()}>
                    Preview
                </Label>
                <Label active={isSourceView} data-text="Source" onClick={() => !isSourceView && onToggle()}>
                    Source
                </Label>
            </Slider>
        </ToolbarSwitch>
    );
}
