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

// L1: the pure layout resolution behind TriggerHandlerForm's section order and grouping. The invariant
// that matters most is the absence of an authored layout, which is the path every bundled model takes.

// Mocked for the same reason as payloadComposer.test.ts: the @wso2/ballerina-core barrel pulls in the
// ESM-only vscode-ws-jsonrpc, and nothing here needs a runtime value from it.
jest.mock("@wso2/ballerina-core", () => ({}));

import type { FunctionModel, ParameterModel, PropertyModel } from "@wso2/ballerina-core";
import {
    DEFAULT_SECTION_KEY,
    LAYOUT_ID_DESCRIPTION,
    LAYOUT_ID_HEADERS,
    LAYOUT_ID_NAME,
    LAYOUT_ID_PARAMETERS,
    LAYOUT_ID_REST,
    LAYOUT_ID_RETURN_TYPE,
    LAYOUT_ID_VARIANT,
    handlerUnitsOf,
    orderArtifactFieldKeys,
    resolveHandlerLayout,
} from "./handlerLayout";

// Fixture builders — same minimal-but-real shapes as payloadComposer.test.ts.

function prop(overrides: Partial<PropertyModel> = {}): PropertyModel {
    return { enabled: true, editable: true, optional: false, advanced: false, value: "", ...overrides };
}

function param(overrides: Partial<ParameterModel> = {}): ParameterModel {
    return { enabled: true, editable: true, optional: false, advanced: false, ...overrides } as ParameterModel;
}

function fn(overrides: Partial<FunctionModel> = {}): FunctionModel {
    return {
        kind: "REMOTE",
        enabled: true,
        optional: false,
        editable: false,
        name: prop({ value: "handler", editable: false }),
        parameters: [],
        returnType: prop({ editable: false }) as any,
        ...overrides,
    } as FunctionModel;
}

/** A bindable payload parameter, optionally folded into a binding group. */
function payload(name: string, bindingGroup?: string): ParameterModel {
    return param({
        kind: "DATA_BINDING",
        bindingGroup,
        name: prop({ value: name, editable: false }),
        type: prop({ codedata: { type: "PAYLOAD_TYPE", bindable: true } as any }),
    });
}

/** An opt-in framework parameter — the kind that lives under "Advanced Configurations". */
function advancedParam(name: string): ParameterModel {
    return param({
        kind: "OPTIONAL",
        advanced: true,
        enabled: false,
        name: prop({ value: name }),
        metadata: { label: name, description: "" },
    });
}

function roleProp(role: string, label: string): PropertyModel {
    return prop({ metadata: { label, description: "" }, codedata: { type: role } as any });
}

/** ids of the units in one flat list, for terse order assertions. */
function idsOf(fn0: FunctionModel, artifactKeys: string[] = []): string[] {
    return resolveHandlerLayout(fn0, artifactKeys).flatMap((section) => section.units.map((unit) => unit.id));
}

// kafka's onConsumerRecord: one bindable payload + the opt-in caller.
const kafkaOnConsumerRecord = fn({
    name: prop({ value: "onConsumerRecord", editable: false }),
    parameters: [payload("records"), advancedParam("caller")],
});

// ftp's onFileJson: a payload, a Stream modifier, a METADATA_FLAG, an annotation, two advanced params.
const ftpOnFileJson = fn({
    name: prop({ value: "onFileJson", editable: false }),
    variantLabel: "JSON",
    parameters: [payload("content"), advancedParam("fileInfo"), advancedParam("caller")],
    properties: {
        rows: roleProp("METADATA_FLAG", "Rows"),
        stream: roleProp("PAYLOAD_MODIFIER", "Stream (Large Files)"),
        afterFileProcessing: roleProp("COMPLEX_FUNCTION_ANNOTATION", "After File Processing"),
    },
});

// mssql's onUpdate: before/after folded into one payload section by their shared binding group.
const cdcOnUpdate = fn({
    name: prop({ value: "onUpdate", editable: false }),
    parameters: [payload("before", "rowState"), payload("after", "rowState"), advancedParam("tableName")],
});

