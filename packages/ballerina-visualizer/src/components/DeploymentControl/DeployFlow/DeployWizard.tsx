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

import React, { ReactNode, useEffect, useState } from "react";
import styled from "@emotion/styled";
import { useQuery } from "@tanstack/react-query";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { Button, CheckBox, Dropdown, ProgressRing, TextField } from "@wso2/ui-toolkit";
import { VSCodeLink } from "@vscode/webview-ui-toolkit/react";
import { Actions, DeployIcon, DeployPopup, Dot, MarkBox, Row, SUCCESS, Spinner, Stack } from "../shared";
import { ErrorText, Muted } from "../AgentManagerConfigFields";
import {
    DeployForm, DeployRun, DeploySource, DeployStatus, DeployTarget, deployLabels, type SourceReadiness, isAgentTarget, isOnRemote, isPrepared, isPushed, isRunning,
    openDeployLink, runStepLabel, useDeployBackend, useDeployStatus, useRefreshDeployStatus,
} from "./deployBackend";

export type StepId = "prepare" | "push" | "configure" | "deploy";

const STEPS: { id: StepId; label: string }[] = [
    { id: "prepare", label: "Prepare Project" },
    { id: "push", label: "Push to GitHub" },
    { id: "configure", label: "Configure" },
    { id: "deploy", label: "Deploy" },
];

const Layout = styled.div`
    display: flex;
    flex: 1;
    min-height: 0;
    min-height: 380px;
    border-top: 1px solid var(--vscode-widget-border, var(--vscode-welcomePage-tileBorder));
`;

const StepList = styled.ol`
    width: 190px;
    flex-shrink: 0;
    margin: 0;
    padding: 16px;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 4px;
    border-right: 1px solid var(--vscode-widget-border, var(--vscode-welcomePage-tileBorder));
`;

const StepItem = styled.li<{ current: boolean }>`
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 12px;
    border-radius: 4px;
    background: ${(props: { current: boolean }) => (props.current ? "var(--vscode-list-activeSelectionBackground)" : "transparent")};
    color: ${(props: { current: boolean }) => (props.current ? "var(--vscode-list-activeSelectionForeground)" : "var(--vscode-foreground)")};
`;

const StepMarker = styled.span<{ done: boolean }>`
    width: 20px;
    height: 20px;
    box-sizing: border-box;
    flex-shrink: 0;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    line-height: 1;
    font-variant-numeric: tabular-nums;
    border: 1px solid ${(props: { done: boolean }) => (props.done ? "var(--vscode-testing-iconPassed)" : "var(--vscode-descriptionForeground)")};
    color: ${(props: { done: boolean }) => (props.done ? "var(--vscode-testing-iconPassed)" : "inherit")};
`;

// System-font digits draw below the centre of their line box; this lifts them to the circle's optical centre.
const StepNumber = styled.span`
    translate: 0 -1.5px;
`;

export const PendingMark = styled.span`
    width: 14px;
    height: 14px;
    box-sizing: border-box;
    flex-shrink: 0;
    border-radius: 50%;
    border: 1px solid var(--vscode-descriptionForeground);
`;

const Content = styled.div`
    flex: 1;
    min-width: 0;
    padding: 24px 24px 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 24px;
    line-height: 1.5;
`;

// Content pads 24px above and none below, so the loader drops the top padding back out to sit at the true centre.
const Loading = styled.div`
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-top: -24px;
`;

export const Loader = () => <Loading><ProgressRing /></Loading>;

export const StepTitle = styled.h3`
    margin: 0;
    font-size: 15px;
    font-weight: 600;
`;

export const Checklist = styled.div`
    display: flex;
    flex-direction: column;
    border: 1px solid var(--vscode-widget-border, var(--vscode-welcomePage-tileBorder));
    border-radius: 6px;
    & > * + * {
        border-top: 1px solid var(--vscode-widget-border, var(--vscode-welcomePage-tileBorder));
    }
`;

export const CheckRow = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
`;

export const Grow = styled.div`
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
`;

// Pinned to the bottom of the scrolling step so the step's actions stay in view on a long form.
export const Footer = styled(Actions)`
    justify-content: flex-end;
    margin-top: auto;
    position: sticky;
    bottom: 0;
    padding-block: 16px 24px;
    background: var(--vscode-editorWidget-background);
`;

export const Fields = styled.div`
    display: flex;
    flex-direction: column;
    gap: 16px;
`;

const Center = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 24px;
    padding-top: 16px;
`;

