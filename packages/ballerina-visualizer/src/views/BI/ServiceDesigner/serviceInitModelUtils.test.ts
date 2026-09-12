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

// The only mock here is @wso2/ballerina-core, matching payloadComposer.test.ts's own
// rationale: its barrel export re-exports WSConnection, which requires vscode-ws-jsonrpc —
// an ESM-only package Jest cannot load without extra transform config. `getPrimaryInputType`
// is the one runtime value serviceInitModelUtils.ts (and this file) actually needs from the
// package; every other import below is a type, fully erased at compile time.
jest.mock("@wso2/ballerina-core", () => ({
    getPrimaryInputType: (types: any[]) => (types && types.length > 0 ? types[0] : undefined),
}));

// ../../../utils/bi.tsx pulls in @wso2/bi-diagram (also ESM-only) at module scope; stub the
// one export serviceInitModelUtils.ts actually calls.
jest.mock("../../../utils/bi", () => ({
    getImportsForProperty: (key: string, imports: any) => (imports ? imports[key] : undefined),
}));

import { FormField, FormValues } from "@wso2/ballerina-side-panel";
import { ServiceInitModel } from "@wso2/ballerina-core";
import { applyFormValuesToModel } from "./serviceInitModelUtils";

describe("applyFormValuesToModel", () => {
    // GROUP_SECTION subfields previously always wrote `subProperty.value`, even for
    // MULTIPLE_SELECT/EXPRESSION_SET/TEXT_SET fields — losing the submitted collection,
    // since only `.values` (not `.value`) is read back for those field types.
    it("preserves collection values for a MULTIPLE_SELECT subfield inside a GROUP_SECTION", () => {
        const rolesProperty: any = {
            value: undefined,
            values: undefined,
            enabled: true,
            editable: true,
            optional: true,
            types: [{ fieldType: "MULTIPLE_SELECT", selected: true, options: [] }],
        };

        const model = {
            properties: {
                advancedConfig: {
                    value: undefined,
                    enabled: true,
                    editable: true,
                    optional: true,
                    types: [{ fieldType: "GROUP_SECTION", selected: true }],
                    properties: { roles: rolesProperty },
                },
            },
        } as unknown as ServiceInitModel;

        const rolesField: FormField = {
            key: "roles",
            label: "Roles",
            type: "MULTIPLE_SELECT",
            optional: true,
            editable: true,
            documentation: "",
            value: undefined,
            types: [{ fieldType: "MULTIPLE_SELECT", selected: true, options: [] } as any],
            enabled: true,
        };

        const groupField: FormField = {
            key: "advancedConfig",
            label: "Advanced",
            type: "GROUP_SECTION",
            optional: true,
            editable: true,
            documentation: "",
            value: undefined,
            types: [{ fieldType: "GROUP_SECTION", selected: true } as any],
            enabled: true,
            advanceProps: [rolesField],
        };

        const data: FormValues = { roles: ["admin", "viewer"] };

        applyFormValuesToModel([groupField], model, data, {});

        expect(rolesProperty.values).toEqual(["admin", "viewer"]);
        expect(rolesProperty.value).toBeUndefined();
    });

    it("still writes plain fields inside a GROUP_SECTION onto .value", () => {
        const timeoutProperty: any = {
            value: undefined,
            enabled: true,
            editable: true,
            optional: true,
            types: [{ fieldType: "TEXT", selected: true }],
        };

        const model = {
            properties: {
                advancedConfig: {
                    value: undefined,
                    enabled: true,
                    editable: true,
                    optional: true,
                    types: [{ fieldType: "GROUP_SECTION", selected: true }],
                    properties: { timeout: timeoutProperty },
                },
            },
        } as unknown as ServiceInitModel;

        const timeoutField: FormField = {
            key: "timeout",
            label: "Timeout",
            type: "TEXT",
            optional: true,
            editable: true,
            documentation: "",
            value: undefined,
            types: [{ fieldType: "TEXT", selected: true } as any],
            enabled: true,
        };

        const groupField: FormField = {
            key: "advancedConfig",
            label: "Advanced",
            type: "GROUP_SECTION",
            optional: true,
            editable: true,
            documentation: "",
            value: undefined,
            types: [{ fieldType: "GROUP_SECTION", selected: true } as any],
            enabled: true,
            advanceProps: [timeoutField],
        };

        applyFormValuesToModel([groupField], model, { timeout: "30s" }, {});

        expect(timeoutProperty.value).toBe("30s");
        expect(timeoutProperty.values).toBeUndefined();
    });
});