// mcp's newTool: renamable, addable params, a `header` schema, and a parameter named `headers`.
const mcpNewTool = fn({
    name: prop({ value: "", editable: true }),
    documentation: prop({ editable: true }),
    returnType: prop({ editable: true }) as any,
    canAddParameters: true,
    parameters: [advancedParam("meta"), advancedParam("headers"), advancedParam("request")],
    schema: { parameter: param({}), header: param({}) },
});

// sap.jco's onCall: a parameter literally named `parameters`.
const sapOnCall = fn({
    name: prop({ value: "onCall", editable: false }),
    parameters: [payload("iDoc"), advancedParam("parameters")],
});

const MCP_ARTIFACT_KEYS = ["name", "documentation", "parameters", "returnType"];

describe("handlerUnitsOf", () => {
    it("enumerates every renderable unit in the form's historical order", () => {
        expect(handlerUnitsOf(ftpOnFileJson).map((unit) => [unit.kind, unit.id])).toEqual([
            ["VARIANT", LAYOUT_ID_VARIANT],
            ["DESCRIPTION", LAYOUT_ID_DESCRIPTION],
            ["FLAG", "rows"],
            ["MODIFIER", "stream"],
            ["PAYLOAD", "content"],
            ["ANNOTATION", "afterFileProcessing"],
            ["ADVANCED_PARAM", "fileInfo"],
            ["ADVANCED_PARAM", "caller"],
        ]);
    });

    it("takes the artifact fields from the caller rather than re-deriving them", () => {
        expect(handlerUnitsOf(mcpNewTool, MCP_ARTIFACT_KEYS)
            .filter((unit) => unit.kind === "ARTIFACT_FIELD")
            .map((unit) => [unit.id, unit.fieldKey])).toEqual([
            [LAYOUT_ID_NAME, "name"],
            ["$documentation", "documentation"],
            [LAYOUT_ID_PARAMETERS, "parameters"],
            [LAYOUT_ID_RETURN_TYPE, "returnType"],
        ]);
    });

    it("folds a binding group into one payload unit addressable by the group or any member", () => {
        const payloads = handlerUnitsOf(cdcOnUpdate).filter((unit) => unit.kind === "PAYLOAD");
        expect(payloads).toHaveLength(1);
        expect(payloads[0].id).toBe("rowState");
        expect(payloads[0].altIds).toEqual(expect.arrayContaining(["before", "after"]));
    });

    it("emits the header block only when the handler ships a header schema", () => {
        expect(handlerUnitsOf(mcpNewTool).some((unit) => unit.kind === "HEADERS")).toBe(true);
        expect(handlerUnitsOf(kafkaOnConsumerRecord).some((unit) => unit.kind === "HEADERS")).toBe(false);
    });
});

describe("resolveHandlerLayout with no authored layout", () => {
    const corpus: [string, FunctionModel, string[]][] = [
        ["kafka onConsumerRecord", kafkaOnConsumerRecord, []],
        ["ftp onFileJson", ftpOnFileJson, []],
        ["cdc onUpdate", cdcOnUpdate, []],
        ["mcp newTool", mcpNewTool, MCP_ARTIFACT_KEYS],
        ["sap.jco onCall", sapOnCall, []],
    ];

    it.each(corpus)("%s resolves to one unlabeled section in default order", (_name, model, keys) => {
        const sections = resolveHandlerLayout(model, keys);
        expect(sections).toHaveLength(1);
        expect(sections[0].key).toBe(DEFAULT_SECTION_KEY);
        expect(sections[0].label).toBeUndefined();
        expect(sections[0].units).toEqual(handlerUnitsOf(model, keys));
    });

    it.each(corpus)("%s is unchanged by an empty layout array", (_name, model, keys) => {
        expect(resolveHandlerLayout({ ...model, layout: [] }, keys)).toEqual(resolveHandlerLayout(model, keys));
    });
});

