/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
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

import { css } from "@emotion/react";
import { ThemeColors } from "@wso2/ui-toolkit";

// A left border and indent that marks a field as belonging to the one above it. Used by both
// Form's IndentedRow and CheckBoxConditionalEditor's revealed sub-field, so they stay visually
// identical from one definition instead of two copies that could drift apart over time. This
// file does not import from Form/index.tsx or the editors folder, so both of those files can
// import from here without creating a circular import.
export const indentedFieldStyles = css`
    width: calc(100% - 14px);
    margin-left: 14px;
    padding-left: 10px;
    border-left: 2px solid ${ThemeColors.OUTLINE_VARIANT};
    box-sizing: border-box;
`;
