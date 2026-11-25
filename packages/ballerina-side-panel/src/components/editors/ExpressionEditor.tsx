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

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Control, Controller, FieldValues, UseFormWatch, UseFormSetValue, UseFormTrigger, UseFormResetField } from 'react-hook-form';
import styled from '@emotion/styled';
import {
    Button,
    Codicon,
    ErrorBanner,
    FormExpressionEditorRef,
    HelperPaneHeight,
    Icon,
    RequiredFormInput,
    ThemeColors
} from '@wso2/ui-toolkit';
import { LinkButton } from "@wso2/ui-toolkit/lib/components/LinkButton/LinkButton";
import { buildRequiredRule, getPropertyFromFormField, isExpandableMode, toEditorMode } from './utils';
import { getDefaultHint } from './defaultHint';
import { buildValidate } from '../Form/validationRules';
import { useFieldDiagnostics } from '../Form/useFieldDiagnostics';
import { WarningBanner } from '../Form/WarningBanner';
import { CollapsibleDescription } from './CollapsibleDescription';
import { dedupeMessages } from '../Form/DiagnosticsStore';
import { FormField, FormExpressionEditorProps, HelperpaneOnChangeOptions } from '../Form/types';
import { useFormContext, useFormFieldLoadingContext } from '../../context';
import {
    ExpressionProperty,
    ExpressionAssistResponse,
    FormDiagnostics,
    getPrimaryInputType,
    InputType,
    isDropDownType,
    LineRange,
    RecordTypeField,
    SubPanel,
    SubPanelView,
    Type
} from '@wso2/ballerina-core';
import ReactMarkdown from 'react-markdown';
import { FieldProvider } from "./FieldContext";
import { useModeSwitcherContext } from "./ModeSwitcherContext";
import ModeSwitcher from '../ModeSwitcher';
import { ExpressionField, getEditorConfiguration } from './ExpressionField';
import { EditorView } from '@codemirror/view';
import { tokensChangeEffect } from './MultiModeExpressionEditor/ChipExpressionEditor/CodeUtils';
import { InputMode } from './MultiModeExpressionEditor/ChipExpressionEditor/types';
import { AssistButton, FieldAssistContext, FieldAssistPanel, Proposal, useFieldAssist } from './FieldAssist/FieldAssist';
import { AssistCard, AssistCardFrame, AssistHostContent, ValueDisplay, reviseInCard, useAssistHost, usePresence, withFieldChange } from './FieldAssist/AssistHost';
import { S as AssistStyles } from './FieldAssist/styles';
import { isSensitiveField, shouldWithhold } from './FieldAssist/secretGuard';
import { getInputModeFromTypes } from './MultiModeExpressionEditor/ChipExpressionEditor/utils';
import { ExpandedEditor } from './ExpandedEditor';
import { SkeletonBase } from '../Skeletons/styles';

import { FieldTypeChip } from "./FieldTypeChip";
export type ContextAwareExpressionEditorProps = {
    id?: string;
    fieldKey?: string;
    fieldInputType: InputType;
    inputTypes?: InputType[];
    placeholder?: string;
    required?: boolean;
    showHeader?: boolean;
    field: FormField;
    initialValue?: string;
    openSubPanel?: (subPanel: SubPanel) => void;
    subPanelView?: SubPanelView;
    handleOnFieldFocus?: (key: string) => void;
    onBlur?: () => void | Promise<void>;
    autoFocus?: boolean;
    recordTypeField?: RecordTypeField;
    helperPaneZIndex?: number;
    isInExpandedMode?: boolean;
};

type diagnosticsFetchContext = {
    fetchedInitialDiagnostics: boolean;
    //TargetLineRange which initial diagnostics fetched
    diagnosticsFetchedTargetLineRange: LineRange;
}

/**
 * Error types react-hook-form raises for its built-in rules. Not `validate`: this editor's
 * `rules.validate` is always an object, whose failures are named after their key, and `validate` is
 * what IfForm/MatchForm/ForkForm/PathEditor use for errors they set from outside.
 */
const RHF_RULE_ERROR_TYPES = ['required', 'pattern', 'min', 'max', 'minLength', 'maxLength'];

type ExpressionEditorProps = ContextAwareExpressionEditorProps &
    FormExpressionEditorProps & {
        control: Control<FieldValues, any>;
        watch: UseFormWatch<any>;
        setValue: UseFormSetValue<FieldValues>;
        trigger?: UseFormTrigger<FieldValues>;
        resetField?: UseFormResetField<FieldValues>;
        targetLineRange?: LineRange;
        fileName: string;
    };

export namespace S {
    export const Container = styled.div({
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        fontFamily: 'var(--font-family)',
        position: 'relative',
    });

    export const Ribbon = styled.div({
        backgroundColor: ThemeColors.PRIMARY,
        opacity: 0.6,
        width: '24px',
        height: `calc(100% - 6.5px)`,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        borderTopLeftRadius: '2px',
        borderBottomLeftRadius: '2px',
        borderRight: 'none',
        marginTop: '3.75px',
        paddingTop: '6px',
        cursor: 'pointer'
    });

    export const TitleContainer = styled.div`
        display: flex;
        align-items: center;
        gap: 8px;
    `;

    export const ItemContainer = styled.div`
        border: 1px solid var(--vscode-dropdown-border);
        border-radius: 4px
    `;

    export const LabelContainer = styled.div({
        display: 'block'
    });

    // The min-height reserves the mode switcher's row. Fields that hide the switcher have nothing
    // to reserve it for, so the slack reads as uneven spacing above the label.
    export const HeaderContainer = styled.div<{ reserveSwitcherRow?: boolean }>(
        ({ reserveSwitcherRow = true }: { reserveSwitcherRow?: boolean }) => ({
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            ...(reserveSwitcherRow ? { minHeight: '26px' } : {}),
        })
    );

    export const Header = styled.div({
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        marginBottom: '4px'
    });

    // Bottom-aligned so the mode switcher sits directly on the field it controls.
    export const HeaderRow = styled.div({
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        gap: '12px',
    });

    // The description stays under the label while the mode switcher beside it sits on the field.
    export const HeaderMain = styled.div({
        flex: 1,
        minWidth: 0,
        alignSelf: 'flex-start'
    });

    export const Label = styled.label({
        color: 'var(--vscode-editor-foreground)',
        textTransform: 'capitalize',
        overflowWrap: 'anywhere'
    });

    export const Description = styled.div({
        color: 'var(--vscode-list-deemphasizedForeground)'
    });

    export const DataMapperBtnTxt = styled.p`
        font-size: 10px;
        margin: 0;
        color: var(--vscode-button-background);
    `;

    export const AddNewButton = styled(Button)`
        & > vscode-button {
            color: var(--vscode-textLink-activeForeground);
            border-radius: 0px;
            padding: 3px 5px;
            margin-top: 4px;
        }
        & > vscode-button > * {
            margin-right: 6px;
        }
    `;

