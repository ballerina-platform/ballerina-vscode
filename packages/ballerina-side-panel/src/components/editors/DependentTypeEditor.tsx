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

import React, { useState, useRef, useEffect, useCallback } from "react";
import styled from "@emotion/styled";
import { SearchBox, CheckBox, Codicon, RequiredFormInput } from "@wso2/ui-toolkit";
import { FormField } from "../Form/types";
import { useFormContext } from "../../context";
import { FIELD_RADIUS } from "./MultiModeExpressionEditor/ChipExpressionEditor/constants";
import type { Type, Member, RecordSelectorType } from "@wso2/ballerina-core";

// ─── Types ──────────────────────────────────────────────────────

interface DependentTypeEditorProps {
    field: FormField;
}

// ─── Utilities ──────────────────────────────────────────────────

/**
 * Resolves child FIELD members for a given member by following refs or inline types.
 */
function resolveChildren(member: Member, referencedTypes: Type[], visited: Set<string>): Member[] {
    // Check if this member references a named type
    if (member.refs?.length) {
        const refName = member.refs[0];
        if (visited.has(refName)) return []; // circular guard
        const refType = referencedTypes.find(t => t.name === refName);
        if (refType?.members) {
            return refType.members.filter(m => m.kind === "FIELD");
        }
    }

    // Check inline type object
    if (typeof member.type === "string") return [];
    const typeObj = member.type as Type;
    if (!typeObj.members) return [];

    const children: Member[] = [];
    for (const m of typeObj.members) {
        if (m.kind === "FIELD") {
            children.push(m);
        } else if (m.kind === "TYPE" && m.refs?.length) {
            const refName = m.refs[0];
            if (visited.has(refName)) continue; // circular guard
            const refType = referencedTypes.find(t => t.name === refName);
            if (refType?.members) {
                children.push(...refType.members.filter(rm => rm.kind === "FIELD"));
            }
        }
    }
    return children;
}

/**
 * Toggles selection on a member and cascades to all its children.
 */
function toggleSelection(member: Member, selected: boolean, referencedTypes: Type[], visited: Set<string> = new Set()): void {
    member.selected = selected;

    // Track this member's ref to prevent cycles when recursing into children
    const newVisited = new Set(visited);
    if (member.refs?.length) {
        newVisited.add(member.refs[0]);
    }

    // Pass `visited` (not newVisited) so we can resolve children - the current ref must not
    // be in visited yet, otherwise resolveChildren returns [] due to circular guard
    const children = resolveChildren(member, referencedTypes, visited);
    for (const child of children) {
        toggleSelection(child, selected, referencedTypes, newVisited);
    }
}

/**
 * Checks if all FIELD members in the tree are selected.
 */
function areAllSelected(members: Member[], referencedTypes: Type[], visited: Set<string> = new Set()): boolean {
    for (const m of members) {
        if (m.kind !== "FIELD") continue;
        if (!m.selected) return false;

        const newVisited = new Set(visited);
        if (m.refs?.length) newVisited.add(m.refs[0]);

        const children = resolveChildren(m, referencedTypes, visited);
        if (children.length && !areAllSelected(children, referencedTypes, newVisited)) {
            return false;
        }
    }
    return true;
}

/**
 * Propagates selection state upwards by marking parent as selected if any child is selected.
 */