describe("resolveHandlerLayout with an authored layout", () => {
    let warn: jest.SpyInstance;

    beforeEach(() => {
        warn = jest.spyOn(console, "warn").mockImplementation(() => { });
    });

    afterEach(() => warn.mockRestore());

    it("renders declared sections in array order, each holding its fields in declared order", () => {
        const sections = resolveHandlerLayout(fn({
            ...ftpOnFileJson,
            layout: [
                { id: "adv", label: "Advanced", fields: ["caller", "fileInfo"] },
                { id: "msg", label: "Message", fields: ["content", "stream"] },
            ],
        }));
        expect(sections.map((section) => [section.key, section.label, section.units.map((u) => u.id)])).toEqual([
            ["adv", "Advanced", ["caller", "fileInfo"]],
            ["msg", "Message", ["content", "stream"]],
            [LAYOUT_ID_REST, undefined, [LAYOUT_ID_VARIANT, LAYOUT_ID_DESCRIPTION, "rows", "afterFileProcessing"]],
        ]);
    });

    it("places the remainder where *rest says, not at the end", () => {
        const sections = resolveHandlerLayout(fn({
            ...ftpOnFileJson,
            layout: [
                { id: "msg", label: "Message", fields: ["content"] },
                { fields: [LAYOUT_ID_REST] },
                { id: "adv", label: "Advanced", fields: ["caller"] },
            ],
        }));
        expect(sections.map((section) => section.key)).toEqual(["msg", "$section-1", "adv"]);
        expect(sections[1].units.map((unit) => unit.id)).toEqual([
            LAYOUT_ID_VARIANT, LAYOUT_ID_DESCRIPTION, "rows", "stream", "afterFileProcessing", "fileInfo",
        ]);
    });

    it("keeps a section with no label as an ordered run with no heading", () => {
        const [section] = resolveHandlerLayout(fn({
            ...kafkaOnConsumerRecord,
            layout: [{ fields: ["caller", "records", LAYOUT_ID_REST] }],
        }));
        expect(section.label).toBeUndefined();
        expect(section.units.map((unit) => unit.id)).toEqual([
            "caller", "records", LAYOUT_ID_VARIANT, LAYOUT_ID_DESCRIPTION,
        ]);
    });

    it("drops a section whose every field resolved to nothing, rather than rendering a bare heading", () => {
        const sections = resolveHandlerLayout(fn({
            ...kafkaOnConsumerRecord,
            layout: [{ id: "ghost", label: "Ghost", fields: ["nope", "alsoNope"] }],
        }));
        expect(sections.map((section) => section.key)).toEqual([LAYOUT_ID_REST]);
    });

    it("skips an id that matches no field, since a variant may lack what its siblings have", () => {
        const sections = resolveHandlerLayout(fn({
            ...kafkaOnConsumerRecord,
            layout: [{ id: "msg", label: "Message", fields: ["records", "notHere"] }],
        }));
        expect(sections[0].units.map((unit) => unit.id)).toEqual(["records"]);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining("notHere"));
    });

    it("gives a doubly-claimed field to the first section that named it", () => {
        const sections = resolveHandlerLayout(fn({
            ...kafkaOnConsumerRecord,
            layout: [
                { id: "a", label: "A", fields: ["records"] },
                { id: "b", label: "B", fields: ["records", "caller"] },
            ],
        }));
        expect(sections[0].units.map((unit) => unit.id)).toEqual(["records"]);
        expect(sections[1].units.map((unit) => unit.id)).toEqual(["caller"]);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining("claimed by an earlier section"));
    });

    it("honours only the first *rest and warns about the rest", () => {
        const sections = resolveHandlerLayout(fn({
            ...kafkaOnConsumerRecord,
            layout: [{ id: "a", fields: [LAYOUT_ID_REST] }, { id: "b", fields: [LAYOUT_ID_REST] }],
        }));
        expect(sections.map((section) => section.key)).toEqual(["a"]);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining("more than once"));
    });

    it("reaches a payload section by its binding group or by any member name", () => {
        for (const id of ["rowState", "before", "after"]) {
            const sections = resolveHandlerLayout(fn({
                ...cdcOnUpdate,
                layout: [{ id: "row", label: "Row", fields: [id] }],
            }));
            expect(sections[0].units.map((unit) => unit.kind)).toEqual(["PAYLOAD"]);
        }
    });
});