    export const DefaultValue = styled.span`
        color: var(--vscode-input-placeholderForeground);
        font-family: var(--vscode-editor-font-family);
        font-size: 12px;
        overflow-wrap: anywhere;
    `;

    // Taller than a description line; reaching into the gap keeps the description 8px above the field.
    export const FieldInfoSection = styled.div({
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: '5px',
        flexShrink: 0,
        marginBottom: '-4px'
    });

    export const EditorMdContainer = styled.div`
        width: 100%;
        font-size: 13px;
        font-family: var(--vscode-font-family);
        color: var(--vscode-list-deemphasizedForeground);
        border-radius: 4px;
        margin-bottom: 0;
        overflow-wrap: anywhere;

        h1,
        h2,
        h3,
        h4,
        h5,
        h6 {
            margin: 16px 0 8px 0;
            font-family: var(--vscode-font-family);
            font-weight: normal;
            font-size: 13px;
            color: var(--vscode-list-deemphasizedForeground);
        }

        p {
            font-size: 13px;
            margin: 0;
            line-height: 1.5;
            font-family: var(--vscode-font-family);
            color: var(--vscode-list-deemphasizedForeground);
        }

        code {
            background-color: var(--vscode-textPreformat-background);
            border-radius: 3px;
            padding: 2px 4px;
            color: var(--vscode-textPreformat-foreground);
            font-family: var(--vscode-editor-font-family);
            font-size: 12px;
        }

        pre {
            background-color: var(--vscode-textPreformat-background);
            color: var(--vscode-textPreformat-foreground);
            border-radius: 4px;
            padding: 12px;
            margin: 8px 0;
            overflow-x: auto;
            font-family: var(--vscode-editor-font-family);
            font-size: 12px;
            line-height: 1.4;
        }

        ul,
        ol {
            margin: 8px 0;
            padding-left: 24px;
            font-size: 13px;
            font-family: var(--vscode-font-family);
        }

        li {
            margin: 4px 0;
            font-size: 13px;
            font-family: var(--vscode-font-family);
        }

        blockquote {
            margin: 8px 0;
            padding-left: 8px;
            border-left: 4px solid ${ThemeColors.PRIMARY};
            font-size: 13px;
            font-family: var(--vscode-font-family);
        }

        table {
            border-collapse: collapse;
            width: 100%;
            margin: 8px 0;
            font-size: 13px;
            font-family: var(--vscode-font-family);
        }

        th,
        td {
            border: 1px solid var(--vscode-editor-inactiveSelectionBackground);
            padding: 8px;
            text-align: left;
            font-size: 13px;
            font-family: var(--vscode-font-family);
        }

        th {
            background-color: var(--vscode-editor-inactiveSelectionBackground);
        }
    `;
}

export const ContextAwareExpressionEditor = (props: ContextAwareExpressionEditorProps) => {
    const { form, expressionEditor, targetLineRange, fileName } = useFormContext();

    return (
        <ExpressionEditor
            fileName={fileName}
            targetLineRange={targetLineRange}
            helperPaneZIndex={props.helperPaneZIndex}
            {...form}
            {...expressionEditor}
            {...props}
        />
    );
};

export const DataMapperJoinClauseRhsEditor = (props: ContextAwareExpressionEditorProps) => {
    const { form, expressionEditor, targetLineRange, fileName } = useFormContext();

    const modifiedExpressionEditor = {
        ...expressionEditor
    };

    modifiedExpressionEditor.retrieveCompletions = async (value: string, property: ExpressionProperty, offset: number, triggerCharacter?: string) => {
        const varName = form.watch('name');
        const expression = form.watch('expression');
        const prefixExpr = `from var ${varName} in ${expression} select `;
        return await expressionEditor.retrieveCompletions(prefixExpr + value, property, prefixExpr.length + offset, triggerCharacter);
    }

    modifiedExpressionEditor.getExpressionEditorDiagnostics = async (
        showDiagnostics: boolean,
        expression: string,
        key: string,
        property: ExpressionProperty
    ) => {
        const varName = form.watch('name');
        const joinExpression = form.watch('expression');
        const prefixExpr = `from var ${varName} in ${joinExpression} select `;
        return await expressionEditor.getExpressionEditorDiagnostics(
            showDiagnostics,
            prefixExpr + expression,
            key,
            property
        );
    }

    return (
        <ExpressionEditor
            fileName={fileName}
            targetLineRange={targetLineRange}
            helperPaneZIndex={props.helperPaneZIndex}
            {...form}
            {...modifiedExpressionEditor}
            {...props}
        />
    );
};


// The text of a string literal or of a string template, as Text mode shows it (interpolations become chips); undefined otherwise.
const stringLiteralText = (expression: string): string | undefined => {
    const trimmed = expression.trim();
    const template = trimmed.match(/^string\s*`([^`]*)`$/);
    if (template) {
        return template[1];
    }
    if (!/^"(?:[^"\\]|\\.)*"$/.test(trimmed)) {
        return undefined;
    }
    try {
        return JSON.parse(trimmed);
    } catch {
        return undefined;
    }
};

// What a text or number field shows for a value it can hold as it is; undefined when the value needs Expression mode.
const literalText = (mode: InputMode, expression: string): string | undefined => {
    if (mode === InputMode.TEXT) {
        return stringLiteralText(expression);
    }
    if (mode === InputMode.NUMBER) {
        return /^-?\d+(\.\d+)?$/.test(expression.trim()) ? expression.trim() : undefined;
    }
    return undefined;
};

// A prompt holds text: a template keeps its text, a string literal becomes text, and any other value an interpolation.
const promptText = (expression: string): string => {
    const trimmed = expression.trim();
    const template = /^(?:string\s*)?`([\s\S]*)`$/.exec(trimmed);
    if (template) {
        return template[1];
    }
    try {
        const text = JSON.parse(trimmed);
        if (typeof text === "string") {
            return text.replace(/\$\{/g, "${\"${\"}").replace(/`/g, "${\"`\"}");
        }
    } catch {
        // Not a string literal: the value goes in as an interpolation.
    }
    return `\${${trimmed}}`;
};

const switchesToExpression = (context: ReturnType<typeof useModeSwitcherContext>) =>
    !!context?.isModeSwitcherEnabled && !!context.types?.some((type) => type.fieldType === "EXPRESSION");

const ASSISTED_MODES = [InputMode.EXP, InputMode.TEMPLATE, InputMode.PROMPT, InputMode.RECORD, InputMode.SQL];
// Lists and maps are edited item by item, so a value from the helper goes in through the field's expression mode.
const STRUCTURED_MODES = [InputMode.ARRAY, InputMode.TEXT_ARRAY, InputMode.MAP];

// A select or a toggle keeps a listed value; anything else goes in through the expression editor.
const CHOICE_MODES = [InputMode.SELECT, InputMode.BOOLEAN];

