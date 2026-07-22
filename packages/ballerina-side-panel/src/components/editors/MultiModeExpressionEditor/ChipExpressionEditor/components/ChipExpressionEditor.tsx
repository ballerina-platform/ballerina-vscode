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

import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, keymap, tooltips, placeholder, hoverTooltip } from "@codemirror/view";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useFormContext } from "../../../../../context";
import {
    buildNeedTokenRefetchListner,
    buildOnChangeListner,
    chipPlugin,
    chipTheme,
    completionTheme,
    tokenField,
    tokensChangeEffect,
    expressionEditorKeymap,
    buildCompletionSource,
    buildHelperPaneKeymap,
    buildOnFocusListner,
    CursorInfo,
    buildOnFocusOutListner,
    buildOnSelectionChange,
    SyncDocValueWithPropValue,
    isSelectionOnToken,
    createTooltipHeader,
    createParametersSection,
    createDocumentationSection,
    createTooltipContainer,
    createTooltipPositioningHandlers,
    AVERAGE_HELPER_PANE_HEIGHT
} from "../CodeUtils";
import { correctTokenStreamPositions, normalizeEditorValue } from "../utils";
import { history } from "@codemirror/commands";
import { autocompletion } from "@codemirror/autocomplete";
import { FloatingButtonContainer, FloatingToggleButton, ChipEditorContainer } from "../styles";
import { CHIP_EXPRESSION_EDITOR_HEIGHT } from "../constants";
import { HelperpaneOnChangeOptions } from "../../../../Form/types";
import { CompletionItem, FnSignatureDocumentation, HelperPaneHeight } from "@wso2/ui-toolkit";
import { CloseHelperIcon, ExpandIcon, MinimizeIcon, OpenHelperIcon } from "./FloatingButtonIcons";
import { LineRange } from "@wso2/ballerina-core";
import { HelperPaneToggleButton } from "./HelperPaneToggleButton";
import { HelperPane } from "./HelperPane";
import { listContinuationKeymap } from "../../../ExpandedEditor/utils/templateUtils";
import { ChipExpressionEditorDefaultConfiguration } from "../ChipExpressionDefaultConfig";
import { ChipExpressionEditorConfig } from "../../Configurations";
import { HELPER_PANE_WIDTH } from "../constants";
import { processFunctionWithArguments } from "../utils";
import { useHelperPaneClickOutside, useHelperPane } from "../hooks/useHelperPane";
import { InputMode } from "../types";

export type ChipExpressionEditorComponentProps = {
    onTokenRemove?: (token: string) => void;
    onTokenClick?: (token: string) => void;
    onBlur?: () => void;
    isExpandedVersion: boolean;
    getHelperPane?: (
        value: string,
        onChange: (value: string, options?: HelperpaneOnChangeOptions) => void,
        helperPaneHeight: HelperPaneHeight
    ) => React.ReactNode;
    completions: CompletionItem[];
    onChange: (updatedValue: string, updatedCursorPosition: number) => void;
    value: string | undefined;
    fileName?: string;
    extractArgsFromFunction?: (value: string, cursorPosition: number) => Promise<{
        label: string;
        args: string[];
        currentArgIndex: number;
        documentation?: FnSignatureDocumentation;
    }>;
    targetLineRange: LineRange;
    onOpenExpandedMode?: () => void;
    onRemove?: () => void;
    isInExpandedMode?: boolean;
    sx?: React.CSSProperties;
    sanitizedExpression?: (value: string) => string;
    rawExpression?: (value: string) => string;
    showHelperPaneToggle?: boolean;
    onHelperPaneStateChange?: (state: {
        isOpen: boolean;
        ref: React.RefObject<HTMLButtonElement>;
        toggle: () => void
    }) => void;
    onEditorViewReady?: (view: EditorView) => void;
    toolbarRef?: React.RefObject<HTMLDivElement>;
    enableListContinuation?: boolean;
    configuration?: ChipExpressionEditorDefaultConfiguration;
    inputMode?: InputMode;
    hideFxButton?: boolean;
    disabled?: boolean;
    placeholder?: string;
    onNormalizeValue?: (value: string) => void;
    containerRef?: React.RefObject<HTMLElement>;
    onLoadingStateChange?: (isLoading: boolean) => void;
}

