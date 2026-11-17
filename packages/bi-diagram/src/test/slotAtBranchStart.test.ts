/**
 * @jest-environment node
 */
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

// The slot helpers are plain functions; keep the canvas library, which needs a browser, out of the node run.
jest.mock("../components/NodeLink", () => ({}));
jest.mock("../components/nodes/EmptyNode", () => ({}));
jest.mock("../resources/constants", () => ({}));
jest.mock("../utils/node", () => ({}));

import { slotAtBranchStart } from "../visitors/LinkTargetVisitor";
import { Branch } from "../utils/types";

// A fork worker as the LS reports it: the branch starts at the `worker` keyword and its sourceCode is the worker.
const worker = (sourceCode: string, startOffset = 8): Branch =>
    ({
        label: "worker1",
        kind: "WORKER",
        codedata: {
            node: "WORKER",
            sourceCode,
            lineRange: { fileName: "agents.bal", startLine: { line: 10, offset: startOffset }, endLine: { line: 11, offset: 9 } },
        },
        children: [],
    } as unknown as Branch);

describe("slotAtBranchStart for fork workers", () => {
    // Just after the `{` that ends `worker worker1 {`, i.e. inside the worker's body.
    const insideBody = { line: 10, offset: 8 + "worker worker1 {".length };

    it("lands inside the worker body with LF line endings", () => {
        expect(slotAtBranchStart(worker("worker worker1 {\n        }"))).toEqual(insideBody);
    });

    it("lands inside the worker body with CRLF line endings", () => {
        // Was the worker's own start: the statement went into the fork block, outside every worker.
        expect(slotAtBranchStart(worker("worker worker1 {\r\n        }"))).toEqual(insideBody);
    });

    it("skips braces that do not end the header line", () => {
        const annotated = "@strand {thread: \"any\"} worker worker1 {\r\n        }";
        expect(slotAtBranchStart(worker(annotated))).toEqual({ line: 10, offset: 8 + annotated.indexOf("{\r\n") + 1 });
    });
});
