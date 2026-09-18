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

import { TokenType, DocumentType } from "./types";
import styled from "@emotion/styled";

export const BASE_CHIP_STYLES = {
    borderRadius: "4px",
    display: "inline-flex",
    alignItems: "center",
    fontSize: "12px",
    minHeight: "20px",
    outline: "none",
    verticalAlign: "middle",
    userSelect: "none",
    margin: "2px 0px",
    padding: "2px 8px",
    cursor: "pointer",
    minWidth: "25px",
    transition: "all 0.2s ease",
    gap: "4px",
} as const;

export const BASE_ICON_STYLES = {
    display: "flex",
    fontSize: "16px"
} as const;

export const CHIP_TEXT_STYLES = {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap"
} as const;

export const TOKEN_TYPE_COLORS: Partial<Record<TokenType, { background: string; border: string, icon: string }>> = {
    [TokenType.VARIABLE]: {
        background: "rgba(59, 130, 246, 0.15)",
        border: "rgba(0, 122, 204, 0.4)",
        icon: "rgba(59, 130, 246, 0.9)"
    },
    [TokenType.PROPERTY]: {
        background: "rgba(59, 130, 246, 0.15)",
        border: "rgba(59, 130, 246, 0.4)",
        icon: "rgba(59, 130, 246, 0.9)"
    },
    [TokenType.PARAMETER]: {
        background: "rgba(0, 204, 109, 0.15)",
        border: "rgba(0, 204, 109, 0.4)",
        icon: "rgba(0, 134, 71, 0.9)"
    },
    [TokenType.DOCUMENT]: {
        background: "rgba(128, 59, 246, 0.15)",
        border: "rgba(168, 59, 246, 0.4)",
        icon: "rgba(166, 89, 255, 0.9)"
    }
};

export const DEFAULT_CHIP_COLOR = {
    background: "rgba(59, 130, 246, 0.15)",
    border: "rgba(59, 130, 246, 0.4)",
    icon: "rgba(59, 130, 246, 0.9)"
};

export const DOCUMENT_ICON_CLASS_MAP: Record<DocumentType, string> = {
    'ImageDocument': 'fw-bi-image',
    'FileDocument': 'fw-bi-doc',
    'AudioDocument': 'fw-bi-audio'
};

export const STANDARD_ICON_CLASS_MAP: Partial<Record<TokenType, string>> = {
    [TokenType.VARIABLE]: 'fw-bi-variable',
    [TokenType.FUNCTION]: 'fw-bi-function',
    [TokenType.PARAMETER]: 'fw-bi-variable',
    [TokenType.PROPERTY]: 'fw-bi-variable'
};

export const getTokenIconClass = (tokenType: TokenType, subType?: string): string => {
    if (tokenType === TokenType.DOCUMENT && subType) {
        return DOCUMENT_ICON_CLASS_MAP[subType] || '';
    }
    return STANDARD_ICON_CLASS_MAP[tokenType] || '';
};

export const getTokenTypeColor = (tokenType: TokenType): { background: string; border: string; icon: string } => {
    return TOKEN_TYPE_COLORS[tokenType] || DEFAULT_CHIP_COLOR;
};

export const shouldRenderAsEmptySpace = (tokenType: TokenType, content: string): boolean => {
    return tokenType === TokenType.PARAMETER && /^\$\d+$/.test(content);
};

// Value-holding chips (function arguments, literal values) are click-to-edit: clicking one
// exposes its underlying text as a normal editable region instead of the read-only chip.
// Reference chips (variables, properties, documents) stay click-to-select/replace, since
// they're normally set by picking a new one from the helper pane rather than free-typed.
export const isEditableValueChip = (tokenType: TokenType): boolean => {
    return tokenType === TokenType.PARAMETER || tokenType === TokenType.VALUE;
};

export const getChipDisplayContent = (tokenType: TokenType, content: string): string => {
    return shouldRenderAsEmptySpace(tokenType, content) ? ' ' : content;
};

export const BaseChip = styled('span')(BASE_CHIP_STYLES);

export const StandardChip = styled(BaseChip)<{ chipType: TokenType }>((props) => ({
    background: getTokenTypeColor(props.chipType).background,
    border: `1px solid ${getTokenTypeColor(props.chipType).border}`,
    padding: BASE_CHIP_STYLES.padding,
    minWidth: BASE_CHIP_STYLES.minWidth,
    transition: BASE_CHIP_STYLES.transition,
    display: BASE_CHIP_STYLES.display,
}));

export const BaseIcon = styled("i")(BASE_ICON_STYLES);
export const StandardIcon = styled(BaseIcon)<{ chipType: TokenType }>((props) => ({
    color: getTokenTypeColor(props.chipType).icon
}));

export const ChipText = styled.span(CHIP_TEXT_STYLES);
