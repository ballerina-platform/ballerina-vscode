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
/* eslint-disable react-hooks/exhaustive-deps */
import React, { useEffect, useRef, useState } from 'react'

import { css, cx } from "@emotion/css";
import { Combobox } from '@headlessui/react'

import { Dropdown } from "./Dropdown";
import styled from '@emotion/styled';
import { Codicon, Typography } from '@wso2/ui-toolkit';
import { Button } from '@wso2/ui-toolkit';
import { CommonRPCAPI, STModification } from '@wso2/ballerina-core';
import { VSCodeCheckbox } from '@vscode/webview-ui-toolkit/react';
import { useRpcContext } from '@wso2/ballerina-rpc-client';
import { filterTypeBrowserItems } from './utils';

const ComboboxButtonContainerActive = cx(css`
    width: 20%;
    height: 28px;
    text-align: -webkit-right;
    position: absolute;
    background-color: var(--vscode-input-background);
    border-right: 1px solid var(--vscode-focusBorder);
    border-bottom: 1px solid var(--vscode-focusBorder);
    border-top: 1px solid var(--vscode-focusBorder);
    border-left: 0 solid var(--vscode-focusBorder);
`);

const ComboboxButtonContainer = cx(css`
    width: 20%;
    height: 28px;
    text-align: -webkit-right;
    position: absolute;
    background-color: var(--vscode-input-background);
    border-right: 1px solid var(--vscode-dropdown-border);
    border-bottom: 1px solid var(--vscode-dropdown-border);
    border-top: 1px solid var(--vscode-dropdown-border);
    border-left: 0 solid var(--vscode-dropdown-border);
`);

const DropdownLabelDiv = cx(css`
    margin-bottom: 4px;
    font-family: var(--font-family);
    display: flex;
    justify-content: space-between;
    height: 14.6px;
`);

const OptionalLabel = cx(css`
    margin-left: 4px !important;
    font-size: 10px !important;
    align-self: end;
`);

interface ContainerProps {
    sx?: React.CSSProperties;
}

const DropdownIcon = cx(css`
    color: var(--vscode-symbolIcon-colorForeground);
    padding-top: 5px;
    height: 20px;
    width: 10px;
    padding-right: 8px;
`);

const SearchableInput = cx(css`
    color: var(--vscode-input-foreground);
    background-color: var(--vscode-input-background);
    height: 28px;
    width: 80%;
    padding-left: 8px;
    border-left: 1px solid var(--vscode-dropdown-border);
    border-bottom: 1px solid var(--vscode-dropdown-border);
    border-top: 1px solid var(--vscode-dropdown-border);
    border-right: 0 solid var(--vscode-dropdown-border);
    &:focus {
      outline: none;
      border-left: 1px solid var(--vscode-focusBorder);
      border-bottom: 1px solid var(--vscode-focusBorder);
      border-top: 1px solid var(--vscode-focusBorder);
      border-right: 0 solid var(--vscode-focusBorder);
    }
`);

const FormControlLabel = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
`;

const FormControlCheckbox = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
    margin-right: 25px;
`;

const Container = styled.div<ContainerProps>`
    width: 100%;
    ${(props: ContainerProps) => props.sx}
`;

export interface NodePosition {
    startLine?: number;
    startColumn?: number;
    endLine?: number;
    endColumn?: number;
}

export interface TypeBrowserProps {
    id?: string;
    serviceEndPosition?: NodePosition;
    isOptional?: boolean;
    isTypeArray?: boolean;
    handleArray?: boolean;
    label?: string;
    selectedItem?: string;
    widthOffset?: number;
    sx?: React.CSSProperties;
    borderBox?: boolean; // Enable this if the box-sizing is border-box
    onChange: (item: string, isArray: boolean, index?: number) => void;
    applyModifications?: (modifications: STModification[]) => Promise<void>;
}

