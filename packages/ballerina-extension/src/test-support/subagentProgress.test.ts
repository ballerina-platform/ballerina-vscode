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

import { describeSubagentStep, describeSubagentToolCall } from "../features/ai/agent/subagents/progress";

describe("subagent progress wording", () => {
    it("words each Librarian tool call from its input", () => {
        expect(describeSubagentToolCall({ toolName: "library_search", input: { keywords: ["kafka", "consumer"] } })).toBe("searching Central for kafka, consumer");
        expect(describeSubagentToolCall({ toolName: "library_search", input: { keywords: "xlsx" } })).toBe("searching Central for xlsx");
        expect(describeSubagentToolCall({ toolName: "library_docs", input: { libraries: ["ballerina/ftp", "ballerina/data.csv", "ballerina/io"] } }))
            .toBe("rendering docs for ballerina/ftp, ballerina/data.csv and 1 more");
        expect(describeSubagentToolCall({ toolName: "docs_grep", input: { pattern: "x", library: "ballerina/jwt" } })).toBe("searching ballerina/jwt docs");
        expect(describeSubagentToolCall({ toolName: "docs_grep", input: { pattern: "x" } })).toBe("searching the docs");
        expect(describeSubagentToolCall({ toolName: "docs_read", input: { path: "/home/u/.ballerina/copilot/lib-docs/k/ballerinax__aws.sns.md", offset: 1 } }))
            .toBe("reading ballerinax/aws.sns docs");
        expect(describeSubagentToolCall({ toolName: "docs_read", input: { path: "ballerina__time.md" } })).toBe("reading ballerina/time docs");
        expect(describeSubagentToolCall({ toolName: "web_search", input: { query: "q" } })).toBe("searching the web");
        expect(describeSubagentToolCall({ toolName: "mystery" })).toBe("running mystery");
    });

    it("collapses a step's parallel calls to distinct phrases and numbers the step", () => {
        const step = describeSubagentStep([
            { toolName: "docs_grep", input: { library: "ballerina/ftp" } },
            { toolName: "docs_grep", input: { library: "ballerina/ftp" } },
            { toolName: "docs_read", input: { path: "ballerina__ftp.md" } },
        ], 4);
        expect(step).toEqual({ step: 4, activity: "searching ballerina/ftp docs, reading ballerina/ftp docs" });
        expect(describeSubagentStep([], 5)).toEqual({ step: 5, activity: "writing the report" });
    });
});
