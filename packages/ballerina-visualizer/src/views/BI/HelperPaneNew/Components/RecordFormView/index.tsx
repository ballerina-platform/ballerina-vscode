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

// The record editor's form view: every field checked in the tree, one per row, written into the same
// record model the tree edits. The modal turns that model into source (`typesManager/generateValue`), so
// the code view and the parent form follow whatever is typed here.

import React, { createContext, useContext, useReducer, useRef, useState } from "react";
import { TypeField } from "@wso2/ballerina-core";
import { Codicon, Dropdown, TextField } from "@wso2/ui-toolkit";
import { ModeToggle, TypeChip } from "@wso2/ballerina-side-panel";
import { cloneElement } from "../RecordConstructView/utils";
import {
    PrimitiveTypeName,
    childPath,
    choiceOptions,
    choiceValue,
    fieldKind,
    isNumberLiteral,
    isRequiredField,
    itemPath,
    literalModeOf,
    literalSource,
    literalText,
    resolveUnion,
    sectionRecord,
    setChoiceValue,
    shownFields,
    typeLabel,
} from "./model";
import {
    CardBody,
    CardHeader,
    EmptyState,
    FieldBlock,
    FieldDescription,
    FieldLabel,
    FieldList,
    FieldRow,
    ItemCard,
    ItemRow,
    LinkButton,
    RemoveButton,
    RequiredMark,
    SectionBody,
    SectionHeader,
    SectionTitle,
    ToggleButton,
} from "./styles";

/** What the modal needs to draw an expression editor for one field. */
export interface ExpressionEditorArgs {
    /** A key unique to the field within the record: its path. */
    id: string;
    value: string;
    onChange: (value: string) => void;
    field: TypeField;
}

/** What a field shows under its input, such as the configurable line of a connection's field. */
export interface FieldFooterArgs {
    field: TypeField;
    path: string;
    /** Whether the field is written as an expression rather than typed as a literal. */
    isExpression: boolean;
    /** The literal the field holds, as source, or "" when it holds none. */
    value: string;
}

export interface RecordFormViewProps {
    /** The record being constructed: the model the tree edits. */
    record: TypeField;
    /** A field's value changed. The model already holds it; the modal regenerates the source. */
    onValueChange: () => void;
    /** Fields or items were added or removed, or a choice changed: the tree has to be redrawn. */
    onStructureChange: () => void;
    renderExpressionEditor: (args: ExpressionEditorArgs) => React.ReactNode;
    renderFieldFooter?: (args: FieldFooterArgs) => React.ReactNode;
}

interface FormViewContextValue extends Omit<RecordFormViewProps, "record"> {
    isExpression: (path: string, initial: () => boolean) => boolean;
    setExpression: (path: string, expression: boolean) => void;
}

const FormViewContext = createContext<FormViewContextValue | null>(null);

function useFormView(): FormViewContextValue {
    const context = useContext(FormViewContext);
    if (!context) {
        throw new Error("A record form field rendered outside RecordFormView");
    }
    return context;
}

export function RecordFormView(props: RecordFormViewProps) {
    const { record, ...handlers } = props;
    // Whether each field, by path, is in expression mode. It outlives a redraw, so switching a field to
    // Expression sticks while the user edits the others; a field not yet switched follows its value.
    const modes = useRef(new Map<string, boolean>());
    const [, redraw] = useReducer((count: number) => count + 1, 0);

    const context: FormViewContextValue = {
        ...handlers,
        isExpression: (path, initial) => {
            if (!modes.current.has(path)) {
                modes.current.set(path, initial());
            }
            return modes.current.get(path);
        },
        setExpression: (path, expression) => {
            modes.current.set(path, expression);
            redraw();
        },
    };

    const fields = shownFields(record);
    return (
        <FormViewContext.Provider value={context}>
            {fields.length === 0 ? (
                <EmptyState data-testid="record-form-empty">Select fields on the left to add them here.</EmptyState>
            ) : (
                <FieldList data-testid="record-form">
                    {fields.map((field) => (
                        <FieldView key={field.name} field={field} path={childPath("", field.name)} />
                    ))}
                </FieldList>
            )}
        </FormViewContext.Provider>
    );
}

function FieldView({ field, path }: { field: TypeField; path: string }) {
    switch (fieldKind(field)) {
        case "record":
            return <RecordSection field={field} path={path} />;
        case "array":
            return <ArrayField field={field} path={path} />;
        case "choice":
            return <ChoiceField field={field} path={path} />;
        case "primitive":
            return <PrimitiveField field={field} path={path} />;
        default:
            return <ExpressionOnlyField field={field} path={path} />;
    }
}

