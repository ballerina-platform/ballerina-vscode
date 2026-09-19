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

import { toSyntaxString } from "../features/ai/utils/libs/to-syntax-string";
import { Library, Parameter, Type } from "../features/ai/utils/libs/library-types";

// This output goes to the LLM as library documentation and never reaches the language server, so unlike
// every other prefix in the import-aliasing work it is final: nothing downstream re-resolves it. One
// qualifier standing for two libraries here teaches the model a name that does not compile.

function externalType(recordName: string, libraryName: string): Type {
    return { name: recordName, links: [{ category: "external", recordName, libraryName }] };
}

function param(name: string, recordName: string, libraryName: string): Parameter {
    return { name, description: "", type: externalType(recordName, libraryName) };
}

function libraryWithFunction(parameters: Parameter[], returnType?: Type): Library {
    return {
        name: "demo",
        description: "",
        typeDefs: [],
        clients: [],
        functions: [
            {
                type: "function",
                name: "foo",
                description: "",
                parameters,
                return: returnType ? { type: returnType, description: "" } : undefined,
            } as never,
        ],
    };
}

function libraryWithFunctions(fns: { name: string; parameters: Parameter[] }[]): Library {
    return {
        name: "demo",
        description: "",
        typeDefs: [],
        clients: [],
        functions: fns.map((f) => ({ type: "function", description: "", ...f } as never)),
    };
}

/** Every rendered `function ...` line. */
function signatureLines(library: Library): string[] {
    return toSyntaxString([library]).split("\n").filter((l) => l.startsWith("function "));
}

/** The one qualifier a library is rendered with, asserted to be the same everywhere it appears. */
function soleQualifierFor(lines: string[], recordName: string): string {
    const found = new Set(
        lines.flatMap((line) => [...line.matchAll(new RegExp(`(\\w+):${recordName}\\b`, "g"))].map((m) => m[1]))
    );
    expect(found.size).toBe(1);
    return [...found][0];
}

/** The rendered `function foo(...)` line. */
function signatureOf(library: Library): string {
    const line = toSyntaxString([library]).split("\n").find((l) => l.startsWith("function foo("));
    expect(line).toBeDefined();
    return line as string;
}

