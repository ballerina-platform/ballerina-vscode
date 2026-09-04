// Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com/) All Rights Reserved.

// WSO2 LLC. licenses this file to you under the Apache License,
// Version 2.0 (the "License"); you may not use this file except
// in compliance with the License.
// You may obtain a copy of the License at

// http://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied. See the License for the
// specific language governing permissions and limitations
// under the License.

import * as assert from "assert";
import {
    TYPE_CLASS,
    collectClassMemberTypeRefs,
    isClassTypeDef,
} from "../../../../src/features/ai/utils/libs/class-typedefs";
import {
    getSelectableMemberCount,
    selectClassTypeDefs,
    toRequestAnnotations,
    toRequestClasses,
    toSelectionRequest,
} from "../../../../src/features/ai/utils/libs/library-selection";
import { Annotation, Library, TypeDefinition } from "../../../../src/features/ai/utils/libs/library-types";
import { toSyntaxString } from "../../../../src/features/ai/utils/libs/to-syntax-string";

function method(name: string, params: { name: string; type: string }[], returnType: string): unknown {
    return {
        name,
        type: "Normal Function",
        description: "",
        parameters: params.map((p) => ({
            name: p.name,
            description: "",
            type: { name: p.type, links: [{ category: "internal", recordName: p.type }] },
        })),
        return: { type: { name: returnType, links: [{ category: "internal", recordName: returnType }] } },
    };
}

/** A class as the language server sends it today: labelled `Class`, members in `functions`. */
function classTypeDef(name: string, functions: unknown[], description = `The ${name}.`): TypeDefinition {
    return { name, description, type: TYPE_CLASS, functions } as unknown as TypeDefinition;
}

/** The same class as an older language server sent it: no `type` key at all. */
function unlabelledClass(name: string, functions: unknown[]): TypeDefinition {
    return { name, description: `The ${name}.`, functions } as unknown as TypeDefinition;
}

suite("class typeDefs — recognising a class", () => {
    test("a labelled class is believed as-is", () => {
        assert.strictEqual(isClassTypeDef(classTypeDef("Workbook", [])), true);
    });

    test("an unlabelled entry carrying functions is still a class", () => {
        assert.strictEqual(isClassTypeDef(unlabelledClass("Workbook", [])), true);
    });

    test("a record is not a class, even though it carries members of its own", () => {
        const record = {
            name: "CellRange", description: "", type: "Record",
            fields: [{ name: "start", description: "", type: { name: "string" } }],
        } as TypeDefinition;
        assert.strictEqual(isClassTypeDef(record), false);
    });

    test("an unlabelled entry with no functions is left alone rather than guessed at", () => {
        assert.strictEqual(isClassTypeDef({ name: "Mystery", description: "" } as TypeDefinition), false);
    });
});

suite("class typeDefs — the types a class's members name", () => {
    test("collects parameter and return types from every method", () => {
        const workbook = classTypeDef("Workbook", [
            method("getSheet", [{ name: "target", type: "string" }], "Sheet"),
            method("getTable", [{ name: "name", type: "string" }], "Table"),
        ]);
        const names = collectClassMemberTypeRefs(workbook).map((t) => t.name);
        assert.deepStrictEqual(names, ["string", "Sheet", "string", "Table"]);
    });

    test("collects the constructor's parameter types — a class the reader cannot construct is unusable", () => {
        const workbook = classTypeDef("Workbook", [
            {
                type: "Constructor", description: "",
                parameters: [{ name: "config", description: "", type: { name: "ConnectionConfig" } }],
                return: { type: { name: "Workbook" } },
            },
        ]);
        assert.ok(collectClassMemberTypeRefs(workbook).map((t) => t.name).includes("ConnectionConfig"));
    });

    test("a definition with no functions contributes nothing", () => {
        const record = { name: "R", description: "", type: "Record" } as TypeDefinition;
        assert.deepStrictEqual(collectClassMemberTypeRefs(record), []);
    });

    test("a malformed member does not throw — this runs on language-server output, not checked types", () => {
        const broken = classTypeDef("Workbook", [null, {}, { parameters: null, return: null }]);
        assert.deepStrictEqual(collectClassMemberTypeRefs(broken), []);
    });
});

