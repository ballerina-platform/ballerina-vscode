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

import React, { useEffect, useState, useCallback } from "react";
import styled from "@emotion/styled";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { Button, Codicon } from "@wso2/ui-toolkit";
import {
    AddSkillRequest,
    DeleteSkillRequest,
    SkillEntry,
    SkillTier,
    ToggleSkillRequest,
} from "@wso2/ballerina-core";
import { AIChatView, PrimaryActionButton } from "../../styles";
import { Loader } from "../Loader";
import SkillRow from "./SkillRow";
import AddSkillModal from "./AddSkillModal";

// ─── Styled components ───────────────────────────────────────────────────────

const PanelHeader = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border-bottom: 1px solid var(--vscode-panel-border);
    flex-shrink: 0;
`;

const TitleGroup = styled.div`
    flex: 1;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
`;

const PanelTitle = styled.span`
    font-size: 14px;
    font-weight: 600;
    color: var(--vscode-foreground);
    font-family: var(--vscode-font-family);
`;


const HeaderDivider = styled.div`
    width: 1px;
    height: 14px;
    background: var(--vscode-widget-border, var(--vscode-panel-border));
    opacity: 0.6;
    flex-shrink: 0;
`;

const HeaderActions = styled.div`
    display: inline-flex;
    align-items: center;
    gap: 8px;
`;

const PanelContent = styled.div`
    flex: 1;
    overflow-y: auto;
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    gap: 20px;
    font-family: var(--vscode-font-family);
`;

// ─── Section components ───────────────────────────────────────────────────────

const Section = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
`;

const SectionHeader = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
`;

const SectionTitleButton = styled.button`
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: transparent;
    border: none;
    padding: 2px 0;
    margin: 0;
    cursor: pointer;
    color: var(--vscode-descriptionForeground);
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-family: var(--vscode-font-family);

    &:hover { color: var(--vscode-foreground); }

    .codicon { font-size: 12px; }
`;

const SectionDivider = styled.div`
    flex: 1;
    height: 1px;
    background: var(--vscode-widget-border, var(--vscode-panel-border));
    opacity: 0.5;
    align-self: center;
`;

const SectionHelper = styled.div`
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    margin: -2px 0 4px 16px;
`;

const RowsContainer = styled.div`
    display: flex;
    flex-direction: column;
    border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
    border-radius: 6px;
    overflow: hidden;
    background: var(--vscode-editor-background);
`;

const EmptyMessage = styled.div`
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
    padding: 6px 0;
