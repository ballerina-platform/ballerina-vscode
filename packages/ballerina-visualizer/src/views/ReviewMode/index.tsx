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

import React, { useEffect, useState, useCallback, useRef } from "react";
import { SemanticDiffResponse, SemanticDiff, ChangeTypeEnum, NodeKindEnum, NodePosition } from "@wso2/ballerina-core";
import styled from "@emotion/styled";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { ReadonlyComponentDiagram } from "./ReadonlyComponentDiagram";
import { ExpectedFlowMetadata, ReadonlyFlowDiagram, ReviewViewMode } from "./ReadonlyFlowDiagram";
import { diffBelongsToPackage } from "./path-utils";
import { ReadonlyTypeDiagram } from "./ReadonlyTypeDiagram";
import { ReadonlySourceDiff } from "./ReadonlySourceDiff";
import { getNodeKindLabel, SOURCE_VIEW_KINDS } from "./nodeKindLabels";
import { getVersionsForChangeType, prefetchReviewView, ReviewModelCache } from "./reviewModelCache";
import { ReviewNavigation } from "./ReviewNavigation";
import { Codicon, Icon, ThemeColors } from "@wso2/ui-toolkit";
import { TitleBar } from "../../components/TitleBar";
import { getTitleBarSubEl } from "../BI/DiagramWrapper";

const ReviewContainer = styled.div`
    width: 100%;
    height: 100vh;
    display: flex;
    flex-direction: column;
    background-color: var(--vscode-editor-background);
    border: 1px solid ${ThemeColors.PRIMARY};
    position: relative;
`;

const DiagramContainer = styled.div`
    flex: 1;
    overflow: hidden;
    position: relative;
`;

const ReviewModeBadge = styled.div`
    padding: 4px 12px;
    border: 1px solid ${ThemeColors.PRIMARY};
    color: ${ThemeColors.ON_SURFACE};
    border-radius: 2px;
    font-size: 12px;
    font-weight: 500;
    white-space: nowrap;
    cursor: default;
    user-select: none;
`;

const PackageBadge = styled.div`
    padding: 4px 10px;
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
    border-radius: 2px;
    font-size: 11px;
    font-weight: 500;
    white-space: nowrap;
    display: flex;
    align-items: center;
    gap: 4px;

    &::before {
        content: "📦";
        font-size: 10px;
    }
`;

const CurrentPackageBadge = styled.div`
    padding: 4px 10px;
    background: var(--vscode-statusBarItem-prominentBackground);
    color: var(--vscode-statusBarItem-prominentForeground);
    border-radius: 2px;
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
    display: flex;
    align-items: center;
    gap: 8px;
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
`;

const CloseButton = styled.button`
    background: transparent;
    border: none;
    color: var(--vscode-foreground);
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;

    &:hover {
        background: var(--vscode-toolbar-hoverBackground);
    }

    &:active {
        background: var(--vscode-toolbar-activeBackground);
    }

    & > div:first-child {
        width: 20px;
        height: 20px;
        font-size: 20px;
    }
`;

const CompileErrorMessage = styled.div`
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-width: 560px;
    padding: 16px 20px;
    color: var(--vscode-foreground);
    border: 1px solid var(--vscode-inputValidation-warningBorder, ${ThemeColors.PRIMARY});
    background: var(--vscode-inputValidation-warningBackground, transparent);
    border-radius: 4px;
    font-size: 13px;
`;

const ErrorDetail = styled.div`
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 12px;
    color: var(--vscode-errorForeground);
    word-break: break-word;
`;

const CompileWarningBanner = styled.div`
    padding: 6px 12px;
    font-size: 12px;
    color: var(--vscode-inputValidation-warningForeground, var(--vscode-foreground));
    background: var(--vscode-inputValidation-warningBackground, transparent);
    border-bottom: 1px solid var(--vscode-inputValidation-warningBorder, ${ThemeColors.PRIMARY});
    word-break: break-word;
`;

enum DiagramType {
    COMPONENT = "component",
    FLOW = "flow",
    TYPE = "type",
    SOURCE = "source",
}

