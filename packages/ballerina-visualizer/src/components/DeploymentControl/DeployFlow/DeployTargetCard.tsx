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
import { useQuery } from "@tanstack/react-query";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { Button, ContextMenu, ProgressRing } from "@wso2/ui-toolkit";
import { VSCodeLink } from "@vscode/webview-ui-toolkit/react";
import { Actions, DeployIcon, Dot, MarkBox, Row, Spinner, Stack } from "../shared";
import { Muted } from "../AgentManagerConfigFields";
import { timeAgo } from "../AgentManagerSection";
import { BuiltNotDeployed, DeployWizard } from "./DeployWizard";
import {
    DeployCandidate, DeployRun, DeployStatus, DeployTarget, deployLabels, isAgentTarget, isRunning, openDeployLink, runStepLabel, useDeployBackend,
    useDeployStatus, useRefreshDeployStatus,
} from "./deployBackend";

const Header = styled(Row)`
    justify-content: space-between;
    font-size: 14px;
    font-weight: 600;
`;

const ProgressTrack = styled.div`
    height: 4px;
    border-radius: 2px;
    background: var(--vscode-editorWidget-border);
    overflow: hidden;
`;

const ProgressFill = styled.div<{ percent: number }>`
    height: 100%;
    width: ${(props: { percent: number }) => props.percent}%;
    background: var(--vscode-progressBar-background);
    transition: width 0.3s ease;
`;

const Footnote = styled(Muted)`
    font-size: 12px;
    border-top: 1px solid var(--vscode-welcomePage-tileBorder);
    padding-top: 10px;
`;

const STEP_WEIGHT = 25;

const CandidateList = styled.div`
    display: flex;
    flex-direction: column;
    border: 1px solid var(--vscode-welcomePage-tileBorder);
    border-radius: 4px;
    overflow: hidden;
`;

const Candidate = styled.button<{ selected: boolean }>`
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 8px 12px;
    border: none;
    background: ${({ selected }: { selected: boolean }) => (selected ? "var(--vscode-list-activeSelectionBackground)" : "transparent")};
    color: ${({ selected }: { selected: boolean }) => (selected ? "var(--vscode-list-activeSelectionForeground)" : "var(--vscode-foreground)")};
    font: inherit;
    text-align: start;
    cursor: pointer;
    &:hover {
        background: ${({ selected }: { selected: boolean }) => (selected ? "var(--vscode-list-activeSelectionBackground)" : "var(--vscode-list-hoverBackground)")};
    }
`;

interface LinkOrDeployProps {
    candidates: DeployCandidate[];
    deployLabel: string;
    disabledReason?: string;
    busy: boolean;
    onLink: (candidate: DeployCandidate) => void;
    onDeploy: () => void;
}

// Linking comes first because most developers join an agent someone already set up for this repository.
function LinkOrDeploy({ candidates, deployLabel, disabledReason, busy, onLink, onDeploy }: LinkOrDeployProps) {
    const [selected, setSelected] = useState(0);
    const current = Math.min(selected, candidates.length - 1);
    return (
        <>
            {candidates.length > 0 && (
                <Stack style={{ gap: 8 }}>
                    <Muted style={{ fontSize: 12 }}>Existing agents for this repository</Muted>
                    <CandidateList>
                        {candidates.map((candidate, index) => (
                            <Candidate key={`${candidate.project}/${candidate.name}`} type="button" selected={index === current}
                                aria-pressed={index === current} onClick={() => setSelected(index)}>
                                <span>{candidate.name}</span>
                                <Muted style={{ fontSize: 12 }}>{candidate.project} · {candidate.branch}</Muted>
                            </Candidate>
                        ))}
                    </CandidateList>
                </Stack>
            )}
            <Actions>
                {candidates.length > 0 && (
                    <Button appearance="primary" disabled={busy} onClick={() => onLink(candidates[current])}>{busy ? "Linking…" : "Link Agent"}</Button>
                )}
                <Button appearance={candidates.length > 0 ? "secondary" : "primary"} disabled={busy || !!disabledReason} tooltip={disabledReason ?? ""}
                    onClick={onDeploy}>{deployLabel}</Button>
            </Actions>
        </>
    );
}

export function deployTag(status?: DeployStatus): string | undefined {
    if (isRunning(status)) {
        return "Deploying";
    }
    return status?.deployed ? "Deployed" : undefined;
}

