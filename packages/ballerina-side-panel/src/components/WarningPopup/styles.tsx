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

import styled from "@emotion/styled";
import { ThemeColors } from '@wso2/ui-toolkit';
import { FIELD_RADIUS } from "../editors/MultiModeExpressionEditor/ChipExpressionEditor/constants";

export const ButtonContainer = styled.div({
    marginTop: '20px',
    display: 'flex',
    justifyContent: 'center',
    gap: '10px'
});

export const StyledButton = styled.button({
    background: ThemeColors.SURFACE_DIM,
    color: ThemeColors.ON_SURFACE,
    border: `1px solid ${ThemeColors.OUTLINE_VARIANT}`,
    borderRadius: '2px',
    padding: '8px 16px',
    cursor: 'pointer',
    transition: 'all 0.1s ease',
    
    '&:hover': {
        background: ThemeColors.SURFACE_CONTAINER,
        borderColor: ThemeColors.OUTLINE
    }
});

export const ModalBackdrop = styled.div({
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2000
});

export const ModalContent = styled.div<{ maxWidth: string }>(({ maxWidth }) => ({
    backgroundColor: ThemeColors.SURFACE,
    color: ThemeColors.ON_SURFACE,
    padding: '20px',
    border: `1px solid ${ThemeColors.OUTLINE_VARIANT}`,
    borderRadius: FIELD_RADIUS,
    boxShadow: '0 4px 24px rgba(0, 0, 0, 0.4)',
    width: maxWidth,
    textAlign: 'center',
    zIndex: 2001
}));
