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

import type { FlowNode, ProjectStructureArtifactResponse } from "@wso2/ballerina-core";
import type { ConnectionKind } from "../../../components/ConnectionSelector/types";
import { resolveCreatedVariable } from "../../../components/ConnectionSelector/createdConnection";

const connectionKinds: ConnectionKind[] = [
    "MODEL_PROVIDER",
    "VECTOR_STORE",
    "EMBEDDING_PROVIDER",
    "CHUNKER",
    "SHORT_TERM_MEMORY_STORE",
];

describe("created connection variable", () => {
    it.each(connectionKinds)("%s -> uses the generated declaration name for autofill", (kind) => {
        const targetWithoutKindSpecificProperties = { codedata: {}, properties: {} } as FlowNode;
        const staleArtifacts = [{ name: "unrelated", isNew: false }] as ProjectStructureArtifactResponse[];

        expect(resolveCreatedVariable(`${kind.toLowerCase()}Connection`, targetWithoutKindSpecificProperties, staleArtifacts))
            .toBe(`${kind.toLowerCase()}Connection`);
    });

    it("keeps the legacy model-target and new-artifact fallbacks", () => {
        const modelTarget = { properties: { modelProvider: { value: "modelProvider" } } } as unknown as FlowNode;
        expect(resolveCreatedVariable(undefined, modelTarget)).toBe("modelProvider");

        const emptyTarget = { properties: {} } as FlowNode;
        const artifacts = [{ name: "createdConnection", isNew: true }] as ProjectStructureArtifactResponse[];
        expect(resolveCreatedVariable(undefined, emptyTarget, artifacts)).toBe("createdConnection");
    });
});
