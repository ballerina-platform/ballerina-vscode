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

import React, { useRef, useState } from "react";
import { createPortal } from "react-dom";
import styled from "@emotion/styled";
import { useQuery } from "@tanstack/react-query";
import { AgentManagerAction, AgentManagerBuild, AgentManagerLink, AgentManagerLinkCandidate, AgentManagerSource, AgentManagerStatus } from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { Button, CheckBox, Codicon, ContextMenu, ProgressRing } from "@wso2/ui-toolkit";
import { VSCodeLink } from "@vscode/webview-ui-toolkit/react";
import { ErrorText, Muted as Detail } from "./AgentManagerConfigFields";
import { AgentManagerCreateForm } from "./AgentManagerCreateForm";
import { PopupModal, PopupModalStep } from "../PopupModal";
import { CloseButton, HeaderTitleContainer, PopupHeader, PopupSubtitle, PopupTitle } from "../../views/BI/Connection/styles";

const SLOW_START_MS = 3 * 60 * 1000;

const Muted = styled.span`
    color: var(--vscode-descriptionForeground);
`;

const Stack = styled.div`
    display: flex;
    flex-direction: column;
    gap: 12px;
`;

const Section = styled.div`
    display: flex;
    flex-direction: column;
    gap: 4px;
`;

const Actions = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
`;

const Row = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
`;

const Header = styled(Row)`
    justify-content: space-between;
    font-size: 14px;
    font-weight: 600;
`;

const Dot = styled.span<{ color: string }>`
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
    background: ${(props: { color: string }) => props.color};
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
    padding: 6px 10px;
    border: none;
    background: ${({ selected }: { selected: boolean }) => (selected ? "var(--vscode-list-activeSelectionBackground)" : "transparent")};
    color: ${({ selected }: { selected: boolean }) => (selected ? "var(--vscode-list-activeSelectionForeground)" : "var(--vscode-foreground)")};
    font: inherit;
    text-align: left;
    cursor: pointer;
    &:hover {
        background: ${({ selected }: { selected: boolean }) => (selected ? "var(--vscode-list-activeSelectionBackground)" : "var(--vscode-list-hoverBackground)")};
    }
`;

type Run = (action: AgentManagerAction, autoInstrumentation?: boolean) => Promise<void>;
type Pending = AgentManagerAction | "link";

interface AgentManagerSectionProps {
    projectPath: string;
    part: "deploy" | "monitor";
    active: boolean;
    ampTracingEnabled: boolean;
    handleAmpTracing: (checked: boolean) => void;
}

export function useAgentManagerStatus(projectPath: string, enabled = true) {
    const { rpcClient } = useRpcContext();
    return useQuery({
        queryKey: ["agentManagerStatus", projectPath],
        queryFn: () => rpcClient.getAgentManagerRpcClient().getAgentManagerStatus({ projectPath }),
        refetchInterval: ({ state: { data } }) => {
            const phase = data && platformPhase(data).kind;
            return phase === "building" || phase === "starting" ? 4000 : data?.source?.step?.blocking ? 5000 : 20000;
        },
        enabled: enabled && !!projectPath,
    });
}

const PHASE_TAGS: Partial<Record<Phase["kind"], string>> = {
    building: "Building",
    starting: "Deploying",
    buildFailed: "Failed",
    crashed: "Failed",
    live: "Deployed",
};

export function agentManagerTag(status?: AgentManagerStatus): string | undefined {
    if (status?.link?.mode !== "internal") {
        return undefined;
    }
    const kind = platformPhase(status).kind;
    return kind === "starting" && status.crashed ? "Failed" : PHASE_TAGS[kind];
}

