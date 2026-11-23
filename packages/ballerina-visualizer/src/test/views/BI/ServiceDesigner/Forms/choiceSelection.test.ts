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

// L1: how the service configuration form turns its values into the selected branch of a CHOICE
// (a union-typed annotation such as googleapis.chat's @chat:ServiceConfig).

import type { FormField } from "@wso2/ballerina-side-panel";
import { applyChoiceSelection, shownChoiceIndex } from "../../../../../views/BI/ServiceDesigner/Forms/choiceSelection";

const audience = (enabledIndex: number): FormField =>
    ({
        key: "serviceConfig",
        type: "CHOICE",
        choices: [
            { enabled: enabledIndex === 0, properties: { endpointUrl: { value: "" } } },
            { enabled: enabledIndex === 1, properties: { projectNumber: { value: "" } } },
        ],
    } as unknown as FormField);

describe("choiceSelection", () => {
    it("enables the branch the form selected and fills only its fields", () => {
        const field = audience(0);
        applyChoiceSelection(field, { serviceConfig: 1, projectNumber: '"123"', endpointUrl: '"https://x"' });
        expect(field.choices.map(choice => choice.enabled)).toEqual([false, true]);
        expect(field.choices[1].properties.projectNumber.value).toBe('"123"');
        expect(field.choices[0].properties.endpointUrl.value).toBe("");
    });

    it("treats the shown first branch as the selection when none is enabled and none was picked", () => {
        // ChoiceForm shows the first branch but leaves the field's own value in the form.
        const field = audience(-1);
        expect(shownChoiceIndex(field)).toBe(0);
        applyChoiceSelection(field, { serviceConfig: "endpointUrl", endpointUrl: '"https://x"' });
        expect(field.choices.map(choice => choice.enabled)).toEqual([true, false]);
        expect(field.choices[0].properties.endpointUrl.value).toBe('"https://x"');
    });

    it("keeps a field's value when the form holds none for it", () => {
        const field = audience(1);
        field.choices[1].properties.projectNumber.value = '"123"';
        applyChoiceSelection(field, { serviceConfig: 1 });
        expect(field.choices[1].properties.projectNumber.value).toBe('"123"');
    });

    it("copies the form's values into the fields of a group, which the form keys by their own names", () => {
        const field = {
            key: "serviceConfig",
            type: "CHOICE",
            choices: [{
                enabled: true,
                properties: {
                    advanced: {
                        types: [{ fieldType: "GROUP_SECTION", selected: true }],
                        properties: { timeout: { value: "" } },
                    },
                },
            }],
        } as unknown as FormField;
        applyChoiceSelection(field, { serviceConfig: 0, timeout: "30" });
        expect((field.choices[0].properties.advanced.properties as any).timeout.value).toBe("30");
    });

    it("enables a disabled leaf once the user enters a value, but not for its untouched default", () => {
        const field = audience(1);
        const leaf = field.choices[1].properties.projectNumber as any;
        leaf.enabled = false;
        leaf.value = '""';
        applyChoiceSelection(field, { serviceConfig: 1, projectNumber: '""' });
        expect(leaf.enabled).toBe(false);
        applyChoiceSelection(field, { serviceConfig: 1, projectNumber: '"123"' });
        expect(leaf.enabled).toBe(true);
        expect(leaf.value).toBe('"123"');
    });
});
