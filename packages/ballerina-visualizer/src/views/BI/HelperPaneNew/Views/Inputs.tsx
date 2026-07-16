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

import { ExpandableList } from "../Components/ExpandableList"
import { TypeIndicator } from "../Components/TypeIndicator"
import { ExpressionProperty, LineRange } from "@wso2/ballerina-core"
import { Codicon, CompletionItem, HelperPaneCustom, SearchBox, Tooltip, Typography } from "@wso2/ui-toolkit"
import { ArrayIndexBadge, ArrayIndexControls, ArrayIndexLabel, ArrayIndexRow, ArrayIndexStepButton } from "../styles/ArrayIndexStepper"
import { useEffect, useMemo, useRef, useState } from "react"
import { getPropertyFromFormField, useFieldContext, InputMode } from "@wso2/ballerina-side-panel"
import { ScrollableContainer } from "../Components/ScrollableContainer"
import { HelperPaneIconType, getHelperPaneIcon } from "../utils/iconUtils"
import { EmptyItemsPlaceHolder } from "../Components/EmptyItemsPlaceHolder"
import { isArrayOfObjectsType, shouldShowNavigationArrow } from "../utils/types"
import { HelperPaneListItem } from "../Components/HelperPaneListItem"
import { useHelperPaneNavigation, BreadCrumbStep } from "../hooks/useHelperPaneNavigation"
import { BreadcrumbNavigation } from "../Components/BreadcrumbNavigation"

type InputsPageProps = {
    fileName: string;
    onChange: (value: string, isRecordConfigureChange: boolean, shouldKeepHelper?: boolean) => void;
    targetLineRange: LineRange;
    anchorRef: React.RefObject<HTMLDivElement>;
    filteredCompletions: CompletionItem[];
    currentValue: string;
    handleRetrieveCompletions: (value: string, property: ExpressionProperty, offset: number, triggerCharacter?: string) => Promise<void>;
    inputMode?: InputMode;
}

type InputItemProps = {
    item: CompletionItem;
    onItemSelect: (value: string) => void;
    onMoreIconClick: (item: CompletionItem) => void;
}

const InputItem = ({ item, onItemSelect, onMoreIconClick }: InputItemProps) => {
    const showArrow = shouldShowNavigationArrow(item);

    const mainContent = (
        <>
            {getHelperPaneIcon(HelperPaneIconType.INPUT)}
            <Typography variant="body3" sx={{ flex: 1, mr: 1 }}>
                {item.label}
            </Typography>
            <Tooltip content={item.description} position="top">
                <TypeIndicator>
                    {item.description}
                </TypeIndicator>
            </Tooltip>
        </>
    );

    const endAction = showArrow ? (
        <Codicon
            name="chevron-right"
        />
    ) : undefined;

    return (
        <HelperPaneListItem
            onClick={() => onItemSelect(item.label)}
            endAction={endAction}
            onClickEndAction={() => onMoreIconClick(item)}
        >
            {mainContent}
        </HelperPaneListItem>
    );
};

const isParameterCompletion = (completion: CompletionItem) =>
    completion.kind === "variable" &&
    completion.labelDetails?.description?.includes("Parameter");

