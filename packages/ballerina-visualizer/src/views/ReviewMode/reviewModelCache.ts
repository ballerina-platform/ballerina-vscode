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

import { CDModel, ChangeTypeEnum, ExpandedDMModel, Flow, LinePosition, NodePosition, Type } from "@wso2/ballerina-core";
import { BallerinaRpcClient } from "@wso2/ballerina-rpc-client";
import { STKindChecker, STNode } from "@wso2/syntax-tree";
import { getFlowLookupPosition } from "./position-utils";
import { toComparablePath } from "./path-utils";

/**
 * Review-session-scoped cache of LS model fetches, keyed by view identity + version.
 *
 * Review content is frozen while a review is open, so any model fetched once stays
 * valid for the whole session. The cache lives in ReviewMode (not in the per-item
 * diagram components, which are remounted on every prev/next navigation and on the
 * Old/New toggle for type/design views) so that navigating back to an already-seen
 * item, or flipping the toggle, never re-hits the LS.
 *
 * Promises (not resolved values) are cached so concurrent requests for the same
 * model — e.g. a prefetch racing the mounted component's own fetch — collapse into
 * one LS round trip. A rejected fetch evicts itself so an error never becomes sticky.
 */
export type ReviewModelCache = Map<string, Promise<unknown>>;

export function getOrFetch<T>(cache: ReviewModelCache, key: string, fetch: () => Promise<T>): Promise<T> {
    const existing = cache.get(key);
    if (existing) {
        return existing as Promise<T>;
    }
    const promise = fetch();
    cache.set(key, promise);
    promise.catch(() => {
        if (cache.get(key) === promise) {
            cache.delete(key);
        }
    });
    return promise;
}

/**
 * Which versions of a file structurally exist for a semantic-diff change type.
 * Single source of truth for the toggle availability (ReviewMode), the diff-mode
 * fetch branching (ReadonlyFlowDiagram), and prefetching below.
 */
export function getVersionsForChangeType(changeType: number): { old: boolean; new: boolean } {
    switch (changeType) {
        case ChangeTypeEnum.ADDITION:
            return { old: false, new: true };
        case ChangeTypeEnum.DELETION:
            return { old: true, new: false };
        default:
            return { old: true, new: true };
    }
}

export interface FlowVersionParams {
    filePath: string;
    position: NodePosition;
    oldPosition?: NodePosition;
    /** true reads the frozen original (ai://); false reads the live edits (file://). */
    useFileSchema: boolean;
}

function positionKey(position?: NodePosition): string {
    if (!position) {
        return "";
    }
    return `${position.startLine}:${position.startColumn}:${position.endLine}:${position.endColumn}`;
}

/**
 * Fetch one version of the enclosing function's flow model (enclosed-function lookup
 * followed by the flow-model request), deduped through the session cache.
 */
export function fetchFlowModelVersion(
    rpcClient: BallerinaRpcClient,
    cache: ReviewModelCache,
    params: FlowVersionParams
): Promise<Flow | null> {
    const { filePath, position, oldPosition, useFileSchema } = params;
    const key = `flow:${filePath}:${positionKey(position)}:${positionKey(oldPosition)}:${useFileSchema}`;
    return getOrFetch(cache, key, async () => {
        const lookupPosition = getFlowLookupPosition(position, oldPosition, useFileSchema);

        // First resolve the full function range using getEnclosedFunction,
        // since the position from semantic diff may only cover the changed statement
        const enclosedFn = await rpcClient.getBIDiagramRpcClient().getEnclosedFunction({
            filePath,
            position: { line: lookupPosition.startLine, offset: lookupPosition.startColumn },
            useFileSchema,
        });
        const startLine = enclosedFn?.startLine ?? {
            line: lookupPosition.startLine,
            offset: lookupPosition.startColumn,
        };
        const endLine = enclosedFn?.endLine ?? {
            line: lookupPosition.endLine,
            offset: lookupPosition.endColumn,
        };

        const response = await rpcClient.getBIDiagramRpcClient().getFlowModel({
            filePath,
            startLine,
            endLine,
            useFileSchema,
        });
        return response?.flowModel ?? null;
    });
}

export interface DataMapperVersionParams {
    filePath: string;
    position: NodePosition;
    name: string;
}

/**
 * The LS reads input ports from the symbols visible at this position, and a function's parameters
 * are not in scope yet at its own `function` keyword — so the body's expression is what to ask about.
 */