function propagateSelectionUpwards(members: Member[], referencedTypes: Type[], visited: Set<string> = new Set()): void {
    for (const member of members) {
        const newVisited = new Set(visited);
        if (member.refs?.length) newVisited.add(member.refs[0]);

        if (typeof member.type !== "string") {
            const typeObj = member.type as Type;
            if (typeObj.members?.length) {
                for (const typeMember of typeObj.members) {
                    if (typeMember.kind !== "TYPE" || !typeMember.refs?.length) continue;
                    const refName = typeMember.refs[0];
                    if (newVisited.has(refName)) continue;
                    const refType = referencedTypes.find(t => t.name === refName);
                    if (!refType?.members) continue;

                    const anyRefFieldSelected = refType.members
                        .filter(m => m.kind === "FIELD")
                        .some(m => m.selected);

                    if (typeMember.optional !== false) {
                        typeMember.selected = anyRefFieldSelected;
                    }
                }
            }
        }

        const children = resolveChildren(member, referencedTypes, visited);
        if (children.length > 0) {
            // First, recursively propagate for children
            propagateSelectionUpwards(children, referencedTypes, newVisited);
            
            // Then check if any child is selected
            const anyChildSelected = children.some(child => child.selected);
            
            // Mirror child state upward: select parent when any child is selected, deselect parent when all children are deselected.
            if (member.optional !== false) {
                member.selected = anyChildSelected;
            }
        }
    }
}

/**
 * Checks if a field has partial selection (some but not all children selected).
 * Returns true when a parent has some (but not all) descendants selected.
 */
function hasPartialSelection(member: Member, referencedTypes: Type[], visited: Set<string> = new Set()): boolean {
    const newVisited = new Set(visited);
    if (member.refs?.length) newVisited.add(member.refs[0]);

    const children = resolveChildren(member, referencedTypes, visited);
    if (!children.length) return false;

    let anySelected = false;
    let allSelected = true;

    for (const child of children) {
        const childIsSelected = child.selected;
        const childHasPartial = hasPartialSelection(child, referencedTypes, newVisited);

        // If any child has partial selection, parent is partial
        if (childHasPartial) return true;

        if (childIsSelected) {
            anySelected = true;
        } else {
            allSelected = false;
        }
    }

    // Partial if some (but not all) children are selected
    return anySelected && !allSelected;
}

/**
 * Checks if at least one field is selected in the entire tree.
 */
function hasAnySelection(members: Member[], referencedTypes: Type[], visited: Set<string> = new Set()): boolean {
    for (const m of members) {
        if (m.kind !== "FIELD") continue;
        if (m.selected) return true;

        const newVisited = new Set(visited);
        if (m.refs?.length) newVisited.add(m.refs[0]);

        const children = resolveChildren(m, referencedTypes, visited);
        if (children.length && hasAnySelection(children, referencedTypes, newVisited)) {
            return true;
        }
    }
    return false;
}

// ─── Styled Components ──────────────────────────────────────────

const Container = styled.div`
    display: flex;
    flex-direction: column;
    width: 100%;
    margin-bottom: 16px;
`;

const LabelContainer = styled.div`
    display: flex;
    align-items: center;
    margin-bottom: 4px;
`;

const Label = styled.label`
    color: var(--vscode-editor-foreground);
    text-transform: capitalize;
    font-size: 13px;
    font-family: var(--vscode-font-family);
`;

const Description = styled.div`
    font-size: 13px;
    font-family: var(--vscode-font-family);
    color: var(--vscode-list-deemphasizedForeground);
    margin-bottom: 8px;
`;

const Wrapper = styled.div`
    border: 1px solid var(--vscode-dropdown-border);
    border-radius: ${FIELD_RADIUS};
    background: var(--vscode-input-background);
`;

const SearchArea = styled.div`
    padding: 8px;
`;

const Dropdown = styled.div`
    border-top: 1px solid var(--vscode-dropdown-border);
`;

const SelectAllRow = styled.div`
    display: flex;
    align-items: center;
    padding: 8px 12px;
    background: var(--vscode-editor-background);
    border-bottom: 1px solid var(--vscode-dropdown-border);
`;

const SelectAllText = styled.span`
    font-size: 13px;
    font-weight: 600;
    color: var(--vscode-foreground);
    margin-left: 8px;
`;

