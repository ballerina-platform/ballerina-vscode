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

import { useSlidingPane, CompletionItem, Divider, HelperPaneCustom, SearchBox, Typography, ThemeColors, Button, TextField, Codicon } from "@wso2/ui-toolkit";
import { ExpressionProperty, LineRange } from "@wso2/ballerina-core";
import React, { useEffect, useMemo, useState } from "react";
import { getPropertyFromFormField, useFieldContext, InputMode } from "@wso2/ballerina-side-panel";
import { ExpandableList } from "../Components/ExpandableList";
import { ScrollableContainer } from "../Components/ScrollableContainer";
import { EmptyItemsPlaceHolder } from "../Components/EmptyItemsPlaceHolder";
import { useHelperPaneNavigation, BreadCrumbStep } from "../hooks/useHelperPaneNavigation";
import { BreadcrumbNavigation } from "../Components/BreadcrumbNavigation";
import { AIDocumentType } from "./Documents";
import { VariableItem } from "./Variables";
import FooterButtons from "../Components/FooterButtons";
import { POPUP_IDS, useModalStack } from "../../../../Context";

type DocumentConfigProps = {
    onChange: (value: string, isRecordConfigureChange: boolean, shouldKeepHelper?: boolean) => void;
    onClose: () => void;
    targetLineRange: LineRange;
    filteredCompletions: CompletionItem[];
    currentValue: string;
    handleRetrieveCompletions: (value: string, property: ExpressionProperty, offset: number, triggerCharacter?: string) => Promise<void>;
    isInModal?: boolean;
    inputMode?: InputMode;
};

const AI_DOCUMENT_TYPES = Object.values(AIDocumentType);

type DocumentMetadataInput = {
    mimeType?: string;
};

const serializeMetadata = (metadata?: DocumentMetadataInput): string => {
    if (!metadata) return '';
    const parts: string[] = [];
    const mime = metadata.mimeType?.trim();
    if (mime) parts.push(`mimeType: ${mime}`);
    return parts.length ? `, metadata: {${parts.join(', ')}}` : '';
};

// Helper function to wrap content in document structure
const wrapInDocumentType = (
    documentType: AIDocumentType,
    content: string,
    isTemplateMode: boolean,
    metadata?: DocumentMetadataInput
): string => {
    return `<${documentType}>{content: ${content}${serializeMetadata(metadata)}}`;
};

type MimeTypeMode = 'text' | 'variable';

const ModeToggle = ({ mode, onChange }: { mode: MimeTypeMode; onChange: (m: MimeTypeMode) => void }) => {
    const tabStyle = (active: boolean): React.CSSProperties => ({
        padding: "2px 0",
        marginRight: 12,
        background: "transparent",
        border: "none",
        borderBottom: active ? `2px solid ${ThemeColors.PRIMARY}` : "2px solid transparent",
        color: active ? ThemeColors.PRIMARY : ThemeColors.ON_SURFACE_VARIANT,
        cursor: "pointer",
        font: "inherit",
        fontSize: 12,
        fontWeight: active ? 600 : 400
    });
    return (
        <div style={{ display: "flex", alignItems: "center" }}>
            <button
                type="button"
                onClick={() => onChange('text')}
                style={tabStyle(mode === 'text')}
                aria-pressed={mode === 'text'}
            >
                Text
            </button>
            <button
                type="button"
                onClick={() => onChange('variable')}
                style={tabStyle(mode === 'variable')}
                aria-pressed={mode === 'variable'}
            >
                Variable
            </button>
        </div>
    );
};