const Endpoint = styled(Row)`
    width: 100%;
    padding: 8px 12px;
    border-radius: 4px;
    border: 1px solid var(--vscode-widget-border, var(--vscode-welcomePage-tileBorder));
    font-family: var(--vscode-editor-font-family);
    font-size: 12px;
    text-align: start;
`;

interface WizardContext {
    target: DeployTarget;
    projectPath: string;
    noun: string;
}

export interface StepProps extends WizardContext {
    source: DeploySource;
    goTo: (step: StepId) => void;
    reload: () => Promise<unknown>;
}

// The Prepare step is there when the project has something to prepare; until the source loads, only Agent Manager deploys assume so.
const hasPrepareStep = (target: DeployTarget, source?: DeploySource) => (source ? source.prepItems.length > 0 : isAgentTarget(target));
const stepsFor = (target: DeployTarget, source?: DeploySource) =>
    (hasPrepareStep(target, source) ? STEPS : STEPS.filter((step) => step.id !== "prepare"));

export function firstOpenStep(source: DeploySource, status?: DeployStatus): StepId {
    if (isRunning(status)) {
        return "deploy";
    }
    if (!isPrepared(source)) {
        return "prepare";
    }
    return isOnRemote(source) ? "configure" : "push";
}

function stepDone(step: StepId, source: DeploySource, status?: DeployStatus): boolean {
    const done: Record<StepId, boolean> = {
        prepare: isPrepared(source),
        push: isOnRemote(source),
        configure: !!status?.run,
        deploy: !!status?.run?.live,
    };
    return done[step];
}

export function useAsync() {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string>();
    const run = async (work: () => Promise<unknown>) => {
        setBusy(true);
        setError(undefined);
        try {
            await work();
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setBusy(false);
        }
    };
    return { busy, error, run };
}

export const Group = styled.section`
    display: flex;
    flex-direction: column;
    gap: 8px;
`;

export const GroupLabel = styled.h4`
    margin: 0;
    font-size: 12px;
    font-weight: 600;
    color: var(--vscode-descriptionForeground);
`;

const ItemList = styled.ul`
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 16px;
`;

export const Groups = styled.div`
    display: flex;
    flex-direction: column;
    gap: 24px;
`;

export const Detail = styled(Muted)`
    display: block;
    margin-top: 4px;
    font-size: 12px;
    line-height: 1.45;
`;

// The checkbox control is 18px with a 10px label inset, so its description starts where the label text does.
const OptionDetail = styled(Detail)`
    padding-inline-start: 28px;
`;

export function PrepareStep({ target, projectPath, noun, source, goTo, reload, apply }: StepProps & { apply?: (skip: string[]) => Promise<unknown> }) {
    const [skip, setSkip] = useState<string[]>([]);
    const deployBackend = useDeployBackend(target);
    const { busy, error, run } = useAsync();
    const changes = source.prepItems.filter((item) => !item.done && !item.optional);
    const options = source.prepItems.filter((item) => !item.done && item.optional);
    const applying = changes.length > 0 || options.some((item) => !skip.includes(item.id));
    const toggle = (id: string, on: boolean) => setSkip(on ? skip.filter((item) => item !== id) : [...skip, id]);
    const submit = () => run(async () => {
        await (apply ? apply(skip) : deployBackend.prepare(target, projectPath, skip));
        await reload();
        goTo("push");
    });
    const nothingToDo = changes.length === 0 && options.length === 0;
    return (
        <>
            <Stack style={{ gap: 4 }}>
                <StepTitle>Prepare Project</StepTitle>
                <Muted>{nothingToDo
                    ? `This ${noun} already has everything ${deployLabels(target, noun).builder} needs.`
                    : changes.length > 0
                        ? `${changes.length === 1 ? "This is" : "These are"} added to the project and committed with it in the next step.`
                        : `Nothing needs to be added to the project.`}</Muted>
            </Stack>
            <Groups>
                {changes.length > 0 && (
                    <ItemList aria-label="Changes">
                        {changes.map((item) => (
                            <li key={item.id}>
                                <span>{item.label}</span><Detail>{item.detail}</Detail>
                                {item.for && <Detail>{item.for.join(", ")}</Detail>}
                            </li>
                        ))}
                    </ItemList>
                )}
                {options.map((item) => (
                    <div key={item.id}>
                        <CheckBox label={item.label} checked={!skip.includes(item.id)} onChange={(on: boolean) => toggle(item.id, on)} />
                        <OptionDetail>{item.detail}</OptionDetail>
                    </div>
                ))}
            </Groups>
            {error && <ErrorText role="alert">{error}</ErrorText>}
            <Footer>
                <Button appearance="primary" disabled={busy} onClick={applying ? submit : () => goTo("push")}>
                    {busy ? "Applying…" : applying ? "Apply Changes and Continue" : "Continue"}
                </Button>
            </Footer>
        </>
    );
}

