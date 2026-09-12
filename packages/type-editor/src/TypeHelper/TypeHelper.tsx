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

import React, { useEffect, useRef, useState } from 'react';
import styled from '@emotion/styled';
import {
    Codicon,
    Divider,
    FormExpressionEditorRef,
    HelperPane,
    HelperPaneCustom,
    HelperPaneHeight,
    Icon,
    SearchBox,
    ThemeColors
} from '@wso2/ui-toolkit';
import { TypeHelperOperator } from '..';
import { TypeHelperCategory, TypeHelperItem } from '.';
import { TypeBrowser } from './TypeBrowser';
import { getTypeCreateText, isTypePanelOpen } from './utils';
import ExpandableList from './ExpandableList';
import { ScrollableContainer, SlidingPane, SlidingPaneNavContainer, SlidingWindow } from '@wso2/ui-toolkit/lib/components/ExpressionEditor/components/Common/SlidingPane';
import { EMPTY_SEARCH_RESULT_MSG } from './constant';
import FooterButtons from './FooterButtons';

/* Constants */
const PANEL_TABS = {
    TYPES: 0,
    OPERATORS: 1
} as const;

/* Types */
type TypeHelperComponentProps = {
    open: boolean;
    currentType: string;
    currentCursorPosition: number;
    loading?: boolean;
    loadingTypeBrowser?: boolean;
    referenceTypes: TypeHelperCategory[];
    basicTypes: TypeHelperCategory[];
    importedTypes: TypeHelperCategory[];
    workspaceTypes: TypeHelperCategory[];
    operators: TypeHelperOperator[];
    typeBrowserTypes: TypeHelperCategory[];
    typeBrowserRef: React.RefObject<HTMLDivElement>;
    typeHelperHeight?: HelperPaneHeight;
    onChange: (newType: string, newCursorPosition: number) => void;
    onSearchTypeHelper: (searchText: string, isType: boolean) => void;
    onSearchTypeBrowser: (searchText: string) => void;
    onTypeItemClick: (item: TypeHelperItem) => Promise<string>;
    onTypeCreate?: (typeName?: string) => void;
    onClose: () => void;
    onCloseCompletions?: () => void;
    exprRef: React.RefObject<FormExpressionEditorRef>;
};

type StyleBase = {
    sx?: React.CSSProperties;
};

/* Styles */
namespace S {
    export const Container = styled.div<StyleBase>`
        position: absolute;
        z-index: 2001;
        filter: drop-shadow(0 3px 8px rgb(0 0 0 / 0.2));

        *,
        *::before,
        *::after {
            box-sizing: border-box;
        }

        ${(props) => props.sx && { ...props.sx }}
    `;

    export const OperatorContainer = styled.div`
        display: flex;
        flex-direction: column;
        gap: 8px;
    `;

    export const EmptySearchMessage = styled.div`
        display: flex;
        padding: 10px;
        text-align: center;
        color: ${ThemeColors.ON_SURFACE_VARIANT};
    `;

    export const Operator = styled.div`
        display: flex;
        align-items: flex-start;
        gap: 8px;
        padding: 2px 4px;
        cursor: pointer;

        &:hover {
            background-color: var(--vscode-list-hoverBackground);
        }
    `;

    export const OptionIcon = styled.div`
        margin-top: 2px;
    `;

    export const CategoryContainer = styled.div`
        display: flex;
        flex-direction: column;
        flex: 1 1 auto;
    `;

    export const ItemContainer = styled.div`
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 8px;
    `;

    export const Item = styled.div`
        display: flex;
        gap: 8px;
        align-items: center;
        padding: 8px;
        border-radius: 4px;
    `;

    export const FooterContainer = styled.div`
        display: flex;
        flex-direction: column;
        gap: 8px;
    `;
}

const FunctionItemLabel = styled.span`
    font-size: 13px;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
`;

