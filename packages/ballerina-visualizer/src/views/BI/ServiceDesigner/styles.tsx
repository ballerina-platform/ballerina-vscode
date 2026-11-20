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
// tslint:disable: no-explicit-any
import { css, cx } from "@emotion/css";
import { CSSObject } from "@emotion/react";
import styled from "@emotion/styled";
import { FIELD_RADIUS } from "@wso2/ballerina-side-panel";

export const EditorContainer = styled.div<CSSObject>`
    display: flex;
    margin: 10px 0;
    flex-direction: column;
    border-radius: 5px;
    padding: 10px;
    border: 1px solid var(--vscode-dropdown-border);
    & .side-panel-body {
        padding: unset;
    }
`;

export const EditorContent = styled.div<CSSObject>`
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    padding-right: 16px;
    gap: 10px;
`;

export const EditorContentColumn = styled.div<CSSObject>`
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 20px 0;
    gap: 10px;
`;

export const ContentSection = styled.div<CSSObject>`
    display: flex;
    flex-direction: row;
    width: 100%;
    justify-content: space-between;
    ${(props: any) => props.justifyEnd && `
        justify-content: flex-end;
        margin-right: 20px;
    `}
`;

export const EditIconWrapper = styled.div<CSSObject>`
    cursor: pointer;
    height: 14px;
    width: 14px;
    margin-top: 16px;
    margin-bottom: 13px;
    color: var(--vscode-statusBarItem-remoteBackground);
`;

export const DeleteIconWrapper = styled.div<CSSObject>`
    cursor: pointer;
    height: 14px;
    width: 14px;
    margin-top: 16px;
    margin-bottom: 13px;
    margin-left: 10px;
    color: var(--vscode-notificationsErrorIcon-foreground);
`;

export const IconWrapper = styled.div<CSSObject>`
    cursor: pointer;
    height: 14px;
    width: 14px;
    margin-top: 16px;
    margin-bottom: 13px;
    margin-left: 10px;
`;

export const IconTextWrapper = styled.div<CSSObject>`
    display: flex;
    justify-content: flex-start;
    align-items: center;
    flex-direction: row;
    width: 225px;
    cursor: pointer;
    background-color: var(--vscode-inputValidation-infoBackground);
    height: 100%;
`;

// eslint-disable-next-line react-refresh/only-export-components
export const headerLabelStyles = cx(css`
    display: flex;
    align-items: center;
    cursor: pointer;
    margin-left: 12px;
`);

export const OptionLabel = styled.div<CSSObject>`
    font-size: 12px;
    line-height: 14px;
    margin-left: 5px;
`;

// eslint-disable-next-line react-refresh/only-export-components
export const disabledHeaderLabel = cx(css`
    display: flex;
    align-items: center;
    margin-left: 12px;
`);

export const HeaderLabel = styled.div<CSSObject>`
    display: flex;
    background: var(--vscode-editor-background);
    border: 1px solid ${(props: { haveErrors: boolean; }) => props.haveErrors ? "red" : "var(--vscode-dropdown-border)"};
    border-radius: ${FIELD_RADIUS};
    overflow: hidden;
    margin-top: 8px;
    display: flex;
    width: 100%;
    height: 32px;
    align-items: center;
`;

export const ActionIconWrapper = styled.div<CSSObject>`
    display: flex;
    align-items: center;
    cursor: pointer;
    height: 16px;
    margin-right: 10px;
`;

export const ParamContainer = styled.div<CSSObject>`
    display: flex;
    align-items: center;
`;

export const ParamDescription = styled.div<CSSObject>`
    display: flex;
    padding: 10px;
`;
