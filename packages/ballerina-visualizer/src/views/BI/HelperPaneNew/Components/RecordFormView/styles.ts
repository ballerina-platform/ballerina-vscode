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
import { ThemeColors } from "@wso2/ui-toolkit";

export const FieldList = styled.div({
    display: "flex",
    flexDirection: "column",
    gap: "18px",
    minWidth: 0,
});

/** One field: label, description and mode switch, input, and anything under it. One per row. */
export const FieldBlock = styled.div({
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    minWidth: 0,
});

export const FieldLabel = styled.div({
    display: "flex",
    alignItems: "center",
    color: "var(--vscode-foreground)",
    fontWeight: 500,
    minWidth: 0,
});

export const RequiredMark = styled.span({
    color: "var(--vscode-foreground)",
});

export const FieldRow = styled.div({
    display: "flex",
    alignItems: "center",
    gap: "12px",
    minWidth: 0,
});

export const FieldDescription = styled.span({
    flex: 1,
    minWidth: 0,
    color: ThemeColors.ON_SURFACE_VARIANT,
    fontSize: "12px",
});

export const SectionHeader = styled.div({
    display: "flex",
    alignItems: "center",
    gap: "6px",
    minWidth: 0,
});

export const SectionTitle = styled.span({
    fontWeight: 600,
    color: "var(--vscode-foreground)",
});

/** A section's fields sit beside a guide line, indented a little, as the tree on the left draws them. */
export const SectionBody = styled.div({
    display: "flex",
    flexDirection: "column",
    gap: "18px",
    marginLeft: "7px",
    padding: "4px 0 4px 16px",
    borderLeft: `1px solid ${ThemeColors.OUTLINE_VARIANT}`,
    minWidth: 0,
});

export const ToggleButton = styled.button({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "16px",
    padding: 0,
    border: 0,
    background: "transparent",
    color: ThemeColors.ON_SURFACE_VARIANT,
    cursor: "pointer",
});

export const ItemCard = styled.div({
    border: `1px solid ${ThemeColors.OUTLINE_VARIANT}`,
    borderRadius: "4px",
    minWidth: 0,
});

export const CardHeader = styled.div({
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "4px 8px 4px 10px",
    background: ThemeColors.SURFACE_CONTAINER,
    fontSize: "12px",
});

export const CardBody = styled.div({
    display: "flex",
    flexDirection: "column",
    gap: "14px",
    padding: "10px 12px",
});

export const ItemRow = styled.div({
    display: "flex",
    alignItems: "center",
    gap: "6px",
    minWidth: 0,
});

export const RemoveButton = styled.button({
    display: "inline-flex",
    alignItems: "center",
    padding: "2px",
    border: 0,
    background: "transparent",
    color: ThemeColors.ON_SURFACE_VARIANT,
    cursor: "pointer",
});

export const LinkButton = styled.button({
    alignSelf: "flex-start",
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    padding: 0,
    border: 0,
    background: "transparent",
    color: "var(--vscode-textLink-foreground)",
    cursor: "pointer",
    font: "inherit",
});

export const EmptyState = styled.div({
    padding: "24px 12px",
    textAlign: "center",
    color: ThemeColors.ON_SURFACE_VARIANT,
    border: `1px dashed ${ThemeColors.OUTLINE_VARIANT}`,
    borderRadius: "4px",
});
