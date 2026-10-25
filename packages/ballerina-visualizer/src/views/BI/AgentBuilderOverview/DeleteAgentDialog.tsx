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

import React, { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import styled from "@emotion/styled";
import { AgentUsage, DIRECTORY_MAP, PopupVisualizerLocation } from "@wso2/ballerina-core";
import { BallerinaRpcClient, useRpcContext } from "@wso2/ballerina-rpc-client";
import { AgentSelection } from "@wso2/component-diagram";
import { Button, CheckBox, Codicon, ThemeColors, Typography } from "@wso2/ui-toolkit";
import { PopupModal, PopupModalStep } from "../../../components/PopupModal";
import { CloseButton, HeaderTitleContainer, PopupContent, PopupFooter, PopupHeader, PopupTitle } from "../Connection/styles";
import {
    AgentDeletion,
    CleanupGroup,
    DeletableAgentKind,
    agentDeletionScope,
    deleteAgentWithTriggers,
    loadAgentDeletion,
    triggerKey,
} from "../FocusFlowDiagram/agentDeletion";
import { AgentRef, samePath } from "../FocusFlowDiagram/agentUsages";
import { withUndoGroup } from "../AIChatAgent/utils";

const Section = styled.div`
    display: flex;
    flex-direction: column;
    gap: 6px;
`;

const Heading = styled.div`
    font-size: 12px;
    font-weight: 600;
    color: ${ThemeColors.ON_SURFACE};
`;

const Muted = styled.div`
    font-size: 12px;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
`;

const Items = styled.ul`
    margin: 0;
    padding-left: 18px;
    font-size: 13px;
    color: ${ThemeColors.ON_SURFACE};
    overflow-wrap: anywhere;
`;

const Warning = styled.div`
    display: flex;
    gap: 8px;
    padding: 10px 12px;
    border: 1px solid var(--vscode-editorWarning-foreground);
    border-radius: 4px;
    font-size: 13px;
`;

const CLEANUP_LABELS: Record<CleanupGroup["key"], [string, string]> = {
    model: ["Model Provider", "Model Providers"],
    memory: ["Memory", "Memories"],
    tools: ["Tool", "Tools"],
    mcp: ["MCP Server", "MCP Servers"],
    store: ["Memory Store", "Memory Stores"],
};

// Other agents can pick these in the UI, so they stay unless the user opts in.
const REUSABLE: CleanupGroup["key"][] = ["model", "store"];

function cleanupLabel({ key, declarations }: CleanupGroup): string {
    const [one, many] = CLEANUP_LABELS[key];
    return `${declarations.length === 1 ? one : many}: ${declarations.map((declaration) => declaration.name).join(", ")}`;
}

function serviceTitle(name: string): string {
    return name.startsWith("/") ? `${name} Service` : name;
}

function usageLine(usage: AgentUsage): string {
    if (usage.parentAgent) {
        return `${usage.label}, which uses it as a ${usage.serviceLabel?.includes("peer") ? "peer" : "tool"}`;
    }
    if (usage.type === "automation") {
        return "main Automation";
    }
    const where = usage.serviceName ? `${usage.label} on ${usage.serviceName.trim()}` : usage.label;
    return usage.channel ? `${where}, which sends data to its ${usage.channel} channel` : where;
}

function triggerLabel(usage: AgentUsage): string {
    const trigger = usage.trigger!;
    const name = trigger.serviceName.trim();
    if (agentDeletionScope(trigger) === "service") {
        return serviceTitle(name);
    }
    const endpoint = `${usage.label} on ${name}`;
    return trigger.scope === "ENTRY_POINT_BODY" ? `Agent Call in ${endpoint}` : endpoint;
}

function warningLines({ plan, dangling }: AgentDeletion, keptTriggers: AgentUsage[]): string[] {
    return [
        ...keptTriggers.map(triggerLabel),
        ...plan.blockers.map(usageLine),
        ...plan.shared.map((usage) => `${triggerLabel(usage)}, which also runs other agents`),
        ...dangling.map(usageLine),
    ];
}

function toggled<T>(set: Set<T>, item: T, on: boolean): Set<T> {
    const next = new Set(set);
    if (on) {
        next.add(item);
    } else {
        next.delete(item);
    }
    return next;
}

interface DeleteAgentDialogProps {
    name: string;
    noun: string;
    deletion: AgentDeletion;
    onCancel: () => void;
    onConfirm: (cleanup: CleanupGroup[], kept: Set<string>) => Promise<void>;
}

function DeleteAgentDialog({ name, noun, deletion, onCancel, onConfirm }: DeleteAgentDialogProps) {
    const [selected, setSelected] = useState<Set<CleanupGroup["key"]>>(
        () => new Set(deletion.cleanup.map((group) => group.key).filter((key) => !REUSABLE.includes(key))));
    const [kept, setKept] = useState<Set<string>>(new Set());
    const [deleting, setDeleting] = useState(false);
    const triggers = deletion.plan.triggers;
    const warnings = warningLines(deletion, triggers.filter((usage) => kept.has(triggerKey(usage.trigger))));
    const confirm = async () => {
        setDeleting(true);
        await onConfirm(deletion.cleanup.filter((group) => selected.has(group.key)), kept);
    };
    const unchecked = deletion.referencesUnknown;
    const nothingElse = !unchecked && triggers.length + deletion.chatServices + deletion.cleanup.length + warnings.length === 0;
    const ownParts = deletion.cleanup.filter((group) => !REUSABLE.includes(group.key));
    const reusableParts = deletion.cleanup.filter((group) => REUSABLE.includes(group.key));
    const select = (key: CleanupGroup["key"], checked: boolean) => setSelected((current) => {
        const next = toggled(current, key, checked);
        // A store can only go with the memory that uses it.
        return key === "memory" && !checked ? toggled(next, "store", false) : next;
    });
    const partBox = (group: CleanupGroup) => (
        <CheckBox
            key={group.key}
            label={cleanupLabel(group)}
            checked={selected.has(group.key)}
            disabled={deleting || (group.key === "store" && !selected.has("memory"))}
            onChange={(checked) => select(group.key, checked)}
        />
    );

    return createPortal(
        <PopupModal onClose={onCancel} autoHeight maxWidth={480} dismissOnEscape={!deleting}>
            {(close) => (
                <PopupModalStep>
                    <PopupHeader>
                        <HeaderTitleContainer>
                            <PopupTitle variant="h2">Delete {name}?</PopupTitle>
                        </HeaderTitleContainer>
                        <CloseButton appearance="icon" onClick={close} disabled={deleting}>
                            <Codicon name="close" />
                        </CloseButton>
                    </PopupHeader>
                    <PopupContent>
                        {nothingElse && <Typography variant="body2">{name} isn't used anywhere else.</Typography>}
                        {triggers.length + ownParts.length > 0 && (
                            <Section>
                                <Heading>Also Delete</Heading>
                                <Muted>Only {name} uses these. Uncheck any you want to keep.</Muted>
                                {triggers.map((usage) => {
                                    const key = triggerKey(usage.trigger);
                                    return (
                                        <CheckBox
                                            key={key}
                                            label={triggerLabel(usage)}
                                            checked={!kept.has(key)}
                                            disabled={deleting}
                                            onChange={(checked) => setKept((current) => toggled(current, key, !checked))}
                                        />
                                    );
                                })}
                                {ownParts.map(partBox)}
                            </Section>
                        )}
                        {deletion.chatServices > 0 && <Muted>Its test chat service is deleted too.</Muted>}
                        {reusableParts.length > 0 && (
                            <Section>
                                <Heading>Reusable</Heading>
                                <Muted>Other agents can use these. Select any you no longer need.</Muted>
                                {reusableParts.map(partBox)}
                            </Section>
                        )}
                        {warnings.length > 0 && (
                            <Warning>
                                <Codicon name="warning" sx={{ color: "var(--vscode-editorWarning-foreground)" }} />
                                <Section>
                                    <span>Deleting {name} leaves errors in:</span>
                                    <Items>{warnings.map((line) => <li key={line}>{line}</li>)}</Items>
                                    <span>Remove {name} from each to fix them.</span>
                                </Section>
                            </Warning>
                        )}
                        {unchecked && (
                            <Warning>
                                <Codicon name="warning" sx={{ color: "var(--vscode-editorWarning-foreground)" }} />
                                <span>Unable to check what else uses {name}. Deleting it may leave errors elsewhere.</span>
                            </Warning>
                        )}
                    </PopupContent>
                    <PopupFooter>
                        <Button appearance="secondary" onClick={close} disabled={deleting}>Cancel</Button>
                        <Button appearance="primary" onClick={confirm} disabled={deleting}>
                            {deleting ? "Deleting…" : warnings.length > 0 || unchecked ? "Delete Anyway" : `Delete ${noun}`}
                        </Button>
                    </PopupFooter>
                </PopupModalStep>
            )}
        </PopupModal>,
        document.body
    );
}

type PendingDeletion = { agent: AgentSelection; ref: AgentRef; kind: DeletableAgentKind; deletion: AgentDeletion };

export function useAgentDeletion(rpcClient: BallerinaRpcClient, projectPath: string, onDone?: (deleted: boolean) => void) {
    const [pending, setPending] = useState<PendingDeletion>();

    const request = useCallback(async (agent: AgentSelection) => {
        const ref: AgentRef = { filePath: agent.path, startLine: agent.startLine, symbol: agent.name };
        const kind = agent.kind ?? "agent";
        try {
            setPending({ agent, ref, kind, deletion: await loadAgentDeletion(rpcClient, projectPath, ref, kind) });
        } catch (error) {
            console.error(">>> agent overview: failed to prepare the agent deletion", error);
            rpcClient.getCommonRpcClient().showErrorMessage({ message: `Unable to check what uses ${agent.name}.` });
            onDone?.(false);
        }
    }, [rpcClient, projectPath, onDone]);

    const confirm = async (cleanup: CleanupGroup[], kept: Set<string>) => {
        const { agent, ref, kind, deletion } = pending;
        let deleted = false;
        try {
            const missed = await withUndoGroup(rpcClient, async () => {
                const left = await deleteAgentWithTriggers(rpcClient, projectPath, ref, kind, deletion, cleanup, kept);
                await rpcClient.getAIAgentRpcClient().fixMissingImports();
                return left;
            }, `${kind === "workflow" ? "Workflow" : "Agent"} Deletion - ${agent.name}`);
            deleted = true;
            if (missed.length > 0) {
                rpcClient.getCommonRpcClient().showErrorMessage({
                    message: `${agent.name} was deleted, but ${missed.join(", ")} could not be found and ${missed.length === 1 ? "was" : "were"} left in the source.`,
                });
            }
        } catch (error) {
            console.error(">>> agent overview: failed to delete agent", error);
            rpcClient.getCommonRpcClient().showErrorMessage({
                message: `Unable to delete ${agent.name}. Some changes may have been applied. Review the source before retrying.`,
            });
        } finally {
            setPending(undefined);
            onDone?.(deleted);
        }
    };

    const dialog = pending && (
        <DeleteAgentDialog
            name={pending.agent.name}
            noun={pending.kind === "workflow" ? "Workflow" : "Agent"}
            deletion={pending.deletion}
            onCancel={() => {
                setPending(undefined);
                onDone?.(false);
            }}
            onConfirm={confirm}
        />
    );

    return { request, dialog };
}

async function deletableKindOf(rpcClient: BallerinaRpcClient, projectPath: string, location: PopupVisualizerLocation): Promise<DeletableAgentKind> {
    if (location.artifactType === DIRECTORY_MAP.WORKFLOW) {
        return "workflow";
    }
    const structure = await rpcClient.getBIDiagramRpcClient().getProjectStructure();
    const agents = structure?.projects?.find((project) => samePath(project.projectPath, projectPath))?.directoryMap?.[DIRECTORY_MAP.AGENT];
    const artifact = agents?.find((agent) => samePath(agent.path, location.documentUri) && agent.position?.startLine === location.metadata?.target?.line);
    return artifact?.kind === DIRECTORY_MAP.DURABLE_AGENT ? "durable" : "agent";
}

export function DeleteAgentPopup({ location, onClose }: { location: PopupVisualizerLocation; onClose: () => void }) {
    const { rpcClient } = useRpcContext();
    const [projectPath, setProjectPath] = useState<string>();
    const startLine = location.metadata?.target?.line;
    const onDone = useCallback(async (deleted: boolean) => {
        const shown = deleted && await rpcClient.getVisualizerLocation();
        onClose();
        if (shown && samePath(shown.documentUri, location.documentUri) && shown.position?.startLine === startLine) {
            rpcClient.getVisualizerRpcClient().goHome({ isPackageOverview: true });
        }
    }, [rpcClient, location, startLine, onClose]);
    const { request, dialog } = useAgentDeletion(rpcClient, projectPath, onDone);

    const fail = (error: unknown) => {
        console.error(">>> agent overview: failed to open the agent deletion", error);
        rpcClient.getCommonRpcClient().showErrorMessage({ message: `Unable to check what uses ${location.identifier}.` });
        void onDone(false);
    };

    useEffect(() => {
        rpcClient.getVisualizerLocation().then((shown) => setProjectPath(shown.projectPath)).catch(fail);
    }, []);

    useEffect(() => {
        if (!projectPath) {
            return;
        }
        deletableKindOf(rpcClient, projectPath, location).then((kind) =>
            request({ path: location.documentUri, startLine, name: location.identifier, kind })).catch(fail);
    }, [projectPath]);

    return dialog || null;
}
