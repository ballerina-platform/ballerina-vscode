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

import React, { useState, useEffect, useRef } from 'react';
import styled from '@emotion/styled';
import { Button, TextField, Typography, ProgressRing, Codicon } from '@wso2/ui-toolkit';
import { TypeHelperCategory, TypeHelperItem } from '../../TypeHelper';
import { Type, AddImportItemResponse, Imports } from '@wso2/ballerina-core';
import { ContentBody, StickyFooterContainer, FloatingFooter } from './ContextTypeEditor';


const SearchContainer = styled.div`
    width: 100%;
    margin-bottom: 8px;
    margin-top: 5px;
`;

const InfoBanner = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px;
    background-color: var(--vscode-textCodeBlock-background);
    border-radius: 4px;
    margin-bottom: 12px;
`;

const InfoText = styled(Typography)`
    color: var(--vscode-descriptionForeground);
`;

const CategorySection = styled.div`
    margin-top: 8px;
`;

const CategoryTitle = styled(Typography)`
    color: var(--vscode-descriptionForeground);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 8px;
`;

const SubCategoryContainer = styled.div`
    margin-left: 12px;
    margin-top: 8px;
`;

const TypeList = styled.div`
    display: flex;
    flex-direction: column;
    gap: 4px;
    overflow-y: auto;
    flex: 1;
    padding-right: 12px;
`;

const TypeItem = styled.div<{ isSelected?: boolean }>`
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
    padding: 10px 12px;
    background-color: ${({ isSelected }) =>
        isSelected
            ? 'var(--vscode-list-activeSelectionBackground)'
            : 'var(--vscode-list-inactiveSelectionBackground)'
    };
    border-radius: 3px;
    cursor: pointer;
    transition: all 0.15s ease;
    border: 1px solid ${({ isSelected }) =>
        isSelected
            ? 'var(--vscode-focusBorder)'
            : 'transparent'
    };

    &:hover {
        background-color: ${({ isSelected }) =>
        isSelected
            ? 'var(--vscode-list-activeSelectionBackground)'
            : 'var(--vscode-list-hoverBackground)'
    };
        border-color: var(--vscode-focusBorder);
    }

    &:active {
        background-color: var(--vscode-list-activeSelectionBackground);
    }
`;

const TypeName = styled(Typography) <{ isSelected?: boolean }>`
    font-family: var(--vscode-editor-font-family);
    color: ${({ isSelected }) =>
        isSelected
            ? 'var(--vscode-list-activeSelectionForeground)'
            : 'var(--vscode-foreground)'
    };
    font-weight: ${({ isSelected }) => isSelected ? '500' : '400'};
`;

const SelectIndicator = styled.div<{ isSelected?: boolean }>`
    display: flex;
    align-items: center;
    opacity: ${({ isSelected }) => isSelected ? '1' : '0'};
    transition: opacity 0.15s ease;
    color: var(--vscode-list-activeSelectionForeground);
`;

const LoadingContainer = styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 20px;
    flex: 1;
`;

const EmptyState = styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 20px;
    color: var(--vscode-descriptionForeground);
    flex: 1;
`;

// The right inset holds the overlay scrollbar, so it never sits on the rows.
const ScrollableSection = styled.div`
    flex: 1;
    overflow-y: auto;
    max-height: 390px;
    padding-right: 12px;
