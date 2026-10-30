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

// L1 (contract) — every GraphQL operation gets its own port, even when operations share a name: a query
// and a mutation named alike (wso2/product-integrator#355), or an operation redeclared by mistake
// (wso2/product-integrator#382). A shared port made every link from those rows land on a single row.

import { Type, TypeFunctionModel, TypeNodeKind } from "@wso2/ballerina-core";
import { getAttributePortName, graphqlModeller } from "../utils/model-mapper/entityModelMapper";

const type = (name: string, node: TypeNodeKind, functions: TypeFunctionModel[] = []): Type => ({
    name,
    editable: true,
    metadata: { label: name, description: "" },
    codedata: { node },
    properties: {},
    members: [],
    functions,
});

const operation = (kind: "RESOURCE" | "REMOTE", accessor: string, name: string, returnType: string): TypeFunctionModel => ({
    qualifiers: [],
    accessor,
    kind,
    name,
    parameters: [],
    returnType,
    refs: [returnType],
});

const services: [string, TypeFunctionModel[]][] = [
    ["a query and a mutation sharing a name", [
        operation("RESOURCE", "get", "item", "Book"),
        operation("REMOTE", "", "item", "Author"),
    ]],
    ["a redeclared query", [
        operation("RESOURCE", "get", "query1", "Book"),
        operation("RESOURCE", "get", "query2", "Book"),
        operation("RESOURCE", "get", "query2", "Author"),
    ]],
    ["uniquely named operations", [
        operation("RESOURCE", "get", "book", "Book"),
        operation("RESOURCE", "subscribe", "author", "Author"),
    ]],
];

describe("GraphQL operation ports", () => {
    it.each(services)("gives every operation its own port (%s)", (_, functions) => {
        const service = type("/graphql", "SERVICE_DECLARATION", functions);
        const portNames = functions.map((fn) => getAttributePortName(service, fn));
        expect(new Set(portNames).size).toBe(functions.length);
    });

    it.each(services)("starts each operation's link at its own row (%s)", (_, functions) => {
        const service = type("/graphql", "SERVICE_DECLARATION", functions);
        const model = graphqlModeller(service, [type("Book", "RECORD"), type("Author", "RECORD")]);

        const sourcePorts = model.getLinks().map((link) => link.getSourcePort()?.getID());
        expect(sourcePorts).not.toContain(undefined);
        expect(new Set(sourcePorts).size).toBe(functions.length);
    });

    it("keeps the plain name as the port of a uniquely named operation", () => {
        const functions = services[2][1];
        const service = type("/graphql", "SERVICE_DECLARATION", functions);
        expect(functions.map((fn) => getAttributePortName(service, fn))).toEqual(["book", "author"]);
    });
});
