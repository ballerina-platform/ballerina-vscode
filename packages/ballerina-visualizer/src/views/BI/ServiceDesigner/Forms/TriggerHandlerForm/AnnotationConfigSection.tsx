/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
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

import React from "react";
import styled from "@emotion/styled";
import { CheckBox, CheckBoxGroup, Dropdown, RadioButtonGroup, Typography } from "@wso2/ui-toolkit";
import { Diagnostic, DropdownType, Imports, LineRange, PropertyModel } from "@wso2/ballerina-core";

import { AnnotationExpressionField, AnnotationExpressionFieldHandle } from "./AnnotationExpressionField";
import { CODEDATA_FIELD_VALUE_CHOICE } from "./payloadComposer";

const SectionHeader = styled.div`
    display: flex;
    align-items: center;
    padding: 8px 0;
`;

const SectionContent = styled.div`
    padding-left: 8px;
    margin-top: 8px;
    display: flex;
    flex-direction: column;
    gap: 20px;
`;

// Plain mode: the enclosing layout section supplies the heading, and fields sit flush with it.
const PlainContent = styled.div`
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-top: 10px;
`;

// Plain mode: the field description as text under the checkbox label, not CheckBox's own description box.
const PlainDescription = styled.div`
    margin-top: 2px;
    padding-left: 28px;
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
    user-select: text;
`;

// Plain mode: the label of a field that renders without a checkbox, matching a checkbox label.
const PlainLabel = styled.div`
    color: var(--vscode-editor-foreground);
`;

const PlainSelect = styled.div`
    margin-top: 6px;
`;

const ChoiceContainer = styled.div`
    margin-top: 4px;
    margin-left: 16px;
`;

const NestedFields = styled.div`
    margin-left: 24px;
    margin-top: 8px;
    display: flex;
    flex-direction: column;
    gap: 12px;
`;

const RADIO_GROUP_SX = {
    "& vscode-radio-group": {
        display: "flex",
        flexDirection: "column",
        gap: "2px",
    },
    "& vscode-radio": {
        margin: 0,
    },
};

export interface AnnotationConfigSectionProps {
    annotationKey: string;
    annotation: PropertyModel;
    filePath?: string;
    targetLineRange?: LineRange;
    disabled: boolean;
    onChange: (annotationKey: string, updated: PropertyModel) => void;
    onImportsChange: (annotationKey: string, imports: Imports) => void;
    registerFieldRef: (key: string, handle: AnnotationExpressionFieldHandle | null) => void;
    onDiagnosticsChange: (key: string, diagnostics: Diagnostic[]) => void;
    onValidationStateChange: (key: string, state: { isValidating: boolean }) => void;
    /**
     * Renders without its own heading and with each field description as plain text under the checkbox, for
     * a caller whose layout section already heads the annotation. Off by default.
     */
    plain?: boolean;
    /** Whether a field is shown at all; every field is shown when absent. */
    isFieldShown?: (fieldKey: string, annotation: PropertyModel) => boolean;
}

/**
 * A mapping field is a plain leaf when it renders its own value — it has no nested value node
 * (mirrors the language server's emitter; the value's rendering derives from its types[]).
 */
const isLeafField = (field: PropertyModel): boolean =>
    !field.properties || Object.keys(field.properties).length === 0;

/** The "not set" entry of a plain-mode select: choosing it leaves the field out of the annotation. */
const UNSET_OPTION = "__unset__";

/** The options of a single-select leaf, or undefined for any other field. */
const selectOptionsOf = (field: PropertyModel) => {
    const type = field.types?.find((t) => t.selected) ?? field.types?.[0];
    return type?.fieldType === "SINGLE_SELECT" ? (type as DropdownType).options : undefined;
};

/** An optional field's include state: leaves gate on `enabled`, flag-gated containers on `value`. */
const isFieldIncluded = (field: PropertyModel): boolean => {
    if (isLeafField(field)) {
        return field.enabled !== false;
    }
    const flag = field.value as unknown;
    return flag === true || flag === "true";
};

