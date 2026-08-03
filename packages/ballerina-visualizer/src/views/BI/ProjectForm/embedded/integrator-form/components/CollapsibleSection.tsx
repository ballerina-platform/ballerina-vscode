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

import { ReactNode } from "react";
import { Codicon } from "@wso2/ui-toolkit";
import styled from "@emotion/styled";
import {
    CollapsibleSectionWrapper,
    CollapsibleHeader,
    CollapsibleContent,
    HeaderLeft,
    HeaderTitle,
    HeaderSubtitle,
    ChevronIcon,
} from "../styles";

const ErrorDot = styled.span`
    display: inline-block;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background-color: var(--vscode-inputValidation-errorBorder, #f14c4c);
    margin-left: 6px;
    flex-shrink: 0;
    align-self: center;
`;

export interface CollapsibleSectionProps {
    /** Whether the section is expanded */
    isExpanded: boolean;
    /** Callback when the section is toggled */
    onToggle: () => void;
    /** The icon name to display in the header */
    icon: string;
    /** The title of the section */
    title: string;
    /** Optional subtitle to show when collapsed (e.g., summary info) */
    subtitle?: string;
    /** Whether the section contains validation errors */
    hasError?: boolean;
    /** The content to render inside the collapsible section */
    children: ReactNode;
}

export function CollapsibleSection({
    isExpanded,
    onToggle,
    icon,
    title,
    subtitle,
    hasError,
    children,
}: CollapsibleSectionProps) {
    return (
        <CollapsibleSectionWrapper isExpanded={isExpanded}>
            <CollapsibleHeader isExpanded={isExpanded} onClick={onToggle}>
                <HeaderLeft>
                    <Codicon name={icon} iconSx={{ fontSize: 14 }} />
                    <HeaderTitle>
                        {title}
                        {!isExpanded && subtitle && (
                            <HeaderSubtitle>— {subtitle}</HeaderSubtitle>
                        )}
                    </HeaderTitle>
                    {hasError && <ErrorDot />}
                </HeaderLeft>
                <ChevronIcon isExpanded={isExpanded}>
                    <Codicon name="chevron-down" iconSx={{ fontSize: 14 }} />
                </ChevronIcon>
            </CollapsibleHeader>

            <CollapsibleContent isExpanded={isExpanded}>
                {children}
            </CollapsibleContent>
        </CollapsibleSectionWrapper>
    );
}