export function AgentManagerSection({ projectPath, part, active, ampTracingEnabled, handleAmpTracing }: AgentManagerSectionProps) {
    const { rpcClient } = useRpcContext();
    const [pending, setPending] = useState<Pending>();
    const { data: status, isLoading, isFetching, refetch } = useAgentManagerStatus(projectPath, active);
    const [creating, setCreating] = useState(false);

    const run: Run = async (action, autoInstrumentation) => {
        setPending(action);
        try {
            await rpcClient.getAgentManagerRpcClient().runAgentManagerAction({ projectPath, action, autoInstrumentation });
        } finally {
            setPending(undefined);
            refetch();
        }
    };

    const link = async (candidate: AgentManagerLinkCandidate) => {
        setPending("link");
        await rpcClient.getAgentManagerRpcClient().linkAgentManagerAgent({ projectPath, project: candidate.project, agent: candidate.agent })
            .finally(() => setPending(undefined));
        refetch();
    };

    const closeForm = () => {
        setCreating(false);
        refetch();
    };

    const linked = (
        <LinkedAgent
            status={status!}
            pending={pending}
            run={run}
            ampTracingEnabled={ampTracingEnabled}
            handleAmpTracing={handleAmpTracing}
            refreshing={isFetching}
            onRefresh={() => refetch()}
        />
    );

    const renderDeploy = () => {
        if (!status?.signedIn) {
            return (
                <Stack>
                    <p style={{ margin: 0 }}>Deploy this agent on WSO2 Agent Manager. Sign in to your Agent Manager instance to continue.</p>
                    <Actions><Button appearance="primary" disabled={!!pending} onClick={() => run("signIn")}>Connect to Agent Manager</Button></Actions>
                </Stack>
            );
        }
        if (status.link?.mode === "external") {
            return <Detail>{status.link.agent} is registered as an externally-hosted agent. Unlink it under Management to host it on Agent Manager.</Detail>;
        }
        return (
            <Stack>
                {status.link?.mode === "internal" ? linked : (
                    <>
                        {status.error && <ErrorText>{status.error}</ErrorText>}
                        {status.unavailable
                            ? <Actions><Button appearance="secondary" disabled={isFetching} onClick={() => refetch()}>Try Again</Button></Actions>
                            : <SourceStep status={status} pending={pending} run={run} onLink={link} onCreate={() => setCreating(true)} />}
                        <Detail style={{ borderTop: "1px solid var(--vscode-welcomePage-tileBorder)", paddingTop: 10 }}>
                            Signed in to {new URL(status.instanceUrl!).host} · <VSCodeLink onClick={() => run("signOut")}>Sign Out</VSCodeLink>
                        </Detail>
                    </>
                )}
            </Stack>
        );
    };

    const renderMonitor = () => {
        if (status?.link?.mode === "external") {
            return linked;
        }
        return (
            <Stack>
                <p style={{ margin: 0 }}>Register this agent in Agent Manager as an externally-hosted agent. Its traces then appear in Agent Manager when you run it on your own infrastructure.</p>
                <Actions>
                    <Button appearance="secondary" disabled={!!pending} onClick={() => run(status?.signedIn ? "setupExternal" : "signIn")}>
                        {status?.signedIn ? "Register Agent" : "Connect to Agent Manager"}
                    </Button>
                </Actions>
                {!status?.signedIn && (
                    <CheckBox checked={ampTracingEnabled} onChange={handleAmpTracing} label="Configure Instrumentation Manually" />
                )}
            </Stack>
        );
    };

    return (
        <div>
            {isLoading ? <ProgressRing /> : part === "deploy" ? renderDeploy() : renderMonitor()}
            {creating && status?.signedIn && createPortal(
                <PopupModal onClose={closeForm} autoHeight maxWidth={560} dismissOnEscape>
                    {(close) => (
                        <PopupModalStep>
                            <PopupHeader>
                                <HeaderTitleContainer>
                                    <PopupTitle variant="h2">Create Agent in Agent Manager</PopupTitle>
                                    <PopupSubtitle variant="body2">{status.org}</PopupSubtitle>
                                </HeaderTitleContainer>
                                <CloseButton appearance="icon" onClick={close}>
                                    <Codicon name="close" />
                                </CloseButton>
                            </PopupHeader>
                            <AgentManagerCreateForm projectPath={projectPath} onDone={close} onCancel={close} />
                        </PopupModalStep>
                    )}
                </PopupModal>,
                document.body
            )}
        </div>
    );
}

