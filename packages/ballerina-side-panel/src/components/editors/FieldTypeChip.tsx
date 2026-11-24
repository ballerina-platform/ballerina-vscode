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
import { getFieldTypeLabel, InputType } from "@wso2/ballerina-core";
import { sanitizeType } from "./utils";

const Chip = styled.span({
    color: "var(--vscode-descriptionForeground)",
    fontFamily: "var(--vscode-editor-font-family, monospace)",
    fontSize: "11px",
    lineHeight: "16px",
    border: "1px solid color-mix(in srgb, var(--vscode-descriptionForeground) 35%, transparent)",
    borderRadius: "var(--vscode-cornerRadius-medium, 6px)",
    backgroundColor: "color-mix(in srgb, var(--vscode-descriptionForeground) 12%, transparent)",
    padding: "1px 6px",
    marginLeft: "6px",
    // Taller than the label text; without this the label row grows only for fields that have a type.
    marginBlock: "-4px",
    display: "inline-block",
    verticalAlign: "middle",
    userSelect: "none",
    maxWidth: "160px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    textTransform: "none",
    flexShrink: 0,
    transition: "opacity 0.2s ease",
    "&::after": {
        content: "attr(data-type)"
    }
});

interface FieldTypeChipProps {
    types?: InputType[];
}

/**
 * The Ballerina type of a form field, shown as a chip beside its label.
 * Renders nothing when the field carries no Ballerina type.
 *
 * The type is drawn from a data attribute, not a text node, so it stays out of the label's
 * textContent: vscode-text-field takes its aria-label from that text, which would otherwise
 * read "Service Base Path*string".
 */
export function FieldTypeChip({ types }: FieldTypeChipProps) {
    const typeLabel = getFieldTypeLabel(types);
    if (!typeLabel) {
        return null;
    }
    return (
        <Chip className="field-type-chip" data-testid="field-type-chip" data-type={sanitizeType(typeLabel)} title={typeLabel} />
    );
}