export const DocumentConfig = ({ onChange, onClose, targetLineRange, filteredCompletions, currentValue, handleRetrieveCompletions, isInModal, inputMode }: DocumentConfigProps) => {
    const { getParams } = useSlidingPane();
    const params = getParams();
    const documentType = (params?.documentType as AIDocumentType) || AIDocumentType.FileDocument;
    const [searchValue, setSearchValue] = useState<string>("");
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [showContent, setShowContent] = useState<boolean>(false);
    const [metadataExpanded, setMetadataExpanded] = useState<boolean>(false);
    const [mimeTypeMode, setMimeTypeMode] = useState<'text' | 'variable'>('text');
    const [mimeTypeLiteral, setMimeTypeLiteral] = useState<string>("");
    const [mimeTypeVariable, setMimeTypeVariable] = useState<string>("");
    const mimeTypeSerialized = useMemo(() => {
        if (mimeTypeMode === 'text') {
            const v = mimeTypeLiteral.trim();
            return v ? `"${v}"` : '';
        }
        return mimeTypeVariable.trim();
    }, [mimeTypeMode, mimeTypeLiteral, mimeTypeVariable]);
    const { breadCrumbSteps, navigateToNext, navigateToBreadcrumb, getCurrentNavigationPath, getLeafSeparator } = useHelperPaneNavigation(`${documentType.charAt(0).toUpperCase() + documentType.slice(1)} Document`);
    const { addModal, closeModal } = useModalStack();

    const { field, triggerCharacters } = useFieldContext();

    // Use navigation path for completions instead of currentValue
    const navigationPath = useMemo(() => getCurrentNavigationPath(), [breadCrumbSteps]);
    const completionContext = useMemo(() =>
        navigationPath ? navigationPath + getLeafSeparator() : (currentValue ?? ''),
        [navigationPath, currentValue, breadCrumbSteps]
    );

    useEffect(() => {
        setIsLoading(true);
        const triggerCharacter =
            completionContext.length > 0
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

    }, [targetLineRange, breadCrumbSteps, completionContext]);

    // Get allowed types based on document type
    const getAllowedTypes = (docType: AIDocumentType): string[] => {
        const baseTypes = ["string", "ai:Url", "byte[]"];

        switch (docType) {
            case AIDocumentType.FileDocument:
                return [...baseTypes, AIDocumentType.FileDocument];
            case AIDocumentType.ImageDocument:
                return [...baseTypes, AIDocumentType.ImageDocument];
            case AIDocumentType.AudioDocument:
                return [...baseTypes, AIDocumentType.AudioDocument];
            default:
                return baseTypes;
        }
    };

    const dropdownItems = useMemo(() => {
        const allowedTypes = getAllowedTypes(documentType);
        const excludedDescriptions = ["Configurable", "Listener", "Client"];
        const otherAIDocTypes = AI_DOCUMENT_TYPES.filter(type => !allowedTypes.includes(type));

        return filteredCompletions.filter((completion) => {
            const { kind, label, description = "", labelDetails } = completion;
            const labelDesc = labelDetails?.description || "";

            // Must be a field or variable, but not "self"
            if ((kind !== "field" && kind !== "variable") || label === "self") return false;

            // Exclude certain description types
            if (excludedDescriptions.some(desc => labelDesc.includes(desc))) return false;

            // Exclude other AI document types
            if (otherAIDocTypes.some(type => description.includes(type) || labelDesc.includes(type))) return false;

            // Include if matches allowed types or is a record
            return allowedTypes.some(type => description.includes(type) || labelDesc.includes(type))
                || labelDesc.includes("Record");
        });
    }, [filteredCompletions, documentType]);

    const filteredDropDownItems = useMemo(() => {
        if (!searchValue || searchValue.length === 0) return dropdownItems;
        return dropdownItems.filter((item) =>
            item.label.toLowerCase().includes(searchValue.toLowerCase())
        );
    }, [searchValue, dropdownItems]);

    const stringVariableOptions = useMemo(() => {
        return filteredCompletions.filter((completion) => {
            const { kind, label, description = "", labelDetails } = completion;
            const labelDesc = labelDetails?.description || "";
            if ((kind !== "variable" && kind !== "field") || label === "self") return false;
            return /\bstring\b/.test(description) || /\bstring\b/.test(labelDesc);
        });
    }, [filteredCompletions]);

    const handleSearch = (searchText: string) => {
        setSearchValue(searchText);
    };

    const handleItemSelect = (value: string, item: CompletionItem) => {
        const description = item.description || "";
        const labelDescription = item.labelDetails?.description || "";
        const typeInfo = description || labelDescription;

        // Build full path from navigation; use ?. when the parent step is optional OR the
        // field itself is optional/nilable.
        const fullPath = navigationPath ? `${navigationPath}${getLeafSeparator(item.value)}${value}` : value;

        // Check if the variable is already an AI document type
        const isAIDocumentType = AI_DOCUMENT_TYPES.some(type => typeInfo.includes(type));

        // Check if the type is string or byte[] - these need to be wrapped with type casting
        const needsTypeCasting = typeInfo.includes("string") || typeInfo.includes("byte[]") || typeInfo.includes("ai:Url");

        // Check if we're in template mode
        const isTemplateMode = inputMode === InputMode.PROMPT || inputMode === InputMode.TEMPLATE;

        if (isAIDocumentType) {
            // For AI document types, wrap in string interpolation only in template mode
            if (isTemplateMode) {
                onChange(`${fullPath}`, false);
            } else {
                onChange(fullPath, false);
            }
        } else if (needsTypeCasting) {
            // Wrap the variable in the document structure with or without interpolation based on mode
            const wrappedValue = wrapInDocumentType(documentType, fullPath, isTemplateMode, { mimeType: mimeTypeSerialized });
            onChange(wrappedValue, false);
        } else {
            // For other types (records, etc.), insert directly
            onChange(fullPath, false);
        }
    };

    const handleVariablesMoreIconClick = (item: CompletionItem) => {
        const typeDetail = item?.labelDetails?.detail || item?.description;
        navigateToNext(item.label, navigationPath, typeDetail, item.value);
    };

    const handleBreadCrumbItemClicked = (step: BreadCrumbStep) => {
        navigateToBreadcrumb(step);
    };

    const ExpandableListItems = () => {
        return (
            <>
                {
                    filteredDropDownItems.map((item) => (
                        <VariableItem
                            key={item.label}
                            item={item}
                            onItemSelect={handleItemSelect}
                            onMoreIconClick={handleVariablesMoreIconClick}
                            hideArrow={(AI_DOCUMENT_TYPES as string[]).includes(item.description)}
                        />
                    ))
                }
            </>
        );
    };

    const URLInputModal = () => {
        const [url, setUrl] = useState<string>("");

        const handleCreate = () => {
            if (!url.trim()) {
                return;
            }
            const isTemplateMode = inputMode === InputMode.PROMPT;
            const wrappedValue = wrapInDocumentType(documentType, `"${url.trim()}"`, isTemplateMode, { mimeType: mimeTypeSerialized });
            onChange(wrappedValue, false, false);
            closeModal(POPUP_IDS.DOCUMENT_URL);
        };

        return (
            <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <TextField
                    label="URL"
                    description={`Provide a URL to load the ${documentType} document from`}
                    value={url}
                    onTextChange={setUrl}
                    placeholder="Enter URL"
                    autoFocus={true}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            handleCreate();
                        }
                    }}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                    <Button
                        appearance="primary"
                        onClick={handleCreate}
                        disabled={!url.trim()}
                    >
                        Create
                    </Button>
                </div>
            </div>
        );
    };

    const handleAddFromURL = () => {
        addModal(
            <URLInputModal />,
            POPUP_IDS.DOCUMENT_URL,
            "Insert Hardcoded URL",
            220,
            355
        );
    };

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
            {dropdownItems.length >= 6 && (
                <div style={{ display: "flex", justifyContent: "center", alignItems: "center", margin: "3px 5px", height: "20px", gap: '5px' }}>
                    <SearchBox sx={{ width: "100%" }} placeholder='Search' value={searchValue} onChange={handleSearch} />
                </div>
            )}

            <ScrollableContainer style={{ margin: '8px 0px' }}>
                {isLoading || !showContent ? (
                    <HelperPaneCustom.Loader />
                ) : (
                    <>
                        {filteredDropDownItems.length === 0 ? (
                            <EmptyItemsPlaceHolder message={searchValue ? "No variables found for your search" : `No variables found for ${documentType} documents`} />
                        ) : (
                            <ExpandableList>
                                <ExpandableListItems />
                            </ExpandableList>
                        )}
                    </>
                )}
            </ScrollableContainer>

            <Divider sx={{ margin: "0px" }} />
            <div>
                <button
                    type="button"
                    onClick={() => setMetadataExpanded(prev => !prev)}
                    style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "6px 10px",
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        color: ThemeColors.ON_SURFACE,
                        font: "inherit",
                        textAlign: "left"
                    }}
                    aria-expanded={metadataExpanded}
                >
                    <Codicon name={metadataExpanded ? "chevron-down" : "chevron-right"} iconSx={{ fontSize: 12 }} />
                    <Typography variant="body3" sx={{ fontWeight: 600 }}>MIME Type (optional)</Typography>
                    {!metadataExpanded && mimeTypeSerialized && (
                        <Typography
                            variant="body3"
                            sx={{ color: ThemeColors.ON_SURFACE_VARIANT, marginLeft: "4px", fontWeight: 400 }}
                        >
                            — {mimeTypeSerialized}
                        </Typography>
                    )}
                </button>
                {metadataExpanded && (
                    <div style={{ padding: "4px 10px 8px", display: "flex", flexDirection: "column", gap: "6px" }}>
                        <ModeToggle
                            mode={mimeTypeMode}
                            onChange={setMimeTypeMode}
                        />
                        {mimeTypeMode === 'text' ? (
                            <TextField
                                value={mimeTypeLiteral}
                                onTextChange={setMimeTypeLiteral}
                                placeholder="e.g. image/png"
                            />
                        ) : (
                            <>
                                <TextField
                                    value={mimeTypeVariable}
                                    onTextChange={setMimeTypeVariable}
                                    placeholder="Pick a variable below, or type its name"
                                />
                                <div style={{ maxHeight: 140, overflowY: "auto" }}>
                                    {stringVariableOptions.length === 0 ? (
                                        <Typography
                                            variant="body3"
                                            sx={{ color: ThemeColors.ON_SURFACE_VARIANT, padding: "6px 4px" }}
                                        >
                                            No string variables available in this scope.
                                        </Typography>
                                    ) : (
                                        <ExpandableList>
                                            {stringVariableOptions.map((opt) => (
                                                <VariableItem
                                                    key={opt.label}
                                                    item={opt}
                                                    onItemSelect={(val) => setMimeTypeVariable(navigationPath ? `${navigationPath}${getLeafSeparator()}${val}` : val)}
                                                    onMoreIconClick={() => { }}
                                                    hideArrow={true}
                                                />
                                            ))}
                                        </ExpandableList>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>
            <Divider sx={{ margin: "0px" }} />
            {!isInModal && (
                <div style={{ margin: '4px 0' }}>
                    <FooterButtons onClick={handleAddFromURL} title="Insert Hardcoded URL" />
                </div>
            )}
        </div>
    );
};