interface ActionProps {
    status: AgentManagerStatus;
    pending?: Pending;
    run: Run;
}

interface LinkOrCreateProps {
    onLink: (candidate: AgentManagerLinkCandidate) => void;
    onCreate: () => void;
}

// Linking comes first because most developers join an agent someone already set up for this repository.
function LinkOrCreate({ status, pending, onLink, onCreate }: Pick<ActionProps, "status" | "pending"> & LinkOrCreateProps) {
    const candidates = status.candidates ?? [];
    const [selected, setSelected] = useState(0);
    // The polled list can shrink under a selection.
    const current = Math.min(selected, candidates.length - 1);
    return (
        <>
            {candidates.length > 0 && (
                <Section>
                    <Detail>Existing agents for this repository</Detail>
                    <CandidateList>
                        {candidates.map((candidate, index) => (
                            <Candidate key={`${candidate.project}/${candidate.agent}`} type="button" selected={index === current} onClick={() => setSelected(index)}>
                                <span>{candidate.displayName}</span>
                                <Detail>{candidate.project} · {candidate.repository}{candidate.branch && ` · ${candidate.branch}`}</Detail>
                            </Candidate>
                        ))}
                    </CandidateList>
                </Section>
            )}
            <Actions>
                {candidates.length > 0 && (
                    <Button appearance="primary" disabled={!!pending} onClick={() => onLink(candidates[current])}>
                        {pending === "link" ? "Linking…" : "Link Agent"}
                    </Button>
                )}
                <Button appearance={candidates.length > 0 ? "secondary" : "primary"} disabled={!!pending} onClick={onCreate}>Create New Agent</Button>
            </Actions>
        </>
    );
}

function SourceLine({ source }: { source?: AgentManagerSource }) {
    if (!source?.repository) {
        return null;
    }
    return (
        <Row>
            <Codicon name="github" sx={{ fontSize: 12 }} />
            <Detail>{source.repository}{source.branch && ` · ${source.branch}`}{source.isPrivate && " · private"}</Detail>
        </Row>
    );
}

// Blocking steps replace the deploy button; the rest are a one-line hint so deploying what's on GitHub stays one click.
function SourceHint({ source, pending, run }: { source?: AgentManagerSource; pending?: Pending; run: Run }) {
    const step = source?.step;
    if (!step || step.blocking) {
        return null;
    }
    return (
        <Detail>
            {step.message}
            {step.actionLabel && <> <VSCodeLink onClick={() => !pending && run("fixSource")}>{step.actionLabel}</VSCodeLink></>}
        </Detail>
    );
}

function BlockingStep({ source, pending, run }: { source?: AgentManagerSource; pending?: Pending; run: Run }) {
    const step = source?.step!;
    const [autoInstrumentation, setAutoInstrumentation] = useState(true);
    return (
        <>
            <Section>
                <SourceLine source={source} />
                <Detail>{step.message}</Detail>
                {step.offerAutoInstrumentation && (
                    <CheckBox checked={autoInstrumentation} onChange={setAutoInstrumentation} label="Enable Auto-Instrumentation" />
                )}
            </Section>
            {step.actionLabel && (
                <Actions>
                    <Button appearance="primary" disabled={!!pending} onClick={() => run("fixSource", autoInstrumentation)}>{step.actionLabel}</Button>
                </Actions>
            )}
        </>
    );
}

