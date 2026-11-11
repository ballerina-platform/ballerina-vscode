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

import styled from "@emotion/styled";
import { Button, Codicon, Overlay, ThemeColors, Typography } from "@wso2/ui-toolkit";

export const PopupOverlay = styled(Overlay)`
    z-index: 1999;
`;

export const PopupContainer = styled.div`
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 80%;
    max-width: 800px;
    height: 80vh;
    max-height: 800px;
    min-height: 480px;
    z-index: 2000;
    background-color: var(--vscode-editorWidget-background);
    border-radius: 10px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
`;

export const PopupHeader = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px;
    gap: 16px;
    border-bottom: 1px solid ${ThemeColors.OUTLINE_VARIANT};
`;

export const BackButton = styled(Button)`
    min-width: auto;
    padding: 4px;
`;

export const HeaderTitleContainer = styled.div`
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
`;

export const PopupTitle = styled(Typography)`
    font-size: 20px;
    font-weight: 600;
    color: ${ThemeColors.ON_SURFACE};
    margin: 0;
`;

export const PopupSubtitle = styled(Typography)`
    font-size: 12px;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    margin: 0;
`;

export const CloseButton = styled(Button)`
    min-width: auto;
    padding: 4px;
`;

export const PopupContent = styled.div`
    flex: 1;
    overflow-y: auto;
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
`;

export const FooterContainer = styled.div`
    position: sticky;
    bottom: 0;
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 10;
`;

export const ActionButton = styled(Button)`
    width: 100% !important;
    min-width: 0 !important;
    display: flex !important;
    justify-content: center;
    align-items: center;
`;

export const ConnectorInfoContainer = styled.div`
    display: flex;
    flex-direction: column;
    gap: 16px;
    width: 100%;
    height: 100%;
    min-height: 0;
`;

export const ConnectorContentContainer = styled.div<{ hasFooterButton?: boolean }>`
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: auto;
    padding-bottom: ${(props: { hasFooterButton?: boolean }) => props.hasFooterButton ? "0" : "24px"};
    min-height: 0;
`;

export const ConnectorProgressContainer = styled.p`
    display: flex;
    padding: 50px;
    justify-content: center;
    align-items: center;
`;

export const PopupFooter = styled.div`
    padding: 16px 20px;
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    border-top: 1px solid ${ThemeColors.OUTLINE_VARIANT};
`;

export const FormSection = styled.div`
    display: flex;
    flex-direction: column;
    gap: 16px;
`;

export const FormField = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
`;

export const TablesGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
    position: relative;
`;

export const TableCard = styled.div<{ selected?: boolean }>`
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    border: 1px solid ${(props: { selected?: boolean }) => (props.selected ? ThemeColors.PRIMARY : ThemeColors.OUTLINE_VARIANT)};
    border-radius: 8px;
    background-color: ${(props: { selected?: boolean }) => (props.selected ? ThemeColors.PRIMARY_CONTAINER : ThemeColors.SURFACE_DIM)};
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover {
        border-color: ${ThemeColors.PRIMARY};
        background-color: ${ThemeColors.PRIMARY_CONTAINER};
    }
`;

export const TableCheckbox = styled.input`
    width: 18px;
    height: 18px;
    cursor: pointer;
`;

export const TableName = styled(Typography)`
    font-size: 14px;
    font-weight: 500;
    color: ${ThemeColors.ON_SURFACE};
    margin: 0;
`;

export const ErrorContainer = styled.div`
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 16px;
    border-radius: 8px;
    background-color: ${ThemeColors.SURFACE_DIM};
    border: 1px solid ${ThemeColors.ERROR};
`;

export const ErrorHeader = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
`;

export const ErrorTitle = styled(Typography)`
    font-size: 16px;
    font-weight: 600;
    color: ${ThemeColors.ERROR};
    margin: 0;
`;

export const ErrorDetailsSection = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
`;

export const ErrorDetailsHeader = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    user-select: none;

    &:hover {
        opacity: 0.8;
    }
`;

export const ErrorDetailsChevronIcon = styled(Codicon)`
    font-size: 12px;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
`;

export const ErrorDetailsContent = styled.div<{ expanded: boolean }>`
    max-height: ${(props: { expanded: boolean }) => (props.expanded ? "500px" : "0")};
    overflow: hidden;
    transition: max-height 0.3s ease;
    padding-left: 20px;
`;

export const ErrorDetailsText = styled(Typography)`
    font-size: 12px;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    font-family: monospace;
    white-space: pre-wrap;
    word-break: break-word;
    margin: 0;
    padding: 8px;
    background-color: ${ThemeColors.SURFACE_CONTAINER};
    border-radius: 4px;
    border: 1px solid ${ThemeColors.OUTLINE_VARIANT};
`;
