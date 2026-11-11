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

import { NodeKindEnum, ObjectFunctionKind, SemanticDiff } from "@wso2/ballerina-core";

/**
 * Shared nodeKind wording for the review surfaces (ReviewMode + ReviewBar) — a deliberate
 * leaf module (no React/RPC) so both import one table instead of mirroring the LS enum twice.
 */
const NODE_KIND_LABELS: Record<number, string> = {
    [NodeKindEnum.MODULE_FUNCTION]: "function",
    [NodeKindEnum.TYPE_DEFINITION]: "type",
    [NodeKindEnum.DATA_MAPPING_FUNCTION]: "data mapping",
    [NodeKindEnum.MODULE_VARIABLE]: "variable",
    [NodeKindEnum.CONSTANT]: "constant",
    [NodeKindEnum.LISTENER]: "listener",
    [NodeKindEnum.CLASS_DEFINITION]: "class",
    [NodeKindEnum.ENUM_DECLARATION]: "enum",
    [NodeKindEnum.IMPORT_DECLARATION]: "import",
};

const OBJECT_FUNCTION_KIND_LABELS: Record<ObjectFunctionKind, string> = {
    resource: "resource",
    remote: "remote",
    init: "init",
    method: "method",
};

export function getNodeKindLabel(nodeKind: number, metadata?: SemanticDiff["metadata"]): string {
    if (nodeKind === NodeKindEnum.OBJECT_FUNCTION) {
        return OBJECT_FUNCTION_KIND_LABELS[getObjectFunctionKind(metadata)] ?? "method";
    }
    return NODE_KIND_LABELS[nodeKind] ?? "component";
}

/**
 * Kind of an OBJECT_FUNCTION diff. When an older LS sends no functionKind, it is inferred:
 * resources have an accessor and a resource path, and remote functions came with the function
 * name as the accessor and an empty resource path.
 */
export function getObjectFunctionKind(metadata?: SemanticDiff["metadata"]): ObjectFunctionKind {
    const m = metadata as { functionKind?: ObjectFunctionKind; accessor?: string; resourcePath?: string } | undefined;
    if (m?.functionKind) {
        return m.functionKind;
    }
    if (!m?.accessor) {
        return "method";
    }
    return m.resourcePath ? "resource" : "remote";
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