function pendingSummary(source: DeploySource): string {
    const files = source.changedFiles > 0 && `${source.changedFiles} changed ${source.changedFiles === 1 ? "file" : "files"}`;
    const commits = source.unpushedCommits > 0 && `${source.unpushedCommits} ${source.unpushedCommits === 1 ? "commit" : "commits"}`;
    const parts = [files, commits].filter(Boolean).join(" and ");
    return `${parts} ${source.changedFiles + source.unpushedCommits === 1 ? "is" : "are"} not on GitHub yet.`;
}

const SourceLine = ({ source, branch }: { source: DeploySource; branch: string }) => (
    <Row><DeployIcon name="bi-github" /><span>{source.repository}</span><Muted>· {branch}</Muted></Row>
);

export function PushStep({ target, noun, projectPath, source, goTo, reload, push }: StepProps & { push?: (message: string) => Promise<unknown> }) {
    const { rpcClient } = useRpcContext();
    const [message, setMessage] = useState("Prepare for deployment");
    const deployBackend = useDeployBackend(target);
    const [messageError, setMessageError] = useState<string>();
    const { busy, error, run } = useAsync();
    const pushed = isPushed(source);
    const needsCommit = source.changedFiles > 0;
    const submit = () => {
        if (needsCommit && !message.trim()) {
            setMessageError("Enter a commit message.");
            return;
        }
        run(async () => {
            await (push ? push(message) : deployBackend.commitAndPush(projectPath, message));
            await reload();
            goTo("configure");
        });
    };
    const openSourceControl = () => rpcClient.getCommonRpcClient().executeCommand({ commands: ["workbench.scm.focus"] });
    return (
        <>
            <Stack style={{ gap: 4 }}>
                <StepTitle>Push to GitHub</StepTitle>
                <Muted>{deployLabels(target, noun).builder} builds the {noun} from GitHub.</Muted>
            </Stack>
            <Groups>
                <Group>
                    <SourceLine source={source} branch={source.branch} />
                    <span>{pushed ? "Everything is on GitHub." : pendingSummary(source)}</span>
                </Group>
                {!pushed && needsCommit && (
                    <TextField id="deploy-commit-message" label="Commit Message" value={message} required errorMsg={messageError}
                        onTextChange={(text) => { setMessage(text); setMessageError(undefined); }} />
                )}
                {!pushed && (
                    <Detail>
                        To commit and push yourself, use <VSCodeLink onClick={openSourceControl}>Source Control</VSCodeLink>, then <VSCodeLink onClick={() => reload()}>Check Again</VSCodeLink>.
                    </Detail>
                )}
            </Groups>
            {error && <ErrorText role="alert">{error}</ErrorText>}
            <Footer>
                {hasPrepareStep(target, source) && <Button appearance="secondary" disabled={busy} onClick={() => goTo("prepare")}>Back</Button>}
                {!pushed && isOnRemote(source) && (
                    <Button appearance="secondary" disabled={busy} onClick={() => goTo("configure")}>Continue Without Committing</Button>
                )}
                <Button appearance="primary" disabled={busy} onClick={pushed ? () => goTo("configure") : submit}>
                    {busy ? "Pushing…" : pushed ? "Continue" : needsCommit ? "Commit and Push" : "Push"}
                </Button>
            </Footer>
        </>
    );
}

export const NEW_PROJECT = "__new_project__";
const NEW_TOKEN = "__new_token__";

export const InfoRow = styled(Row)`
    justify-content: space-between;
    gap: 16px;
`;

export interface ConfigureValues {
    name: string;
    integrationType: string;
    project: string;
    newProject: string;
    remote: string;
    branch: string;
    appPath: string;
    gitSecret: string;
    newToken: string;
    values: Record<string, string>;
}

export type SetValue = <K extends keyof ConfigureValues>(key: K, value: ConfigureValues[K]) => void;

export function initialValues(form: DeployForm): ConfigureValues {
    const remote = form.remotes[0];
    return {
        name: form.name,
        integrationType: form.integrationType ?? "",
        project: form.linkedProject ?? form.projects[0]?.name ?? NEW_PROJECT,
        newProject: "",
        remote: remote?.name ?? "",
        branch: remote?.defaultBranch ?? "",
        appPath: form.appPath ?? "",
        gitSecret: form.gitSecrets?.[0] ?? NEW_TOKEN,
        newToken: "",
        values: Object.fromEntries(form.fields.map((field) => [field.id, field.value ?? ""])),
    };
}

