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
import { getFieldTypeLabel, InputType } from "@wso2/ballerina-core";
import { sanitizeType } from "./utils";
import { Chip } from "./TypeChip";

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
        <Chip data-testid="field-type-chip" data-type={sanitizeType(typeLabel)} title={typeLabel} />
    );
}
