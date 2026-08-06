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

import React, { useState } from "react";

import { Codicon, LinkButton, ThemeColors } from "@wso2/ui-toolkit";

import { FormRow, FormButtonContainer } from "../Form";
import { FormSectionGroup } from "./FormSectionGroup";
import { FieldFactory } from "./FieldFactory";
import { FormFieldEditorProps } from "./EditorFactory";

/**
 * Renders a GROUP_SECTION field. When the group contains nested GROUP_SECTION children,
 * those nested children are flattened and rendered behind an Expand/Collapse button
 * instead of creating a nested FormSectionGroup.
 */
export function GroupSectionEditor(props: FormFieldEditorProps) {
    const {
        field,
        fieldInputType,
        recordTypeFields,
    } = props;
    const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);

    const regularChildren = field.advanceProps?.filter(child => child.type !== "GROUP_SECTION") || [];
    const nestedGroupChildren = field.advanceProps?.filter(child => child.type === "GROUP_SECTION") || [];

    // Leaf children of this group flagged `advanced` must hide under the collapsible section too —
    // only the non-advanced ones render inline.
    const visibleChildren = regularChildren.filter(child => !child.advanced);
    const advancedChildren = regularChildren.filter(child => child.advanced);
    // Advanced leaves plus any nested-group fields are collapsed together behind one toggle.
    const collapsedFields = [
        ...advancedChildren,
        ...nestedGroupChildren.flatMap(group => group.advanceProps || []),
    ];
    // "Advanced Configurations" whenever advanced leaves are present; otherwise the nested group's label.
    const collapsedSectionLabel = advancedChildren.length > 0
        ? "Advanced Configurations"
        : nestedGroupChildren[0]?.label;

    return (
        <FormSectionGroup title={field.label} defaultExpanded={fieldInputType.selected !== false}>
            {visibleChildren.map((childField) => (
                <FieldFactory
                    key={childField.key}
                    field={childField}
                    recordTypeFields={recordTypeFields}
                />
            ))}
            {collapsedFields.length > 0 && (
                <FormRow>
                    {collapsedSectionLabel}
                    <FormButtonContainer>
                        {!showAdvancedOptions && (
                            <LinkButton
                                onClick={() => setShowAdvancedOptions(true)}
                                sx={{ fontSize: 12, padding: 8, color: ThemeColors.PRIMARY, gap: 4 }}
                            >
                                <Codicon
                                    name={"chevron-down"}
                                    iconSx={{ fontSize: 12 }}
                                    sx={{ height: 12 }}
                                />
                                Expand
                            </LinkButton>
                        )}
                        {showAdvancedOptions && (
                            <LinkButton
                                onClick={() => setShowAdvancedOptions(false)}
                                sx={{ fontSize: 12, padding: 8, color: ThemeColors.PRIMARY, gap: 4 }}
                            >
                                <Codicon
                                    name={"chevron-up"}
                                    iconSx={{ fontSize: 12 }}
                                    sx={{ height: 12 }}
                                />
                                Collapse
                            </LinkButton>
                        )}
                    </FormButtonContainer>
                </FormRow>
            )}
            {showAdvancedOptions && collapsedFields.map((childField) => (
                <FieldFactory
                    key={childField.key}
                    field={childField}
                    recordTypeFields={recordTypeFields}
                />
            ))}
        </FormSectionGroup>
    );
}