/**
 * Generic renderer of a schema-driven function annotation. Two shapes exist:
 *
 * - {@code COMPLEX_FUNCTION_ANNOTATION} (a hand-authored model's granular tree, e.g.
 *   {@code @smb:FunctionConfig} / {@code @ftp:FunctionConfig}): {@code MAPPING_FIELD} children render
 *   as optional checkboxes gating either a plain TEXT/EXPRESSION leaf or a {@code FIELD_VALUE_CHOICE}
 *   radio whose active branch nests further leaves. The edited tree is sent back to the language
 *   server, which collapses it into the emitted annotation.
 * - {@code ANNOTATION_ATTACHMENT} (a connector-synthesized annotation with no granular per-field
 *   authoring, e.g. an SMB-shaped handler annotation the trigger-model synthesizer produced): the
 *   node itself has no {@code properties} tree — its own {@code value} already IS the whole record
 *   body — so it renders as a single expression field instead of per-field checkboxes.
 */
export function AnnotationConfigSection(props: AnnotationConfigSectionProps) {
    const { annotationKey, annotation, filePath, targetLineRange, disabled, onChange,
        onImportsChange, registerFieldRef, onDiagnosticsChange, onValidationStateChange, plain,
        isFieldShown } = props;

    const renderLeaf = (stateKey: string, field: PropertyModel, onValueChange: (value: string) => void) => (
        <AnnotationExpressionField
            key={stateKey}
            ref={(handle) => registerFieldRef(stateKey, handle)}
            id={`trigger-annotation-${stateKey}`}
            value={(field.value as string) || ""}
            property={field}
            filePath={filePath}
            targetLineRange={targetLineRange}
            required={!field.optional}
            disabled={disabled}
            onChange={onValueChange}
            onImportsChange={(imports) => onImportsChange(annotationKey, imports)}
            onDiagnosticsChange={(diags) => onDiagnosticsChange(stateKey, diags)}
            onValidationStateChange={(state) => onValidationStateChange(stateKey, state)}
        />
    );

    const fieldEntries = Object.entries(annotation.properties ?? {}) as [string, PropertyModel][];
    if (fieldEntries.length === 0) {
        // A whole-value ANNOTATION_ATTACHMENT leaf (no granular fields) already renders its own
        // label and description via AnnotationExpressionField -> FieldFactory, so wrapping it in
        // another SectionHeader here would just repeat the same label a second time.
        return renderLeaf(annotationKey, annotation,
            (value) => onChange(annotationKey, { ...annotation, value }));
    }

    const updateField = (fieldKey: string, updated: PropertyModel) => {
        onChange(annotationKey, {
            ...annotation,
            properties: { ...annotation.properties, [fieldKey]: updated },
        });
    };

    const toggleField = (fieldKey: string, field: PropertyModel, checked: boolean) => {
        // Container flags store their checked state in `value` — as "true"/"false" strings, which
        // both this form and the language server's emitter accept alongside booleans.
        updateField(fieldKey, isLeafField(field)
            ? { ...field, enabled: checked }
            : { ...field, enabled: true, value: String(checked) });
    };

    const renderChoiceValue = (fieldKey: string, field: PropertyModel, valueKey: string, choice: PropertyModel) => {
        // No fallback to index 0: a choice the model has not resolved yet (no branch `enabled`)
        // must render as genuinely unselected rather than showing the first option as chosen when
        // the underlying model disagrees.
        const selectedIndex = (choice.choices ?? []).findIndex((c) => c.enabled);
        const activeBranch = selectedIndex >= 0 ? choice.choices?.[selectedIndex] : undefined;
        const nestedEntries = Object.entries(activeBranch?.properties ?? {}) as [string, PropertyModel][];

        const selectBranch = (value: string) => {
            const updatedChoices = (choice.choices ?? []).map((c) => ({ ...c, enabled: c.value === value }));
            updateField(fieldKey, {
                ...field,
                properties: {
                    ...field.properties,
                    [valueKey]: { ...choice, value, choices: updatedChoices },
                },
            });
        };

        const updateNestedLeaf = (propKey: string, value: string) => {
            const updatedChoices = [...(choice.choices ?? [])];
            const branch = updatedChoices[selectedIndex];
            updatedChoices[selectedIndex] = {
                ...branch,
                properties: {
                    ...branch.properties,
                    [propKey]: { ...(branch.properties?.[propKey] as PropertyModel), value },
                },
            };
            updateField(fieldKey, {
                ...field,
                properties: { ...field.properties, [valueKey]: { ...choice, choices: updatedChoices } },
            });
        };

        return (
            <React.Fragment key={valueKey}>
                <ChoiceContainer>
                    <RadioButtonGroup
                        id={`trigger-annotation-choice-${annotationKey}-${fieldKey}-${valueKey}`}
                        label=""
                        value={activeBranch?.value ?? ""}
                        sx={RADIO_GROUP_SX}
                        options={(choice.choices ?? []).map((branch, index) => ({
                            id: `${fieldKey}-${valueKey}-${index}`,
                            value: branch.value,
                            content: branch.metadata?.label || branch.value,
                        }))}
                        onChange={(e) => selectBranch(e.target.value)}
                    />
                </ChoiceContainer>
                {nestedEntries.length > 0 && (
                    <NestedFields>
                        {nestedEntries
                            .filter(([, prop]) => isLeafField(prop))
                            .map(([propKey, prop]) =>
                                renderLeaf(`${annotationKey}-${fieldKey}-${valueKey}-${propKey}`, prop,
                                    (value) => updateNestedLeaf(propKey, value)))}
                    </NestedFields>
                )}
            </React.Fragment>
        );
    };

    const Content = plain ? PlainContent : SectionContent;
    const shownEntries = fieldEntries.filter(([fieldKey]) => !isFieldShown || isFieldShown(fieldKey, annotation));
    return (
        <>
            {!plain && (
                <SectionHeader>
                    <Typography variant="body2">{annotation.metadata?.label || annotationKey}</Typography>
                </SectionHeader>
            )}
            <Content>
                {shownEntries.map(([fieldKey, field]) => {
                    const included = isFieldIncluded(field);
                    // Plain mode: an optional select is one dropdown whose first entry (the field's placeholder,
                    // e.g. "Auto") leaves it unset, rather than a checkbox gating a second dropdown.
                    const selectOptions = plain && isLeafField(field) && field.optional !== false
                        ? selectOptionsOf(field) : undefined;
                    if (selectOptions) {
                        return (
                            <div key={fieldKey}>
                                <PlainLabel>{field.metadata?.label || fieldKey}</PlainLabel>
                                {field.metadata?.description && (
                                    <PlainDescription style={{ paddingLeft: 0 }}>
                                        {field.metadata.description}
                                    </PlainDescription>
                                )}
                                <PlainSelect>
                                    <Dropdown
                                        id={`trigger-annotation-${annotationKey}-${fieldKey}`}
                                        items={[
                                            { value: UNSET_OPTION, content: field.placeholder || "Not set" },
                                            ...selectOptions.map((option) => ({
                                                value: option.value, content: option.label,
                                            })),
                                        ]}
                                        value={included && field.value !== undefined && field.value !== ""
                                            ? String(field.value) : UNSET_OPTION}
                                        disabled={disabled || field.editable === false}
                                        onValueChange={(value) => updateField(fieldKey, value === UNSET_OPTION
                                            ? { ...field, enabled: false }
                                            : { ...field, enabled: true, value })}
                                    />
                                </PlainSelect>
                            </div>
                        );
                    }
                    const valueNodes = Object.entries(field.properties ?? {}) as [string, PropertyModel][];
                    return (
                        <div key={fieldKey}>
                            <CheckBoxGroup direction="vertical">
                                <CheckBox
                                    label={field.metadata?.label || fieldKey}
                                    checked={included}
                                    disabled={disabled || field.editable === false}
                                    onChange={(checked) => toggleField(fieldKey, field, checked)}
                                    sx={plain
                                        ? { marginTop: 0 }
                                        : { marginTop: 0, description: field.metadata?.description || "" }}
                                />
                            </CheckBoxGroup>
                            {plain && field.metadata?.description && (
                                <PlainDescription>{field.metadata.description}</PlainDescription>
                            )}
                            {included && isLeafField(field) && (
                                <NestedFields>
                                    {/* In plain mode the checkbox already carries the label and description. */}
                                    {renderLeaf(`${annotationKey}-${fieldKey}`,
                                        plain ? { ...field, metadata: { ...field.metadata, label: "", description: "" } }
                                            : field,
                                        (value) => updateField(fieldKey, { ...field, value }))}
                                </NestedFields>
                            )}
                            {included && !isLeafField(field) &&
                                valueNodes
                                    .filter(([, node]) => node.codedata?.type === CODEDATA_FIELD_VALUE_CHOICE)
                                    .map(([valueKey, node]) => renderChoiceValue(fieldKey, field, valueKey, node))}
                        </div>
                    );
                })}
            </Content>
        </>
    );
}

export default AnnotationConfigSection;