interface DeployTargetCardProps {
    target: DeployTarget;
    projectPath: string;
    projectTitle: string;
    /** "agent", "MCP server" or "integration", as the copy names what is deployed. */
    noun: string;
    active: boolean;
    /** Why the project can't be deployed, which disables Deploy. */
    deployDisabledReason?: string;
}

function RunProgress({ target, run, onShow }: { target: DeployTarget; run: DeployRun; onShow: () => void }) {
    const index = run.steps.findIndex((step) => step.state === "running");
    const current = run.steps[Math.max(index, 0)];
    const percent = Math.min(100, Math.max(index, 0) * STEP_WEIGHT + ((current.percent ?? 0) * STEP_WEIGHT) / 100);
    return (
        <Stack style={{ gap: 6 }}>
            <Row>
                <Spinner size={12} />
                <span>{runStepLabel(target, current.id, "default")}</span>
                <Muted style={{ marginLeft: "auto" }}>{index + 1} of {run.steps.length}</Muted>
            </Row>
            <ProgressTrack><ProgressFill percent={percent} /></ProgressTrack>
            <VSCodeLink onClick={onShow}>Show Progress</VSCodeLink>
        </Stack>
    );
}

// WSO2 Cloud rebuilds a linked integration on every push, so its card points at the push instead of a new deploy.
function PushToRedeploy({ pendingChanges, onSourceControl }: { pendingChanges?: boolean; onSourceControl: () => void }) {
    return (
        <Stack style={{ gap: 8 }}>
            <Muted style={{ fontSize: 12 }}>{pendingChanges ? "Commit and push your changes to redeploy." : "Push a commit to build and deploy it."}</Muted>
            {pendingChanges && <Actions><Button appearance="secondary" onClick={onSourceControl}>Open Source Control</Button></Actions>}
        </Stack>
    );
}

// The menu holds only what the card's body doesn't already show as a button.
function cardMenu(status: DeployStatus, isAgent: boolean, canDeployBuild: boolean, on: Record<"redeploy" | "copyEndpoint" | "console" | "signOut", () => void>) {
    const consoleButtonShown = !isRunning(status) && ((!!status.built && canDeployBuild) || !!status.deployed);
    return [
        ...(status.linked ? [] : [{ id: "redeploy", label: "Redeploy", onClick: on.redeploy }]),
        ...(status.deployed && isAgent ? [{ id: "copyEndpoint", label: "Copy Endpoint URL", onClick: on.copyEndpoint }] : []),
        ...(consoleButtonShown ? [] : [{ id: "console", label: "View in Console", onClick: on.console }]),
        { id: "signOut", label: "Sign Out", onClick: on.signOut },
    ];
}