function Label({ field, label }: { field: TypeField; label?: string }) {
    return (
        <FieldLabel>
            {label ?? field.name}
            {isRequiredField(field) && <RequiredMark>*</RequiredMark>}
            <TypeChip label={typeLabel(field)} />
        </FieldLabel>
    );
}

/**
 * A field's label, description and mode switch. The switch sits beside the description, as in the side panel; a
 * field with no description has it beside the label, so no row is left holding the switch alone.
 */
function FieldHeader({ field, children }: { field: TypeField; children?: React.ReactNode }) {
    if (!field.documentation) {
        return (
            <FieldRow>
                <div style={{ flex: 1, minWidth: 0 }}><Label field={field} /></div>
                {children}
            </FieldRow>
        );
    }
    return (
        <>
            <Label field={field} />
            <FieldRow>
                <FieldDescription>{field.documentation}</FieldDescription>
                {children}
            </FieldRow>
        </>
    );
}

// ---- Simple values --------------------------------------------------------------------------------------------

/**
 * A string, number or boolean. A union that stands for one (`string?`) keeps its value on the union itself,
 * which RecordValueGenerator writes as is, so the value is read and written on `field` while the literal's
 * type comes from the member it resolves to.
 */
function PrimitiveField({ field, path }: { field: TypeField; path: string }) {
    const { isExpression, setExpression, renderExpressionEditor, renderFieldFooter, onValueChange } = useFormView();
    const typeName = (field.typeName === "union" ? resolveUnion(field).typeName : field.typeName) as PrimitiveTypeName;
    const source = typeof field.value === "string" ? field.value : "";
    const expression = isExpression(path, () => literalText(source, typeName) === undefined);
    const literalMode = literalModeOf(typeName);

    const write = (value: string) => {
        field.value = value;
        onValueChange();
    };

    const switchMode = (toExpression: boolean) => {
        if (toExpression === expression) {
            return;
        }
        // A literal reads the same as an expression; an expression that is no literal can't be shown as one.
        if (!toExpression && literalText(source, typeName) === undefined) {
            write("");
        }
        setExpression(path, toExpression);
    };

    return (
        <FieldBlock data-testid={`record-form-field-${path}`}>
            <FieldHeader field={field}>
                <ModeToggle
                    primaryLabel={literalMode}
                    secondaryLabel="Expression"
                    secondary={expression}
                    onChange={switchMode}
                    testId={`record-form-mode-${path}`}
                />
            </FieldHeader>
            {expression ? (
                renderExpressionEditor({ id: path, value: source, onChange: write, field })
            ) : literalMode === "Boolean" ? (
                <Dropdown
                    id={`record-form-${path}`}
                    aria-label={field.name}
                    value={literalText(source, typeName) || ""}
                    items={[{ value: "", content: "" }, { value: "true", content: "true" }, { value: "false", content: "false" }]}
                    onValueChange={(value) => write(value)}
                    sx={{ width: "100%" }}
                    containerSx={{ width: "100%" }}
                />
            ) : (
                <LiteralInput path={path} typeName={typeName} source={source} onWrite={write} label={field.name} />
            )}
            {renderFieldFooter?.({ field, path, isExpression: expression, value: expression ? "" : source })}
        </FieldBlock>
    );
}

/** A text or number input. A number that does not parse is shown but not written, so the source stays valid. */
function LiteralInput(props: {
    path: string;
    typeName: PrimitiveTypeName;
    source: string;
    label?: string;
    onWrite: (source: string) => void;
}) {
    const { path, typeName, source, label, onWrite } = props;
    const [text, setText] = useState(() => literalText(source, typeName) ?? "");
    const isNumber = literalModeOf(typeName) === "Number";
    const invalid = isNumber && text.trim() !== "" && !isNumberLiteral(text, typeName);

    const handleChange = (next: string) => {
        setText(next);
        if (!isNumber || next.trim() === "" || isNumberLiteral(next, typeName)) {
            onWrite(literalSource(next, typeName));
        }
    };

    return (
        <TextField
            id={`record-form-${path}`}
            aria-label={label}
            value={text}
            onTextChange={handleChange}
            errorMsg={invalid ? `Enter ${typeName === "int" || typeName === "byte" ? "a whole number" : "a number"}` : undefined}
            sx={{ width: "100%" }}
        />
    );
}

// ---- Choices --------------------------------------------------------------------------------------------------

/**
 * An `enum`, or a union of constants. A union can also take an expression, written on the union itself; an
 * enum cannot, as RecordValueGenerator builds an enum only from its selected member.
 */