suite("class typeDefs — rendering", () => {
    test("an unlabelled class renders its members instead of `// Unknown type:`", () => {
        const library: Library = {
            name: "ballerina/xlsx",
            description: "Spreadsheets.",
            typeDefs: [unlabelledClass("Workbook", [method("getSheet", [{ name: "target", type: "string" }], "Sheet")])],
            clients: [],
        };
        const rendered = toSyntaxString([library]);
        assert.ok(!rendered.includes("// Unknown type: Workbook"), `class discarded:\n${rendered}`);
        assert.ok(rendered.includes("class Workbook {"), `class body missing:\n${rendered}`);
        assert.ok(rendered.includes("getSheet"), `member API missing:\n${rendered}`);
    });

    test("a genuinely unknown type definition still renders as unknown", () => {
        const library: Library = {
            name: "ballerina/xlsx", description: "",
            typeDefs: [{ name: "Mystery", description: "", type: "Bogus" } as TypeDefinition],
            clients: [],
        };
        assert.ok(toSyntaxString([library]).includes("// Unknown type: Mystery"));
    });
});

suite("selection request — classes and object types", () => {
    const sheet = classTypeDef("Sheet", [
        method("getCell", [{ name: "row", type: "int" }, { name: "col", type: "int" }], "CellValue"),
        method("setCell", [{ name: "row", type: "int" }], "Error"),
    ], "One worksheet in a workbook.");

    test("a class reaches the selection model with its member names", () => {
        const [entry] = toRequestClasses([sheet])!;
        assert.strictEqual(entry.name, "Sheet");
        assert.strictEqual(entry.description, "One worksheet in a workbook.");
        assert.deepStrictEqual(entry.functions.map((f) => (f as { name: string }).name), ["getCell", "setCell"]);
    });

    test("member parameter names and return types are carried, as they are for a client", () => {
        const [entry] = toRequestClasses([sheet])!;
        const first = entry.functions[0] as { parameters?: string[]; returnType?: string };
        assert.deepStrictEqual(first.parameters, ["row", "col"]);
        assert.strictEqual(first.returnType, "CellValue");
    });

    /** Object types are the same wire category as classes. */
    test("an object type is carried exactly like a class declaration", () => {
        const objectType = classTypeDef("Table", [method("getHeaders", [], "string[]")]);
        assert.deepStrictEqual(toRequestClasses([objectType])!.map((c) => c.name), ["Table"]);
    });

    test("a marker class with no members is skipped — it carries no evidence to match on", () => {
        assert.strictEqual(toRequestClasses([classTypeDef("Service", [])]), undefined);
    });

    test("records are not offered as classes", () => {
        const record = { name: "CellRange", description: "", type: "Record", fields: [] } as TypeDefinition;
        assert.strictEqual(toRequestClasses([record]), undefined);
    });

    test("the constructor is omitted, as it is for clients — it is not a choice the model makes", () => {
        const withCtor = classTypeDef("Workbook", [
            { type: "Constructor", description: "", parameters: [], return: { type: { name: "Workbook" } } },
            method("save", [], "Error"),
        ]);
        assert.deepStrictEqual(
            toRequestClasses([withCtor])![0].functions.map((f) => (f as { name: string }).name),
            ["save"]
        );
    });

    test("a library's classes are part of the request it is judged on", () => {
        const library = {
            name: "ballerina/xlsx", description: "Spreadsheets.",
            clients: [], typeDefs: [sheet],
        } as Library;
        assert.deepStrictEqual(toSelectionRequest(library, false).classes?.map((c) => c.name), ["Sheet"]);
    });
});