interface ReviewView {
    type: DiagramType;
    filePath: string;
    position: NodePosition;
    oldPosition?: NodePosition;
    projectPath: string;
    label?: string;
    changeType: number;
    expectedMetadata?: ExpectedFlowMetadata;
    /** Construct name + before/after source, for SOURCE views (carried in diff metadata). */
    sourceMeta?: { name?: string; oldSource?: string; newSource?: string };
}

// Map numeric changeType to string
function getChangeTypeString(changeType: number): string {
    switch (changeType) {
        case ChangeTypeEnum.ADDITION:
            return "addition";
        case ChangeTypeEnum.MODIFICATION:
            return "modification";
        case ChangeTypeEnum.DELETION:
            return "deletion";
        default:
            return "change";
    }
}

function getDiagramType(nodeKind: number): DiagramType {
    if (nodeKind === NodeKindEnum.TYPE_DEFINITION) {
        return DiagramType.TYPE;
    }
    if (SOURCE_VIEW_KINDS.has(nodeKind)) {
        return DiagramType.SOURCE;
    }
    return DiagramType.FLOW;
}

// Utility function to convert SemanticDiff to ReviewView
function convertToReviewView(diff: SemanticDiff, projectPath: string, packageName?: string): ReviewView {
    const fileName = diff.uri.split("/").pop() || diff.uri;
    const changeTypeStr = getChangeTypeString(diff.changeType);
    const nodeKindStr = getNodeKindLabel(diff.nodeKind, diff.metadata);
    const diagramType = getDiagramType(diff.nodeKind);

    // Include package name in label if provided (for multi-package scenarios)
    const changeLabel = packageName
        ? `${changeTypeStr}: ${nodeKindStr} in ${packageName}/${fileName}`
        : `${changeTypeStr}: ${nodeKindStr} in ${fileName}`;

    const metadata = diff.metadata as
        | { name?: string; oldSource?: string; newSource?: string }
        | undefined;

    return {
        type: diagramType,
        filePath: diff.uri,
        position: {
            startLine: diff.lineRange.startLine.line,
            endLine: diff.lineRange.endLine.line,
            startColumn: diff.lineRange.startLine.offset,
            endColumn: diff.lineRange.endLine.offset,
        },
        oldPosition: diff.previousLineRange
            ? {
                  startLine: diff.previousLineRange.startLine.line,
                  endLine: diff.previousLineRange.endLine.line,
                  startColumn: diff.previousLineRange.startLine.offset,
                  endColumn: diff.previousLineRange.endLine.offset,
              }
            : undefined,
        projectPath,
        label: changeLabel,
        changeType: diff.changeType,
        expectedMetadata: {
            nodeKind: diff.nodeKind,
            metadata: diff.metadata,
        },
        sourceMeta:
            diagramType === DiagramType.SOURCE
                ? { name: metadata?.name, oldSource: metadata?.oldSource, newSource: metadata?.newSource }
                : undefined,
    };
}


// Helper to extract package name from path
function getPackageName(path: string): string {
    const parts = path.replace(/\\/g, "/").split("/");
    const lastPart = parts[parts.length - 1];

    // If the last part is a .bal file, the package name is the directory before it
    if (lastPart && lastPart.endsWith(".bal")) {
        return parts[parts.length - 2] || path;
    }

    // Otherwise, the last part is the package name
    return lastPart || path;
}

interface ItemMetadata {
    type: string; // "Resource", "Function", "Automation", etc.
    name: string; // e.g., "todos", "processData"
    accessor?: string; // e.g., "get", "post" (for resources)
}

