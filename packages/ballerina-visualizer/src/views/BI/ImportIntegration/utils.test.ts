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

import { MigrationTool } from "@wso2/ballerina-core";
import { isMultiRootSelected, MULTI_ROOT_PARAM_KEY, resolveSourceLayoutParam } from "./utils";

type Param = MigrationTool["parameters"][number];

const boolParam = (key: string): Param => ({
    key,
    label: key,
    description: key,
    valueType: "boolean",
    defaultValue: false,
});

const tool = (parameters: Param[]): MigrationTool => ({
    id: 1,
    title: "MuleSoft",
    needToPull: false,
    commandName: "migrate-mule",
    description: "",
    requiredVersion: "1.0.0",
    parameters,
});

describe("resolveSourceLayoutParam", () => {
    it("picks multiRoot even when another boolean is declared first", () => {
        // The regression: migrate-mule declares `keepStructure` ahead of `multiRoot`, so a
        // positional "first boolean" lookup bound the Source Layout choice to the wrong
        // parameter — leaving multiRoot permanently false and making the tool treat a
        // multi-project codebase as a single project.
        const resolved = resolveSourceLayoutParam(
            tool([boolParam("keepStructure"), boolParam(MULTI_ROOT_PARAM_KEY)])
        );
        expect(resolved?.key).toBe(MULTI_ROOT_PARAM_KEY);
    });

    it("picks multiRoot regardless of where it is declared", () => {
        const resolved = resolveSourceLayoutParam(
            tool([boolParam(MULTI_ROOT_PARAM_KEY), boolParam("keepStructure")])
        );
        expect(resolved?.key).toBe(MULTI_ROOT_PARAM_KEY);
    });

    it("ignores non-boolean parameters that share no key", () => {
        const resolved = resolveSourceLayoutParam(
            tool([
                { key: "muleVersion", label: "", description: "", valueType: "enum", options: ["v3"] },
                boolParam(MULTI_ROOT_PARAM_KEY),
            ])
        );
        expect(resolved?.key).toBe(MULTI_ROOT_PARAM_KEY);
    });

    it("falls back to the first boolean for tools predating multiRoot", () => {
        const resolved = resolveSourceLayoutParam(tool([boolParam("legacyMultiProject")]));
        expect(resolved?.key).toBe("legacyMultiProject");
    });

    it("returns null when the tool declares no boolean", () => {
        expect(resolveSourceLayoutParam(tool([]))).toBeNull();
        expect(resolveSourceLayoutParam(null)).toBeNull();
        expect(resolveSourceLayoutParam(undefined)).toBeNull();
    });
});

describe("isMultiRootSelected", () => {
    const muleTool = tool([boolParam("keepStructure"), boolParam(MULTI_ROOT_PARAM_KEY)]);

    it("reads multiRoot, not the first-declared boolean", () => {
        // Exactly the reported failure: "Multiple Projects" chosen, keepStructure set,
        // multiRoot left false. The layout must NOT read as multi-project.
        expect(isMultiRootSelected(muleTool, { keepStructure: true, multiRoot: false })).toBe(false);
        expect(isMultiRootSelected(muleTool, { keepStructure: false, multiRoot: true })).toBe(true);
    });

    it("accepts the stringified booleans the tool metadata can carry", () => {
        expect(isMultiRootSelected(muleTool, { multiRoot: "true" })).toBe(true);
        expect(isMultiRootSelected(muleTool, { multiRoot: "false" })).toBe(false);
    });

    it("defaults to single project when the value is absent", () => {
        expect(isMultiRootSelected(muleTool, {})).toBe(false);
        expect(isMultiRootSelected(muleTool, undefined)).toBe(false);
        expect(isMultiRootSelected(null, { multiRoot: true })).toBe(false);
    });
});
