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


import { AvailableNode } from "@wso2/ballerina-core";
import {
    fetchConnectorActions,
    actionDisplayLabel,
    formatActionLabel,
    buildConnectionSelectField,
    normalizeConnectorSearchCategories,
    toResourcePathTemplate,
} from "./connectorActions";


const REDIS_CONNECTOR = {
    metadata: { label: "Redis", description: "Redis cache", icon: "redis.png" },
    codedata: {
        node: "NEW_CONNECTION",
        org: "ballerinax",
        module: "redis",
        object: "Client",
        symbol: "init",
        version: "3.1.0",
    },
    enabled: true,
} as unknown as AvailableNode;

const makeRpcClient = (docsResponse: unknown, spy?: jest.Mock) =>
    ({
        getLibraryBrowserRPCClient: () => ({
            getLibraryData: spy ?? jest.fn().mockResolvedValue(docsResponse),
        }),
    } as any);

const docsWith = (client: Record<string, unknown>, moduleId = "redis") => ({
    docsData: { modules: [{ id: moduleId, clients: [{ name: "Client", ...client }] }] },
});

describe("toResourcePathTemplate", () => {
    it.each([
        ["users/[string userId]/drafts", "/users/[userId]/drafts"],
        ["users/[string userId]/drafts/[string id]", "/users/[userId]/drafts/[id]"],
        ["users/[string userId]/messages/[string messageId]/attachments/[string id]",
            "/users/[userId]/messages/[messageId]/attachments/[id]"],
        ["users/[string userId]/profile", "/users/[userId]/profile"],
        ["/users/[userId]/drafts", "/users/[userId]/drafts"],
    ])("normalises %s", (docsPath, expected) => {
        expect(toResourcePathTemplate(docsPath)).toBe(expected);
    });

    it("maps a lone rest parameter to the LS's placeholder", () => {
        expect(toResourcePathTemplate("[PathParamType ...path]")).toBe("/path/to/subdirectory");
        expect(toResourcePathTemplate("[string... path]")).toBe("/path/to/subdirectory");
    });

    it("drops a trailing rest parameter from a segment list", () => {
        expect(toResourcePathTemplate("users/[string userId]/[string... rest]")).toBe("/users/[userId]");
    });

    it("maps a dot resource path and empties to /", () => {
        expect(toResourcePathTemplate(".")).toBe("/");
        expect(toResourcePathTemplate("")).toBe("/");
    });
});

describe("formatActionLabel", () => {
    it.each([
        ["append", "Append"],
        ["bitCount", "Bit count"],
        ["bitOpAnd", "Bit op and"],
        ["decrBy", "Decr by"],
        ["getRange", "Get range"],
        ["'commit", "Commit"],
        ["batch_execute", "Batch execute"],
        ["listBuckets", "List buckets"],
        ["createMultipartUpload", "Create multipart upload"],
    ])("formats %s as %s", (symbol, expected) => {
        expect(formatActionLabel(symbol)).toBe(expected);
    });

    it("keeps acronyms shouted", () => {
        expect(formatActionLabel("getHTTPResponse")).toBe("Get HTTP response");
        expect(formatActionLabel("createPresignedUrl")).toBe("Create presigned URL");
        expect(formatActionLabel("getObjectId")).toBe("Get object ID");
    });

    it("survives empty input", () => {
        expect(formatActionLabel("")).toBe("");
    });
});

describe("actionDisplayLabel", () => {
    it("formats an identifier label from the language server", () => {
        expect(actionDisplayLabel("listBuckets")).toBe("List buckets");
    });

    it.each([
        "Lists the drafts in the user's mailbox.",
        "get/users/[string userId]/drafts",
        "List buckets",
    ])("leaves %s alone", (label) => {
        expect(actionDisplayLabel(label)).toBe(label);
    });

    it("survives a missing label", () => {
        expect(actionDisplayLabel(undefined)).toBe("");
    });
});