// The id of the first required field left empty, so the submit can focus it.
function firstMissing(form: DeployForm, v: ConfigureValues, needsToken: boolean): string | undefined {
    const field = form.fields.find((item) => item.required && !v.values[item.id]?.trim());
    const checks: [boolean, string][] = [
        [!v.name.trim(), "deploy-name"],
        [v.project === NEW_PROJECT && !v.newProject.trim(), "deploy-new-project"],
        [needsToken && !v.newToken.trim(), "deploy-token"],
        [!!field, `deploy-field-${field?.id}`],
    ];
    return checks.find(([missing]) => missing)?.[1];
}

interface SectionProps {
    form: DeployForm;
    v: ConfigureValues;
    set: SetValue;
    error: (value: string, label: string, required?: boolean) => string | undefined;
}

function ProjectFields({ form, v, set, error, nameLabel }: SectionProps & { nameLabel: string }) {
    const projectItems = [
        ...form.projects.map((item) => ({ id: item.name, value: item.name, content: item.displayName })),
        { id: NEW_PROJECT, value: NEW_PROJECT, content: "Create New Project…" },
    ];
    return (
        <Fields>
            <TextField id="deploy-name" label={nameLabel} value={v.name} onTextChange={(text) => set("name", text)} required
                errorMsg={error(v.name, nameLabel)} />
            <TypeField form={form} v={v} set={set} />
            <Dropdown id="deploy-project" label="Project" value={v.project} onValueChange={(value) => set("project", value)} items={projectItems} />
            {v.project === NEW_PROJECT && (
                <TextField id="deploy-new-project" label="New Project Name" value={v.newProject} required
                    onTextChange={(text) => set("newProject", text)} errorMsg={error(v.newProject, "project name")} />
            )}
        </Fields>
    );
}

function TypeField({ form, v, set }: Omit<SectionProps, "error">) {
    const types = form.integrationTypes ?? [];
    if (types.length === 0) {
        return null;
    }
    return (
        <>
            {types.length > 1 ? (
                <Dropdown id="deploy-type" label="Type" value={v.integrationType} onValueChange={(value) => set("integrationType", value)}
                    items={types.map((item) => ({ id: item.value, value: item.value, content: item.label }))} />
            ) : (
                <InfoRow><span>Type</span><Muted>{types[0].label}</Muted></InfoRow>
            )}
            {form.typeWarning && <Detail role="note">{form.typeWarning}</Detail>}
        </>
    );
}

const TONE_COLORS: Record<SourceReadiness["tone"], string> = {
    error: "var(--vscode-errorForeground)",
    warning: "var(--vscode-editorWarning-foreground)",
    info: "var(--vscode-editorInfo-foreground)",
    neutral: "var(--vscode-widget-border, var(--vscode-editorWidget-border))",
};

const Banner = styled.div<{ tone: SourceReadiness["tone"] }>`
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 12px;
    border: 1px solid ${({ tone }: { tone: SourceReadiness["tone"] }) => TONE_COLORS[tone]};
    border-radius: 4px;
`;

interface ReadinessBannerProps {
    readiness: SourceReadiness;
    refreshing: boolean;
    onAction: () => void;
    onRefresh: () => void;
}

function ReadinessBanner({ readiness, refreshing, onAction, onRefresh }: ReadinessBannerProps) {
    if (!readiness.message) {
        return null;
    }
    return (
        <Banner tone={readiness.tone} role={readiness.blocking ? "alert" : "status"}>
            <Grow>{readiness.message}</Grow>
            {readiness.actionLabel && <Button appearance="secondary" onClick={onAction}>{readiness.actionLabel}</Button>}
            <Button appearance="icon" tooltip="Check Again" disabled={refreshing} onClick={onRefresh}><DeployIcon name="bi-retry" /></Button>
        </Banner>
    );
}

interface CloudSourceFieldsProps extends Omit<SectionProps, "error"> {
    target: DeployTarget;
    projectPath: string;
    commit?: string;
    changedFiles: number;
    onReadiness: (readiness?: SourceReadiness) => void;
}