export const ChipExpressionEditorComponent = (props: ChipExpressionEditorComponentProps) => {
    const { configuration = new ChipExpressionEditorConfig() } = props;
    const editorRef = useRef<HTMLDivElement>(null);
    const helperPaneRef = useRef<HTMLDivElement>(null);
    const fieldContainerRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const [isTokenUpdateScheduled, setIsTokenUpdateScheduled] = useState(true);
    const [isValueResolving, setIsValueResolving] = useState(() => !!props.value);

    useEffect(() => {
        props.onLoadingStateChange?.(isValueResolving);
    }, [isValueResolving]);
    const completionsRef = useRef<CompletionItem[]>(props.completions);
    const helperPaneToggleButtonRef = useRef<HTMLButtonElement>(null);
    const completionsFetchScheduledRef = useRef<boolean>(false);

    const { expressionEditor } = useFormContext();
    const expressionEditorRpcManager = expressionEditor?.rpcManager;

    async function docTooltip(view: EditorView, pos: number) {
        const value = view.state.doc.toString()
        const fnSignature = await props.extractArgsFromFunction?.(value, pos);
        if (!fnSignature) return null;

        return {
            pos: pos,
            end: pos,
            above: true,
            create() {
                const dom = createTooltipContainer();
                dom.appendChild(createTooltipHeader(fnSignature.label));

                if (fnSignature.args && fnSignature.args.length > 0) {
                    dom.appendChild(createParametersSection(fnSignature.args, fnSignature.currentArgIndex));
                }
                if (fnSignature.documentation) {
                    dom.appendChild(createDocumentationSection(fnSignature.documentation));
                }
                const { mount, destroy } = createTooltipPositioningHandlers(view);
                
                return { 
                    dom,
                    mount,
                    destroy
                };
            }
        };
    }

    const tooltipExtension = hoverTooltip((view, pos) => {
        return docTooltip(view, pos);
    });
    // Create a stable compartment for the editable configuration
    const editableCompartment = useMemo(() => new Compartment(), []);

    // Memoize the getCursorCoords function to avoid unnecessary re-renders
    const getCursorCoords = React.useCallback(() => {
        return viewRef.current?.coordsAtPos(viewRef.current.state.selection.main.head) || null;
    }, []);

    // Helper pane state management with conditional fixed placement for toolbar toggle in PROMPT mode
    const { helperPaneState, setHelperPaneState, handleManualToggle, handleKeyboardToggle } = useHelperPane(
        {
            editorRef,
            toggleButtonRef: helperPaneToggleButtonRef,
            helperPaneWidth: HELPER_PANE_WIDTH,
            containerRef: props.containerRef,
            onStateChange: props.onHelperPaneStateChange,
            customManualToggle: props.inputMode === InputMode.PROMPT && props.isInExpandedMode ? (setHelperPaneState) => {
                if (!editorRef?.current) return;

                setHelperPaneState(prev => {
                    if (prev.isOpen) return { ...prev, isOpen: false };
                    const scrollTop = editorRef.current!.scrollTop || 0;
                    return { isOpen: true, top: scrollTop, left: 10 };
                });
            } : undefined
        },
        getCursorCoords
    );

    const needTokenRefetchListner = buildNeedTokenRefetchListner(() => {
        setIsTokenUpdateScheduled(true);
    });

    const handleChangeListner = buildOnChangeListner((newValue, cursor) => {
        completionsFetchScheduledRef.current = true;
        props.onChange(configuration.deserializeValue(newValue), cursor.position.to);
        const textBeforeCursor = newValue.slice(0, cursor.position.to);
        const lastNonSpaceChar = textBeforeCursor.trimEnd().slice(-1);
        const isTrigger = lastNonSpaceChar === '+' || lastNonSpaceChar === ':';
        const isRangeSelection = cursor.position.to !== cursor.position.from;

        if (newValue === '' || isTrigger || isRangeSelection) {
            setHelperPaneState({ isOpen: true, top: cursor.top, left: cursor.left, isFlipped: cursor.isFlipped });
        } else {
            setHelperPaneState({ isOpen: false, top: 0, left: 0 });
        }
    }, props.containerRef);

    const handleFocusListner = buildOnFocusListner((cursor: CursorInfo) => {
        setHelperPaneState({ isOpen: true, top: cursor.top, left: cursor.left, isFlipped: cursor.isFlipped });
    }, props.containerRef);

    const handleSelectionChange = buildOnSelectionChange((cursor: CursorInfo) => {
        setHelperPaneState({ isOpen: true, top: cursor.top, left: cursor.left, isFlipped: cursor.isFlipped });
    }, props.containerRef);

    const handleFocusOutListner = buildOnFocusOutListner(() => {
        setIsTokenUpdateScheduled(true);
        props.onBlur?.();
    });

    const waitForStateChange = (): Promise<CompletionItem[]> => {
        return new Promise((resolve) => {
            const checkState = () => {
                if (!completionsFetchScheduledRef.current) {
                    resolve(completionsRef.current);
                } else {
                    requestAnimationFrame(checkState);
                }
            };
            checkState();
        });
    };

    const completionSource = useMemo(() => {
        return buildCompletionSource(waitForStateChange);
    }, [props.completions]);

    const helperPaneKeymap = buildHelperPaneKeymap(
        () => helperPaneState.isOpen,
        () => {
            setHelperPaneState(prev => ({ ...prev, isOpen: false }));
        },
        handleKeyboardToggle
    );

    const onHelperItemSelect = async (value: string, options: HelperpaneOnChangeOptions) => {
        if (!viewRef.current) return;
        const view = viewRef.current;

        if (options.closeHelperPane) {
            setHelperPaneState(prev => ({ ...prev, isOpen: false }));
        }

        // Use saved selection if available, otherwise fall back to current selection
        const currentSelection = view.state.selection.main;
        const { from, to } = options?.replaceFullText ? { from: 0, to: view.state.doc.length } : currentSelection;
        
        const selectionIsOnToken = isSelectionOnToken(currentSelection.from, currentSelection.to, view);
        const newValue = selectionIsOnToken ? value : configuration.getHelperValue(value);

        let finalValue = newValue;
        let cursorPosition = from + newValue.length;

        // HACK: this should be handled properly with completion items template
        // current API response sends an incorrect response
        // if API sends $1,$2.. for the arguments in the template
        // then we can directly handled it without explicitly calling the API
        // and extracting args
        if (newValue.endsWith('()') || newValue.endsWith(')}')) {
            if (props.extractArgsFromFunction) {
                const result = await processFunctionWithArguments(
                    newValue,
                    props.extractArgsFromFunction
                );
                finalValue = result.finalValue;
                cursorPosition = from + result.cursorAdjustment;
            }
        }

        view.dispatch({
            changes: { from, to, insert: finalValue },
            selection: { anchor: cursorPosition }
        });

        if (options.closeHelperPane) {
            setIsTokenUpdateScheduled(true);
        }
    }

    useEffect(() => {
        if (!editorRef.current) return;
        const startState = EditorState.create({
            doc: configuration.serializeValue(props.value ?? ""),
            extensions: [
                ...(configuration.getPlugins()),
                history(),
                keymap.of([
                    ...helperPaneKeymap,
                    ...(props.enableListContinuation ? listContinuationKeymap : []),
                    ...expressionEditorKeymap
                ]),
                autocompletion({
                    override: [completionSource],
                    activateOnTyping: true,
                    closeOnBlur: true,
                    compareCompletions: () => 0
                }),
                tooltips({ position: "absolute" }),
                chipPlugin,
                tokenField,
                placeholder(props.placeholder),
                chipTheme,
                completionTheme,
                EditorView.lineWrapping,
                editableCompartment.of(EditorView.editable.of(!props.disabled)),
                needTokenRefetchListner,
                handleChangeListner,
                handleFocusListner,
                handleFocusOutListner,
                tooltipExtension,
                handleSelectionChange,
                ...(props.isInExpandedMode || props.hideFxButton
                    ? [EditorView.theme({
                        "&": { height: "100%" },
                        ".cm-scroller": { overflow: "auto", maxHeight: "100%" }
                    })]
                    : props.sx && 'height' in props.sx && props.sx.height
                        ? [EditorView.theme({
                            "&": {
                                height: typeof props.sx.height === 'number' ?
                                    `${props.sx.height}px` :
                                    props.sx.height
                            },
                            ".cm-scroller": { overflow: "auto" }
                        })]
                        : [EditorView.theme({
                            "&": { maxHeight: "150px" },
                            ".cm-scroller": { overflow: "auto", maxHeight: "150px" }
                        })])
            ]
        });
        const view = new EditorView({
            state: startState,
            parent: editorRef.current
        });
        viewRef.current = view;

        // Notify parent component that the editor view is ready
        if (props.onEditorViewReady) {
            props.onEditorViewReady(view);
        }

        return () => {
            view.destroy();
        };
    }, []);

    useEffect(() => {
        if (props.value == null || !viewRef.current) return;
        const serializedValue = configuration.serializeValue(props.value);
        const deserializeValue = configuration.deserializeValue(props.value);
        if (normalizeEditorValue(deserializeValue) !== normalizeEditorValue(props.value)) {
            if (props.onNormalizeValue) {
                props.onNormalizeValue(deserializeValue);
            } else {
                props.onChange(deserializeValue, deserializeValue.length);
            }
            return;
        }
        let cancelled = false;
        const updateEditorState = async () => {
            const currentDoc = viewRef.current!.state.doc.toString();
            const isExternalUpdate = serializedValue !== currentDoc;

            if (!isTokenUpdateScheduled && !isExternalUpdate) {
                setIsValueResolving(false);
                return;
            }

            const startLine = props.targetLineRange?.startLine;
            const tokenStream = await expressionEditorRpcManager?.getExpressionTokens(
                deserializeValue,
                props.fileName,
                startLine !== undefined ? startLine : undefined
            );

            // Drop stale responses where the value changed mid-await
            if (cancelled) return;

            const prefixCorrectedTokenStream = tokenStream
                ? correctTokenStreamPositions(
                    tokenStream,
                    serializedValue,
                    configuration.getSerializationPrefix().length,
                    configuration.getSerializationSuffix().length
                )
                : tokenStream;
            setIsTokenUpdateScheduled(false);
            const effects = prefixCorrectedTokenStream ? [tokensChangeEffect.of({
                tokens: prefixCorrectedTokenStream
            })] : [];
            const changes = isExternalUpdate
                ? { from: 0, to: viewRef.current!.state.doc.length, insert: serializedValue }
                : undefined;
            const annotations = isExternalUpdate ? [SyncDocValueWithPropValue.of(true)] : [];

            viewRef.current!.dispatch({
                ...(effects.length > 0 && { effects }),
                ...(changes && { changes }),
                ...(annotations.length > 0 && { annotations }),
            });
            setIsValueResolving(false);
        };
        updateEditorState();
        return () => { cancelled = true; };
    }, [props.value, props.fileName, props.targetLineRange?.startLine, isTokenUpdateScheduled]);

    useEffect(() => {
        completionsRef.current = props.completions;
        completionsFetchScheduledRef.current = false;
    }, [props.completions]);

    // Update editor editable state when disabled prop changes
    useEffect(() => {
        if (!viewRef.current) return;
        viewRef.current.dispatch({
            effects: editableCompartment.reconfigure(EditorView.editable.of(!props.disabled))
        });
    }, [props.disabled, editableCompartment]);

    // Handle click outside and escape key for helper pane
    useHelperPaneClickOutside({
        enabled: helperPaneState.isOpen,
        refs: {
            editor: editorRef,
            helperPane: helperPaneRef,
            toggleButton: helperPaneToggleButtonRef,
            toolbar: props.toolbarRef
        },
        onClickOutside: () => {
            setHelperPaneState(prev => ({ ...prev, isOpen: false }));
            viewRef.current?.dom.blur();
        },
        onEscapeKey: () => {
            setHelperPaneState(prev => ({ ...prev, isOpen: false }));
        }
    });

    const showToggle = props.showHelperPaneToggle !== false && props.isExpandedVersion;

    return (
        <>
            {showToggle && configuration.getIsToggleHelperAvailable() && (
                <HelperPaneToggleButton
                    ref={helperPaneToggleButtonRef}
                    isOpen={helperPaneState.isOpen}
                    onClick={handleManualToggle}
                    title="Toggle Helper Panel (Ctrl+/ or Cmd+/)"
                />
            )}
            <ChipEditorContainer ref={fieldContainerRef} style={{
                position: 'relative',
                ...props.sx,
                ...(props.isInExpandedMode || props.hideFxButton ? { height: '100%' } : props.sx && 'height' in props.sx ? {} : { height: 'auto' })
            }}>
                {!props.isInExpandedMode && !props.hideFxButton && configuration.getAdornment()({ onClick: () => { } })}
                <div style={{
                    position: 'relative',
                    width: '100%',
                    minHeight: `${CHIP_EXPRESSION_EDITOR_HEIGHT}px`,
                    ...(props.isInExpandedMode || props.hideFxButton || (props.sx && 'height' in props.sx) ? { height: '100%' } : {})
                }}>
                    <div ref={editorRef} style={{
                        border: '1px solid var(--vscode-dropdown-border)',
                        width: '100%',
                        height: '100%',
                        visibility: isValueResolving ? 'hidden' : 'visible'
                    }} />
                    {helperPaneState.isOpen && configuration.showHelperPane() &&
                        <HelperPane
                            ref={helperPaneRef}
                            top={helperPaneState.top}
                            left={helperPaneState.left}
                            isFlipped={helperPaneState.isFlipped}
                            getHelperPane={props.getHelperPane}
                            value={props.value}
                            onChange={onHelperItemSelect}
                        />
                    }
                    {/* Expand stays available when disabled; helper toggle is editing-only. */}
                    {(props.onOpenExpandedMode || !props.disabled) && (
                        <FloatingButtonContainer>
                            {!props.disabled && !props.isExpandedVersion && configuration.getIsToggleHelperAvailable() &&
                                <FloatingToggleButton
                                    ref={helperPaneToggleButtonRef}
                                    onClick={handleManualToggle}
                                    title={helperPaneState.isOpen ? "Close Helper Panel" : "Open Helper Panel"}
                                >
                                    {helperPaneState.isOpen ? <CloseHelperIcon /> : <OpenHelperIcon />}
                                </FloatingToggleButton>}
                            {props.onOpenExpandedMode && (
                                <FloatingToggleButton onClick={props.onOpenExpandedMode} title={props.isInExpandedMode ? "Minimize Editor" : "Expand Editor"}>
                                    {props.isInExpandedMode ? <MinimizeIcon /> : <ExpandIcon />}
                                </FloatingToggleButton>
                            )}
                        </FloatingButtonContainer>
                    )}
                </div>
            </ChipEditorContainer>
        </>

    );
}