suite("selection request — annotations", () => {
    const annotations: Annotation[] = [
        { name: "ServiceConfig", attachmentPoint: "service", description: "Configures the service." },
        { name: "Cache", attachmentPoint: "return" },
    ];

    test("annotations reach the model with their attach point and doc", () => {
        assert.deepStrictEqual(toRequestAnnotations(annotations), [
            { name: "ServiceConfig", attachmentPoint: "service", description: "Configures the service." },
            { name: "Cache", attachmentPoint: "return" },
        ]);
    });

    test("a library declaring none states nothing", () => {
        assert.strictEqual(toRequestAnnotations([]), undefined);
        assert.strictEqual(toRequestAnnotations(undefined), undefined);
    });
});

suite("selection response — resolving named classes", () => {
    const sheet = classTypeDef("Sheet", [method("getCell", [], "CellValue")]);
    const table = classTypeDef("Table", [method("getHeaders", [], "string[]")]);
    const record = { name: "CellRange", description: "", type: "Record", fields: [] } as TypeDefinition;

    test("named classes resolve to their full definitions", () => {
        const resolved = selectClassTypeDefs([sheet, table, record], { name: "lib", classes: ["Sheet"] });
        assert.deepStrictEqual(resolved.map((t) => t.name), ["Sheet"]);
    });

    test("a class is returned intact, never narrowed to selected members", () => {
        const [resolved] = selectClassTypeDefs([sheet], { name: "lib", classes: ["Sheet"] });
        assert.strictEqual(resolved, sheet);
    });

    test("a hallucinated name is skipped without costing the ones that resolved", () => {
        const resolved = selectClassTypeDefs([sheet], { name: "lib", classes: ["Sheet", "Imaginary"] });
        assert.deepStrictEqual(resolved.map((t) => t.name), ["Sheet"]);
    });

    test("a named non-class is not smuggled in as one", () => {
        assert.deepStrictEqual(selectClassTypeDefs([record], { name: "lib", classes: ["CellRange"] }), []);
    });

    test("no classes named means none seeded — the closure still reaches them via selected functions", () => {
        assert.deepStrictEqual(selectClassTypeDefs([sheet], { name: "lib" }), []);
    });
});

suite("selection response — tolerating the shape the model actually returns", () => {
    const sheet = classTypeDef("Sheet", [method("getCell", [], "CellValue")]);

    test("the object form resolves too — every sibling field in the schema is an object", () => {
        const resolved = selectClassTypeDefs([sheet], {
            name: "lib", classes: [{ name: "Sheet" }],
        } as unknown as Parameters<typeof selectClassTypeDefs>[1]);
        assert.deepStrictEqual(resolved.map((t) => t.name), ["Sheet"]);
    });

    test("mixed shapes in one response both resolve", () => {
        const table = classTypeDef("Table", [method("getHeaders", [], "string[]")]);
        const resolved = selectClassTypeDefs([sheet, table], {
            name: "lib", classes: ["Sheet", { name: "Table" }],
        } as unknown as Parameters<typeof selectClassTypeDefs>[1]);
        assert.deepStrictEqual(resolved.map((t) => t.name), ["Sheet", "Table"]);
    });
});

suite("selection batching — class members count toward the large-library split", () => {
    test("a library whose API lives in classes is treated as large", () => {
        const members = Array.from({ length: 120 }, (_, i) => method(`m${i}`, [], "string"));
        const request = toSelectionRequest({
            name: "ballerina/xlsx", description: "", clients: [],
            typeDefs: [classTypeDef("Sheet", members)],
        } as Library, false);
        assert.ok(getSelectableMemberCount(request) >= 100, "class members must count toward the split");
    });

    test("a library with neither clients nor classes counts zero", () => {
        const request = toSelectionRequest({ name: "lib", description: "", clients: [], typeDefs: [] } as Library, false);
        assert.strictEqual(getSelectableMemberCount(request), 0);
    });
});
