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

jest.mock("@wso2/ballerina-core", () => ({
    MACHINE_VIEW: {},
    DIRECTORY_MAP: {},
    EVENT_TYPE: {},
    FOCUS_FLOW_DIAGRAM_VIEW: {},
    isSamePath: (a: string, b: string) => a === b,
}));

jest.mock("../stateMachine", () => ({
    StateMachine: { context: jest.fn() },
    openView: jest.fn(),
}));

import { NodePosition, ProjectStructureArtifactResponse } from "@wso2/ballerina-core";
import { pickClosestArtifact } from "../utils/state-machine-utils";

const at = (startLine: number): NodePosition => ({ startLine, startColumn: 4, endLine: startLine + 5, endColumn: 5 });

const artifact = (id: string, path: string, startLine?: number): ProjectStructureArtifactResponse =>
    ({ id, name: "onConsumerRecord", path, type: "RESOURCE", position: startLine === undefined ? undefined : at(startLine) } as ProjectStructureArtifactResponse);

describe("pickClosestArtifact (issue #322)", () => {
    const a10 = artifact("a10", "a.bal", 10);
    const a30 = artifact("a30", "a.bal", 30);
    const b10 = artifact("b10", "b.bal", 10);
    const aNoPosition = artifact("aNoPosition", "a.bal");

    it.each<[string, ProjectStructureArtifactResponse[], string | undefined, NodePosition | undefined, string | undefined]>([
        ["no candidates", [], "a.bal", at(10), undefined],
        ["single candidate", [b10], "a.bal", at(10), "b10"],
        ["same file, closest start line", [a10, a30], "a.bal", at(28), "a30"],
        ["same line in two files prefers the document", [b10, a10], "a.bal", at(10), "a10"],
        ["no candidate in the document falls back to all", [a10, a30], "c.bal", at(29), "a30"],
        ["no position picks the first in the document", [b10, a30, a10], "a.bal", undefined, "a30"],
        ["candidate without position loses", [aNoPosition, a30], "a.bal", at(10), "a30"],
        ["shift beyond half the gap picks the wrong one", [artifact("a22", "a.bal", 22), artifact("b42", "a.bal", 42)], "a.bal", at(30), "a22"],
    ])("%s", (_, candidates, documentUri, position, expected) => {
        expect(pickClosestArtifact(candidates, documentUri, position)?.id).toBe(expected);
    });
});
