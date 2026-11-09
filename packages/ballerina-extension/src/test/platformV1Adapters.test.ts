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

// L1: the connection screens' marketplace vocabulary, fed from the platform's
// databases, endpoints and env-var groups.

import {
    connectionId,
    createdConnection,
    DATABASE_CONNECTION_KEYS,
    dbCredentialsToAdminCredential,
    dbServerToMarketplaceItem,
    dbServerToV1DatabaseServer,
    endpointToMarketplaceItem,
    envGroupToConnectionDetailed,
    envGroupToConnectionListItem,
    parseConnectionId,
    parseDatabaseId,
    parseServiceId,
    resourceRefOf,
    serviceId,
    SERVICE_CONNECTION_KEYS,
} from "../rpc-managers/platform-ext/v1-adapters";
import {
    configurableId,
    endpointLinkConnections,
    linkConnectionId,
    linkToConnectionDetailed,
    localConnectionServiceIds,
    parseLinkConnectionId,
} from "../rpc-managers/platform-ext/v1-adapters";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as yaml from "js-yaml";

const server = { id: "srv-1", name: "orders-db", status: "ACTIVE" as const, postgresVersion: "16", plan: "small", createdAt: "2026-01-01T00:00:00Z" };
const credentials = { host: "db.example", port: "5432", database: "orders", username: "app", password: "s3cret" };

