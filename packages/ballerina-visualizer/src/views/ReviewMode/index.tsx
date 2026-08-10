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
import { SemanticDiffResponse, SemanticDiff, ChangeTypeEnum, NodePosition } from "@wso2/ballerina-core";
import styled from "@emotion/styled";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { ReadonlyComponentDiagram } from "./ReadonlyComponentDiagram";
import { ExpectedFlowMetadata, ReadonlyFlowDiagram, ReviewViewMode, getVersionsForChangeType } from "./ReadonlyFlowDiagram";
import { ReadonlyTypeDiagram } from "./ReadonlyTypeDiagram";
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

enum DiagramType {
    COMPONENT = "component",
    FLOW = "flow",
    TYPE = "type",
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
}

enum NodeKindEnum {
    FUNCTION = 0,
    RESOURCE_FUNCTION = 1,
    TYPE = 2,
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

// Map numeric nodeKind to string
function getNodeKindString(nodeKind: number): string {
    switch (nodeKind) {
        case NodeKindEnum.FUNCTION:
            return "function";
        case NodeKindEnum.RESOURCE_FUNCTION:
            return "resource";
        case NodeKindEnum.TYPE:
            return "type";
        default:
            return "component";
    }
}

function getDiagramType(nodeKind: number): DiagramType {
    if (nodeKind === NodeKindEnum.TYPE) {
        return DiagramType.TYPE;
    }
    return DiagramType.FLOW;
}

// Utility function to convert SemanticDiff to ReviewView
function convertToReviewView(diff: SemanticDiff, projectPath: string, packageName?: string): ReviewView {
    const fileName = diff.uri.split("/").pop() || diff.uri;
    const changeTypeStr = getChangeTypeString(diff.changeType);
    const nodeKindStr = getNodeKindString(diff.nodeKind);

    // Include package name in label if provided (for multi-package scenarios)
    const changeLabel = packageName
        ? `${changeTypeStr}: ${nodeKindStr} in ${packageName}/${fileName}`
        : `${changeTypeStr}: ${nodeKindStr} in ${fileName}`;

    return {
        type: getDiagramType(diff.nodeKind),
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
    const [viewMode, setViewMode] = useState<ReviewViewMode>("diff");
    // View indices where the unified diff could not be built (old version missing/mismatched)
    const [diffUnavailableViews, setDiffUnavailableViews] = useState<Set<number>>(new Set());
    const pendingIndexRef = useRef<number | null>(null);
    const viewsLengthRef = useRef<number>(0);

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

            const tempDirPath = data.tempProjectPath;
            const isWorkspaceProject = data.isWorkspace ?? false;
            const affectedPackages = data.affectedPackages ?? [tempDirPath];
            const semanticDiffs = data.semanticDiffs as SemanticDiff[];
            const loadDesignDiagrams = data.loadDesignDiagrams ?? false;

            setProjectPath(tempDirPath);
            setIsWorkspace(isWorkspaceProject);
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
                    const uriPath = diff.uri.replace(/^[a-z][a-z0-9+.-]*:\/\//, "").replace(/\\/g, "/");
                    for (const pkgPath of filteredPackages) {
                        const normalizedPkgPath = pkgPath.replace(/\\/g, "/");
                        if (uriPath.startsWith(normalizedPkgPath + "/") || uriPath === normalizedPkgPath) {
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
                        const normalizedUri = diff.uri.replace(/\\/g, "/");
                        const normalizedPkgPath = pkgPath.replace(/\\/g, "/");
                        if (normalizedUri.startsWith(normalizedPkgPath + "/") || normalizedUri === normalizedPkgPath) {
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

    // Set metadata for component diagram when view changes
    useEffect(() => {
        if (currentView?.type === "component" && !currentItemMetadata) {
            setCurrentItemMetadata({
                type: "Design",
                name: "",
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

        // Create a unique key for each diagram to force re-mount when switching views
        const diagramKey = `${currentView.type}-${currentIndex}-${currentView.filePath}`;

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
                    title="No Changes"
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
                    <div style={{ color: "var(--vscode-foreground)" }}>No changes to review</div>
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
