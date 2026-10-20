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
import { AvailableNode, NodeMetadata } from "@wso2/ballerina-core";
import { FormLoadingState } from "@wso2/ballerina-side-panel";
import { ThemeColors, Typography } from "@wso2/ui-toolkit";
import { DownloadIcon } from "../DownloadIcon";
import { LoaderContainer } from "../RelativeLoader/styles";

// Matches RelativeLoader's message so the two loaders look alike.
const Message = styled(Typography)`
    margin: 16px 0 0;
    max-width: 300px;
    font-size: 14px;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
`;

export const isPullRequired = (node?: AvailableNode) => !!(node?.metadata?.data as NodeMetadata)?.pullRequired;

export function PackageDownloadState({ label }: { label: string }) {
    return (
        <LoaderContainer role="status">
            <DownloadIcon color={ThemeColors.PRIMARY} sx={{ width: 32, height: 32 }} />
            <Message variant="body2">Downloading the required package for {label}…</Message>
        </LoaderContainer>
    );
}

interface ComponentFormLoaderProps {
    node?: AvailableNode;
}

// The form's own loading view, so it carries on into the form's initial load without a visible switch.
export function ComponentFormLoader({ node }: ComponentFormLoaderProps) {
    return isPullRequired(node) ? <PackageDownloadState label={node.metadata.label} /> : <FormLoadingState />;
}
