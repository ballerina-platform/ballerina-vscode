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

import { MarketplaceItem } from "@wso2/wso2-platform-core";
import {
    KB_SERVICE_TAG,
    errorMessageOf,
    cardSubtitle,
    filterConnectionMarketplaceItems,
    generateInitialConnectionName,
    getInitialAccess,
    getPossibleVisibilities,
    getPossibleSchemas,
    isValidDevantConnName,
    securityTypeOf,
    serviceUrlConfigName,
    toConnectionName,
} from "../../../../../views/BI/Connection/DevantConnections/utils";

const PAGE_SIZE = 24;

// Minimal MarketplaceItem stub; the filter only reads name and tags.
const svc = (name: string, tags: string[] = []): MarketplaceItem => ({ name, tags } as unknown as MarketplaceItem);

const names = (items: MarketplaceItem[]) => items.map((item) => item.name);

describe("filterConnectionMarketplaceItems", () => {
    it("excludes knowledge base services", () => {
        const items = [svc("a"), svc("kb-1", [KB_SERVICE_TAG]), svc("b"), svc("kb-2", [KB_SERVICE_TAG])];

        const result = filterConnectionMarketplaceItems(items, PAGE_SIZE);

        expect(names(result)).toEqual(["a", "b"]);
        expect(result.some((item) => item.tags?.includes(KB_SERVICE_TAG))).toBe(false);
    });

    it("preserves the order of the remaining items", () => {
        const items = [svc("c"), svc("kb", [KB_SERVICE_TAG]), svc("a"), svc("b")];

        const result = filterConnectionMarketplaceItems(items, PAGE_SIZE);

        expect(names(result)).toEqual(["c", "a", "b"]);
    });

    it("caps the result at the page size", () => {
        const items = Array.from({ length: 30 }, (_, i) => svc(`svc-${i}`));

        const result = filterConnectionMarketplaceItems(items, PAGE_SIZE);

        expect(result).toHaveLength(PAGE_SIZE);
        expect(result[0].name).toBe("svc-0");
        expect(result[PAGE_SIZE - 1].name).toBe("svc-23");
    });

    it("keeps a full page of connections even when knowledge bases are mixed in", () => {
        // Interleave knowledge bases with connections; KBs must not consume page slots.
        const items: MarketplaceItem[] = [];
        for (let i = 0; i < 30; i++) {
            items.push(svc(`svc-${i}`));
            if (i % 3 === 0) {
                items.push(svc(`kb-${i}`, [KB_SERVICE_TAG]));
            }
        }

        const result = filterConnectionMarketplaceItems(items, PAGE_SIZE);

        expect(result).toHaveLength(PAGE_SIZE);
        expect(result.some((item) => item.tags?.includes(KB_SERVICE_TAG))).toBe(false);
        expect(result[0].name).toBe("svc-0");
    });
});

describe("WSO2 Cloud service connection schemas", () => {
    const schema = (id: string) => ({ id, name: id, entries: [] as unknown[] });
    const service = { resourceType: "SERVICE", isThirdParty: false, connectionSchemas: [schema("project-url"), schema("api-key"), schema("gateway-url")] } as unknown as MarketplaceItem;

    it("offers the in-cluster URL for Project access and the gateway's API key otherwise, not the keyless import schema", () => {
        expect(getPossibleSchemas(service, "PROJECT").map((s) => s.id)).toEqual(["project-url"]);
        expect(getPossibleSchemas(service, "ORGANIZATION").map((s) => s.id)).toEqual(["api-key"]);
        expect(getPossibleSchemas(service, "PUBLIC").map((s) => s.id)).toEqual(["api-key"]);
    });

    it("starts a connection with the schema of its initial access", () => {
        const inProject = { ...service, projectId: "p1", visibility: ["PROJECT", "ORGANIZATION"] } as unknown as MarketplaceItem;
        expect(getInitialAccess(inProject, "p1")).toMatchObject({ visibility: "PROJECT", schema: { id: "project-url" } });
        // From another project, Project access is not offered, so the connection goes through the gateway with a key.
        expect(getInitialAccess(inProject, "p2")).toMatchObject({ visibility: "ORGANIZATION", schema: { id: "api-key" } });
    });

    it("leaves a database's schemas unfiltered", () => {
        const database = { resourceType: "DATABASE", connectionSchemas: [schema("database-credentials")] } as unknown as MarketplaceItem;
        expect(getPossibleSchemas(database, "PROJECT").map((s) => s.id)).toEqual(["database-credentials"]);
    });

    it("creates the client with an API key only for a gateway connection", () => {
        expect(securityTypeOf({ schemaName: "API Key", schemaReference: "api-key" })).toBe("apikey");
        expect(securityTypeOf({ schemaName: "Sensitive", schemaReference: "api-key" })).toBe("apikey");
        expect(securityTypeOf({ schemaName: "Project URL", schemaReference: "project-url" })).toBe("");
    });

    it("reads the message of an error that arrives as a plain object", () => {
        expect(errorMessageOf({ message: "endpoint is not exposed as an API yet" })).toBe("endpoint is not exposed as an API yet");
        expect(errorMessageOf(new Error("boom"))).toBe("boom");
    });
});

