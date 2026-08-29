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
import { ReactNode } from "react";

interface CardOption {
    value: string;
    title: string;
    description: string;
    icon: ReactNode;
}

interface CardSelectorProps {
    options: CardOption[];
    value: string;
    onChange: (value: string) => void;
    title?: string;
}

const Container = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 4px;
`;

const Title = styled.label`
    font-size: 13px;
    color: var(--vscode-foreground);
    margin: 0;
    margin-bottom: 4px;
`;

const CardsContainer = styled.div`
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;

    @media (max-width: 520px) {
        grid-template-columns: 1fr;
    }
`;

const Card = styled.div<{ selected: boolean }>`
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
    box-sizing: border-box;
    padding: 20px;
    border: 1px solid ${(props: { selected: boolean; }) => props.selected ? 'var(--vscode-button-background)' : 'var(--vscode-panel-border)'};
    border-radius: 8px;
    background-color: ${(props: { selected: boolean; }) => props.selected ? 'color-mix(in srgb, var(--vscode-button-background) 5%, transparent)' : 'transparent'};
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover {
        border-color: var(--vscode-button-background);
        background-color: ${(props: { selected: boolean; }) => props.selected ? 'color-mix(in srgb, var(--vscode-button-background) 7%, transparent)' : 'var(--vscode-list-hoverBackground)'};
    }

    &:focus-within {
        outline: 1px solid var(--vscode-contrastActiveBorder);
        outline-offset: 2px;
    }
`;

const CardHeader = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
`;

const IconTitleWrapper = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
`;

const IconWrapper = styled.div<{ selected: boolean }>`
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 8px;
    border-radius: 8px;
    background-color: ${(props: { selected: boolean; }) => props.selected ? 'var(--vscode-button-background)' : 'var(--vscode-editorWidget-background)'};
    color: ${(props: { selected: boolean; }) => props.selected ? 'var(--vscode-button-foreground)' : 'var(--vscode-description-foreground)'};
    flex-shrink: 0;
`;

const CardTitle = styled.h4`
    font-size: 13px;
    font-weight: 600;
    color: var(--vscode-foreground);
    margin: 0;
`;

const RadioButton = styled.input`
    width: 16px;
    height: 16px;
    cursor: pointer;
    accent-color: var(--vscode-contrastActiveBorder, #1976d2);
`;

const Description = styled.p`
    font-size: 13px;
    color: var(--vscode-descriptionForeground);
    margin: 0;
`;

export function CardSelector({ options, value, onChange, title }: CardSelectorProps) {
    return (
        <Container>
            {title && <Title>{title}</Title>}
            <CardsContainer>
                {options.map((option) => {
                    const isSelected = value === option.value;
                    return (
                        <Card
                            key={option.value}
                            selected={isSelected}
                            onClick={() => onChange(option.value)}
                        >
                            <CardHeader>
                                <IconTitleWrapper>
                                    <IconWrapper selected={isSelected}>
                                        {option.icon}
                                    </IconWrapper>
                                    <CardTitle>{option.title}</CardTitle>
                                </IconTitleWrapper>
                                <RadioButton
                                    type="radio"
                                    name="card-selector"
                                    value={option.value}
                                    checked={isSelected}
                                    onChange={() => onChange(option.value)}
                                    onClick={(e) => e.stopPropagation()}
                                />
                            </CardHeader>
                            <Description>{option.description}</Description>
                        </Card>
                    );
                })}
            </CardsContainer>
        </Container>
    );
}