describe("reserved $-prefixed ids", () => {
    let warn: jest.SpyInstance;

    beforeEach(() => {
        warn = jest.spyOn(console, "warn").mockImplementation(() => { });
    });

    afterEach(() => warn.mockRestore());

    it("distinguishes a parameter named `headers` from the header block", () => {
        const bare = resolveHandlerLayout(fn({
            ...mcpNewTool,
            layout: [{ id: "g", label: "G", fields: ["headers"] }],
        }));
        expect(bare[0].units.map((unit) => unit.kind)).toEqual(["ADVANCED_PARAM"]);

        const reserved = resolveHandlerLayout(fn({
            ...mcpNewTool,
            layout: [{ id: "g", label: "G", fields: [LAYOUT_ID_HEADERS] }],
        }));
        expect(reserved[0].units.map((unit) => unit.kind)).toEqual(["HEADERS"]);
    });

    it("distinguishes a parameter named `parameters` from the parameter manager", () => {
        const bare = resolveHandlerLayout(fn({
            ...sapOnCall,
            layout: [{ id: "g", label: "G", fields: ["parameters"] }],
        }), []);
        expect(bare[0].units.map((unit) => unit.kind)).toEqual(["ADVANCED_PARAM"]);

        const reserved = resolveHandlerLayout(fn({
            ...mcpNewTool,
            layout: [{ id: "g", label: "G", fields: [LAYOUT_ID_PARAMETERS] }],
        }), MCP_ARTIFACT_KEYS);
        expect(reserved[0].key).toBe("g");
        expect(reserved[0].units.map((unit) => unit.fieldKey)).toContain("parameters");
        expect(reserved[0].units.every((unit) => unit.kind === "ARTIFACT_FIELD")).toBe(true);
    });
});

describe("artifact block cohesion", () => {
    let warn: jest.SpyInstance;

    beforeEach(() => {
        warn = jest.spyOn(console, "warn").mockImplementation(() => { });
    });

    afterEach(() => warn.mockRestore());

    it("collapses artifact fields to the first one's position, ordered as declared", () => {
        const [section] = resolveHandlerLayout(fn({
            ...mcpNewTool,
            layout: [{
                id: "g",
                label: "G",
                fields: [LAYOUT_ID_NAME, LAYOUT_ID_HEADERS, LAYOUT_ID_RETURN_TYPE],
            }],
        }), MCP_ARTIFACT_KEYS);
        expect(section.units.map((unit) => unit.kind)).toEqual([
            "ARTIFACT_FIELD", "ARTIFACT_FIELD", "ARTIFACT_FIELD", "ARTIFACT_FIELD", "HEADERS",
        ]);
        expect(section.units.slice(0, 4).map((unit) => unit.fieldKey))
            .toEqual(["name", "returnType", "documentation", "parameters"]);
    });

    it("brings the whole block along when the layout names just one of its fields", () => {
        const sections = resolveHandlerLayout(fn({
            ...mcpNewTool,
            layout: [{ id: "ident", label: "Identity", fields: [LAYOUT_ID_NAME] }],
        }), MCP_ARTIFACT_KEYS);
        expect(sections[0].key).toBe("ident");
        expect(sections[0].units.map((unit) => unit.fieldKey))
            .toEqual(["name", "documentation", "parameters", "returnType"]);
        expect(warn).not.toHaveBeenCalledWith(expect.stringContaining("cannot be"));
    });

    it("pulls artifact fields the author really did split back into the first, and says so", () => {
        const sections = resolveHandlerLayout(fn({
            ...mcpNewTool,
            layout: [
                { id: "a", label: "A", fields: [LAYOUT_ID_NAME] },
                { id: "b", label: "B", fields: [LAYOUT_ID_RETURN_TYPE, LAYOUT_ID_HEADERS] },
            ],
        }), MCP_ARTIFACT_KEYS);
        const a = sections.find((section) => section.key === "a");
        const b = sections.find((section) => section.key === "b");
        expect(a?.units.map((unit) => unit.fieldKey))
            .toEqual(["name", "returnType", "documentation", "parameters"]);
        expect(b?.units.map((unit) => unit.kind)).toEqual(["HEADERS"]);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining("cannot be"));
    });

    it("still counts a section as explicitly declared when it also hosts *rest, so a real split is caught", () => {
        // Regression: exclusion used to be keyed off which section absorbed the remainder, so a
        // section that both named its own field (here $name) and happened to host *rest was wrongly
        // treated as "just the remainder" -- masking a genuine split with g2 below.
        const sections = resolveHandlerLayout(fn({
            ...mcpNewTool,
            layout: [
                { id: "g1", fields: [LAYOUT_ID_NAME, LAYOUT_ID_REST] },
                { id: "g2", label: "G2", fields: [LAYOUT_ID_RETURN_TYPE] },
            ],
        }), MCP_ARTIFACT_KEYS);
        expect(sections.map((section) => section.key)).toEqual(["g1"]);
        expect(sections[0].units.slice(0, 4).map((unit) => unit.fieldKey))
            .toEqual(["name", "documentation", "parameters", "returnType"]);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining("cannot be"));
    });
});

