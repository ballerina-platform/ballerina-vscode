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

import type { FormField, FormValues } from "@wso2/ballerina-side-panel";

/** The branch ChoiceForm shows: the enabled one, else the first. */
export function shownChoiceIndex(field: FormField): number {
    const enabled = field.choices?.findIndex(choice => choice.enabled) ?? -1;
    return enabled >= 0 ? enabled : 0;
}

/** Marks the branch the form selected as the enabled one and copies the form's values into its fields. */
export function applyChoiceSelection(field: FormField, values: FormValues): void {
    // ChoiceForm records an index once a branch is enabled or picked; until then the shown branch is the selection.
    const selected = typeof values[field.key] === "number" ? values[field.key] as number : shownChoiceIndex(field);
    if (!field.choices?.[selected]) {
        return;
    }
    field.choices.forEach((choice, index) => {
        choice.enabled = index === selected;
        if (!choice.enabled) {
            return;
        }
        for (const key in choice.properties) {
            if (values[key] !== undefined) {
                choice.properties[key].value = values[key];
            }
        }
    });
}
