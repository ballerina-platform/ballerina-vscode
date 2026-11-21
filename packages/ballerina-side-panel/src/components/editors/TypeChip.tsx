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

import React from "react";
import styled from "@emotion/styled";
import { ThemeColors } from "@wso2/ui-toolkit";

export const Chip = styled.span({
    color: ThemeColors.PRIMARY,
    fontFamily: "monospace",
    fontSize: "10px",
    border: `1px solid ${ThemeColors.PRIMARY}`,
    borderRadius: "999px",
    padding: "1px 6px",
    marginLeft: "5px",
    display: "inline-block",
    verticalAlign: "middle",
    userSelect: "none",
    maxWidth: "120px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    textTransform: "none",
    flexShrink: 0,
    "&::after": {
        content: "attr(data-type)"
    }
});

/**
 * A Ballerina type shown as a chip beside a field label, the way `FieldTypeChip` shows a form field's type.
 *
 * The type is drawn from a data attribute, not a text node, so it stays out of the label's
 * textContent: vscode-text-field takes its aria-label from that text, which would otherwise
 * read "Service Base Path*string".
 */
export function TypeChip({ label }: { label: string }) {
    return <Chip data-testid="field-type-chip" data-type={label} title={label} />;
}
