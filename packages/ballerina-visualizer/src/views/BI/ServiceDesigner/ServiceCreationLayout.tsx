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

import styled from "@emotion/styled";
import { ThemeColors, Typography } from "@wso2/ui-toolkit";

// Shared between ServiceCreationView's steps (the plain form and the MCP OpenAPI import
// wizard) so every step lines up on the same CONTENT_INSET.
export const CONTENT_INSET = 16;
export const NESTED_FORM_INSET = 5;
export const BODY_FONT_SIZE = "13px";

export const StatusCard = styled.div`
    margin: 16px 16px 0 16px;
    padding: 16px;
    border-radius: 8px;
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 16px;

    & > svg {
        font-size: 24px;
        color: ${ThemeColors.ON_SURFACE};
    }
`;

export const StatusText = styled(Typography)`
    color: ${ThemeColors.ON_SURFACE};
`;

// FormHeader ships its own inset and a 14px (body2) subtitle; normalise both.
export const HeaderWrapper = styled.div`
    padding: 0 ${CONTENT_INSET}px;
    & > div { padding: 0; }
    & p { font-size: ${BODY_FONT_SIZE}; }
`;

// The nested ArtifactForm already pads its own content by NESTED_FORM_INSET, so it only
// needs the difference to line up with HeaderWrapper.
export const NestedFormWrapper = styled.div`
    padding: 0 ${CONTENT_INSET - NESTED_FORM_INSET}px;
`;
