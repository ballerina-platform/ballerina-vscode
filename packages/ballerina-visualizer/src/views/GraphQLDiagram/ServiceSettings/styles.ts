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

export const PanelBody = styled.div`
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding: 16px 20px;
`;

export const Section = styled.section`
    display: flex;
    flex-direction: column;
    gap: 8px;
`;

export const SectionTitle = styled.h3`
    margin: 0;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
`;

export const List = styled.ul`
    list-style: none;
    margin: 0;
    padding: 0;
    border: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    border-radius: 6px;
    overflow: hidden;
`;

export const Row = styled.li`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;

    & + & {
        border-top: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    }
`;

export const RowButton = styled.button`
    display: flex;
    flex: 1;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    min-width: 0;
    padding: 0;
    border: none;
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;

    &:focus-visible {
        outline: 1px solid ${ThemeColors.PRIMARY};
        outline-offset: 4px;
    }
`;

export const RowLabel = styled.span`
    font-weight: 600;
    color: ${ThemeColors.ON_SURFACE};
`;

export const RowDetail = styled.span`
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--vscode-editor-font-family);
    font-size: 12px;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
`;

export const RowDescription = styled.span`
    font-size: 12px;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
`;

export const EmptyState = styled.p`
    margin: 0;
    padding: 12px;
    border: 1px dashed ${ThemeColors.OUTLINE_VARIANT};
    border-radius: 6px;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    font-size: 12px;
`;

export const Description = styled.p`
    margin: 0;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    font-size: 12px;
    line-height: 1.5;
`;

export const Actions = styled.div`
    display: flex;
    justify-content: flex-end;
    gap: 8px;
`;

export const InlineActions = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
`;

export const ErrorText = styled.p`
    margin: 0;
    color: ${ThemeColors.ERROR};
    font-size: 12px;
`;

export const WarningBox = styled.div`
    padding: 8px 10px;
    border-left: 3px solid var(--vscode-editorWarning-foreground);
    background-color: ${ThemeColors.SURFACE_CONTAINER};
    font-size: 12px;
    line-height: 1.5;
`;

export const FunctionCard = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    border-radius: 6px;
`;

export const Code = styled.code`
    font-family: var(--vscode-editor-font-family);
    font-size: 12px;
`;

export const LinkButton = styled.button`
    padding: 0;
    border: none;
    background: none;
    color: var(--vscode-textLink-foreground);
    font: inherit;
    font-size: 12px;
    cursor: pointer;

    &:hover {
        text-decoration: underline;
    }
`;
