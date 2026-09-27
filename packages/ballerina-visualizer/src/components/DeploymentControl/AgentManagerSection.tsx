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
import styled from "@emotion/styled";
import { useQuery } from "@tanstack/react-query";
import { AgentManagerAction, AgentManagerBuild, AgentManagerSource, AgentManagerStatus } from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { Button, CheckBox, Codicon, ContextMenu, ProgressRing, Typography } from "@wso2/ui-toolkit";
import { VSCodeLink } from "@vscode/webview-ui-toolkit/react";
import { AgentManagerConfigForm } from "./AgentManagerConfigForm";

const SLOW_START_MS = 3 * 60 * 1000;

const Title = styled(Typography)`
    margin: 8px 0 12px;
`;

const Muted = styled.span`
    color: var(--vscode-descriptionForeground);
`;

const Card = styled.div`
    border: 1px solid var(--vscode-welcomePage-tileBorder);
    background: var(--vscode-welcomePage-tileBackground);
    border-radius: 6px;
    padding: 12px;
    margin: 8px 0;
    display: flex;
    flex-direction: column;
    gap: 16px;
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

const Detail = styled(Muted)`
    font-size: 12px;
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

const ErrorText = styled.span`
    color: var(--vscode-errorForeground);
    word-break: break-word;
`;

type Run = (action: AgentManagerAction) => Promise<void>;

interface AgentManagerSectionProps {
    projectPath: string;
    ampTracingEnabled: boolean;
    handleAmpTracing: (checked: boolean) => void;
}

function isBusy(status?: AgentManagerStatus): boolean {
    const phase = status && platformPhase(status).kind;
    return phase === "building" || phase === "starting";
}

export function AgentManagerSection({ projectPath, ampTracingEnabled, handleAmpTracing }: AgentManagerSectionProps) {
    const { rpcClient } = useRpcContext();
    const [pending, setPending] = useState<AgentManagerAction | undefined>();
    const { data: status, isLoading, refetch } = useQuery({
        queryKey: ["agentManagerStatus", projectPath],
        queryFn: () => rpcClient.getAgentManagerRpcClient().getAgentManagerStatus({ projectPath }),
        refetchInterval: (query) => (isBusy(query.state.data) ? 4000 : query.state.data?.source?.step ? 5000 : 20000),
        enabled: !!projectPath,
    });

    const [formAction, setFormAction] = useState<"hostOnPlatform" | "saveConfig" | undefined>();

    const run: Run = async (action) => {
        if (action === "hostOnPlatform" || action === "saveConfig") {
            setFormAction(action);
            return;
        }
        setPending(action);
        try {
            await rpcClient.getAgentManagerRpcClient().runAgentManagerAction({ projectPath, action });
        } finally {
            setPending(undefined);
            refetch();
        }
    };

    const closeForm = () => {
        setFormAction(undefined);
        refetch();
    };

    const renderBody = () => {
        if (isLoading) {
            return <ProgressRing />;
        }
        if (formAction && status?.signedIn) {
            const deploying = formAction === "hostOnPlatform";
            return (
                <Card>
                    <Section>
                        <b>{deploying ? "Configure before deploying" : `Configuration for ${status.displayName ?? status.link?.agent}`}</b>
                        <Detail>Values for this agent's configurables in Agent Manager ({status.link?.environment ?? "first environment"}).</Detail>
                    </Section>
                    <AgentManagerConfigForm
                        projectPath={projectPath}
                        action={formAction}
                        submitLabel={deploying ? "Deploy" : "Save"}
                        onDone={closeForm}
                        onCancel={closeForm}
                    />
                </Card>
            );
        }
        if (!status?.signedIn) {
            return (
                <>
                    <p>Host this agent on WSO2 Agent Manager, or send its traces there from wherever it runs.</p>
                    <Button appearance="primary" disabled={!!pending} onClick={() => run("signIn")}>Connect to Agent Manager</Button>
                    <div style={{ marginTop: 12 }}>
                        <CheckBox checked={ampTracingEnabled} onChange={handleAmpTracing} label="Configure instrumentation manually" />
                    </div>
                </>
            );
        }
        if (!status.link) {
            return <ChooseHosting status={status} pending={pending} run={run} />;
        }
        return (
            <LinkedAgentCard
                status={status}
                pending={pending}
                run={run}
                ampTracingEnabled={ampTracingEnabled}
                handleAmpTracing={handleAmpTracing}
            />
        );
    };

    return (
        <div>
            <Title variant="h3">Agent Manager</Title>
            {renderBody()}
        </div>
    );
}

interface ActionProps {
    status: AgentManagerStatus;
    pending?: AgentManagerAction;
    run: Run;
}

