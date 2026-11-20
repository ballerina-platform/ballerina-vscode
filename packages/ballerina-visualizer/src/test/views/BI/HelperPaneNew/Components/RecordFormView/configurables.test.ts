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

// L1: which fields of a new connection's record the form offers to make configurable, and what it tells the
// language server about them. The language server makes every simple literal configurable unless told to keep it,
// walking records but not lists, so the form must name the same fields by the same paths, and say `keep` for each
// optional one the user hasn't checked.

import type { ConnectionConfigurablePreview, TypeField } from "@wso2/ballerina-core";
import { loadFixtures } from "@wso2/test-config/fixtures";
import { normalizeIntersections } from "../../../../../../views/BI/HelperPaneNew/Components/RecordConstructView/utils/intersection";
import {
    choicesToSend,
    configurableFields,
    fieldAtPath,
    replaceIdentifiers,
    isConfigurable,
    isValidConfigurableName,
    parameterKey,
    planRename,
    renameConfigurableInChoices,
    shownName,
} from "../../../../../../views/BI/HelperPaneNew/Components/RecordFormView/configurables";
import { fieldKind, isPrimitiveTypeName } from "../../../../../../views/BI/HelperPaneNew/Components/RecordFormView/model";

interface RecordConfigFixture {
    recordConfig: TypeField;
}

const fixtures = loadFixtures<RecordConfigFixture>(
    __dirname, "..", "RecordConstructView", "utils", "fixtures", "recordConfigs");

/** The Salesforce connection config: a required token under auth, an optional URL, a list, an unchecked field. */
function connectionConfig(): TypeField {
    return {
        typeName: "record",
        name: "ConnectionConfig",
        selected: true,
        fields: [
            {
                typeName: "record", name: "auth", selected: true,
                fields: [{ typeName: "string", name: "token", selected: true }],
            },
            { typeName: "string", name: "baseUrl", selected: true, optional: true },
            { typeName: "decimal", name: "timeout", selected: true, defaultable: true },
            { typeName: "string", name: "forwarded", selected: false, defaultable: true },
            {
                typeName: "array", name: "tags", selected: true, defaultable: true,
                memberType: { typeName: "string" },
                elements: [{ typeName: "string", selected: true, value: "\"gift\"" }],
            },
            {
                typeName: "union", name: "httpVersion", selected: true, defaultable: true,
                members: [{ typeName: "HTTP_1_1" }, { typeName: "HTTP_2_0", selected: true }],
            },
        ],
    };
}

describe("fields a configurable can stand for", () => {
    it("are the checked simple fields, by their path through records", () => {
        expect(configurableFields(connectionConfig()).map(({ path }) => path))
            .toEqual(["auth.token", "baseUrl", "timeout"]);
    });

    it("leave out lists, which the language server doesn't look into, and choices", () => {
        const paths = configurableFields(connectionConfig()).map(({ path }) => path);
        expect(paths).not.toContain("tags");
        expect(paths.some((path) => path.startsWith("tags"))).toBe(false);
        expect(paths).not.toContain("httpVersion");
    });

    describe.each(fixtures.map(({ name, data }) => [name, data] as [string, RecordConfigFixture]))(
        "over %s",
        (_name, fixture) => {
            it("every one is a simple field the form edits as a literal", () => {
                const record = normalizeIntersections(fixture.recordConfig);
                const selectAll = (node: TypeField) => (node.fields ?? []).forEach((field) => {
                    field.selected = true;
                    selectAll(field);
                });
                selectAll(record);
                configurableFields(record).forEach(({ path, field }) => {
                    expect({ path, primitive: fieldKind(field) === "primitive" }).toEqual({ path, primitive: true });
                    if (field.typeName !== "union") {
                        expect(isPrimitiveTypeName(field.typeName)).toBe(true);
                    }
                });
            });
        });
});

describe("made configurable", () => {
    const token = { typeName: "string", name: "token" };
    const baseUrl = { typeName: "string", name: "baseUrl", optional: true };

    it("by default when the field is required, and not when it is optional", () => {
        expect(isConfigurable(token, undefined)).toBe(true);
        expect(isConfigurable(baseUrl, undefined)).toBe(false);
    });

    it("as the user chose otherwise", () => {
        expect(isConfigurable(token, { keep: true })).toBe(false);
        expect(isConfigurable(baseUrl, { keep: false })).toBe(true);
    });
});