export const TypeBrowser: React.FC<TypeBrowserProps> = (props: TypeBrowserProps) => {
    const { id, isOptional, isTypeArray, handleArray, selectedItem, serviceEndPosition, label, widthOffset = 157, sx, borderBox, onChange, applyModifications } = props;
    const [query, setQuery] = useState('');
    const [items, setItems] = useState([]);
    const [isCleared, setIsCleared] = useState(false);
    const [isTextFieldFocused, setIsTextFieldFocused] = useState(false);
    const inputRef = useRef(null);

    const handleCreateNewRecord = async (name: string) => {
        const source = `type ${name} record {};`;
        const position = serviceEndPosition!;
        position.startLine = serviceEndPosition?.endLine;
        position.startColumn = serviceEndPosition?.endColumn;
        await applyModifications([{
            type: "INSERT",
            isImport: false,
            config: {
                "STATEMENT": source
            },
            ...position,
        }]);
        setQuery(name);
    };

    const handleChange = (item: string, isArray: boolean = isTypeArray) => {
        if (query.includes("?") && query.includes(item)) {
            const cleared = clearValue(query)
            onChange(isArray ? `${cleared}[]` : cleared, isArray);
        } else {
            const cleared = clearValue(item)
            onChange(isArray ? `${cleared}[]` : cleared, isArray);
        }
    };

    const clearValue = (value: string) => {
        const cleanedValue = value?.replace(/\[\]/g, '');
        return `${cleanedValue}`;
    }

    const handleTextFieldFocused = () => {
        setIsTextFieldFocused(true);
    };
    const handleTextFieldClick = () => {
        inputRef.current?.select();
        // This is to open the dropdown when the text field is focused.
        // This is a hacky way to do it since the Combobox component does not have a prop to open the dropdown.
        document.getElementById(`autocomplete-dropdown-button-${items[0]}`)?.click();
        document.getElementById(selectedItem)?.focus();
    };
    const handleTextFieldOutFocused = () => {
        setIsCleared(false);
        setIsTextFieldFocused(false);
    };
    const handleDeleteButtonClick = () => {
        setIsCleared(true);
        setQuery("");
        onChange("", false);
    };
    const handleQueryChange = (q: string) => {
        setQuery(q);
    };

    const handleInputQueryChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        setIsCleared(false);
        setQuery(event.target.value);
    };
    const displayItemValue = (item: string) => item;

    const filteredResults = filterTypeBrowserItems(items, query);

    return (
        <Container sx={sx}>
            <Combobox value={selectedItem} onChange={handleChange} nullable >
                <div className={DropdownLabelDiv}>
                    <FormControlLabel>
                        <label>{label}</label>
                        {isOptional && <Typography className={OptionalLabel} variant="caption">Optional</Typography>}
                    </FormControlLabel>
                    {/* {handleArray && <FormControlCheckbox>
                        <VSCodeCheckbox
                            checked={isTypeArray || false}
                            onChange={(event: { target: HTMLInputElement; }) => handleArrayChange((event.target as HTMLInputElement).checked)}
                        />
                        <Typography variant="caption" sx={{ textWrap: "nowrap" }}>Is Array</Typography>
                    </FormControlCheckbox>} */}
                </div>
                <div>
                    <div>
                        <Combobox.Input
                            id={id}
                            ref={inputRef}
                            displayValue={isCleared ? () => "" : displayItemValue}
                            onChange={handleInputQueryChange}
                            className={cx(SearchableInput, borderBox && cx(css`
                                height: 28px;
                            `))}
                            onBlur={handleTextFieldOutFocused}
                            onFocus={handleTextFieldFocused}
                            onClick={handleTextFieldClick}
                        />
                        <Combobox.Button
                            id={`autocomplete-dropdown-button-${items[0]}`}
                            className={isTextFieldFocused ? ComboboxButtonContainerActive : ComboboxButtonContainer}
                        >
                            <Button sx={{ width: 20, height: 20 }} appearance="icon" tooltip="Clear" onClick={handleDeleteButtonClick}>
                                <Codicon sx={{ marginTop: -6, width: 8 }} name="close" className={DropdownIcon} />
                            </Button>
                        </Combobox.Button>
                    </div>
                    <Dropdown
                        query={query}
                        widthOffset={widthOffset}
                        filteredResults={filteredResults}
                        onQueryChange={handleQueryChange}
                        onCreateNewRecord={handleCreateNewRecord}
                    />
                </div>
            </Combobox>
        </Container>
    )
}
