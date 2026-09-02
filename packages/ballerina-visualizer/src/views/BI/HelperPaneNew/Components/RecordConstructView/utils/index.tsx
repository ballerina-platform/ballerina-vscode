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

import {
    FormField,
    keywords,
} from "@wso2/ballerina-core";

export { getOptionalityLabel, isOptionalParam } from "./optionality";


export function isRequiredParam(param: FormField): boolean {
    return !(param.optional || param.defaultable);
}

export function isAllDefaultableFields(recordFields: FormField[]): boolean {
    return recordFields?.every((field) => field.defaultable || (field.fields && isAllDefaultableFields(field.fields)));
}

export function isAnyFieldSelected(recordFields: FormField[]): boolean {
    return recordFields?.some((field) => field.selected || (field.fields && isAnyFieldSelected(field.fields)));
}

export function getSelectedUnionMember(unionFields: FormField): FormField {
    let selectedMember = unionFields.members?.find((member) => member.selected === true);
    if (!selectedMember) {
        selectedMember = unionFields.members?.find(
            (member) => getUnionFormFieldName(member) === unionFields.selectedDataType
        );
    }
    if (!selectedMember) {
        selectedMember = unionFields.members?.find(
            (member) => member.typeName === unionFields.value?.replace(/['"]+/g, "")
        );
    }
    if (!selectedMember && unionFields.members && unionFields.members.length > 0) {
        selectedMember = unionFields.members[0];
    }
    return selectedMember;
}

export function getFieldName(fieldName: string): string {
    return keywords.includes(fieldName) ? "'" + fieldName : fieldName;
}

export function getUnionFormFieldName(field: FormField): string {
    return field.name || field.typeInfo?.name || field.typeName;
}

export function checkFormFieldValue(field: FormField): boolean {
    return field.value !== undefined && field.value !== null;
}

export function resetFieldValues(field: FormField): void {
    if (!field) return;

    // Reset the field value
    if (field.value !== undefined) {
        field.value = undefined;
    }

    // Reset nested fields
    if (field.fields && field.fields.length > 0) {
        field.fields.forEach(nestedField => {
            resetFieldValues(nestedField);
        });
    }

    // Reset union members
    if (field.members && field.members.length > 0) {
        field.members.forEach(member => {
            resetFieldValues(member);
        });
    }

    // Reset inclusion type fields
    if (field.inclusionType?.fields && field.inclusionType.fields.length > 0) {
        field.inclusionType.fields.forEach(inclusionField => {
            resetFieldValues(inclusionField);
        });
    }
}

export function updateFieldsSelection(fields: FormField[], selected: boolean): void {
    if (!fields || !fields.length) return;

    fields.forEach(field => {
        // When selecting: only select required fields
        if (!selected || isRequiredParam(field)) {
            field.selected = selected;
            
            // If selecting a union type field, ensure a member is selected synchronously
            if (selected && (field.typeName === "union" || field.typeName === "enum") && field.members && field.members.length > 0) {
                // Check if a member is already selected
                const hasSelectedMember = field.members.some(member => member.selected === true);
                
                if (!hasSelectedMember) {
                    // Select the first member (or use getSelectedUnionMember logic)
                    const memberToSelect = getSelectedUnionMember(field) || field.members[0];
                    if (memberToSelect) {
                        const memberName = getUnionFormFieldName(memberToSelect);
                        // Mark the selected member
                        field.members.forEach(member => {
                            member.selected = getUnionFormFieldName(member) === memberName;
                            
                            // If this is the selected member and it has nested fields, select required fields
                            if (member.selected && member.fields && member.fields.length > 0) {
                                updateFieldsSelection(member.fields, true);
                            }
                        });
                    }
                } else {
                    // If a member is already selected, ensure its required fields are selected
                    const selectedMember = field.members.find(member => member.selected === true);
                    if (selectedMember && selectedMember.fields && selectedMember.fields.length > 0) {
                        updateFieldsSelection(selectedMember.fields, true);
                    }
                }
            }
        }

        // Recursively process nested fields
        // Note: For union types, we handle members above, but union members can have fields too
        if (field.fields && field.fields.length > 0) {
            updateFieldsSelection(field.fields, selected);
        }
    });
}
