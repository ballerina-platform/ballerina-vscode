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

import React, { useEffect, useMemo, useState } from "react";
import styled from "@emotion/styled";
import { SemanticDiff, ChangeTypeEnum, NodeKindEnum, MACHINE_VIEW, VisualizerLocation } from "@wso2/ballerina-core";
import { getNodeKindLabel } from "../../../ReviewMode/nodeKindLabels";
import { getColorByMethod } from "../../../BI/ServiceDesigner/components/ResourceAccordion";

const Container = styled.div<{ subtle?: boolean; expanded?: boolean }>`
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 6px 10px;
    background-color: ${(p: { subtle?: boolean }) =>
        p.subtle
            ? "color-mix(in srgb, var(--vscode-editor-background) 60%, transparent)"
            : "var(--vscode-editor-background)"};
    border: 1px solid ${(p: { subtle?: boolean; expanded?: boolean }) =>
        p.subtle && !p.expanded
            ? "color-mix(in srgb, var(--vscode-panel-border) 60%, transparent)"
            : "var(--vscode-panel-border)"};
    border-radius: 4px;
    margin: 6px 0 2px;
`;

const TitleBarRow = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
`;


const ReviewIconButton = styled.button`
    display: flex;
    align-items: center;
    gap: 4px;
    background: transparent;
    border: none;
    padding: 2px 6px;
    margin: 0;
    cursor: pointer;
    font-size: 11px;
    font-family: var(--vscode-font-family);
    color: var(--vscode-foreground);
    border-radius: 3px;
    &:hover:not(:disabled) {
        background-color: var(--vscode-toolbar-hoverBackground);
    }
    &:disabled {
        opacity: 0.45;
        cursor: not-allowed;
    }
`;

const ChangeList = styled.div`
    display: flex;
    flex-direction: column;
    gap: 4px;
`;

const CollapsibleHeader = styled.button`
    display: flex;
    align-items: center;
    gap: 5px;
    background: transparent;
    border: none;
    padding: 4px 2px 2px;
    margin-top: 4px;
    cursor: pointer;
    font-size: 11px;
    font-weight: 600;
    font-family: var(--vscode-font-family);
    color: var(--vscode-foreground);
    text-align: left;
    width: 100%;
    &:hover {
        opacity: 0.8;
    }
    &:first-of-type {
        margin-top: 0;
    }
`;

const CountBadge = styled.span`
    font-size: 10px;
    font-weight: 400;
    color: var(--vscode-descriptionForeground);
    margin-left: 2px;
`;

const TypesRow = styled.button`
    display: flex;
    align-items: center;
    gap: 5px;
    justify-content: space-between;
    background: transparent;
    border: none;
    padding: 4px 2px 2px;
    margin-top: 4px;
    cursor: pointer;
    font-size: 11px;
    font-weight: 600;
    font-family: var(--vscode-font-family);
    color: var(--vscode-foreground);
    text-align: left;
    width: 100%;
    &:hover:not(:disabled) {
        opacity: 0.8;
    }
    &:disabled {
        cursor: default;
        pointer-events: none;
        opacity: 0.45;
    }
`;

const ChangeCard = styled.button`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 5px 8px;
    background-color: var(--vscode-textCodeBlock-background);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 4px;
    cursor: pointer;
    font-family: var(--vscode-font-family);
    text-align: left;
    width: 100%;
    &:hover {
        background-color: var(--vscode-list-hoverBackground);
        border-color: var(--vscode-focusBorder);
    }
    &:disabled {
        cursor: default;
        pointer-events: none;
        opacity: 0.6;
    }
`;

const CardLeft = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
    overflow: hidden;
`;

const CardKindLabel = styled.span`
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    flex-shrink: 0;
`;

const CardFileName = styled.span`
    font-size: 12px;
    font-weight: 500;
    color: var(--vscode-foreground);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
`;

