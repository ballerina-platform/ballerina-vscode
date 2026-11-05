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

import { RefObject, useEffect, useRef, useState } from 'react';

import { ExpandableList } from './Components/ExpandableList';
import { Variables } from './Views/Variables';
import { Inputs } from './Views/Inputs';
import { Documents } from './Views/Documents';
import { DocumentConfig } from './Views/DocumentConfig';
import { CompletionInsertText, EditorConfig, ExpressionProperty, FlowNode, getPrimaryInputType, InputType, LineRange, RecordTypeField } from '@wso2/ballerina-core';
import { CompletionItem, HelperPaneCustom, HelperPaneHeight, Typography } from '@wso2/ui-toolkit';
import { SlidingPane, SlidingPaneHeader, SlidingPaneNavContainer, SlidingWindow } from '@wso2/ui-toolkit';
import { FunctionsPage } from './Views/Functions';
import { FormSubmitOptions } from '../FlowDiagram';
import { Configurables } from './Views/Configurables';
import { DevantConfigurables } from './Views/DevantConfigurables';
import styled from '@emotion/styled';
import { HelperPaneIconType, getHelperPaneIcon } from './utils/iconUtils';
import { ExpressionEditorDevantProps, HelperpaneOnChangeOptions, InputMode, getEditorConfiguration, HelperPaneMenuItem } from '@wso2/ballerina-side-panel';
import { ResolvedType } from '../Forms/FlowNodeForm';

export const AI_PROMPT_TYPE = "ai:Prompt";

export type ValueCreationOption = {
    typeCheck: string | null;
    value: string;
    label: string;
}

export type HelperPaneNewProps = {
    fieldKey: string;
    fileName: string;
    targetLineRange: LineRange;
    anchorRef: RefObject<HTMLDivElement>;
    onClose: () => void;
    defaultValue: string;
    currentValue: string;
    onChange: (value: string, options?: HelperpaneOnChangeOptions) => void;
    helperPaneHeight: HelperPaneHeight;
    recordTypeField?: RecordTypeField;
    updateImports: (key: string, imports: { [key: string]: string }) => void;
    isAssignIdentifier?: boolean;
    completions: CompletionItem[],
    projectPath?: string,
    handleOnFormSubmit?: (updatedNode?: FlowNode, editorConfig?: EditorConfig, options?: FormSubmitOptions) => void
    selectedType?: ResolvedType;
    filteredCompletions?: CompletionItem[];
    isInModal?: boolean;
    types?: InputType[];
    handleRetrieveCompletions: (value: string, property: ExpressionProperty, offset: number, triggerCharacter?: string) => Promise<void>;
    inputMode?: InputMode;
    devantExpressionEditor?: ExpressionEditorDevantProps;
};

