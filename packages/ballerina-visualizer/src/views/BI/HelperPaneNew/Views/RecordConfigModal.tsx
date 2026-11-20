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

import { AvailableNode, CodeData, GetRecordConfigResponse, GetRecordConfigRequest, LineRange, RecordTypeField, TypeField, RecordSourceGenRequest, RecordSourceGenResponse, GetRecordModelFromSourceRequest, GetRecordModelFromSourceResponse, ExpressionProperty, NodeKind, getPrimaryInputType, getSecondaryInputType, InputType } from "@wso2/ballerina-core";
import { Dropdown, HelperPane, Typography, HelperPaneHeight, FormExpressionEditorRef, ErrorBanner, ProgressRing, ThemeColors } from "@wso2/ui-toolkit";
import styled from "@emotion/styled";
import { useEffect, useMemo, useReducer, useRef, useState, RefObject } from "react";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { RecordConfigView } from "./RecordConfigView";
import { ChipExpressionEditorComponent, Context as FormContext, HelperpaneOnChangeOptions, FieldProvider, FormField, FormExpressionEditorProps, getPropertyFromFormField, RecordConfigExpressionEditorConfig, ExpandedEditor, InputMode, ModeToggle } from "@wso2/ballerina-side-panel";
import { RecordFormView, ExpressionEditorArgs, FieldFooterArgs } from "../Components/RecordFormView";
import { RecordFormSkeleton } from "../../../../components/Skeletons";
import { ConfigurableLine } from "../Components/RecordFormView/ConfigurableLine";
import { adoptsExistingValue, choicesToSend, configurableFields, FieldConfigurable, FieldConfigurables, fieldAtPath, isConfigurable, parameterKey, planRename, RenameConfigurable, renameConfigurableInChoices, replaceIdentifiers, shownName } from "../Components/RecordFormView/configurables";
import { useConfigurableRename } from "../Components/RecordFormView/useConfigurableRename";
import type { ConnectionConfigurableChoices, ConnectionConfigurablePreview, ConnectionConfigurablesResponse } from "@wso2/ballerina-core";

/**
 * Lets a connection's record field, new or edited, make its simple values configurable. The connection form supplies it; the
 * names come from the language server, which saves the connection with them.
 */
export interface RecordConfigurablesSupport {
    /** What the user chose for this field earlier, by field path. */
    initialChoices: FieldConfigurables;
    /** The configurables saving would create for the record's current value and the user's choices. */
    preview: (recordValue: string, choices: ConnectionConfigurableChoices) => Promise<ConnectionConfigurablesResponse>;
    /** Whenever the user's choices change: what to save the connection with, and everything the form knows of them. */
    onChoicesChange: (choices: ConnectionConfigurableChoices, all: FieldConfigurables) => void;
    /** Renames a configurable the connection already uses across the project, as soon as the user agrees. */
    rename: RenameConfigurable;
    /**
     * Whether the connection is new, so its required values start configurable. An existing connection's literals
     * stay unless the user makes them configurable.
     */
    newConnection: boolean;
}
import { PromptFieldEditorContext } from "../Components/RecordConstructView/PromptFieldEditorContext";
import { useForm } from "react-hook-form";
import { debounce } from "lodash";
import ReactMarkdown from "react-markdown";
import { updateFieldsSelection } from "../Components/RecordConstructView/utils";
import { normalizeIntersections } from "../Components/RecordConstructView/utils/intersection";
import { ChipExpressionEditorDefaultConfiguration } from "@wso2/ballerina-side-panel/lib/components/editors/MultiModeExpressionEditor/ChipExpressionEditor/ChipExpressionDefaultConfig";

type ConfigureRecordPageProps = {
    fileName: string;
    targetLineRange?: LineRange;
    onChange: (value: string, isRecordConfigureChange: boolean) => void;
    currentValue: string;
    recordTypeField: RecordTypeField;
    onClose: () => void;
    getHelperPane: (
        fieldKey: string,
        exprRef: RefObject<FormExpressionEditorRef>,
        anchorRef: RefObject<HTMLDivElement>,
        defaultValue: string,
        value: string,
        onChange: (value: string, options?: HelperpaneOnChangeOptions) => void,
        changeHelperPaneState: (isOpen: boolean) => void,
        helperPaneHeight: HelperPaneHeight,
        recordTypeField?: RecordTypeField,
        isAssignIdentifier?: boolean,
        defaultTypes?: InputType[],
    ) => React.ReactNode;
    field?: FormField;
    triggerCharacters: readonly string[];
    /** Present only for a connection's record field, new or edited, whose simple values can be made configurable. */
    configurables?: RecordConfigurablesSupport;
    formContext: {
        expressionEditor: FormExpressionEditorProps;
        popupManager: {
            addPopup: (modal: React.ReactNode, id: string, title: string, height?: number, width?: number, onClose?: () => void) => void;
            removeLastPopup: () => void;
            closePopup: (id: string) => void;
        };
        nodeInfo: {
            kind: NodeKind;
        };
        onRequestCreateConnection?: (params: {
            selectedConnector: AvailableNode;
            onSaved: (variableName: string) => void;
        }) => void;
        onCreateNode?: (
            kind: string,
            onCreated: (variableName: string) => void,
            nodeCodeData?: CodeData
        ) => void;
    };
};

export const LabelContainer = styled.div({
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    paddingBottom: '20px'
});

export const TwoColumnLayout = styled.div({
    display: 'flex',
    gap: '16px',
    height: '100%',
    overflow: 'hidden'
});

export const LeftColumn = styled.div({
    flex: '1',
    minWidth: '300px',
    overflow: 'auto',
    position: 'relative'
});

export const RightColumn = styled.div({
    flex: '1',
    minWidth: '300px',
    borderLeft: '1px solid var(--vscode-panel-border)',
    paddingLeft: '16px',
    display: 'flex',
    flexDirection: 'column'
});

export const LoadingOverlay = styled.div({
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'var(--vscode-editor-background)',
    opacity: 0.5,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000
});

export const ExpressionEditorContainer = styled.div({
    flex: '1',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    minHeight: 0,
    overflow: 'hidden'
});

export const ExpressionEditorLabel = styled.div({
    fontSize: 'var(--vscode-font-size)',
    color: 'var(--vscode-foreground)',
    fontWeight: 500,
    marginBottom: '8px'
});

export const ExpressionEditorDocumentation = styled.div({
    fontSize: 'var(--vscode-font-size)',
    color: 'var(--vscode-descriptionForeground)',
    marginTop: '4px',
    marginBottom: '8px',
    '& p': {
        margin: 0,
        marginBottom: '4px'
    }
});

export const RightColumnHeader = styled.div({
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '4px'
});

export const FormContainer = styled.div({
    flex: '1',
    minHeight: 0,
    overflowY: 'auto',
    paddingRight: '4px'
});

export const NotAFormMessage = styled.div({
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    padding: '24px 12px',
    textAlign: 'center',
    color: ThemeColors.ON_SURFACE_VARIANT,
    border: `1px dashed ${ThemeColors.OUTLINE_VARIANT}`,
    borderRadius: '4px'
});