const TypePill = styled.span<{ changeType: number }>`
    font-size: 11px;
    font-weight: 500;
    padding: 1px 6px;
    border-radius: 10px;
    flex-shrink: 0;
    color: ${({ changeType }: { changeType: number }) => {
        switch (changeType) {
            case ChangeTypeEnum.ADDITION: return "var(--vscode-charts-green)";
            case ChangeTypeEnum.DELETION: return "var(--vscode-charts-red)";
            case ChangeTypeEnum.MODIFICATION: return "var(--vscode-charts-yellow)";
            default: return "var(--vscode-charts-blue)";
        }
    }};
    background-color: ${({ changeType }: { changeType: number }) => {
        switch (changeType) {
            case ChangeTypeEnum.ADDITION: return "color-mix(in srgb, var(--vscode-charts-green) 15%, transparent)";
            case ChangeTypeEnum.DELETION: return "color-mix(in srgb, var(--vscode-charts-red) 15%, transparent)";
            case ChangeTypeEnum.MODIFICATION: return "color-mix(in srgb, var(--vscode-charts-yellow) 15%, transparent)";
            default: return "color-mix(in srgb, var(--vscode-charts-blue) 15%, transparent)";
        }
    }};
`;

const ActionRow = styled.div`
    display: flex;
    justify-content: flex-end;
    gap: 6px;
`;

const ActionButton = styled.button`
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 3px 10px;
    border-radius: 3px;
    border: 1px solid var(--vscode-button-border, var(--vscode-panel-border));
    font-size: 12px;
    font-weight: 500;
    font-family: var(--vscode-font-family);
    cursor: pointer;
    background-color: var(--vscode-button-secondaryBackground, transparent);
    color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
    &:hover:not(:disabled) {
        opacity: 0.85;
    }
    &:disabled {
        opacity: 0.45;
        cursor: not-allowed;
    }
`;


const TitleRow = styled.button`
    display: flex;
    align-items: center;
    gap: 6px;
    background: transparent;
    border: none;
    padding: 0;
    margin: 0;
    cursor: pointer;
    font-size: 11px;
    font-weight: 400;
    color: var(--vscode-descriptionForeground);
    text-align: left;
    &:hover {
        opacity: 0.8;
    }
`;

const MethodBadge = styled.span<{ $color: string }>`
    background-color: ${({ $color }: { $color: string }) => $color};
    color: #fff;
    padding: 1px 5px;
    border-radius: 3px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    font-family: var(--vscode-font-family);
    white-space: nowrap;
    flex-shrink: 0;
`;

const NODE_KIND_FUNCTION = NodeKindEnum.MODULE_FUNCTION;
const NODE_KIND_RESOURCE = NodeKindEnum.OBJECT_FUNCTION;
const NODE_KIND_TYPE = NodeKindEnum.TYPE_DEFINITION;

interface DiffEntry {
    symbol: string;
    changeType: number;
    label: string;
    accessor?: string;
    kindLabel: string;
    nodeKind: number;
    viewIndex: number;
}

interface DiffGroup {
    groupLabel: string;
    entries: DiffEntry[];
}

type ViewMode = "diagram" | "code";

const ToggleGroup = styled.div`
    display: flex;
    align-items: center;
    height: 24px;
    padding: 2px;
    gap: 1px;
    border-radius: 6px;
    background-color: var(--vscode-editor-inactiveSelectionBackground);
`;

const ToggleOption = styled.button<{ active?: boolean; disabled?: boolean }>`
    display: flex;
    align-items: center;
    gap: 4px;
    height: 100%;
    padding: 0 5px;
    border: none;
    border-radius: 4px;
    background-color: ${(props: { active?: boolean }) =>
        props.active ? "var(--vscode-button-background)" : "transparent"};
    color: ${(props: { active?: boolean }) =>
        props.active ? "var(--vscode-button-foreground)" : "var(--vscode-descriptionForeground)"};
    cursor: ${(props: { disabled?: boolean }) => props.disabled ? "not-allowed" : "pointer"};
    opacity: ${(props: { disabled?: boolean }) => props.disabled ? 0.45 : 1};
    font-size: 11px;
    white-space: nowrap;
    transition: background-color 0.1s, color 0.1s;

    &:hover:not(:disabled) {
        background-color: ${(props: { active?: boolean }) =>
            props.active
                ? "var(--vscode-button-background)"
                : "var(--vscode-toolbar-hoverBackground)"};
        color: ${(props: { active?: boolean }) =>
            props.active
                ? "var(--vscode-button-foreground)"
                : "var(--vscode-foreground)"};
    }
`;

interface ReviewBarProps {
    modifiedFiles: string[];
    semanticDiffs?: SemanticDiff[];
    loadDesignDiagrams?: boolean;
    isWorkspace?: boolean;
    diffPackageMap?: string[];
    isDiscarded?: boolean;
    rpcClient?: any;
    isActive?: boolean;
    generationId: string;
}