`;

interface BrowseTypesTabProps {
    basicTypes: TypeHelperCategory[];
    importedTypes: TypeHelperCategory[];
    workspaceTypes: TypeHelperCategory[];
    loading?: boolean;
    onSearchTypeHelper: (searchText: string, isType?: boolean) => void;
    onTypeItemClick: (item: TypeHelperItem) => Promise<any>;
    onTypeSelect: (type: Type, imports?: Imports) => void;
    simpleType?: string;
    note?: string;
}

export function BrowseTypesTab(props: BrowseTypesTabProps) {
    const {
        basicTypes,
        importedTypes,
        workspaceTypes,
        loading,
        onSearchTypeHelper,
        onTypeItemClick,
        onTypeSelect,
        simpleType,
        note
    } = props;

    const firstRender = useRef<boolean>(true);
    const [searchText, setSearchText] = useState<string>('');
    const [selectedType, setSelectedType] = useState<TypeHelperItem | null>(null);
    const [isSelecting, setIsSelecting] = useState<boolean>(false);

    // Set initial selected type if simpleType is provided
    useEffect(() => {
        if (simpleType && !selectedType) {
            setSelectedType({
                name: simpleType,
                insertText: simpleType
            } as unknown as TypeHelperItem);
        }
    }, [simpleType]);

    // Trigger initial search when component mounts
    useEffect(() => {
        if (firstRender.current) {
            firstRender.current = false;
            onSearchTypeHelper('', true);
            return;
        }
    }, []);

    const handleSearch = (value: string) => {
        setSearchText(value);
        onSearchTypeHelper(value, true);
    };

    const handleTypeClick = (item: TypeHelperItem) => {
        setSelectedType(item);
    };

    const handleSelectType = async () => {
        if (!selectedType) return;

        setIsSelecting(true);
        try {
            const response = await onTypeItemClick(selectedType) as AddImportItemResponse;

            // Use template from response which includes module prefix for imported types
            // For non-imported types, template will be the same as the type name
            const typeName = response?.template || selectedType.name;

            // Create a Type object from the selected item
            const type: Type = {
                name: typeName,
                editable: false,
                metadata: {
                    label: typeName,
                    description: selectedType.labelDetails?.description || '',
                },
                codedata: selectedType.codedata as any,
                properties: {},
                members: [],
                includes: []
            };

            // If this is an imported type, update imports before saving
            if (response?.prefix && response?.moduleId) {
                const importStatement: Imports = {
                    [response.prefix]: response.moduleId
                };
                onTypeSelect(type, importStatement);
            } else {
                onTypeSelect(type);
            }
        } catch (error) {
            console.error('Error selecting type:', error);
        } finally {
            setIsSelecting(false);
        }
    };

    const renderTypeItems = (categories: TypeHelperCategory[]) => {
        if (!categories || categories.length === 0) {
            return null;
        }

        // Filter out unwanted categories
        const filteredCategories = categories.filter(category =>
            category.category !== 'Used Variable Types' &&
            category.category !== 'Behaviour Types' &&
            category.category !== 'Error Types' &&
            category.category !== 'Other Types'
        );

        // Define the desired order and update sortText
        const categoryOrder = {
            'Primitive Types': '0',
            'Data Types': '1',
            'User-Defined': '2',
            'Structural Types': '3',
            'Imported Types': '4'
        };

        // Update sortText based on the desired order
        const categoriesWithUpdatedSortText = filteredCategories.map(category => {
            const sortText = categoryOrder[category.category as keyof typeof categoryOrder] || '99';

            return {
                ...category,
                sortText
            };
        });

        // Sort categories based on sortText
        const sortedCategories = categoriesWithUpdatedSortText.sort((a, b) => {
            return (a.sortText || '99').localeCompare(b.sortText || '99');
        });

        // TODO: we need this removed from the LS
        // Filter out "record" from Structural Types
        const processedCategories = sortedCategories.map(category => {
            if (category.category === 'Structural Types') {
                return {
                    ...category,
                    items: category.items.filter(item =>
                        item.name.toLowerCase() !== 'record'
                    )
                };
            }
            return category;
        });

        return processedCategories.map((category, categoryIndex) => (
            <CategorySection key={categoryIndex}>
                {category.category && (
                    <CategoryTitle variant="h5">{category.category}</CategoryTitle>
                )}

                {/* Render direct items if they exist */}
                {category.items && category.items.length > 0 && (
                    <TypeList>
                        {category.items.map((item, itemIndex) => {
                            const isSelected = selectedType?.name === item.name;
                            return (
                                <TypeItem
                                    key={itemIndex}
                                    isSelected={isSelected}
                                    onClick={() => handleTypeClick(item)}
                                >
                                    <TypeName
                                        variant="body3"
                                        isSelected={isSelected}
                                    >
                                        {item.name}
                                    </TypeName>
                                    <SelectIndicator isSelected={isSelected}>
                                        <Codicon name="check" />
                                    </SelectIndicator>
                                </TypeItem>
                            );
                        })}
                    </TypeList>
                )}

                {/* Render subcategories if they exist (for Imported Types) */}
                {category.subCategory && category.subCategory.map((subCat, subCatIndex) => (
                    <SubCategoryContainer key={subCatIndex}>
                        <CategoryTitle variant="h5">
                            {subCat.category}
                        </CategoryTitle>
                        <TypeList>
                            {subCat.items.map((item, itemIndex) => {
                                const isSelected = selectedType?.name === item.name;
                                return (
                                    <TypeItem
                                        key={itemIndex}
                                        isSelected={isSelected}
                                        onClick={() => handleTypeClick(item)}
                                    >
                                        <TypeName
                                            variant="body3"
                                            isSelected={isSelected}
                                        >
                                            {item.name}
                                        </TypeName>
                                        <SelectIndicator isSelected={isSelected}>
                                            <Codicon name="check" />
                                        </SelectIndicator>
                                    </TypeItem>
                                );
                            })}
                        </TypeList>
                    </SubCategoryContainer>
                ))}
            </CategorySection>
        ));
    };

    return (
        <StickyFooterContainer>
            <ContentBody>
                {note && (
                    <InfoBanner>
                        <Codicon name="info" />
                        <InfoText variant="body3">{note}</InfoText>
                    </InfoBanner>
                )}
                <SearchContainer>
                    <TextField
                        value={searchText}
                        onChange={(e) => handleSearch(e.target.value)}
                        placeholder="Search types..."
                        autoFocus
                    />
                </SearchContainer>
                {(loading && (!basicTypes || basicTypes.length === 0) && (!importedTypes || importedTypes.length === 0) && (!workspaceTypes || workspaceTypes.length === 0)) ? (
                    <LoadingContainer>
                        <ProgressRing />
                    </LoadingContainer>
                ) : (
                    <ScrollableSection>
                        {workspaceTypes && workspaceTypes.length > 0 && renderTypeItems(workspaceTypes)}
                        {basicTypes && basicTypes.length > 0 && renderTypeItems(basicTypes)}
                        {importedTypes && importedTypes.length > 0 && renderTypeItems(importedTypes)}
                        {(!workspaceTypes || workspaceTypes.length === 0) && (!basicTypes || basicTypes.length === 0) && (!importedTypes || importedTypes.length === 0) && !loading && (
                            <EmptyState>
                                <Typography variant="body3">No matching types found</Typography>
                            </EmptyState>
                        )}
                    </ScrollableSection>
                )}
            </ContentBody>
            <FloatingFooter>
                <Button
                    onClick={handleSelectType}
                    disabled={!selectedType || isSelecting}
                >
                    {isSelecting ? <Typography variant="progress">Saving...</Typography> : 'Save'}
                </Button>
            </FloatingFooter>
        </StickyFooterContainer>
    );
}
