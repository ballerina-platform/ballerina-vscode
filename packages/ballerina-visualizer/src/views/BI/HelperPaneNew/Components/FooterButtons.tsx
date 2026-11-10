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

import { Icon, ThemeColors } from "@wso2/ui-toolkit";
import styled from '@emotion/styled';

const FooterContainer = styled.div`
    display: flex;
    justify-content: left;
    align-items: center;
    padding: 8px 12px;
    margin-inline: 4px;
    transition: background-color 0.2s ease;
    border-radius: 6px;
    height: 36px;
    cursor: pointer;
    
    &:hover {
        background-color: ${ThemeColors.SURFACE_DIM_2};
        outline: 1px solid var(--dropdown-border);
        outline-offset: -1px;
    }
`;

const InvisibleButton = styled.button`
    background: none;
    border: none;
    padding: 0;
    margin: 0;
    text-align: inherit;
    color: inherit;
    font: inherit;
    cursor: pointer;
    outline: none;
    box-shadow: none;
    appearance: none;
    display: inline-flex;
    align-items: center;
`;

type FooterButtonProps = {
    title: string;
    onClick: () => void;
    startIcon?: string;
    sx?: React.CSSProperties;
    disabled?:boolean;
}

const FooterButtons = (props: FooterButtonProps) => {
    const { onClick, startIcon, title, sx, disabled } = props;
    // The row around the button takes clicks too, so it has to be disabled with it.
    return (
        <FooterContainer
            style={disabled ? { ...sx, cursor: "default" } : sx}
            aria-disabled={disabled || undefined}
            onClick={disabled ? undefined : onClick}
        >
            <InvisibleButton
            disabled={disabled}
            style={disabled ? { cursor: "default" } : undefined}
            onClick={(e) => {
                e.stopPropagation();
                onClick?.();
            }}>
                <Icon name={startIcon || "bi-plus"} sx={{color: ThemeColors.PRIMARY, fontSize: "16px"}}/>
                <span style={{color: ThemeColors.PRIMARY, marginLeft: "10px" }}>{title}</span>
            </InvisibleButton>
        </FooterContainer>
    )
}

export default FooterButtons;