function getFileName(filePath: string): string {
    const i = filePath.lastIndexOf("/");
    return i !== -1 ? filePath.substring(i + 1) : filePath;
}

function getDiffLabel(diff: SemanticDiff): string {
    if (diff.metadata) {
        if (diff.nodeKind === NODE_KIND_RESOURCE) {
            // Class methods are OBJECT_FUNCTION diffs too but carry only `name` —
            // fall through to it when there's no resource path.
            const m = diff.metadata as { accessor?: string; servicePath?: string; resourcePath?: string };
            if (m.resourcePath) return m.resourcePath;
        }
        const m = diff.metadata as { name?: string };
        if (m.name) return m.name;
    }
    return getFileName(diff.uri);
}

function getSymbol(changeType: number): string {
    switch (changeType) {
        case ChangeTypeEnum.ADDITION: return "+";
        case ChangeTypeEnum.DELETION: return "-";
        case ChangeTypeEnum.MODIFICATION: return "~";
        default: return "~";
    }
}

function getDiffKindLabel(diff: SemanticDiff): string {
    if (diff.nodeKind === NODE_KIND_FUNCTION) {
        const m = diff.metadata as { name?: string } | undefined;
        return m?.name === "main" ? "automation" : "function";
    }
    return getNodeKindLabel(diff.nodeKind, diff.metadata);
}

function getChangeTypeLabel(changeType: number): string {
    switch (changeType) {
        case ChangeTypeEnum.ADDITION: return "+ Added";
        case ChangeTypeEnum.DELETION: return "- Deleted";
        case ChangeTypeEnum.MODIFICATION: return "~ Modified";
        default: return "~ Modified";
    }
}

function buildGroups(semanticDiffs: SemanticDiff[], loadDesignDiagrams?: boolean): DiffGroup[] {
    const designCount = loadDesignDiagrams ? 1 : 0;
    const { groups } = buildGroupsWithOffset(semanticDiffs, designCount);
    if (!loadDesignDiagrams) return groups;
    const designGroup: DiffGroup = {
        groupLabel: "design",
        entries: [{ symbol: "", changeType: ChangeTypeEnum.MODIFICATION, label: "Design Diagram", kindLabel: "design", nodeKind: -1, viewIndex: 0 }],
    };
    return [designGroup, ...groups];
}

const PackageContent = styled.div`
    padding-left: 8px;
`;

interface PackageGroup {
    packageName: string;
    groups: DiffGroup[];
}

function buildPackageGroups(
    semanticDiffs: SemanticDiff[],
    diffPackageMap: string[],
    loadDesignDiagrams?: boolean
): PackageGroup[] {
    // Group diffs by package, preserving first-appearance order
    const orderedPkgs: string[] = [];
    const pkgDiffsMap: Record<string, SemanticDiff[]> = {};
    for (let i = 0; i < semanticDiffs.length; i++) {
        const pkgName = diffPackageMap[i] || "unknown";
        if (!pkgDiffsMap[pkgName]) {
            pkgDiffsMap[pkgName] = [];
            orderedPkgs.push(pkgName);
        }
        pkgDiffsMap[pkgName].push(semanticDiffs[i]);
    }

    // Design diagrams align 1:1 with packages that have diffs, in the same order
    const designCount = loadDesignDiagrams ? orderedPkgs.length : 0;
    let globalViewIndex = designCount;

    const result: PackageGroup[] = [];
    for (let pi = 0; pi < orderedPkgs.length; pi++) {
        const pkgName = orderedPkgs[pi];
        const diffs = pkgDiffsMap[pkgName];
        if (diffs.length === 0) continue;

        const { groups, viewCount } = buildGroupsWithOffset(diffs, globalViewIndex);
        globalViewIndex += viewCount;

        let finalGroups = groups;
        if (loadDesignDiagrams) {
            const designGroup: DiffGroup = {
                groupLabel: "design",
                entries: [{ symbol: "", changeType: ChangeTypeEnum.MODIFICATION, label: "Design Diagram", kindLabel: "design", nodeKind: -1, viewIndex: pi }],
            };
            finalGroups = [designGroup, ...groups];
        }

        result.push({ packageName: pkgName, groups: finalGroups });
    }

    return result;
}

