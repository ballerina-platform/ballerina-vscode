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

// The pieces both wizard steps share verbatim. Row, RowIcon, ScrollArea and HeaderArea stay in
// their own files: the two steps differ there on purpose (badge geometry, border strategy, and
// what sits under the header).

import styled from "@emotion/styled";
import { ThemeColors } from "@wso2/ui-toolkit";

/** Panel height minus the view header the wizard renders inside. */
export const CONTENT_HEIGHT = "calc(100vh - 56px)";

export const Container = styled.div`
    display: flex;
    flex-direction: column;
    height: ${CONTENT_HEIGHT};
`;

export const RowText = styled.div`
    min-width: 0;
`;

export const RowChevron = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    padding-top: 2px;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    opacity: 0.7;
`;

export const EmptyState = styled.div`
    padding: 24px 16px;
    font-size: 13px;
    text-align: center;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
`;