export const TypeHelperComponent = (props: TypeHelperComponentProps) => {
    const {
        open,
        currentType,
        currentCursorPosition,
        typeBrowserRef,
        loading = false,
        loadingTypeBrowser = false,
        referenceTypes,
        basicTypes,
        importedTypes,
        workspaceTypes,
        operators,
        typeBrowserTypes,
        onChange,
        onSearchTypeHelper,
        onSearchTypeBrowser,
        onTypeItemClick,
        onTypeCreate,
        onClose,
        onCloseCompletions,
        exprRef
    } = props;
    const [searchValue, setSearchValue] = useState<string>('');
    const [isTypeBrowserOpen, setIsTypeBrowserOpen] = useState<boolean>(false);
    const [activePanelIndex, setActivePanelIndex] = useState<number>(PANEL_TABS.TYPES);
    const newTypeName = useRef<string>('');

    const typeFieldRef = exprRef?.current?.inputElement?.getBoundingClientRect();

    //TODO: use this after operator part is implemented
    const handleOperatorClick = (operator: TypeHelperOperator) => {
        if (operator.insertType === 'global') {
            if (operator.insertLocation === 'start') {
                onChange(
                    operator.insertText + ' ' + currentType.trimStart(),
                    currentCursorPosition + operator.insertText.length + 1
                );
            } else {
                onChange(currentType.trimEnd() + operator.insertText, currentCursorPosition);
            }
        } else {
            const suffixRegex = /^[a-zA-Z0-9_']*/;
            const suffixMatch = currentType.slice(currentCursorPosition).match(suffixRegex);

            if (suffixMatch) {
                const newCursorPosition = currentCursorPosition + suffixMatch[0].length;
                onChange(
                    currentType.slice(0, newCursorPosition) +
                    operator.insertText +
                    currentType.slice(newCursorPosition),
                    newCursorPosition + operator.insertText.length
                );
            }
        }
    };


    const handleTypeItemClick = (item: TypeHelperItem) => {
        const prefixRegex = /[a-zA-Z0-9_':]*$/;
        const suffixRegex = /^[a-zA-Z0-9_':]*/;
        const prefixMatch = currentType.slice(0, currentCursorPosition).match(prefixRegex);
        const suffixMatch = currentType.slice(currentCursorPosition).match(suffixRegex);
        const prefixCursorPosition = currentCursorPosition - (prefixMatch?.[0]?.length ?? 0);
        const suffixCursorPosition = currentCursorPosition + (suffixMatch?.[0]?.length ?? 0);

        onChange(
            currentType.slice(0, prefixCursorPosition) + item.insertText + currentType.slice(suffixCursorPosition),
            prefixCursorPosition + item.insertText.length
        );
        onCloseCompletions?.();
        onClose();
    };

    const handleTypeBrowserItemClick = async (item: TypeHelperItem) => {
        const prefixRegex = /[a-zA-Z0-9_':]*$/;
        const suffixRegex = /^[a-zA-Z0-9_':]*/;
        const prefixMatch = currentType.slice(0, currentCursorPosition).match(prefixRegex);
        const suffixMatch = currentType.slice(currentCursorPosition).match(suffixRegex);
        const prefixCursorPosition = currentCursorPosition - (prefixMatch?.[0]?.length ?? 0);
        const suffixCursorPosition = currentCursorPosition + (suffixMatch?.[0]?.length ?? 0);

        try {
            const updateText = await onTypeItemClick(item);
            if (updateText) {
                onChange(
                    currentType.slice(0, prefixCursorPosition) + updateText + currentType.slice(suffixCursorPosition),
                    prefixCursorPosition + updateText.length
                );
            }
        } catch (error) {
            console.error(error);
        }

        // Close the type browser
        onClose();

        onCloseCompletions?.();
    }

    const handleHelperPaneSearch = (searchText: string) => {
        setSearchValue(searchText);
        onSearchTypeHelper(searchText, isTypePanelOpen(activePanelIndex));
    };

    const hasNoSearchResults = () => {
        const hasBasicTypes = basicTypes.length > 0;
        const hasImportedTypes = importedTypes && importedTypes.length > 0 &&
            importedTypes.some(type => (type.subCategory?.length > 0 && type.subCategory.some(sub => sub.items?.length > 0)) || type.items?.length > 0);
        const hasWorkspaceTypes = workspaceTypes && workspaceTypes.length > 0 &&
            workspaceTypes.some(type => (type.subCategory?.length > 0 && type.subCategory.some(sub => sub.items?.length > 0)) || type.items?.length > 0);

        return !hasBasicTypes && !hasImportedTypes && !hasWorkspaceTypes;
    }

    useEffect(() => {
        if (open) {
            onSearchTypeHelper(searchValue, isTypePanelOpen(activePanelIndex));
        }
    }, [activePanelIndex, open]);

    return (
        <HelperPaneCustom>
            <HelperPaneCustom.Body>
                <div style={{ height: '100%', overflow: 'hidden', display: isTypeBrowserOpen ? 'none' : 'block' }}>

                    <SlidingWindow>
                        <SlidingPane
                            name="PAGE1"
                            paneWidth={typeFieldRef?.width}
                            paneHeight='170px'>
                            <div style={{
                                justifyContent: "center",
                                alignItems: "center",
                                margin: "3px 8px",
                                display: isTypeBrowserOpen ? 'none' : 'flex'
                            }}>

                                <SearchBox
                                    id={'helper-pane-search'}
                                    sx={{ width: "100%" }}
                                    placeholder='Search'
                                    value={searchValue}
                                    onChange={handleHelperPaneSearch}
                                />
                            </div>
                            {
                                loading ? (
                                    <HelperPane.Loader />
                                ) : (
                                    <ScrollableContainer style={{ margin: '8px 0px' }}>
                                        {workspaceTypes?.some(cat => (cat.subCategory?.length > 0 && cat.subCategory.some(sub => sub.items?.length > 0)) || cat.items?.length > 0) && (
                                            <ExpandableList>
                                                {workspaceTypes
                                                    .filter(cat => (cat.subCategory?.length > 0 && cat.subCategory.some(sub => sub.items?.length > 0)) || cat.items?.length > 0)
                                                    .map((category, index) => (
                                                        <ExpandableList.Section
                                                            sx={{ marginTop: index === 0 ? '0px' : '20px' }}
                                                            key={category.category}
                                                            title={
                                                                <span style={{ padding: '10px' }}>{category.category}</span>
                                                            }
                                                            level={0}
                                                        >
                                                            {category.subCategory?.length > 0 ? (
                                                                // Render subcategories if they exist
                                                                category.subCategory
                                                                    .filter(sub => sub.items?.length > 0)
                                                                    .map((subCategory) => (
                                                                        <ExpandableList.Section
                                                                            sx={{ marginTop: '10px' }}
                                                                            key={subCategory.category}
                                                                            title={
                                                                                <span style={{ padding: '10px', color: ThemeColors.ON_SURFACE_VARIANT }}>
                                                                                    {subCategory.category}
                                                                                </span>}
                                                                            level={0}
                                                                        >
                                                                            <div style={{ marginTop: '10px' }}>
                                                                                {subCategory.items?.map((item) => (
                                                                                    <SlidingPaneNavContainer
                                                                                        key={`${subCategory.category}-${item.name}`}
                                                                                        onClick={() => handleTypeBrowserItemClick(item)}>
                                                                                        <ExpandableList.Item
                                                                                            key={`${subCategory.category}-${item.name}`}
                                                                                        >
                                                                                            <Icon name="bi-type" sx={{ fontSize: '16px' }} />
                                                                                            <FunctionItemLabel title={item.name}>{item.name}</FunctionItemLabel>
                                                                                        </ExpandableList.Item>
                                                                                    </SlidingPaneNavContainer>
                                                                                ))}
                                                                            </div>
                                                                        </ExpandableList.Section>
                                                                    ))
                                                            ) : (
                                                                // Render items directly if no subcategories
                                                                <div style={{ marginTop: '10px' }}>
                                                                    {category.items?.map((item) => (
                                                                        <SlidingPaneNavContainer
                                                                            key={`${category.category}-${item.name}`}
                                                                            onClick={() => handleTypeBrowserItemClick(item)}>
                                                                            <ExpandableList.Item
                                                                                key={`${category.category}-${item.name}`}
                                                                            >
                                                                                <Icon name="bi-type" sx={{ fontSize: '16px' }} />
                                                                                <FunctionItemLabel title={item.name}>{item.name}</FunctionItemLabel>
                                                                            </ExpandableList.Item>
                                                                        </SlidingPaneNavContainer>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </ExpandableList.Section>
                                                    ))}
                                            </ExpandableList>
                                        )}
                                        {basicTypes.map((category) => (
                                            <ExpandableList key={category.category}>
                                                <ExpandableList.Section
                                                    sx={{ marginTop: '20px' }}
                                                    title={
                                                        <span style={{ padding: '10px' }}>{category.category}</span>
                                                    }
                                                    level={0}
                                                >
                                                    <div style={{ marginTop: '10px' }}>
                                                        {category.items.filter((item) => item.name !== "record").map((item) => (
                                                            <SlidingPaneNavContainer
                                                                key={`${category.category}-${item.name}`}
                                                                data-testid={`type-helper-item-${item.name}`}
                                                                onClick={() => handleTypeItemClick(item)}
                                                            >
                                                                <ExpandableList.Item>
                                                                    <Icon name="bi-type" sx={{ fontSize: '16px' }} />
                                                                    <FunctionItemLabel title={item.name}>{item.name}</FunctionItemLabel>
                                                                </ExpandableList.Item>
                                                            </SlidingPaneNavContainer>
                                                        ))}
                                                    </div>
                                                </ExpandableList.Section>
                                            </ExpandableList>
                                        ))}
                                        {importedTypes?.some(cat => (cat.subCategory?.length > 0 && cat.subCategory.some(sub => sub.items?.length > 0)) || cat.items?.length > 0) && (
                                            <ExpandableList>
                                                {importedTypes
                                                    .filter(cat => (cat.subCategory?.length > 0 && cat.subCategory.some(sub => sub.items?.length > 0)) || cat.items?.length > 0)
                                                    .map((category) => (
                                                        <ExpandableList.Section
                                                            sx={{ marginTop: '20px' }}
                                                            key={category.category}
                                                            title={
                                                                <span style={{ padding: '10px' }}>{category.category}</span>
                                                            }
                                                            level={0}
                                                        >
                                                            {category.subCategory?.length > 0 ? (
                                                                // Render subcategories if they exist
                                                                category.subCategory
                                                                    .filter(sub => sub.items?.length > 0)
                                                                    .map((subCategory) => (
                                                                        <ExpandableList.Section
                                                                            sx={{ marginTop: '10px' }}
                                                                            key={subCategory.category}
                                                                            title={
                                                                                <span style={{ padding: '10px', color: ThemeColors.ON_SURFACE_VARIANT }}>
                                                                                    {subCategory.category}
                                                                                </span>}
                                                                            level={0}
                                                                        >
                                                                            <div style={{ marginTop: '10px' }}>
                                                                                {subCategory.items?.map((item) => (
                                                                                    <SlidingPaneNavContainer
                                                                                        key={`${subCategory.category}-${item.name}`}
                                                                                        onClick={() => handleTypeBrowserItemClick(item)}>
                                                                                        <ExpandableList.Item
                                                                                            key={`${subCategory.category}-${item.name}`}
                                                                                        >
                                                                                            <Icon name="bi-type" sx={{ fontSize: '16px' }} />
                                                                                            <FunctionItemLabel title={item.name}>{item.name}</FunctionItemLabel>
                                                                                        </ExpandableList.Item>
                                                                                    </SlidingPaneNavContainer>
                                                                                ))}
                                                                            </div>
                                                                        </ExpandableList.Section>
                                                                    ))
                                                            ) : (
                                                                // Render items directly if no subcategories
                                                                <div style={{ marginTop: '10px' }}>
                                                                    {category.items?.map((item) => (
                                                                        <SlidingPaneNavContainer
                                                                            key={`${category.category}-${item.name}`}
                                                                            onClick={() => handleTypeBrowserItemClick(item)}>
                                                                            <ExpandableList.Item
                                                                                key={`${category.category}-${item.name}`}
                                                                            >
                                                                                <Icon name="bi-type" sx={{ fontSize: '16px' }} />
                                                                                <FunctionItemLabel title={item.name}>{item.name}</FunctionItemLabel>
                                                                            </ExpandableList.Item>
                                                                        </SlidingPaneNavContainer>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </ExpandableList.Section>
                                                    ))}
                                            </ExpandableList>
                                        )}
                                        {hasNoSearchResults() && (
                                            <S.EmptySearchMessage>
                                                <Codicon name='search' sx={{ marginRight: '10px' }} />
                                                {EMPTY_SEARCH_RESULT_MSG}
                                            </S.EmptySearchMessage>
                                        )}
                                    </ScrollableContainer>
                                )
                            }

                            <Divider sx={{ margin: '0px' }} />
                            <div style={{
                                margin: '4px 0',
                                display: 'flex',
                                flexDirection: 'column'
                            }}>
                                {onTypeCreate && (
                                    <FooterButtons
                                        sx={{ display: 'flex', justifyContent: 'space-between' }}
                                        title={getTypeCreateText(currentType, referenceTypes, newTypeName)}
                                        onClick={() => onTypeCreate(newTypeName.current)}
                                    />
                                )}
                                <FooterButtons
                                    sx={{ display: 'flex', justifyContent: 'space-between' }}
                                    title="Open Type Browser"
                                    onClick={() => setIsTypeBrowserOpen(true)}
                                    startIcon="bi-arrow-outward"
                                />
                            </div>
                        </SlidingPane>
                    </SlidingWindow>
                </div>
                {/* Type browser */}
                {isTypeBrowserOpen && (
                    <TypeBrowser
                        typeBrowserRef={typeBrowserRef}
                        loadingTypeBrowser={loadingTypeBrowser}
                        typeBrowserTypes={typeBrowserTypes}
                        onSearchTypeBrowser={onSearchTypeBrowser}
                        onTypeItemClick={handleTypeBrowserItemClick}
                        onClose={() => setIsTypeBrowserOpen(false)}
                    />
                )}
            </HelperPaneCustom.Body>
        </HelperPaneCustom>
    );
};