function buildGroupsWithOffset(semanticDiffs: SemanticDiff[], startIndex: number): { groups: DiffGroup[]; viewCount: number } {
    let viewIndex = startIndex;

    const serviceGroups: Record<string, DiffEntry[]> = {};
    const functionEntries: DiffEntry[] = [];
    const typeEntries: DiffEntry[] = [];
    // Non-diagram construct kinds (constants, module vars, listeners, classes, enums, imports)
    const declarationEntries: DiffEntry[] = [];
    let hasTypeView = false;

    for (const diff of semanticDiffs) {
        const isType = diff.nodeKind === NODE_KIND_TYPE;
        if (isType && hasTypeView) continue;
        if (isType) hasTypeView = true;

        // OBJECT_FUNCTION covers both service members and plain class methods; only the
        // former carry a servicePath, and only they belong under a service group.
        const servicePath = diff.nodeKind === NODE_KIND_RESOURCE
            ? (diff.metadata as { servicePath?: string } | undefined)?.servicePath
            : undefined;

        const entry: DiffEntry = {
            symbol: getSymbol(diff.changeType),
            changeType: diff.changeType,
            label: isType ? "Types" : getDiffLabel(diff),
            accessor: servicePath !== undefined
                ? (diff.metadata as { accessor?: string } | undefined)?.accessor?.toUpperCase()
                : undefined,
            kindLabel: getDiffKindLabel(diff),
            nodeKind: diff.nodeKind,
            viewIndex,
        };
        viewIndex++;

        if (servicePath !== undefined) {
            const svcPath = servicePath || "/";
            if (!serviceGroups[svcPath]) serviceGroups[svcPath] = [];
            serviceGroups[svcPath].push(entry);
        } else if (diff.nodeKind === NODE_KIND_FUNCTION || diff.nodeKind === NODE_KIND_RESOURCE) {
            // Plain functions, and class methods (OBJECT_FUNCTION without a service path)
            functionEntries.push(entry);
        } else if (isType) {
            typeEntries.push(entry);
        } else {
            declarationEntries.push(entry);
        }
    }

    const groups: DiffGroup[] = [];

    for (const [svcPath, entries] of Object.entries(serviceGroups)) {
        groups.push({ groupLabel: `service ${svcPath}`, entries });
    }
    if (functionEntries.length > 0) {
        groups.push({ groupLabel: "functions", entries: functionEntries });
    }
    if (typeEntries.length > 0) {
        groups.push({ groupLabel: "types", entries: typeEntries });
    }
    if (declarationEntries.length > 0) {
        groups.push({ groupLabel: "declarations", entries: declarationEntries });
    }

    return { groups, viewCount: viewIndex - startIndex };
}

function groupFilesByPackage(files: string[]): Record<string, string[]> {
    const groups: Record<string, string[]> = {};
    for (const file of files) {
        const slashIdx = file.indexOf("/");
        const pkg = slashIdx !== -1 ? file.substring(0, slashIdx) : "Workspace";
        if (!groups[pkg]) groups[pkg] = [];
        groups[pkg].push(file);
    }
    return groups;
}

const PackageGroupList: React.FC<{
    packageGroups: PackageGroup[];
    onClickEntry?: (viewIndex: number) => void;
}> = ({ packageGroups, onClickEntry }) => {
    const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});

    const toggle = (pi: number) =>
        setCollapsed(prev => ({ ...prev, [pi]: !prev[pi] }));

    return (
        <ChangeList>
            {packageGroups.map((pkg, pi) => {
                const isCollapsed = !!collapsed[pi];
                const totalEntries = pkg.groups.reduce((sum, g) => sum + g.entries.length, 0);
                return (
                    <React.Fragment key={pi}>
                        <CollapsibleHeader onClick={() => toggle(pi)}>
                            <span
                                className={`codicon ${isCollapsed ? "codicon-chevron-right" : "codicon-chevron-down"}`}
                                style={{ fontSize: "10px" }}
                            />
                            <span className="codicon codicon-package" style={{ fontSize: "12px", color: "var(--vscode-descriptionForeground)" }} />
                            <span>{pkg.packageName}</span>
                            <CountBadge>{totalEntries}</CountBadge>
                        </CollapsibleHeader>
                        {!isCollapsed && (
                            <PackageContent>
                                <CollapsibleGroupList groups={pkg.groups} onClickEntry={onClickEntry} />
                            </PackageContent>
                        )}
                    </React.Fragment>
                );
            })}
        </ChangeList>
    );
};