// Which modes take the helper: a text, number, list or map mode only when the field can switch to its expression mode.
const assistableMode = (inputMode: InputMode, canSwitchToExpression: boolean) =>
    [...ASSISTED_MODES, ...CHOICE_MODES].includes(inputMode)
    || ([InputMode.TEXT, InputMode.NUMBER, ...STRUCTURED_MODES].includes(inputMode) && canSwitchToExpression);

// List and map editors have no toolbar of their own, so the helper's button sits in the field's header.
function HeaderAssistButton({ inputMode, disabled }: { inputMode: InputMode; disabled?: boolean }) {
    return STRUCTURED_MODES.includes(inputMode) ? <AssistButton disabled={disabled} /> : null;
}

const choiceValues = (inputMode: InputMode, field: FormField): string[] => inputMode === InputMode.BOOLEAN
    ? ["true", "false"]
    : field.types?.filter(isDropDownType).flatMap((type) => type.options.map((option) => option.value)) ?? [];

// Whether a proposal has to land in the expression editor because this mode can't show it, e.g. orders[0] for a record.
function needsExpressionEditor(inputMode: InputMode, expression: string, field: FormField): boolean {
    // Clearing a field, e.g. putting back an empty previous value, keeps its mode.
    if (!expression.trim()) {
        return false;
    }
    if (CHOICE_MODES.includes(inputMode)) {
        return !choiceValues(inputMode, field).includes(expression);
    }
    if (inputMode === InputMode.RECORD) {
        return !expression.trim().startsWith("{");
    }
    if (inputMode === InputMode.SQL) {
        return !expression.trim().startsWith("`");
    }
    if (inputMode === InputMode.TEXT || inputMode === InputMode.NUMBER) {
        return literalText(inputMode, expression) === undefined;
    }
    return STRUCTURED_MODES.includes(inputMode);
}

// What a proposal looks like in the field's editor, which shows the text inside a literal or template.
const proposalText = (inputMode: InputMode, expression: string, sanitizedExpression?: (value: string) => string): string => {
    if (inputMode === InputMode.TEXT || inputMode === InputMode.NUMBER) {
        return literalText(inputMode, expression) ?? expression;
    }
    if (inputMode === InputMode.PROMPT) {
        return promptText(expression);
    }
    if (inputMode === InputMode.SQL) {
        return getEditorConfiguration(inputMode).serializeValue(expression);
    }
    return inputMode === InputMode.TEMPLATE && sanitizedExpression ? sanitizedExpression(expression) : expression;
};

// The expanded editor's code editor when the helper was opened over it; a prompt there has none, so the field's own is used.
const expandedEditor = (from: HTMLElement | null): HTMLElement | null =>
    from?.closest("[data-expanded-editor]")?.querySelector<HTMLElement>(".cm-editor") ?? null;

// The Expression editor mounts in place of the text one some frames after a mode switch.
export const whenEditorReplaced = (key: string, previous: Element | null | undefined, apply: (editor: HTMLElement) => void, triesLeft = 50) => {
    const editor = document.querySelector<HTMLElement>(`[data-testid="ex-editor-${key}"] .cm-editor`);
    if (editor && editor !== previous) {
        apply(editor);
    } else if (triesLeft > 0) {
        setTimeout(() => whenEditorReplaced(key, previous, apply, triesLeft - 1), 20);
    }
};

export const replaceEditorText = (editor: HTMLElement | null | undefined, text: string, focus = true) => {
    const view = editor && EditorView.findFromDOM(editor);
    view?.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: text },
        selection: { anchor: text.length },
        // The old chips describe text that is gone; mapped over the new text they would draw one long chip.
        effects: tokensChangeEffect.of({ tokens: [] }),
        userEvent: "input.replace",
    });
    if (focus) {
        view?.focus();
    }
};

interface ExpressionFieldAssistProps {
    field: FormField;
    fieldKey: string;
    inputMode: InputMode;
    readOnly: boolean;
    watch: (key: string) => any;
    fieldRef: React.RefObject<HTMLDivElement>;
    sanitizedExpression?: (value: string) => string;
    assistExpression?: FormExpressionEditorProps["assistExpression"];
    abortExpressionAssist?: (requestId: string) => void;
    runAssistActions?: FormExpressionEditorProps["runAssistActions"];
    // The expanded editor covers the panel, so the helper shows inline under its larger editor.
    expanded: boolean;
    clearDiagnostics: () => void;
}

const FORM_VALUE_LIMIT = 200;

// The form's other filled-in fields, so the helper can read intent such as a variable's name; secrets stay out.
function otherFieldValues(fields: FormField[] = [], values: Record<string, unknown>, key: string) {
    return fields.flatMap((field) => {
        const raw = values[field.key];
        const value = (typeof raw === "string" ? raw : raw == null ? "" : JSON.stringify(raw)).trim();
        const skip = field.key === key || field.hidden || !value || shouldWithhold(value, isSensitiveField(field.label, field.key));
        return skip ? [] : [{ label: field.label || field.key, value: value.slice(0, FORM_VALUE_LIMIT) }];
    });
}

// The form's parts other than this field; none when the form has no helper of its own.
// Lets the header's Copilot read and fill this field in a form with no node schema.
function useAssistField(hosted: boolean, key: string, field: FormField, value: () => string,
    apply: (proposal: ExpressionAssistResponse & { expression: string }, focus?: boolean) => Promise<void>) {
    const host = useAssistHost();
    const { partOfParentForm } = useFormContext();
    const latest = useRef({ field, value, apply });
    latest.current = { field, value, apply };
    useEffect(() => {
        if (!hosted || !host || partOfParentForm) {
            return;
        }
        return host.registerField(key, {
            label: field.label,
            description: field.documentation,
            property: () => getPropertyFromFormField(latest.current.field),
            value: () => latest.current.value(),
            // The form's Copilot writes many fields at once; none of them takes the focus from its thread.
            apply: (expression, imports) => void latest.current.apply({ expression, imports }, false),
        });
    }, [hosted, key, host?.registerField]);
}

function otherParts(parts: string[] | undefined, label: string): string[] | undefined {
    const others = parts?.filter((part) => part !== label);
    return others?.length ? others : undefined;
}

// An expression that only names a value shows as the editor's chip; other expressions as code, and text as prose.
const reviewDisplay = (inputMode: InputMode, before: string): ValueDisplay | undefined =>
    inputMode !== InputMode.EXP ? undefined : /^[A-Za-z_][\w.]*$/.test(before.trim()) ? "reference" : "code";

