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
import { Flow, NodePosition, ParentMetadata, SemanticDiff } from "@wso2/ballerina-core";
import styled from "@emotion/styled";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { ProgressRing, ThemeColors } from "@wso2/ui-toolkit";
import { Diagram, mergeFlowModelsForDiff, stampDiffState } from "@wso2/bi-diagram";
import { fetchFlowModelVersion, getVersionsForChangeType, ReviewModelCache } from "./reviewModelCache";

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

const DiffNoticeBanner = styled.div`
    padding: 6px 12px;
    font-size: 12px;
    color: var(--vscode-inputValidation-warningForeground, var(--vscode-foreground));
    background: var(--vscode-inputValidation-warningBackground, transparent);
    border-bottom: 1px solid var(--vscode-inputValidation-warningBorder, var(--vscode-panel-border));
    word-break: break-word;
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
    /** Session-scoped model cache owned by ReviewMode — survives navigation remounts. */
    modelCache: ReviewModelCache;
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
        modelCache,
    } = props;
    const { rpcClient } = useRpcContext();
    const [flowModel, setFlowModel] = useState<Flow | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [unavailableMessage, setUnavailableMessage] = useState<string | null>(null);
    // Why the unified diff degraded to the New-only view, when it did. Rendering the
    // fallback silently made an old-side fetch failure indistinguishable from "nothing
    // to highlight" — the single most confusing form of a broken diff.
    const [diffNotice, setDiffNotice] = useState<string | null>(null);
    // Latest callbacks held in refs so the load effect can call them without listing them
    // as dependencies — the parent re-creates onModelLoaded on every render, which would
    // otherwise retrigger a full refetch each render.
    const onModelLoadedRef = useRef(onModelLoaded);
    const onDiffUnavailableRef = useRef(onDiffUnavailable);
    onModelLoadedRef.current = onModelLoaded;
    onDiffUnavailableRef.current = onDiffUnavailable;

    useEffect(() => {
        setIsLoading(true);
        setFlowModel(null);
        setUnavailableMessage(null);
        setDiffNotice(null);
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

    // Fetch one version of the enclosing function's flow model, through the session
    // cache owned by ReviewMode — toggling Diff/New/Old or navigating back to this
    // item re-derives locally instead of re-querying the LS.
    // useFileSchema=true reads the frozen original (ai://); false reads the live edits (file://).
    const fetchVersion = (useFileSchema: boolean): Promise<Flow | null> =>
        fetchFlowModelVersion(rpcClient, modelCache, { filePath, position, oldPosition, useFileSchema });

    const loadFlowModel = async (): Promise<Flow | null> => {
        if (viewMode === "old") {
            const oldFlow = await fetchVersion(true);
            if (oldFlow && !metadataMatchesExpected(oldFlow, expectedMetadata)) {
                onDiffUnavailableRef.current?.();
                return null;
            }
            return oldFlow;
        }
        if (viewMode === "new") {
            const newFlow = await fetchVersion(false);
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
            const newFlow = await fetchVersion(false);
            return newFlow ? stampDiffState(newFlow, "added") : null;
        }
        if (!versions.new) {
            const oldFlow = await fetchVersion(true);
            return oldFlow ? stampDiffState(oldFlow, "removed") : null;
        }

        // modification: merge old and new into a single diagram.
        // Fetch both versions concurrently — they're independent LS lookups, so doing
        // them sequentially doubled the time-to-first-render for diff mode. Results are
        // cached per version, so the extra fetch on a metadata-mismatch fallback is free
        // if the user then toggles to New/Old.
        let oldFetchError: unknown = null;
        const [newFlow, oldFlow] = await Promise.all([
            fetchVersion(false),
            fetchVersion(true).catch((error): Flow | null => {
                console.error("[Reviewing Changes] Error fetching old flow model:", error);
                oldFetchError = error;
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
            setDiffNotice(
                oldFetchError
                    ? "The previous version of this diagram could not be loaded, so change highlighting is unavailable. Showing the new version."
                    : "The previous version could not be matched to this change, so change highlighting is unavailable. Showing the new version."
            );
            return newFlow;
        }

        try {
            return mergeFlowModelsForDiff(oldFlow, newFlow);
        } catch (error) {
            console.error("[Reviewing Changes] Error merging flow models for diff:", error);
            onDiffUnavailableRef.current?.();
            setDiffNotice("The unified diff could not be built for this change. Showing the new version.");
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
            {viewMode === "diff" && diffNotice && <DiffNoticeBanner>⚠ {diffNotice}</DiffNoticeBanner>}
            <Diagram model={flowModel} readOnly={true} />
        </Container>
    );
}
