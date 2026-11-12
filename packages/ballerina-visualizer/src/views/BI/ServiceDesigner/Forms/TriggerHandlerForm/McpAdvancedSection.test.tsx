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

// The MCP advanced box presents what the layout metadata puts in it: every section in layout order with
// its label and description, every parameter with its description as plain text, and the header row.

import React from "react";
import { createRoot, Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import type { ParameterModel, PropertyModel } from "@wso2/ballerina-core";

import { isMcpToolFieldShown, McpAdvancedSection, withMcpToolRules } from "./McpAdvancedSection";
import type { HandlerUnit, ResolvedSection } from "./handlerLayout";

declare global {
    var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const checkBoxProps: Record<string, unknown>[] = [];

jest.mock("@wso2/ui-toolkit", () => ({
    __esModule: true,
    CheckBox: (props: { label?: string; checked?: boolean; onChange: (checked: boolean) => void }) => {
        checkBoxProps.push(props);
        return (
            <input
                type="checkbox"
                aria-label={props.label}
                checked={!!props.checked}
                onChange={(e) => props.onChange(e.target.checked)}
            />
        );
    },
    Typography: ({ children }: { children?: React.ReactNode }) => <p>{children}</p>,
}));

const param = (name: string, label: string, description: string, enabled = false): HandlerUnit => ({
    id: name,
    kind: "ADVANCED_PARAM",
    parameter: { metadata: { label, description }, enabled, name: { value: name } } as unknown as ParameterModel,
});

const headerTemplate = {
    metadata: { label: "Specific Headers", description: "Bind individual headers as typed parameters." },
} as unknown as ParameterModel;

// Mirrors the v2 tool layout; one description carries an apostrophe, which must survive as text.
const sections: ResolvedSection[] = [
    {
        key: "mcpContext",
        label: "MCP Context",
        description: "Values the MCP runtime injects.",
        advanced: true,
        units: [
            param("meta", "Request Metadata", "Metadata the client sent."),
            param("auth", "Caller Identity", "The caller's verified identity.", true),
        ],
    },
    {
        key: "httpRequest",
        label: "HTTP Request",
        description: "The HTTP request that carried the tool call.",
        advanced: true,
        units: [param("request", "Request", "The full HTTP request."), { id: "$headers", kind: "HEADERS" }],
    },
];

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
    checkBoxProps.length = 0;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(() => {
    act(() => root.unmount());
    container.remove();
});

function render(overrides: Partial<React.ComponentProps<typeof McpAdvancedSection>> = {}) {
    const props: React.ComponentProps<typeof McpAdvancedSection> = {
        looseUnits: [],
        sections,
        headerTemplate,
        headerControls: <button>Header</button>,
        onParamToggle: jest.fn(),
        renderOtherUnits: jest.fn((): React.ReactNode[] => []),
        ...overrides,
    };
    act(() => root.render(<McpAdvancedSection {...props} />));
    return props;
}

describe("McpAdvancedSection", () => {
    it("renders every layout section in order with its label and description", () => {
        render();
        const rendered = [...container.querySelectorAll("[data-testid^='mcp-section-']")];
        expect(rendered.map((el) => el.getAttribute("data-testid"))).toEqual(
            sections.map((section) => `mcp-section-${section.key}`)
        );
        rendered.forEach((el, index) => {
            expect(el.textContent).toContain(sections[index].label);
            expect(el.textContent).toContain(sections[index].description);
        });
    });

    it("renders every parameter description as plain text, never through the checkbox styles", () => {
        render();
        const params = sections.flatMap((section) => section.units).filter((unit) => unit.parameter);
        for (const unit of params) {
            const row = container.querySelector(`[data-testid='mcp-param-${unit.id}']`);
            expect(row?.textContent).toContain(unit.parameter.metadata.description);
        }
        expect(checkBoxProps).toHaveLength(params.length);
        checkBoxProps.forEach((props) => expect(props).not.toHaveProperty("sx"));
    });

    it("reflects and toggles each parameter's enabled state", () => {
        const { onParamToggle } = render();
        const auth = container.querySelector<HTMLInputElement>("input[aria-label='Caller Identity']");
        expect(auth?.checked).toBe(true);
        act(() => auth?.click());
        expect(onParamToggle).toHaveBeenCalledWith(sections[0].units[1].parameter, false);
    });

    it("renders the header row with its label, description and the parent's controls", () => {
        render();
        const headers = container.querySelector("[data-testid='mcp-headers']");
        expect(headers?.textContent).toContain("Specific Headers");
        expect(headers?.textContent).toContain("Bind individual headers as typed parameters.");
        expect(headers?.querySelector("button")?.textContent).toBe("Header");
    });

    it("omits the header row when the handler binds no headers", () => {
        render({ headerTemplate: undefined });
        expect(container.querySelector("[data-testid='mcp-headers']")).toBeNull();
    });

    it("hands unit kinds it does not present back to the shared form", () => {
        const annotation: HandlerUnit = { id: "annotation", kind: "ANNOTATION" };
        const withAnnotation: ResolvedSection = { ...sections[0], units: [...sections[0].units, annotation] };
        const renderOtherUnits = jest.fn(() => [<span key="other">shared</span>]);
        render({ sections: [withAnnotation], renderOtherUnits });
        expect(renderOtherUnits).toHaveBeenCalledWith({ ...withAnnotation, units: [annotation] });
        expect(container.textContent).toContain("shared");
    });
});

// The @mcpv2:Tool section: structured output Off and an explicit output schema cannot be combined, so the form
// hides Output Schema and stops emitting it whenever Off is chosen, and leaves it alone otherwise.
describe("MCP tool annotation rules", () => {
    const tool = (structuredOutput?: { enabled: boolean; value: string }, schemaEnabled = true): PropertyModel =>
        ({
            properties: {
                ...(structuredOutput ? { structuredOutput } : {}),
                outputSchema: { enabled: schemaEnabled, value: "{\"type\": \"object\"}" },
                scopes: { enabled: false, value: "" },
            },
        } as unknown as PropertyModel);

    const cases: [string, PropertyModel, boolean][] = [
        ["Auto (unchecked)", tool({ enabled: false, value: "false" }), true],
        ["no structured output field", tool(undefined), true],
        ["Required", tool({ enabled: true, value: "true" }), true],
        ["Off", tool({ enabled: true, value: "false" }), false],
    ];

    it.each(cases)("shows Output Schema only when structured output is not Off: %s", (_, annotation, shown) => {
        expect(isMcpToolFieldShown("outputSchema", annotation)).toBe(shown);
        expect(isMcpToolFieldShown("scopes", annotation)).toBe(true);
        expect(isMcpToolFieldShown("structuredOutput", annotation)).toBe(true);
    });

    it.each(cases)("stops emitting Output Schema only when structured output is Off: %s", (_, annotation, shown) => {
        const ruled = withMcpToolRules(annotation);
        const outputSchema = ruled.properties?.outputSchema as PropertyModel;
        expect(outputSchema.enabled).toBe(shown);
        if (shown) {
            expect(ruled).toBe(annotation);
        }
    });
});
