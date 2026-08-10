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

import React from 'react';
import styled from '@emotion/styled';
import { Typography } from '@wso2/ui-toolkit';

const HeaderContainer = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 0;
    padding: 0 16px;
`;

const Title = styled(Typography)`
    margin-bottom: 0;
    color: var(--vscode-foreground);
`;

const Description = styled(Typography)`
    color: var(--vscode-descriptionForeground);
`;

interface FormHeaderProps {
    title?: string;
    subtitle?: string;
}

export function FormHeader({ title, subtitle }: FormHeaderProps) {
    return (
        <HeaderContainer>
            {title && <Title variant="h3">{title}</Title>}
            {subtitle && (
                <Description variant="body2">
                    {subtitle}
                </Description>
            )}
        </HeaderContainer>
    );
}