describe("orderArtifactFieldKeys", () => {
    it("is a no-op when the layout names no artifact field", () => {
        const sections = resolveHandlerLayout(mcpNewTool, MCP_ARTIFACT_KEYS);
        expect(orderArtifactFieldKeys(sections, MCP_ARTIFACT_KEYS)).toEqual(MCP_ARTIFACT_KEYS);
    });

    it("puts the named fields first, in declared order, keeping the rest as they were", () => {
        const sections = resolveHandlerLayout(fn({
            ...mcpNewTool,
            layout: [{ id: "g", label: "G", fields: [LAYOUT_ID_RETURN_TYPE, LAYOUT_ID_NAME] }],
        }), MCP_ARTIFACT_KEYS);
        expect(orderArtifactFieldKeys(sections, MCP_ARTIFACT_KEYS))
            .toEqual(["returnType", "name", "documentation", "parameters"]);
    });

    it("ignores a named field the handler does not actually offer", () => {
        const keys = ["name"];
        const sections = resolveHandlerLayout(fn({
            ...mcpNewTool,
            layout: [{ id: "g", label: "G", fields: [LAYOUT_ID_RETURN_TYPE, LAYOUT_ID_NAME] }],
        }), keys);
        expect(orderArtifactFieldKeys(sections, keys)).toEqual(["name"]);
    });
});

describe("layout never reorders the emitted signature", () => {
    it("leaves functionModel.parameters untouched", () => {
        const model = fn({
            ...ftpOnFileJson,
            layout: [{ id: "adv", label: "Advanced", fields: ["caller", "fileInfo", "content"] }],
        });
        const before = model.parameters;
        const names = before.map((p) => p.name?.value);
        resolveHandlerLayout(model);
        expect(model.parameters).toBe(before);
        expect(model.parameters.map((p) => p.name?.value)).toEqual(names);
    });
});