function SourceStep({ status, pending, run, onLink, onCreate }: ActionProps & LinkOrCreateProps) {
    const source = status.source;
    if (source?.step?.blocking) {
        return <BlockingStep source={source} pending={pending} run={run} />;
    }
    return (
        <>
            <Section>
                <SourceLine source={source} />
                <SourceHint source={source} pending={pending} run={run} />
            </Section>
            <LinkOrCreate status={status} pending={pending} onLink={onLink} onCreate={onCreate} />
        </>
    );
}

interface LinkedAgentProps extends ActionProps {
    ampTracingEnabled: boolean;
    handleAmpTracing: (checked: boolean) => void;
    refreshing: boolean;
    onRefresh: () => void;
}

function LinkedAgent({ status, pending, run, ampTracingEnabled, handleAmpTracing, refreshing, onRefresh }: LinkedAgentProps) {
    const link = status.link!;
    const internal = link.mode === "internal";
    const item = (id: AgentManagerAction, label: string) => ({ id, label, onClick: () => run(id) });
    const endpointUrl = status.deployment?.endpointUrl;
    const menuItems = [
        ...(internal
            ? [item("pushAndRebuild", "Rebuild"), item("openRuntimeLogs", "Logs"), item("openDeploymentSettings", "Configuration")]
            : [item("regenerateToken", "Regenerate Token")]),
        item("openInConsole", "Open in Console"),
        ...(endpointUrl ? [{ id: "copyEndpoint", label: "Copy Endpoint URL", onClick: (): void => void navigator.clipboard.writeText(endpointUrl) }] : []),
        item("unlink", "Unlink"),
        item("signOut", "Sign Out"),
    ];
    const commit = status.build?.commitId?.slice(0, 7);

    return (
        <Stack>
            <Section>
                <Header>
                    <span>{status.displayName ?? link.agent}</span>
                    <Row>
                        <Button appearance="icon" tooltip="Refresh" disabled={refreshing} onClick={onRefresh}>
                            <Codicon name="refresh" />
                        </Button>
                        {pending ? <ProgressRing sx={{ height: 14, width: 14 }} /> : <ContextMenu menuItems={menuItems} position="bottom-left" />}
                    </Row>
                </Header>
                {internal && status.branch && (
                    <Row><Codicon name="git-branch" sx={{ fontSize: 12 }} /><Detail>{otherRepository(status) && `${status.repository} · `}{status.branch}{commit && ` · ${commit}`}</Detail></Row>
                )}
            </Section>
            {!status.unavailable && (internal ? (
                <PlatformState status={status} pending={pending} run={run} />
            ) : (
                <ExternalState link={link} enabled={ampTracingEnabled} onChange={handleAmpTracing} />
            ))}
            {status.error && <ErrorText>{status.error}</ErrorText>}
        </Stack>
    );
}

type Phase =
    | { kind: "building"; build: AgentManagerBuild }
    | { kind: "buildFailed" }
    | { kind: "starting" }
    | { kind: "crashed" }
    | { kind: "live" }
    | { kind: "notDeployed" };

function platformPhase({ build, deployment }: AgentManagerStatus): Phase {
    if (build && /running|pending/i.test(build.status)) {
        return { kind: "building", build };
    }
    if (build && /fail/i.test(build.status)) {
        return { kind: "buildFailed" };
    }
    const deploymentStatus = deployment?.status ?? "";
    if (/progress|pending|deploying/i.test(deploymentStatus)) {
        return { kind: "starting" };
    }
    if (/fail|error|crash/i.test(deploymentStatus)) {
        return { kind: "crashed" };
    }
    return deploymentStatus === "active" ? { kind: "live" } : { kind: "notDeployed" };
}