// The deploy form's repository section from WSO2 Integrator: its remotes, branches and checks, refreshed as the picks change.
export function CloudSourceFields({ target, projectPath, form, v, set, commit, changedFiles, onReadiness }: CloudSourceFieldsProps) {
    const backend = useDeployBackend(target);
    const check = useQuery({
        queryKey: ["deploySourceCheck", projectPath, v.remote, v.branch],
        queryFn: () => backend.inspectSource!(projectPath, v.remote, v.branch),
        placeholderData: (previous) => previous,
    });
    const data = check.data;
    useEffect(() => {
        if (data && data.remote !== v.remote) {
            set("remote", data.remote);
        }
        if (data && data.branch !== v.branch) {
            set("branch", data.branch);
        }
    }, [data]);
    useEffect(() => onReadiness(check.isFetching ? undefined : data?.readiness), [data, check.isFetching]);
    const remote = data?.remotes.find((item) => item.name === v.remote);
    const act = async () => {
        await backend.sourceAction!(projectPath, data!.readiness.action!);
        await check.refetch();
    };
    return (
        <Group aria-labelledby="deploy-source">
            <GroupLabel id="deploy-source">Source</GroupLabel>
            <Fields>
                {(data?.remotes.length ?? 0) > 1 ? (
                    <Dropdown id="deploy-remote" label="Repository" value={v.remote} onValueChange={(value) => set("remote", value)}
                        items={data!.remotes.map((item) => ({ id: item.name, value: item.name, content: item.repository }))} />
                ) : remote && <Row><DeployIcon name="bi-github" /><span>{remote.repository}</span></Row>}
                {(remote?.branches.length ?? 0) > 0 && (
                    <Dropdown id="deploy-branch" label="Branch" value={v.branch} onValueChange={(value) => set("branch", value)}
                        items={remote!.branches.map((name) => ({ id: name, value: name, content: name }))} />
                )}
            </Fields>
            {!data && <ProgressRing />}
            {v.branch && <Detail>Builds {commit ? `commit ${commit} on ` : ""}{v.branch} and deploys it to the {form.environment} environment.</Detail>}
            {data && <ReadinessBanner readiness={data.readiness} refreshing={check.isFetching} onAction={act} onRefresh={() => check.refetch()} />}
            {changedFiles > 0 && !data?.readiness.message && (
                <Detail>{changedFiles} changed {changedFiles === 1 ? "file is" : "files are"} not committed and {changedFiles === 1 ? "is" : "are"} not deployed.</Detail>
            )}
        </Group>
    );
}

function SourceFields({ form, v, set, error, commit, changedFiles }: SectionProps & { commit?: string; changedFiles: number }) {
    const remote = form.remotes.find((item) => item.name === v.remote) ?? form.remotes[0];
    const needsToken = !!remote?.isPrivate && v.gitSecret === NEW_TOKEN;
    const pickRemote = (name: string) => {
        set("remote", name);
        set("branch", form.remotes.find((item) => item.name === name)?.defaultBranch ?? "");
    };
    return (
        <Group aria-labelledby="deploy-source">
            <GroupLabel id="deploy-source">Source</GroupLabel>
            <Fields>
                {form.remotes.length > 1 ? (
                    <Dropdown id="deploy-remote" label="Repository" value={v.remote} onValueChange={pickRemote}
                        items={form.remotes.map((item) => ({ id: item.name, value: item.name, content: `${item.repository} (${item.name})` }))} />
                ) : (
                    <Row><DeployIcon name="bi-github" /><span>{remote?.repository}</span></Row>
                )}
                <Dropdown id="deploy-branch" label="Branch" value={v.branch} onValueChange={(value) => set("branch", value)}
                    items={(remote?.branches ?? []).map((name) => ({ id: name, value: name, content: name }))} />
                {form.appPath !== undefined && (
                    <TextField id="deploy-app-path" label="Project Path" value={v.appPath} onTextChange={(text) => set("appPath", text)} />
                )}
                {remote?.isPrivate && form.gitSecrets && (
                    <Dropdown id="deploy-access" label="Repository Access" value={v.gitSecret} onValueChange={(value) => set("gitSecret", value)}
                        items={[...form.gitSecrets.map((name) => ({ id: name, value: name, content: name })), { id: NEW_TOKEN, value: NEW_TOKEN, content: "Add a New Token…" }]} />
                )}
                {needsToken && (
                    <TextField id="deploy-token" label="Personal Access Token" type="password" value={v.newToken} required
                        description="Read-only access to the repository contents." onTextChange={(text) => set("newToken", text)}
                        errorMsg={error(v.newToken, "personal access token")} />
                )}
            </Fields>
            <Detail>Builds {commit ? `commit ${commit} on ` : ""}{v.branch} and deploys it to the {form.environment} environment.</Detail>
            {changedFiles > 0 && (
                <Detail>{changedFiles} changed {changedFiles === 1 ? "file is" : "files are"} not committed and {changedFiles === 1 ? "is" : "are"} not deployed.</Detail>
            )}
        </Group>
    );
}

