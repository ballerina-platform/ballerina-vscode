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
    formatActionLabel,
    OAUTH_GROUP,
    TOOL_INPUT_GROUP,
    buildConnectionSelectField,
    buildToolFormGroups,
    getExistingToolNames,
    resourceToolNameSeed,
    suggestToolName,
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

// Must equal FunctionDataBuilder.buildResourcePathTemplate, which getNodeTemplate compares by
// string equality — a mismatch fails with "Function symbol not found".
describe("toResourcePathTemplate", () => {
    it.each([
        ["users/[string userId]/drafts", "/users/[userId]/drafts"],
        ["users/[string userId]/drafts/[string id]", "/users/[userId]/drafts/[id]"],
        ["users/[string userId]/messages/[string messageId]/attachments/[string id]",
            "/users/[userId]/messages/[messageId]/attachments/[id]"],
        ["users/[string userId]/profile", "/users/[userId]/profile"],
        // Already-normalised input is left alone.
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

describe("resourceToolNameSeed", () => {
    it("names after the last path segment, not just the accessor", () => {
        expect(resourceToolNameSeed("post", "/users/[userId]/labels")).toBe("postLabels");
        expect(resourceToolNameSeed("get", "/users/[userId]/drafts")).toBe("getDrafts");
    });

    it("walks back past trailing path parameters", () => {
        expect(resourceToolNameSeed("get", "/users/[userId]/labels/[id]")).toBe("getLabels");
        expect(resourceToolNameSeed("get", "/users/[userId]/messages/[messageId]/attachments/[id]"))
            .toBe("getAttachments");
    });

    it("keeps GET and POST on one path distinct", () => {
        const get = resourceToolNameSeed("get", "/users/[userId]/labels");
        const post = resourceToolNameSeed("post", "/users/[userId]/labels");
        expect(get).not.toBe(post);
    });

    // Edge cases where there is no usable segment — fall back to the accessor rather than
    // inventing a misleading name.
    it.each([
        ["a rest-path placeholder", "post", "/path/to/subdirectory", "post"],
        ["a dot resource path", "get", "/", "get"],
        ["an empty path", "get", "", "get"],
        ["only path parameters", "delete", "/[userId]/[id]", "delete"],
        ["segments with no alphanumerics", "put", "/[userId]/---", "put"],
    ])("falls back to the accessor for %s", (_case, accessor, path, expected) => {
        expect(resourceToolNameSeed(accessor, path)).toBe(expected);
    });

    it("survives segments that are not bare identifiers", () => {
        // suggestToolName strips the punctuation; the seed only has to preserve the words.
        expect(suggestToolName(resourceToolNameSeed("get", "/v1.0/user-profile"), [])).toBe("getUserProfileTool");
        expect(suggestToolName(resourceToolNameSeed("get", "/users/'limit"), [])).toBe("getLimitTool");
    });

    it("produces a usable name when the segment starts with a digit", () => {
        expect(suggestToolName(resourceToolNameSeed("post", "/auth/2fa"), [])).toBe("post2faTool");
    });

    it("still yields a name with no accessor at all", () => {
        expect(suggestToolName(resourceToolNameSeed("", "/users/[userId]/labels"), [])).toBe("labelsTool");
    });
});

describe("formatActionLabel", () => {
    // Must match the labels the LS produces for a bound connection.
    it.each([
        ["append", "Append"],
        ["bitCount", "Bit Count"],
        ["bitOpAnd", "Bit Op And"],
        ["decrBy", "Decr By"],
        ["getRange", "Get Range"],
        ["'commit", "Commit"],
        ["batch_execute", "Batch Execute"],
    ])("formats %s as %s", (symbol, expected) => {
        expect(formatActionLabel(symbol)).toBe(expected);
    });

    it("keeps acronyms readable", () => {
        expect(formatActionLabel("getHTTPResponse")).toBe("Get HTTP Response");
    });

    it("survives empty input", () => {
        expect(formatActionLabel("")).toBe("");
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
        // The shape getNodeTemplate needs with no connection present.
        expect(actions[0].codedata).toMatchObject({
            node: "REMOTE_ACTION_CALL",
            org: "ballerinax",
            module: "redis",
            object: "Client",
            symbol: "append",
            version: "3.1.0",
        });
    });

    // Real payloads give resource methods an empty `name` — identity is accessor + resourcePath.
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
        // Normalised to the LS's template form, not the docs form.
        expect(actions[0].codedata.resourcePath).toBe("/users/[userId]/drafts");
        // The accessor is what codedata.symbol holds for a resource action.
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

        // First sentence only; the rest stays in description for the tooltip.
        expect(actions[0].metadata.label).toBe("Immediately and permanently deletes the specified draft.");
        expect(actions[0].metadata.description).toContain("Does not simply trash it.");
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
        // aws.s3 docs come back under a single module whose id may not match exactly.
        const rpcClient = makeRpcClient(docsWith({ remoteMethods: [{ name: "listBuckets" }] }, "s3"));

        const actions = await fetchConnectorActions(rpcClient, {
            ...REDIS_CONNECTOR,
            codedata: { ...REDIS_CONNECTOR.codedata, module: "aws.s3" },
        } as AvailableNode);

        expect(actions.map((action) => action.codedata.symbol)).toEqual(["listBuckets"]);
        // Codedata must keep the real module, not the docs module id.
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

    // What keeps a Redis client out of an HTTP action's dropdown.
    it("constrains candidates to the connector's exact client type", () => {
        const field = buildConnectionSelectField(httpConnector as any, "http:Client", "") as any;
        expect(field.codedata.targetType).toEqual({
            relation: "exact",
            org: "ballerina",
            packageName: "http",
            module: "http",
            name: "Client",
            version: "2.14.1",
        });
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

describe("buildToolFormGroups", () => {
    const input = (over: Record<string, unknown> = {}) =>
        ({ group: TOOL_INPUT_GROUP, optional: false, value: "key", ...over }) as any;
    const oauth = (over: Record<string, unknown> = {}) =>
        ({ group: OAUTH_GROUP, optional: true, value: "", ...over }) as any;

    it("collapses inputs when every required mapping is prefilled", () => {
        const [inputs] = buildToolFormGroups([input(), input({ value: "value" })]);
        expect(inputs.id).toBe(TOOL_INPUT_GROUP);
        expect(inputs.defaultCollapsed).toBe(true);
    });

    // SQL queries are blanked on purpose; hiding one would make Save fail unseen.
    it("opens inputs expanded when a required mapping is empty", () => {
        const [inputs] = buildToolFormGroups([input(), input({ value: "" })]);
        expect(inputs.defaultCollapsed).toBe(false);
    });

    it("treats an undefined value as unfilled", () => {
        const [inputs] = buildToolFormGroups([input({ value: undefined })]);
        expect(inputs.defaultCollapsed).toBe(false);
    });

    it("ignores optional empty fields", () => {
        const [inputs] = buildToolFormGroups([input(), input({ optional: true, value: "" })]);
        expect(inputs.defaultCollapsed).toBe(true);
    });

    it("ignores hidden fields when deciding to expand", () => {
        const [inputs] = buildToolFormGroups([input(), input({ value: "", hidden: true })]);
        expect(inputs.defaultCollapsed).toBe(true);
    });

    it("always collapses OAuth, whose fields are all optional", () => {
        const groups = buildToolFormGroups([input(), oauth()]);
        expect(groups.map((group) => group.id)).toEqual([TOOL_INPUT_GROUP, OAUTH_GROUP]);
        expect(groups[1].defaultCollapsed).toBe(true);
    });

    it("omits a group with no visible fields", () => {
        expect(buildToolFormGroups([oauth()]).map((g) => g.id)).toEqual([OAUTH_GROUP]);
        expect(buildToolFormGroups([oauth({ hidden: true })])).toEqual([]);
        expect(buildToolFormGroups([])).toEqual([]);
    });

    it("ignores ungrouped fields", () => {
        expect(buildToolFormGroups([{ optional: false, value: "" } as any])).toEqual([]);
    });
});

describe("suggestToolName", () => {
    it("derives a tool name from the action symbol", () => {
        expect(suggestToolName("append", [])).toBe("appendTool");
    });

    it("uniquifies against names already used by the agent", () => {
        expect(suggestToolName("append", ["appendTool"])).toBe("appendTool2");
        expect(suggestToolName("append", ["appendTool", "appendTool2"])).toBe("appendTool3");
    });

    it("does not double up when the symbol already ends in tool", () => {
        expect(suggestToolName("searchTool", [])).toBe("searchTool");
    });

    it("lower-cases the leading character", () => {
        expect(suggestToolName("BatchExecute", [])).toBe("batchExecuteTool");
    });

    it("strips characters that are illegal in identifiers", () => {
        expect(suggestToolName("get-range!", [])).toBe("getRangeTool");
    });

    it("falls back for unusable symbols", () => {
        expect(suggestToolName("***", [])).toBe("newTool");
    });
});

describe("getExistingToolNames", () => {
    it("parses the agent's tools array literal", () => {
        const agentNode = { properties: { tools: { value: "[sumTool, appendTool]" } } };
        expect(getExistingToolNames(agentNode as any)).toEqual(["sumTool", "appendTool"]);
    });

    it("handles an array value", () => {
        const agentNode = { properties: { tools: { value: ["sumTool"] } } };
        expect(getExistingToolNames(agentNode as any)).toEqual(["sumTool"]);
    });

    it("handles an empty list and a missing agent", () => {
        expect(getExistingToolNames({ properties: { tools: { value: "[]" } } } as any)).toEqual([]);
        expect(getExistingToolNames(undefined)).toEqual([]);
    });
});