const TreeContainer = styled.div`
    max-height: 400px;
    overflow-y: auto;

    &::-webkit-scrollbar {
        width: 10px;
    }
    &::-webkit-scrollbar-track {
        background: var(--vscode-scrollbarSlider-background);
    }
    &::-webkit-scrollbar-thumb {
        background: var(--vscode-scrollbarSlider-hoverBackground);
        border-radius: 5px;
    }
`;

const TreeItem = styled.div<{ depth: number }>`
    display: flex;
    align-items: center;
    padding: 8px 12px;
    padding-left: ${p => 12 + p.depth * 20}px;
    border-bottom: 1px solid var(--vscode-dropdown-border);

    &:hover {
        background: var(--vscode-list-hoverBackground);
    }
    &:last-child {
        border-bottom: none;
    }
`;

const ExpandButton = styled.span<{ expanded: boolean }>`
    display: inline-flex;
    width: 16px;
    height: 16px;
    margin-right: 4px;
    cursor: pointer;
    transform: ${p => p.expanded ? "rotate(90deg)" : "rotate(0deg)"};
    transition: transform 0.2s;
`;

const Spacer = styled.span`
    width: 16px;
    height: 16px;
    margin-right: 4px;
`;

const FieldLabel = styled.span`
    flex: 1;
    font-size: 13px;
    color: var(--vscode-foreground);
    margin-left: 8px;
    cursor: pointer;
    user-select: none;
`;

const TypeTag = styled.span`
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 3px;
    margin-left: 8px;
    font-weight: 500;
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
`;


// ─── Component ──────────────────────────────────────────────────

