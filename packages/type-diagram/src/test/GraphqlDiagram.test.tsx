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

import React from "react";
import { waitFor } from "@testing-library/dom";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { Member, Type, TypeFunctionModel, formatInlineGraphqlArgs, toGraphqlName } from "@wso2/ballerina-core";
import { TypeDiagram } from "../Diagram";

// Captured `typesManager/getGraphqlType` output, copied verbatim from the language server test
// fixture get_graphql_type/config/get_gql_service_class_with_annotation.json.
import graphqlTypeModel from "./fixtures/graphql-type-model.json";

const rootService = graphqlTypeModel.type as unknown as Type;
const refs = graphqlTypeModel.refs as unknown as Type[];

async function renderGraphqlDiagram(service: Type = rootService, types: Type[] = refs) {
    const dom = render(
        <TypeDiagram
            typeModel={types}
            rootService={service}
            isGraphql={true}
            goToSource={jest.fn()}
            onTypeEdit={jest.fn()}
            onTypeDelete={jest.fn()}
            verifyTypeDelete={jest.fn().mockResolvedValue(true)}
        />
    );
    await waitFor(() => expect(dom.container.textContent).toContain(rootService.functions[0].name), {
        timeout: 10000,
    });
    return dom;
}

function argsOf(operation: TypeFunctionModel) {
    return (operation.parameters ?? [])
        .filter((param) => param.graphqlType)
        .map((param) => ({ name: toGraphqlName(param.name), type: param.graphqlType, defaultValue: param.defaultValue }));
}

// The innermost element showing exactly `name(args)` then the type, i.e. the field's row.
function findFieldRow(container: HTMLElement, text: string): Element | undefined {
    return Array.from(container.querySelectorAll("*")).filter((element) => element.textContent === text).pop();
}

function findDefinition(name: string): HTMLElement | undefined {
    return screen.queryAllByTestId("graphql-definition").find(
        (element) => element.textContent.startsWith(`${name}:`) || element.textContent.startsWith(`${name}(`)
    );
}

const operations = rootService.functions as TypeFunctionModel[];
const objectFields = refs.flatMap((ref) => (ref.members ?? []) as Member[]).filter((member) => member.graphqlType);

describe("GraphQL diagram", () => {
    test("the captured model covers operations, arguments and object fields", () => {
        expect(operations.every((operation) => operation.graphqlType)).toBe(true);
        expect(operations.some((operation) => operation.parameters?.some((param) => param.graphqlType))).toBe(true);
        expect(objectFields.length).toBeGreaterThan(0);
    });

    test("every operation shows its GraphQL type and arguments, with the SDL definition on hover", async () => {
        const dom = await renderGraphqlDiagram();
        for (const operation of operations) {
            const rowText = operation.name + formatInlineGraphqlArgs(argsOf(operation)) + operation.graphqlType;
            expect(findFieldRow(dom.container, rowText)).toBeDefined();
            expect(findDefinition(operation.name)).toHaveTextContent(`: ${operation.graphqlType}`);
        }
    }, 15000);

    test("every object field shows its GraphQL type", async () => {
        const dom = await renderGraphqlDiagram();
        for (const field of objectFields) {
            expect(findFieldRow(dom.container, field.name + field.graphqlType)).toBeDefined();
        }
    }, 15000);

    test("each row's tooltip shows on hover, also when moving straight from another row", async () => {
        const dom = await renderGraphqlDiagram();
        const [first, second] = operations;
        const firstRow = findFieldRow(dom.container, first.name + formatInlineGraphqlArgs(argsOf(first)) + first.graphqlType);
        const secondRow = findFieldRow(dom.container, second.name + formatInlineGraphqlArgs(argsOf(second)) + second.graphqlType);

        // Real timers: the tooltip shows after the pointer rests 500 ms. Fake timers would also stall the
        // diagram's own layout timers.
        fireEvent.mouseMove(firstRow);
        await waitFor(() => expect(findDefinition(first.name)).toBeVisible());

        fireEvent.mouseLeave(firstRow.parentElement);
        fireEvent.mouseMove(secondRow);
        await waitFor(() => expect(findDefinition(second.name)).toBeVisible());
        expect(findDefinition(first.name)).not.toBeVisible();
    }, 15000);

    test("an older language server without GraphQL types still renders every field with its Ballerina type", async () => {
        const strip = (value: unknown) => JSON.parse(JSON.stringify(value), (key, v) => key === "graphqlType" ? undefined : v);
        const dom = await renderGraphqlDiagram(strip(rootService), strip(refs));
        for (const operation of operations) {
            expect(dom.container.textContent).toContain(operation.name);
        }
        expect(screen.queryAllByTestId("graphql-definition")).toHaveLength(0);
        expect(dom.container.textContent).not.toContain("!");
    }, 15000);

    test("never falls back to an unformatted type", async () => {
        const dom = await renderGraphqlDiagram();
        expect(dom.container.textContent).not.toContain("[object Object]");
    }, 15000);
});
