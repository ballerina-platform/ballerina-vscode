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

import React from "react";
import { ThemeColors, Tooltip } from "@wso2/ui-toolkit";
import styled from "@emotion/styled";
import { BetaSVG } from "../../views/Connectors/Marketplace/BetaSVG";

const Card = styled.div<{ active?: boolean; appearance?: ButtonCardAppearance, disabled?: boolean, sx?: any }>`
    gap: 16px;
    max-width: 42rem;
    padding: 12px;
    border-radius: 4px;
    border: 1px solid
        ${(props: { active: boolean }) => (props.active ? ThemeColors.PRIMARY : ThemeColors.OUTLINE_VARIANT)};
    background-color: ${(props: { active: boolean }) =>
        props.active ? ThemeColors.PRIMARY_CONTAINER : ThemeColors.SURFACE_DIM};
    cursor: ${(props: { disabled: boolean }) => (props.disabled ? 'not-allowed' : 'pointer')};;
    &:hover {
        background-color: ${ThemeColors.PRIMARY_CONTAINER};
        border: 1px solid ${ThemeColors.HIGHLIGHT};
    };
    &:focus-visible {
        outline: 1px solid var(--vscode-focusBorder);
        outline-offset: 1px;
    };
`;

const CardContainer = styled.div<{ active?: boolean }>`
    display: flex;
    gap: 12px;
    align-items: center;
`;

const Text = styled.p`
    font-size: 13px;
    color: ${ThemeColors.ON_SURFACE};
    margin: 0;
`;

interface TextProps {
    truncate?: boolean;
}

const Title = styled(Text) <TextProps>`
    font-weight: bold;
    white-space: ${(props: TextProps) => (props.truncate ? "nowrap" : "normal")};
    overflow: ${(props: TextProps) => (props.truncate ? "hidden" : "visible")};
    text-overflow: ${(props: TextProps) => (props.truncate ? "ellipsis" : "clip")};
    display: flex;
    align-items: center;
    gap: 8px;
`;

const Caption = styled(Text)`
    font-size: 11px;
    font-weight: bold;
    opacity: 0.6;
`;

const Description = styled(Text) <TextProps>`
    opacity: 0.8;
    margin-top: 4px;
    overflow: hidden;
    display: ${(props: TextProps) => (props.truncate ? "block" : "-webkit-box")};
    white-space: ${(props: TextProps) => (props.truncate ? "nowrap" : "normal")};
    text-overflow: ${(props: TextProps) => (props.truncate ? "ellipsis" : "clip")};
    ${(props: TextProps) =>
        !props.truncate &&
        `
        -webkit-line-clamp: 1;
        -webkit-box-orient: vertical;
    `}
`;

const ContentContainer = styled.div`
    flex: 1;
    overflow: hidden;
`;

const IconContainer = styled.div`
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    max-width: 24px;
    > div:first-child {
        width: 24px;
        height: 24px;
        font-size: 24px;
    }
`;

export type ButtonCardAppearance = "large" | "small";

export interface ButtonCardProps {
    id?: string;
    title: string;
    caption?: string;
    description?: string;
    icon?: React.ReactNode;
    active?: boolean;
    appearance?: ButtonCardAppearance;
    truncate?: boolean;
    onClick: () => void;
    disabled?: boolean;
    tooltip?: string;
    isBeta?: boolean;
}

export function ButtonCard(props: ButtonCardProps) {
    const {
        title,
        caption,
        description,
        icon,
        active,
        appearance = "large",
        truncate: explicitTruncate,
        onClick,
        disabled,
        tooltip,
        isBeta
    } = props;

    // Apply truncation by default for small appearance if not explicitly set
    const truncate = explicitTruncate !== undefined ? explicitTruncate : appearance === "small";

    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (disabled) {
            return;
        }
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onClick();
        }
    };

    return (
        <Tooltip content={tooltip}>
            <Card
                id={props.id}
                data-testid={`function-card-${title}`}
                onClick={disabled ? undefined : onClick}
                onKeyDown={handleKeyDown}
                active={active ?? false}
                appearance={appearance}
                disabled={disabled}
                role="button"
                tabIndex={disabled ? -1 : 0}
                aria-pressed={active ?? false}
            >
                <CardContainer>
                    {icon && <IconContainer>{icon}</IconContainer>}
                    <ContentContainer>
                        {caption && <Caption>{caption}</Caption>}
                        <Title
                            truncate={truncate}
                        >
                            {title}
                            {isBeta && <BetaSVG />}
                        </Title>
                        {description && <Description truncate={truncate}>{description}</Description>}
                    </ContentContainer>
                </CardContainer>
            </Card>
        </Tooltip>
    );
}

export default ButtonCard;