describe("what the language server is told", () => {
    it("keeps each optional field the user hasn't checked, and configures a required one", () => {
        expect(choicesToSend(connectionConfig(), {})).toEqual({
            "auth.token": {},
            baseUrl: { keep: true },
            timeout: { keep: true },
        });
    });

    it("keeps every literal of an existing connection the user hasn't checked", () => {
        expect(choicesToSend(connectionConfig(), {}, false)).toEqual({
            "auth.token": { keep: true },
            baseUrl: { keep: true },
            timeout: { keep: true },
        });
        expect(choicesToSend(connectionConfig(), { baseUrl: { keep: false } }, false)).toEqual({
            "auth.token": { keep: true },
            baseUrl: {},
            timeout: { keep: true },
        });
    });

    it("follows what the user chose, with any name they gave", () => {
        expect(choicesToSend(connectionConfig(), {
            "auth.token": { keep: true },
            baseUrl: { keep: false, name: "salesforceUrl" },
        })).toEqual({
            "auth.token": { keep: true },
            baseUrl: { name: "salesforceUrl" },
            timeout: { keep: true },
        });
    });

    it("forgets a choice for a field no longer checked", () => {
        const record = connectionConfig();
        record.fields![1].selected = false;
        expect(choicesToSend(record, { baseUrl: { name: "salesforceUrl" } }))
            .toEqual({ "auth.token": {}, timeout: { keep: true } });
    });
});

describe("a configurable the connection already uses", () => {
    it("is sent by its name, marked as one the connection keeps using", () => {
        expect(choicesToSend(connectionConfig(), {
            "auth.token": { name: "sfToken", existing: true, declaration: { filePath: "/p/config.bal", line: 0, offset: 16 } },
        })).toEqual({
            "auth.token": { name: "sfToken", existing: true },
            baseUrl: { keep: true },
            timeout: { keep: true },
        });
    });

    it("turns back into a value when unchecked", () => {
        expect(choicesToSend(connectionConfig(), { "auth.token": { name: "sfToken", existing: true, keep: true } })
            ["auth.token"]).toEqual({ keep: true });
    });
});

describe("a field by its path", () => {
    it("is found through records", () => {
        expect(fieldAtPath(connectionConfig(), "auth.token")?.name).toBe("token");
        expect(fieldAtPath(connectionConfig(), "timeout")?.typeName).toBe("decimal");
    });

    it("is not found when the path names no field", () => {
        expect(fieldAtPath(connectionConfig(), "auth.secret")).toBeUndefined();
        expect(fieldAtPath(connectionConfig(), "proxy.host")).toBeUndefined();
    });
});

describe("names in the code view", () => {
    const values = { sfBaseUrl: "\"https://api\"", sfToken: "\"tkn\"" };

    it("stand for their values", () => {
        expect(replaceIdentifiers("{baseUrl: sfBaseUrl, auth: {token: sfToken}}", values))
            .toBe("{baseUrl: \"https://api\", auth: {token: \"tkn\"}}");
    });

    it("are not looked for inside strings, templates or longer names", () => {
        expect(replaceIdentifiers("{a: \"sfToken\", b: string `sfToken`, c: sfTokenOld}", values))
            .toBe("{a: \"sfToken\", b: string `sfToken`, c: sfTokenOld}");
    });

    it("leave a record's keys as they are, even a key of the same name", () => {
        expect(replaceIdentifiers("{timeout: timeout, retry : {timeout :timeout}}", { timeout: "30" }))
            .toBe("{timeout: 30, retry : {timeout :30}}");
    });

    it("leave a member access and anything the map only inherits as they are", () => {
        expect(replaceIdentifiers("{a: settings.timeout, b: settings?.timeout, c: timeout, d: toString(x)}",
            { timeout: "30" })).toBe("{a: settings.timeout, b: settings?.timeout, c: 30, d: toString(x)}");
    });

    it("leave source untouched when there are none", () => {
        expect(replaceIdentifiers("{baseUrl: sfBaseUrl}", {})).toBe("{baseUrl: sfBaseUrl}");
    });
});

describe("configurable names", () => {
    it.each(["apiToken", "_token", "sf_sales2"])("accepts %s", (name) => {
        expect(isValidConfigurableName(name)).toBe(true);
    });

    it.each(["2token", "api token", "api-token", ""])("refuses %j", (name) => {
        expect(isValidConfigurableName(name)).toBe(false);
    });
});

