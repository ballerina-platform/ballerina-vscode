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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { VSCodeLink } from "@vscode/webview-ui-toolkit/react";
import {
    DIRECTORY_MAP,
    EVENT_TYPE,
    MACHINE_VIEW,
    ProjectStructure,
    ProjectStructureArtifactResponse,
    VISIBILITY,
} from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { Button, Codicon, Icon, ThemeColors, Typography } from "@wso2/ui-toolkit";
import styled from "@emotion/styled";

// ── Layout ───────────────────────────────────────────────────────────────────

const LibraryWrapper = styled.div`
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-height: 0;
`;

const ArtifactsPanel = styled.div<{ constrainHeight?: boolean }>`
    border: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    border-radius: 4px;
    display: flex;
    flex-direction: column;
    ${(props: { constrainHeight?: boolean }) => props.constrainHeight
        ? `max-height: 380px; overflow: auto; flex-shrink: 0;`
        : `flex: 1; min-height: 0; overflow: auto;`
    }
`;

// ── Sticky header ─────────────────────────────────────────────────────────────

const LibraryHeader = styled.div`
    position: sticky;
    top: 0;
    z-index: 2;
    background: var(--vscode-editor-background);
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 16px;
    gap: 12px;
`;

const LibraryHeaderLeft = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
`;

const LibraryHeaderTitle = styled(Typography)`
    margin: 0;
    font-size: 16px;
`;

const LibraryHeaderRight = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
`;

// ── Search bar ────────────────────────────────────────────────────────────────

const SearchBar = styled.div`
    position: relative;
    display: flex;
    align-items: center;
    width: clamp(160px, 28vw, 340px);
`;

const SearchInput = styled.input`
    width: 100%;
    padding: 5px 26px 5px 28px;
    background: var(--vscode-input-background);
    border: 1px solid var(--vscode-input-border);
    border-radius: 4px;
    color: var(--vscode-input-foreground);
    font-size: 12px;
    font-family: var(--vscode-font-family);
    &:focus {
        outline: none;
        border-color: var(--vscode-focusBorder);
    }
    &::placeholder {
        color: var(--vscode-input-placeholderForeground);
    }
`;

const SearchIcon = styled.div`
    position: absolute;
    left: 8px;
    color: var(--vscode-input-placeholderForeground);
    pointer-events: none;
    display: flex;
    align-items: center;
`;

const SearchClearButton = styled.button`
    position: absolute;
    right: 6px;
    display: flex;
    align-items: center;
    cursor: pointer;
    color: var(--vscode-input-placeholderForeground);
    font: inherit;
    appearance: none;
    padding: 0;
    border: none;
    background: none;
    &:hover { color: var(--vscode-input-foreground); }
`;

// ── Overview: section summary cards ──────────────────────────────────────────

const OverviewContent = styled.div`
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 24px;
`;

const SectionCardGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 12px;
`;

const SectionCard = styled.button`
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 14px;
    border: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    border-radius: 4px;
    background: ${ThemeColors.SURFACE_DIM};
    color: ${ThemeColors.ON_SURFACE};
    cursor: pointer;
    font: inherit;
    text-align: left;
    appearance: none;
    width: 100%;
    &:hover {
        background: ${ThemeColors.PRIMARY_CONTAINER};
        border-color: ${ThemeColors.HIGHLIGHT};
    }
`;

const SectionCardTopRow = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
`;

const SectionCardIconWrapper = styled.div`
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    > div:first-child {
        width: 24px;
        height: 24px;
        font-size: 24px;
    }
`;

const SectionCardName = styled.span`
    flex: 1;
    font-size: 14px;
    font-weight: 600;
    color: ${ThemeColors.ON_SURFACE};
`;

const SectionCountBadge = styled.span`
    font-size: 11px;
    font-weight: 600;
    color: ${ThemeColors.ON_SURFACE};
    background: color-mix(in srgb, ${ThemeColors.PRIMARY} 12%, transparent);
    border: 1px solid color-mix(in srgb, ${ThemeColors.PRIMARY} 20%, transparent);
    border-radius: 10px;
    padding: 1px 8px;
    line-height: 18px;
    flex-shrink: 0;
`;

const SectionCardDescription = styled.span`
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
    line-height: 1.4;
`;