export function DependentTypeEditor(props: DependentTypeEditorProps) {
    const { field } = props;
    const { form } = useFormContext();
    const { setValue, register } = form;

    const [search, setSearch] = useState("");
    const [expanded, setExpanded] = useState<Set<string>>(new Set());

    // Extract the record selector type from field.types
    const recordSelectorEntry = field.types?.find(
        (t: any) => t.fieldType === "RECORD_FIELD_SELECTOR"
    ) as any;

    const initialData = recordSelectorEntry?.recordSelectorType as RecordSelectorType | undefined;

    // Clone into a mutable ref (immutable props pattern)
    const dataRef = useRef<RecordSelectorType | undefined>(undefined);
    if (!dataRef.current && initialData) {
        dataRef.current = JSON.parse(JSON.stringify(initialData));
    }

    const data = dataRef.current;
    const rootType = data?.rootType;
    const referencedTypes = data?.referencedTypes ?? [];

    // Register field and sync initial value
    useEffect(() => {
        register(field.key, {
            validate: () => {
                // Only validate if field is required
                if (!field.optional && rootType?.members) {
                    const hasSelectableFields = rootType.members.some(m => m.kind === "FIELD");
                    if (!hasSelectableFields) return true; // nothing to select, pass validation
                    const hasSelection = hasAnySelection(rootType.members, referencedTypes);
                    return hasSelection || "At least one field must be selected";
                }
                return true;
            }
        });
        syncToForm();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [field.key, register]);

    // Sync current selection state back to form
    const syncToForm = useCallback(() => {
        if (!data) return;
        const updatedTypes = (field.types ?? []).map((t: any) => {
            if (t.fieldType === "RECORD_FIELD_SELECTOR") {
                return { ...t, recordSelectorType: JSON.parse(JSON.stringify(data)) };
            }
            return t;
        });
        // field.types = updatedTypes;
        setValue(field.key, updatedTypes, { shouldValidate: true });
    }, [data, field, setValue, rootType, referencedTypes]);

    // Force re-render by incrementing a dummy state
    const [, forceUpdate] = useState(0);
    const triggerUpdate = () => {
        forceUpdate(v => v + 1);
        syncToForm();
    };

    // Handlers
    const handleToggleField = (member: Member) => {
        // Skip if field is required (cannot be unchecked)
        if (member.optional === false) return;

        // If partial selection, clicking should select all (complete the selection)
        // If selected, clicking should deselect all
        // If unselected (and no partial), clicking should select all
        const isPartial = hasPartialSelection(member, referencedTypes);
        const shouldSelect = !member.selected || isPartial;
        toggleSelection(member, shouldSelect, referencedTypes);
        
        // Propagate selection upwards - mark parents as selected if any child is selected
        if (rootType?.members) {
            propagateSelectionUpwards(rootType.members, referencedTypes);
        }
        
        triggerUpdate();
    };

    const handleSelectAll = () => {
        if (!rootType?.members) return;
        const allChecked = areAllSelected(rootType.members, referencedTypes);
        for (const m of rootType.members) {
            if (m.kind === "FIELD") {
                toggleSelection(m, !allChecked, referencedTypes);
            }
        }
        propagateSelectionUpwards(rootType.members, referencedTypes);
        triggerUpdate();
    };

    const toggleExpanded = (path: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setExpanded(prev => {
            const next = new Set(prev);
            next.has(path) ? next.delete(path) : next.add(path);
            return next;
        });
    };

    // Recursive tree renderer
    const renderTree = (
        members: Member[],
        parentPath: string,
        depth: number,
        visited: Set<string> = new Set()
    ): React.ReactNode => {
        return members
            .filter(m => m.kind === "FIELD" && m.name)
            .filter(m => !search || m.name!.toLowerCase().includes(search.toLowerCase()))
            .map(m => {
                const path = parentPath ? `${parentPath}.${m.name}` : m.name!;

                const newVisited = new Set(visited);
                if (m.refs?.length) newVisited.add(m.refs[0]);

                const children = resolveChildren(m, referencedTypes, visited);
                const isExpanded = expanded.has(path);
                const isPartial = hasPartialSelection(m, referencedTypes, visited);
                const isRequired = m.optional === false;

                return (
                    <React.Fragment key={path}>
                        <TreeItem depth={depth}>
                            {children.length ? (
                                <ExpandButton expanded={isExpanded} onClick={e => toggleExpanded(path, e)}>
                                    <Codicon name="chevron-right" />
                                </ExpandButton>
                            ) : (
                                <Spacer />
                            )}

                            <CheckBox
                                label=""
                                checked={m.selected || isRequired}
                                indeterminate={isPartial}
                                disabled={isRequired}
                                onChange={() => handleToggleField(m)}
                            />

                            <FieldLabel onClick={() => handleToggleField(m)}>{m.name}</FieldLabel>
                            <TypeTag>{m?.typeName}</TypeTag>
                        </TreeItem>

                        {isExpanded && children.length > 0 && renderTree(children, path, depth + 1, newVisited)}
                    </React.Fragment>
                );
            });
    };

    if (!rootType) {
        return (
            <Container>
                <LabelContainer>
                    <Label>{field.label}</Label>
                    {!field.optional && <RequiredFormInput />}
                </LabelContainer>
                <div style={{ color: "var(--vscode-errorForeground)", fontSize: 13 }}>
                    No type model available
                </div>
            </Container>
        );
    }

    return (
        <Container>
            <LabelContainer>
                <Label>{field.label}</Label>
                {!field.optional && <RequiredFormInput />}
            </LabelContainer>
            {field.documentation && <Description>{field.documentation}</Description>}

            <Wrapper>
                <SearchArea>
                    <SearchBox
                        value={search}
                        placeholder="Search and select fields..."
                        onChange={setSearch}
                        autoFocus={true}
                        sx={{ width: "100%" }}
                    />
                </SearchArea>

                <Dropdown>
                    <SelectAllRow>
                        <CheckBox
                            label=""
                            checked={areAllSelected(rootType.members, referencedTypes)}
                            onChange={handleSelectAll}
                        />
                        <SelectAllText>Select All Fields</SelectAllText>
                    </SelectAllRow>

                    <TreeContainer>
                        {renderTree(rootType.members, "", 0)}
                    </TreeContainer>
                </Dropdown>
            </Wrapper>
        </Container>
    );
}
