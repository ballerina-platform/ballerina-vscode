/**
 * Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
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

import React, { useEffect, useRef, useState } from "react";
import { ChangeTypeEnum, Flow, NodePosition, ParentMetadata, SemanticDiff } from "@wso2/ballerina-core";
import styled from "@emotion/styled";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { ProgressRing, ThemeColors } from "@wso2/ui-toolkit";
import { Diagram, mergeFlowModelsForDiff, stampDiffState } from "@wso2/bi-diagram";
import { getFlowLookupPosition } from "./position-utils";

const SpinnerContainer = styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100%;
`;

const Container = styled.div`
    height: 100%;
    pointer-events: auto;
`;

const MessageContainer = styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100%;
    color: var(--vscode-descriptionForeground);
`;

interface ItemMetadata {
    type: string;
    name: string;
    accessor?: string;
}

export type ReviewViewMode = "diff" | "new" | "old";
export type ExpectedFlowMetadata = Pick<SemanticDiff, "nodeKind" | "metadata">;

const NODE_KIND_FUNCTION = 0;
const NODE_KIND_RESOURCE = 1;

/**
 * Which versions of a file structurally exist for a semantic-diff change type.
 * Single source of truth for the toggle availability (ReviewMode) and the
 * diff-mode fetch branching below.
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

interface ReadonlyFlowDiagramProps {
    projectPath: string;
    filePath: string;
    position: NodePosition;
    oldPosition?: NodePosition;
    onModelLoaded?: (metadata: ItemMetadata) => void;
    viewMode: ReviewViewMode;
    changeType: number;
    expectedMetadata?: ExpectedFlowMetadata;
    onDiffUnavailable?: () => void;
}

function getEventStartData(flow: Flow): ParentMetadata | undefined {
    const eventStartNode = flow?.nodes?.find((node) => node.codedata?.node === "EVENT_START");
    return eventStartNode?.metadata?.data as ParentMetadata | undefined;
}

function normalizeResourcePath(path?: string): string {
    const normalized = (path ?? "").trim().replace(/\s+/g, "");
    return normalized === "/" || normalized.startsWith("/") ? normalized : `/${normalized}`;
}

function metadataMatchesExpected(flow: Flow, expected?: ExpectedFlowMetadata): boolean {
    if (!expected?.metadata) {
        return true;
    }

    const data = getEventStartData(flow);
    if (!data) {
        return false;
    }

    if (expected.nodeKind === NODE_KIND_RESOURCE) {
        const metadata = expected.metadata as { accessor?: string; resourcePath?: string };
        if (!metadata.accessor || !metadata.resourcePath) {
            return true;
        }
        return data.isServiceFunction === true
            && (data.accessor ?? "").toLowerCase() === (metadata.accessor ?? "").toLowerCase()
            && normalizeResourcePath(data.label) === normalizeResourcePath(metadata.resourcePath);
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
function isSameExpectedFunction(oldFlow: Flow, newFlow: Flow, expected?: ExpectedFlowMetadata): boolean {
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

export function ReadonlyFlowDiagram(props: ReadonlyFlowDiagramProps): JSX.Element {
    const {
        filePath,
        position,
        oldPosition,
        onModelLoaded,
        viewMode,
        changeType,
        expectedMetadata,
        onDiffUnavailable,
    } = props;
    const { rpcClient } = useRpcContext();
    const [flowModel, setFlowModel] = useState<Flow | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [unavailableMessage, setUnavailableMessage] = useState<string | null>(null);
    // Latest callbacks held in refs so the load effect can call them without listing them
    // as dependencies — the parent re-creates onModelLoaded on every render, which would
    // otherwise retrigger a full refetch each render.
    const onModelLoadedRef = useRef(onModelLoaded);
    const onDiffUnavailableRef = useRef(onDiffUnavailable);
    onModelLoadedRef.current = onModelLoaded;
    onDiffUnavailableRef.current = onDiffUnavailable;
    // Review content is frozen while the review is open, so fetched versions are cached
    // per view — toggling Diff/New/Old re-derives locally instead of re-querying the LS.
    const flowCache = useRef<{ key: string; versions: Map<boolean, Flow | null> }>({ key: "", versions: new Map() });

    useEffect(() => {
        setIsLoading(true);
        setFlowModel(null);
        setUnavailableMessage(null);
        let cancelled = false;
        loadFlowModel()
            .then((model) => {
                if (cancelled) {
                    return;
                }
                if (!model) {
                    setUnavailableMessage("This diagram is unavailable for the selected version.");
                    return;
                }
                setFlowModel(model);

                // Extract metadata from EVENT_START node
                const data = getEventStartData(model);
                if (data) {
                    onModelLoadedRef.current?.({
                        type: (data as any).kind || "Function",
                        name: data.label || "Unknown",
                        accessor: data.accessor,
                    });
                }
            })
            .catch((error) => {
                console.error("[Reviewing Changes] Error loading flow model:", error);
                if (!cancelled) {
                    setUnavailableMessage("This diagram could not be loaded.");
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setIsLoading(false);
                }
            });
        return () => {
            cancelled = true;
        };
    }, [filePath, position, oldPosition, viewMode, expectedMetadata, changeType, rpcClient]);

    // Fetch one version of the enclosing function's flow model.
    // useFileSchema=true reads the frozen original (file://); false reads the modified temp content (ai://).
    const fetchFlowModelVersion = async (useFileSchema: boolean): Promise<Flow | null> => {
        const lookupPosition = getFlowLookupPosition(position, oldPosition, useFileSchema);
        const cacheKey = `${filePath}:${position.startLine}:${position.startColumn}:${position.endLine}:` +
            `${position.endColumn}:${oldPosition?.startLine ?? ""}:${oldPosition?.startColumn ?? ""}:` +
            `${oldPosition?.endLine ?? ""}:${oldPosition?.endColumn ?? ""}`;
        if (flowCache.current.key !== cacheKey) {
            flowCache.current = { key: cacheKey, versions: new Map() };
        }
        // capture the entry so a late response can't poison a newer view's cache
        const cacheEntry = flowCache.current;
        if (cacheEntry.versions.has(useFileSchema)) {
            return cacheEntry.versions.get(useFileSchema);
        }

        // First resolve the full function range using getEnclosedFunction,
        // since the position from semantic diff may only cover the changed statement
        const enclosedFn = await rpcClient.getBIDiagramRpcClient().getEnclosedFunction({
            filePath: filePath,
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
            filePath: filePath,
            startLine,
            endLine,
            useFileSchema,
        });
        const flow = response?.flowModel ?? null;
        if (flowCache.current === cacheEntry) {
            cacheEntry.versions.set(useFileSchema, flow);
        }
        return flow;
    };

    const loadFlowModel = async (): Promise<Flow | null> => {
        if (viewMode === "old") {
            const oldFlow = await fetchFlowModelVersion(true);
            if (oldFlow && !metadataMatchesExpected(oldFlow, expectedMetadata)) {
                onDiffUnavailableRef.current?.();
                return null;
            }
            return oldFlow;
        }
        if (viewMode === "new") {
            const newFlow = await fetchFlowModelVersion(false);
            if (newFlow && !metadataMatchesExpected(newFlow, expectedMetadata)) {
                // Match the "old" branch: disable the diff toggle up front instead of
                // waiting for the user to click Diff and discover it later.
                onDiffUnavailableRef.current?.();
                return null;
            }
            return newFlow;
        }

        // unified diff mode
        const versions = getVersionsForChangeType(changeType);
        if (!versions.old) {
            const newFlow = await fetchFlowModelVersion(false);
            return newFlow ? stampDiffState(newFlow, "added") : null;
        }
        if (!versions.new) {
            const oldFlow = await fetchFlowModelVersion(true);
            return oldFlow ? stampDiffState(oldFlow, "removed") : null;
        }

        // modification: merge old and new into a single diagram.
        // Fetch both versions concurrently — they're independent LS lookups, so doing
        // them sequentially doubled the time-to-first-render for diff mode. Results are
        // cached per version, so the extra fetch on a metadata-mismatch fallback is free
        // if the user then toggles to New/Old.
        const [newFlow, oldFlow] = await Promise.all([
            fetchFlowModelVersion(false),
            fetchFlowModelVersion(true).catch((error): Flow | null => {
                console.error("[Reviewing Changes] Error fetching old flow model:", error);
                return null;
            }),
        ]);
        if (!newFlow) {
            return null;
        }
        if (!metadataMatchesExpected(newFlow, expectedMetadata)) {
            // The new version resolved to a different function than the diff recorded —
            // rendering it would show the wrong function. Return null to match the
            // "new" branch's verdict for the same flow, so the fallback re-render
            // shows the unavailable message instead of flashing the wrong diagram.
            onDiffUnavailableRef.current?.();
            return null;
        }
        if (!oldFlow || !isSameExpectedFunction(oldFlow, newFlow, expectedMetadata)) {
            onDiffUnavailableRef.current?.();
            return newFlow;
        }

        try {
            return mergeFlowModelsForDiff(oldFlow, newFlow);
        } catch (error) {
            console.error("[Reviewing Changes] Error merging flow models for diff:", error);
            onDiffUnavailableRef.current?.();
            return newFlow;
        }
    };

    if (isLoading) {
        return (
            <SpinnerContainer>
                <ProgressRing color={ThemeColors.PRIMARY} />
            </SpinnerContainer>
        );
    }

    if (!flowModel) {
        return <MessageContainer>{unavailableMessage ?? "This diagram is unavailable."}</MessageContainer>;
    }

    return (
        <Container>
            <Diagram model={flowModel} readOnly={true} />
        </Container>
    );
}