export const Inputs = (props: InputsPageProps) => {
    const { targetLineRange, onChange, filteredCompletions, currentValue, handleRetrieveCompletions, inputMode } = props;
    const [searchValue, setSearchValue] = useState<string>("");
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [showContent, setShowContent] = useState<boolean>(false);
    const { breadCrumbSteps, navigateToNext, navigateToNextArray, updateLastStepArrayIndex, navigateToBreadcrumb, isAtRoot, getCurrentNavigationPath, getLeafSeparator } = useHelperPaneNavigation("Inputs");

    const currentStep = breadCrumbSteps[breadCrumbSteps.length - 1];
    const isInArrayContext = !isAtRoot() && currentStep?.isArrayAccess === true;
    const currentArrayIndex = currentStep?.arrayIndex ?? 0;

    // Local index state for immediate UI feedback; synced to navigation after debounce
    const [localArrayIndex, setLocalArrayIndex] = useState(0);
    const localIndexRef = useRef(0);
    const indexDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Sync local index when navigating to a new array step
    useEffect(() => {
        localIndexRef.current = currentArrayIndex;
        setLocalArrayIndex(currentArrayIndex);
    }, [currentStep?.replaceText]);

    // Cleanup debounce timer on unmount
    useEffect(() => {
        return () => { if (indexDebounceRef.current) clearTimeout(indexDebounceRef.current); };
    }, []);

    const { field, triggerCharacters } = useFieldContext();

    // Use navigation path for completions instead of currentValue
    const navigationPath = useMemo(() => getCurrentNavigationPath(), [breadCrumbSteps]);
    const completionContext = useMemo(() =>
        navigationPath ? navigationPath + getLeafSeparator() : (currentValue || ''),
        [navigationPath, currentValue, breadCrumbSteps]
    );

    useEffect(() => {
        setIsLoading(true);
        const triggerCharacter =
            completionContext && completionContext.length > 0
                ? triggerCharacters.find((char) => completionContext[completionContext.length - 1] === char)
                : undefined;

        // Only apply minimum loading time if we don't have any completions yet
        const shouldShowMinLoader = filteredCompletions.length === 0 && !showContent;
        const minLoadingTime = shouldShowMinLoader ? new Promise(resolve => setTimeout(resolve, 500)) : Promise.resolve();

        // When navigating, use length as offset to position cursor after the dot
        // When at root, use 0 to get all completions
        const offset = navigationPath ? completionContext.length : 0;

        Promise.all([
            handleRetrieveCompletions(completionContext, getPropertyFromFormField(field), offset, triggerCharacter),
            minLoadingTime
        ]).finally(() => {
            setIsLoading(false);
            setShowContent(true);
        });
    }, [targetLineRange, breadCrumbSteps, completionContext])

    const dropdownItems = useMemo(() => {
        // At root, show only function/init parameters — the values supplied when the agent is created.
        // Class fields (self.*) live under Variables.
        if (isAtRoot()) {
            return filteredCompletions.filter(isParameterCompletion);
        }

        // If we're navigating inside an object, show fields and variables
        const fieldItems = filteredCompletions.filter(
            (completion) =>
                (completion.kind === "field" || completion.kind === "variable") &&
                completion.label !== "self"
        );

        // If there are no fields/variables (e.g. a primitive type), fall back to toString()
        if (fieldItems.length === 0) {
            const toStringItem = filteredCompletions.find(c => c.label === "toString()");
            return toStringItem ? [toStringItem] : [];
        }

        return fieldItems;
    }, [filteredCompletions, isAtRoot]);

    const filteredDropDownItems = useMemo(() => {
        if (!searchValue || searchValue.length === 0) return dropdownItems;
        return dropdownItems.filter((item) =>
            item.label.toLowerCase().includes(searchValue.toLowerCase())
        );
    }, [searchValue, dropdownItems]);

    const handleSearch = (searchText: string) => {
        setSearchValue(searchText);
    };

    const handleItemSelect = (value: string) => {
        // Build full path from navigation; use ?. when the parent step is optional
        const fullPath = navigationPath ? `${navigationPath}${getLeafSeparator()}${value}` : value;
        onChange(fullPath, false);
    }

    const handleInputsMoreIconClick = (item: CompletionItem) => {
        const typeDetail = item?.labelDetails?.detail || item?.description;
        if (isArrayOfObjectsType(typeDetail)) {
            navigateToNextArray(item.label, navigationPath, 0, typeDetail);
        } else {
            navigateToNext(item.label, navigationPath, typeDetail);
        }
    }

    const handleArrayIndexStep = (delta: number) => {
        const newIndex = Math.max(0, localIndexRef.current + delta);
        localIndexRef.current = newIndex;
        setLocalArrayIndex(newIndex);

        if (indexDebounceRef.current) clearTimeout(indexDebounceRef.current);
        indexDebounceRef.current = setTimeout(() => {
            updateLastStepArrayIndex(newIndex);
        }, 400);
    }

    const handleBreadCrumbItemClicked = (step: BreadCrumbStep) => {
        navigateToBreadcrumb(step);
    }

    const ExpandableListItems = () => {
        return (
            <>
                {
                    filteredDropDownItems.map((item) => (
                        <InputItem
                            key={item.label}
                            item={item}
                            onItemSelect={handleItemSelect}
                            onMoreIconClick={handleInputsMoreIconClick}
                        />
                    ))
                }
            </>
        )
    }

    return (
        <div style={{
            display: "flex",
            flexDirection: "column",
            height: "100%",
            overflow: "hidden"
        }}>

            <BreadcrumbNavigation
                breadCrumbSteps={breadCrumbSteps}
                onNavigateToBreadcrumb={handleBreadCrumbItemClicked}
            />
            {isInArrayContext && (
                <ArrayIndexRow>
                    <ArrayIndexLabel>Index</ArrayIndexLabel>
                    <ArrayIndexControls>
                        <ArrayIndexStepButton onClick={() => handleArrayIndexStep(-1)} disabled={localArrayIndex === 0}>
                            -
                        </ArrayIndexStepButton>
                        <ArrayIndexBadge>{localArrayIndex}</ArrayIndexBadge>
                        <ArrayIndexStepButton onClick={() => handleArrayIndexStep(1)}>
                            +
                        </ArrayIndexStepButton>
                    </ArrayIndexControls>
                </ArrayIndexRow>
            )}
            {dropdownItems.length >= 6 && (
                <div style={{ display: "flex", justifyContent: "center", alignItems: "center", margin: "3px 8px", gap: '5px' }}>
                    <SearchBox sx={{ width: "100%" }} placeholder='Search' value={searchValue} onChange={handleSearch} />
                </div>
            )}

            <ScrollableContainer style={{ margin: '8px 0px' }}>
                {isLoading || !showContent ? (
                    <HelperPaneCustom.Loader />
                ) : (
                    <>
                        {filteredDropDownItems.length === 0 ? (
                            <EmptyItemsPlaceHolder message={searchValue ? "No inputs found for your search" : "No inputs found"} />
                        ) : (
                            <ExpandableList>
                                <ExpandableListItems />
                            </ExpandableList>
                        )}
                    </>
                )}
            </ScrollableContainer>
        </div>
    )
}