// ── Search results (global) ───────────────────────────────────────────────────

const SearchResultsContent = styled.div`
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 24px;
`;

const SearchResultGroup = styled.div`
    display: flex;
    flex-direction: column;
    gap: 10px;
`;

const SearchResultGroupHeader = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
`;

const SearchResultGroupTitle = styled.span`
    font-size: 13px;
    font-weight: 600;
    color: ${ThemeColors.ON_SURFACE};
    opacity: 0.7;
`;

const SearchResultGroupCount = styled.span`
    font-size: 11px;
    color: ${ThemeColors.ON_SURFACE};
    opacity: 0.5;
`;

const NoResultsLabel = styled.span`
    font-size: 12px;
    color: ${ThemeColors.ON_SURFACE};
    opacity: 0.6;
`;

// ── Artifact card grid ────────────────────────────────────────────────────────

const CardGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 12px;
`;

// ── Artifact card (ReactNode title for search highlight) ──────────────────────

const ArtifactCardRoot = styled.button`
    width: 100%;
    padding: 12px;
    border-radius: 4px;
    border: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    background-color: ${ThemeColors.SURFACE_DIM};
    cursor: pointer;
    font: inherit;
    text-align: left;
    appearance: none;
    &:hover {
        background-color: ${ThemeColors.PRIMARY_CONTAINER};
        border-color: ${ThemeColors.HIGHLIGHT};
    }
`;

const ArtifactCardInner = styled.div`
    display: flex;
    gap: 12px;
    align-items: center;
`;

const ArtifactCardIconContainer = styled.div`
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: ${ThemeColors.ON_SURFACE};
    > div:first-child {
        width: 24px;
        height: 24px;
        font-size: 24px;
    }
`;

const ArtifactCardContent = styled.div`
    flex: 1;
    overflow: hidden;
`;

const ArtifactCardTitle = styled.p`
    font-size: 13px;
    font-weight: bold;
    color: ${ThemeColors.ON_SURFACE};
    margin: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
`;

const PublicBadge = styled.span`
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-left: -8px;
    color: ${ThemeColors.ON_SURFACE};
    opacity: 0.7;
    line-height: 1;
    > * { display: flex; align-items: center; justify-content: center; }
`;

const HighlightMatch = styled.span`
    font-weight: 700;
    text-decoration: underline;
    text-decoration-color: ${ThemeColors.PRIMARY};
    text-underline-offset: 2px;
`;

// ── Empty-section "Add" card ──────────────────────────────────────────────────

const AddArtifactCard = styled.button`
    width: 100%;
    padding: 12px;
    border-radius: 4px;
    border: 1px dashed ${ThemeColors.OUTLINE_VARIANT};
    background-color: transparent;
    cursor: pointer;
    font: inherit;
    text-align: left;
    appearance: none;
    opacity: 0.6;
    &:hover {
        opacity: 1;
        background-color: ${ThemeColors.PRIMARY_CONTAINER};
        border-color: ${ThemeColors.PRIMARY};
        border-style: solid;
    }
`;

// ── Card wrapper with hover delete ────────────────────────────────────────────

const CardWrapper = styled.div`
    position: relative;
    &:hover .delete-overlay { display: flex; }
`;

const DeleteOverlay = styled.button`
    display: none;
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    right: 8px;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border-radius: 4px;
    cursor: pointer;
    color: ${ThemeColors.ON_SURFACE};
    background: var(--vscode-sideBar-background);
    border: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    opacity: 0.9;
    z-index: 1;
    font: inherit;
    appearance: none;
    padding: 0;
    &:hover {
        color: ${ThemeColors.ERROR};
        background: color-mix(in srgb, ${ThemeColors.ERROR} 10%, var(--vscode-sideBar-background));
        border-color: color-mix(in srgb, ${ThemeColors.ERROR} 40%, transparent);
        opacity: 1;
    }
`;

// ── Section detail ────────────────────────────────────────────────────────────

const SectionDetailContent = styled.div`
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 16px;
`;

// ── README ────────────────────────────────────────────────────────────────────

const ReadmeSection = styled.div`
    border: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    border-radius: 4px;
    padding: 16px;
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
`;

const ReadmeHeaderRow = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
`;

const ReadmeTitle = styled(Typography)`
    margin: 0;
