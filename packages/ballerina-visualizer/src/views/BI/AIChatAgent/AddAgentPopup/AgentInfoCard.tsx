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
import { Icon, ThemeColors, Typography } from "@wso2/ui-toolkit";
import { ConnectorIcon } from "@wso2/bi-diagram";

const Card = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    border: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    border-radius: 8px;
    background-color: ${ThemeColors.SURFACE_DIM};
`;

const IconWrap = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    border-radius: 8px;
    background-color: ${ThemeColors.SURFACE_CONTAINER};
    flex-shrink: 0;

    & > img,
    & > svg {
        width: 32px;
        height: 32px;
        object-fit: contain;
    }
`;

const Content = styled.div`
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
`;

const Name = styled(Typography)`
    font-size: 16px;
    font-weight: 600;
    color: ${ThemeColors.ON_SURFACE};
    margin: 0;
`;

const Description = styled.div`
    font-size: 12px;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    margin: 0;
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
`;

interface AgentInfoCardProps {
    label: string;
    description?: string;
    icon?: string;
}

// Header card for the Configure Agent form: agent icon + name + description. Mirrors the connector configure
// popup's card; the icon resolves from the package's Central icon, falling back to the bot icon.
export function AgentInfoCard({ label, description, icon }: AgentInfoCardProps) {
    return (
        <Card>
            <IconWrap>
                <ConnectorIcon
                    url={icon}
                    fallbackIcon={<Icon name="bi-ai-agent" sx={{ fontSize: 28, width: 28, height: 28 }} />}
                />
            </IconWrap>
            <Content>
                <Name variant="h3">{label}</Name>
                {description && <Description>{description}</Description>}
            </Content>
        </Card>
    );
}
