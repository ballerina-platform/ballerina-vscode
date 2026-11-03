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
import { ProgressRing, ThemeColors, Typography } from "@wso2/ui-toolkit";

const Row = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 12px 24px;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
`;

export function AiCatalogRefreshIndicator() {
    return (
        <Row role="status">
            <ProgressRing sx={{ height: 14, width: 14 }} />
            <Typography variant="body3">Checking for more options…</Typography>
        </Row>
    );
}
