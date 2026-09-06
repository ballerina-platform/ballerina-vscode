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

    it("agrees between a parameter and the return type naming the same library", () => {
        const signature = signatureOf(
            libraryWithFunction(
                [param("a", "File", "googleapis.drive"), param("b", "TextDataLoader", "ai.google.drive")],
                externalType("File", "googleapis.drive")
            )
        );

        const paramQualifier = /(\w+):File a/.exec(signature)?.[1];
        const returnQualifier = /returns (\w+):File/.exec(signature)?.[1];
        expect(paramQualifier).toBe(returnQualifier);
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
