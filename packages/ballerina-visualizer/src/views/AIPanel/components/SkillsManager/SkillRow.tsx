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

import React, { useState } from "react";
import styled from "@emotion/styled";
import { SkillEntry, SkillTier } from "@wso2/ballerina-core";
import { SecondaryActionButton, DangerActionButton, ToggleSwitch } from "../../styles";

// ─── Styled components (mirrors McpManagerPanel's compact row) ───────────────

const Row = styled.div`
    display: flex;
    flex-direction: column;
    border-bottom: 1px solid var(--vscode-panel-border);

    &:last-child { border-bottom: none; }
`;

const RowHeader = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    transition: background 0.12s ease;

    &:hover { background: var(--vscode-list-hoverBackground); }

    &:hover .skill-row-actions,
    &:focus-within .skill-row-actions {
        visibility: visible;
    }
`;

const RowMain = styled.div`
    flex: 1;
    min-width: 0;
    display: inline-flex;
    align-items: baseline;
    gap: 8px;
`;

const RowName = styled.span<{ $dim?: boolean }>`
    flex-shrink: 0;
    max-width: 50%;
    font-size: 13px;
    font-weight: 500;
    color: ${(p: { $dim?: boolean }) => (p.$dim
        ? "var(--vscode-descriptionForeground)"
        : "var(--vscode-foreground)")};
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

const RowMeta = styled.span`
    flex: 1;
    min-width: 0;
    font-size: 11.5px;
    color: var(--vscode-descriptionForeground);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

const RowActions = styled.div`
    display: inline-flex;
    align-items: center;
    gap: 2px;
    flex-shrink: 0;
    visibility: hidden;
    /* Rendered after the toggle in the DOM (so forward tab reaches it once
       :focus-within reveals it), but kept left of the toggle visually. */
    order: 1;
`;

const RowIconButton = styled.button<{ $danger?: boolean }>`
    width: 22px;
    height: 22px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-radius: 3px;
    cursor: pointer;
    color: var(--vscode-descriptionForeground);
    font-family: var(--vscode-font-family);

    &:hover {
        background: ${(p: { $danger?: boolean }) => (p.$danger
            ? "var(--vscode-inputValidation-errorBackground, var(--vscode-toolbar-hoverBackground))"
            : "var(--vscode-toolbar-hoverBackground)")};
        color: ${(p: { $danger?: boolean }) => (p.$danger
            ? "var(--vscode-errorForeground)"
            : "var(--vscode-foreground)")};
    }

    .codicon { font-size: 14px; }
`;


const ConfirmRow = styled.div`
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    font-size: 12px;
    color: var(--vscode-foreground);
`;

const ConfirmText = styled.span`
    flex: 0 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;

    strong { font-weight: 600; }
`;

const Spacer = styled.div`
    flex: 1;
`;

const ActionButton = SecondaryActionButton;
const DeleteButton = DangerActionButton;

const getShortName = (name: string) =>
    name.includes('/') ? name.split('/').pop()! : name;

// ─── Component ───────────────────────────────────────────────────────────────

interface SkillRowProps {
    skill: SkillEntry;
    onToggle?: (skill: SkillEntry, enabled: boolean) => void;
    onEdit?: (skill: SkillEntry) => void;
    onDelete?: (skill: SkillEntry) => void;
}

const SkillRow: React.FC<SkillRowProps> = ({ skill, onToggle, onEdit, onDelete }) => {
    const isEditable = skill.tier === SkillTier.PROJECT || skill.tier === SkillTier.USER;
    const [confirming, setConfirming] = useState(false);
    const shortName = getShortName(skill.name);
    const enabled = skill.enabled !== false;

    return (
        <Row>
            <RowHeader>
                {confirming ? (
                    <ConfirmRow>
                        <ConfirmText>Delete <strong>{shortName}</strong>?</ConfirmText>
                        <Spacer />
                        <DeleteButton type="button" onClick={() => { setConfirming(false); onDelete?.(skill); }}>Yes, delete</DeleteButton>
                        <ActionButton type="button" onClick={() => setConfirming(false)}>Cancel</ActionButton>
                    </ConfirmRow>
                ) : (
                    <>
                        <RowMain>
                            <RowName $dim={!enabled} title={skill.name}>{shortName}</RowName>
                            {skill.trigger && <RowMeta title={skill.trigger}>{skill.trigger}</RowMeta>}
                        </RowMain>
                        {onToggle && skill.optional !== false && (
                            <ToggleSwitch
                                type="button"
                                role="switch"
                                aria-checked={enabled}
                                aria-label={`${enabled ? "Disable" : "Enable"} ${skill.name} skill`}
                                $on={enabled}
                                style={{ order: 2 }}
                                title={enabled ? "Disable skill" : "Enable skill"}
                                onClick={() => onToggle(skill, !enabled)}
                            />
                        )}
                        {isEditable && (onEdit || onDelete) && (
                            <RowActions className="skill-row-actions">
                                {onEdit && (
                                    <RowIconButton type="button" title="Edit skill" aria-label="Edit skill" onClick={() => onEdit(skill)}>
                                        <span className="codicon codicon-edit" />
                                    </RowIconButton>
                                )}
                                {onDelete && (
                                    <RowIconButton type="button" $danger title="Delete skill" aria-label="Delete skill" onClick={() => setConfirming(true)}>
                                        <span className="codicon codicon-trash" />
                                    </RowIconButton>
                                )}
                            </RowActions>
                        )}
                    </>
                )}
            </RowHeader>
        </Row>
    );
};

export default SkillRow;