export const SwitchToCodeButton = styled.button({
    padding: 0,
    border: 0,
    background: 'transparent',
    color: 'var(--vscode-textLink-foreground)',
    cursor: 'pointer',
    font: 'inherit'
});

/** Under the code view: each configurable the record uses and the value it is set to. */
export const ConfigurablesBox = styled.div({
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    padding: '8px 10px',
    border: `1px solid ${ThemeColors.OUTLINE_VARIANT}`,
    borderRadius: '4px',
    fontFamily: 'var(--vscode-editor-font-family, monospace)',
    fontSize: '12px',
    maxHeight: '120px',
    overflowY: 'auto',
    flexShrink: 0
});

export const ConfigurablesTitle = styled.div({
    fontFamily: 'var(--vscode-font-family)',
    fontSize: '11px',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: ThemeColors.ON_SURFACE_VARIANT,
    marginBottom: '2px'
});

export const ConfigurableEntry = styled.div({
    display: 'flex',
    gap: '6px',
    minWidth: 0,
    whiteSpace: 'nowrap'
});

export const ConfigurableEquals = styled.span({
    color: ThemeColors.ON_SURFACE_VARIANT
});

export const ConfigurableValue = styled.span({
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis'
});

/** How the right side of the modal shows the record: as a form of its fields, or as source. */
type RecordView = "form" | "code";

/**
 * How bringing the code view's code into the model ended: applied (or nothing to apply), left for newer code,
 * or refused because the code has errors.
 */
type CodeSyncResult = "synced" | "stale" | "invalid" | "timeout";

/** How long the code view's sync waits for diagnostics that may never come before it gives up as stale. */
const DIAGNOSTICS_WAIT_MS = 5000;

type FieldExpressionEditorProps = {
    args: ExpressionEditorArgs;
    fileName: string;
    targetLineRange?: LineRange;
    triggerCharacters: readonly string[];
    expressionEditor: FormExpressionEditorProps;
    getHelperPane: ConfigureRecordPageProps["getHelperPane"];
};

/** The expression editor of one field of the form, the same chip editor the code view and the side panel use. */
function FieldExpressionEditor(props: FieldExpressionEditorProps) {
    const { args, fileName, targetLineRange, triggerCharacters, expressionEditor, getHelperPane } = props;
    const exprRef = useRef<FormExpressionEditorRef>(null);
    const anchorRef = useRef<HTMLDivElement>(null);
    // The editor is controlled; the form writes the model without redrawing on every keystroke.
    const [value, setValue] = useState<string>(args.value);

    const fieldDefinition: FormField = {
        key: args.id,
        label: args.field.name || args.id,
        type: "EXPRESSION",
        value,
        optional: true,
        editable: true,
        documentation: "",
        enabled: true,
        types: []
    };

    const handleChange = (updatedValue: string, cursorPosition: number) => {
        setValue(updatedValue);
        args.onChange(updatedValue);
        expressionEditor.retrieveCompletions?.(
            updatedValue,
            getPropertyFromFormField({ ...fieldDefinition, value: updatedValue }),
            cursorPosition
        );
    };

    const fieldHelperPane = getHelperPane
        ? (current: string, onChange: (value: string, options?: HelperpaneOnChangeOptions) => void, helperPaneHeight: HelperPaneHeight) =>
            getHelperPane(args.id, exprRef, anchorRef, "", current, onChange, () => { }, helperPaneHeight)
        : undefined;

    return (
        <FieldProvider initialField={fieldDefinition} triggerCharacters={triggerCharacters}>
            <div ref={anchorRef} style={{ minWidth: 0 }}>
                <ChipExpressionEditorComponent
                    completions={expressionEditor.completions}
                    onChange={handleChange}
                    value={value}
                    fileName={fileName}
                    targetLineRange={targetLineRange}
                    getHelperPane={fieldHelperPane}
                    configuration={new ChipExpressionEditorDefaultConfiguration()}
                    isExpandedVersion={false}
                    hideFxButton={true}
                    containerRef={anchorRef}
                />
            </div>
        </FieldProvider>
    );
}