const CodeViewPackageList: React.FC<{
    filesByPkg: Record<string, string[]>;
    pkgNames: string[];
    disabled: boolean;
    openFileDiff: (relativePath: string) => void;
}> = ({ filesByPkg, pkgNames, disabled, openFileDiff }) => {
    const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});

    const toggle = (pi: number) =>
        setCollapsed(prev => ({ ...prev, [pi]: !prev[pi] }));

    return (
        <ChangeList>
            {pkgNames.map((pkg, pi) => {
                const files = filesByPkg[pkg];
                const isCollapsed = !!collapsed[pi];
                return (
                    <React.Fragment key={pi}>
                        <CollapsibleHeader onClick={() => toggle(pi)}>
                            <span
                                className={`codicon ${isCollapsed ? "codicon-chevron-right" : "codicon-chevron-down"}`}
                                style={{ fontSize: "10px" }}
                            />
                            <span className="codicon codicon-package" style={{ fontSize: "12px", color: "var(--vscode-descriptionForeground)" }} />
                            <span>{pkg}</span>
                            <CountBadge>{files.length}</CountBadge>
                        </CollapsibleHeader>
                        {!isCollapsed && (
                            <PackageContent>
                                {files.map((file, i) => (
                                    <ChangeCard
                                        key={i}
                                        onClick={disabled ? undefined : () => openFileDiff(file)}
                                        disabled={disabled}
                                        title={file}
                                    >
                                        <CardLeft>
                                            <span className="codicon codicon-file" style={{ fontSize: "12px", color: "var(--vscode-descriptionForeground)" }} />
                                            <CardFileName>{getFileName(file)}</CardFileName>
                                        </CardLeft>
                                    </ChangeCard>
                                ))}
                            </PackageContent>
                        )}
                    </React.Fragment>
                );
            })}
        </ChangeList>
    );
};

function renderCard(entry: DiffEntry, i: number, onClickEntry?: (viewIndex: number) => void) {
    return (
        <ChangeCard
            key={i}
            onClick={onClickEntry ? () => onClickEntry(entry.viewIndex) : undefined}
            disabled={!onClickEntry}
            title={entry.label}
        >
            <CardLeft>
                <CardKindLabel>{entry.kindLabel}</CardKindLabel>
                {entry.accessor && (
                    <MethodBadge $color={getColorByMethod(entry.accessor)}>
                        {entry.accessor}
                    </MethodBadge>
                )}
                <CardFileName>{entry.label}</CardFileName>
            </CardLeft>
            <TypePill changeType={entry.changeType}>{getChangeTypeLabel(entry.changeType)}</TypePill>
        </ChangeCard>
    );
}

const CollapsibleGroupList: React.FC<{
    groups: DiffGroup[];
    onClickEntry?: (viewIndex: number) => void;
}> = ({ groups, onClickEntry }) => {
    const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});

    const toggle = (gi: number) =>
        setCollapsed(prev => ({ ...prev, [gi]: !prev[gi] }));

    return (
        <ChangeList>
            {groups.map((group, gi) => {
                const isService = group.groupLabel.startsWith("service ");
                const isFunctions = group.groupLabel === "functions";
                const isTypes = group.groupLabel === "types";
                const isDesign = group.groupLabel === "design";
                const isDeclarations = group.groupLabel === "declarations";
                const isCollapsible = isService || isFunctions || isDeclarations;
                const isCollapsed = !!collapsed[gi];

                const displayLabel = isService
                    ? group.groupLabel.slice("service ".length)
                    : isDeclarations
                    ? "declarations"
                    : "functions";

                return (
                    <React.Fragment key={gi}>
                        {isCollapsible && (
                            <CollapsibleHeader onClick={() => toggle(gi)}>
                                <span
                                    className={`codicon ${isCollapsed ? "codicon-chevron-right" : "codicon-chevron-down"}`}
                                    style={{ fontSize: "10px" }}
                                />
                                {isService && (
                                    <span className="codicon codicon-plug" style={{ fontSize: "11px", color: "var(--vscode-descriptionForeground)" }} />
                                )}
                                {isFunctions && (
                                    <span className="codicon codicon-symbol-method" style={{ fontSize: "11px", color: "var(--vscode-descriptionForeground)" }} />
                                )}
                                {isDeclarations && (
                                    <span className="codicon codicon-symbol-variable" style={{ fontSize: "11px", color: "var(--vscode-descriptionForeground)" }} />
                                )}
                                {isService && <span style={{ color: "var(--vscode-descriptionForeground)", fontWeight: 400 }}>service</span>}
                                <span>{displayLabel}</span>
                                <CountBadge>{group.entries.length}</CountBadge>
                            </CollapsibleHeader>
                        )}
                        {!isCollapsed && (
                            isDesign ? (
                                <TypesRow
                                    onClick={onClickEntry ? () => onClickEntry(group.entries[0].viewIndex) : undefined}
                                    disabled={!onClickEntry}
                                >
                                    <CardLeft>
                                        <span className="codicon codicon-type-hierarchy" style={{ fontSize: "11px", color: "var(--vscode-descriptionForeground)" }} />
                                        <span>Design Diagram</span>
                                    </CardLeft>
                                </TypesRow>
                            ) : isTypes ? (
                                <TypesRow
                                    onClick={onClickEntry ? () => onClickEntry(group.entries[0].viewIndex) : undefined}
                                    disabled={!onClickEntry}
                                >
                                    <CardLeft>
                                        <span className="codicon codicon-symbol-class" style={{ fontSize: "11px", color: "var(--vscode-descriptionForeground)" }} />
                                        <span>Types</span>
                                    </CardLeft>
                                    <TypePill changeType={group.entries[0].changeType}>
                                        {getChangeTypeLabel(group.entries[0].changeType)}
                                    </TypePill>
                                </TypesRow>
                            ) : group.entries.map((entry, i) => renderCard(entry, i, onClickEntry))
                        )}
                    </React.Fragment>
                );
            })}
        </ChangeList>
    );
};