describe("serviceUrlConfigName", () => {
    it("names the configurable made for the URL entry", () => {
        expect(serviceUrlConfigName([{ id: "APIKey", name: "APIKey" }, { id: "ServiceURL", name: "ServiceURL1" }])).toBe("ServiceURL1");
        expect(serviceUrlConfigName([])).toBeUndefined();
        expect(serviceUrlConfigName(undefined)).toBeUndefined();
    });
});

describe("toConnectionName", () => {
    it("makes a name the connection form accepts from a service's name", () => {
        expect(toConnectionName("Untitled5 / /")).toBe("Untitled5");
        expect(toConnectionName("Hello World Service / Greeting")).toBe("Hello_World_Service_Greeting");
        expect(toConnectionName("orders-api")).toBe("orders_api");
        expect(toConnectionName("9lives")).toBe("c_9lives");
        expect(toConnectionName("/")).toBe("my_connection");
        expect(toConnectionName(undefined)).toBe("my_connection");
    });
});

describe("toConnectionName limits", () => {
    it("leaves room for the uniqueness counter under the 50 characters the validator allows", () => {
        const name = toConnectionName("a".repeat(80));
        expect(name).toHaveLength(45);
        const unique = generateInitialConnectionName([], [name], "a".repeat(80));
        expect(unique).toBe(`${name}1`);
        expect(isValidDevantConnName(unique, [name], [], false)).toBeUndefined();
    });

    it("keeps a Ballerina keyword from becoming the connection's name", () => {
        expect(toConnectionName("error")).toBe("error_conn");
        expect(toConnectionName("table")).toBe("table_conn");
        expect(toConnectionName("worker")).toBe("worker_conn");
        expect(toConnectionName("Error")).toBe("Error");
        expect(toConnectionName("errors")).toBe("errors");
    });
});

describe("WSO2 Cloud connection names clash by the env vars they write", () => {
    it("skips a name whose env-var prefix an existing cloud connection writes", () => {
        expect(generateInitialConnectionName([], ["orders"], "Orders")).toBe("Orders1");
        expect(generateInitialConnectionName([], ["orders-api"], "orders_api")).toBe("orders_api1");
        expect(generateInitialConnectionName([], ["stock"], "Orders")).toBe("Orders");
        // BI connection names stay an exact match.
        expect(generateInitialConnectionName(["orders"], [], "Orders")).toBe("Orders");
        expect(generateInitialConnectionName(["Orders"], [], "Orders")).toBe("Orders1");
    });

    it("rejects a name whose env-var prefix an existing cloud connection writes", () => {
        expect(isValidDevantConnName("Orders", ["orders"], [], false)).toBe("A WSO2 Cloud connection with this name already exists");
        expect(isValidDevantConnName("orders_api", ["orders-api"], [], false)).toBe("A WSO2 Cloud connection with this name already exists");
        expect(isValidDevantConnName("Orders", ["orders"], [], true)).toBeUndefined();
        expect(isValidDevantConnName("Orders", ["stock"], ["orders"], false)).toBeUndefined();
        expect(isValidDevantConnName("orders", ["stock"], ["orders"], false)).toBe("Duplicate connection name");
    });
});

describe("WSO2 Cloud resource cards", () => {
    it("gives every card one line: why it can't be connected to, else where it lives", () => {
        const service = { resourceType: "SERVICE", projectId: "finance" } as unknown as MarketplaceItem;
        const database = { resourceType: "DATABASE", version: "16" } as unknown as MarketplaceItem;
        expect(cardSubtitle(service, "Not available in production.")).toBe("Not available in production.");
        expect(cardSubtitle(service)).toBe("Project: finance");
        expect(cardSubtitle(database)).toBe("PostgreSQL 16");
        expect(cardSubtitle({ resourceType: "DATABASE" } as unknown as MarketplaceItem)).toBe("PostgreSQL");
    });

    it("reads the message of an error that crossed the RPC boundary as a plain object", () => {
        expect(errorMessageOf({ message: "The project has no environment to connect to." })).toBe("The project has no environment to connect to.");
        expect(errorMessageOf({ message: "Error: refused" })).toBe("refused");
        expect(errorMessageOf(new Error("Error: refused"))).toBe("refused");
        expect(errorMessageOf("plain")).toBe("plain");
    });

    it("offers Project access by the linked project's name, before its details are read", () => {
        const service = { resourceType: "SERVICE", projectId: "shop", visibility: ["PROJECT", "ORGANIZATION"] } as unknown as MarketplaceItem;
        expect(getPossibleVisibilities(service, "shop")).toEqual(["PROJECT", "ORGANIZATION"]);
        expect(getPossibleVisibilities(service, undefined)).toEqual(["ORGANIZATION"]);
    });
});