function ChooseHosting({ status, pending, run }: ActionProps) {
    return (
        <>
            <Muted>
                Connected to {status.org} on {instanceLabel(status.instanceUrl!)} ·{" "}
                <VSCodeLink onClick={() => run("signOut")}>Sign out</VSCodeLink>
            </Muted>
            {status.error && <ErrorText style={{ display: "block", marginTop: 8 }}>{status.error}</ErrorText>}
            <Card>
                <Section>
                    <b>Host on Agent Manager</b>
                    <Muted>Agent Manager builds the agent from your GitHub repository and runs it.</Muted>
                </Section>
                <SourceStep status={status} pending={pending} run={run} />
            </Card>
            <Card>
                <b>Run it elsewhere</b>
                <Muted>Agent Manager receives traces from wherever the agent runs.</Muted>
                <Row><Button appearance="secondary" disabled={!!pending} onClick={() => run("setupExternal")}>Send Traces</Button></Row>
            </Card>
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
function SourceHint({ source, pending, run }: { source?: AgentManagerSource; pending?: AgentManagerAction; run: Run }) {
    const step = source?.step;
    if (!step || step.blocking) {
        return null;
    }
    return (
        <>
            <Detail>{step.message}</Detail>
            {step.actionLabel && <VSCodeLink onClick={() => !pending && run("fixSource")}>{step.actionLabel}</VSCodeLink>}
        </>
    );
}

function BlockingStep({ source, pending, run }: { source?: AgentManagerSource; pending?: AgentManagerAction; run: Run }) {
    const step = source?.step!;
    return (
        <>
            <Section>
                <SourceLine source={source} />
                <Detail>{step.message}</Detail>
            </Section>
            {step.actionLabel && (
                <Actions>
                    <Button appearance="primary" disabled={!!pending} onClick={() => run("fixSource")}>{step.actionLabel}</Button>
                </Actions>
            )}
        </>
    );
}

function SourceStep({ status, pending, run }: ActionProps) {
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
            <Actions><Button appearance="primary" disabled={!!pending} onClick={() => run("hostOnPlatform")}>Deploy</Button></Actions>
        </>
    );
}

interface LinkedAgentCardProps extends ActionProps {
    ampTracingEnabled: boolean;
    handleAmpTracing: (checked: boolean) => void;
}

function LinkedAgentCard({ status, pending, run, ampTracingEnabled, handleAmpTracing }: LinkedAgentCardProps) {
    const link = status.link!;
    const internal = link.mode === "internal";
    const item = (id: AgentManagerAction, label: string) => ({ id, label, onClick: () => run(id) });
    const menuItems = [
        ...(internal
            ? [item("pushAndRebuild", "Rebuild"), item("openBuildLogs", "Build Logs"), item("openRuntimeLogs", "Runtime Logs")]
            : [item("regenerateToken", "Regenerate Token")]),
        item("openInConsole", "Open in Console"),
        ...(internal ? [item("saveConfig", "Configuration"), item("openDeploymentSettings", "Deployment Settings")] : []),
        ...(status.deployment?.endpointUrl ? [copyEndpointItem(status.deployment.endpointUrl)] : []),
        item("unlink", "Unlink"),
        item("signOut", `Sign Out of ${instanceLabel(status.instanceUrl!)}`),
    ];
    const commit = status.build?.commitId?.slice(0, 7);

    return (
        <Card>
            <Section>
                <Header>
                    <span>{status.displayName ?? link.agent}</span>
                    {pending ? <ProgressRing sx={{ height: 14, width: 14 }} /> : <ContextMenu menuItems={menuItems} position="bottom-left" />}
                </Header>
                {internal && status.branch && (
                    <Row><Codicon name="git-branch" sx={{ fontSize: 12 }} /><Detail>{status.branch}{commit && ` · ${commit}`}</Detail></Row>
                )}
            </Section>
            {internal ? (
                <PlatformState status={status} pending={pending} run={run} />
            ) : (
                <ExternalState tokenExpiresAt={link.tokenExpiresAt} environment={link.environment} enabled={ampTracingEnabled} onChange={handleAmpTracing} />
            )}
            {status.error && <ErrorText>{status.error}</ErrorText>}
        </Card>
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
    const logsLink = (action: AgentManagerAction, label: string) => <VSCodeLink onClick={() => run(action)}>{label}</VSCodeLink>;

    const failed = phase.kind === "buildFailed" || phase.kind === "crashed" || (phase.kind === "starting" && !!status.crash);
    const settled = failed || phase.kind === "live" || phase.kind === "notDeployed";
    const actions = settled ? deployActions(status, failed) : [];
    const blocked = settled && !!status.source?.step?.blocking;
    return (
        <>
            <Section>
                {phaseStatus(phase, status, slowStart, logsLink, () => run("openBuildLogs"))}
                {settled && <ConfigHints status={status} />}
                {settled && <SourceHint source={status.source} pending={pending} run={run} />}
            </Section>
            {blocked && <BlockingStep source={status.source} pending={pending} run={run} />}
            <ActionRow actions={actions} live={phase.kind === "live"} pending={pending} run={run} />
        </>
    );
}

// With nothing to fix, Try It leads; otherwise the fix does and Try It follows.
function ActionRow({ actions, live, pending, run }: { actions: DeployAction[]; live: boolean; pending?: AgentManagerAction; run: Run }) {
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

type LogsLink = (action: AgentManagerAction, label: string) => React.ReactNode;

function phaseStatus(phase: Phase, status: AgentManagerStatus, slowStart: boolean, logsLink: LogsLink, onBuildLogs: () => void) {
    switch (phase.kind) {
        case "building":
            return <BuildProgress build={phase.build} onLogs={onBuildLogs} />;
        case "buildFailed":
            return <Row><Dot color="var(--vscode-errorForeground)" /><span>Build failed ·</span>{logsLink("openBuildLogs", "View build logs")}</Row>;
        case "starting":
            return (
                <>
                    <Row><ProgressRing sx={{ height: 12, width: 12 }} /><span>Starting</span></Row>
                    {status.crash && <Detail>Keeps restarting: {status.crash.reason} · {logsLink("openRuntimeLogs", "View runtime logs")}</Detail>}
                    {!status.crash && slowStart && <Detail>Taking longer than usual · {logsLink("openRuntimeLogs", "View runtime logs")}</Detail>}
                </>
            );
        case "crashed":
            return (
                <>
                    <Row><Dot color="var(--vscode-errorForeground)" /><span>Crashed ·</span>{logsLink("openRuntimeLogs", "View runtime logs")}</Row>
                    {status.crash && <Detail>{status.crash.reason}</Detail>}
                </>
            );
        case "notDeployed":
            return <Row><Dot color="var(--vscode-descriptionForeground)" /><span>Not deployed</span></Row>;
        default:
            return (
                <>
                    <Row>
                        <Dot color="var(--vscode-testing-iconPassed)" />
                        <span>Deployed</span>
                        {status.deployment?.lastDeployed && <Detail style={{ marginLeft: "auto" }}>{timeAgo(status.deployment.lastDeployed)}</Detail>}
                    </Row>
                    {!status.source?.step && <Detail>{status.newCommit ? "A newer commit is on GitHub" : "Up to date with GitHub"}</Detail>}
                </>
            );
    }
}

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

// New code outranks config as the primary button; a plain rebuild does not.
function configAction({ missingConfig = [], crash }: AgentManagerStatus): DeployAction | undefined {
    if (missingConfig.length > 0) {
        return { id: "saveConfig", label: missingConfig.length === 1 ? `Set ${missingConfig[0]}` : `Set ${missingConfig.length} Values` };
    }
    return crash?.config ? { id: "openDeploymentSettings", label: "Set Configuration" } : undefined;
}

// A missing value would crash the next deploy too, so it comes first; otherwise new code outranks console config.
function deployActions(status: AgentManagerStatus, failed: boolean): DeployAction[] {
    const deploy = deployAction(status, failed);
    const config = configAction(status);
    const configFirst = config?.id === "saveConfig" || !deploy || deploy.label === "Rebuild";
    return (configFirst ? [config, deploy] : [deploy, config]).filter((action): action is DeployAction => !!action);
}

function ConfigHints({ status }: { status: AgentManagerStatus }) {
    const unmentioned = (status.missingConfig ?? []).filter((name) => !status.crash?.reason.includes(`'${name}'`));
    return (
        <>
            {unmentioned.length > 0 && <Detail>Agent Manager has no value for {unmentioned.join(", ")}.</Detail>}
            {status.crash?.defaultModelProvider && (
                <Detail>The default WSO2 model provider can't be configured in Agent Manager. Use a model provider with its own API key.</Detail>
            )}
        </>
    );
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
            <VSCodeLink onClick={onLogs}>View build logs</VSCodeLink>
        </>
    );
}

function copyEndpointItem(url: string) {
    return { id: "copyEndpoint", label: "Copy Endpoint URL", onClick: (): void => void navigator.clipboard.writeText(url) };
}

interface ExternalStateProps {
    tokenExpiresAt?: number;
    environment: string;
    enabled: boolean;
    onChange: (checked: boolean) => void;
}

function ExternalState({ tokenExpiresAt, environment, enabled, onChange }: ExternalStateProps) {
    const expires = tokenExpiresAt ? new Date(tokenExpiresAt * 1000) : undefined;
    const expiringSoon = !!expires && expires.getTime() - Date.now() < 7 * 24 * 3600 * 1000;
    return (
        <>
            <Muted>
                Sends traces to {environment}
                {expires && <> · <span style={expiringSoon ? { color: "var(--vscode-errorForeground)" } : undefined}>token expires {expires.toLocaleDateString()}</span></>}
            </Muted>
            <CheckBox checked={enabled} onChange={onChange} label="Send traces when the integration runs" />
        </>
    );
}

const STEP_LABELS: Record<string, string> = {
    BuildInitiated: "Queued",
    BuildTriggered: "Cloning source",
    BuildRunning: "Building image",
    BuildCompleted: "Publishing image",
    WorkloadUpdated: "Deploying",
};

function stepLabel(type: string): string {
    const words = type.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
    return STEP_LABELS[type] ?? words.charAt(0).toUpperCase() + words.slice(1);
}

function instanceLabel(instanceUrl: string): string {
    const host = new URL(instanceUrl).host;
    return host.endsWith(".cloud.wso2.com") ? "WSO2 Cloud" : host;
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