function PlatformState({ status, pending, run }: ActionProps) {
    const phase = platformPhase(status);
    const startedAt = useRef<number>();
    startedAt.current = phase.kind === "starting" ? startedAt.current ?? Date.now() : undefined;
    const slowStart = !!startedAt.current && Date.now() - startedAt.current > SLOW_START_MS;

    const failed = phase.kind === "buildFailed" || phase.kind === "crashed" || (phase.kind === "starting" && !!status.crashed);
    const settled = failed || phase.kind === "live" || phase.kind === "notDeployed";
    const actions = settled ? deployActions(status, failed) : [];
    const blocked = settled && !!status.source?.step?.blocking;
    return (
        <>
            <Section>
                {phaseStatus(phase, status, slowStart, run)}
                {settled && <ConfigHints status={status} />}
                {settled && <SourceHint source={status.source} pending={pending} run={run} />}
            </Section>
            {blocked && <BlockingStep source={status.source} pending={pending} run={run} />}
            <ActionRow actions={actions} live={phase.kind === "live"} pending={pending} run={run} />
        </>
    );
}

function ActionRow({ actions, live, pending, run }: { actions: DeployAction[]; live: boolean; pending?: Pending; run: Run }) {
    const healthy = live && actions.length === 0;
    if (actions.length === 0 && !live) {
        return null;
    }
    return (
        <Actions>
            {actions.map((action, index) => (
                <Button key={action.id} appearance={index === 0 ? "primary" : "secondary"} disabled={!!pending} onClick={() => run(action.id)}>
                    {action.label}
                </Button>
            ))}
            {live && (
                <Button appearance={healthy ? "primary" : "secondary"} disabled={!!pending} onClick={() => run("openTryIt")}>
                    <Codicon name="play" sx={{ marginRight: 6 }} />
                    Try It
                </Button>
            )}
            {healthy && <Button appearance="secondary" disabled={!!pending} onClick={() => run("openInConsole")}>Open in Console</Button>}
        </Actions>
    );
}

function phaseStatus(phase: Phase, status: AgentManagerStatus, slowStart: boolean, run: Run) {
    const logsLink = (action: AgentManagerAction, label: string) => <VSCodeLink onClick={() => run(action)}>{label}</VSCodeLink>;
    switch (phase.kind) {
        case "building":
            return <BuildProgress build={phase.build} onLogs={() => run("openBuildLogs")} />;
        case "buildFailed":
            return <Row><Dot color="var(--vscode-errorForeground)" /><span>Build Failed ·</span>{logsLink("openBuildLogs", "View Build Logs")}</Row>;
        case "starting":
            return (
                <>
                    <Row><ProgressRing sx={{ height: 12, width: 12 }} /><span>Deploying</span></Row>
                    {status.crashed && <Detail>Keeps restarting · {logsLink("openRuntimeLogs", "View Runtime Logs")}</Detail>}
                    {!status.crashed && slowStart && <Detail>Taking longer than usual · {logsLink("openRuntimeLogs", "View Runtime Logs")}</Detail>}
                </>
            );
        case "crashed":
            return (
                <>
                    <Row><Dot color="var(--vscode-errorForeground)" /><span>Crashed ·</span>{logsLink("openRuntimeLogs", "View Runtime Logs")}</Row>
                </>
            );
        case "notDeployed":
            return <Row><Dot color="var(--vscode-descriptionForeground)" /><span>Not Deployed</span></Row>;
        default:
            return (
                <>
                    <Row>
                        <Dot color="var(--vscode-testing-iconPassed)" />
                        <span>Deployed</span>
                        {status.deployment?.lastDeployed && <Detail style={{ marginLeft: "auto" }}>{timeAgo(status.deployment.lastDeployed)}</Detail>}
                    </Row>
                    {!status.source?.step && status.tracked && (
                        <Detail>{status.newCommit ? `Newer commit on ${status.branch}: ${status.newCommitMessage}` : `Up to date with ${status.branch}`}</Detail>
                    )}
                </>
            );
    }
}

const otherRepository = (status: AgentManagerStatus) =>
    !!status.repository && status.repository.toLowerCase() !== status.source?.repository?.toLowerCase();

interface DeployAction {
    id: AgentManagerAction;
    label: string;
}