describe("platform v1 adapters", () => {
    it("round-trips service, database and connection ids, with slashes in names preserved", () => {
        const svc = serviceId({ project: "default-project", integration: "orders/api", endpoint: "http" });
        expect(svc.startsWith("svc:")).toBe(true);
        expect(parseServiceId(svc)).toEqual({ project: "default-project", integration: "orders/api", endpoint: "http" });
        expect(parseServiceId("db:srv-1")).toBeUndefined();
        expect(parseServiceId("svc:only/two")).toBeUndefined();

        expect(parseDatabaseId("db:srv-1")).toBe("srv-1");
        expect(parseDatabaseId("srv-1")).toBeUndefined();

        const conn = connectionId({ integration: "orders", environment: "development", name: "orders-db" });
        expect(parseConnectionId(conn)).toEqual({ integration: "orders", environment: "development", name: "orders-db" });
        expect(parseConnectionId("nope")).toBeUndefined();
    });

    it("presents a managed database as an active marketplace database with the credential schema", () => {
        const item = dbServerToMarketplaceItem(server, "acme");
        expect(item.resourceType).toBe("DATABASE");
        expect(item.serviceId).toBe("db:srv-1");
        expect(item.resourceDetails).toMatchObject({ databaseServerId: "srv-1", databaseType: "postgres", status: "ACTIVE" });
        expect(item.connectionSchemas[0].entries.map((e) => e.name)).toEqual(Object.keys(DATABASE_CONNECTION_KEYS));
        expect(item.connectionSchemas[0].entries.find((e) => e.name === "Password")?.isSensitive).toBe(true);

        const v1 = dbServerToV1DatabaseServer(server, credentials);
        expect(v1.connection_params).toMatchObject({ host: "db.example", port: "5432", database: "orders", user: "app" });
        expect(dbCredentialsToAdminCredential(credentials)).toEqual({ name: "app", password: "s3cret" });
    });

    it("presents an exposed endpoint as a service of the project with its visibility", () => {
        const integration = { id: "orders", name: "orders", displayName: "Orders", description: "", createdAt: "2026-01-01T00:00:00Z" } as never;
        const endpoint = { name: "http", displayName: "HTTP API", type: "REST", basePath: "/orders", visibility: ["project", "organization"], resources: [] } as never;
        const item = endpointToMarketplaceItem("default-project", integration, "development", endpoint, "acme");
        expect(item.serviceId).toBe(serviceId({ project: "default-project", integration: "orders", endpoint: "http" }));
        expect(item.name).toBe("Orders / HTTP API");
        expect(item.visibility).toEqual(["PROJECT", "ORGANIZATION"]);
        expect(item.projectId).toBe("default-project");
        expect(item.isThirdParty).toBe(false);
        // Project access takes the endpoint's address alone; the exposed endpoint also offers the gateway with an API key.
        expect(item.connectionSchemas.map((s) => s.id)).toEqual(["project-url", "api-key"]);
        expect(item.connectionSchemas[0].entries.map((e) => e.name)).toEqual(["ServiceURL"]);
        expect(item.connectionSchemas[1].entries.map((e) => e.name)).toEqual(Object.keys(SERVICE_CONNECTION_KEYS));
    });

    it("offers only project access for an endpoint that is not exposed through the gateway", () => {
        const integration = { id: "orders", name: "orders", displayName: "Orders", description: "", createdAt: "2026-01-01T00:00:00Z" } as never;
        const endpoint = { name: "http", type: "REST", visibility: ["project"], exposure: "none", resources: [] } as never;
        const item = endpointToMarketplaceItem("default-project", integration, "development", endpoint, "acme");
        expect(item.visibility).toEqual(["PROJECT"]);
        expect(item.connectionSchemas.map((s) => s.id)).toEqual(["project-url"]);
    });

    it("names a service by its integration alone when the endpoint is named after a bare path", () => {
        const integration = { id: "orders", name: "orders", displayName: "Orders", description: "", createdAt: "2026-01-01T00:00:00Z" } as never;
        const rootPath = { name: "/", displayName: "/", type: "REST", visibility: ["project"], resources: [] } as never;
        expect(endpointToMarketplaceItem("default-project", integration, "development", rootPath, "acme").name).toBe("Orders");
    });

    it("tells databases from services from plain config by an env group's keys, and never reveals secrets", () => {
        const ref = { integration: "orders", environment: "development" };
        const db = envGroupToConnectionListItem({ name: "orders-db", sensitive: true, keys: ["ORDERS_DB_DB_HOST", "ORDERS_DB_DB_PASSWORD", "ORDERS_DB_DB_USER"] }, ref);
        expect(db.resourceType).toBe("DATABASE");
        expect(parseConnectionId(db.groupUuid)).toEqual({ ...ref, name: "orders-db" });
        const gateway = envGroupToConnectionListItem({ name: "inv", sensitive: true, keys: ["INV_SERVICE_URL", "INV_API_KEY"] }, ref);
        expect(gateway.resourceType).toBe("SERVICE");
        expect(gateway.schemaReference).toBe("api-key");
        expect(envGroupToConnectionListItem({ name: "inv", sensitive: false, keys: ["INV_SERVICE_URL"] }, ref).schemaReference).toBe("project-url");
        expect(envGroupToConnectionListItem({ name: "misc", sensitive: false, keys: ["LOG_LEVEL"] }, ref).resourceType).toBe("CONFIG");
        // Variables without a connection prefix are plain config.
        expect(envGroupToConnectionListItem({ name: "bare", sensitive: true, keys: ["DB_HOST", "DB_PASSWORD"] }, ref).resourceType).toBe("CONFIG");

        const detailed = envGroupToConnectionDetailed(
            { name: "orders-db", sensitive: true, keys: ["ORDERS_DB_DB_HOST", "ORDERS_DB_DB_PASSWORD"], data: { ORDERS_DB_DB_HOST: "db.example", ORDERS_DB_DB_PASSWORD: "" } },
            ref,
        );
        expect(detailed.resourceType).toBe("DATABASE");
        const entries = detailed.configurations.development.entries;
        expect(entries.HostName).toMatchObject({ envVariableName: "ORDERS_DB_DB_HOST", value: "db.example", isSensitive: true });
        expect(entries.Password).toMatchObject({ envVariableName: "ORDERS_DB_DB_PASSWORD", value: "" });
    });

    it("describes a just-written connection so the config step can point configurables at the env vars", () => {
        const created = createdConnection({ name: "orders-db", integration: "orders", environments: ["development", "staging"], kind: "DATABASE", serviceId: "db:srv-1" });
        expect(Object.keys(created.configurations)).toEqual(["development", "staging"]);
        expect(created.configurations.staging.entries.Username.envVariableName).toBe("ORDERS_DB_DB_USER");
        expect(created.configurations.development.entries.Password.isSensitive).toBe(true);
        const svc = createdConnection({ name: "inv", integration: "orders", environments: ["development"], kind: "SERVICE", serviceId: "svc:p/i/e" });
        expect(svc.configurations.development.entries.ChoreoAPIKey.envVariableName).toBe("INV_API_KEY");
        expect(svc.configurations.development.entries.ServiceURL.envVariableName).toBe("INV_SERVICE_URL");
        expect(svc.schemaReference).toBe("api-key");
        const inProject = createdConnection({ name: "inv", integration: "orders", environments: ["development"], kind: "SERVICE", serviceId: "svc:p/i/e", access: "project" });
        expect(Object.keys(inProject.configurations.development.entries)).toEqual(["ServiceURL"]);
        expect(inProject.schemaReference).toBe("project-url");
        expect(inProject.schemaName).toBe("Project URL");
        const other = createdConnection({ name: "billing-db", integration: "orders", environments: ["development"], kind: "DATABASE", serviceId: "db:srv-2" });
        expect(other.configurations.development.entries.HostName.envVariableName).not.toBe(created.configurations.development.entries.HostName.envVariableName);
    });

    it("reads every connection reference a component file records, by name, the ones naming no known service too", () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bal-refs-"));
        try {
            fs.mkdirSync(path.join(dir, ".wso2"));
            fs.writeFileSync(
                path.join(dir, ".wso2", "component.yaml"),
                yaml.dump({
                    dependencies: {
                        connectionReferences: [
                            { name: "orders-db", resourceRef: "database:srv-1" },
                            { name: "custom", resourceRef: "connection:custom" },
                        ],
                    },
                }),
            );
            const refs = localConnectionServiceIds(dir);
            expect(refs.get("orders-db")).toBe("db:srv-1");
            expect(refs.has("custom")).toBe(true);
            expect(refs.has("app_config")).toBe(false);
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    it("records what a local connection reference points at", () => {
        expect(resourceRefOf(dbServerToMarketplaceItem(server, "acme"), "orders-db")).toBe("database:srv-1");
        expect(resourceRefOf({ serviceId: serviceId({ project: "p", integration: "i", endpoint: "e" }) } as never, "x")).toBe("service:p/i/e");
        expect(resourceRefOf(undefined, "custom")).toBe("connection:custom");
    });
});

describe("connections inside the project, which are endpoint links", () => {
    const orders = serviceId({ project: "shop", integration: "orders", endpoint: "api" });

    it("names a root-module configurable as the platform does, and round-trips a link's id", () => {
        expect(configurableId("acme", "basket", "ServiceURL")).toBe("acme/basket:ServiceURL");
        const ref = { integration: "basket", configurable: "acme/basket:ServiceURL", name: "orders" };
        expect(parseLinkConnectionId(linkConnectionId(ref))).toEqual(ref);
        expect(parseLinkConnectionId(connectionId({ integration: "basket", environment: "dev", name: "orders" }))).toBeUndefined();
    });

    it("lists each local connection a link stands for, one link each, skipping ones listed as groups", () => {
        const links = [
            { configurable: "acme/basket:ServiceURL", component: "orders", endpoint: "api" },
            { configurable: "acme/basket:ServiceURL1", component: "orders", endpoint: "api" },
            { configurable: "acme/basket:Other", component: "stock", endpoint: "api" },
        ];
        const refs = new Map([
            ["orders", orders],
            ["orders-again", orders],
            ["orders-third", orders],
            ["as-group", orders],
            ["elsewhere", serviceId({ project: "other", integration: "orders", endpoint: "api" })],
        ]);
        const items = endpointLinkConnections(links, refs, { project: "shop", integration: "basket" }, new Set(["as-group"]));
        expect(items.map((item) => [item.name, parseLinkConnectionId(item.groupUuid)?.configurable])).toEqual([
            ["orders", "acme/basket:ServiceURL"],
            ["orders-again", "acme/basket:ServiceURL1"],
        ]);
        expect(items[0].schemaReference).toBe("project-url");
        expect(items[0].serviceId).toBe(orders);
    });

    it("gives a link the URL entry the connection screens read", () => {
        const detailed = linkToConnectionDetailed({ integration: "basket", configurable: "acme/basket:ServiceURL", name: "orders" });
        expect(Object.values(detailed.configurations)[0].entries.ServiceURL.envVariableName).toBe("ORDERS_SERVICE_URL");
    });

    it("ids a connection created inside the project by its link", () => {
        const created = createdConnection({
            name: "orders",
            integration: "basket",
            environments: ["development"],
            kind: "SERVICE",
            serviceId: orders,
            access: "project",
            configurable: "acme/basket:ServiceURL",
        });
        expect(parseLinkConnectionId(created.groupUuid)).toEqual({ integration: "basket", configurable: "acme/basket:ServiceURL", name: "orders" });
        expect(Object.keys(created.configurations.development.entries)).toEqual(["ServiceURL"]);
    });
});
