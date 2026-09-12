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

import { useEffect, useRef, useState, useCallback, UIEvent } from 'react';
import {
    SearchBox,
    Typography,
    ProgressRing,
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
import { CompletionInsertText, LineRange } from '@wso2/ballerina-core';
import { HelperPaneIconType, getHelperPaneIcon } from '../HelperPaneNew/utils/iconUtils';
import { debounce } from 'lodash';
import { loadNextAvailableSection, useFunctionPagination } from '../../../utils/useFunctionPagination';

// The two library sections are browsed sequentially: the extended library only appears once the standard library
// is fully scrolled/loaded, so the currently growing section is always at the bottom of the scroll container.
const STANDARD_LIBRARY_TITLE = 'Standard Library';
const EXTENDED_LIBRARY_TITLE = 'Extended Library';

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
    const contentRef = useRef<HTMLDivElement>(null);
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

    // If a freshly loaded page doesn't fill the scroll container there is no scroll event to trigger the next
    // page, so nudge the next section in whenever the content is not yet scrollable.
    useEffect(() => {
        const el = contentRef.current;
        if (el && el.clientHeight > 0 && el.scrollHeight <= el.clientHeight) {
            loadNextAvailableSection(sectionsWithMore, loadingSections, loadMoreSection);
        }
    }, [libraryBrowserInfo, sectionsWithMore, loadingSections, loadMoreSection]);

    const handleSearch = (searchText: string) => {
        setSearchValue(searchText);
        debounceFetchLibraryInfo(searchText);
    };

    // On scroll-to-bottom, load the next page of the first section (in order) that still has more.
    const handleScroll = useCallback((e: UIEvent<HTMLDivElement>) => {
        const el = e.currentTarget;
        const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= 40;
        if (nearBottom) {
            loadNextAvailableSection(sectionsWithMore, loadingSections, loadMoreSection);
        }
    }, [sectionsWithMore, loadingSections, loadMoreSection]);

    // The extended library becomes visible only once the standard library has no more pages to load.
    const isStandardLibraryExhausted = sectionsWithMore[STANDARD_LIBRARY_TITLE] === false;

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
            <BrowserContentArea ref={contentRef} onScroll={handleScroll}>
                {libraryBrowserInfo?.category
                    .filter((category) => {
                        const hasContent =
                            (category.items && category.items.length > 0) ||
                            (category.subCategory && category.subCategory.some(sub => sub.items && sub.items.length > 0));
                        if (!hasContent) {
                            return false;
                        }
                        // Reveal the extended library only after the standard library is fully loaded.
                        if (category.label === EXTENDED_LIBRARY_TITLE && !isStandardLibraryExhausted) {
                            return false;
                        }
                        return true;
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
                        {loadingSections[category.label] && (
                            <div style={{ display: 'flex', justifyContent: 'center', padding: '8px' }}>
                                <ProgressRing sx={{ height: '16px', width: '16px' }} />
                            </div>
                        )}
                    </BrowserSectionContainer>
                ))}
            </BrowserContentArea>
        </BrowserContainer>
    );
};
