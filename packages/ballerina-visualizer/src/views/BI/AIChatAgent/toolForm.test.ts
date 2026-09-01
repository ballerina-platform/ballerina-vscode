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


import {
    INCLUDE_CONTEXT_KEY,
    OAUTH_GROUP,
    TOOL_INPUT_GROUP,
    buildIncludeContextField,
    buildToolFormGroups,
    getExistingToolNames,
    resourceToolNameSeed,
    suggestToolName,
} from "./toolForm";

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

    it("keeps inputs collapsed for the optional context flag alone", () => {
        const [inputs] = buildToolFormGroups([buildIncludeContextField(TOOL_INPUT_GROUP) as any]);
        expect(inputs.id).toBe(TOOL_INPUT_GROUP);
        expect(inputs.defaultCollapsed).toBe(true);
    });
});

describe("buildIncludeContextField", () => {
    it("is an optional, unchecked FLAG in the inputs card", () => {
        const field = buildIncludeContextField(TOOL_INPUT_GROUP);
        expect(field.key).toBe(INCLUDE_CONTEXT_KEY);
        expect(field.type).toBe("FLAG");
        expect(field.value).toBe(false);
        expect(field.optional).toBe(true);
        expect(field.group).toBe(TOOL_INPUT_GROUP);
    });

    it("declares exactly one type", () => {
        expect(buildIncludeContextField(TOOL_INPUT_GROUP).types).toEqual([{ fieldType: "FLAG", selected: true }]);
    });

    it("omits the group when a form has no card to host it", () => {
        expect(buildIncludeContextField()).not.toHaveProperty("group");
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