function deployAction(status: AgentManagerStatus, failed: boolean): DeployAction | undefined {
    const { build, deployment, newCommit } = status;
    if (build?.status === "Completed" && build.imageId && build.imageId !== deployment?.imageId) {
        return { id: "deployLatestBuild", label: "Deploy Latest Build" };
    }
    if (newCommit && !status.source?.step?.blocking) {
        return { id: "pushAndRebuild", label: `Deploy ${newCommit.slice(0, 7)}` };
    }
    return failed ? { id: "pushAndRebuild", label: "Rebuild" } : undefined;
}

function configAction({ missingConfig = [] }: AgentManagerStatus): DeployAction | undefined {
    return missingConfig.length > 0
        ? { id: "openDeploymentSettings", label: missingConfig.length === 1 ? "Set 1 Value" : `Set ${missingConfig.length} Values` }
        : undefined;
}

// A missing value would crash the next deploy too, so it comes first; otherwise new code outranks console config.
function deployActions(status: AgentManagerStatus, failed: boolean): DeployAction[] {
    const deploy = deployAction(status, failed);
    const config = configAction(status);
    const configFirst = !!config || !deploy || deploy.label === "Rebuild";
    return (configFirst ? [config, deploy] : [deploy, config]).filter((action): action is DeployAction => !!action);
}

function ConfigHints({ status }: { status: AgentManagerStatus }) {
    const missing = status.missingConfig ?? [];
    return missing.length > 0
        ? <Detail>Add in Agent Manager's deployment settings: {missing.map((name, index) => <React.Fragment key={name}>{index > 0 && ", "}<code>{name}</code></React.Fragment>)}</Detail>
        : null;
}

function BuildProgress({ build, onLogs }: { build: AgentManagerBuild; onLogs: () => void }) {
    const steps = build.steps ?? [];
    const done = steps.filter((step) => step.status === "Succeeded").length;
    const current = steps.find((step) => step.status === "Running");
    const label = current ? stepLabel(current.type) : "Queued";
    return (
        <>
            <Row>
                <ProgressRing sx={{ height: 12, width: 12 }} />
                <span>{label}</span>
                {steps.length > 0 && <Muted style={{ marginLeft: "auto" }}>{done} of {steps.length}</Muted>}
            </Row>
            <ProgressTrack><ProgressFill percent={build.percent ?? 0} /></ProgressTrack>
            <VSCodeLink onClick={onLogs}>View Build Logs</VSCodeLink>
        </>
    );
}

function ExternalState({ link: { tokenExpiresAt, environment }, enabled, onChange }: { link: AgentManagerLink; enabled: boolean; onChange: (checked: boolean) => void }) {
    const expires = tokenExpiresAt ? new Date(tokenExpiresAt * 1000) : undefined;
    const expiringSoon = !!expires && expires.getTime() - Date.now() < 7 * 24 * 3600 * 1000;
    return (
        <>
            <Muted>
                Sends traces to {environment}
                {expires && <> · <span style={expiringSoon ? { color: "var(--vscode-errorForeground)" } : undefined}>token expires {expires.toLocaleDateString()}</span></>}
            </Muted>
            <CheckBox checked={enabled} onChange={onChange} label="Send Traces to Agent Manager" />
        </>
    );
}

const STEP_LABELS: Record<string, string> = {
    BuildInitiated: "Queued",
    BuildTriggered: "Cloning Source",
    BuildRunning: "Building Image",
    BuildCompleted: "Publishing Image",
    WorkloadUpdated: "Deploying",
};

function stepLabel(type: string): string {
    return STEP_LABELS[type] ?? type.replace(/([a-z])([A-Z])/g, "$1 $2");
}

function timeAgo(iso: string): string {
    const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (minutes < 1) {
        return "just now";
    }
    if (minutes < 60) {
        return `${minutes} min ago`;
    }
    const hours = Math.round(minutes / 60);
    return hours < 24 ? `${hours} h ago` : `${Math.round(hours / 24)} d ago`;
}