describe("fetchConnectorActions", () => {
    it("maps remote methods to REMOTE_ACTION_CALL nodes with library codedata", async () => {
        const rpcClient = makeRpcClient(
            docsWith({ remoteMethods: [{ name: "append", description: "Append a value to a key." }] })
        );

        const actions = await fetchConnectorActions(rpcClient, REDIS_CONNECTOR);

        expect(actions).toHaveLength(1);
        expect(actions[0].metadata.label).toBe("Append");
        expect(actions[0].metadata.description).toBe("Append a value to a key.");
        expect(actions[0].codedata).toMatchObject({
            node: "REMOTE_ACTION_CALL",
            org: "ballerinax",
            module: "redis",
            object: "Client",
            symbol: "append",
            version: "3.1.0",
        });
    });

    it("maps resource methods to RESOURCE_ACTION_CALL and keeps the resource path", async () => {
        const rpcClient = makeRpcClient(
            docsWith({
                resourceMethods: [
                    {
                        name: "",
                        accessor: "get",
                        resourcePath: "users/[string userId]/drafts",
                        description: "Lists the drafts in the user's mailbox.",
                    },
                ],
            })
        );

        const actions = await fetchConnectorActions(rpcClient, REDIS_CONNECTOR);

        expect(actions).toHaveLength(1);
        expect(actions[0].codedata.node).toBe("RESOURCE_ACTION_CALL");
        expect(actions[0].codedata.resourcePath).toBe("/users/[userId]/drafts");
        expect(actions[0].codedata.symbol).toBe("get");
    });

    it("labels a resource action with its description, as the LS does", async () => {
        const rpcClient = makeRpcClient(
            docsWith({
                resourceMethods: [
                    {
                        name: "",
                        accessor: "delete",
                        resourcePath: "users/[string userId]/drafts/[string id]",
                        description:
                            "Immediately and permanently deletes the specified draft. Does not simply trash it.",
                    },
                ],
            })
        );

        const actions = await fetchConnectorActions(rpcClient, REDIS_CONNECTOR);

        expect(actions[0].metadata.label).toBe("Immediately and permanently deletes the specified draft.");
        expect(actions[0].metadata.description).toContain("Does not simply trash it.");
    });

    it("shows a rest path as a placeholder, not the LS's fake endpoint", async () => {
        const rpcClient = makeRpcClient(
            docsWith({ resourceMethods: [{ name: "", accessor: "post", resourcePath: "[PathParamType ...path]" }] })
        );

        const actions = await fetchConnectorActions(rpcClient, REDIS_CONNECTOR);

        expect(actions[0].codedata.resourcePath).toBe("/path/to/subdirectory");
        expect(actions[0].metadata.label).toBe("POST /[path...]");
    });

    it("falls back to the signature when a resource action has no description", async () => {
        const rpcClient = makeRpcClient(
            docsWith({
                resourceMethods: [{ name: "", accessor: "post", resourcePath: "users/[string userId]/drafts" }],
            })
        );

        const actions = await fetchConnectorActions(rpcClient, REDIS_CONNECTOR);

        expect(actions[0].metadata.label).toBe("POST /users/[userId]/drafts");
    });

    it("keeps different accessors on the same path apart", async () => {
        const rpcClient = makeRpcClient(
            docsWith({
                resourceMethods: [
                    { name: "", accessor: "get", resourcePath: "users/[string userId]/drafts", description: "List." },
                    { name: "", accessor: "post", resourcePath: "users/[string userId]/drafts", description: "Create." },
                ],
            })
        );

        const actions = await fetchConnectorActions(rpcClient, REDIS_CONNECTOR);

        expect(actions).toHaveLength(2);
        expect(actions.map((action) => action.codedata.symbol).sort()).toEqual(["get", "post"]);
    });

    it("skips a resource method with no accessor or no path", async () => {
        const rpcClient = makeRpcClient(
            docsWith({
                resourceMethods: [
                    { name: "", accessor: "", resourcePath: "users/drafts", description: "No accessor." },
                    { name: "", accessor: "get", resourcePath: "", description: "No path." },
                ],
            })
        );

        const actions = await fetchConnectorActions(rpcClient, REDIS_CONNECTOR);

        expect(actions).toHaveLength(0);
    });

    it("skips deprecated methods and de-duplicates", async () => {
        const rpcClient = makeRpcClient(
            docsWith({
                remoteMethods: [
                    { name: "append" },
                    { name: "append" },
                    { name: "oldWay", isDeprecated: true },
                ],
            })
        );

        const actions = await fetchConnectorActions(rpcClient, REDIS_CONNECTOR);

        expect(actions.map((action) => action.codedata.symbol)).toEqual(["append"]);
    });

    it("sorts actions by label so long lists are scannable", async () => {
        const rpcClient = makeRpcClient(
            docsWith({ remoteMethods: [{ name: "set" }, { name: "append" }, { name: "get" }] })
        );

        const actions = await fetchConnectorActions(rpcClient, REDIS_CONNECTOR);

        expect(actions.map((action) => action.metadata.label)).toEqual(["Append", "Get", "Set"]);
    });

    it("strips markup from descriptions", async () => {
        const rpcClient = makeRpcClient(
            docsWith({ remoteMethods: [{ name: "append", description: "<p>Append   a\nvalue.</p>" }] })
        );

        const actions = await fetchConnectorActions(rpcClient, REDIS_CONNECTOR);

        expect(actions[0].metadata.description).toBe("Append a value.");
    });

    it("falls back to any module's client for dotted modules", async () => {
        const rpcClient = makeRpcClient(docsWith({ remoteMethods: [{ name: "listBuckets" }] }, "s3"));

        const actions = await fetchConnectorActions(rpcClient, {
            ...REDIS_CONNECTOR,
            codedata: { ...REDIS_CONNECTOR.codedata, module: "aws.s3" },
        } as AvailableNode);

        expect(actions.map((action) => action.codedata.symbol)).toEqual(["listBuckets"]);
        expect(actions[0].codedata.module).toBe("aws.s3");
    });

    it("requests the connector's own coordinates", async () => {
        const spy = jest.fn().mockResolvedValue(docsWith({ remoteMethods: [{ name: "append" }] }));
        await fetchConnectorActions(makeRpcClient(undefined, spy), REDIS_CONNECTOR);
        expect(spy).toHaveBeenCalledWith({ orgName: "ballerinax", moduleName: "redis", version: "3.1.0" });
    });

    it("throws when the connector has no package coordinates", async () => {
        await expect(
            fetchConnectorActions(makeRpcClient(docsWith({})), {
                ...REDIS_CONNECTOR,
                codedata: { node: "NEW_CONNECTION" },
            } as AvailableNode)
        ).rejects.toThrow(/package coordinates/);
    });

    it("throws when docs contain no client", async () => {
        const rpcClient = makeRpcClient({ docsData: { modules: [{ id: "redis", clients: [] }] } });
        await expect(fetchConnectorActions(rpcClient, REDIS_CONNECTOR)).rejects.toThrow(/No client found/);
    });

    it("returns empty rather than throwing when the client has no methods", async () => {
        const rpcClient = makeRpcClient(docsWith({ remoteMethods: [], resourceMethods: [] }));
        await expect(fetchConnectorActions(rpcClient, REDIS_CONNECTOR)).resolves.toEqual([]);
    });
});

