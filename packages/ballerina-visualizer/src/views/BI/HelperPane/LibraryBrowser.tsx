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

import { useEffect, useRef, useState, useCallback } from 'react';
import {
    SearchBox,
    Typography,
    BrowserContainer,
    BrowserSearchContainer,
    BrowserContentArea,
    BrowserSectionContainer,
    BrowserSectionBody,
    BrowserItemContainer,
    BrowserItemLabel,
    BrowserEmptyMessage
} from '@wso2/ui-toolkit';
import { HelperPaneCompletionItem } from '@wso2/ballerina-side-panel';
import { LoadMoreButton } from '@wso2/ballerina-side-panel/lib/components/LoadMoreButton';
import { CompletionInsertText, LineRange } from '@wso2/ballerina-core';
import { HelperPaneIconType, getHelperPaneIcon } from '../HelperPaneNew/utils/iconUtils';
import { debounce } from 'lodash';
import { useFunctionPagination } from '../../../utils/useFunctionPagination';
import { withPendingSections } from '../../../utils/function-pagination';

type LibraryBrowserProps = {
    fileName: string;
    targetLineRange: LineRange;
    onClose: () => void;
    onChange: (insertText: CompletionInsertText) => void;
    onFunctionItemSelect: (item: HelperPaneCompletionItem) => Promise<CompletionInsertText>;
};

export const LibraryBrowser = ({
    fileName,
    targetLineRange,
    onClose,
    onChange,
    onFunctionItemSelect
}: LibraryBrowserProps) => {
    const firstRender = useRef<boolean>(true);
    const [searchValue, setSearchValue] = useState<string>('');
    const {
        info: libraryBrowserInfo,
        sectionsWithMore,
        loadingSections,
        loadFirstPage,
        loadMoreSection
    } = useFunctionPagination({ fileName, targetLineRange });

    const debounceFetchLibraryInfo = useCallback(
        debounce((searchText: string) => {
            loadFirstPage(searchText);
        }, 150),
        [loadFirstPage]
    );

    useEffect(() => {
        if (firstRender.current) {
            firstRender.current = false;
            debounceFetchLibraryInfo('');
        }
    }, [debounceFetchLibraryInfo]);

    // An empty resolved page can still have a continuation (including during search).
    const categories = withPendingSections(libraryBrowserInfo?.category ?? [], sectionsWithMore);

    const handleSearch = (searchText: string) => {
        setSearchValue(searchText);
        debounceFetchLibraryInfo(searchText);
    };

    const handleFunctionItemSelect = async (item: HelperPaneCompletionItem) => {
        // Close helper pane immediately to prevent duplicate clicks
        // while the async function template API call is in progress
        onClose();
        const { value, cursorOffset } = await onFunctionItemSelect(item);
        onChange({ value, cursorOffset });
    };

    return (
        <BrowserContainer>
            <BrowserSearchContainer>
                <SearchBox id="library-browser-search" placeholder="Search" value={searchValue} onChange={handleSearch} />
            </BrowserSearchContainer>
            <BrowserContentArea>
                {categories
                    .filter((category) => {
                        const hasContent =
                            (category.items && category.items.length > 0) ||
                            (category.subCategory && category.subCategory.some(sub => sub.items && sub.items.length > 0));
                        return hasContent || sectionsWithMore[category.label];
                    })
                    .map((category) => (
                    <BrowserSectionContainer key={category.label}>
                        <Typography variant="h2" sx={{ margin: 0, fontFamily: 'GilmerMedium', fontSize: '16px', fontWeight: '600' }}>
                            {category.label}
                        </Typography>
                        <BrowserSectionBody columns={category.items?.length > 0 && category.subCategory?.length === 0 ? 3 : 1}>
                            {category.items?.length > 0 ? (
                                category.items.map((item) => (
                                    <BrowserItemContainer
                                        key={`${category.label}-${item.label}`}
                                        onClick={async () => await handleFunctionItemSelect(item)}
                                    >
                                        {getHelperPaneIcon(HelperPaneIconType.FUNCTION)}
                                        <BrowserItemLabel>{item.label}()</BrowserItemLabel>
                                    </BrowserItemContainer>
                                ))
                            ) : (
                                !category.subCategory?.length && (
                                    <BrowserEmptyMessage>
                                        No items found
                                    </BrowserEmptyMessage>
                                )
                            )}
                            {category.subCategory?.filter(sub => sub.items && sub.items.length > 0).map((subCategory) => (
                                <div key={`${category.label}-${subCategory.label}`} style={{ marginTop: '12px' }}>
                                    <Typography variant="body3" sx={{ fontStyle: "italic", marginBottom: '8px' }}>
                                        {subCategory.label}
                                    </Typography>
                                    <BrowserSectionBody columns={3}>
                                        {subCategory.items?.length > 0 ? (
                                            subCategory.items.map((item) => (
                                                <BrowserItemContainer
                                                    key={`${category.label}-${subCategory.label}-${item.label}`}
                                                    onClick={async () => await handleFunctionItemSelect(item)}
                                                >
                                                    {getHelperPaneIcon(HelperPaneIconType.FUNCTION)}
                                                    <BrowserItemLabel>{item.label}()</BrowserItemLabel>
                                                </BrowserItemContainer>
                                            ))
                                        ) : (
                                            <BrowserEmptyMessage>
                                                No items found
                                            </BrowserEmptyMessage>
                                        )}
                                    </BrowserSectionBody>
                                </div>
                            ))}
                        </BrowserSectionBody>
                        {sectionsWithMore[category.label] && (
                            <LoadMoreButton
                                label={`Load more ${category.label} functions`}
                                loading={loadingSections[category.label]}
                                onClick={() => loadMoreSection(category.label)}
                            />
                        )}
                    </BrowserSectionContainer>
                ))}
            </BrowserContentArea>
        </BrowserContainer>
    );
};
