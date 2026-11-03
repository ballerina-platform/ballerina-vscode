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

import { Flow, ParentMetadata, SemanticDiff } from "@wso2/ballerina-core";
import { getObjectFunctionKind } from "./nodeKindLabels";

// Checks that a flow model loaded for a review item is the function its semantic diff names.
// Kept free of React/RPC imports so it can be unit-tested.

export type ExpectedFlowMetadata = Pick<SemanticDiff, "nodeKind" | "metadata">;

const NODE_KIND_FUNCTION = 0;
const NODE_KIND_RESOURCE = 1;

export function getEventStartData(flow: Flow): ParentMetadata | undefined {
    const eventStartNode = flow?.nodes?.find((node) => node.codedata?.node === "EVENT_START");
    return eventStartNode?.metadata?.data as ParentMetadata | undefined;
}

function normalizeResourcePath(path?: string): string {
    const normalized = (path ?? "").trim().replace(/\s+/g, "");
    return normalized === "/" || normalized.startsWith("/") ? normalized : `/${normalized}`;
}

export function metadataMatchesExpected(flow: Flow, expected?: ExpectedFlowMetadata): boolean {
    if (!expected?.metadata) {
        return true;
    }

    const data = getEventStartData(flow);
    if (!data) {
        return false;
    }

    if (expected.nodeKind === NODE_KIND_RESOURCE) {
        const metadata = expected.metadata as { accessor?: string; resourcePath?: string; name?: string };
        if (getObjectFunctionKind(expected.metadata) === "resource") {
            if (!metadata.accessor || !metadata.resourcePath) {
                return true;
            }
            return data.isServiceFunction === true
                && (data.accessor ?? "").toLowerCase() === (metadata.accessor ?? "").toLowerCase()
                && normalizeResourcePath(data.label) === normalizeResourcePath(metadata.resourcePath);
        }
        if (!metadata.name) {
            return true;
        }
        // Class method names are qualified as `Class.method`; the flow label is the bare name.
        const name = metadata.name.slice(metadata.name.indexOf(".") + 1);
        return data.isServiceFunction === true && data.label === name;
    }

    if (expected.nodeKind === NODE_KIND_FUNCTION) {
        const metadata = expected.metadata as { name?: string };
        if (!metadata.name) {
            return true;
        }
        return data.isServiceFunction !== true && data.label === metadata.name;
    }

    return true;
}

// The old-version lookup can reuse a modified-tree position. Reject the pair
// when either side resolves to a different semantic item.
export function isSameExpectedFunction(oldFlow: Flow, newFlow: Flow, expected?: ExpectedFlowMetadata): boolean {
    if (!metadataMatchesExpected(oldFlow, expected) || !metadataMatchesExpected(newFlow, expected)) {
        return false;
    }

    const oldData = getEventStartData(oldFlow);
    const newData = getEventStartData(newFlow);
    if (!oldData || !newData) {
        return false;
    }

    return oldData.label === newData.label && oldData.accessor === newData.accessor;
}
