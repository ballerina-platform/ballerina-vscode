/**
 * Copyright (c) 2026, WSO2 LLC. (http://www.wso2.org).
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

// The real barrel pulls in a WebSocket LS client that jest cannot load, so stub it.
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

import { isWorkflowFunction } from "../utils/state-machine-utils";

// A function's syntax tree carries its annotations under metadata, each with an annotReference
// whose identifier is the annotation name and whose modulePrefix is the import alias, if any.
const annotated = (...annotations: Array<{ prefix?: string; name: string }>) => ({
    metadata: {
        annotations: annotations.map(({ prefix, name }) => ({
            annotReference: {
                identifier: { value: name },
                ...(prefix !== undefined ? { modulePrefix: { value: prefix } } : {}),
            },
        })),
    },
});

describe("isWorkflowFunction", () => {
    it("recognises a module-qualified Workflow annotation", () => {
        expect(isWorkflowFunction(annotated({ prefix: "workflow", name: "Workflow" }))).toBe(true);
        expect(isWorkflowFunction(annotated({ prefix: "wf", name: "Workflow" }))).toBe(true);
    });

    it("finds it among other annotations", () => {
        expect(isWorkflowFunction(annotated({ name: "display" }, { prefix: "workflow", name: "Workflow" }))).toBe(true);
    });

    it("does not count a bare Workflow annotation from the current module", () => {
        expect(isWorkflowFunction(annotated({ name: "Workflow" }))).toBe(false);
    });

    it("does not count other annotations from the workflow module", () => {
        expect(isWorkflowFunction(annotated({ prefix: "workflow", name: "Activity" }))).toBe(false);
    });

    it("is false without annotations or metadata", () => {
        expect(isWorkflowFunction(annotated())).toBe(false);
        expect(isWorkflowFunction({ metadata: {} })).toBe(false);
        expect(isWorkflowFunction({})).toBe(false);
        expect(isWorkflowFunction(undefined)).toBe(false);
    });
});