export function ConfigureRecordPage(props: ConfigureRecordPageProps) {
    const { fileName, onChange, currentValue, recordTypeField, onClose, targetLineRange, getHelperPane, field, triggerCharacters, formContext, configurables } = props;
    const { rpcClient } = useRpcContext();

    const [recordModel, setRecordModel] = useState<TypeField[]>([]);
    const recordModelRef = useRef<TypeField[]>([]);
    // Package coordinates of the currently selected record type, captured when building the
    // getRecordConfig request and reused for the generateValue (getRecordSource) call so the
    // backend can resolve imports.
    const codedataRef = useRef<RecordSourceGenRequest["codedata"]>(undefined);
    // Guards against a stale getRecordSource response overwriting a newer one
    const modelChangeRequestIdRef = useRef<number>(0);
    const [selectedMemberName, setSelectedMemberName] = useState<string>("");
    const firstRender = useRef<boolean>(true);
    const initialMountRef = useRef<boolean>(true);
    const onChangeRef = useRef(onChange);
    const sourceCode = useRef<string>(currentValue);
    // Loading from the start: the record is fetched as the modal opens, and the form shows a skeleton until then.
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [hasTooManyFieldsError, setHasTooManyFieldsError] = useState<boolean>(false);
    const TOO_MANY_FIELDS_ERROR = "Record config is too large to send. The record type has too many nested fields.";
    // Local state for expression value - only update form on save/close
    const [localExpressionValue, setLocalExpressionValue] = useState<string>(currentValue);
    // Diagnostics state
    const [formDiagnostics, setFormDiagnostics] = useState<any[]>(field?.diagnostics || []);

    const [promptEditTarget, setPromptEditTarget] = useState<{ param: TypeField; onChange: () => void } | null>(null);

    // The form is the default view; the code view is today's editor.
    const [recordView, setRecordView] = useState<RecordView>("form");
    // Redraws the form and the tree after the form changes the model's shape (fields, items, choices).
    const [modelRevision, redrawModel] = useReducer((count: number) => count + 1, 0);

    // The connection's configurables. What the user chose (by field path) and any rename in progress live here,
    // not in the form's fields, so both survive switching to the code view and back.
    const [configurableChoices, setConfigurableChoices] = useState<FieldConfigurables>(
        () => configurables?.initialChoices ?? {});
    // The record as saving will write it, with the configurables' names, and the value it stands for.
    const [shownSource, setShownSource] = useState<{ literal: string; text: string } | null>(null);
    // What is typed in the code view while it shows names; the model holds the values the names stand for.
    const [codeDraft, setCodeDraft] = useState<string | null>(null);
    // Opening an existing connection: its configurables' values are read before the form shows them.
    const [adoptingConfigurables, setAdoptingConfigurables] = useState(false);
    const [configurablePreviews, setConfigurablePreviews] = useState<Record<string, ConnectionConfigurablePreview>>({});
    // Why the last preview failed: shown on each line in place of names that would be stale.
    const [configurablesError, setConfigurablesError] = useState<string | undefined>(undefined);
    // Whether a preview has answered: from then on, a value it gives no configurable shows no line.
    const [previewAnswered, setPreviewAnswered] = useState(false);
    const [renaming, setRenaming] = useState<{ path: string; draft: string } | null>(null);
    const previewRequestIdRef = useRef(0);
    const configurablesRef = useRef(configurables);
    configurablesRef.current = configurables;
    const debouncedPreviewConfigurables = useRef(
        debounce(async (recordValue: string, choices: ConnectionConfigurableChoices, parameter: string) => {
            const support = configurablesRef.current;
            if (!support) {
                return;
            }
            const requestId = ++previewRequestIdRef.current;
            let response: ConnectionConfigurablesResponse | undefined;
            try {
                response = await support.preview(recordValue, choices);
            } catch (error) {
                console.error(">>> Could not preview the record's configurables", error);
                response = { errorMsg: error instanceof Error ? error.message : String(error) };
            }
            if (requestId !== previewRequestIdRef.current) {
                return;
            }
            if (response?.errorMsg) {
                // The names shown were for an earlier value: none is shown until a later preview answers, and each
                // line says why. The user's choices stay as they are.
                setConfigurablesError(`Couldn't work out the configurables: ${response.errorMsg}`);
                setConfigurablePreviews({});
                setShownSource(null);
                return;
            }
            setConfigurablesError(undefined);
            setPreviewAnswered(true);
            // The preview covers every argument of the connection; this modal edits one of them.
            const byPath: Record<string, ConnectionConfigurablePreview> = {};
            (response?.configurables ?? [])
                .filter((preview) => parameterKey(preview) === parameter)
                .forEach((preview) => { byPath[preview.fieldPath] = preview; });
            setConfigurablePreviews(byPath);
            const text = response?.arguments?.[parameter];
            setShownSource(text === undefined ? null : { literal: recordValue, text });
        }, 400)
    ).current;
    // A new key whenever the model is replaced (loaded, re-parsed from code, member switched), so the
    // form's inputs start from the new model rather than keep what they last showed.
    const formRevision = useRef(0);
    const formKey = useMemo(() => ++formRevision.current, [recordModel]);
    // handleModelChange is declared below; the debounced call reaches the latest one through this ref.
    const handleModelChangeRef = useRef<(model: TypeField[]) => Promise<void>>(async () => { });
    // A value typed in the form regenerates the source once typing pauses, as the code view's sync does.
    const debouncedFormValueChange = useRef(
        debounce(() => { handleModelChangeRef.current(recordModelRef.current); }, 300)
    ).current;
    // Each edit of the model (a value typed, an item added or removed, a field checked) is numbered. The parent has
    // been given the source of every edit up to the delivered one; closing the modal gives it the rest.
    const editRevisionRef = useRef(0);
    const deliveredRevisionRef = useRef(0);
    // The edits the source in localExpressionValue covers, counted as delivered once the parent is given it.
    const revisionOfLocalValueRef = useRef(0);
    const handleFormValueChange = () => {
        editRevisionRef.current++;
        debouncedFormValueChange();
    };
    const sendUnsentFormEditRef = useRef<() => Promise<void>>(async () => { });

    const isWrappedPrompt = (value: string) =>
        value.length >= 2 && value.startsWith("`") && value.endsWith("`");
    const sanitizePrompt = (value: string) =>
        value && isWrappedPrompt(value) ? value.slice(1, -1) : value;
    const wrapPrompt = (value: string) =>
        value && !isWrappedPrompt(value) ? `\`${value}\`` : value;

    // Debounced so the getRecordSource RPC and parameter-tree remount don't fire on every keystroke
    const debouncedNotifyPromptChange = useRef(
        debounce((target: { onChange: () => void }) => target.onChange(), 300)
    ).current;

    const handlePromptChange = (updatedValue: string) => {
        if (!promptEditTarget) {
            return;
        }
        promptEditTarget.param.value = wrapPrompt(updatedValue);
        promptEditTarget.param.selected = true;
        debouncedNotifyPromptChange(promptEditTarget);
    };

    const closePromptEditor = () => {
        debouncedNotifyPromptChange.flush();
        setPromptEditTarget(null);
    };

    const promptField: FormField | null = promptEditTarget && {
        key: "instructions",
        label: promptEditTarget.param.name || "Prompt",
        type: "EXPRESSION",
        optional: promptEditTarget.param.optional ?? true,
        editable: true,
        documentation: promptEditTarget.param.documentation || "",
        value: promptEditTarget.param.value || "",
        types: [{ fieldType: "RAW_TEMPLATE", ballerinaType: "ai:Prompt", selected: true }],
        enabled: true
    };

    // Refs for helper pane
    const exprRef = useRef<FormExpressionEditorRef>(null);
    const anchorRef = useRef<HTMLDivElement>(null);
    const modalContainerRef = useRef<HTMLDivElement>(null);

    // Ref to track the latest expression value that should be synced
    // This prevents intermediate values from overwriting the final value
    const latestExpressionToSyncRef = useRef<string>(localExpressionValue);

    // Adapter to match ChipExpressionBaseComponent's signature by providing a default property from recordTypeField.
    const wrappedExtractArgsFromFunction = formContext.expressionEditor.extractArgsFromFunction
        ? async (value: string, cursorPosition: number) => {
            // Create a default property from recordTypeField
            const defaultProperty: ExpressionProperty = {
                metadata: recordTypeField.property?.metadata,
                value: value,
                optional: recordTypeField.property?.optional,
                editable: recordTypeField.property?.editable,
                advanced: recordTypeField.property?.advanced,
                placeholder: recordTypeField.property?.placeholder,
                types: recordTypeField.property?.types,
                codedata: recordTypeField.property?.codedata,
                imports: recordTypeField.property?.imports,
                diagnostics: recordTypeField.property?.diagnostics
            };
            return await formContext.expressionEditor.extractArgsFromFunction(value, defaultProperty, cursorPosition);
        }
        : undefined;

    // Create form context for ChipExpressionBaseComponent
    const { control, watch, setValue, getValues, register, unregister, setError, clearErrors, formState } = useForm();

    const formContextValue = {
        form: {
            control,
            watch,
            setValue,
            getValues,
            register,
            unregister,
            setError,
            clearErrors,
            formState
        },
        expressionEditor: formContext.expressionEditor,
        targetLineRange: targetLineRange || { startLine: { line: 1, offset: 0 }, endLine: { line: 1, offset: 0 } },
        fileName: fileName,
        popupManager: formContext.popupManager,
        nodeInfo: formContext.nodeInfo,
        onRequestCreateConnection: formContext.onRequestCreateConnection,
        onCreateNode: formContext.onCreateNode
    };

    useEffect(() => {
        if (firstRender.current) {
            firstRender.current = false;
            if (currentValue) {
                getExistingRecordModel();
            } else {
                getNewRecordModel();
            }

            // Fetch initial diagnostics if value exists
            if (currentValue && formContext.expressionEditor.getExpressionFormDiagnostics && targetLineRange) {
                fetchDiagnostics(currentValue);
            }
        } else if (currentValue !== sourceCode.current) {
            // Close helper pane if user changed the value in the expression editor
            onClose();
        }
    }, [currentValue]);

    useEffect(() => {
        onChangeRef.current = onChange;
    }, [onChange]);

    // Auto-propagate localExpressionValue changes to parent form (remove need for Save button)
    useEffect(() => {
        // Skip the first render to avoid calling onChange with initial value
        if (initialMountRef.current) {
            initialMountRef.current = false;
            return;
        }

        onChangeRef.current(localExpressionValue, true);
        deliveredRevisionRef.current = Math.max(deliveredRevisionRef.current, revisionOfLocalValueRef.current);
    }, [localExpressionValue]);

    const fetchRecordModelFromSource = async (currentValue: string) => {
        setIsLoading(true);
        setHasTooManyFieldsError(false);
        try {
            let org = "";
            let module = "";
            let version = "";
            let packageInfo = "";

            if (recordTypeField.recordTypeMembers[0].packageInfo?.length > 0) {
                const parts = recordTypeField.recordTypeMembers[0].packageInfo.split(':');
                if (parts.length === 3) {
                    [org, module, version] = parts;
                    packageInfo = recordTypeField.recordTypeMembers[0].packageInfo;
                }
            } else {
                const tomValues = await rpcClient.getCommonRpcClient().getCurrentProjectTomlValues();
                org = tomValues?.package?.org || "";
                module = tomValues?.package?.name || "";
                version = tomValues?.package?.version || "";
            }
            packageInfo = `${org}:${module}:${version}`;
            recordTypeField.recordTypeMembers[0].packageInfo = packageInfo;
            const getRecordModelFromSourceRequest: GetRecordModelFromSourceRequest = {
                filePath: fileName,
                typeMembers: recordTypeField.recordTypeMembers,
                expr: currentValue
            };

            const getRecordModelFromSourceResponse: GetRecordModelFromSourceResponse =
                await rpcClient.getBIDiagramRpcClient().getRecordModelFromSource(getRecordModelFromSourceRequest);

            if (getRecordModelFromSourceResponse.errorMsg) {
                setHasTooManyFieldsError(getRecordModelFromSourceResponse.errorMsg === TOO_MANY_FIELDS_ERROR);
                setRecordModel([]);
                recordModelRef.current = [];
                return;
            }

            const newRecordModel = getRecordModelFromSourceResponse.recordConfig;

            if (newRecordModel) {
                const recordConfig: TypeField = {
                    name: newRecordModel.name,
                    ...normalizeIntersections(newRecordModel)
                };

                setRecordModel([recordConfig]);
                recordModelRef.current = [recordConfig];
                setSelectedMemberName(newRecordModel.name);

                recordTypeField.recordTypeMembers.forEach(m => {
                    m.selected = m.type === newRecordModel.name;
                });
            }
        } catch (error) {
            setHasTooManyFieldsError(false);
            setRecordModel([]);
            recordModelRef.current = [];
        } finally {
            setIsLoading(false);
        }
    }


    const getExistingRecordModel = async () => {
        if (configurables) {
            // Until the configurables the connection uses are read in, their fields would show as references.
            setAdoptingConfigurables(true);
        }
        await fetchRecordModelFromSource(currentValue);
        await adoptExistingConfigurables(currentValue);
    };



    // Helper function to auto-select the first record in the model.
    // Also selects required fields recursively within that record.
    const autoSelectFirstRecord = (model: TypeField[]) => {
        if (!model || model.length === 0) return;

        const recordConfig = model[0];

        // Select the first record itself
        recordConfig.selected = true;

        // If the record has fields, recursively select required fields
        if (recordConfig.fields && recordConfig.fields.length > 0) {
            updateFieldsSelection(recordConfig.fields as any, true);
        }
    };

    const getNewRecordModel = async () => {
        setIsLoading(true);
        setHasTooManyFieldsError(false);
        const defaultSelection = recordTypeField.recordTypeMembers[0];
        setSelectedMemberName(defaultSelection.type);
        try {
            let org = "";
            let module = "";
            let version = "";
            let packageName = "";

            if (defaultSelection?.packageInfo?.length > 0) {
                const parts = defaultSelection.packageInfo.split(':');
                if (parts.length === 3) {
                    [org, module, version] = parts;
                    packageName = defaultSelection.packageName;
                }
            } else {
                const tomValues = await rpcClient.getCommonRpcClient().getCurrentProjectTomlValues();
                org = tomValues?.package?.org || "";
                module = tomValues?.package?.name || "";
                version = tomValues?.package?.version || "";
                packageName = tomValues?.package?.name || "";
            }

            const request: GetRecordConfigRequest = {
                filePath: fileName,
                codedata: {
                    org: org,
                    module: module,
                    version: version,
                    packageName: packageName,
                },
                typeConstraint: defaultSelection.type,
            };
            codedataRef.current = request.codedata;
            const typeFieldResponse: GetRecordConfigResponse = await rpcClient.getBIDiagramRpcClient().getRecordConfig(request);
            console.log(">>> GetRecordConfigResponse", typeFieldResponse);
            if (typeFieldResponse.errorMsg) {
                setHasTooManyFieldsError(typeFieldResponse.errorMsg === TOO_MANY_FIELDS_ERROR);
                return;
            }
            if (typeFieldResponse.recordConfig) {
                const recordConfig: TypeField = {
                    name: defaultSelection.type,
                    ...normalizeIntersections(typeFieldResponse.recordConfig)
                };

                const newModel = [recordConfig];
                setRecordModel(newModel);
                recordModelRef.current = newModel;

                autoSelectFirstRecord(newModel);
                await handleModelChange(newModel);
            }
        } catch (error) {
            setHasTooManyFieldsError(false);
            setRecordModel([]);
            recordModelRef.current = [];
        } finally {
            setIsLoading(false);
        }
    }

    const handleMemberChange = async (value: string) => {
        const member = recordTypeField.recordTypeMembers.find(m => m.type === value);
        if (!member) {
            return;
        }

        // Update selected flags so the backend receives the correct type on submit
        recordTypeField.recordTypeMembers.forEach(m => {
            m.selected = m.type === value;
        });
        setIsLoading(true);
        setHasTooManyFieldsError(false);
        setSelectedMemberName(member.type);
        try {
            let org = "";
            let module = "";
            let version = "";

            // Parse packageInfo if it exists
            if (member.packageInfo) {
                const parts = member.packageInfo.split(':');
                if (parts.length === 3) {
                    [org, module, version] = parts;
                }
            }

            const request: GetRecordConfigRequest = {
                filePath: fileName,
                codedata: {
                    org: org,
                    module: module,
                    version: version,
                    packageName: member?.packageName,
                },
                typeConstraint: member.type,
            }
            codedataRef.current = request.codedata;

            const typeFieldResponse: GetRecordConfigResponse = await rpcClient.getBIDiagramRpcClient().getRecordConfig(request);
            if (typeFieldResponse.errorMsg) {
                setHasTooManyFieldsError(typeFieldResponse.errorMsg === TOO_MANY_FIELDS_ERROR);
                setRecordModel([]);
                recordModelRef.current = [];
                return;
            }
            if (typeFieldResponse.recordConfig) {
                const recordConfig: TypeField = {
                    name: member.type,
                    ...normalizeIntersections(typeFieldResponse.recordConfig)
                }

                const newModel = [recordConfig];
                setRecordModel(newModel);
                recordModelRef.current = newModel;

                // Auto-select the first field when union member changes
                autoSelectFirstRecord(newModel);

                // Generate source with the auto-selected field
                await handleModelChange(newModel);
            }
        } catch (error) {
            setRecordModel([]);
            recordModelRef.current = [];
        } finally {
            setIsLoading(false);
        }
    };

    const recordSourceRequest = (updatedModel: TypeField[]): RecordSourceGenRequest => {
        // The expression editor type (e.g. the union "jco:DestinationConfig|jco:AdvancedConfig")
        // is the type the generated value is assigned to. Send it as the typeConstraint so the
        // backend can derive the correct value. Optional, so older backends remain unaffected.
        const typeConstraint = getSecondaryInputType(recordTypeField?.property?.types)?.ballerinaType;
        return {
            filePath: fileName,
            type: updatedModel[0],
            ...(typeConstraint ? { typeConstraint } : {}),
            ...(codedataRef.current ? { codedata: codedataRef.current } : {})
        };
    };

    sendUnsentFormEditRef.current = async () => {
        try {
            const response = await rpcClient.getBIDiagramRpcClient()
                .getRecordSource(recordSourceRequest(recordModelRef.current));
            if (response?.recordValue !== undefined) {
                onChangeRef.current(response.recordValue, true);
            }
        } catch (error) {
            console.error(">>> Could not write the record's last edit on closing", error);
        }
    };

    // Closed before the last edit reached the parent: generate its source and give it now.
    useEffect(() => () => {
        if (deliveredRevisionRef.current >= editRevisionRef.current) {
            return;
        }
        debouncedFormValueChange.cancel();
        // A source generation still in flight answers a modal that is gone.
        modelChangeRequestIdRef.current++;
        void sendUnsentFormEditRef.current();
    }, []);

    const handleModelChange = async (updatedModel: TypeField[]) => {
        const requestId = ++modelChangeRequestIdRef.current;
        // The edits this source covers: an edit made while it is generated is not among them.
        const revision = editRevisionRef.current;
        const request = recordSourceRequest(updatedModel);
        // Not logged: the source can hold configurables' values read from Config.toml.
        const recordSourceResponse: RecordSourceGenResponse = await rpcClient.getBIDiagramRpcClient().getRecordSource(request);

        // Drop the response if a newer call to handleModelChange has since started
        if (requestId !== modelChangeRequestIdRef.current) {
            return;
        }

        if (recordSourceResponse.recordValue !== undefined) {
            const content = recordSourceResponse.recordValue;
            sourceCode.current = content;
            // Update local expression value (which updates the ExpressionEditor on the right)
            // Also update latestExpressionToSyncRef to prevent outdated syncs
            latestExpressionToSyncRef.current = content;
            setLocalExpressionValue(content);
            revisionOfLocalValueRef.current = revision;
            // Fetch diagnostics for the updated expression
            fetchDiagnostics(content);
        }
    }

    handleModelChangeRef.current = handleModelChange;

    // The form changed the model's shape: redraw the tree and the form, and regenerate the source now.
    const handleFormStructureChange = () => {
        editRevisionRef.current++;
        debouncedFormValueChange.cancel();
        redrawModel();
        handleModelChange(recordModelRef.current);
    };

    // The tree changed which fields are checked: the form shows the checked ones, so it redraws too.
    const handleTreeModelChange = (updatedModel: TypeField[]) => {
        editRevisionRef.current++;
        // The code view then shows the source regenerated with the change, not code typed before it.
        setCodeDraft(null);
        redrawModel();
        handleModelChange(updatedModel);
    };

    // A connection: tell the connection form what to save with, and ask the language server for the names.
    useEffect(() => {
        const record = recordModelRef.current[0];
        if (!configurables || !record) {
            return;
        }
        const send = choicesToSend(record, configurableChoices, configurables.newConnection);
        configurables.onChoicesChange(send, configurableChoices);
        debouncedPreviewConfigurables(localExpressionValue, send, field?.key ?? recordTypeField.key);
    }, [configurableChoices, localExpressionValue, modelRevision, recordModel]);

    useEffect(() => () => debouncedPreviewConfigurables.cancel(), []);

    const setConfigurableChoice = (path: string, choice: Partial<FieldConfigurable>) => {
        setConfigurableChoices((previous) => ({ ...previous, [path]: { ...previous[path], ...choice } }));
    };

    // A configurable the connection already uses is renamed across the project as soon as the user agrees; every
    // value of this record that uses it then shows the new name, and the preview catches up with the source.
    const configurableRename = useConfigurableRename(configurables?.rename, (path, { from, to }) => {
        setConfigurableChoices((previous) => renameConfigurableInChoices(previous, from, to));
        setRenaming((current) => (current?.path === path ? null : current));
    });

    /**
     * Applies a rename in progress. A name that is not an identifier stays in the box to be fixed, as does one that
     * renames a configurable across the project, until the user agrees to it.
     */
    const commitRename = (): boolean => {
        if (!renaming) {
            return true;
        }
        const done = configurableRename.commit({
            key: renaming.path,
            choice: configurableChoices[renaming.path],
            draft: renaming.draft,
            generated: configurablePreviews[renaming.path]?.name,
            applyName: (choice) => setConfigurableChoice(renaming.path, choice),
            interactive: true
        });
        if (done) {
            setRenaming(null);
        }
        return done;
    };

    const cancelRename = (path: string) => {
        configurableRename.clear(path);
        setRenaming(null);
    };

    // Closed with a valid name still in its box: the connection form is given it, as leaving the Form view applies
    // it. A rename across the project waits for the user to agree, which a closed modal can't ask, so it is dropped.
    const commitRenameOnCloseRef = useRef<() => void>(() => undefined);
    commitRenameOnCloseRef.current = () => {
        const record = recordModelRef.current[0];
        if (!renaming || !configurables || !record) {
            return;
        }
        const choice = configurableChoices[renaming.path];
        const plan = planRename(choice, renaming.draft, configurablePreviews[renaming.path]?.name);
        if (plan.kind !== "name") {
            return;
        }
        const all = { ...configurableChoices, [renaming.path]: { ...choice, ...plan.choice } };
        configurables.onChoicesChange(choicesToSend(record, all, configurables.newConnection), all);
    };
    useEffect(() => () => commitRenameOnCloseRef.current(), []);

    const renderConfigurableLine = (args: FieldFooterArgs) => {
        // Only a literal can become a configurable, and the language server doesn't look inside a list.
        if (args.isExpression || args.path.includes("[")) {
            return null;
        }
        const choice = configurableChoices[args.path];
        const on = isConfigurable(args.field, choice, configurables.newConnection);
        const preview = configurablePreviews[args.path];
        const editing = renaming?.path === args.path;
        // The language server keeps some values in source whatever the choice (an empty string, a line break, `.5`,
        // a byte) and gives them no configurable: a checked line would say they move to Config.toml.
        if (previewAnswered && !configurablesError && !preview && !editing) {
            return null;
        }
        return (
            <ConfigurableLine
                path={args.path}
                on={on}
                name={shownName(choice, preview)}
                error={configurableRename.errorFor(args.path) ?? preview?.error ?? configurablesError}
                existing={choice?.existing}
                editing={editing}
                draft={editing ? renaming.draft : undefined}
                busy={configurableRename.isBusy(args.path)}
                confirmation={configurableRename.confirmationFor(args.path)}
                onToggle={(next) => {
                    setConfigurableChoice(args.path, { keep: !next });
                    if (!next && editing) {
                        cancelRename(args.path);
                    }
                }}
                onStartRename={() => setRenaming({
                    path: args.path,
                    draft: shownName(choice, preview) ?? ""
                })}
                onDraftChange={(draft) => {
                    configurableRename.clear(args.path);
                    setRenaming({ path: args.path, draft });
                }}
                onCommit={commitRename}
                onCancel={() => cancelRename(args.path)}
            />
        );
    };

    /** The record's configurables as saving writes them: each name, the name the user gave it, and its value. */
    const activeConfigurables = (() => {
        const record = recordModel[0];
        if (!configurables || !record) {
            return [];
        }
        return configurableFields(record).flatMap(({ path, field }) => {
            const choice = configurableChoices[path];
            const preview = configurablePreviews[path];
            const literal = typeof field.value === "string" ? field.value.trim() : "";
            if (!isConfigurable(field, choice, configurables.newConnection) || !preview || preview.kept || preview.error || !literal) {
                return [];
            }
            return [{ path, name: preview.name, shownName: shownName(choice, preview) ?? preview.name, literal }];
        });
    })();
    const namesToValues = Object.fromEntries(activeConfigurables.flatMap(({ name, shownName, literal }) =>
        [[name, literal], [shownName, literal]]));
    const renamedNames = Object.fromEntries(activeConfigurables
        .filter(({ name, shownName }) => name !== shownName)
        .map(({ name, shownName }) => [name, shownName]));
    // The code view shows names where saving writes them; what is typed there stays as typed until the view changes.
    const codeViewValue = codeDraft
        ?? (shownSource && shownSource.literal === localExpressionValue
            ? replaceIdentifiers(shownSource.text, renamedNames)
            : localExpressionValue);

    /**
     * Opening an existing connection: a field that uses a configurable shows its value from Config.toml, with
     * "Make configurable" checked and the configurable's name, as for a new connection.
     */
    const adoptExistingConfigurables = async (source: string) => {
        const record = recordModelRef.current[0];
        try {
            if (!configurables || !record) {
                return;
            }
            setAdoptingConfigurables(true);
            const parameter = field?.key ?? recordTypeField.key;
            let response: ConnectionConfigurablesResponse | undefined;
            try {
                response = await configurables.preview(source, {});
            } catch (error) {
                response = { errorMsg: error instanceof Error ? error.message : String(error) };
            }
            // The fields then keep showing the configurables they use, as the source has them, and the lines say why.
            if (response?.errorMsg) {
                console.error(">>> Could not read the record's configurables:", response.errorMsg);
                setConfigurablesError(`Couldn't read the configurables' values: ${response.errorMsg}`);
                return;
            }
            const adopted: FieldConfigurables = {};
            (response?.configurables ?? [])
                .filter((preview) => parameterKey(preview) === parameter)
                .forEach((preview) => {
                    const target = fieldAtPath(record, preview.fieldPath);
                    if (target && adoptsExistingValue(preview, target.value)) {
                        target.value = preview.value;
                        adopted[preview.fieldPath] = {
                            name: preview.name, existing: true, declaration: preview.declaration
                        };
                    }
                });
            if (Object.keys(adopted).length === 0) {
                return;
            }
            setConfigurableChoices((previous) => ({ ...adopted, ...previous }));
            const model = [record];
            recordModelRef.current = model;
            setRecordModel(model);
            await handleModelChange(model);
        } finally {
            setAdoptingConfigurables(false);
        }
    };

    const switchRecordView = (view: RecordView) => {
        if (view === recordView) {
            return;
        }
        setCodeDraft(null);
        if (view === "code") {
            // Write what was typed in the form before the code view shows the source.
            debouncedFormValueChange.flush();
            // A valid rename in progress is applied; an invalid one waits in its box for the user to come back.
            commitRename();
        } else {
            // Bring code typed in the code view into the model before the form shows it, and show the form only once
            // it is there: a value typed in it before then would be generated from the model the code replaces.
            // Code not yet in the model and not being brought in (an earlier try timed out): try again.
            if (!syncInFlightRef.current && localExpressionValue !== sourceCode.current) {
                latestExpressionToSyncRef.current = localExpressionValue;
                debouncedSyncExpressionToModel(localExpressionValue);
            }
            debouncedSyncExpressionToModel.flush();
            const sync = syncInFlightRef.current;
            if (sync) {
                setSyncingCode(true);
                void sync
                    // Code with errors, or whose diagnostics never came, can't become the model yet: the user stays
                    // on it, and switching again tries once more.
                    .then((result) => {
                        if (result === "invalid" || result === "timeout") {
                            setRecordView("code");
                        }
                    }, (): void => undefined)
                    .finally(() => setSyncingCode(false));
            }
        }
        setRecordView(view);
    };

    // The code view's syncs waiting for diagnostics, by the code they wait on: whichever request for that code
    // answers, answers them.
    const diagnosticsWaitersRef = useRef<Array<{ expression: string; answer: (diagnostics: any[]) => void }>>([]);
    const answerDiagnosticsWaiters = (expression: string, diagnostics: any[]) => {
        const answered = diagnosticsWaitersRef.current.filter((waiter) => waiter.expression === expression);
        diagnosticsWaitersRef.current = diagnosticsWaitersRef.current.filter((waiter) => waiter.expression !== expression);
        answered.forEach((waiter) => waiter.answer(diagnostics));
    };

    // Debounced function to fetch diagnostics
    const fetchDiagnostics = useRef(
        debounce(async (value: string) => {
            if (!formContext.expressionEditor.getExpressionFormDiagnostics || !targetLineRange) {
                return;
            }

            const fieldKey = field?.key || "expression";
            const property: ExpressionProperty = {
                metadata: recordTypeField?.property?.metadata,
                value: value,
                optional: recordTypeField?.property?.optional || false,
                editable: recordTypeField?.property?.editable !== false,
                advanced: recordTypeField?.property?.advanced,
                placeholder: recordTypeField?.property?.placeholder,
                types: recordTypeField?.property?.types,
                codedata: recordTypeField?.property?.codedata,
                imports: recordTypeField?.property?.imports,
                diagnostics: recordTypeField?.property?.diagnostics
            };

            // Create a callback to update diagnostics in the field
            const handleSetDiagnosticsInfo = (diagnosticsInfo: { key: string; diagnostics: any[] }) => {
                const diagnostics = diagnosticsInfo?.diagnostics || [];
                setFormDiagnostics(diagnostics);
                answerDiagnosticsWaiters(value, diagnostics);
            };

            await formContext.expressionEditor.getExpressionFormDiagnostics(
                !field?.optional || value !== '',
                value,
                fieldKey,
                property,
                handleSetDiagnosticsInfo,
                false, // isVariableNode
                undefined // typeValue
            );
        }, 300)
    ).current;

    // Function to sync expression changes to record model
    // This function fetches diagnostics first, then syncs if there are no errors
    const syncExpressionToModel = async (expressionValue: string): Promise<CodeSyncResult> => {
        // Check if this is still the latest value to sync (user may have typed more)
        if (expressionValue !== latestExpressionToSyncRef.current) {
            return "stale";
        }


        // First, fetch diagnostics for the expression
        if (!formContext.expressionEditor.getExpressionFormDiagnostics || !targetLineRange) {
            console.log(">>> Cannot fetch diagnostics, skipping sync");
            return "synced";
        }

        const fieldKey = field?.key || "expression";
        const property: ExpressionProperty = {
            metadata: recordTypeField?.property?.metadata,
            value: expressionValue,
            optional: recordTypeField?.property?.optional || false,
            editable: recordTypeField?.property?.editable !== false,
            advanced: recordTypeField?.property?.advanced,
            placeholder: recordTypeField?.property?.placeholder,
            types: recordTypeField?.property?.types,
            codedata: recordTypeField?.property?.codedata,
            imports: recordTypeField?.property?.imports,
            diagnostics: recordTypeField?.property?.diagnostics
        };

        // Fetch diagnostics and wait for them. The request shares a debounce with the modal's other diagnostics, so
        // only the last one asked for answers: any request for this code settles the wait. If none does (newer code
        // replaced it), the wait ends as stale.
        const diagnosticsPromise = new Promise<any[] | null>((resolve) => {
            let settled = false;
            const settle = (result: any[] | null) => {
                if (!settled) {
                    settled = true;
                    clearTimeout(timer);
                    diagnosticsWaitersRef.current = diagnosticsWaitersRef.current.filter((w) => w.answer !== settle);
                    resolve(result);
                }
            };
            const timer = setTimeout(() => settle(null), DIAGNOSTICS_WAIT_MS);
            diagnosticsWaitersRef.current.push({ expression: expressionValue, answer: settle });
            const handleSetDiagnosticsInfo = (diagnosticsInfo: { key: string; diagnostics: any[] }) => {
                const diags = diagnosticsInfo?.diagnostics || [];
                setFormDiagnostics(diags);
                answerDiagnosticsWaiters(expressionValue, diags);
            };

            formContext.expressionEditor.getExpressionFormDiagnostics(
                !field?.optional || expressionValue !== '',
                expressionValue,
                fieldKey,
                property,
                handleSetDiagnosticsInfo,
                false, // isVariableNode
                undefined // typeValue
            );
        });

        const diagnostics = await diagnosticsPromise;

        // Check again if this is still the latest value (user may have typed more while waiting for diagnostics)
        if (expressionValue !== latestExpressionToSyncRef.current) {
            return "stale";
        }
        if (diagnostics === null) {
            return "timeout";
        }

        // Check if there are any error diagnostics (severity === 1 indicates error)
        // Only sync if there are no errors
        const hasErrors = diagnostics.some((d: any) => d.severity === 1);

        if (hasErrors) {
            return "invalid";
        }

        // Check if the expression differs from the sourceCode (which represents the record model's expression)
        if (expressionValue !== sourceCode.current) {

            // Parse the expression to update the record model
            await fetchRecordModelFromSource(expressionValue);
            // Update sourceCode to match the new expression value
            sourceCode.current = expressionValue;
        }
        return "synced";
    };

    // Debounced function to sync expression to model when localExpressionValue changes
    // The code view's sync in progress, if any: the form waits for it rather than show the model the code replaces.
    const syncInFlightRef = useRef<Promise<CodeSyncResult> | null>(null);
    const [syncingCode, setSyncingCode] = useState(false);
    const debouncedSyncExpressionToModel = useRef(
        debounce(async (expressionValue: string) => {
            const sync = syncExpressionToModel(expressionValue);
            syncInFlightRef.current = sync;
            try {
                return await sync;
            } finally {
                if (syncInFlightRef.current === sync) {
                    syncInFlightRef.current = null;
                }
            }
        }, 500)
    ).current;

    // Effect to watch localExpressionValue and trigger sync when it differs from sourceCode
    useEffect(() => {
        // Only sync if localExpressionValue differs from sourceCode
        if (localExpressionValue !== sourceCode.current) {
            // Update the latest expression to sync ref
            latestExpressionToSyncRef.current = localExpressionValue;
            debouncedSyncExpressionToModel(localExpressionValue);
        }
    }, [localExpressionValue, debouncedSyncExpressionToModel]);

    const handleExpressionChange = (typedValue: string, updatedCursorPosition: number) => {
        // While the code view shows configurables' names, the record holds the values they stand for.
        const updatedValue = replaceIdentifiers(typedValue, namesToValues);
        if (configurables) {
            setCodeDraft(typedValue);
        }
        // Code typed now replaces every edit made in the form: a source still being generated for one of them is
        // stale, and the parent gets this code instead.
        modelChangeRequestIdRef.current++;
        debouncedFormValueChange.cancel();
        revisionOfLocalValueRef.current = editRevisionRef.current;
        // Update local expression value when user edits in the ExpressionEditor
        setLocalExpressionValue(updatedValue);

        // If the expression is empty, deselect all checkboxes
        if (updatedValue.trim() === '') {
            // Use ref to get the latest recordModel value
            const currentRecordModel = recordModelRef.current;
            // Deselect all fields in the record model
            if (currentRecordModel.length > 0 && currentRecordModel[0]) {
                const recordConfig = currentRecordModel[0];
                // Deselect the record itself
                recordConfig.selected = false;
                // Deselect all fields recursively
                if (recordConfig.fields && recordConfig.fields.length > 0) {
                    updateFieldsSelection(recordConfig.fields as any, false);
                }
                // Update source code to empty to prevent sync issues
                sourceCode.current = '';
                // Update latest expression ref to prevent sync
                latestExpressionToSyncRef.current = '';
                // Trigger re-render by updating recordModel state with a new array reference
                const updatedModel = [...currentRecordModel];
                setRecordModel(updatedModel);
                recordModelRef.current = updatedModel;
            }
            // Clear diagnostics when expression is empty
            setFormDiagnostics([]);
            return;
        }

        // Fetch diagnostics (debounced) - this will update formDiagnostics state
        // The sync will be triggered by the useEffect that watches localExpressionValue
        fetchDiagnostics(updatedValue);

        // Fetch completions when user types - this ensures variable suggestions are available
        if (formContext.expressionEditor.retrieveCompletions && field) {
            const property = getPropertyFromFormField({
                ...field,
                value: typedValue
            });
            formContext.expressionEditor.retrieveCompletions(
                typedValue,
                property,
                updatedCursorPosition
            );
        }
    }

    // Create a wrapper for getHelperPane that adapts to ChipExpressionBaseComponent's signature
    // and updates local expression value
    const wrappedGetHelperPane = getHelperPane
        ? (value: string, onChange: (value: string, options?: HelperpaneOnChangeOptions) => void, helperPaneHeight: HelperPaneHeight) => {

            // Call getHelperPane with all required parameters including refs
            return getHelperPane(
                field?.key || "expression",
                exprRef,
                anchorRef,
                "",
                value,
                onChange,
                () => { }, // changeHelperPaneState - no-op since ChipExpressionBaseComponent handles it
                helperPaneHeight,
                recordTypeField,
                false, // isAssignIdentifier
                typeof getPrimaryInputType(recordTypeField?.property?.types)?.ballerinaType === 'string'
                    ? recordTypeField.property.types
                    : undefined
            );
        }
        : undefined;

    return (
        <>
            <HelperPane.Body sx={{ zIndex: 2001 }} >
              <FormContext.Provider value={formContextValue}>
                <TwoColumnLayout>
                    <LeftColumn>
                        {isLoading && (
                            <LoadingOverlay>
                                <ProgressRing color={ThemeColors.PRIMARY} />
                            </LoadingOverlay>
                        )}
                        {recordTypeField?.recordTypeMembers.length > 1 && (
                            <LabelContainer>
                                <Dropdown
                                    id="type-selector"
                                    label="Type"
                                    value={selectedMemberName}
                                    items={recordTypeField.recordTypeMembers.map((member) => ({
                                        label: member.type,
                                        value: member.type
                                    }))}
                                    sx={{ width: '100%' }}
                                    containerSx={{ width: '100%' }}
                                    onValueChange={(value) => handleMemberChange(value)}
                                />
                            </LabelContainer>
                        )}
                        {hasTooManyFieldsError ? (
                            <Typography variant="body3">Record construction assistance is unavailable due to too many fields in the record type. Please switch to Expression mode.</Typography>
                        ) : selectedMemberName && recordModel?.length > 0 ? (
                            <PromptFieldEditorContext.Provider
                                value={{ openPromptEditor: (param, onChange) => setPromptEditTarget({ param, onChange }) }}
                            >
                                <RecordConfigView
                                    recordModel={recordModel}
                                    onModelChange={handleTreeModelChange}
                                />
                            </PromptFieldEditorContext.Provider>
                        ) : !isLoading ? (
                            <Typography variant="body3">Record construction assistance is unavailable. Please switch to Expression mode.</Typography>
                        ) : null}
                    </LeftColumn>
                    <RightColumn>
                        <ExpressionEditorContainer ref={modalContainerRef}>
                            <div>
                                <RightColumnHeader>
                                    <ExpressionEditorLabel style={{ flex: 1, minWidth: 0, marginBottom: 0 }}>
                                        {field?.label || "Expression"}
                                    </ExpressionEditorLabel>
                                    <ModeToggle
                                        primaryLabel="Form"
                                        secondaryLabel="Code"
                                        secondary={recordView === "code"}
                                        onChange={(code) => switchRecordView(code ? "code" : "form")}
                                        testId="record-view-switch"
                                    />
                                </RightColumnHeader>
                                {/* Below the label and switch, so it takes the column's full width. */}
                                {field?.documentation && (
                                    <ExpressionEditorDocumentation>
                                        <ReactMarkdown>{field.documentation}</ReactMarkdown>
                                    </ExpressionEditorDocumentation>
                                )}
                            </div>
                            {recordView === "form" ? (
                                <FormContainer>
                                    {isLoading || adoptingConfigurables || syncingCode ? (
                                        <RecordFormSkeleton />
                                    ) : recordModel[0] && !hasTooManyFieldsError ? (
                                        <RecordFormView
                                            key={formKey}
                                            record={recordModel[0]}
                                            onValueChange={handleFormValueChange}
                                            onStructureChange={handleFormStructureChange}
                                            renderExpressionEditor={(args) => (
                                                <FieldExpressionEditor
                                                    key={args.id}
                                                    args={args}
                                                    fileName={fileName}
                                                    targetLineRange={targetLineRange}
                                                    triggerCharacters={triggerCharacters}
                                                    expressionEditor={formContext.expressionEditor}
                                                    getHelperPane={getHelperPane}
                                                />
                                            )}
                                            renderFieldFooter={configurables ? renderConfigurableLine : undefined}
                                        />
                                    ) : (
                                        <NotAFormMessage data-testid="record-form-unavailable">
                                            <span>This value can't be shown as a form.</span>
                                            <SwitchToCodeButton type="button" onClick={() => switchRecordView("code")}>
                                                Switch to Code
                                            </SwitchToCodeButton>
                                        </NotAFormMessage>
                                    )}
                                    {formDiagnostics && formDiagnostics.length > 0 && (
                                        <ErrorBanner errorMsg={formDiagnostics.map((d: any) => d.message).join(', ')} />
                                    )}
                                </FormContainer>
                            ) : (
                            <FieldProvider
                                    initialField={field ? {
                                        ...field,
                                        value: localExpressionValue
                                    } : {
                                        key: "expression",
                                        label: "Expression",
                                        type: "EXPRESSION",
                                        value: localExpressionValue,
                                        optional: false,
                                        types: typeof getPrimaryInputType(recordTypeField?.property?.types)?.ballerinaType === 'string'
                                            ? recordTypeField.property?.types ?? []
                                            : [],
                                        metadata: recordTypeField?.property?.metadata,
                                        editable: true,
                                        documentation: "",
                                        enabled: true
                                    }}
                                    triggerCharacters={triggerCharacters}
                                >
                                    <div ref={anchorRef} style={{
                                        flex: 1,
                                        display: 'flex',
                                        flexDirection: 'column',
                                        minHeight: 0,
                                        gap: '8px'
                                    }}>
                                        <ChipExpressionEditorComponent
                                            completions={formContext.expressionEditor.completions}
                                            onChange={handleExpressionChange}
                                            value={codeViewValue}
                                            fileName={fileName}
                                            targetLineRange={targetLineRange}
                                            extractArgsFromFunction={wrappedExtractArgsFromFunction}
                                            getHelperPane={wrappedGetHelperPane}
                                            sx={{
                                                height: "100%",
                                                minHeight: 0,
                                                flex: 1
                                            }}
                                            configuration={new RecordConfigExpressionEditorConfig()}
                                            isExpandedVersion={false}
                                            hideFxButton={true}
                                            containerRef={modalContainerRef}
                                        />
                                        {activeConfigurables.length > 0 && (
                                            <ConfigurablesBox data-testid="record-code-configurables">
                                                <ConfigurablesTitle>Configurables</ConfigurablesTitle>
                                                {activeConfigurables.map(({ path, shownName, literal }) => (
                                                    <ConfigurableEntry key={path}>
                                                        <span>{shownName}</span>
                                                        <ConfigurableEquals>=</ConfigurableEquals>
                                                        <ConfigurableValue title={literal}>{literal}</ConfigurableValue>
                                                    </ConfigurableEntry>
                                                ))}
                                            </ConfigurablesBox>
                                        )}
                                        {formDiagnostics && formDiagnostics.length > 0 && (
                                            <ErrorBanner errorMsg={formDiagnostics.map((d: any) => d.message).join(', ')} />
                                        )}
                                    </div>
                            </FieldProvider>
                            )}
                        </ExpressionEditorContainer>
                    </RightColumn>
                </TwoColumnLayout>
              </FormContext.Provider>

            </HelperPane.Body>
            {promptField && (
                <ExpandedEditor
                    isOpen={!!promptEditTarget}
                    field={promptField}
                    value={promptEditTarget?.param.value || ""}
                    mode={InputMode.PROMPT}
                    zIndex={2101}
                    sanitizedExpression={sanitizePrompt}
                    rawExpression={wrapPrompt}
                    fileName={fileName}
                    targetLineRange={targetLineRange}
                    onChange={handlePromptChange}
                    onClose={closePromptEditor}
                    onSave={closePromptEditor}
                />
            )}
        </>
    );
}
