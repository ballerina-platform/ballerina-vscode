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

import { NodeKindEnum, SemanticDiff } from "@wso2/ballerina-core";

/**
 * Shared nodeKind wording for the review surfaces (ReviewMode + ReviewBar) — a deliberate
 * leaf module (no React/RPC) so both import one table instead of mirroring the LS enum twice.
 */
const NODE_KIND_LABELS: Record<number, string> = {
    [NodeKindEnum.MODULE_FUNCTION]: "function",
    [NodeKindEnum.OBJECT_FUNCTION]: "resource",
    [NodeKindEnum.TYPE_DEFINITION]: "type",
    [NodeKindEnum.DATA_MAPPING_FUNCTION]: "data mapping",
    [NodeKindEnum.MODULE_VARIABLE]: "variable",
    [NodeKindEnum.CONSTANT]: "constant",
    [NodeKindEnum.LISTENER]: "listener",
    [NodeKindEnum.CLASS_DEFINITION]: "class",
    [NodeKindEnum.ENUM_DECLARATION]: "enum",
    [NodeKindEnum.IMPORT_DECLARATION]: "import",
};

export function getNodeKindLabel(nodeKind: number, metadata?: SemanticDiff["metadata"]): string {
    // OBJECT_FUNCTION covers both service resource/remote members and plain class
    // methods; only the former carry resource metadata (accessor/servicePath).
    if (nodeKind === NodeKindEnum.OBJECT_FUNCTION
        && !(metadata as { accessor?: string } | undefined)?.accessor) {
        return "method";
    }
    return NODE_KIND_LABELS[nodeKind] ?? "component";
}

/**
 * Construct kinds with no diagram representation, rendered as before/after source blocks.
 * Explicit membership on purpose: an ordinal-range check would silently misrender a future
 * kind appended after these that DOES have a diagram.
 */
export const SOURCE_VIEW_KINDS: ReadonlySet<number> = new Set([
    NodeKindEnum.MODULE_VARIABLE,
    NodeKindEnum.CONSTANT,
    NodeKindEnum.LISTENER,
    NodeKindEnum.CLASS_DEFINITION,
    NodeKindEnum.ENUM_DECLARATION,
    NodeKindEnum.IMPORT_DECLARATION,
]);