// Wires the AI helper to one field: which modes take it, where the panel shows, and how a proposal lands in the editor.
function useExpressionFieldAssist(props: ExpressionFieldAssistProps) {
    const { field, fieldKey: key, inputMode, readOnly, watch, fieldRef, sanitizedExpression, expanded } = props;
    const { updateImports, form, nodeInfo, fields } = useFormContext();
    const modeSwitcherContext = useModeSwitcherContext();
    // A text or number field can still take a computed value: it switches to Expression mode when one is applied.
    const canSwitchToExpression = switchesToExpression(modeSwitcherContext);
    const recordMode = inputMode === InputMode.RECORD;
    const assistable = assistableMode(inputMode, canSwitchToExpression);
    // In a side panel the helper is the panel's Copilot popover, scoped to this field.
    const host = useAssistHost();
    const inPopover = !!host && !expanded;
    const assist = useFieldAssist({
        assist: assistable && !readOnly && props.assistExpression
            ? (input) => props.assistExpression({
                ...input,
                key,
                property: getPropertyFromFormField(field),
                // A variable's value takes its type from the form's Type field, as the diagnostics do.
                variableType: nodeInfo?.kind === "VARIABLE" ? form?.watch("type") : undefined,
                form: { node: nodeInfo?.kind, fields: otherFieldValues(fields, form?.getValues() ?? {}, key) },
                formParts: inPopover ? otherParts(host.formParts(), field.label) : undefined,
                canChangeFlow: inPopover && !!host.liveForm()?.continueInChat,
            })
            : undefined,
        abort: props.abortExpressionAssist,
        getValue: () => watch(key) ?? "",
        sensitive: isSensitiveField(field.label, key),
        handOff: inPopover ? (messages, pending) => host.handOff(messages, { key, label: field.label }, pending) : undefined,
        review: inPopover ? (proposal, request) => writeForReview(proposal, request) : undefined,
        continueInChat: inPopover ? (request, context) => host.liveForm()?.continueInChat?.(request, `In the ${field.label} field.\n${context}`) : undefined,
    });
    // The editor whose button opened the helper: the field itself, or the expanded editor over it.
    const assistTarget = useRef<HTMLElement | null>(null);
    // Bumped when a value lands while an expanded editor without a code editor is open, so it reopens on that value.
    const [expandedRevision, setExpandedRevision] = useState(0);
    // The field's errors from this render, filled in by fixAction; the panel offers a fix while there are any.
    const errorsRef = useRef<string[]>([]);
    errorsRef.current = [];
    const scope = `field:${key}`;
    const hosted = inPopover && assist.available;
    const hostOpen = host?.scope === scope;
    const openHosted = () => host?.open(scope, field.label);
    // The expanded editor covers the panel, so no popover from the panel stays open over it.
    useEffect(() => {
        if (expanded && host?.scope) {
            host.close();
        }
    }, [expanded]);
    useEffect(() => {
        // Another field or the whole form took the popover, or it closed: this thread ends.
        const { history, proposal, loading, error } = assist.state;
        if (hosted && host.shownScope !== scope && (assist.open || history.length || proposal || loading || error)) {
            assist.close();
        }
    }, [hosted, host?.shownScope]);
    const assistContext = useMemo(
        () => (assist.available ? {
            open: (from?: HTMLElement, draft?: string) => {
                assistTarget.current = from ?? null;
                // The expanded editor covers the review card, so its button keeps the field's own Copilot.
                if (!draft && !expandedEditor(from ?? null) && reviseInCard(host, key)) {
                    return;
                }
                if (draft) {
                    host?.setDraft(draft);
                }
                if (!hosted) {
                    assist.toggle();
                } else if (hostOpen) {
                    host.close();
                } else {
                    openHosted();
                }
            },
            isOpen: host?.revising === key || (hosted ? hostOpen : assist.open),
        } : undefined),
        [assist.available, assist.open, hosted, hostOpen, host]
    );
    const display = (expression: string) => proposalText(inputMode, expression, sanitizedExpression);
    // Applied as an edit in the editor, so the value goes through the same change path as typing.
    const applyProposal = async (proposal: ExpressionAssistResponse & { expression: string }, focus = true) => {
        // Whatever the value refers to must exist before the value lands in the field.
        if (proposal.actions?.length) {
            if (!props.runAssistActions) {
                throw new Error("This form can't create configurables yet. Add one from the Data Browser.");
            }
            await props.runAssistActions(proposal.actions, watch(key) ?? "");
        }
        if (proposal.imports) {
            updateImports?.(key, proposal.imports);
        }
        if (needsExpressionEditor(inputMode, proposal.expression, field)) {
            const previousEditor = fieldRef.current?.querySelector(".cm-editor");
            modeSwitcherContext?.onModeChange(InputMode.EXP);
            whenEditorReplaced(key, previousEditor, (editor) => replaceEditorText(editor, proposal.expression, focus));
            return;
        }
        // The record form reloads its fields from a value set from outside.
        if (recordMode) {
            form?.setValue(key, proposal.expression, { shouldDirty: true });
            return;
        }
        if (CHOICE_MODES.includes(inputMode)) {
            form?.setValue(key, proposal.expression, { shouldDirty: true });
            props.clearDiagnostics();
            return;
        }
        // A template field edits the text inside the backticks; a text field, the text inside the quotes.
        const target = expandedEditor(assistTarget.current);
        replaceEditorText(target ?? fieldRef.current?.querySelector(".cm-editor"), display(proposal.expression), focus);
        if (expanded && !target) {
            setExpandedRevision((revision) => revision + 1);
        }
    };
    useAssistField(hosted, key, field, () => watch(key) ?? "", applyProposal);
    // The suggestion lands in the field at once; the card under it keeps, undoes or revises it, as for a form change.
    const writeForReview = async (proposal: Proposal, request: string) => {
        const before = watch(key) ?? "";
        await applyProposal(proposal, false);
        host?.setApplied((current) => withFieldChange(current, key, {
            before: display(before),
            after: display(proposal.expression),
            display: reviewDisplay(inputMode, before),
            request,
            label: field.label,
            note: proposal.note,
            values: { before, after: proposal.expression },
            revert: () => applyProposal({ expression: before }, false),
        }));
        host?.setReviewKey(key);
        host?.close();
    };
    // A value from the field's own Copilot is the user's edit, as typing is, so a form review of the field ends.
    const replaceWithProposal = async (proposal: ExpressionAssistResponse & { expression: string }) => {
        await applyProposal(proposal);
        host?.dropMark(key);
    };
    const presence = usePresence(!hosted && assist.open);
    const assistPanel = hosted ? (
        <>
        <AssistCard scope={scope} />
        <AssistHostContent scope={scope}>
            <FieldAssistPanel
                assist={{ ...assist, close: () => host.close() }}
                value={watch(key) ?? ""}
                onApply={replaceWithProposal}
                display={display}
                currentErrors={() => errorsRef.current}
                embedded
                headless
            />
        </AssistHostContent>
        </>
    ) : presence.shown && (
        // Only the expanded editor has no host; its card sits under the editor, as in the panel.
        <AssistCardFrame closing={presence.closing} gap="above" headless onClose={assist.close}>
            <FieldAssistPanel assist={assist} value={watch(key) ?? ""} onApply={replaceWithProposal} display={display} currentErrors={() => errorsRef.current} embedded headless />
        </AssistCardFrame>
    );
    const fix = (errorMessages: string[]) => {
        if (hosted) {
            openHosted();
        }
        assist.fix(errorMessages);
    };
    const fixAction = (errorMessages: string[]) => {
        errorsRef.current = errorMessages;
        return assist.available && !(hosted ? hostOpen : assist.open) && (
            <AssistStyles.FixButton type="button" title="Fix with Copilot" onClick={() => fix(errorMessages)}>
                <Icon name="wand-magic-sparkles-solid" sx={{ width: "12px", height: "12px" }} iconSx={{ fontSize: "12px" }} />
                Fix
            </AssistStyles.FixButton>
        );
    };
    return { assistContext, assistPanel, fixAction, expandedRevision };
}

