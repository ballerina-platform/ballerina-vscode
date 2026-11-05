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

import { formatCodebaseMap, extractPreviousStageWorkPlan, groupDeclarationsByFile } from "../features/ai/migration/project-map-format";
import { BallerinaProjectComponents, ComponentInfo, ComponentSummary, ModuleSummary, PackageSummary } from "@wso2/ballerina-core";

function componentInfo(overrides: Partial<ComponentInfo> & { name: string; filePath: string }): ComponentInfo {
    return {
        startLine: 0,
        startColumn: 0,
        endLine: 0,
        endColumn: 0,
        ...overrides,
    };
}

function emptyComponents(): ComponentSummary {
    return {
        functions: [],
        services: [],
        records: [],
        objects: [],
        classes: [],
        types: [],
        constants: [],
        enums: [],
        listeners: [],
        moduleVariables: [],
        automations: [],
        configurableVariables: [],
        naturalFunctions: [],
    };
}

function moduleWith(overrides: Partial<ComponentSummary> & { name?: string } = {}): ModuleSummary {
    const { name, ...rest } = overrides;
    return { name: name ?? "", ...emptyComponents(), ...rest };
}

function packageWith(filePath: string, modules: ModuleSummary[]): PackageSummary {
    return { name: "pkg", filePath, modules };
}

function projectComponents(packages: PackageSummary[]): BallerinaProjectComponents {
    return { packages };
}

describe("formatCodebaseMap", () => {
    it("wraps the block in <codebase_map> tags with a one-line intro", () => {
        const result = formatCodebaseMap([]);
        const lines = result.split("\n");

        expect(lines[0]).toBe("<codebase_map>");
        expect(lines[lines.length - 1]).toBe("</codebase_map>");
        expect(lines.length).toBe(3);
        expect(lines[1]).toMatch(/file bodies are not included/);
        expect(lines[1]).toMatch(/file_read/);
    });

    it("renders one line per file with path and line count", () => {
        const result = formatCodebaseMap([
            { relPath: "main.bal", lineCount: 42 },
            { relPath: "Ballerina.toml", lineCount: 10 },
        ]);

        expect(result).toContain('<file path="main.bal" lines="42"/>');
        expect(result).toContain('<file path="Ballerina.toml" lines="10"/>');
    });

    it("includes declarations for a file when present", () => {
        const declarations = new Map<string, string[]>([
            ["main.bal", ["function main", "service /greeter"]],
        ]);

        const result = formatCodebaseMap([{ relPath: "main.bal", lineCount: 42 }], declarations);

        expect(result).toContain('<file path="main.bal" lines="42">function main; service /greeter</file>');
    });

    it("omits declaration text when a file has none", () => {
        const declarations = new Map<string, string[]>([
            ["other.bal", ["type Foo"]],
        ]);

        const result = formatCodebaseMap([{ relPath: "main.bal", lineCount: 5 }], declarations);

        expect(result).toContain('<file path="main.bal" lines="5"/>');
        expect(result).not.toContain('<file path="main.bal" lines="5">');
    });

    it("omits declaration text when a file's declaration list is empty", () => {
        const declarations = new Map<string, string[]>([["main.bal", []]]);

        const result = formatCodebaseMap([{ relPath: "main.bal", lineCount: 5 }], declarations);

        expect(result).toContain('<file path="main.bal" lines="5"/>');
    });
});