`;

// ─── Component ───────────────────────────────────────────────────────────────

interface SkillsManagerProps {
    onClose: () => void;
    backTooltip?: string;
    onSkillsChange?: () => void;
}

const SkillsManager: React.FC<SkillsManagerProps> = ({ onClose, backTooltip, onSkillsChange }) => {
    const { rpcClient } = useRpcContext();
    const [skills, setSkills] = useState<SkillEntry[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [showAddModal, setShowAddModal] = useState(false);
    const [editModalSkill, setEditModalSkill] = useState<SkillEntry | undefined>(undefined);
    const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

    const loadSkills = useCallback(async () => {
        setIsLoading(true);
        try {
            const response = await rpcClient.getAiPanelRpcClient().getSkills();
            setSkills(response.skills);
        } catch (err) {
            console.error('[SkillsManager] Failed to load skills:', err);
        } finally {
            setIsLoading(false);
        }
    }, [rpcClient]);

    useEffect(() => {
        setCollapsedSections(new Set());
        loadSkills();
    }, [loadSkills]);

    const handleModalSubmit = async (req: AddSkillRequest) => {
        await rpcClient.getAiPanelRpcClient().addSkill(req);
        await loadSkills();
        onSkillsChange?.();
    };

    const handleModalClose = () => {
        setShowAddModal(false);
        setEditModalSkill(undefined);
    };

    const handleEditClick = (skill: SkillEntry) => {
        setEditModalSkill(skill);
        setShowAddModal(true);
    };

    const handleToggleClick = async (skill: SkillEntry, enabled: boolean) => {
        const req: ToggleSkillRequest = { skillId: skill.id, tier: skill.tier, enabled };
        try {
            await rpcClient.getAiPanelRpcClient().toggleSkill(req);
        } catch (err) {
            console.error('[SkillsManager] toggleSkill failed:', err);
        }
        await loadSkills();
        onSkillsChange?.();
    };

    const handleDeleteClick = async (skill: SkillEntry) => {
        const req: DeleteSkillRequest = {
            skillId: skill.id,
            tier: skill.tier as SkillTier.PROJECT | SkillTier.USER,
        };
        try {
            await rpcClient.getAiPanelRpcClient().deleteSkill(req);
        } catch (err) {
            console.error('[SkillsManager] deleteSkill failed:', err);
        }
        await loadSkills();
        onSkillsChange?.();
    };

    const toggleSectionCollapsed = (key: string) => {
        setCollapsedSections(prev => {
            const next = new Set(prev);
            if (next.has(key)) { next.delete(key); } else { next.add(key); }
            return next;
        });
    };

    const builtinSkills = skills.filter(s => s.tier === SkillTier.BUILTIN);
    const projectSkills = skills.filter(s => s.tier === SkillTier.PROJECT);
    const userSkills = skills.filter(s => s.tier === SkillTier.USER);

    const renderSkillCard = (skill: SkillEntry) => (
        <SkillRow
            key={skill.id}
            skill={skill}
            onToggle={handleToggleClick}
            onEdit={skill.tier !== SkillTier.BUILTIN ? handleEditClick : undefined}
            onDelete={skill.tier !== SkillTier.BUILTIN ? handleDeleteClick : undefined}
        />
    );

    const renderSection = (tier: SkillTier, label: string, helper: string, items: SkillEntry[], emptyText: string) => {
        const isCollapsed = collapsedSections.has(tier);
        return (
            <Section key={tier}>
                <SectionHeader>
                    <SectionTitleButton
                        type="button"
                        onClick={() => toggleSectionCollapsed(tier)}
                        title={isCollapsed ? "Expand section" : "Collapse section"}
                    >
                        <span className={`codicon codicon-${isCollapsed ? "chevron-right" : "chevron-down"}`} />
                        {label} ({items.length})
                    </SectionTitleButton>
                    <SectionDivider />
                </SectionHeader>
                {!isCollapsed && (
                    <>
                        <SectionHelper>{helper}</SectionHelper>
                        {items.length === 0
                            ? <EmptyMessage>{emptyText}</EmptyMessage>
                            : <RowsContainer>{items.map(renderSkillCard)}</RowsContainer>
                        }
                    </>
                )}
            </Section>
        );
    };

    return (
        <AIChatView>
            <PanelHeader>
                <Button appearance="icon" onClick={onClose} tooltip={backTooltip ?? "Back"}>
                    <Codicon name="arrow-left" />
                </Button>
                <TitleGroup>
                    <PanelTitle>Skills</PanelTitle>
                </TitleGroup>
                <HeaderDivider />
                <HeaderActions>
                    <PrimaryActionButton
                        type="button"
                        onClick={() => { setEditModalSkill(undefined); setShowAddModal(true); }}
                        title="Add a new skill"
                    >
                        <span className="codicon codicon-add" style={{ fontSize: 12 }} />
                        Add skill
                    </PrimaryActionButton>
                </HeaderActions>
            </PanelHeader>

            <PanelContent>
                {isLoading ? (
                    <Loader label="Loading skills…" />
                ) : (
                    <>
                        {renderSection(SkillTier.BUILTIN, "Built-in", "Skills shipped with the Copilot.", builtinSkills, "No built-in skills.")}
                        {renderSection(SkillTier.PROJECT, "Project", "Saved to this project and shared with your team.", projectSkills, "No project skills yet.")}
                        {renderSection(SkillTier.USER, "User", "Available across all your projects.", userSkills, "No user skills yet.")}
                    </>
                )}
            </PanelContent>

            <AddSkillModal
                isOpen={showAddModal}
                editSkill={editModalSkill}
                skills={skills}
                onSubmit={handleModalSubmit}
                onClose={handleModalClose}
            />
        </AIChatView>
    );
};

export default SkillsManager;
