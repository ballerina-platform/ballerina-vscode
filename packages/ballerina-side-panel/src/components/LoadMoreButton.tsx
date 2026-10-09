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
import { ProgressRing } from "@wso2/ui-toolkit";

const LoadMoreLink = styled.button`
    display: flex;
    width: fit-content;
    align-items: center;
    align-self: center;
    gap: 8px;
    margin: 8px auto 12px;
    padding: 0;
    border: none;
    background: none;
    font: inherit;
    white-space: nowrap;
    color: var(--vscode-textLink-foreground);
    text-decoration: underline;
    cursor: pointer;
    &:hover:not(:disabled) {
        color: var(--vscode-textLink-activeForeground);
    }
    &:focus-visible {
        outline: 1px solid var(--vscode-focusBorder);
        outline-offset: 2px;
    }
    &:disabled {
        color: var(--vscode-disabledForeground);
        cursor: default;
    }
`;

export const LoadMoreButton = ({ label, loading = false, onClick }: {
    label: string;
    loading?: boolean;
    onClick: () => void;
}) => (
    <LoadMoreLink type="button" aria-label={label} aria-busy={loading} disabled={loading}
        onClick={() => { if (!loading) { onClick(); } }}>
        {loading && <ProgressRing sx={{ height: "16px", width: "16px" }} />}
        {loading ? "Loading..." : "Load more"}
    </LoadMoreLink>
);