export const ReviewBar: React.FC<ReviewBarProps> = ({
    modifiedFiles,
    semanticDiffs,
    loadDesignDiagrams,
    isWorkspace,
    diffPackageMap,
    isDiscarded = false,
    rpcClient,
    isActive = false,
    generationId,
}) => {
    const status = isDiscarded ? "discarded" : isActive ? "pending" : "accepted";
    const [isProcessing, setIsProcessing] = useState(false);
    const [isExpanded, setIsExpanded] = useState(isActive);
    const [isReviewModeOpen, setIsReviewModeOpen] = useState(false);

    useEffect(() => {
        setIsExpanded(isActive);
    }, [isActive]);

    const hasDiagramView = !!(semanticDiffs && semanticDiffs.length > 0);
    const [viewMode, setViewMode] = useState<ViewMode>(hasDiagramView ? "diagram" : "code");

    useEffect(() => {
        if (hasDiagramView) {
            setViewMode("diagram");
        }
    }, [hasDiagramView]);

    useEffect(() => {
        if (!rpcClient || !isActive) return;
        rpcClient.getVisualizerLocation().then((loc: VisualizerLocation) => {
            setIsReviewModeOpen(loc.view === MACHINE_VIEW.ReviewMode);
        });
        rpcClient.onReviewModeOpened(() => {
            setIsReviewModeOpen(true);
        });
        rpcClient.onReviewModeClosed(() => {
            setIsReviewModeOpen(false);
        });
    }, [rpcClient, isActive]);

    const groups = useMemo(() => {
        if (!semanticDiffs || semanticDiffs.length === 0) return null;
        return buildGroups(semanticDiffs, loadDesignDiagrams);
    }, [semanticDiffs, loadDesignDiagrams]);

    const packageGroups = useMemo(() => {
        if (!isWorkspace || !semanticDiffs || semanticDiffs.length === 0 || !diffPackageMap || diffPackageMap.length === 0) return null;
        return buildPackageGroups(semanticDiffs, diffPackageMap, loadDesignDiagrams);
    }, [isWorkspace, semanticDiffs, diffPackageMap, loadDesignDiagrams]);

    const navigateReviewMode = (index = 0) => {
        if (!rpcClient) return;
        rpcClient.getVisualizerRpcClient().navigateReviewMode({ generationId, index });
    };

    const openFileDiff = (relativePath: string) => {
        if (!rpcClient) return;
        rpcClient.getAiPanelRpcClient().openFileDiff({ relativePath, generationId });
    };

    const handleDiscard = async () => {
        if (!rpcClient) return;
        try {
            setIsProcessing(true);
            await rpcClient.getAiPanelRpcClient().revertGeneration({ generationId });
            rpcClient.getVisualizerRpcClient().goBack();
        } catch (error) {
            // Nothing was reverted (e.g. no checkpoint exists) — the backend already told
            // the user via an error notification. Keep the bar so the review stays
            // actionable; closing it here would make the failure look like a success.
            console.error("[ReviewBar] Error discarding changes:", error);
        } finally {
            setIsProcessing(false);
        }
    };

    const renderViewToggle = () => (
        <ToggleGroup>
            <ToggleOption
                active={viewMode === "diagram"}
                disabled={!hasDiagramView}
                title={hasDiagramView ? "Diagram" : "No diagram changes available"}
                onClick={() => hasDiagramView && setViewMode("diagram")}
            >
                Diagram
            </ToggleOption>
            <ToggleOption
                active={viewMode === "code"}
                title="Code"
                onClick={() => setViewMode("code")}
            >
                Code
            </ToggleOption>
        </ToggleGroup>
    );

    const filesByPkg = useMemo(() => {
        if (!isWorkspace || modifiedFiles.length === 0) return null;
        return groupFilesByPackage(modifiedFiles);
    }, [isWorkspace, modifiedFiles]);

    const renderCodeView = (disabled = false) => {
        if (filesByPkg) {
            const pkgNames = Object.keys(filesByPkg);
            return <CodeViewPackageList filesByPkg={filesByPkg} pkgNames={pkgNames} disabled={disabled} openFileDiff={openFileDiff} />;
        }
        return (
            <ChangeList>
                {modifiedFiles.map((file, i) => (
                    <ChangeCard
                        key={i}
                        onClick={disabled ? undefined : () => openFileDiff(file)}
                        disabled={disabled}
                        title={file}
                    >
                        <CardLeft>
                            <span className="codicon codicon-file" style={{ fontSize: "12px", color: "var(--vscode-descriptionForeground)" }} />
                            <CardFileName>{getFileName(file)}</CardFileName>
                        </CardLeft>
                    </ChangeCard>
                ))}
            </ChangeList>
        );
    };

    const titleColor = status !== "pending" ? "var(--vscode-descriptionForeground)" : "var(--vscode-foreground)";
    const titleWeight = 400;
    const titleText = status === "pending" ? "Changes made" : status === "accepted" ? "Changes made" : "Changes reverted";

    const renderContent = () => {
        if (viewMode === "diagram" && packageGroups && packageGroups.length > 0) {
            return <PackageGroupList packageGroups={packageGroups} onClickEntry={isActive ? (viewIndex: number) => navigateReviewMode(viewIndex) : undefined} />;
        }
        if (viewMode === "diagram" && groups && groups.length > 0) {
            return <CollapsibleGroupList groups={groups} onClickEntry={isActive ? (viewIndex: number) => navigateReviewMode(viewIndex) : undefined} />;
        }
        if (modifiedFiles.length > 0) {
            return renderCodeView(!isActive);
        }
        return null;
    };

    return (
        <Container subtle={status !== "pending"} expanded={isExpanded}>
            <TitleBarRow>
                <TitleRow onClick={() => setIsExpanded(v => !v)} style={{ fontSize: "13px", fontWeight: titleWeight, color: titleColor, opacity: status !== "pending" && !isExpanded ? 0.5 : 1 }}>
                    <span
                        className={`codicon ${isExpanded ? "codicon-chevron-down" : "codicon-chevron-right"}`}
                        style={{ fontSize: "11px" }}
                    />
                    {titleText}
                </TitleRow>
                <div style={{ display: "flex", alignItems: "center", gap: 4, visibility: isExpanded ? "visible" : "hidden" }}>
                    {isActive && !isReviewModeOpen && hasDiagramView && (
                        <ReviewIconButton
                            onClick={() => navigateReviewMode(0)}
                            disabled={isProcessing}
                            title="Open review mode"
                        >
                            <span className="codicon codicon-open-preview" style={{ fontSize: "12px" }} />
                            <span>Review</span>
                        </ReviewIconButton>
                    )}
                    {hasDiagramView && renderViewToggle()}
                </div>
            </TitleBarRow>
            {isExpanded && (
                <>
                    {renderContent()}
                    {isActive && (
                        <ActionRow>
                            <ActionButton onClick={handleDiscard} disabled={isProcessing} title="Revert changes">
                                <span className="codicon codicon-discard" style={{ fontSize: "11px" }} />
                                Revert
                            </ActionButton>
                        </ActionRow>
                    )}
                </>
            )}
        </Container>
    );
};

export default ReviewBar;
