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

import { getPrimaryInputType, type PropertyModel } from "@wso2/ballerina-core";
import type { FormField, FormValues } from "@wso2/ballerina-side-panel";

/** The branch ChoiceForm shows: the enabled one, else the first. */
export function shownChoiceIndex(field: FormField): number {
    const enabled = field.choices?.findIndex(choice => choice.enabled) ?? -1;
    return enabled >= 0 ? enabled : 0;
}

/**
 * A branch's leaf fields by form key. ChoiceForm registers the children of a GROUP_SECTION under their own
 * keys, so the walk descends into groups instead of looking the group's key up. A group is recognised by
 * the same primary input type ChoiceForm checks, so the two cannot disagree.
 */
export function choiceLeaves(properties: Record<string, PropertyModel> | undefined): Record<string, PropertyModel> {
    const leaves: Record<string, PropertyModel> = {};
    Object.entries(properties ?? {}).forEach(([key, property]) => {
        if (getPrimaryInputType(property.types)?.fieldType === "GROUP_SECTION" && property.properties) {
            Object.assign(leaves, choiceLeaves(property.properties));
        } else {
            leaves[key] = property;
        }
    });
    return leaves;
}

/** Whether the form holds a value for a leaf: any non-empty string, array or object, or a boolean / number. */
function hasEnteredValue(value: unknown): boolean {
    if (value === undefined || value === null || value === "") {
        return false;
    }
    if (Array.isArray(value)) {
        return value.length > 0;
    }
    return true;
}

/** A leaf's enabled flag and value as the language server loaded them, before the form changed them. */
const loadedLeaves = new WeakMap<PropertyModel, { enabled: boolean; value: unknown }>();

function loadedLeafState(leaf: PropertyModel): { enabled: boolean; value: unknown } {
    let state = loadedLeaves.get(leaf);
    if (!state) {
        state = { enabled: !!leaf.enabled, value: leaf.value };
        loadedLeaves.set(leaf, state);
    }
    return state;
}

/** The branch ChoiceForm showed when the language server loaded the field, before the form changed anything. */
const loadedChoices = new WeakMap<object, number>();

function loadedChoiceIndex(field: FormField): number {
    const key = field.choices?.[0];
    if (!key) {
        return 0;
    }
    let index = loadedChoices.get(key);
    if (index === undefined) {
        index = shownChoiceIndex(field);
        loadedChoices.set(key, index);
    }
    return index;
}

/** Marks the branch the form selected as the enabled one and copies the form's values into its fields. */
export function applyChoiceSelection(field: FormField, values: FormValues): void {
    // Read before any branch is changed below.
    const loadedIndex = loadedChoiceIndex(field);
    // ChoiceForm records an index once a branch is enabled or picked; until then the shown branch is the selection.
    const selected = typeof values[field.key] === "number" ? values[field.key] as number : shownChoiceIndex(field);
    if (!field.choices?.[selected]) {
        return;
    }
    // A branch the user switched to is written with the values the form shows for it, prefilled ones included.
    const switched = selected !== loadedIndex;
    field.choices.forEach((choice, index) => {
        choice.enabled = index === selected;
        if (!choice.enabled) {
            return;
        }
        Object.entries(choiceLeaves(choice.properties)).forEach(([key, leaf]) => {
            if (values[key] === undefined) {
                return;
            }
            // A leaf the language server left disabled (the source omits it, or holds only a spread) is written
            // once the user enters a value that differs from what it was loaded with, or switches to its branch
            // and the form shows a value for it. The shown branch's untouched template default stays disabled,
            // and is not saved as if it had been typed; a leaf edited and then set back to its loaded value
            // returns to its loaded state.
            const loaded = loadedLeafState(leaf);
            leaf.enabled = loaded.enabled ||
                (hasEnteredValue(values[key]) && (switched || JSON.stringify(values[key]) !== JSON.stringify(loaded.value)));
            leaf.value = values[key];
        });
    });
}