describe("degenerate input", () => {
    it("returns nothing for a missing function", () => {
        expect(handlerUnitsOf(undefined as unknown as FunctionModel)).toEqual([]);
        expect(resolveHandlerLayout(undefined as unknown as FunctionModel)).toEqual([
            { key: DEFAULT_SECTION_KEY, units: [] },
        ]);
    });

    it("tolerates a section with no fields array", () => {
        const sections = resolveHandlerLayout(fn({
            ...kafkaOnConsumerRecord,
            layout: [{ id: "empty", label: "Empty" } as any],
        }));
        expect(sections.map((section) => section.key)).toEqual([LAYOUT_ID_REST]);
    });

    it("treats a blank label as no label and a blank id as positional", () => {
        const [section] = resolveHandlerLayout(fn({
            ...kafkaOnConsumerRecord,
            layout: [{ id: "  ", label: "  ", fields: ["records"] }],
        }));
        expect(section.label).toBeUndefined();
        expect(section.key).toBe("$section-0");
    });
});

describe("idsOf smoke check", () => {
    it("covers every unit exactly once across the resolved sections", () => {
        const model = fn({
            ...ftpOnFileJson,
            layout: [{ id: "msg", label: "Message", fields: ["content"] }],
        });
        const resolved = idsOf(model);
        expect([...resolved].sort()).toEqual(handlerUnitsOf(model).map((unit) => unit.id).sort());
    });
});

describe("advanced sections", () => {
    let warn: jest.SpyInstance;

    beforeEach(() => {
        warn = jest.spyOn(console, "warn").mockImplementation(() => { });
    });

    afterEach(() => warn.mockRestore());

    it("carries label, description and the advanced flag through", () => {
        const [section] = resolveHandlerLayout(fn({
            ...mcpNewTool,
            layout: [{
                id: "transportParameters",
                label: "Transport Parameters",
                description: "Access transport-level request data.",
                advanced: true,
                fields: [LAYOUT_ID_HEADERS],
            }],
        }), MCP_ARTIFACT_KEYS);
        expect(section.label).toBe("Transport Parameters");
        expect(section.description).toBe("Access transport-level request data.");
        expect(section.advanced).toBe(true);
    });

    it("leaves advanced unset when the layout does not ask for it", () => {
        const [section] = resolveHandlerLayout(fn({
            ...mcpNewTool,
            layout: [{ id: "g", label: "G", fields: [LAYOUT_ID_HEADERS] }],
        }), MCP_ARTIFACT_KEYS);
        expect(section.advanced).toBeUndefined();
        expect(section.description).toBeUndefined();
    });

    it("refuses advanced on an unlabeled section, since there is no heading to collapse under", () => {
        const [section] = resolveHandlerLayout(fn({
            ...mcpNewTool,
            layout: [{ advanced: true, fields: [LAYOUT_ID_HEADERS] }],
        }), MCP_ARTIFACT_KEYS);
        expect(section.advanced).toBeUndefined();
        expect(warn).toHaveBeenCalledWith(expect.stringContaining("no label"));
    });

    it("treats a blank description as absent", () => {
        const [section] = resolveHandlerLayout(fn({
            ...mcpNewTool,
            layout: [{ id: "g", label: "G", description: "   ", fields: [LAYOUT_ID_HEADERS] }],
        }), MCP_ARTIFACT_KEYS);
        expect(section.description).toBeUndefined();
    });
});

describe("duplicate ids", () => {
    let warn: jest.SpyInstance;

    beforeEach(() => {
        warn = jest.spyOn(console, "warn").mockImplementation(() => { });
    });

    afterEach(() => warn.mockRestore());

    it("warns when two units share a primary id, keeping the first registered addressable", () => {
        // A parameter that is both a bindable payload and opted into "advanced" is enumerated twice
        // by handlerUnitsOf -- once as PAYLOAD, once as ADVANCED_PARAM -- both under its bare name.
        const collidingParam = param({
            kind: "DATA_BINDING",
            advanced: true,
            name: prop({ value: "content" }),
            type: prop({ codedata: { type: "PAYLOAD_TYPE", bindable: true } as any }),
        });
        const sections = resolveHandlerLayout(fn({
            ...kafkaOnConsumerRecord,
            parameters: [collidingParam],
            layout: [{ id: "msg", label: "Message", fields: ["content"] }],
        }));
        expect(sections[0].units.map((unit) => unit.kind)).toEqual(["PAYLOAD"]);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining("names more than one field"));
    });

    it("disambiguates a section id reused across sections by appending its index, and warns", () => {
        const sections = resolveHandlerLayout(fn({
            ...kafkaOnConsumerRecord,
            layout: [
                { id: "dup", label: "First", fields: ["records"] },
                { id: "dup", label: "Second", fields: ["caller"] },
            ],
        }));
        expect(sections.map((section) => section.key)).toEqual(["dup", "dup-1", LAYOUT_ID_REST]);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining("reused by more than one section"));
    });
});

