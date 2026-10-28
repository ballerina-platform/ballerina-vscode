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
import { fireEvent, render, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { CDGraphqlField, CDModel, formatInlineGraphqlArgs } from "@wso2/ballerina-core";
import { Diagram } from "../components/Diagram";
import model from "../stories/7-graphql-complex.json";

const project = model as unknown as CDModel;
const graphqlService = project.services.find((service) => service.type === "graphql:Service");
const fields: CDGraphqlField[] = [...graphqlService.resourceFunctions, ...graphqlService.remoteFunctions]
    .map((fn) => fn.graphqlField)
    .filter(Boolean);

const rowText = (field: CDGraphqlField) => field.name + formatInlineGraphqlArgs(field.args) + field.type;

// The innermost element showing exactly `name(args)` then the type, i.e. the field's row.
function findFieldRow(container: HTMLElement, field: CDGraphqlField): Element | undefined {
    return Array.from(container.querySelectorAll("*")).filter((element) => element.textContent === rowText(field)).pop();
}

// The field's tooltip: rendered (hidden) into the document body, holding its SDL definition.
function findDefinitionTooltip(field: CDGraphqlField): HTMLElement | undefined {
    const definition = Array.from(document.body.querySelectorAll("div")).find(
        (element) => element.childElementCount === 0
            && (element.textContent.startsWith(`${field.name}:`) || element.textContent.startsWith(`${field.name}(`))
    );
    return definition?.parentElement ?? undefined;
}

const isShown = (tooltip: HTMLElement) => tooltip.style.visibility === "visible";

async function renderDiagram() {
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
    await waitFor(() => expect(dom.container.textContent).toContain(fields[0].type), { timeout: 10000 });
    return dom;
}

describe("GraphQL service rows", () => {
    test("every rendered field shows its name, arguments and GraphQL type", async () => {
        const dom = await renderDiagram();
        const rendered = fields.filter((field) => dom.container.textContent.includes(field.name));
        expect(rendered.length).toBeGreaterThan(1);
        for (const field of rendered) {
            expect(findFieldRow(dom.container, field)).toBeDefined();
            expect(findDefinitionTooltip(field)).toHaveTextContent(`: ${field.type}`);
        }
    }, 15000);

    test("each row's tooltip shows on hover, also when moving straight from another row", async () => {
        const dom = await renderDiagram();
        const [first, second] = fields.filter((field) => findFieldRow(dom.container, field));
        const firstRow = findFieldRow(dom.container, first);
        const secondRow = findFieldRow(dom.container, second);

        // Real timers: the tooltip shows after the pointer rests 500 ms. Fake timers would also stall the
        // diagram's own layout timers.
        fireEvent.mouseMove(firstRow);
        await waitFor(() => expect(isShown(findDefinitionTooltip(first))).toBe(true));

        fireEvent.mouseLeave(firstRow.parentElement);
        fireEvent.mouseMove(secondRow);
        await waitFor(() => expect(isShown(findDefinitionTooltip(second))).toBe(true));
        expect(isShown(findDefinitionTooltip(first))).toBe(false);
    }, 15000);
});
