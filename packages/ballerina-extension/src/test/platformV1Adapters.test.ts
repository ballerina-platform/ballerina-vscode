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
        expect(item.connectionSchemas[0].entries.map((e) => e.name)).toEqual(Object.keys(SERVICE_CONNECTION_KEYS));
    });

    it("tells databases from services from plain config by an env group's keys, and never reveals secrets", () => {
        const ref = { integration: "orders", environment: "development" };
        const db = envGroupToConnectionListItem({ name: "orders-db", sensitive: true, keys: ["DB_HOST", "DB_PASSWORD", "DB_USER"] }, ref);
        expect(db.resourceType).toBe("DATABASE");
        expect(parseConnectionId(db.groupUuid)).toEqual({ ...ref, name: "orders-db" });
        expect(envGroupToConnectionListItem({ name: "inv", sensitive: true, keys: ["SERVICE_URL", "API_KEY"] }, ref).resourceType).toBe("SERVICE");
        expect(envGroupToConnectionListItem({ name: "misc", sensitive: false, keys: ["LOG_LEVEL"] }, ref).resourceType).toBe("CONFIG");

        const detailed = envGroupToConnectionDetailed({ name: "orders-db", sensitive: true, keys: ["DB_HOST", "DB_PASSWORD"], data: { DB_HOST: "db.example", DB_PASSWORD: "" } }, ref);
        const entries = detailed.configurations.development.entries;
        expect(entries.HostName).toMatchObject({ envVariableName: "DB_HOST", value: "db.example", isSensitive: true });
        expect(entries.Password).toMatchObject({ envVariableName: "DB_PASSWORD", value: "" });
    });

    it("describes a just-written connection so the config step can point configurables at the env vars", () => {
        const created = createdConnection({ name: "orders-db", integration: "orders", environments: ["development", "staging"], kind: "DATABASE", serviceId: "db:srv-1" });
        expect(Object.keys(created.configurations)).toEqual(["development", "staging"]);
        expect(created.configurations.staging.entries.Username.envVariableName).toBe("DB_USER");
        expect(created.configurations.development.entries.Password.isSensitive).toBe(true);
        const svc = createdConnection({ name: "inv", integration: "orders", environments: ["development"], kind: "SERVICE", serviceId: "svc:p/i/e" });
        expect(svc.configurations.development.entries.ChoreoAPIKey.envVariableName).toBe("API_KEY");
        expect(svc.configurations.development.entries.ServiceURL.envVariableName).toBe("SERVICE_URL");
    });

    it("records what a local connection reference points at", () => {
        expect(resourceRefOf(dbServerToMarketplaceItem(server, "acme"), "orders-db")).toBe("database:srv-1");
        expect(resourceRefOf({ serviceId: serviceId({ project: "p", integration: "i", endpoint: "e" }) } as never, "x")).toBe("service:p/i/e");
        expect(resourceRefOf(undefined, "custom")).toBe("connection:custom");
    });
});