function ConfigurationFields({ form, v, set, error }: SectionProps) {
    if (form.fields.length === 0) {
        return null;
    }
    return (
        <Group aria-labelledby="deploy-config-values">
            <GroupLabel id="deploy-config-values">Configurations</GroupLabel>
            <Fields>
                {form.fields.map((field) => (
                    <TextField key={field.id} id={`deploy-field-${field.id}`} label={field.label} required={field.required}
                        type={field.secret ? "password" : "text"} value={v.values[field.id]} errorMsg={error(v.values[field.id], field.label, field.required)}
                        onTextChange={(text) => set("values", { ...v.values, [field.id]: text })} />
                ))}
            </Fields>
        </Group>
    );
}

function IncludedList({ items }: { items?: { label: string; value: string }[] }) {
    if (!items?.length) {
        return null;
    }
    return (
        <Group aria-labelledby="deploy-included">
            <GroupLabel id="deploy-included">Included Automatically</GroupLabel>
            {items.map((item) => <InfoRow key={item.label}><span>{item.label}</span><Muted>{item.value}</Muted></InfoRow>)}
        </Group>
    );
}

interface ConfigureStepProps extends StepProps {
    form: DeployForm;
}

function ConfigureStep({ target, projectPath, noun, source, goTo, reload, form }: ConfigureStepProps) {
    const [v, setValues] = useState<ConfigureValues>(() => initialValues(form));
    const deployBackend = useDeployBackend(target);
    const [checked, setChecked] = useState(false);
    const [readiness, setReadiness] = useState<SourceReadiness>();
    const cloudChecks = !!deployBackend.inspectSource;
    const { busy, error, run } = useAsync();
    const set: SetValue = (key, value) => setValues((current) => ({ ...current, [key]: value }));
    const nameLabel = deployLabels(target, noun).name;
    const fieldError = (value: string, label: string, required = true) =>
        (checked && required && !value?.trim() ? `Enter the ${label}.` : undefined);
    const remote = form.remotes.find((item) => item.name === v.remote);
    const submit = () => {
        setChecked(true);
        const missing = firstMissing(form, v, !!remote?.isPrivate && v.gitSecret === NEW_TOKEN && !!form.gitSecrets);
        if (missing) {
            document.getElementById(missing)?.focus();
            return;
        }
        run(async () => {
            await deployBackend.deploy(target, projectPath, {
                name: v.name, project: v.project === NEW_PROJECT ? v.newProject : v.project, newProject: v.project === NEW_PROJECT ? v.newProject : undefined,
                remote: v.remote, branch: v.branch, integrationType: v.integrationType || undefined, appPath: form.appPath !== undefined ? v.appPath : undefined,
                gitSecret: remote?.isPrivate && v.gitSecret !== NEW_TOKEN ? v.gitSecret : undefined,
                newToken: remote?.isPrivate && v.gitSecret === NEW_TOKEN ? v.newToken : undefined, values: v.values,
            });
            await reload();
            goTo("deploy");
        });
    };
    const sectionProps = { form, v, set, error: fieldError };
    return (
        <>
            <Stack style={{ gap: 4 }}>
                <StepTitle>Configure</StepTitle>
                <Muted>{form.fields.length > 0 ? `Name the ${noun} and set the values it needs at runtime.` : `Name the ${noun} and choose what to build.`}</Muted>
            </Stack>
            <Groups>
                <ProjectFields {...sectionProps} nameLabel={nameLabel} />
                {cloudChecks ? (
                    <CloudSourceFields {...sectionProps} target={target} projectPath={projectPath} commit={source.commit}
                        changedFiles={source.changedFiles} onReadiness={setReadiness} />
                ) : (
                    <SourceFields {...sectionProps} commit={source.commit} changedFiles={source.changedFiles} />
                )}
                <ConfigurationFields {...sectionProps} />
                <IncludedList items={form.included} />
            </Groups>
            {error && <ErrorText role="alert">{error}</ErrorText>}
            <Footer>
                <Button appearance="secondary" disabled={busy} onClick={() => goTo("push")}>Back</Button>
                <Button appearance="primary" disabled={busy || (cloudChecks && (!readiness || readiness.blocking))} onClick={submit}>
                    {busy ? "Starting…" : "Deploy"}
                </Button>
            </Footer>
        </>
    );
}

function stepMeta(step: DeployRun["steps"][number]): string {
    if (step.state === "done") {
        return step.seconds !== undefined ? `${step.seconds} s` : "";
    }
    return step.state === "running" && step.id === "build" && step.percent !== undefined ? `${step.percent}%` : "";
}