describe("normalizeConnectorSearchCategories", () => {
    const node = (label: string) =>
        ({ metadata: { label }, codedata: { node: "NEW_CONNECTION", module: label }, enabled: true } as any);

    it("wraps a flat node list in one category", () => {
        const result = normalizeConnectorSearchCategories([node("calendar"), node("gcalendar")]);
        expect(result).toHaveLength(1);
        expect(result[0].metadata.label).toBe("Search Results");
        expect(result[0].items).toHaveLength(2);
    });

    it("uses the supplied label for the wrapper", () => {
        const result = normalizeConnectorSearchCategories([node("calendar")], "Connectors");
        expect(result[0].metadata.label).toBe("Connectors");
    });

    it("passes categories through", () => {
        const categories = [{ metadata: { label: "SaaS" }, items: [node("calendar")] }] as any;
        expect(normalizeConnectorSearchCategories(categories)).toEqual(categories);
    });

    it("drops empty categories", () => {
        const result = normalizeConnectorSearchCategories([
            { metadata: { label: "Local" }, items: [] },
            { metadata: { label: "SaaS" }, items: [node("calendar")] },
        ] as any);
        expect(result.map((category) => category.metadata.label)).toEqual(["SaaS"]);
    });

    it("keeps both shapes when they are mixed", () => {
        const result = normalizeConnectorSearchCategories([
            { metadata: { label: "SaaS" }, items: [node("calendar")] },
            node("gcalendar"),
        ] as any);
        expect(result.map((category) => category.metadata.label)).toEqual(["SaaS", "Search Results"]);
    });

    it("ignores entries that are neither", () => {
        expect(normalizeConnectorSearchCategories([undefined, null, {}] as any)).toEqual([]);
        expect(normalizeConnectorSearchCategories(undefined)).toEqual([]);
    });
});

describe("buildConnectionSelectField", () => {
    const httpConnector = {
        node: "NEW_CONNECTION",
        org: "ballerina",
        packageName: "http",
        module: "http",
        object: "Client",
        version: "2.14.1",
    };

    it("is a reference select over existing connections", () => {
        const field = buildConnectionSelectField(httpConnector as any, "http:Client", "") as any;
        expect(field.key).toBe("connection");
        expect(field.hidden).toBe(false);
        expect(field.editable).toBe(true);
        expect(field.codedata.searchNodesKind).toBe("NEW_CONNECTION");
    });

    it("constrains candidates to the connector's exact client type", () => {
        const field = buildConnectionSelectField(httpConnector as any, "http:Client", "") as any;
        expect(field.codedata.targetType).toEqual({
            relation: "exact",
            org: "ballerina",
            packageName: "http",
            module: "http",
            name: "Client",
        });
    });

    it("omits the version from the type constraint", () => {
        const field = buildConnectionSelectField(httpConnector as any, "http:Client", "") as any;
        expect(field.codedata.targetType).not.toHaveProperty("version");
    });

    it("carries the connector codedata so 'Create New' builds the right connection", () => {
        const field = buildConnectionSelectField(httpConnector as any, "http:Client", "") as any;
        expect(field.codedata.data.connection).toEqual(httpConnector);
    });

    it("preselects a connection when one is supplied", () => {
        const field = buildConnectionSelectField(httpConnector as any, "http:Client", "httpClient") as any;
        expect(field.value).toBe("httpClient");
    });

    it("offers a raw expression as an alternative input mode", () => {
        const field = buildConnectionSelectField(httpConnector as any, "http:Client", "") as any;
        expect(field.types.map((t: any) => t.fieldType)).toEqual(["ACTION_EXPRESSION", "EXPRESSION"]);
        expect(field.types[0].selected).toBe(true);
    });

    it("omits the constraint when the connector lacks a client object", () => {
        const field = buildConnectionSelectField({ org: "x", module: "y" } as any, undefined, "") as any;
        expect(field.codedata.targetType).toBeUndefined();
    });
});
