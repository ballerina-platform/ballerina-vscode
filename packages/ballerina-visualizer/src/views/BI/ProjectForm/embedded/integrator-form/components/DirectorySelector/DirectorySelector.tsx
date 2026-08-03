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
import { VSCodeButton } from '@vscode/webview-ui-toolkit/react';
import { ErrorBanner, RequiredFormInput } from '@wso2/ui-toolkit';

export interface DirectorySelectorProps {
    id?: string;
    label?: string;
    placeholder?: string;
    selectedPath?: string;
    required?: boolean;
    description?: string;
    errorMsg?: string;
    sx?: any;
    'data-testid'?: string;
    onSelect: () => void;
    onChange?: (value: string) => void;
    onBlur?: () => void;
}

interface ContainerProps {
    sx?: any;
}

const Container = styled.div<ContainerProps>`
    display: flex;
    flex-direction: column;
    width: 100%;
    ${(props: ContainerProps) => props.sx};
`;

const LabelContainer = styled.div`
    display: flex;
    flex-direction: row;
    margin-bottom: 4px;
`;

const Label = styled.label`
    color: var(--vscode-editor-foreground);
`;

const Description = styled.div`
    color: var(--vscode-list-deemphasizedForeground);
    font-size: 12px;
    margin-bottom: 8px;
    text-align: left;
`;

const InputRow = styled.div`
    display: flex;
    flex-direction: row;
    align-items: stretch;
    gap: 8px;
    width: 100%;
`;

const InputWrapper = styled.div`
    flex: 1;
    position: relative;
    display: flex;
    align-items: center;
`;

const Input = styled.input`
    width: 100%;
    height: 28px;
    padding: 8px 12px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-dropdown-border);
    border-radius: 2px;
    font-family: var(--vscode-font-family);
    font-size: 13px;
    outline: none;
    cursor: text;
    box-sizing: border-box;

    &::placeholder {
        color: var(--vscode-input-placeholderForeground);
    }

    &:focus {
        border-color: var(--vscode-focusBorder);
        outline: 1px solid var(--vscode-focusBorder);
        outline-offset: -1px;
    }

    &:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }
`;

const BrowseButton = styled(VSCodeButton)`
    height: 28px;
    white-space: nowrap;
    display: flex;
    align-items: center;
    gap: 6px;
`;

export const DirectorySelector: React.FC<DirectorySelectorProps> = props => {
    const {
        id,
        label,
        placeholder = "Enter or browse to select a folder...",
        selectedPath,
        required,
        description,
        errorMsg,
        sx,
        'data-testid': dataTestId,
        onSelect,
        onChange,
        onBlur,
    } = props;

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (onChange) {
            onChange(e.target.value);
        }
    };

    const handleInputBlur = () => {
        if (onBlur) {
            onBlur();
        }
    };

    return (
        <Container id={id} sx={sx} data-testid={dataTestId}>
            {label && (
                <LabelContainer>
                    <Label htmlFor={`${id}-input`}>{label}</Label>
                    {required && <RequiredFormInput />}
                </LabelContainer>
            )}
            {description && <Description>{description}</Description>}
            <InputRow>
                <InputWrapper>
                    <Input
                        id={`${id}-input`}
                        type="text"
                        value={selectedPath || ''}
                        placeholder={placeholder}
                        onChange={handleInputChange}
                        onBlur={handleInputBlur}
                    />
                </InputWrapper>
                <BrowseButton
                    data-testid="directory-selector-btn"
                    appearance="primary"
                    onClick={onSelect}
                >
                    Browse
                </BrowseButton>
            </InputRow>
            {errorMsg && <ErrorBanner errorMsg={errorMsg} />}
        </Container>
    );
};