function ChoiceField({ field, path }: { field: TypeField; path: string }) {
    const { isExpression, setExpression, renderExpressionEditor, onValueChange, onStructureChange } = useFormView();
    const canBeExpression = field.typeName === "union";
    const options = choiceOptions(field);
    const current = choiceValue(field);
    const source = typeof field.value === "string" ? field.value : "";
    const expression = canBeExpression && isExpression(path, () => !current && source.trim() !== "");

    const select = (name: string) => {
        setChoiceValue(field, name);
        onStructureChange();
    };

    const switchMode = (toExpression: boolean) => {
        if (toExpression === expression) {
            return;
        }
        if (toExpression) {
            for (const member of field.members ?? []) {
                member.selected = false;
            }
            field.value = current ? `"${current}"` : "";
        } else {
            setChoiceValue(field, current ?? options[0]);
        }
        setExpression(path, toExpression);
        onStructureChange();
    };

    return (
        <FieldBlock data-testid={`record-form-field-${path}`}>
            <FieldHeader field={field}>
                {canBeExpression && (
                    <ModeToggle
                        primaryLabel="Select"
                        secondaryLabel="Expression"
                        secondary={expression}
                        onChange={switchMode}
                        testId={`record-form-mode-${path}`}
                    />
                )}
            </FieldHeader>
            {expression ? (
                renderExpressionEditor({
                    id: path,
                    value: source,
                    onChange: (value) => { field.value = value; onValueChange(); },
                    field,
                })
            ) : (
                <Dropdown
                    id={`record-form-${path}`}
                    aria-label={field.name}
                    value={current ?? ""}
                    items={options.map((option) => ({ value: option, content: option }))}
                    onValueChange={select}
                    sx={{ width: "100%" }}
                    containerSx={{ width: "100%" }}
                />
            )}
        </FieldBlock>
    );
}

// ---- Expressions ----------------------------------------------------------------------------------------------

/** A type the form has no input for, such as a map or an object: written as an expression. */
function ExpressionOnlyField({ field, path }: { field: TypeField; path: string }) {
    const { renderExpressionEditor, onValueChange } = useFormView();
    const source = typeof field.value === "string" ? field.value : "";
    return (
        <FieldBlock data-testid={`record-form-field-${path}`}>
            <FieldHeader field={field} />
            {renderExpressionEditor({
                id: path,
                value: source,
                onChange: (value) => { field.value = value; onValueChange(); },
                field,
            })}
        </FieldBlock>
    );
}

// ---- Records --------------------------------------------------------------------------------------------------

/**
 * A record's fields under a header, indented beside a guide line so it is clear which header they belong to. The
 * header names the field but not its record type: nothing is typed into it, and the tree shows the type.
 */
function RecordSection({ field, path }: { field: TypeField; path: string }) {
    const [open, setOpen] = useState(true);
    const record = sectionRecord(field);
    if (field.typeName === "union" && !(field.members ?? []).some((member) => member.selected)) {
        // RecordValueGenerator builds a union from its selected member; the tree normally picks one.
        record.selected = true;
    }
    const fields = shownFields(record);
    return (
        <FieldBlock data-testid={`record-form-section-${path}`}>
            <SectionHeader>
                <ToggleButton
                    type="button"
                    aria-expanded={open}
                    aria-label={`${open ? "Collapse" : "Expand"} ${field.name}`}
                    onClick={() => setOpen(!open)}
                >
                    <Codicon name={open ? "chevron-down" : "chevron-right"} />
                </ToggleButton>
                <SectionTitle>
                    {field.name}
                    {isRequiredField(field) && <RequiredMark>*</RequiredMark>}
                </SectionTitle>
            </SectionHeader>
            {open && (
                <SectionBody>
                    {fields.length === 0 ? (
                        <FieldDescription>Select its fields on the left.</FieldDescription>
                    ) : (
                        fields.map((child) => (
                            <FieldView key={child.name} field={child} path={childPath(path, child.name)} />
                        ))
                    )}
                </SectionBody>
            )}
        </FieldBlock>
    );
}

// ---- Arrays ---------------------------------------------------------------------------------------------------

