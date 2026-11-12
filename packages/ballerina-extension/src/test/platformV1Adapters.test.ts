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
    connectableToMarketplaceItem,
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
    unavailableIn,
    SERVICE_CONNECTION_KEYS,
} from "../rpc-managers/platform-ext/v1-adapters";
import { MARKETPLACE_ITEM_UNAVAILABLE } from "@wso2/ballerina-core/lib/rpc-types/platform-ext/interfaces";
import {
    configurableId,
    connectionLinksOf,
    endpointLinkConnections,
    endpointLinksReferencedBy,
    hasApiKeyLink,
    linkConnectionId,
    linkToConnectionDetailed,
    localConnectionServiceIds,
    parseLinkConnectionId,
    serviceIdOfResourceRef,
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

    it("presents an endpoint of the project as a service reached directly, whatever else it is exposed to", () => {
        const integration = { id: "orders", name: "orders", displayName: "Orders", description: "", createdAt: "2026-01-01T00:00:00Z" } as never;
        const endpoint = { name: "http", displayName: "HTTP API", type: "REST", basePath: "/orders", visibility: ["project", "organization"], resources: [] } as never;
        const item = endpointToMarketplaceItem("default-project", integration, "development", endpoint, "acme", "default-project");
        expect(item.serviceId).toBe(serviceId({ project: "default-project", integration: "orders", endpoint: "http" }));
        expect(item.name).toBe("Orders / HTTP API");
        expect(item.visibility).toEqual(["PROJECT"]);
        expect(item.projectId).toBe("default-project");
        expect(item.summary).toBe("/orders");
        expect(item.isThirdParty).toBe(false);
        expect(item.connectionSchemas.map((s) => s.id)).toEqual(["project-url"]);
        expect(item.connectionSchemas[0].entries.map((e) => e.name)).toEqual(["ServiceURL"]);
    });

    it("presents another project's endpoint as reached through the gateway, with an API key", () => {
        const integration = { id: "billing", name: "billing", displayName: "Billing", description: "", createdAt: "2026-01-01T00:00:00Z" } as never;
        const endpoint = { name: "api", type: "REST", visibility: ["organization"], resources: [] } as never;
        const item = endpointToMarketplaceItem("finance", integration, "development", endpoint, "acme", "shop");
        expect(item.visibility).toEqual(["ORGANIZATION"]);
        expect(item.connectionSchemas.map((s) => s.id)).toEqual(["api-key", "gateway-url"]);
        expect(item.connectionSchemas[0].entries.map((e) => e.name)).toEqual(Object.keys(SERVICE_CONNECTION_KEYS));
    });

    it("presents the platform's connectable endpoints by their scope", () => {
        const environments = [{ name: "development", connectable: true }];
        const billing = connectableToMarketplaceItem(
            { project: "finance", component: "billing", endpoint: "api", displayName: "Billing", scope: "organization", environments },
            "development",
            "acme",
        );
        expect(billing.serviceId).toBe(serviceId({ project: "finance", integration: "billing", endpoint: "api" }));
        expect(billing.name).toBe("Billing / api");
        expect(billing.projectId).toBe("finance");
        expect(billing.visibility).toEqual(["ORGANIZATION"]);
        expect(billing.connectionSchemas.map((s) => s.id)).toEqual(["api-key", "gateway-url"]);
        const cart = connectableToMarketplaceItem(
            { project: "shop", component: "cart", endpoint: "/", displayName: "Cart", scope: "project", environments },
            "development",
            "acme",
        );
        expect(cart.name).toBe("Cart");
        expect(cart.visibility).toEqual(["PROJECT"]);
        expect(cart.connectionSchemas.map((s) => s.id)).toEqual(["project-url"]);
        expect(cart.properties).toBeUndefined();
    });

    it("keeps an endpoint that can't be connected to in the environment, with the platform's reason", () => {
        const endpoint = {
            project: "finance",
            component: "billing",
            endpoint: "api",
            displayName: "Billing",
            scope: "organization" as const,
            environments: [
                { name: "development", connectable: false, reason: "EndpointNotInternal", detail: "endpoint api of billing is not visible to the organization in development" },
                { name: "production", connectable: false },
            ],
        };
        const reason = "Endpoint api of billing is not visible to the organization in development.";
        expect(unavailableIn(endpoint, "development")).toBe(reason);
        expect(unavailableIn(endpoint, "production")).toBe("Not available in production.");
        expect(unavailableIn(endpoint, "staging")).toBe("Not available in staging.");
        const item = connectableToMarketplaceItem(endpoint, "development", "acme");
        expect(item.properties?.[MARKETPLACE_ITEM_UNAVAILABLE]).toBe(reason);
        expect(item.description).toBe("");
        const notDeployed = connectableToMarketplaceItem(endpoint, "development", "acme", "Deploy this integration first.");
        expect(notDeployed.properties?.[MARKETPLACE_ITEM_UNAVAILABLE]).toBe("Deploy this integration first.");
    });

    it("names a service by its integration alone when the endpoint is named after a bare path", () => {
        const integration = { id: "orders", name: "orders", displayName: "Orders", description: "", createdAt: "2026-01-01T00:00:00Z" } as never;
        const rootPath = { name: "/", displayName: "/", type: "REST", visibility: ["project"], resources: [] } as never;
        expect(endpointToMarketplaceItem("default-project", integration, "development", rootPath, "acme", "default-project").name).toBe("Orders");
    });

    it("tells databases from plain config by an env group's keys, and never reveals secrets", () => {
        const ref = { integration: "orders", environment: "development" };
        const db = envGroupToConnectionListItem({ name: "orders-db", sensitive: true, keys: ["ORDERS_DB_DB_HOST", "ORDERS_DB_DB_PASSWORD", "ORDERS_DB_DB_USER"] }, ref);
        expect(db.resourceType).toBe("DATABASE");
        expect(parseConnectionId(db.groupUuid)).toEqual({ ...ref, name: "orders-db" });
        expect(db.schemaReference).toBe("database-credentials");
        // A service connection is links, never a group.
        expect(envGroupToConnectionListItem({ name: "inv", sensitive: true, keys: ["INV_SERVICE_URL", "INV_API_KEY"] }, ref).resourceType).toBe("CONFIG");
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
        const svc = createdConnection({ name: "inv", integration: "orders", environments: ["development"], kind: "SERVICE", serviceId: "svc:p/i/e", access: "organization", apiKey: true });
        expect(svc.configurations.development.entries.APIKey.envVariableName).toBe("INV_API_KEY");
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

describe("service connections, which are endpoint links", () => {
    const orders = serviceId({ project: "shop", integration: "orders", endpoint: "api" });

    it("names a root-module configurable as the platform does, and round-trips a link's id", () => {
        expect(configurableId("acme", "basket", "ServiceURL")).toBe("acme/basket:ServiceURL");
        const ref = { integration: "basket", configurable: "acme/basket:ServiceURL", name: "orders" };
        expect(parseLinkConnectionId(linkConnectionId(ref))).toEqual(ref);
        expect(parseLinkConnectionId(connectionId({ integration: "basket", environment: "dev", name: "orders" }))).toBeUndefined();
    });

    it("lists each local connection a link stands for, one link each, skipping ones listed as groups", () => {
        const billing = serviceId({ project: "finance", integration: "billing", endpoint: "api" });
        const links = [
            { configurable: "acme/basket:ServiceURL", project: "shop", component: "orders", endpoint: "api" },
            { configurable: "acme/basket:ServiceURL1", project: "shop", component: "orders", endpoint: "api" },
            { configurable: "acme/basket:Other", project: "shop", component: "stock", endpoint: "api" },
            { configurable: "acme/basket:BillingURL", project: "finance", component: "billing", endpoint: "api", key: "url" },
            { configurable: "acme/basket:BillingKey", project: "finance", component: "billing", endpoint: "api", key: "apiKey" },
        ];
        const refs = new Map([
            ["orders", orders],
            ["orders-again", orders],
            ["orders-third", orders],
            ["as-group", orders],
            ["billing", billing],
            ["elsewhere", serviceId({ project: "other", integration: "orders", endpoint: "api" })],
        ]);
        const items = endpointLinkConnections(links, refs, { project: "shop", integration: "basket" }, new Set(["as-group"]));
        expect(items.map((item) => [item.name, parseLinkConnectionId(item.groupUuid)?.configurable])).toEqual([
            ["orders", "acme/basket:ServiceURL"],
            ["orders-again", "acme/basket:ServiceURL1"],
            ["billing", "acme/basket:BillingURL"],
        ]);
        expect(items[0].schemaReference).toBe("project-url");
        expect(items[0].serviceId).toBe(orders);
        // Another project's connection is listed by its URL's link, with the API key its own link carries.
        expect(items[2].schemaReference).toBe("api-key");
    });

    it("shows a key only for as many connections to an endpoint as it has key links", () => {
        const billing = serviceId({ project: "finance", integration: "billing", endpoint: "api" });
        const links = [
            { configurable: "acme/basket:BillingURL", project: "finance", component: "billing", endpoint: "api", key: "url" },
            { configurable: "acme/basket:BillingKey", project: "finance", component: "billing", endpoint: "api", key: "apiKey" },
            { configurable: "acme/basket:BillingURL2", project: "finance", component: "billing", endpoint: "api", key: "url" },
        ];
        const refs = new Map([["billing", billing], ["billing-open", billing]]);
        const items = endpointLinkConnections(links, refs, { project: "shop", integration: "basket" });
        expect(items.map((item) => item.schemaReference)).toEqual(["api-key", "gateway-url"]);
        // A connection opens as it is listed: only the one the list shows with the key has it.
        expect(hasApiKeyLink(links, refs, "billing")).toBe(true);
        expect(hasApiKeyLink(links, refs, "billing-open")).toBe(false);
        expect(hasApiKeyLink(links, refs, "unknown")).toBe(false);
        expect(hasApiKeyLink(links.filter((link) => link.key !== "apiKey"), refs, "billing")).toBe(false);
        // A connection the list shows as a group claims no link, in the list or here.
        const withGroupFirst = new Map([["as-group", billing], ["billing-open", billing]]);
        expect(hasApiKeyLink(links, withGroupFirst, "billing-open", new Set(["as-group"]))).toBe(true);
        expect(hasApiKeyLink(links, withGroupFirst, "billing-open")).toBe(false);
    });

    it("unlinks with a connection the configurables it fills", () => {
        const url = { configurable: "acme/basket:BillingURL", project: "finance", component: "billing", endpoint: "api", key: "url" };
        const key = { configurable: "acme/basket:BillingKey", project: "finance", component: "billing", endpoint: "api", key: "apiKey" };
        const other = { configurable: "acme/basket:OrdersURL", project: "shop", component: "orders", endpoint: "api" };
        // By what its code reads.
        expect(connectionLinksOf([url, key, other], url.configurable, "check new ({apiKey: BillingKey}, BillingURL)")).toEqual([url.configurable, key.configurable]);
        // Code that names neither: the only connection to the endpoint takes all of the endpoint's links.
        expect(connectionLinksOf([url, key, other], url.configurable, "check new (config)")).toEqual([url.configurable, key.configurable]);
        // With a second connection to the endpoint, which links are whose isn't known, in either order: none.
        const url2 = { ...url, configurable: "acme/basket:BillingURL2" };
        expect(connectionLinksOf([url, key, url2], url.configurable, "check new (config)")).toEqual([]);
        expect(connectionLinksOf([url2, key, url], url.configurable, "check new (config)")).toEqual([]);
        // Code that names its own still takes them, whichever URL the list paired it with.
        expect(connectionLinksOf([url, key, url2], url.configurable, "check new (BillingURL2)")).toEqual([url2.configurable]);
        // A name in a string or a comment is not a reference.
        expect(connectionLinksOf([url, key, url2], url.configurable, 'check new (BillingURL2, {note: "BillingURL"}) // BillingURL')).toEqual([url2.configurable]);
        // Code that names both URLs doesn't say which is its own.
        expect(connectionLinksOf([url, key, url2], url.configurable, "check new (BillingURL, BillingURL2)")).toEqual([]);
        // A link the list no longer has.
        expect(connectionLinksOf([other], url.configurable, "")).toEqual([url.configurable]);
    });

    it("gives a link the entries the connection screens read", () => {
        const ref = { integration: "basket", configurable: "acme/basket:ServiceURL", name: "orders" };
        const inProject = linkToConnectionDetailed(ref);
        expect(Object.values(inProject.configurations)[0].entries.ServiceURL.envVariableName).toBe("ORDERS_SERVICE_URL");
        expect(Object.keys(Object.values(inProject.configurations)[0].entries)).toEqual(["ServiceURL"]);
        const withKey = linkToConnectionDetailed(ref, "", "organization", true);
        expect(Object.keys(Object.values(withKey.configurations)[0].entries)).toEqual(["ServiceURL", "APIKey"]);
        expect(Object.values(withKey.configurations)[0].entries.APIKey.isSensitive).toBe(true);
        expect(withKey.schemaReference).toBe("api-key");
        expect(linkToConnectionDetailed(ref, "", "organization", false).schemaReference).toBe("gateway-url");
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

    it("gives a connection to another project's endpoint its API key's entry only when the API takes a key", () => {
        const billing = serviceId({ project: "finance", integration: "billing", endpoint: "api" });
        const base = { name: "billing", integration: "basket", environments: ["development"], kind: "SERVICE" as const, serviceId: billing, access: "organization" as const, configurable: "acme/basket:BillingURL" };
        const withKey = createdConnection({ ...base, apiKey: true });
        expect(Object.keys(withKey.configurations.development.entries)).toEqual(["ServiceURL", "APIKey"]);
        expect(withKey.schemaReference).toBe("api-key");
        expect(parseLinkConnectionId(withKey.groupUuid)?.configurable).toBe("acme/basket:BillingURL");
        const open = createdConnection({ ...base, apiKey: false });
        expect(Object.keys(open.configurations.development.entries)).toEqual(["ServiceURL"]);
        expect(open.schemaReference).toBe("gateway-url");
    });

    it("reads a service reference back, a root-path service's endpoint \"/\" included", () => {
        expect(serviceIdOfResourceRef("service:shop/orders/api")).toBe(orders);
        const root = serviceId({ project: "shop", integration: "orders", endpoint: "/" });
        expect(resourceRefOf({ serviceId: root } as never, "x")).toBe("service:shop/orders//");
        expect(serviceIdOfResourceRef("service:shop/orders//")).toBe(root);
        expect(parseServiceId(root)).toEqual({ project: "shop", integration: "orders", endpoint: "/" });
        expect(serviceIdOfResourceRef("service:shop/orders")).toBeUndefined();
        expect(serviceIdOfResourceRef("service:shop/orders/")).toBeUndefined();
    });

    it("finds a connection's own links of an endpoint by the configurables its code reads", () => {
        const orders = { project: "shop", component: "orders", endpoint: "api" };
        const billing = { project: "finance", component: "billing", endpoint: "api" };
        const links = [
            { configurable: "acme/basket:ServiceURL", ...orders },
            { configurable: "acme/basket:ServiceURL1", ...orders },
            { configurable: "acme/basket:BillingURL", ...billing, key: "url" },
            { configurable: "acme/basket:BillingKey", ...billing, key: "apiKey" },
        ];
        const configurablesOf = (endpoint: typeof orders, source: string) => endpointLinksReferencedBy(links, endpoint, source).map((link) => link.configurable);
        expect(configurablesOf(orders, "new ({}, ServiceURL1)")).toEqual(["acme/basket:ServiceURL1"]);
        expect(configurablesOf(orders, "check new (serviceUrl = ServiceURL)")).toEqual(["acme/basket:ServiceURL"]);
        expect(configurablesOf(orders, "new ('ServiceURL)")).toEqual(["acme/basket:ServiceURL"]);
        expect(configurablesOf(orders, "new (OtherURL)")).toEqual([]);
        // Another endpoint's links are never this one's, whatever the code reads.
        expect(configurablesOf(orders, "new ({apiKey: BillingKey}, BillingURL)")).toEqual([]);
        expect(configurablesOf(billing, "check new ({apiKey: BillingKey}, BillingURL)")).toEqual(["acme/basket:BillingURL", "acme/basket:BillingKey"]);
    });
});