// Prompt fields get a visible way into the expanded editor; a field's own action takes precedence.
export const FieldActionLink = ({ field, inputMode, onOpenExpandedMode }: { field: FormField; inputMode: InputMode; onOpenExpandedMode?: () => void }) => {
    const onClick = field.actionCallback ?? (inputMode === InputMode.PROMPT ? onOpenExpandedMode : undefined);
    if (!onClick) {
        return null;
    }
    return (
        <LinkButton onClick={onClick} sx={{ padding: "4px 6px", margin: 0, marginTop: "6px", fontSize: "13px" }}>
            {field.actionCallback ? field.actionLabel : <><Codicon name="edit" />Open in Prompt Editor</>}
        </LinkButton>
    );
};

export const ExpressionEditor = (props: ExpressionEditorProps) => {
    const {
        autoFocus,
        control,
        field,
        initialValue,
        fieldInputType,
        id,
        placeholder,
        required,
        showHeader = true,
        watch,
        setValue,
        trigger,
        resetField,
        fieldKey,
        completions,
        triggerCharacters,
        retrieveCompletions,
        extractArgsFromFunction,
        getExpressionEditorDiagnostics,
        getHelperPane,
        onFocus,
        onBlur,
        onSave,
        onCancel,
        onRemove,
        handleOnFieldFocus,
        onOpenRecordConfigPage,
        targetLineRange,
        fileName,
        helperPaneHeight,
        recordTypeField,
        helperPaneZIndex,
        growRange = { start: 1, offset: 9 },
        rawExpression, // original expression
        sanitizedExpression, // sanitized expression that will be rendered in the editor
        assistExpression,
        abortExpressionAssist,
        runAssistActions
    } = props as ExpressionEditorProps;

    const key = fieldKey ?? field.key;
    const readOnly = field.editable === false;
    const defaultHint = getDefaultHint(field);
    // If Form directly  calls ExpressionEditor without setting targetLineRange and fileName through context
    const { targetLineRange: contextTargetLineRange, fileName: contextFileName, droppedFieldDiagnostics } = useFormContext();
    // The diagnostics the field arrived with, unless a mode switch dropped them along with the value.
    const arrivedDiagnostics = droppedFieldDiagnostics?.[key] === field.diagnostics ? undefined : field.diagnostics;
    const [formDiagnostics, setFormDiagnostics] = useState(arrivedDiagnostics);
    const [isExpandedModalOpen, setIsExpandedModalOpen] = useState(false);

    // Update formDiagnostics when field.diagnostics changes
    useEffect(() => {
        setFormDiagnostics(arrivedDiagnostics);
    }, [arrivedDiagnostics]);
    const clearFormDiagnostics = () => setFormDiagnostics([]);

    const effectiveTargetLineRange = targetLineRange ?? contextTargetLineRange;
    const effectiveFileName = fileName ?? contextFileName;

    if (field.placeholder === 'object {}' || field.placeholder === '""') {
        field.placeholder = '';
    }

    const [isHelperPaneOpen, setIsHelperPaneOpen] = useState<boolean>(false);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    /* Define state to retrieve helper pane data */

    const { registerLoading, unregisterLoading } = useFormFieldLoadingContext();
    const loadingIdRef = useRef<string>(`expr-${key}-${Math.random().toString(36).slice(2, 8)}`);

    useEffect(() => {
        const id = loadingIdRef.current;
        if (isLoading) {
            registerLoading(id);
        } else {
            unregisterLoading(id);
        }
        return () => {
            unregisterLoading(id);
        };
    }, [isLoading, registerLoading, unregisterLoading]);

    const exprRef = useRef<FormExpressionEditorRef>(null);
    const anchorRef = useRef<HTMLDivElement>(null);

    // This guard is here because the IF form and Match forms
    //  does not populate the context value since they use expressionEditor 
    // component directly instead of going through the FieldFactory. 
    // This should ideally be handled as followes.
    //  1.) Refactor IF and Match forms to use FieldFactory component
    //  and LS property models
    //  2.) Remove this guard and make sure all the usages of ExpressionEditor 
    // are wrapped with ModeSwitcherContext provider
    const modeSwitcherContext = useModeSwitcherContext() ?? {
        inputMode: InputMode.EXP,
        isModeSwitcherEnabled: false,
        isRecordTypeField: false,
        onModeChange: () => { },
        types: undefined
    };

    const { inputMode } = modeSwitcherContext;
    const showHeaderSkeleton = isLoading && !modeSwitcherContext.hasSwitchedMode;

    // The type member the user is currently editing. Validation rules live on a `types[]` member
    // and run only while that member is active, so a NUMBER member's `port` rule is skipped the
    // moment the user switches to the EXPRESSION member and types a variable reference.
    const activeFieldType = field.types?.find((type) => getInputModeFromTypes(type) === inputMode)?.fieldType
        ?? getPrimaryInputType(field.types)?.fieldType;

    // Live validation of the connector-shipped `validations[]`. Client rules run synchronously on
    // every change and render here directly — react-hook-form's default `onSubmit` mode does not
    // surface per-field errors until submit (only `isValid`, which gates the button), so relying on
    // its `fieldState.error` would disable the button with no visible reason. Inert for fields with
    // no `validations[]` on the active member.
    const liveDiagnostics = useFieldDiagnostics(field, {
        filePath: effectiveFileName,
        moduleName: field.codedata?.moduleName,
        activeFieldType,
    });
    // Errors and warnings render in separate slots — red (blocking) vs amber (advisory).
    const liveErrorMessages = liveDiagnostics.errors.map((diagnostic) => diagnostic.message);
    const liveWarningMessages = liveDiagnostics.warnings.map((diagnostic) => diagnostic.message);

    const isPromptWithDiagnostics = inputMode === InputMode.PROMPT && key !== 'role' && key !== 'instructions';

    const controllerRules = (() => {
        const expressionSetType = field.types?.find(t => t.fieldType === "EXPRESSION_SET" || t.fieldType === "TEXT_SET");
        const patternType = field.types?.find(t => t.pattern);
        const rules: any = {};

        // Only use 'required' if there's no pattern validation (pattern will handle empty values)
        if (!patternType?.pattern && !expressionSetType?.pattern) {
            const effectiveRequired = required ?? !field.optional;
            rules.required = buildRequiredRule({
                isRequired: !!effectiveRequired,
                label: field.label
            });
        }

        if (expressionSetType?.pattern) {
            // For EXPRESSION_SET or TEXT_SET (arrays), validate each item
            rules.validate = {
                pattern: (value: any) => {
                    try {
                        if (!Array.isArray(value)) return true;

                        const regex = new RegExp(expressionSetType.pattern);
                        for (const item of value) {
                            if (!regex.test(item)) {
                                return expressionSetType.patternErrorMessage || "Invalid format";
                            }
                        }
                        return true;
                    } catch (error) {
                        console.error(`[${key}] Invalid regex pattern:`, expressionSetType.pattern, error);
                        return true; // Skip validation if regex is invalid
                    }
                },
                minItems: (value: any) => {
                    if (!Array.isArray(value)) return true;
                    const minItems = expressionSetType.minItems ?? 0;
                    if (minItems > 0 && value.length < minItems) {
                        return `At least ${minItems} ${minItems > 1 ? 'items are' : 'item is'} required`;
                    }
                    return true;
                }
            };
        } else if (patternType?.pattern) {
            // For non-array fields, validate pattern only in TEXT mode with literal values
            rules.validate = {
                pattern: (value: any) => {
                    try {
                        const currentMode = inputMode;

                        // Only validate in TEXT mode
                        if (currentMode !== InputMode.TEXT) {
                            return true;
                        }

                        // Skip pattern validation if value contains interpolations (e.g., ${variable})
                        if (value && typeof value === 'string' && /\$\{[^}]*\}/.test(value)) {
                            return true;
                        }

                        // Validate pattern for TEXT mode with literal values
                        const regex = new RegExp(patternType.pattern);
                        if (!regex.test(value || '')) {
                            return patternType.patternErrorMessage || "Invalid format";
                        }

                        return true;
                    } catch (error) {
                        console.error(`[${key}] Invalid regex pattern:`, patternType.pattern, error);
                        return true; // Skip validation if regex is invalid
                    }
                }
            };
        }

        // Connector-shipped ERROR rules compose with the pattern/minItems rules above.
        rules.validate = { ...(rules.validate ?? {}), ...buildValidate(field, activeFieldType) };

        return rules;
    })();
    // The error types these rules can raise: react-hook-form names a failing `validate` entry after its
    // key (`minItems`, `common.validate.max.length#0`), not `validate`. Kept in a ref because CodeMirror
    // calls the onChange it was built with, whose closure would hold the rules of an earlier render.
    const ruleErrorTypesRef = useRef<Set<string>>(new Set());
    ruleErrorTypesRef.current = new Set([...RHF_RULE_ERROR_TYPES, ...Object.keys(controllerRules.validate ?? {})]);

    // Use to fetch initial diagnostics
    const previousDiagnosticsFetchContext = useRef<diagnosticsFetchContext>({
        fetchedInitialDiagnostics: false,
        diagnosticsFetchedTargetLineRange: undefined
    });
    const fieldValue = (inputMode === InputMode.PROMPT || inputMode === InputMode.TEMPLATE) && rawExpression ? rawExpression(watch(key)) : watch(key);

    // Initial render
    useEffect(() => {
        if (!targetLineRange) return;
        if (readOnly) return;
        // Fetch initial diagnostics
        if (getExpressionEditorDiagnostics && fieldValue !== undefined
            && (inputMode === InputMode.EXP || inputMode === InputMode.TEMPLATE || isPromptWithDiagnostics)
            && (previousDiagnosticsFetchContext.current.fetchedInitialDiagnostics === false
                || previousDiagnosticsFetchContext.current.diagnosticsFetchedTargetLineRange !== targetLineRange
            )) {
            previousDiagnosticsFetchContext.current = {
                fetchedInitialDiagnostics: true,
                diagnosticsFetchedTargetLineRange: targetLineRange
            };
            // Only validate on initial render if the field has a non-empty value
            getExpressionEditorDiagnostics(
                fieldValue !== '',
                fieldValue,
                key,
                getPropertyFromFormField(field)
            );
        }
    }, [fieldValue, targetLineRange]);

    const handleFocus = async (controllerOnChange?: (value: string) => void) => {
        // If in guided mode with recordTypeField, open ConfigureRecordPage directly
        if (inputMode === InputMode.RECORD && recordTypeField && onOpenRecordConfigPage) {
            const currentValue = watch(key) || '';
            // Create onChange callback that updates the form value
            const onChangeCallback = (value: string, isUserEdit?: boolean) => {
                if (controllerOnChange) {
                    controllerOnChange(value);
                } else {
                    setValue(key, value);
                }
                // A value the record page generated on opening is where the field starts, not an edit.
                if (isUserEdit === false) {
                    resetField?.(key, { defaultValue: value, keepError: true });
                }
                setFormDiagnostics([]);
                revalidateShownError();
                liveDiagnostics.onValueChange(value);
                if (getExpressionEditorDiagnostics) {
                    getExpressionEditorDiagnostics(
                        (required ?? !field.optional) || value !== '',
                        value,
                        key,
                        getPropertyFromFormField(field)
                    );
                }
            };
            onOpenRecordConfigPage(key, currentValue, recordTypeField, onChangeCallback);
            return;
        }

        // Trigger actions on focus
        await onFocus?.();
        handleOnFieldFocus?.(key);
    };

    const handleBlur = async () => {
        await onBlur?.();
    };

    const handleChangeHelperPaneState = (isOpen: boolean) => {
        setIsHelperPaneOpen(isOpen);
    };

    // Before the first submit the form does not re-check a field on change, so a rule error already
    // shown (e.g. "Path is required" after a mode switch emptied the field) would outlive the value
    // typed into it. The error is read from the form, not the render: CodeMirror keeps the onChange
    // it was built with, whose `error` is from before the rule failed. Only the field's own rules
    // are re-run; errors set from outside (compiler diagnostics, server validation) keep their
    // own lifecycle.
    const revalidateShownError = () => {
        const error = control.getFieldState(key).error;
        if (error && ruleErrorTypesRef.current.has(String(error.type))) {
            void trigger?.(key);
        }
    };

    // Text mode does not fetch diagnostics, but a value kept across a switch into it keeps the ones it
    // had in Expression mode. While they are shown, re-check each edit, or fixing the value would
    // leave them blocking Save.
    const showsExpressionDiagnostics = () => control.getFieldState(key).error?.type === 'expression_diagnostic';

    const handleSave = async (value: string) => {
        let valueToBeSaved = value;
        if (inputMode === InputMode.TEXT) {
            valueToBeSaved = `\"${value}\"`;
        }
        onSave?.(valueToBeSaved);
    }

    const toggleHelperPaneState = () => {
        if (!isHelperPaneOpen) {
            exprRef.current?.focus();
        } else {
            handleChangeHelperPaneState(false);
        }
    };

    const handleGetHelperPane = (
        value: string,
        onChange: (value: string, options?: HelperpaneOnChangeOptions) => void,
        helperPaneHeight: HelperPaneHeight
    ) => {
        return getHelperPane?.(
            key,
            exprRef,
            anchorRef,
            field.placeholder,
            value,
            onChange,
            handleChangeHelperPaneState,
            helperPaneHeight,
            recordTypeField,
            field.type === "LV_EXPRESSION",
            field.types,
            inputMode,
        );
    };

    const handleExtractArgsFromFunction = async (value: string, cursorPosition: number) => {
        return await extractArgsFromFunction(value, getPropertyFromFormField(field), cursorPosition);
    };

    const handleOpenExpandedMode = () => {
        setIsExpandedModalOpen(true);
    };

    const handleSaveExpandedMode = (value: string) => {
        setValue(key, value, { shouldDirty: true });
        revalidateShownError();
        if (field.onValueChange) {
            field.onValueChange(value);
        }
    };

    const onOpenExpandedMode = !props.isInExpandedMode && isExpandableMode(inputMode)
        ? handleOpenExpandedMode
        : undefined;

    const fieldRef = useRef<HTMLDivElement>(null);
    const { assistContext, assistPanel, fixAction, expandedRevision } = useExpressionFieldAssist({
        field, fieldKey: key, inputMode, readOnly, watch, fieldRef, sanitizedExpression,
        assistExpression, abortExpressionAssist, runAssistActions, expanded: isExpandedModalOpen,
        clearDiagnostics: clearFormDiagnostics,
    });

    const documentation = field.documentation
        ? field.documentation.endsWith('.')
            ? field.documentation
            : `${field.documentation}.`
        : '';

    const modeSwitcherNode = modeSwitcherContext?.isModeSwitcherEnabled && !field.hideModeSwitcher ? (
        <S.FieldInfoSection>
            {isLoading ? (
                // 140px is the rendered ModeSwitcher width for any "<mode> / Expression" pair, not its
                // 112px min-width: both columns size to the longer label, which is normally Expression.
                <SkeletonBase height="24px" width="140px" style={{ borderRadius: 'var(--vscode-cornerRadius-medium, 6px)' }} />
            ) : (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <HeaderAssistButton inputMode={inputMode} disabled={readOnly} />
                    <ModeSwitcher
                        fieldKey={field.key}
                        value={modeSwitcherContext.inputMode}
                        isRecordTypeField={modeSwitcherContext.isRecordTypeField}
                        onChange={modeSwitcherContext.onModeChange}
                        types={modeSwitcherContext.types}
                    />
                </span>
            )}
        </S.FieldInfoSection>
    ) : null;

    return (
        <FieldAssistContext.Provider value={assistContext}>
        <FieldProvider
            initialField={props.field}
            triggerCharacters={props.triggerCharacters}
        >
            <S.Container
                ref={fieldRef}
                id={id}
                data-testid={`ex-editor-${field.key}`}
            >
                {showHeader && (
                    <S.Header>
                        {field.label && (
                            <S.HeaderContainer reserveSwitcherRow={!field.hideModeSwitcher}>
                                {showHeaderSkeleton ? (
                                    <SkeletonBase height="14px" width="40%" />
                                ) : (
                                    <S.LabelContainer>
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                            <S.Label>{field.label}</S.Label>
                                            {readOnly && (
                                                <span title="Read-only" style={{ display: 'inline-flex' }}>
                                                    <Icon name="bi-lock" iconSx={{ fontSize: "14px" }} sx={{ color: 'var(--vscode-list-deemphasizedForeground)' }} />
                                                </span>
                                            )}
                                        </span>
                                        {defaultHint && <S.DefaultValue style={{ marginLeft: '8px' }}>{`(Default: ${defaultHint}) `}</S.DefaultValue>}
                                        {(required ?? !field.optional) && <RequiredFormInput />}
                                        <FieldTypeChip types={field.types} />
                                    </S.LabelContainer>
                                )}
                                {!documentation && modeSwitcherNode}
                            </S.HeaderContainer>
                        )}
                        {(documentation || !field.label) && (
                            <S.HeaderRow>
                                <S.HeaderMain>
                                    {showHeaderSkeleton ? (
                                        documentation ? <SkeletonBase height="13px" width="80%" /> : null
                                    ) : (
                                        <S.EditorMdContainer>
                                            {documentation && (
                                                <CollapsibleDescription>
                                                    <ReactMarkdown>{documentation}</ReactMarkdown>
                                                </CollapsibleDescription>
                                            )}
                                        </S.EditorMdContainer>
                                    )}
                                </S.HeaderMain>
                                {modeSwitcherNode}
                            </S.HeaderRow>
                        )}
                    </S.Header>
                )}
                <Controller
                    control={control}
                    name={key}
                    defaultValue={initialValue}
                    rules={controllerRules}
                    render={({ field: { name, value, onChange }, fieldState: { error } }) => {
                        return (
                            <div>
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '4px' }}>
                                    <div style={{ flex: 1, minWidth: 0, position: 'relative', cursor: readOnly ? 'not-allowed' : undefined }}>
                                        {isLoading && <SkeletonBase height="28px" style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1, borderRadius: '2px' }} />}
                                        <div style={{ visibility: isLoading ? 'hidden' : 'visible', opacity: readOnly ? 0.7 : 1 }}>
                                            <ExpressionField
                                                field={field}
                                                inputMode={inputMode}
                                                primaryMode={getInputModeFromTypes(getPrimaryInputType(field.types))}
                                                name={name}
                                                value={value}
                                                completions={completions}
                                                fileName={effectiveFileName}
                                                targetLineRange={effectiveTargetLineRange}
                                                autoFocus={recordTypeField ? false : autoFocus}
                                                sanitizedExpression={(inputMode === InputMode.PROMPT || inputMode === InputMode.TEMPLATE) ? sanitizedExpression : undefined}
                                                rawExpression={(inputMode === InputMode.PROMPT || inputMode === InputMode.TEMPLATE) ? rawExpression : undefined}
                                                ariaLabel={field.label}
                                                placeholder={placeholder}
                                                onChange={async (updatedValue: string | any[] | Record<string, unknown>, updatedCursorPosition: number) => {

                                                    // clear field diagnostics
                                                    clearFormDiagnostics();
                                                    // Use ref to get current mode (not stale closure value)
                                                    const currentMode = inputMode;
                                                    const rawValue = (currentMode === InputMode.PROMPT || currentMode === InputMode.TEMPLATE) &&
                                                        rawExpression ? rawExpression(typeof updatedValue === 'string' ? updatedValue : JSON.stringify(updatedValue)) : updatedValue;

                                                    onChange(rawValue);
                                                    revalidateShownError();
                                                    // Run the connector-shipped rules on this edit (sync client rules
                                                    // now, ls.* debounced) so their messages render live.
                                                    liveDiagnostics.onValueChange(rawValue);
                                                    if (getExpressionEditorDiagnostics && (currentMode === InputMode.EXP || currentMode === InputMode.TEMPLATE || isPromptWithDiagnostics || showsExpressionDiagnostics())) {
                                                        getExpressionEditorDiagnostics(
                                                            (required ?? !field.optional) || updatedValue !== '',
                                                            typeof rawValue === 'string' ? rawValue : JSON.stringify(rawValue),
                                                            key,
                                                            getPropertyFromFormField(field)
                                                        );
                                                    }

                                                    // Check if the current character is a trigger character
                                                    const triggerCharacter =
                                                        updatedCursorPosition > 0
                                                            ? triggerCharacters.find((char) => updatedValue[updatedCursorPosition - 1] === char)
                                                            : undefined;
                                                    if (triggerCharacter) {
                                                        await retrieveCompletions(
                                                            typeof updatedValue === 'string' ? updatedValue : JSON.stringify(updatedValue),
                                                            getPropertyFromFormField(field),
                                                            updatedCursorPosition,
                                                            triggerCharacter
                                                        );
                                                    } else {
                                                        await retrieveCompletions(
                                                            typeof updatedValue === 'string' ? updatedValue : JSON.stringify(updatedValue),
                                                            getPropertyFromFormField(field),
                                                            updatedCursorPosition
                                                        );
                                                    }
                                                }}
                                                extractArgsFromFunction={handleExtractArgsFromFunction}
                                                onFocus={async () => {
                                                    handleFocus(onChange);
                                                }}
                                                onBlur={handleBlur}
                                                onSave={handleSave}
                                                onCancel={onCancel}
                                                isHelperPaneOpen={isHelperPaneOpen}
                                                changeHelperPaneState={handleChangeHelperPaneState}
                                                getHelperPane={handleGetHelperPane}
                                                helperPaneHeight={helperPaneHeight}
                                                helperPaneWidth={recordTypeField ? 400 : undefined}
                                                growRange={growRange}
                                                helperPaneZIndex={helperPaneZIndex}
                                                exprRef={exprRef}
                                                anchorRef={anchorRef}
                                                onToggleHelperPane={toggleHelperPaneState}
                                                onOpenExpandedMode={onOpenExpandedMode}
                                                isInExpandedMode={isExpandedModalOpen}
                                                onLoadingStateChange={setIsLoading}
                                                onNormalizeValue={(normalizedValue: string) => {
                                                    setValue(key, normalizedValue, { shouldDirty: false, shouldValidate: true });
                                                }}
                                                disabled={readOnly}
                                            />
                                        </div>
                                    </div>
                                    {onRemove && (
                                        <Button
                                            appearance="icon"
                                            onClick={onRemove}
                                            tooltip="Remove"
                                            sx={{ marginTop: '2px', flexShrink: 0 }}
                                        >
                                            <Codicon name="trash" sx={{ color: ThemeColors.ERROR }} />
                                        </Button>
                                    )}
                                </div>
                                {(() => {
                                    // ERRORs (red) and WARNINGs (amber) render in separate slots.
                                    // Errors merge react-hook-form's committed error, the blocking
                                    // connector rules (which render live, ahead of RHF's onSubmit-mode
                                    // commit), and compiler diagnostics; warnings are advisory and
                                    // never mark the field invalid. Deduped by message.
                                    const errorMessages = dedupeMessages([
                                        error?.message?.toString(),
                                        ...liveErrorMessages,
                                        ...((formDiagnostics ?? []).map((d) => d.message)),
                                    ]);
                                    const warningMessages = dedupeMessages(liveWarningMessages);
                                    return (
                                        <>
                                            {errorMessages.length > 0 && (
                                                <ErrorBanner
                                                    errorMsg={errorMessages.join('\n')}
                                                    action={String(fieldValue ?? "").trim() ? fixAction(errorMessages) : undefined}
                                                />
                                            )}
                                            {warningMessages.length > 0 && (
                                                <WarningBanner warningMsg={warningMessages.join('\n')} />
                                            )}
                                        </>
                                    );
                                })()}
                                {!isExpandedModalOpen && assistPanel}
                                <FieldActionLink field={field} inputMode={inputMode} onOpenExpandedMode={onOpenExpandedMode} />
                                {onOpenExpandedMode && toEditorMode(inputMode) && (
                                    <ExpandedEditor
                                        isOpen={isExpandedModalOpen}
                                        assistPanel={isExpandedModalOpen ? assistPanel : undefined}
                                        revision={expandedRevision}
                                        errorAction={fixAction}
                                        field={field}
                                        value={watch(key)}
                                        onNormalizeValue={(normalizedValue: string) => {
                                            setValue(key, normalizedValue, { shouldDirty: false, shouldValidate: true });
                                        }}
                                        onChange={async (updatedValue: string, updatedCursorPosition: number) => {

                                            // clear field diagnostics
                                            clearFormDiagnostics();
                                            // Use ref to get current mode (not stale closure value)
                                            const currentMode = inputMode;
                                            const rawValue = (currentMode === InputMode.PROMPT || currentMode === InputMode.TEMPLATE) && rawExpression ? rawExpression(updatedValue) : updatedValue;

                                            onChange(rawValue);
                                            revalidateShownError();
                                            liveDiagnostics.onValueChange(rawValue);
                                            if (getExpressionEditorDiagnostics && (inputMode === InputMode.EXP || inputMode === InputMode.TEMPLATE || isPromptWithDiagnostics || showsExpressionDiagnostics())) {
                                                getExpressionEditorDiagnostics(
                                                    (required ?? !field.optional) || rawValue !== '',
                                                    rawValue,
                                                    key,
                                                    getPropertyFromFormField(field)
                                                );
                                            }

                                            // Check if the current character is a trigger character
                                            const triggerCharacter =
                                                updatedCursorPosition > 0
                                                    ? triggerCharacters.find((char) => rawValue[updatedCursorPosition - 1] === char)
                                                    : undefined;
                                            if (triggerCharacter) {
                                                await retrieveCompletions(
                                                    rawValue,
                                                    getPropertyFromFormField(field),
                                                    updatedCursorPosition,
                                                    triggerCharacter
                                                );
                                            } else {
                                                await retrieveCompletions(
                                                    rawValue,
                                                    getPropertyFromFormField(field),
                                                    updatedCursorPosition
                                                );
                                            }
                                        }}
                                        onClose={() => {
                                            setIsExpandedModalOpen(false)
                                        }}
                                        onSave={handleSaveExpandedMode}
                                        mode={toEditorMode(inputMode)!}
                                        completions={completions}
                                        fileName={effectiveFileName}
                                        targetLineRange={effectiveTargetLineRange}
                                        sanitizedExpression={sanitizedExpression}
                                        rawExpression={rawExpression}
                                        extractArgsFromFunction={handleExtractArgsFromFunction}
                                        getHelperPane={handleGetHelperPane}
                                        error={error}
                                        formDiagnostics={formDiagnostics}
                                        inputMode={inputMode}
                                        readOnly={readOnly}
                                    />
                                )}
                            </div>
                        );
                    }}
                />
            </S.Container>
        </FieldProvider>
        </FieldAssistContext.Provider>
    );
};