export function ReviewMode(): JSX.Element {
    const { rpcClient } = useRpcContext();

    const [projectPath, setProjectPath] = useState<string | null>(null);
    const [semanticDiffData, setSemanticDiffData] = useState<SemanticDiffResponse | null>(null);
    const [views, setViews] = useState<ReviewView[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [currentItemMetadata, setCurrentItemMetadata] = useState<ItemMetadata | null>(null);
    const [isWorkspace, setIsWorkspace] = useState(false);
    const [modifiedFiles, setModifiedFiles] = useState<string[]>([]);
    const [semanticDiffError, setSemanticDiffError] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<ReviewViewMode>("diff");
    // View indices where the unified diff could not be built (old version missing/mismatched)
    const [diffUnavailableViews, setDiffUnavailableViews] = useState<Set<number>>(new Set());
    const pendingIndexRef = useRef<number | null>(null);
    const viewsLengthRef = useRef<number>(0);
    // Session-scoped LS model cache shared by all diagram components. The per-item
    // components are remounted on navigation/toggle (their keys include currentIndex),
    // so any cache they hold themselves dies with them — this one survives, making
    // revisits and Old/New toggles cache hits instead of fresh LS round trips.
    const modelCacheRef = useRef<ReviewModelCache>(new Map());

    useEffect(() => {
        viewsLengthRef.current = views.length;
    }, [views.length]);

    // Derive current view from views array and currentIndex - no separate state needed
    const currentView =
        views.length > 0 && currentIndex >= 0 && currentIndex < views.length ? views[currentIndex] : null;

    // Load review data pushed via OPEN_VIEW reviewData field — no separate RPC calls needed
    const loadFromReviewData = useCallback(async () => {
        try {
            setIsLoading(true);
            const location = await rpcClient.getVisualizerLocation();
            const data = location?.reviewData;
            if (!data?.semanticDiffs || !data?.tempProjectPath) return;

            // New review payload — models cached for a previous generation are stale.
            modelCacheRef.current = new Map();

            const tempDirPath = data.tempProjectPath;
            const isWorkspaceProject = data.isWorkspace ?? false;
            const affectedPackages = data.affectedPackages ?? [tempDirPath];
            const semanticDiffs = data.semanticDiffs as SemanticDiff[];
            const loadDesignDiagrams = data.loadDesignDiagrams ?? false;

            setProjectPath(tempDirPath);
            setIsWorkspace(isWorkspaceProject);
            setModifiedFiles(data.modifiedFiles ?? []);
            setSemanticDiffError(data.semanticDiffError ?? null);
            setSemanticDiffData({ semanticDiffs, loadDesignDiagrams });

            const packagesToReview = isWorkspaceProject ? affectedPackages : [tempDirPath];
            const normalizedTempDir = tempDirPath.replace(/\\/g, "/");
            const filteredPackages = isWorkspaceProject
                ? packagesToReview.filter((p: string) => p.replace(/\\/g, "/") !== normalizedTempDir)
                : packagesToReview;
            const allViews: ReviewView[] = [];

            if (loadDesignDiagrams && semanticDiffs.length > 0) {
                const pkgsWithDiffs = new Set<string>();
                for (const diff of semanticDiffs) {
                    for (const pkgPath of filteredPackages) {
                        if (diffBelongsToPackage(diff.uri, pkgPath)) {
                            pkgsWithDiffs.add(pkgPath);
                            break;
                        }
                    }
                }
                filteredPackages.forEach((packagePath: string) => {
                    if (!pkgsWithDiffs.has(packagePath)) return;
                    const packageName = getPackageName(packagePath);
                    allViews.push({
                        type: DiagramType.COMPONENT,
                        filePath: packagePath,
                        position: { startLine: 0, endLine: 0, startColumn: 0, endColumn: 0 },
                        projectPath: packagePath,
                        label: isWorkspaceProject ? `Design Diagram - ${packageName}` : "Design Diagram",
                        changeType: ChangeTypeEnum.MODIFICATION,
                    });
                });
            }

            const seenTypeViews = new Set<string>();
            for (const diff of semanticDiffs) {
                let belongsToPackage = tempDirPath;
                let packageName: string | undefined;
                if (isWorkspaceProject) {
                    for (const pkgPath of filteredPackages) {
                        if (diffBelongsToPackage(diff.uri, pkgPath)) {
                            belongsToPackage = pkgPath;
                            packageName = getPackageName(pkgPath);
                            break;
                        }
                    }
                }
                const diagramType = getDiagramType(diff.nodeKind);
                if (diagramType === DiagramType.TYPE) {
                    if (seenTypeViews.has(belongsToPackage)) continue;
                    seenTypeViews.add(belongsToPackage);
                }
                allViews.push(convertToReviewView(diff, belongsToPackage, packageName));
            }

            setViews(allViews);
            const idx = pendingIndexRef.current ?? data.currentIndex ?? 0;
            pendingIndexRef.current = null;
            setCurrentIndex(idx >= 0 && idx < allViews.length ? idx : 0);
        } catch (error) {
            console.error("[Reviewing Changes] Error loading review data:", error);
        } finally {
            setIsLoading(false);
        }
    }, [rpcClient]);

    // Load data on mount
    useEffect(() => {
        loadFromReviewData();
    }, [loadFromReviewData]);

    // Listen for direct index navigation from chip clicks (bypasses state machine)
    useEffect(() => {
        rpcClient.onNavigateReviewIndex((index: number) => {
            if (viewsLengthRef.current === 0) {
                pendingIndexRef.current = index;
            } else {
                setCurrentIndex(index >= 0 && index < viewsLengthRef.current ? index : 0);
                setCurrentItemMetadata(null);
                setViewMode("diff");
            }
        });
    }, [rpcClient]);

    // Warm the session cache for EVERY item once per review payload, ordered outward
    // from the item the review opened on, so any chip click or prev/next lands on an
    // already-fetched model. Two workers keep the sweep from starving the mounted
    // component's own fetch (which the promise cache dedups against anyway); a failed
    // prefetch evicts itself, so the visit-time fetch still gets a fresh attempt.
    const prefetchedViewsRef = useRef<ReviewView[] | null>(null);
    useEffect(() => {
        if (views.length === 0 || prefetchedViewsRef.current === views) {
            return;
        }
        prefetchedViewsRef.current = views;
        const cache = modelCacheRef.current;
        const order: ReviewView[] = [];
        for (let distance = 0; order.length < views.length; distance++) {
            const ahead = currentIndex + distance;
            const behind = currentIndex - distance;
            if (ahead < views.length) order.push(views[ahead]);
            if (distance > 0 && behind >= 0) order.push(views[behind]);
        }
        let nextIndex = 0;
        const worker = (): void => {
            if (nextIndex >= order.length || modelCacheRef.current !== cache) {
                // A new review payload replaced the cache — stop sweeping stale views.
                return;
            }
            prefetchReviewView(rpcClient, cache, order[nextIndex++]).then(worker);
        };
        worker();
        worker();
    }, [views, currentIndex, rpcClient]);

    // Set metadata for component/source views when view changes (they don't load a model
    // that would report metadata back)
    useEffect(() => {
        if (currentView?.type === "component" && !currentItemMetadata) {
            setCurrentItemMetadata({
                type: "Design",
                name: "",
            });
        }
        if (currentView?.type === "source" && !currentItemMetadata) {
            setCurrentItemMetadata({
                type: "Change",
                name: currentView.sourceMeta?.name ?? "",
            });
        }
    }, [currentView, currentItemMetadata]);

    const handlePrevious = () => {
        if (currentIndex > 0) {
            const newIndex = currentIndex - 1;
            setCurrentIndex(newIndex);
            setCurrentItemMetadata(null); // Clear metadata when navigating
            setViewMode("diff"); // Reset toggle when navigating
        } else {
            console.log("[Reviewing Changes] Already at first view");
        }
    };

    const handleNext = () => {
        if (currentIndex < views.length - 1) {
            const newIndex = currentIndex + 1;
            setCurrentIndex(newIndex);
            setCurrentItemMetadata(null); // Clear metadata when navigating
            setViewMode("diff"); // Reset toggle when navigating
        } else {
            console.log("[Reviewing Changes] Already at last view");
        }
    };

    const handleDiffUnavailable = useCallback(() => {
        setDiffUnavailableViews((prev) => {
            if (prev.has(currentIndex)) {
                return prev;
            }
            const next = new Set(prev);
            next.add(currentIndex);
            return next;
        });
    }, [currentIndex]);

    const handleClose = () => {
        rpcClient.getVisualizerRpcClient().goBack();
    };

    const handleModelLoaded = (metadata: ItemMetadata) => {
        setCurrentItemMetadata(metadata);
    };

    // Which toggle segments are available for the current view.
    // Only flow diagrams support the unified diff; type/design diagrams keep old/new behavior.
    const getAvailableModes = (): Record<ReviewViewMode, boolean> => {
        if (!currentView) {
            return { diff: false, new: true, old: false };
        }
        if (currentView.type === DiagramType.SOURCE) {
            // Source views carry their own before/after text; "diff" shows both blocks.
            const hasOld = currentView.sourceMeta?.oldSource !== undefined;
            const hasNew = currentView.sourceMeta?.newSource !== undefined;
            return { diff: hasOld && hasNew, new: hasNew, old: hasOld };
        }
        const versions = getVersionsForChangeType(currentView.changeType);
        const diff = currentView.type === DiagramType.FLOW && !diffUnavailableViews.has(currentIndex);
        return { diff, new: versions.new, old: versions.old };
    };

    const availableModes = getAvailableModes();
    // Clamp the selected mode to what the current view supports (diff → new → old)
    const effectiveViewMode: ReviewViewMode = availableModes[viewMode]
        ? viewMode
        : availableModes.diff
        ? "diff"
        : availableModes.new
        ? "new"
        : "old";

    const renderDiagram = () => {
        if (!currentView) {
            return <div>No view to display</div>;
        }

        // Create a unique key for each diagram to force re-mount when switching views.
        // For type/design diagrams the Old/New toggle is part of the key: their fetch
        // effects have no stale-response guard, so remounting on toggle prevents an
        // out-of-order response from rendering the wrong version. Flow diagrams cache
        // versions internally and derive the toggle locally, so their key excludes it.
        const diagramKey =
            currentView.type === "flow"
                ? `${currentView.type}-${currentIndex}-${currentView.filePath}`
                : `${currentView.type}-${currentIndex}-${currentView.filePath}-${effectiveViewMode}`;

        switch (currentView.type) {
            case "component":
                // Metadata is now set by useEffect hook
                return (
                    <ReadonlyComponentDiagram
                        key={diagramKey}
                        projectPath={currentView.projectPath || projectPath}
                        filePath={currentView.filePath}
                        position={currentView.position}
                        useFileSchema={effectiveViewMode === "old"}
                        modelCache={modelCacheRef.current}
                    />
                );
            case "flow":
                return (
                    <ReadonlyFlowDiagram
                        key={diagramKey}
                        projectPath={currentView.projectPath || projectPath}
                        filePath={currentView.filePath}
                        position={currentView.position}
                        oldPosition={currentView.oldPosition}
                        onModelLoaded={handleModelLoaded}
                        viewMode={effectiveViewMode}
                        changeType={currentView.changeType}
                        expectedMetadata={currentView.expectedMetadata}
                        onDiffUnavailable={handleDiffUnavailable}
                        modelCache={modelCacheRef.current}
                    />
                );
            case "type":
                return (
                    <ReadonlyTypeDiagram
                        key={diagramKey}
                        projectPath={currentView.projectPath || projectPath}
                        filePath={currentView.filePath}
                        onModelLoaded={handleModelLoaded}
                        useFileSchema={effectiveViewMode === "old"}
                        modelCache={modelCacheRef.current}
                    />
                );
            case "source":
                // The construct's name is shown by the TitleBar (via currentItemMetadata).
                return (
                    <ReadonlySourceDiff
                        key={diagramKey}
                        oldSource={currentView.sourceMeta?.oldSource}
                        newSource={currentView.sourceMeta?.newSource}
                        changeType={currentView.changeType}
                        viewMode={effectiveViewMode}
                    />
                );
            default:
                return <div>Unknown diagram type</div>;
        }
    };

    if (isLoading) {
        return (
            <ReviewContainer>
                <TitleBar
                    title="Loading..."
                    actions={<ReviewModeBadge>Reviewing Changes</ReviewModeBadge>}
                    hideBack={true}
                    hideUndoRedo={true}
                />
                <DiagramContainer style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
                    <div style={{ color: "var(--vscode-foreground)" }}>Loading changes to review...</div>
                </DiagramContainer>
            </ReviewContainer>
        );
    }

    if (!semanticDiffData || views.length === 0) {
        return (
            <ReviewContainer>
                <TitleBar
                    title={semanticDiffError ? "Review Unavailable" : "No Changes"}
                    actions={
                        <>
                            <ReviewModeBadge>Reviewing Changes</ReviewModeBadge>
                            <CloseButton onClick={handleClose} title="Close Reviewing Changes">
                                <Icon name="bi-close" />
                            </CloseButton>
                        </>
                    }
                    hideBack={true}
                    hideUndoRedo={true}
                />
                <DiagramContainer style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
                    {semanticDiffError ? (
                        <CompileErrorMessage>
                            <strong>The changes could not be analyzed because the project fails to compile.</strong>
                            <ErrorDetail>{semanticDiffError}</ErrorDetail>
                            <div>
                                The changes are already applied to your files. If the error mentions a
                                dependency, running <code>bal build</code> in the project usually resolves it
                                by refreshing <code>Dependencies.toml</code>.
                            </div>
                        </CompileErrorMessage>
                    ) : modifiedFiles.length > 0 ? (
                        // Files changed but nothing produced a reviewable code diff (e.g. only
                        // Config.toml / markdown / JSON edits). Say what changed instead of the
                        // misleading "No changes to review".
                        <CompileErrorMessage style={{ borderColor: "var(--vscode-panel-border)", background: "transparent" }}>
                            <strong>No code changes to review as diagrams.</strong>
                            <div>
                                {modifiedFiles.length} file{modifiedFiles.length === 1 ? " was" : "s were"} changed
                                and already applied to your project:
                            </div>
                            <ErrorDetail style={{ color: "var(--vscode-foreground)" }}>
                                {modifiedFiles.map((f) => (
                                    <div key={f}>{f}</div>
                                ))}
                            </ErrorDetail>
                        </CompileErrorMessage>
                    ) : (
                        <div style={{ color: "var(--vscode-foreground)" }}>No changes to review</div>
                    )}
                </DiagramContainer>
            </ReviewContainer>
        );
    }

    const canGoPrevious = currentIndex > 0;
    const canGoNext = currentIndex < views.length - 1;
    const isAutomation = currentItemMetadata?.type === "Function" && currentItemMetadata?.name === "main";
    const isResource = currentItemMetadata?.type === "Resource";
    const isType = currentItemMetadata?.type === "Type";
    // Format the display text for the header
    const getHeaderText = () => {
        if (!currentItemMetadata) {
            return { type: "", name: "Loading..." };
        }

        let type = currentItemMetadata.type;
        let name = currentItemMetadata.name;
        let accessor = currentItemMetadata.accessor;

        if (isAutomation) {
            type = "Automation";
        }

        if (isType) {
            type = "Types";
            name = "";
            accessor = "";
        }

        return { type, name, accessor };
    };
    const headerText = getHeaderText();
    const subtitleElement = getTitleBarSubEl(headerText.name, headerText.accessor || "", isResource, isAutomation);

    // Get current package name for display
    // Show package names for workspace projects
    const getCurrentPackageName = () => {
        if (!currentView) {
            return null;
        }
        return getPackageName(currentView.filePath);
    };

    const currentPackageName = getCurrentPackageName();

    // Create actions for the right side
    const headerActions = (
        <>
            {isWorkspace && currentPackageName && (
                <CurrentPackageBadge title={`Currently viewing: ${currentPackageName} Integration`}>
                    <Codicon name="project" />
                    {currentPackageName}
                </CurrentPackageBadge>
            )}
            <ReviewModeBadge>Reviewing Changes</ReviewModeBadge>
            <CloseButton onClick={handleClose} title="Close Reviewing Changes">
                <Icon name="bi-close" />
            </CloseButton>
        </>
    );

    return (
        <ReviewContainer>
            <TitleBar
                title={headerText.type}
                subtitleElement={subtitleElement}
                actions={headerActions}
                hideBack={true}
                hideUndoRedo={true}
            />
            {semanticDiffError && (
                <CompileWarningBanner title={semanticDiffError}>
                    ⚠ The project fails to compile, so diagrams may be unavailable: {semanticDiffError}
                </CompileWarningBanner>
            )}
            <DiagramContainer>{renderDiagram()}</DiagramContainer>
            <ReviewNavigation
                key={`nav-${currentIndex}-${views.length}`}
                currentIndex={currentIndex}
                totalViews={views.length}
                currentLabel={currentView?.label}
                onPrevious={handlePrevious}
                onNext={handleNext}
                canGoPrevious={canGoPrevious}
                canGoNext={canGoNext}
                viewMode={effectiveViewMode}
                onViewModeChange={setViewMode}
                availableModes={availableModes}
            />
        </ReviewContainer>
    );
}