function RunSteps({ target, run, environment }: { target: DeployTarget; run: DeployRun; environment: string }) {
    return (
        <Checklist>
            {run.steps.map((step) => (
                <CheckRow key={step.id} style={step.state === "pending" ? { color: "var(--vscode-descriptionForeground)" } : undefined}>
                    {step.state === "done" && <DeployIcon name="bi-success" color={SUCCESS} />}
                    {step.state === "running" && <Spinner />}
                    {step.state === "pending" && <MarkBox><PendingMark /></MarkBox>}
                    <Grow>{runStepLabel(target, step.id, environment)}</Grow>
                    <Muted style={{ fontSize: 12 }}>{stepMeta(step)}</Muted>
                </CheckRow>
            ))}
        </Checklist>
    );
}

function LiveResult({ target, projectPath, status, onDone }: { target: DeployTarget; projectPath: string; status: DeployStatus; onDone: () => void }) {
    const { rpcClient } = useRpcContext();
    const app = status.deployed!;
    const isAgent = isAgentTarget(target);
    return (
        <>
            <Center>
                <Stack style={{ gap: 12, alignItems: "center" }}>
                    <DeployIcon name="bi-success" size={36} color={SUCCESS} />
                    <Stack style={{ gap: 4, alignItems: "center" }}>
                        <StepTitle>Deployed</StepTitle>
                        <Muted>{app.name} is running in the {app.environment} environment.</Muted>
                        <Muted>Built from {app.branch} · {app.commit}</Muted>
                    </Stack>
                </Stack>
                <Group aria-labelledby="deploy-endpoint" style={{ width: "100%", maxWidth: 460, alignItems: "stretch" }}>
                    <GroupLabel id="deploy-endpoint" style={{ textAlign: "start" }}>Endpoint</GroupLabel>
                    <Endpoint>
                        <span style={{ flex: 1, minWidth: 0 }}>{app.endpointUrl}</span>
                        <Button appearance="icon" tooltip="Copy Endpoint URL" onClick={(): void => void navigator.clipboard.writeText(app.endpointUrl)}>
                            <DeployIcon name="bi-copy" />
                        </Button>
                    </Endpoint>
                </Group>
                <Actions style={{ justifyContent: "center" }}>
                    {isAgent && (
                        <Button appearance="primary" onClick={() => openDeployLink(rpcClient, target, projectPath, "openTryIt")}>
                            <Row><DeployIcon name="bi-play" size={20} />Try It</Row>
                        </Button>
                    )}
                    <Button appearance={isAgent ? "secondary" : "primary"} onClick={() => openDeployLink(rpcClient, target, projectPath, "openInConsole")}>View in Console</Button>
                </Actions>
            </Center>
            <Footer><Button appearance="secondary" onClick={onDone}>Done</Button></Footer>
        </>
    );
}

interface BuiltNotDeployedProps {
    built: NonNullable<DeployStatus["built"]>;
    busy: boolean;
    onDeploy: () => void;
    onConsole: () => void;
}

export const BUILT_LABELS: Record<NonNullable<DeployStatus["built"]>["state"], string> = {
    built: "Built, Not Deployed",
    deployFailed: "Deploy Failed",
    buildFailed: "Build Failed",
};

export function BuiltNotDeployed({ built, busy, onDeploy, onConsole }: BuiltNotDeployedProps) {
    const buildFailed = built.state === "buildFailed";
    return (
        <>
            <Stack style={{ gap: 4 }}>
                <Row>
                    <MarkBox size={12}><Dot color={built.state === "built" ? "var(--vscode-descriptionForeground)" : "var(--vscode-testing-iconFailed)"} /></MarkBox>
                    <span>{BUILT_LABELS[built.state]}</span>
                </Row>
                <Muted style={{ fontSize: 12 }}>{built.branch} · {built.commit}</Muted>
                {buildFailed && <Muted style={{ fontSize: 12 }}>Push a fix to build again.</Muted>}
            </Stack>
            <Actions>
                {!buildFailed && <Button appearance="primary" disabled={busy} onClick={onDeploy}>{busy ? "Deploying…" : "Deploy Build"}</Button>}
                <Button appearance={buildFailed ? "primary" : "secondary"} onClick={onConsole}>View in Console</Button>
            </Actions>
        </>
    );
}

