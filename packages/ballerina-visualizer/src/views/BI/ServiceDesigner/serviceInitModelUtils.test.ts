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
import { applyFormValuesToModel, disambiguateFormKeys, restoreFormKeys, toFormValidationErrors } from "./serviceInitModelUtils";

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

    it("escapes a hyphenated basePath supplied as a top-level field (e.g. an MCP service)", () => {
        const basePathProperty: any = {
            value: undefined,
            enabled: true,
            editable: true,
            optional: false,
            types: [{ fieldType: "SERVICE_PATH", selected: true }],
        };

        const model = {
            properties: { basePath: basePathProperty },
        } as unknown as ServiceInitModel;

        const basePathField: FormField = {
            key: "basePath",
            label: "Base Path",
            type: "SERVICE_PATH",
            optional: false,
            editable: true,
            documentation: "",
            value: undefined,
            types: [{ fieldType: "SERVICE_PATH", selected: true } as any],
            enabled: true,
        };

        applyFormValuesToModel([basePathField], model, { basePath: "/mcp-foo" }, {});

        expect(basePathProperty.value).toBe("/mcp\\-foo");
    });

    it("still escapes a hyphenated basePath nested inside a CHOICE field (e.g. an HTTP service)", () => {
        const basePathProperty: any = {
            value: undefined,
            enabled: true,
            editable: true,
            optional: false,
            types: [{ fieldType: "TEXT", selected: true }],
        };

        const choiceField: FormField = {
            key: "listenerConfig",
            label: "Listener protocol",
            type: "CHOICE",
            optional: false,
            editable: true,
            documentation: "",
            value: undefined,
            enabled: true,
            choices: [
                {
                    enabled: false,
                    properties: { basePath: basePathProperty },
                } as any,
            ],
        } as unknown as FormField;

        const model = { properties: {} } as unknown as ServiceInitModel;

        applyFormValuesToModel([choiceField], model, { listenerConfig: 0, basePath: "/api-v1" }, {});

        expect(basePathProperty.value).toBe("/api\\-v1");
    });

    it("leaves other top-level fields unescaped", () => {
        const model = {
            properties: { serviceName: { value: undefined } },
        } as unknown as ServiceInitModel;

        const serviceNameField: FormField = {
            key: "serviceName",
            label: "Service Name",
            type: "TEXT",
            optional: false,
            editable: true,
            documentation: "",
            value: undefined,
            types: [{ fieldType: "TEXT", selected: true } as any],
            enabled: true,
        };

        applyFormValuesToModel([serviceNameField], model, { serviceName: "my-service" }, {});

        expect(model.properties.serviceName.value).toBe("my-service");
    });
});

describe("disambiguateFormKeys", () => {
    const field = (fieldType: string, extra: any = {}): any =>
        ({ enabled: true, editable: true, optional: false, types: [{ fieldType, selected: true }], ...extra });
    const choiceWith = (properties: any): any => field("CHOICE", { choices: [{ properties }] });

    it("renames a nested CHOICE that shares a top-level key, and restores it", () => {
        const model = {
            properties: { listener: field("EXPRESSION"), config: choiceWith({ listener: choiceWith({}) }) },
        } as unknown as ServiceInitModel;

        const disambiguated = disambiguateFormKeys(model);

        expect(Object.keys(disambiguated.properties.config.choices[0].properties)).toEqual(["listener__field"]);
        expect(Object.keys(restoreFormKeys(disambiguated).properties.config.choices[0].properties))
            .toEqual(["listener"]);
    });

    it("keeps a nested CHOICE's key when no top-level field shares it", () => {
        const model = {
            properties: { config: choiceWith({ mode: choiceWith({}) }) },
        } as unknown as ServiceInitModel;

        expect(Object.keys(disambiguateFormKeys(model).properties.config.choices[0].properties)).toEqual(["mode"]);
    });

    it("renames a nested plain field that shares a CHOICE's key", () => {
        const model = {
            properties: { listener: choiceWith({ listener: field("EXPRESSION") }) },
        } as unknown as ServiceInitModel;

        expect(Object.keys(disambiguateFormKeys(model).properties.listener.choices[0].properties))
            .toEqual(["listener__field"]);
    });

    it("routes a server error on a renamed nested field onto its form key", () => {
        const model = disambiguateFormKeys({
            properties: { listener: choiceWith({ listener: field("EXPRESSION"), port: field("EXPRESSION") }) },
        } as unknown as ServiceInitModel);
        const error = (propertyPath: string): any => ({ propertyPath, rule: "r", message: "m", severity: "ERROR" });

        expect(toFormValidationErrors(model, [
            error("listener.choices.0.listener"),
            error("listener.choices.0.port"),
            error("listener"),
        ]).map((e) => e.propertyPath)).toEqual([
            "listener.choices.0.listener__field",
            "listener.choices.0.port",
            "listener",
        ]);
    });
});