export function DeployTargetCard({ target, projectPath, projectTitle, noun, active, deployDisabledReason }: DeployTargetCardProps) {
    const { rpcClient } = useRpcContext();
    const labels = deployLabels(target, noun);
    const deployBackend = useDeployBackend(target);
    const open = (action: Parameters<typeof openDeployLink>[3]) => openDeployLink(rpcClient, target, projectPath, action);
    const { data: status, isLoading, isFetching, refetch } = useDeployStatus(target, projectPath, active);
    const refresh = useRefreshDeployStatus(target, projectPath);
    const { data: source } = useQuery({
        queryKey: ["deploySource", target, projectPath],
        queryFn: () => deployBackend.getSource(target, projectPath),
        enabled: active && !!status?.signedIn,
    });
    const [wizardOpen, setWizardOpen] = useState(false);
    const [busy, setBusy] = useState(false);

    const link = async (candidate: DeployCandidate) => {
        setBusy(true);
        await deployBackend.link(target, projectPath, candidate).catch((): void => undefined).finally(() => setBusy(false));
        refresh();
    };

    const deployBuild = async () => {
        setBusy(true);
        await deployBackend.deployBuild?.(projectPath).catch((): void => undefined).finally(() => setBusy(false));
        refresh();
    };

    const reload = async () => {
        await deployBackend.refresh?.().catch((): void => undefined);
        await refetch();
    };
    const openSourceControl = () => rpcClient.getCommonRpcClient().executeCommand({ commands: ["workbench.scm.focus"] });

    const session = async (signIn: boolean) => {
        setBusy(true);
        await (signIn ? deployBackend.signIn(target) : deployBackend.signOut(target)).catch((): void => undefined).finally(() => setBusy(false));
        refresh();
    };

    if (isLoading || !status) {
        return <ProgressRing />;
    }
    if (!status.signedIn) {
        return (
            <Stack>
                <p style={{ margin: 0 }}>{labels.signInText}</p>
                <Actions><Button appearance="primary" disabled={busy} onClick={() => session(true)}>{labels.signIn}</Button></Actions>
            </Stack>
        );
    }

    const deployed = status.deployed;
    const isAgent = isAgentTarget(target);
    const copyEndpoint = (): void => void (deployed && navigator.clipboard.writeText(deployed.endpointUrl));
    const menuItems = cardMenu(status, isAgent, !!deployBackend.deployBuild, {
        redeploy: () => setWizardOpen(true),
        copyEndpoint,
        console: () => open("openInConsole"),
        signOut: () => session(false),
    });

    const body = () => {
        if (isRunning(status)) {
            return <RunProgress target={target} run={status.run!} onShow={() => setWizardOpen(true)} />;
        }
        if (status.built && deployBackend.deployBuild) {
            return <BuiltNotDeployed built={status.built} busy={busy} onDeploy={deployBuild} onConsole={() => open("openInConsole")} />;
        }
        if (deployed) {
            return (
                <>
                    <Stack style={{ gap: 4 }}>
                        <Row>
                            <MarkBox size={12}><Dot color="var(--vscode-testing-iconPassed)" /></MarkBox>
                            <span>Deployed</span>
                            <Muted style={{ marginLeft: "auto", fontSize: 12 }}>{timeAgo(new Date(deployed.deployedAt).toISOString())}</Muted>
                        </Row>
                        {!status.pendingChanges && <Muted style={{ fontSize: 12 }}>Up to date with {deployed.branch}</Muted>}
                    </Stack>
                    {status.pendingChanges && <PushToRedeploy pendingChanges onSourceControl={openSourceControl} />}
                    <Actions>
                        {isAgent ? (
                            <Button appearance="primary" onClick={() => open("openTryIt")}>
                                <Row><DeployIcon name="bi-play" size={20} />Try It</Row>
                            </Button>
                        ) : (
                            <Button appearance="primary" onClick={copyEndpoint}>Copy Endpoint URL</Button>
                        )}
                        <Button appearance="secondary" onClick={() => open("openInConsole")}>View in Console</Button>
                    </Actions>
                </>
            );
        }
        if (status.linked) {
            return (
                <>
                    <Row><MarkBox size={12}><Dot color="var(--vscode-descriptionForeground)" /></MarkBox><span>Not Deployed</span></Row>
                    <PushToRedeploy pendingChanges={status.pendingChanges} onSourceControl={openSourceControl} />
                </>
            );
        }
        return (
            <>
                {source?.repository && (
                    <Row><DeployIcon name="bi-github" size={12} /><Muted style={{ fontSize: 12 }}>{source.repository} · {source.branch}</Muted></Row>
                )}
                <Row><MarkBox size={12}><Dot color="var(--vscode-descriptionForeground)" /></MarkBox><span>Not Deployed</span></Row>
                <LinkOrDeploy candidates={status.candidates ?? []} deployLabel={labels.deploy} disabledReason={deployDisabledReason} busy={busy}
                    onLink={link} onDeploy={() => setWizardOpen(true)} />
            </>
        );
    };

    const started = !!status.run || !!deployed || !!status.built || !!status.linked;
    return (
        <Stack>
            {started && (
                <Stack style={{ gap: 2 }}>
                    <Header>
                        <span>{deployed?.name ?? projectTitle}</span>
                        <Row>
                            <Button appearance="icon" tooltip="Refresh" disabled={isFetching} onClick={reload}><DeployIcon name="bi-retry" /></Button>
                            <ContextMenu menuItems={menuItems} position="bottom-left" />
                        </Row>
                    </Header>
                    {deployed && <Muted style={{ fontSize: 12 }}>{deployed.branch} · {deployed.commit}</Muted>}
                </Stack>
            )}
            {body()}
            {!started && (
                <Footnote>{labels.account(status.account)} · <VSCodeLink onClick={() => session(false)}>Sign Out</VSCodeLink></Footnote>
            )}
            {wizardOpen && (
                <DeployWizard target={target} projectPath={projectPath} noun={noun} title={labels.title}
                    subtitle={`${projectTitle} · ${status.account}`} onClose={() => setWizardOpen(false)} />
            )}
        </Stack>
    );
}