const TitleContainer = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
`;

const HelperPaneNewEl = ({
    fieldKey,
    fileName,
    targetLineRange,
    anchorRef,
    onClose,
    currentValue,
    onChange,
    recordTypeField,
    updateImports,
    handleOnFormSubmit,
    selectedType,
    filteredCompletions,
    isInModal,
    types,
    handleRetrieveCompletions,
    inputMode,
    devantExpressionEditor,
}: HelperPaneNewProps) => {
    const [selectedItem, setSelectedItem] = useState<number>();
    const hiddenMenuItems = getEditorConfiguration(inputMode).getHelperPaneHiddenItems();
    const currentMenuItemCount = getPrimaryInputType(types)?.ballerinaType === AI_PROMPT_TYPE ? 5 : 4; 

    // Create refs array for all menu items
    const menuItemRefs = useRef<(HTMLDivElement | null)[]>([]);

    const ifCTRLandUP = (e: KeyboardEvent) => {
        return (
            (e.ctrlKey || e.metaKey) && e.key === "ArrowUp"
        );
    };

    const ifCTRLandDown = (e: KeyboardEvent) => {
        return (
            (e.ctrlKey || e.metaKey) && e.key === "ArrowDown"
        );
    };

    const ifCTRLandENTER = (e: KeyboardEvent) => {
        return (
            (e.ctrlKey || e.metaKey) && e.key === "Enter"
        );
    };

    const handleKeyPress = (event: KeyboardEvent) => {
        if (ifCTRLandUP(event)) {
            setSelectedItem((prev) => {
                const current = prev ?? 0; // if prev is undefined, use 0
                return current > 0 ? current - 1 : current;
            });
        } else if (ifCTRLandENTER(event)) {
            const selectedMenuRef = menuItemRefs.current[selectedItem ?? 0]; // fallback to 0
            if (selectedMenuRef) {
                selectedMenuRef.click();
                event.preventDefault();
            }
        } else if (ifCTRLandDown(event)) {
            setSelectedItem((prev) => {
                const current = prev ?? 0;
                return current < currentMenuItemCount - 1 ? current + 1 : current;
            });
        }
    };

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            event?.key && handleKeyPress(event);
        };

        window.addEventListener("keydown", handleKeyDown);

        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, []);

    const getInsertText = (insertText: string | CompletionInsertText): string => {
        if (typeof insertText === 'string') {
            return insertText;
        }
        return insertText.value;
    };

    const handleChange = (insertText: string | CompletionInsertText, isRecordConfigureChange?: boolean, shouldKeepHelper?: boolean) => {
        if (typeof insertText === 'string') {
            onChange(insertText, {
                closeHelperPane: !shouldKeepHelper,
                replaceFullText: isRecordConfigureChange || false
            });
        }
        else {
            const textToInsert = getInsertText(insertText);
            onChange(textToInsert, {
                closeHelperPane: !shouldKeepHelper,
                replaceFullText: isRecordConfigureChange || false
            });
        }
    };

    // Scroll selected item into view when selection changes
    useEffect(() => {
        if (menuItemRefs.current[selectedItem]) {
            menuItemRefs.current[selectedItem]?.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest'
            });
        }
    }, [selectedItem]);

    return (
        <HelperPaneCustom anchorRef={anchorRef}>
            <HelperPaneCustom.Body>
                <SlidingWindow>
                    <SlidingPane name="PAGE1" paneWidth={300} paneHeight='170px'>
                        <div style={{ padding: '8px 0px' }}>
                            <ExpandableList >
                                {devantExpressionEditor && (
                                    <SlidingPaneNavContainer
                                        ref={el => menuItemRefs.current[0] = el}
                                        to="DEVANT_CONFIGS"
                                    >
                                        <ExpandableList.Item>
                                            {getHelperPaneIcon(HelperPaneIconType.CONFIGURABLE)}
                                            <Typography variant="body3" sx={{ fontWeight: 600 }}>
                                                WSO2 Cloud Configs
                                            </Typography>
                                        </ExpandableList.Item>
                                    </SlidingPaneNavContainer>
                                )}
                                {!hiddenMenuItems.includes(HelperPaneMenuItem.INPUTS) && (
                                <SlidingPaneNavContainer
                                    ref={el => menuItemRefs.current[3] = el}
                                    to="INPUTS"
                                >
                                    <ExpandableList.Item>
                                        {getHelperPaneIcon(HelperPaneIconType.INPUT)}
                                        <Typography variant="body3" sx={{ fontWeight: 600 }}>
                                            Inputs
                                        </Typography>
                                    </ExpandableList.Item>
                                </SlidingPaneNavContainer>
                                )}
                                {!hiddenMenuItems.includes(HelperPaneMenuItem.VARIABLES) && (
                                <SlidingPaneNavContainer
                                    ref={el => menuItemRefs.current[2] = el}
                                    to="VARIABLES"
                                >
                                    <ExpandableList.Item>
                                        {getHelperPaneIcon(HelperPaneIconType.VARIABLE)}
                                        <Typography variant="body3" sx={{ fontWeight: 600 }}>
                                            Variables
                                        </Typography>
                                    </ExpandableList.Item>
                                </SlidingPaneNavContainer>
                                )}
                                {!hiddenMenuItems.includes(HelperPaneMenuItem.CONFIGURABLES) && (
                                <SlidingPaneNavContainer
                                    ref={el => menuItemRefs.current[4] = el}
                                    to="CONFIGURABLES"
                                >
                                    <ExpandableList.Item>
                                        <TitleContainer>
                                            {getHelperPaneIcon(HelperPaneIconType.CONFIGURABLE)}
                                            <Typography variant="body3" sx={{ fontWeight: 600 }}>
                                                Configurables
                                            </Typography>
                                        </TitleContainer>
                                    </ExpandableList.Item>
                                </SlidingPaneNavContainer>
                                )}
                                {!hiddenMenuItems.includes(HelperPaneMenuItem.FUNCTIONS) && (
                                <SlidingPaneNavContainer
                                    ref={el => menuItemRefs.current[5] = el}
                                    to="FUNCTIONS"
                                >
                                    <ExpandableList.Item>
                                        {getHelperPaneIcon(HelperPaneIconType.FUNCTION)}
                                        <Typography variant="body3" sx={{ fontWeight: 600 }}>
                                            Functions
                                        </Typography>
                                    </ExpandableList.Item>
                                </SlidingPaneNavContainer>
                                )}
                                {!hiddenMenuItems.includes(HelperPaneMenuItem.DOCUMENTS) && getPrimaryInputType(types)?.ballerinaType === AI_PROMPT_TYPE && (
                                    <SlidingPaneNavContainer
                                        ref={el => menuItemRefs.current[6] = el}
                                        to="DOCUMENTS"
                                    >
                                        <ExpandableList.Item>
                                            {getHelperPaneIcon(HelperPaneIconType.DOCUMENT)}
                                            <Typography variant="body3" sx={{ fontWeight: 600 }}>
                                                Documents
                                            </Typography>
                                        </ExpandableList.Item>
                                    </SlidingPaneNavContainer>
                                )}
                            </ExpandableList>

                        </div>
                    </SlidingPane>

                    {/* Variables Page */}
                    <SlidingPane name="VARIABLES" paneWidth={300}>
                        <SlidingPaneHeader>
                            Variables
                        </SlidingPaneHeader>
                        <Variables
                            anchorRef={anchorRef}
                            fileName={fileName}
                            onChange={handleChange}
                            targetLineRange={targetLineRange}
                            handleOnFormSubmit={handleOnFormSubmit}
                            selectedType={selectedType}
                            filteredCompletions={filteredCompletions}
                            currentValue={currentValue}
                            recordTypeField={recordTypeField}
                            isInModal={isInModal}
                            handleRetrieveCompletions={handleRetrieveCompletions}
                            onClose={onClose}
                            inputMode={inputMode}
                        />
                    </SlidingPane>

                    {/* Inputs Page */}
                    <SlidingPane name="INPUTS" paneWidth={300}>
                        <SlidingPaneHeader>
                            Inputs
                        </SlidingPaneHeader>
                        <Inputs
                            anchorRef={anchorRef}
                            fileName={fileName}
                            onChange={handleChange}
                            targetLineRange={targetLineRange}
                            filteredCompletions={filteredCompletions}
                            currentValue={currentValue}
                            handleRetrieveCompletions={handleRetrieveCompletions}
                            inputMode={inputMode}
                        />
                    </SlidingPane>

                    {devantExpressionEditor && (
                        <SlidingPane name="DEVANT_CONFIGS" paneWidth={300}>
                            <SlidingPaneHeader> WSO2 Cloud Configs</SlidingPaneHeader>
                            <DevantConfigurables
                                anchorRef={anchorRef}
                                fileName={fileName}
                                onChange={handleChange}
                                targetLineRange={targetLineRange}
                                isInModal={isInModal}
                                onClose={onClose}
                                inputMode={inputMode}
                                devantExpressionEditor={devantExpressionEditor}
                                filteredCompletions={filteredCompletions}
                                handleRetrieveCompletions={handleRetrieveCompletions}
                            />
                        </SlidingPane>
                    )}

                    <SlidingPane name="FUNCTIONS" paneWidth={300}>
                        <SlidingPaneHeader>
                            Functions
                        </SlidingPaneHeader>
                        <FunctionsPage
                            fieldKey={fieldKey}
                            anchorRef={anchorRef}
                            fileName={fileName}
                            targetLineRange={targetLineRange}
                            onClose={onClose}
                            onChange={handleChange}
                            updateImports={updateImports}
                            selectedType={selectedType}
                            inputMode={inputMode} />
                    </SlidingPane>

                    <SlidingPane name="CONFIGURABLES" paneWidth={300}>
                        <SlidingPaneHeader>
                            Configurables
                        </SlidingPaneHeader>
                        <Configurables
                            anchorRef={anchorRef}
                            fileName={fileName}
                            onChange={handleChange}
                            targetLineRange={targetLineRange}
                            isInModal={isInModal}
                            onClose={onClose}
                            inputMode={inputMode}
                            excludedConfigs={devantExpressionEditor?.devantConfigs || []}
                            filteredCompletions={filteredCompletions}
                            handleRetrieveCompletions={handleRetrieveCompletions}
                        />
                    </SlidingPane>

                    {/* Documents Page */}
                    <SlidingPane name="DOCUMENTS" paneWidth={300}>
                        <SlidingPaneHeader>
                            Documents
                        </SlidingPaneHeader>
                        <Documents />
                    </SlidingPane>

                    {/* Single Document Configuration Page - handles all document types */}
                    <SlidingPane name="DOCUMENT_CONFIG" paneWidth={300}>
                        <SlidingPaneHeader>
                            Documents
                        </SlidingPaneHeader>
                        <DocumentConfig
                            onChange={handleChange}
                            onClose={onClose}
                            targetLineRange={targetLineRange}
                            filteredCompletions={filteredCompletions || []}
                            currentValue={currentValue}
                            handleRetrieveCompletions={handleRetrieveCompletions}
                            inputMode={inputMode}
                        />
                    </SlidingPane>
                </SlidingWindow>
            </HelperPaneCustom.Body>
        </HelperPaneCustom >
    );
};

/**
 * Function to render the helper pane for the expression editor
 * 
 * @param fieldKey Key of the field
 * @param fileName File name of the expression editor
 * @param targetLineRange Modified line range of the expression editor
 * @param exprRef Ref object of the expression editor
 * @param anchorRef Ref object of the library browser
 * @param onClose Function to close the helper pane
 * @param defaultValue Default value for the expression editor
 * @param currentValue Current value of the expression editor
 * @param onChange Function to handle changes in the expression editor
 * @param helperPaneHeight Height of the helper pane
 * @param recordTypeField Record type field
 * @param projectPath Project path of the expression editor
 * @param handleOnFormSubmit Function to handle form submission
 * @param updateImports Function to update the import statements of the expression editor
 * @param isAssignIdentifier Boolean indicating whether the expression is an assignment LV_EXPRESSION
 * @returns JSX.Element Helper pane element
 */
export const getHelperPaneNew = (props: HelperPaneNewProps) => {
    const {
        fieldKey,
        fileName,
        targetLineRange,
        anchorRef,
        onClose,
        defaultValue,
        currentValue,
        onChange,
        helperPaneHeight,
        recordTypeField,
        updateImports,
        isAssignIdentifier,
        completions,
        projectPath,
        handleOnFormSubmit,
        selectedType,
        filteredCompletions,
        isInModal,
        types,
    } = props;

    return (
        <HelperPaneNewEl
            fieldKey={fieldKey}
            fileName={fileName}
            targetLineRange={targetLineRange}
            anchorRef={anchorRef}
            onClose={onClose}
            defaultValue={defaultValue}
            currentValue={currentValue}
            onChange={onChange}
            helperPaneHeight={helperPaneHeight}
            recordTypeField={recordTypeField}
            updateImports={updateImports}
            isAssignIdentifier={isAssignIdentifier}
            completions={completions}
            projectPath={projectPath}
            handleOnFormSubmit={handleOnFormSubmit}
            selectedType={selectedType}
            filteredCompletions={filteredCompletions}
            isInModal={isInModal}
            types={types}
            handleRetrieveCompletions={props.handleRetrieveCompletions}
            inputMode={props.inputMode}
            devantExpressionEditor={props.devantExpressionEditor}
        />
    );
};