function DeployStep({ status, environment, onClose, ...context }: WizardContext & { status?: DeployStatus; environment: string; onClose: () => void }) {
    const { rpcClient } = useRpcContext();
    const { target, projectPath } = context;
    const deployBackend = useDeployBackend(target);
    const refresh = useRefreshDeployStatus(target, projectPath);
    const { busy, run } = useAsync();
    if (!status?.run && status?.built && deployBackend.deployBuild) {
        const deployBuild = () => run(async () => { await deployBackend.deployBuild!(projectPath); await refresh(); });
        return <BuiltNotDeployed built={status.built} busy={busy} onDeploy={deployBuild} onConsole={() => openDeployLink(rpcClient, target, projectPath, "openInConsole")} />;
    }
    if (!status?.run) {
        return <Loader />;
    }
    if (status.run.live && status.deployed) {
        return <LiveResult target={target} projectPath={context.projectPath} status={status} onDone={onClose} />;
    }
    return (
        <>
            <Stack style={{ gap: 4 }}>
                <StepTitle>Deploying</StepTitle>
                <Muted>This window can be closed. The Deploy panel keeps showing the progress.</Muted>
            </Stack>
            <RunSteps target={target} run={status.run} environment={environment} />
            <Detail><VSCodeLink onClick={() => openDeployLink(rpcClient, target, context.projectPath, "openBuildLogs")}>View Build Logs</VSCodeLink></Detail>
            <Footer><Button appearance="secondary" onClick={onClose}>Close</Button></Footer>
        </>
    );
}

export function FormError({ error, onBack }: { error: Error | null; onBack: () => void }) {
    if (!error) {
        return <Loader />;
    }
    return (
        <>
            <StepTitle>Configure</StepTitle>
            <ErrorText role="alert">{error.message}</ErrorText>
            <Footer><Button appearance="secondary" onClick={onBack}>Back</Button></Footer>
        </>
    );
}

interface DeployWizardProps extends WizardContext {
    title: string;
    subtitle?: string;
    onClose: () => void;
}

export function DeployWizard({ title, subtitle, onClose, ...context }: DeployWizardProps) {
    const { target, projectPath } = context;
    const { data: status } = useDeployStatus(target, projectPath);
    const deployBackend = useDeployBackend(target);
    const refreshStatus = useRefreshDeployStatus(target, projectPath);
    const sourceQuery = useQuery({ queryKey: ["deploySource", target, projectPath], queryFn: () => deployBackend.getSource(target, projectPath) });
    const formQuery = useQuery({ queryKey: ["deployForm", target, projectPath], queryFn: () => deployBackend.getForm(target, projectPath), retry: false });
    const form = formQuery.data;
    const [step, setStep] = useState<StepId>();
    const source = sourceQuery.data;

    useEffect(() => {
        if (source && status && !step) {
            setStep(firstOpenStep(source, status));
        }
    }, [source, status, step]);

    const reload = () => Promise.all([sourceQuery.refetch(), formQuery.refetch(), refreshStatus()]);

    const renderStep = (close: () => void): ReactNode => {
        if (!source || !step) {
            return <Loader />;
        }
        const props: StepProps = { ...context, source, goTo: setStep, reload };
        const views: Record<StepId, () => ReactNode> = {
            prepare: () => <PrepareStep {...props} />,
            push: () => <PushStep {...props} />,
            // The form seeds the step's values once, so a form restored from the persisted cache must not be the one it starts from.
            configure: () => (!formQuery.isFetchedAfterMount ? <Loader />
                : form ? <ConfigureStep {...props} form={form} /> : <FormError error={formQuery.error} onBack={() => setStep("push")} />),
            deploy: () => <DeployStep {...context} status={status} environment={form?.environment ?? ""} onClose={close} />,
        };
        return views[step]();
    };

    const steps = stepsFor(target, source).map(({ id, label }) =>
        ({ id, label, done: !!source && stepDone(id, source, status) && (id !== step || id === "deploy") }));
    return (
        <DeployPopup title={title} subtitle={subtitle} onClose={onClose} maxWidth={720} height="min(620px, 85vh)">
            {(close) => <WizardLayout steps={steps} current={step}>{renderStep(close)}</WizardLayout>}
        </DeployPopup>
    );
}

export function WizardLayout({ steps, current, children }: { steps: { id: string; label: string; done: boolean }[]; current?: string; children: ReactNode }) {
    return (
        <Layout>
            <StepList>
                {steps.map(({ id, label, done }, index) => (
                    <StepItem key={id} current={id === current} aria-current={id === current ? "step" : undefined}>
                        <StepMarker done={done}>{done ? <DeployIcon name="bi-check" size={12} /> : <StepNumber>{index + 1}</StepNumber>}</StepMarker>
                        {label}
                    </StepItem>
                ))}
            </StepList>
            <Content>{children}</Content>
        </Layout>
    );
}
