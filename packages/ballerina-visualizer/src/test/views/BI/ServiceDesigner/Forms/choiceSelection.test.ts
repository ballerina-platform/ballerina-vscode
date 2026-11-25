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

// The barrel pulls in the language-server client; only the primary-input-type helper is used here.
jest.mock("@wso2/ballerina-core", () => ({
    getPrimaryInputType: (types?: unknown[]) => (types && types.length > 0 ? types[0] : undefined),
}));

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

    it("writes the value the form shows for a branch the user switched to, even a prefilled one", () => {
        // A bare `@chat:ServiceConfig` loads with no branch enabled and the leaves cleared but still holding
        // their template defaults; the form shows the first branch until the user picks another.
        const field = audience(-1);
        const endpoint = field.choices[0].properties.endpointUrl as any;
        const project = field.choices[1].properties.projectNumber as any;
        endpoint.enabled = false;
        endpoint.value = '"https://default"';
        project.enabled = false;
        project.value = '"1234567890"';
        applyChoiceSelection(field, { serviceConfig: 1, endpointUrl: '"https://default"', projectNumber: '"1234567890"' });
        expect(field.choices.map(choice => choice.enabled)).toEqual([false, true]);
        expect(project.enabled).toBe(true);
        expect(project.value).toBe('"1234567890"');
    });

    it("does not write the shown branch's untouched prefilled default, nor after an unrelated change", () => {
        const field = audience(-1);
        const endpoint = field.choices[0].properties.endpointUrl as any;
        endpoint.enabled = false;
        endpoint.value = '"https://default"';
        applyChoiceSelection(field, { serviceConfig: 0, endpointUrl: '"https://default"' });
        applyChoiceSelection(field, { endpointUrl: '"https://default"' });
        expect(endpoint.enabled).toBe(false);
    });

    it("returns a leaf to disabled when it is edited and then set back to its loaded value", () => {
        const field = audience(1);
        const leaf = field.choices[1].properties.projectNumber as any;
        leaf.enabled = false;
        leaf.value = '""';
        applyChoiceSelection(field, { serviceConfig: 1, projectNumber: '"123"' });
        expect(leaf.enabled).toBe(true);
        applyChoiceSelection(field, { serviceConfig: 1, projectNumber: '""' });
        expect(leaf.enabled).toBe(false);
    });

    it("enables a disabled boolean or array leaf once the user sets it", () => {
        const field = {
            key: "serviceConfig",
            type: "CHOICE",
            choices: [{
                enabled: true,
                properties: {
                    secure: { enabled: false, value: false },
                    scopes: { enabled: false, value: [] },
                },
            }],
        } as unknown as FormField;
        const { secure, scopes } = field.choices[0].properties as any;
        applyChoiceSelection(field, { serviceConfig: 0, secure: false, scopes: [] });
        expect([secure.enabled, scopes.enabled]).toEqual([false, false]);
        applyChoiceSelection(field, { serviceConfig: 0, secure: true, scopes: ["a"] });
        expect([secure.enabled, scopes.enabled]).toEqual([true, true]);
    });
});