describe("layout resolution against shapes mirroring the ftp/mcp trigger models", () => {
    // These are hand-built fixtures shaped like the real wire output (the LS lifts FTP's `stream`
    // flag out of the payload parameter's COMPLEX_PAYLOAD tree into the function's own
    // `properties`), not the shipped ftp.json/mcp.json read from disk -- editing those files' authored
    // `layout` won't fail this suite. TriggerLayoutTest.java reads the real bundled models, but only
    // checks that every authored field id resolves, not the resulting order.
    it("ftp/smb onFileCsv defines the row schema before offering the stream flag", () => {
        const onFileCsv = fn({
            name: prop({ value: "onFileCsv", editable: false }),
            variantLabel: "CSV",
            parameters: [payload("content"), advancedParam("fileInfo"), advancedParam("caller")],
            properties: {
                afterFileProcessing: roleProp("COMPLEX_FUNCTION_ANNOTATION", "File Handling Options"),
                stream: roleProp("PAYLOAD_MODIFIER", "Stream (Large Files)"),
            },
            layout: [{ fields: [LAYOUT_ID_VARIANT, LAYOUT_ID_DESCRIPTION, "content", "stream", LAYOUT_ID_REST] }],
        });

        // Without the layout the modifier comes before the row schema it applies to.
        expect(handlerUnitsOf(onFileCsv).map((unit) => unit.id))
            .toEqual([LAYOUT_ID_VARIANT, LAYOUT_ID_DESCRIPTION, "stream", "content", "afterFileProcessing",
                "fileInfo", "caller"]);

        expect(idsOf(onFileCsv)).toEqual([LAYOUT_ID_VARIANT, LAYOUT_ID_DESCRIPTION, "content", "stream",
            "afterFileProcessing", "fileInfo", "caller"]);
    });

    it("mcp newTool groups the transport opt-ins inside the advanced box", () => {
        const newTool = fn({
            ...mcpNewTool,
            layout: [
                {
                    id: "transportParameters",
                    label: "Transport Parameters",
                    description: "Access transport-level request data.",
                    advanced: true,
                    fields: [LAYOUT_ID_HEADERS],
                },
                { id: "requestAccess", label: "Request Access", advanced: true, fields: ["request", "headers"] },
            ],
        });
        const sections = resolveHandlerLayout(newTool, MCP_ARTIFACT_KEYS);

        expect(sections.map((section) => [section.key, section.advanced ?? false])).toEqual([
            ["transportParameters", true],
            ["requestAccess", true],
            [LAYOUT_ID_REST, false],
        ]);
        expect(sections[0].units.map((unit) => unit.kind)).toEqual(["HEADERS"]);
        expect(sections[0].label).toBeTruthy();
        expect(sections[0].description).toBeTruthy();
        expect(sections[1].units.map((unit) => unit.id)).toEqual(["request", "headers"]);
        expect(sections[1].units.every((unit) => unit.kind === "ADVANCED_PARAM")).toBe(true);
        expect(sections[2].units.map((unit) => unit.id)).toEqual([
            LAYOUT_ID_VARIANT, LAYOUT_ID_DESCRIPTION, LAYOUT_ID_NAME, "$documentation", LAYOUT_ID_PARAMETERS,
            LAYOUT_ID_RETURN_TYPE, "meta",
        ]);
    });
});
