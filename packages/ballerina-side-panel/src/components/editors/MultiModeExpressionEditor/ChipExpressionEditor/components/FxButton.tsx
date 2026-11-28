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

import { ThemeColors, Tooltip } from "@wso2/ui-toolkit";
import React from "react";
import styled from "@emotion/styled";
import { FIELD_RADIUS } from "../constants";

// The theme's primary colour mixed toward the input background, the old muted look without dimming the glyph.
export const Ribbon = styled.div`
    background-color: color-mix(in srgb, ${ThemeColors.PRIMARY} 60%, var(--vscode-input-background));
    color: ${ThemeColors.ON_PRIMARY};
    width: 28px;
    height: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
    border: 1px solid var(--field-border, var(--vscode-dropdown-border));
    border-right: none;
    border-top-left-radius: ${FIELD_RADIUS};
    border-bottom-left-radius: ${FIELD_RADIUS};
    cursor: pointer;
    position: relative;
`;

const FXButton = ({ onClick }: { onClick?: () => void }) => {
    return (
        <Tooltip content="Browse Values (Ctrl+/)" containerSx={{ cursor: 'default' }}>
            <Ribbon onClick={onClick}>
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24">
                    <path
                        fill="currentColor"
                        d="M12.42 5.29c-1.1-.1-2.07.71-2.17 1.82L10 10h2.82v2h-3l-.44 5.07A4.001 4.001 0 0 1 2 18.83l1.5-1.5c.33 1.05 1.46 1.64 2.5 1.3c.78-.24 1.33-.93 1.4-1.74L7.82 12h-3v-2H8l.27-3.07a4.01 4.01 0 0 1 4.33-3.65c1.26.11 2.4.81 3.06 1.89l-1.5 1.5c-.25-.77-.93-1.31-1.74-1.38M22 13.65l-1.41-1.41l-2.83 2.83l-2.83-2.83l-1.43 1.41l2.85 2.85l-2.85 2.81l1.43 1.41l2.83-2.83l2.83 2.83L22 19.31l-2.83-2.81z" />
                </svg>
            </Ribbon>
        </Tooltip>
    );
};

export default FXButton;