describe("extractPreviousStageWorkPlan", () => {
    it("slices the transcript starting at the SOURCE INVENTORY marker line", () => {
        const transcript = [
            "Some preamble chatter from the agent.",
            "More narration before the real output.",
            "SOURCE INVENTORY — Mule",
            "===================================",
            "FLOWS / PROCESSES",
            "  [✅] flow.xml  →  main.bal",
        ].join("\n");

        const result = extractPreviousStageWorkPlan(transcript);

        expect(result.startsWith("SOURCE INVENTORY — Mule")).toBe(true);
        expect(result).not.toContain("preamble chatter");
        expect(result).toContain("FLOWS / PROCESSES");
    });

    it("returns undefined when no marker is found", () => {
        const transcript = "  \n  Just some agent narration with no inventory block.  \n  ";

        const result = extractPreviousStageWorkPlan(transcript);

        expect(result).toBeUndefined();
    });

    it("trims trailing content after the marker", () => {
        const transcript = "SOURCE INVENTORY — Tibco\nline 1\nline 2\n\n\n   ";

        const result = extractPreviousStageWorkPlan(transcript);

        expect(result).toBe("SOURCE INVENTORY — Tibco\nline 1\nline 2");
    });

    it("strips a stray closing fence left after slicing from the marker", () => {
        const transcript = [
            "```",
            "SOURCE INVENTORY — Mule",
            "===================================",
            "FLOWS / PROCESSES",
            "  [✅] flow.xml  →  main.bal",
            "```",
            "",
            "_Completed: 2026-01-01T00:00:00.000Z_",
        ].join("\n");

        const result = extractPreviousStageWorkPlan(transcript);

        expect(result).not.toContain("```");
        expect(result).toContain("FLOWS / PROCESSES");
        expect(result).toContain("_Completed:");
    });
});

describe("groupDeclarationsByFile", () => {
    it("resolves a default-module declaration to the same relPath collectBalFiles would produce", () => {
        const components = projectComponents([
            packageWith("file:///abs/pkg/", [
                moduleWith({ functions: [componentInfo({ name: "main", filePath: "main.bal" })] }),
            ]),
        ]);

        const result = groupDeclarationsByFile(components, "/abs/pkg");

        expect(result.get("main.bal")).toEqual(["function main"]);
    });

    it("resolves a sub-module declaration under modules/<name>/", () => {
        const components = projectComponents([
            packageWith("file:///abs/pkg/", [
                moduleWith({ name: "foo", services: [componentInfo({ name: "/api", filePath: "svc.bal" })] }),
            ]),
        ]);

        const result = groupDeclarationsByFile(components, "/abs/pkg");

        expect(result.get("modules/foo/svc.bal")).toEqual(["service /api"]);
    });

    it("round-trips through formatCodebaseMap with a real declaration map", () => {
        const components = projectComponents([
            packageWith("file:///abs/pkg/", [
                moduleWith({ functions: [componentInfo({ name: "main", filePath: "main.bal" })] }),
            ]),
        ]);

        const declarations = groupDeclarationsByFile(components, "/abs/pkg");
        const result = formatCodebaseMap([{ relPath: "main.bal", lineCount: 12 }], declarations);

        expect(result).toContain('<file path="main.bal" lines="12">function main</file>');
    });

    it("includes automations and natural functions in the grouped declarations", () => {
        const components = projectComponents([
            packageWith("file:///abs/pkg/", [
                moduleWith({
                    automations: [componentInfo({ name: "myAutomation", filePath: "auto.bal" })],
                    naturalFunctions: [componentInfo({ name: "natFn", filePath: "nat.bal" })],
                }),
            ]),
        ]);

        const result = groupDeclarationsByFile(components, "/abs/pkg");

        expect(result.get("auto.bal")).toEqual(["automation myAutomation"]);
        expect(result.get("nat.bal")).toEqual(["natural function natFn"]);
    });
});

describe("formatCodebaseMap escaping", () => {
    it("escapes special characters in the path attribute and declaration text", () => {
        const relPath = 'weird&"<name>.bal';
        const declarations = new Map<string, string[]>([[relPath, ["function foo<T>"]]]);

        const result = formatCodebaseMap([{ relPath, lineCount: 3 }], declarations);

        expect(result).toContain('<file path="weird&amp;&quot;&lt;name&gt;.bal" lines="3">function foo&lt;T&gt;</file>');
        expect(result).not.toContain('"<');
        expect(result).not.toContain('foo<T>');
    });
});