`;

const ReadmeContentArea = styled.div`
    margin-top: 16px;
    flex: 1;
    overflow: auto;
    text-wrap: pretty;
    overflow-wrap: break-word;
    p, li, td, th, blockquote { overflow-wrap: break-word; }
    pre { overflow-x: auto; overflow-wrap: break-word; }
    code { white-space: pre-wrap; overflow-wrap: break-word; }
`;

const EmptyReadmeContainer = styled.div`
    display: flex;
    margin: 32px 0;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    justify-content: center;
`;

const LibraryEmptyState = styled.div`
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 48px 24px;
    gap: 12px;
`;

// ── Config ────────────────────────────────────────────────────────────────────

interface SectionConfig {
    key: DIRECTORY_MAP;
    title: string;
    icon: string;
    description: string;
    addLabel: string;
    addTooltip: string;
    npOnly?: boolean;
}

const SECTIONS: SectionConfig[] = [
    {
        key: DIRECTORY_MAP.TYPE,
        title: "Types",
        icon: "bi-type",
        description: "Custom data types defined in your library.",
        addLabel: "Add a Type",
        addTooltip: "Add New Type",
    },
    {
        key: DIRECTORY_MAP.FUNCTION,
        title: "Functions",
        icon: "bi-function",
        description: "Functions defined in your library.",
        addLabel: "Add a Function",
        addTooltip: "Add New Function",
    },
    {
        key: DIRECTORY_MAP.DATA_MAPPER,
        title: "Data Mappers",
        icon: "dataMapper",
        description: "Data transformation mappings for your library.",
        addLabel: "Add a Data Mapper",
        addTooltip: "Add New Data Mapper",
    },
    {
        key: DIRECTORY_MAP.CONNECTION,
        title: "Connections",
        icon: "bi-connection",
        description: "Client connections to external services.",
        addLabel: "Add a Connection",
        addTooltip: "Add New Connection",
    },
    {
        key: DIRECTORY_MAP.AGENTS,
        title: "Agents",
        icon: "bi-ai-agent",
        description: "AI agents defined in your library.",
        addLabel: "Add an Agent",
        addTooltip: "Add New Agent",
    },
    {
        key: DIRECTORY_MAP.CONFIGURABLE,
        title: "Configurations",
        icon: "bi-config",
        description: "Configurable values defined in your library.",
        addLabel: "Add a Configuration",
        addTooltip: "Add New Configuration",
    },
    {
        key: DIRECTORY_MAP.NP_FUNCTION,
        title: "Natural Functions",
        icon: "bi-ai-function",
        description: "AI-powered functions written in natural language.",
        addLabel: "Add a Natural Function",
        addTooltip: "Add New Natural Function",
        npOnly: true,
    },
];

// ── ArtifactCard ──────────────────────────────────────────────────────────────

interface ArtifactCardProps {
    icon: React.ReactNode;
    title: string;
    query: string;
    isPublic?: boolean;
    onClick: () => void;
}

function ArtifactCard({ icon, title, query, isPublic, onClick }: ArtifactCardProps) {
    const highlightedTitle = useMemo(() => {
        if (!query) return <>{title}</>;
        const idx = title.toLowerCase().indexOf(query);
        if (idx === -1) return <>{title}</>;
        return (
            <>
                {title.slice(0, idx)}
                <HighlightMatch>{title.slice(idx, idx + query.length)}</HighlightMatch>
                {title.slice(idx + query.length)}
            </>
        );
    }, [title, query]);

    return (
        <ArtifactCardRoot
            type="button"
            onClick={onClick}
            aria-label={`Open ${title}`}
        >
            <ArtifactCardInner>
                <ArtifactCardIconContainer>{icon}</ArtifactCardIconContainer>
                {isPublic && (
                    <PublicBadge title="Public">
                        <Codicon name="globe" iconSx={{ fontSize: 13 }} />
                    </PublicBadge>
                )}
                <ArtifactCardContent>
                    <ArtifactCardTitle>{highlightedTitle}</ArtifactCardTitle>
                </ArtifactCardContent>
            </ArtifactCardInner>
        </ArtifactCardRoot>
    );
}

// ── Component ─────────────────────────────────────────────────────────────────

interface LibraryOverviewProps {
    projectStructure: ProjectStructure;
    isNPSupported: boolean;
    projectPath: string;
    onRefresh: () => void;
}

export function LibraryOverview({ projectStructure, isNPSupported, projectPath, onRefresh }: LibraryOverviewProps) {
    const { rpcClient } = useRpcContext();

    const [activeSection, setActiveSection] = useState<SectionConfig | null>(null);
    const [overviewSearch, setOverviewSearch] = useState("");
    const [sectionSearch, setSectionSearch] = useState("");
    const [experimentalEnabled, setExperimentalEnabled] = useState(false);
    const [readmeContent, setReadmeContent] = useState("");

    const overviewSearchRef = useRef<HTMLInputElement>(null);
    const sectionSearchRef = useRef<HTMLInputElement>(null);

    const fetchReadme = useCallback(() => {
        rpcClient.getBIDiagramRpcClient().getReadmeContent({ projectPath }).then((res) => {
            setReadmeContent(res.content);
        });
    }, [rpcClient, projectPath]);

    useEffect(() => {
        rpcClient.getCommonRpcClient().experimentalEnabled().then(setExperimentalEnabled);
        fetchReadme();
    }, [rpcClient, fetchReadme]);

    useEffect(() => {
        if (!rpcClient) {
            return;
        }
        rpcClient.onProjectContentUpdated((state: boolean) => {
            if (state) {
                fetchReadme();
            }
        });
    }, [rpcClient, fetchReadme]);

    const showNaturalFunctions = isNPSupported && experimentalEnabled;

    const isOverviewSearching = overviewSearch.trim().length > 0;
    const overviewQuery = overviewSearch.trim().toLowerCase();
    const isSectionSearching = sectionSearch.trim().length > 0;
    const sectionQuery = sectionSearch.trim().toLowerCase();

    const dirMap = projectStructure.directoryMap as Record<string, ProjectStructureArtifactResponse[]>;

    const visibleSections = useMemo(
        () => SECTIONS.filter((s) => !s.npOnly || showNaturalFunctions),
        [showNaturalFunctions]
    );

    const sectionsWithItems = useMemo(() => {
        return visibleSections.map((section) => {
            const allItems: ProjectStructureArtifactResponse[] = dirMap[section.key] ?? [];
            const filteredItems = isOverviewSearching
                ? allItems.filter((item) => item.name.toLowerCase().includes(overviewQuery))
                : allItems;
            return { section, allItems, filteredItems };
        });
    }, [dirMap, visibleSections, overviewQuery, isOverviewSearching]);

    const isLibraryEmpty = useMemo(
        () => visibleSections.every((s) => (dirMap[s.key] ?? []).length === 0),
        [visibleSections, dirMap]
    );

    const nonEmptySections = useMemo(
        () => sectionsWithItems.filter((s) => s.allItems.length > 0),
        [sectionsWithItems]
    );

    const sectionAllItems = useMemo(
        () => (activeSection ? (dirMap[activeSection.key] ?? []) : []),
        [activeSection, dirMap]
    );

    const sectionDetailItems = useMemo(() => {
        if (!activeSection) return [];
        return isSectionSearching
            ? sectionAllItems.filter((item) => item.name.toLowerCase().includes(sectionQuery))
            : sectionAllItems;
    }, [activeSection, sectionAllItems, sectionQuery, isSectionSearching]);

    // ── Action handlers ───────────────────────────────────────────────────────

    const handleAdd = (key: DIRECTORY_MAP) => {
        if (key === DIRECTORY_MAP.CONNECTION) {
            rpcClient.getVisualizerRpcClient().openView({
                type: EVENT_TYPE.OPEN_VIEW,
                location: { view: MACHINE_VIEW.AddConnectionWizard },
                isPopup: true,
            });
        } else if (key === DIRECTORY_MAP.AGENTS) {
            rpcClient.getVisualizerRpcClient().openView({
                type: EVENT_TYPE.OPEN_VIEW,
                location: { view: MACHINE_VIEW.AddAgent },
                isPopup: true,
            });
        } else if (key === DIRECTORY_MAP.TYPE) {
            rpcClient.getVisualizerRpcClient().openView({
                type: EVENT_TYPE.OPEN_VIEW,
                location: { view: MACHINE_VIEW.TypeDiagram, addType: true },
            });
        } else if (key === DIRECTORY_MAP.FUNCTION) {
            rpcClient.getVisualizerRpcClient().openView({
                type: EVENT_TYPE.OPEN_VIEW,
                location: { view: MACHINE_VIEW.BIFunctionForm },
            });
        } else if (key === DIRECTORY_MAP.NP_FUNCTION) {
            rpcClient.getVisualizerRpcClient().openView({
                type: EVENT_TYPE.OPEN_VIEW,
                location: { view: MACHINE_VIEW.BINPFunctionForm },
            });
        } else if (key === DIRECTORY_MAP.DATA_MAPPER) {
            rpcClient.getVisualizerRpcClient().openView({
                type: EVENT_TYPE.OPEN_VIEW,
                location: { view: MACHINE_VIEW.BIDataMapperForm },
            });
        } else if (key === DIRECTORY_MAP.CONFIGURABLE) {
            rpcClient.getVisualizerRpcClient().openView({
                type: EVENT_TYPE.OPEN_VIEW,
                location: { view: MACHINE_VIEW.AddConfigVariables },
            });
        }
    };

    const handleItemClick = (key: DIRECTORY_MAP, item: ProjectStructureArtifactResponse) => {
        if (key === DIRECTORY_MAP.CONNECTION) {
            rpcClient.getVisualizerRpcClient().openView({
                type: EVENT_TYPE.OPEN_VIEW,
                location: { view: MACHINE_VIEW.EditConnectionWizard, identifier: item.name },
                isPopup: true,
            });
        } else if (key === DIRECTORY_MAP.TYPE) {
            rpcClient.getVisualizerRpcClient().openView({
                type: EVENT_TYPE.OPEN_VIEW,
                location: { view: MACHINE_VIEW.TypeDiagram, documentUri: item.path, position: item.position },
            });
        } else if (key === DIRECTORY_MAP.CONFIGURABLE) {
            rpcClient.getVisualizerRpcClient().openView({
                type: EVENT_TYPE.OPEN_VIEW,
                location: { view: MACHINE_VIEW.ViewConfigVariables },
            });
        } else if (item.position && item.path) {
            rpcClient.getVisualizerRpcClient().openView({
                type: EVENT_TYPE.OPEN_VIEW,
                location: { documentUri: item.path, position: item.position },
            });
        }
    };

    const handleDelete = async (item: ProjectStructureArtifactResponse) => {
        if (!item.position || !item.path) return;
        await rpcClient.getBIDiagramRpcClient().deleteByComponentInfo({
            filePath: item.path,
            component: {
                name: item.name,
                filePath: item.path,
                startLine: item.position.startLine,
                startColumn: item.position.startColumn,
                endLine: item.position.endLine,
                endColumn: item.position.endColumn,
            },
        });
        onRefresh();
    };

    const handleSectionOpen = (section: SectionConfig) => {
        setActiveSection(section);
        setSectionSearch("");
    };

    const handleBack = () => setActiveSection(null);

    const handleAddArtifacts = () => {
        rpcClient.getVisualizerRpcClient().openView({
            type: EVENT_TYPE.OPEN_VIEW,
            location: { view: MACHINE_VIEW.BIComponentView },
        });
    };

    const handleEditReadme = () => {
        rpcClient.getBIDiagramRpcClient().openReadme({ projectPath });
    };

    // ── Artifact cards renderer (shared by search results + section detail) ──

    const renderArtifactCard = (
        item: ProjectStructureArtifactResponse,
        sectionKey: DIRECTORY_MAP,
        icon: string,
        query: string
    ) => (
        <CardWrapper key={item.id}>
            <ArtifactCard
                icon={<Icon name={icon} />}
                title={item.name}
                query={query}
                isPublic={item.visibility === VISIBILITY.PUBLIC}
                onClick={() => handleItemClick(sectionKey, item)}
            />
            {item.position && item.path && (
                <DeleteOverlay
                    type="button"
                    className="delete-overlay"
                    aria-label="Delete artifact"
                    onClick={(e: React.MouseEvent) => {
                        e.stopPropagation();
                        handleDelete(item);
                    }}
                >
                    <Codicon name="trash" iconSx={{ fontSize: 16 }} />
                </DeleteOverlay>
            )}
        </CardWrapper>
    );

    // ── Section detail view ───────────────────────────────────────────────────

    if (activeSection) {
        return (
            <LibraryWrapper>
            <ArtifactsPanel>
                <LibraryHeader>
                    <LibraryHeaderLeft>
                        <Button appearance="icon" onClick={handleBack} buttonSx={{ padding: "2px 6px" }}>
                            <Codicon name="arrow-left" />
                        </Button>
                        <Icon name={activeSection.icon} sx={{ fontSize: 18, width: 18, height: 18 }} />
                        <LibraryHeaderTitle variant="h2">{activeSection.title}</LibraryHeaderTitle>
                    </LibraryHeaderLeft>
                    <LibraryHeaderRight>
                        <SearchBar>
                            <SearchIcon><Codicon name="search" iconSx={{ fontSize: 12 }} /></SearchIcon>
                            <SearchInput
                                ref={sectionSearchRef}
                                type="text"
                                placeholder={`Search ${activeSection.title.toLowerCase()}`}
                                value={sectionSearch}
                                onChange={(e) => setSectionSearch(e.target.value)}
                                autoFocus
                            />
                            {isSectionSearching && (
                                <SearchClearButton
                                    type="button"
                                    aria-label="Clear search"
                                    onClick={() => { setSectionSearch(""); sectionSearchRef.current?.focus(); }}
                                >
                                    <Codicon name="close" iconSx={{ fontSize: 12 }} />
                                </SearchClearButton>
                            )}
                        </SearchBar>
                        <Button
                            appearance="primary"
                            onClick={() => handleAdd(activeSection.key)}
                        >
                            <Codicon name="add" sx={{ marginRight: 8 }} /> Add {activeSection.addLabel.replace(/^Add an? /, "")}
                        </Button>
                    </LibraryHeaderRight>
                </LibraryHeader>

                <SectionDetailContent>
                    <CardGrid>
                        {sectionDetailItems.map((item) =>
                            renderArtifactCard(item, activeSection.key, activeSection.icon, sectionQuery)
                        )}
                        {sectionAllItems.length === 0 && (
                            <AddArtifactCard
                                type="button"
                                onClick={() => handleAdd(activeSection.key)}
                            >
                                <ArtifactCardInner>
                                    <ArtifactCardIconContainer>
                                        <Codicon name="add" iconSx={{ fontSize: 24, width: 24, height: 24 }} />
                                    </ArtifactCardIconContainer>
                                    <ArtifactCardContent>
                                        <ArtifactCardTitle>{activeSection.addLabel}</ArtifactCardTitle>
                                    </ArtifactCardContent>
                                </ArtifactCardInner>
                            </AddArtifactCard>
                        )}
                        {isSectionSearching && sectionDetailItems.length === 0 && sectionAllItems.length > 0 && (
                            <NoResultsLabel>No matching {activeSection.title.toLowerCase()}</NoResultsLabel>
                        )}
                    </CardGrid>
                </SectionDetailContent>
            </ArtifactsPanel>
            </LibraryWrapper>
        );
    }

    // ── Overview view ─────────────────────────────────────────────────────────

    const searchGroups = sectionsWithItems.filter((s) => s.filteredItems.length > 0);

    return (
        <LibraryWrapper>
            <ArtifactsPanel constrainHeight>
            <LibraryHeader>
                <LibraryHeaderLeft>
                    <LibraryHeaderTitle variant="h2">Artifacts</LibraryHeaderTitle>
                </LibraryHeaderLeft>
                <LibraryHeaderRight>
                    {!isLibraryEmpty && (
                        <SearchBar>
                            <SearchIcon><Codicon name="search" iconSx={{ fontSize: 12 }} /></SearchIcon>
                            <SearchInput
                                ref={overviewSearchRef}
                                type="text"
                                placeholder="Search across all sections"
                                value={overviewSearch}
                                onChange={(e) => setOverviewSearch(e.target.value)}
                            />
                            {isOverviewSearching && (
                                <SearchClearButton
                                    type="button"
                                    aria-label="Clear search"
                                    onClick={() => { setOverviewSearch(""); overviewSearchRef.current?.focus(); }}
                                >
                                    <Codicon name="close" iconSx={{ fontSize: 12 }} />
                                </SearchClearButton>
                            )}
                        </SearchBar>
                    )}
                    {!isLibraryEmpty && (
                        <Button appearance="primary" onClick={handleAddArtifacts}>
                            <Codicon name="add" sx={{ marginRight: 8 }} /> Add Artifacts
                        </Button>
                    )}
                </LibraryHeaderRight>
            </LibraryHeader>

            {/* Global search results */}
            {isOverviewSearching && (
                <SearchResultsContent>
                    {searchGroups.length > 0 ? (
                        searchGroups.map(({ section, filteredItems, allItems }) => (
                            <SearchResultGroup key={section.key}>
                                <SearchResultGroupHeader>
                                    <Icon name={section.icon} sx={{ fontSize: 16, width: 16, height: 16 }} />
                                    <SearchResultGroupTitle>{section.title}</SearchResultGroupTitle>
                                    <SearchResultGroupCount>
                                        {filteredItems.length}/{allItems.length}
                                    </SearchResultGroupCount>
                                </SearchResultGroupHeader>
                                <CardGrid>
                                    {filteredItems.map((item) =>
                                        renderArtifactCard(item, section.key, section.icon, overviewQuery)
                                    )}
                                </CardGrid>
                            </SearchResultGroup>
                        ))
                    ) : (
                        <NoResultsLabel>No artifacts matching &ldquo;{overviewSearch.trim()}&rdquo;</NoResultsLabel>
                    )}
                </SearchResultsContent>
            )}

            {/* Overview: section cards (non-empty only) or empty state */}
            {!isOverviewSearching && (
                isLibraryEmpty ? (
                    <LibraryEmptyState>
                        <Typography variant="h3" sx={{ marginBottom: "8px" }}>
                            Your library is empty
                        </Typography>
                        <Typography
                            variant="body1"
                            sx={{ marginBottom: "16px", color: "var(--vscode-descriptionForeground)" }}
                        >
                            Start by adding reusable artifacts to your library
                        </Typography>
                        <Button appearance="primary" onClick={handleAddArtifacts}>
                            <Codicon name="add" sx={{ marginRight: 8 }} /> Add Artifacts
                        </Button>
                    </LibraryEmptyState>
                ) : (
                    <OverviewContent>
                        <SectionCardGrid>
                            {nonEmptySections.map(({ section, allItems }) => (
                                <SectionCard
                                    key={section.key}
                                    id={`section-${section.key}`}
                                    type="button"
                                    onClick={() => handleSectionOpen(section)}
                                >
                                    <SectionCardTopRow>
                                        <SectionCardIconWrapper>
                                            <Icon name={section.icon} />
                                        </SectionCardIconWrapper>
                                        <SectionCardName>{section.title}</SectionCardName>
                                        <SectionCountBadge>{allItems.length}</SectionCountBadge>
                                    </SectionCardTopRow>
                                    <SectionCardDescription>{section.description}</SectionCardDescription>
                                </SectionCard>
                            ))}
                        </SectionCardGrid>
                    </OverviewContent>
                )
            )}
            </ArtifactsPanel>

            {/* README — separate container, hidden when searching */}
            {!isOverviewSearching && (
                <ReadmeSection>
                    <ReadmeHeaderRow>
                        <ReadmeTitle variant="h2">README</ReadmeTitle>
                        <Button appearance="icon" onClick={handleEditReadme} buttonSx={{ padding: "4px 8px" }}>
                            <Icon name="bi-edit" sx={{ marginRight: 8, fontSize: 16 }} /> Edit
                        </Button>
                    </ReadmeHeaderRow>
                    <ReadmeContentArea>
                        {readmeContent ? (
                            <ReactMarkdown>{readmeContent}</ReactMarkdown>
                        ) : (
                            <EmptyReadmeContainer>
                                <Typography variant="body2" sx={{ color: "var(--vscode-descriptionForeground)" }}>
                                    Describe your library to help users understand how to use it
                                </Typography>
                                <VSCodeLink onClick={handleEditReadme}>Add a README</VSCodeLink>
                            </EmptyReadmeContainer>
                        )}
                    </ReadmeContentArea>
                </ReadmeSection>
            )}
        </LibraryWrapper>
    );
}

export default LibraryOverview;