describe("toSyntaxString module prefixes", () => {
    it("gives two libraries sharing a natural segment distinct qualifiers across the whole signature", () => {
        // googleapis.drive and ai.google.drive both end in `drive`. Collecting links per parameter gave each
        // its own empty `taken` set, so both kept `drive` while the return type -- which did use the merged
        // set -- said `aiGoogleDrive`. One qualifier, two libraries.
        const signature = signatureOf(
            libraryWithFunction(
                [param("a", "File", "googleapis.drive"), param("b", "TextDataLoader", "ai.google.drive")],
                externalType("TextDataLoader", "ai.google.drive")
            )
        );

        expect(signature).toContain("drive:File a");
        expect(signature).toContain("aiGoogleDrive:TextDataLoader b");
        expect(signature).toContain("returns aiGoogleDrive:TextDataLoader");

        // The decisive property: whatever the qualifiers are, no two libraries may share one.
        const qualifiers = [...signature.matchAll(/(\w+):(File|TextDataLoader)/g)].map((m) => m[1]);
        expect(new Set(qualifiers).size).toBe(2);
    });

    it("prefixes a record name shared by two colliding libraries exactly once", () => {
        // Both parameters are named `File`, so the merged link set holds two links with the same record name.
        // Replacing with the whole set ran the second link over the first one's output -- `File` became
        // `drive:File` and then `drive:aiGoogleDrive:File`, for both parameters.
        const signature = signatureOf(
            libraryWithFunction([param("a", "File", "googleapis.drive"), param("b", "File", "ai.google.drive")])
        );

        expect(signature).toContain("drive:File a");
        expect(signature).toContain("aiGoogleDrive:File b");
        expect(signature).not.toMatch(/\w+:\w+:File/);
    });

    it("names the alias in the agent note when it is not the natural prefix", () => {
        // The note is this output's only channel to the model. Without the alias the model follows the system
        // prompt's "alias a dotted package by its last segment" rule, writes `as drive`, and every
        // `aiGoogleDrive:` qualifier we emitted is unbound.
        const rendered = toSyntaxString([
            libraryWithFunction([param("a", "File", "googleapis.drive"), param("b", "File", "ai.google.drive")]),
        ]);

        expect(rendered).toContain("File FROM ai.google.drive package (import as aiGoogleDrive)");
        // The library that kept its natural prefix needs no hint.
        expect(rendered).toContain("File FROM googleapis.drive package,");
    });

    it("falls back to a numbered suffix when the camelCase alias is unavailable", () => {
        // `ballerinax/github` and `ballerinax/trigger.github` both derive `github`; the dotted one becomes
        // `triggerGithub`. Two undotted modules have no camelCase form to fall back to, so the second is
        // numbered -- the same ladder the language server walks.
        const dotted = signatureOf(
            libraryWithFunction([param("a", "R", "ballerinax/github"), param("b", "S", "ballerinax/trigger.github")])
        );
        expect(dotted).toContain("github:R a");
        expect(dotted).toContain("triggerGithub:S b");

        const undotted = signatureOf(
            libraryWithFunction([param("a", "R", "ballerinax/github"), param("b", "S", "otherorg/github")])
        );
        expect(undotted).toContain("github:R a");
        expect(undotted).toContain("github2:S b");
    });

    it("gives every field of a record a distinct qualifier per library", () => {
        // Same gap as the parameters, one level down: `renderRecord` collected links per field.
        const rendered = toSyntaxString([
            {
                name: "demo",
                description: "",
                clients: [],
                functions: [],
                typeDefs: [
                    {
                        type: "Record",
                        name: "Cfg",
                        description: "",
                        fields: [
                            { name: "f1", description: "", type: externalType("File", "googleapis.drive") },
                            { name: "f2", description: "", type: externalType("File", "ai.google.drive") },
                        ],
                    } as never,
                ],
            } as Library,
        ]);

        expect(rendered).toContain("drive:File f1");
        expect(rendered).toContain("aiGoogleDrive:File f2");
        expect(rendered).not.toMatch(/\w+:\w+:File/);
    });

    it("gives a library one qualifier across the whole document", () => {
        // Allocation used to be per signature, so each started with an empty `taken` set and first-come kept
        // the natural prefix. `ai.google.drive` came out `aiGoogleDrive` in foo (where it collided) but
        // `drive` in bar (where it did not), and `baz` -- same two libraries, reversed order -- disagreed with
        // foo about which one was pushed off. The reader writes one file with one import block, so no choice
        // of `drive` satisfies all three.
        const lines = signatureLines(
            libraryWithFunctions([
                { name: "foo", parameters: [param("a", "File", "googleapis.drive"),
                                            param("b", "TextDataLoader", "ai.google.drive")] },
                { name: "bar", parameters: [param("b", "TextDataLoader", "ai.google.drive")] },
                { name: "baz", parameters: [param("b", "TextDataLoader", "ai.google.drive"),
                                            param("a", "File", "googleapis.drive")] },
            ])
        );

        expect(lines).toHaveLength(3);
        expect(soleQualifierFor(lines, "File")).toBe("drive");
        expect(soleQualifierFor(lines, "TextDataLoader")).toBe("aiGoogleDrive");
    });

    it("allocates across libraries too, since the reader writes one import block", () => {
        // Two libraries handed to one call collide with each other exactly as two records in one signature do.
        const rendered = toSyntaxString([
            libraryWithFunctions([{ name: "foo", parameters: [param("a", "File", "googleapis.drive")] }]),
            { ...libraryWithFunctions([{ name: "bar", parameters: [param("b", "Loader", "ai.google.drive")] }]),
              name: "other" },
        ]);
        const lines = rendered.split("\n").filter((l) => l.startsWith("function "));

        expect(soleQualifierFor(lines, "File")).toBe("drive");
        expect(soleQualifierFor(lines, "Loader")).toBe("aiGoogleDrive");
    });

    it("states the alias on every note for a library that was renamed", () => {
        // The hint has to travel with each mention: a note that named the alias once and left the next
        // occurrence bare is what made the per-signature allocation actively misleading.
        const rendered = toSyntaxString([
            libraryWithFunctions([
                { name: "foo", parameters: [param("a", "File", "googleapis.drive"),
                                            param("b", "TextDataLoader", "ai.google.drive")] },
                { name: "bar", parameters: [param("b", "TextDataLoader", "ai.google.drive")] },
            ])
        ]);

        const notes = rendered.split("\n").filter((l) => l.includes("TextDataLoader FROM"));
        expect(notes).toHaveLength(2);
        notes.forEach((note) => expect(note).toContain("ai.google.drive package (import as aiGoogleDrive)"));
    });

    it("does not carry one document's allocation into the next", () => {
        // The ledger is module-scoped state, so a stale entry would silently rename a library in a later,
        // unrelated call.
        signatureLines(
            libraryWithFunctions([
                { name: "foo", parameters: [param("a", "File", "googleapis.drive"),
                                            param("b", "TextDataLoader", "ai.google.drive")] },
            ])
        );
        const alone = signatureLines(
            libraryWithFunctions([{ name: "bar", parameters: [param("b", "TextDataLoader", "ai.google.drive")] }])
        );

        // Nothing collides this time, so it is back on its natural prefix.
        expect(soleQualifierFor(alone, "TextDataLoader")).toBe("drive");
    });

    it("leaves a single library on its natural prefix", () => {
        // Regression guard: nothing collides, so output is unchanged from before the merged pass existed.
        const signature = signatureOf(
            libraryWithFunction([param("a", "File", "googleapis.drive")], externalType("File", "googleapis.drive"))
        );

        expect(signature).toContain("drive:File a");
        expect(signature).toContain("returns drive:File");
    });
});