/** An array: records as cards, simple values as rows, anything else as one expression per item. */
function ArrayField({ field, path }: { field: TypeField; path: string }) {
    const { isExpression, setExpression, renderExpressionEditor, onValueChange, onStructureChange } = useFormView();
    const [open, setOpen] = useState(true);
    const memberType = field.memberType;
    const itemKind = memberType ? fieldKind(memberType) : "expression";
    const elements = field.elements ?? [];
    const source = typeof field.value === "string" ? field.value : "";
    const expression = isExpression(path, () => elements.length === 0 && source.trim() !== "" && source.trim() !== "[]");

    const setElements = (next: TypeField[]) => {
        field.elements = next;
        field.selected = true;
        onStructureChange();
    };

    const switchMode = (toExpression: boolean) => {
        if (toExpression === expression) {
            return;
        }
        // RecordValueGenerator writes the items when there are any, else the array's own value.
        field.elements = [];
        field.value = "";
        setExpression(path, toExpression);
        onStructureChange();
    };

    const addLabel = itemKind === "record" ? "Add item" : "Add value";

    return (
        <FieldBlock data-testid={`record-form-section-${path}`}>
            <SectionHeader>
                <ToggleButton
                    type="button"
                    aria-expanded={open}
                    aria-label={`${open ? "Collapse" : "Expand"} ${field.name}`}
                    onClick={() => setOpen(!open)}
                >
                    <Codicon name={open ? "chevron-down" : "chevron-right"} />
                </ToggleButton>
                <SectionTitle>
                    {field.name}
                    {isRequiredField(field) && <RequiredMark>*</RequiredMark>}
                </SectionTitle>
                <TypeChip label={typeLabel(field)} />
                <span style={{ flex: 1 }} />
                <ModeToggle
                    primaryLabel="Array"
                    secondaryLabel="Expression"
                    secondary={expression}
                    onChange={switchMode}
                    testId={`record-form-mode-${path}`}
                />
            </SectionHeader>
            {open && (
                <SectionBody>
                    {expression ? (
                        renderExpressionEditor({
                            id: path,
                            value: source,
                            onChange: (value) => { field.value = value; onValueChange(); },
                            field,
                        })
                    ) : (
                        <>
                            {elements.map((element, index) => {
                                const elementPath = itemPath(path, index);
                                const remove = () => setElements(elements.filter((_, i) => i !== index));
                                if (itemKind === "record") {
                                    return (
                                        <ItemCard key={elementPath} data-testid={`record-form-item-${elementPath}`}>
                                            <CardHeader>
                                                <span>Item {index + 1}</span>
                                                <RemoveButton type="button" aria-label={`Remove item ${index + 1}`} onClick={remove}>
                                                    <Codicon name="close" />
                                                </RemoveButton>
                                            </CardHeader>
                                            <CardBody>
                                                {shownFields(sectionRecord(element)).map((child) => (
                                                    <FieldView key={child.name} field={child} path={childPath(elementPath, child.name)} />
                                                ))}
                                            </CardBody>
                                        </ItemCard>
                                    );
                                }
                                return (
                                    <ItemRow key={elementPath} data-testid={`record-form-item-${elementPath}`}>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            {itemKind === "primitive" ? (
                                                <PrimitiveItem element={element} path={elementPath} />
                                            ) : (
                                                renderExpressionEditor({
                                                    id: elementPath,
                                                    value: typeof element.value === "string" ? element.value : "",
                                                    onChange: (value) => { element.value = value; onValueChange(); },
                                                    field: element,
                                                })
                                            )}
                                        </div>
                                        <RemoveButton type="button" aria-label={`Remove value ${index + 1}`} onClick={remove}>
                                            <Codicon name="close" />
                                        </RemoveButton>
                                    </ItemRow>
                                );
                            })}
                            {memberType && (
                                <LinkButton
                                    type="button"
                                    data-testid={`record-form-add-${path}`}
                                    onClick={() => setElements([...elements, cloneElement(memberType)])}
                                >
                                    <Codicon name="add" /> {addLabel}
                                </LinkButton>
                            )}
                        </>
                    )}
                </SectionBody>
            )}
        </FieldBlock>
    );
}

/** One simple value of an array, typed as a literal of the array's member type. */
function PrimitiveItem({ element, path }: { element: TypeField; path: string }) {
    const { onValueChange } = useFormView();
    const typeName = element.typeName as PrimitiveTypeName;
    const source = typeof element.value === "string" ? element.value : "";
    const write = (value: string) => {
        element.value = value;
        onValueChange();
    };
    if (literalModeOf(typeName) === "Boolean") {
        return (
            <Dropdown
                id={`record-form-${path}`}
                value={literalText(source, typeName) || ""}
                items={[{ value: "", content: "" }, { value: "true", content: "true" }, { value: "false", content: "false" }]}
                onValueChange={write}
                sx={{ width: "100%" }}
                containerSx={{ width: "100%" }}
            />
        );
    }
    return <LiteralInput path={path} typeName={typeName} source={source} onWrite={write} />;
}

export default RecordFormView;
