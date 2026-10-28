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
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { CDFunction, CDGraphqlField, CDModel, CDResourceFunction, formatInlineGraphqlArgs } from "@wso2/ballerina-core";
import { Diagram } from "../components/Diagram";
import model from "../stories/7-graphql-complex.json";

const project = model as unknown as CDModel;
const graphqlService = project.services.find((service) => service.type === "graphql:Service");
const functions: Array<CDFunction | CDResourceFunction> = [
    ...graphqlService.resourceFunctions,
    ...graphqlService.remoteFunctions,
];
const fields: CDGraphqlField[] = functions.map((fn) => fn.graphqlField).filter(Boolean);
const plainFunctions = functions.filter((fn) => !fn.graphqlField);

const rowText = (field: CDGraphqlField) => field.name + formatInlineGraphqlArgs(field.args) + field.type;

// The innermost element showing exactly `name(args)` then the type, i.e. the field's row.
function findRow(container: HTMLElement, text: string): Element | undefined {
    return Array.from(container.querySelectorAll("*")).filter((element) => element.textContent === text).pop();
}

function findDefinition(field: CDGraphqlField): HTMLElement | undefined {
    return screen.queryAllByTestId("graphql-definition").find(
        (element) => element.textContent.startsWith(`${field.name}:`) || element.textContent.startsWith(`${field.name}(`)
    );
}

async function renderDiagram(project: CDModel) {
    const dom = render(
        <Diagram
            project={project}
            onListenerSelect={jest.fn()}
            onServiceSelect={jest.fn()}
            onConnectionSelect={jest.fn()}
            onAutomationSelect={jest.fn()}
            onFunctionSelect={jest.fn()}
            onDeleteComponent={jest.fn()}
        />
    );
    await waitFor(() => expect(screen.getByText("Query")).toBeInTheDocument(), { timeout: 10000 });
    return dom;
}

// Query shows a preview of its fields and Mutation/Subscription start collapsed: open everything.
async function expandAllGroups() {
    fireEvent.click(screen.getByText("Show More"));
    fireEvent.click(screen.getByLabelText("Expand Mutation"));
    fireEvent.click(screen.getByLabelText("Expand Subscription"));
    await waitFor(() => expect(screen.getByText("Show Fewer")).toBeInTheDocument());
}

describe("GraphQL service rows", () => {
    test("the story covers elided arguments, defaults, deprecation and a field without a signature", () => {
        expect(fields.some((field) => field.args.length > 2)).toBe(true);
        expect(fields.some((field) => field.args.some((arg) => arg.defaultValue))).toBe(true);
        expect(fields.some((field) => field.deprecated)).toBe(true);
        expect(plainFunctions.length).toBeGreaterThan(0);
    });

    test("every field shows its name, arguments and GraphQL type, with its SDL definition", async () => {
        const dom = await renderDiagram(project);
        await expandAllGroups();
        for (const field of fields) {
            expect(findRow(dom.container, rowText(field))).toBeDefined();
            const definition = findDefinition(field);
            expect(definition).toHaveTextContent(`: ${field.type}`);
            expect(definition.textContent.includes("@deprecated")).toBe(Boolean(field.deprecated));
        }
        // A field without a GraphQL signature (e.g. a hierarchical path) still shows its name.
        for (const fn of plainFunctions) {
            expect(findRow(dom.container, "path" in fn ? fn.path : fn.name)).toBeDefined();
        }
    }, 15000);

    test("each row's tooltip shows on hover, also when moving straight from another row", async () => {
        const dom = await renderDiagram(project);
        const [first, second] = fields;
        const firstRow = findRow(dom.container, rowText(first));
        const secondRow = findRow(dom.container, rowText(second));

        // Real timers: the tooltip shows after the pointer rests 500 ms. Fake timers would also stall the
        // diagram's own layout timers.
        fireEvent.mouseMove(firstRow);
        await waitFor(() => expect(findDefinition(first)).toBeVisible());

        fireEvent.mouseLeave(firstRow.parentElement);
        fireEvent.mouseMove(secondRow);
        await waitFor(() => expect(findDefinition(second)).toBeVisible());
        expect(findDefinition(first)).not.toBeVisible();
    }, 15000);

    test("an older language server without GraphQL signatures still renders every field by name", async () => {
        const withoutSignatures = JSON.parse(JSON.stringify(project), (key, value) =>
            key === "graphqlField" ? undefined : value
        ) as CDModel;
        const dom = await renderDiagram(withoutSignatures);
        await expandAllGroups();
        for (const fn of functions) {
            expect(findRow(dom.container, "path" in fn ? fn.path : fn.name)).toBeDefined();
        }
        expect(screen.queryAllByTestId("graphql-definition")).toHaveLength(0);
    }, 15000);
});