describe("renaming a configurable", () => {
    const declaration = { filePath: "/project/config.bal", line: 0, offset: 20 };

    it("a name that is not an identifier is not applied", () => {
        expect(planRename(undefined, "9 lives", "cUrl")).toEqual({ kind: "invalid" });
        expect(planRename({ name: "sharedUrl", existing: true, declaration }, "shared url", undefined))
            .toEqual({ kind: "invalid" });
    });

    it("a configurable saving will create just takes the name; renaming back to the generated one is not renaming", () => {
        expect(planRename(undefined, " cUrl ", "cUrl")).toEqual({ kind: "name", choice: { name: undefined } });
        expect(planRename(undefined, "baseUrl", "cUrl")).toEqual({ kind: "name", choice: { name: "baseUrl" } });
        expect(planRename({ name: "baseUrl" }, "cUrl", "cUrl")).toEqual({ kind: "name", choice: { name: "cUrl" } });
    });

    it("a configurable the connection already uses is renamed across the project, from where it is declared", () => {
        expect(planRename({ name: "sharedUrl", existing: true, declaration }, " baseUrl ", undefined)).toEqual({
            kind: "project",
            request: { from: "sharedUrl", to: "baseUrl", declaration },
        });
    });

    it("renaming a configurable the connection already uses to its own name changes nothing", () => {
        expect(planRename({ name: "sharedUrl", existing: true, declaration }, "sharedUrl", undefined))
            .toEqual({ kind: "unchanged" });
    });

    it("a configurable the connection already uses can't be renamed without knowing where it is declared", () => {
        expect(planRename({ name: "sharedUrl", existing: true }, "baseUrl", undefined)).toEqual({ kind: "unavailable" });
    });

    it("INVARIANT: after a rename, every value that used the configurable uses the new name, and nothing else changes", () => {
        const choices = {
            "auth.token": { name: "sfToken", existing: true, declaration },
            "auth.refreshToken": { name: "sfToken", existing: true, declaration },
            "auth.other": { name: "sfOther", existing: true, declaration },
            baseUrl: { name: "sfToken" },
            timeout: { keep: true },
        };
        const renamed = renameConfigurableInChoices(choices, "sfToken", "salesforceToken");
        expect(renamed).toEqual({
            ...choices,
            "auth.token": { ...choices["auth.token"], name: "salesforceToken" },
            "auth.refreshToken": { ...choices["auth.refreshToken"], name: "salesforceToken" },
        });
        // What is sent on save then names the configurable as the source now does.
        expect(choicesToSend(connectionConfig(), renamed)["auth.token"])
            .toEqual({ name: "salesforceToken", existing: true });
    });

    it("leaves the choices as they are when no value uses the configurable", () => {
        const choices = { baseUrl: { name: "sfUrl", existing: true } };
        expect(renameConfigurableInChoices(choices, "sfToken", "salesforceToken")).toBe(choices);
    });

    /** A preview as the language server sends it, with what a test is about set explicitly. */
    const previewOf = (overrides: Partial<ConnectionConfigurablePreview>): ConnectionConfigurablePreview => ({
        parameter: "config", key: "config", fieldPath: "", name: "cConfig", type: "string", exists: false, kept: false,
        ...overrides,
    });

    it("shows the user's name, else the generated one", () => {
        const preview = previewOf({ name: "cUrl" });
        expect(shownName({ name: "a" }, preview)).toBe("a");
        expect(shownName(undefined, preview)).toBe("cUrl");
    });
});

describe("the parameter a preview is for", () => {
    it("is keyed as the language server keys its property: a flow node's own name is kept apart", () => {
        expect(parameterKey({ parameter: "connection", key: "$connection" } as any)).toBe("$connection");
        expect(parameterKey({ parameter: "'client", key: "client" } as any)).toBe("client");
    });
});

describe("a record reached through unions", () => {
    /** A MongoDB client's connection: `string|ConnectionParameters`, its `serverAddress` a `ServerAddress|ServerAddress[]`. */
    function connectionParameters(): TypeField {
        return {
            typeName: "record", name: "ConnectionParameters", selected: true,
            fields: [{
                typeName: "union", name: "serverAddress", selected: true,
                members: [
                    {
                        typeName: "record", name: "ServerAddress", selected: true, typeInfo: { name: "ServerAddress" } as any,
                        fields: [
                            { typeName: "string", name: "host", selected: true, value: "\"my-host\"" },
                            { typeName: "int", name: "port", selected: false, defaultable: true },
                        ],
                    },
                    { typeName: "array", name: "ServerAddress[]", selected: false },
                ],
            } as TypeField],
        } as TypeField;
    }

    it("INVARIANT: a field is keyed by the fields leading to it, as the language server keys it, not by a union member", () => {
        expect(configurableFields(connectionParameters()).map(({ path }) => path)).toEqual(["serverAddress.host"]);
        expect(fieldAtPath(connectionParameters(), "serverAddress.host")?.name).toBe("host");
        expect(choicesToSend(connectionParameters(), { "serverAddress.host": { name: "mongoHost" } }))
            .toEqual({ "serverAddress.host": { name: "mongoHost" } });
    });
});