async function fetchMappingExprPosition(
    rpcClient: BallerinaRpcClient,
    uri: string,
    startLine: LinePosition,
    endLine: LinePosition
): Promise<LinePosition> {
    try {
        const st = await rpcClient.getLangClientRpcClient().getSTByRange({
            documentIdentifier: { uri: uri.replace(/^ai:\/\//i, "file://") },
            lineRange: {
                start: { line: startLine.line, character: startLine.offset },
                end: { line: endLine.line, character: endLine.offset },
            },
        });
        const node = (st as { syntaxTree?: STNode })?.syntaxTree;
        if (node && STKindChecker.isFunctionDefinition(node) && STKindChecker.isExpressionFunctionBody(node.functionBody)) {
            const exprPosition = node.functionBody.expression.position;
            return { line: exprPosition.startLine, offset: exprPosition.startColumn };
        }
    } catch (error) {
        console.error("[Reviewing Changes] Could not resolve the mapping expression position:", error);
    }
    return startLine;
}

/**
 * Fetch the data-mapping function's expanded model, deduped through the session cache. Only the live
 * version: the LS's data-mapper service holds the live workspace manager alone, so the frozen `ai://`
 * baseline has no model to serve.
 */
export function fetchDataMapperModelVersion(
    rpcClient: BallerinaRpcClient,
    cache: ReviewModelCache,
    params: DataMapperVersionParams
): Promise<ExpandedDMModel | null> {
    const { filePath, position, name } = params;
    const key = `dataMapper:${filePath}:${positionKey(position)}`;
    return getOrFetch(cache, key, async () => {
        // The LS finds the node from this range and unwraps the `=> expr` body itself, so it wants
        // the whole declaration.
        const enclosedFn = await rpcClient.getBIDiagramRpcClient().getEnclosedFunction({
            filePath,
            position: { line: position.startLine, offset: position.startColumn },
            useFileSchema: false,
        });
        const startLine = enclosedFn?.startLine ?? { line: position.startLine, offset: position.startColumn };
        const endLine = enclosedFn?.endLine ?? { line: position.endLine, offset: position.endColumn };

        // Unlike the flow-model endpoints, the data-mapper ones resolve this with a bare
        // `Path.of(...)`, so they need a plain OS path and never a URI.
        const dataMapperFilePath = toComparablePath(filePath);
        const modelResponse = await rpcClient.getDataMapperRpcClient().getDataMapperModel({
            filePath: dataMapperFilePath,
            codedata: { lineRange: { fileName: dataMapperFilePath, startLine, endLine } },
            position: await fetchMappingExprPosition(rpcClient, filePath, startLine, endLine),
            targetField: name,
        });
        const { mappingsModel } = modelResponse ?? {};
        if (!mappingsModel) {
            console.error("[Reviewing Changes] The language server returned no data mapper model:", modelResponse);
            return null;
        }
        if (!("refs" in mappingsModel)) {
            return mappingsModel;
        }
        const expanded = await rpcClient.getDataMapperRpcClient().getExpandedDMFromDMModel({
            model: mappingsModel,
            rootViewId: name,
        });
        return expanded?.success ? expanded.expandedModel : null;
    });
}

/** Fetch the type-diagram model for one version, deduped through the session cache. */
export function fetchTypesModel(
    rpcClient: BallerinaRpcClient,
    cache: ReviewModelCache,
    filePath: string,
    useFileSchema: boolean | undefined
): Promise<Type[] | null> {
    const key = `types:${filePath}:${useFileSchema === true}`;
    return getOrFetch(cache, key, async () => {
        const response = await rpcClient.getBIDiagramRpcClient().getTypes({ filePath, useFileSchema });
        return response?.types ?? null;
    });
}

/** Fetch the design/component model for one version, deduped through the session cache. */
export function fetchDesignModel(
    rpcClient: BallerinaRpcClient,
    cache: ReviewModelCache,
    projectPath: string,
    useFileSchema: boolean | undefined
): Promise<CDModel | null> {
    const key = `design:${projectPath}:${useFileSchema === true}`;
    return getOrFetch(cache, key, async () => {
        const response = await rpcClient.getBIDiagramRpcClient().getDesignModel({ projectPath, useFileSchema });
        return response?.designModel ?? null;
    });
}

/** The structural subset of ReviewMode's ReviewView that prefetching needs. */
export interface PrefetchableReviewView {
    /** DiagramType value: "flow" | "type" | "component" | "source" | "dataMapper". */
    type: string;
    filePath: string;
    position: NodePosition;
    oldPosition?: NodePosition;
    projectPath: string;
    changeType: number;
    name?: string;
}

/**
 * Warms the session cache with what a view fetches when it first mounts, so navigating
 * to it lands on an already-resolved model. Lives next to the fetchers on purpose: the
 * per-view-kind fetch shape is this module's knowledge, not ReviewMode's.
 *
 * Only the versions shown by each view's initial mode are warmed — flow opens in diff
 * mode (both versions per its change type); type/component open in "new" and fetch
 * "old" on demand when toggled; source views carry their content in the diff metadata.
 * A failed prefetch evicts itself from the cache (see getOrFetch). The returned promise
 * settles when the view's fetches settle (never rejects) so callers can pace a sweep.
 */
export function prefetchReviewView(
    rpcClient: BallerinaRpcClient,
    cache: ReviewModelCache,
    view: PrefetchableReviewView | undefined
): Promise<void> {
    if (!view) {
        return Promise.resolve();
    }
    const fetches: Promise<unknown>[] = [];
    switch (view.type) {
        case "flow": {
            const versions = getVersionsForChangeType(view.changeType);
            const params = { filePath: view.filePath, position: view.position, oldPosition: view.oldPosition };
            if (versions.new) {
                fetches.push(fetchFlowModelVersion(rpcClient, cache, { ...params, useFileSchema: false }));
            }
            if (versions.old) {
                fetches.push(fetchFlowModelVersion(rpcClient, cache, { ...params, useFileSchema: true }));
            }
            break;
        }
        case "type":
            fetches.push(fetchTypesModel(rpcClient, cache, view.filePath, false));
            break;
        case "component":
            fetches.push(fetchDesignModel(rpcClient, cache, view.projectPath, false));
            break;
        case "dataMapper":
            fetches.push(fetchDataMapperModelVersion(rpcClient, cache, {
                filePath: view.filePath,
                position: view.position,
                name: view.name ?? "",
            }));
            break;
        default:
            break;
    }
    return Promise.allSettled(fetches).then((): void => undefined);
}
