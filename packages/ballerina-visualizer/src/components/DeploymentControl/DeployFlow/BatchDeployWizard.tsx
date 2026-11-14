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
import { useQueries } from "@tanstack/react-query";
import { DIRECTORY_MAP, ProjectStructureResponse } from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { Button, CheckBox, Dropdown, ProgressRing, TextField } from "@wso2/ui-toolkit";
import { VSCodeLink } from "@vscode/webview-ui-toolkit/react";
import { getIntegrationScopeText } from "@wso2/wso2-platform-core";
import { getIntegrationTypes } from "../../../views/BI/PackageOverview/utils";
import { Actions, DeployIcon, DeployPopup, Dot, MarkBox, Row, SUCCESS, Spinner, Stack } from "../shared";
import { ErrorText, Muted } from "../AgentManagerConfigFields";
import {
    BUILT_LABELS, CheckRow, Checklist, CloudSourceFields, ConfigureValues, Detail, Fields, Footer, FormError, Group, GroupLabel, Groups, Grow, Loader,
    NEW_PROJECT, PendingMark, PrepareStep, PushStep, SetValue, StepId, StepTitle, WizardLayout, firstOpenStep, initialValues,
} from "./DeployWizard";
import {
    DeployBackend, DeployForm, DeploySource, DeployStatus, DeployTarget, PrepItem, type SourceReadiness, isRunning, openDeployLink, runStepLabel,
    useDeployBackend, useDeployStatus, useDeployStatuses, useRefreshDeployStatus,
} from "./deployBackend";

const TARGET: DeployTarget = "cloudIntegration";
const FAILED = "var(--vscode-testing-iconFailed)";
const IDLE = "var(--vscode-descriptionForeground)";

export interface BatchPackage {
    projectPath: string;
    title: string;
    isAgent: boolean;
    /** What the package deploys as by default, such as AI Agent or MCP Server. */
    typeLabel: string;
    /** Why the package is not deployed: a library, or nothing in it to deploy. */
    skipReason?: string;
}

export type BatchStatuses = Map<string, DeployStatus | undefined>;

export function batchPackages(collection: ProjectStructureResponse): BatchPackage[] {
    return collection.projects.map((project) => {
        const isAgent = (project.directoryMap[DIRECTORY_MAP.AGENT]?.length ?? 0) > 0;
        const scopes = getIntegrationTypes(project);
        const skipReason = project.isLibrary ? "Library" : isAgent || scopes.length > 0 ? undefined : "Nothing to Deploy";
        const typeLabel = isAgent ? "AI Agent" : scopes[0] ? getIntegrationScopeText(scopes[0]) : "Integration";
        return { projectPath: project.projectPath ?? "", title: project.projectTitle || project.projectName, isAgent, typeLabel, skipReason };
    });
}

export function useBatchStatuses(packages: BatchPackage[]): BatchStatuses {
    const paths = packages.filter((item) => !item.skipReason).map((item) => item.projectPath);
    const queries = useDeployStatuses(TARGET, paths);
    return new Map(paths.map((path, index) => [path, queries[index]?.data]));
}

const isStarted = (status?: DeployStatus) => !!status && !!(status.run || status.deployed || status.built || status.linked);
const isFailed = (status?: DeployStatus) => !!status?.built && status.built.state !== "built";
const PARALLEL_DEPLOYS = 3;
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
const nounOf = (items: BatchPackage[]) => (items.length > 0 && items.every((item) => item.isAgent) ? "Agent" : "Integration");

export function batchTag(statuses: BatchStatuses): string | undefined {
    const all = [...statuses.values()];
    if (all.some(isRunning)) {
        return "Deploying";
    }
    const deployed = all.filter((status) => status?.deployed).length;
    if (deployed === 0) {
        return undefined;
    }
    return deployed === all.length ? "Deployed" : `${deployed} of ${all.length} Deployed`;
}

function statusLabel(status?: DeployStatus): string {
    if (isRunning(status)) {
        return "Deploying";
    }
    if (status?.deployed) {
        return "Deployed";
    }
    return status?.built ? BUILT_LABELS[status.built.state] : "Not Deployed";
}

function StatusMark({ status }: { status?: DeployStatus }) {
    if (isRunning(status)) {
        return <Spinner size={12} />;
    }
    return <MarkBox size={12}><Dot color={status?.deployed ? SUCCESS : isFailed(status) ? FAILED : IDLE} /></MarkBox>;
}

/** A package's WSO2 Cloud state on its overview card; nothing until a deploy has started. */
export function DeployStatusChip({ projectPath }: { projectPath: string }) {
    const { data: status } = useDeployStatus(TARGET, projectPath);
    if (!status?.signedIn || !isStarted(status)) {
        return null;
    }
    return <Row style={{ fontSize: 12, flexShrink: 0 }}><StatusMark status={status} /><Muted>{statusLabel(status)}</Muted></Row>;
}

function countsLine(statuses: (DeployStatus | undefined)[], notCreated = 0): string {
    const of = (test: (status?: DeployStatus) => boolean) => statuses.filter(test).length;
    const deploying = of(isRunning);
    const failed = of(isFailed) + notCreated;
    return [
        `${of((status) => !!status?.deployed)} of ${statuses.length} Deployed`,
        deploying > 0 && `${deploying} Deploying`,
        failed > 0 && `${failed} Failed`,
    ].filter(Boolean).join(" · ");
}

const Footnote = styled(Muted)`
    font-size: 12px;
    border-top: 1px solid var(--vscode-welcomePage-tileBorder);
    padding-top: 10px;
`;

interface BatchDeployCardProps {
    packages: BatchPackage[];
    statuses: BatchStatuses;
    workspaceTitle: string;
}

/** WSO2 Cloud in a project's Deploy panel: every package's status, and one wizard that deploys the ones not yet deployed. */
export function BatchDeployCard({ packages, statuses, workspaceTitle }: BatchDeployCardProps) {
    const { rpcClient } = useRpcContext();
    const backend = useDeployBackend(TARGET);
    const refresh = useRefreshDeployStatus(TARGET);
    const [wizard, setWizard] = useState<{ progressOf?: string[] }>();
    const [busy, setBusy] = useState(false);
    const first = [...statuses.values()][0];
    const deployable = packages.filter((item) => !item.skipReason);
    const pending = deployable.filter((item) => !isStarted(statuses.get(item.projectPath)));
    const deployed = deployable.find((item) => statuses.get(item.projectPath)?.deployed);
    const deploying = deployable.filter((item) => isRunning(statuses.get(item.projectPath))).map((item) => item.projectPath);
    const noun = nounOf(deployable);
    const session = async (signIn: boolean) => {
        setBusy(true);
        await (signIn ? backend.signIn(TARGET) : backend.signOut(TARGET)).catch((): void => undefined).finally(() => setBusy(false));
        refresh();
    };
    const summary = <p style={{ margin: 0 }}>Build and run the {noun.toLowerCase()}s in this project on WSO2 Cloud, a fully managed platform.</p>;

    if (statuses.size > 0 && !first) {
        return <ProgressRing />;
    }
    if (first && !first.signedIn) {
        return (
            <Stack>
                {summary}
                <Actions><Button appearance="primary" disabled={busy} onClick={() => session(true)}>Sign In to WSO2 Cloud</Button></Actions>
            </Stack>
        );
    }
    return (
        <Stack>
            {summary}
            {deployable.length > 0 && <span>{countsLine(deployable.map((item) => statuses.get(item.projectPath)))}</span>}
            {deploying.length > 0 && <VSCodeLink onClick={() => setWizard({ progressOf: deploying })}>Show Progress</VSCodeLink>}
            <Actions>
                {pending.length > 0 && (
                    <Button appearance="primary" onClick={() => setWizard({})}>Deploy {plural(pending.length, nounOf(pending))}</Button>
                )}
                {deployed && (
                    <Button appearance="secondary" onClick={() => rpcClient.getPlatformRpcClient().runCloudDeployAction({ projectPath: deployed.projectPath, action: "openProjectInConsole" })}>
                        View in Console
                    </Button>
                )}
            </Actions>
            {first && <Footnote>Signed in to WSO2 Cloud as {first.account} · <VSCodeLink onClick={() => session(false)}>Sign Out</VSCodeLink></Footnote>}
            {wizard && (
                <BatchDeployWizard packages={packages} statuses={statuses} subtitle={`${workspaceTitle} · ${first?.account ?? ""}`}
                    progressOf={wizard.progressOf} onClose={() => setWizard(undefined)} />
            )}
        </Stack>
    );
}

type BatchStepId = "select" | StepId;

const BATCH_STEPS: { id: BatchStepId; label: string }[] = [
    { id: "select", label: "Select" },
    { id: "prepare", label: "Prepare Project" },
    { id: "push", label: "Push to GitHub" },
    { id: "configure", label: "Configure" },
    { id: "deploy", label: "Deploy" },
];
const ORDER = BATCH_STEPS.map((step) => step.id);

function batchSteps(noun: string, step: BatchStepId, source: DeploySource | undefined, allDeployed: boolean) {
    return BATCH_STEPS
        .filter(({ id }) => id !== "prepare" || !source || source.prepItems.length > 0)
        .map(({ id, label }) => ({
            id,
            label: id === "select" ? `Select ${noun}s` : label,
            done: ORDER.indexOf(id) < ORDER.indexOf(step) || (id === "deploy" && allDeployed),
        }));
}

/** Each change once, naming the packages that need it. */
export function mergePrepItems(titles: string[], sources: DeploySource[]): PrepItem[] {
    const merged = new Map<string, PrepItem>();
    sources.forEach((source, index) => source.prepItems.forEach((prep) => {
        const current = merged.get(prep.id) ?? { ...prep, done: true, for: [] };
        merged.set(prep.id, { ...current, done: current.done && prep.done, for: prep.done ? current.for : [...(current.for ?? []), titles[index]] });
    }));
    return [...merged.values()];
}

// The packages share one repository, so its branch, commit and unpushed commits are the same for each.
function mergeSources(titles: string[], sources: (DeploySource | undefined)[]): DeploySource | undefined {
    if (sources.length === 0 || sources.some((source) => !source)) {
        return undefined;
    }
    const loaded = sources as DeploySource[];
    return {
        ...loaded[0],
        prepItems: mergePrepItems(titles, loaded),
        changedFiles: loaded.reduce((sum, source) => sum + source.changedFiles, 0),
        unpushedCommits: Math.max(...loaded.map((source) => source.unpushedCommits)),
    };
}

interface SelectStepProps {
    candidates: BatchPackage[];
    hidden: number;
    selected: string[];
    noun: string;
    onSelect: (selected: string[]) => void;
    onContinue: () => void;
}

// Only packages that have never been deployed are listed: the rest redeploy on push or have nothing to deploy.
function SelectStep({ candidates, hidden, selected, noun, onSelect, onContinue }: SelectStepProps) {
    const toggle = (path: string, on: boolean) => onSelect(on ? [...selected, path] : selected.filter((item) => item !== path));
    const all = selected.length === candidates.length;
    return (
        <>
            <Stack style={{ gap: 4 }}>
                <StepTitle>Select {noun}s</StepTitle>
                <Muted>Each {noun.toLowerCase()} is deployed as its own integration in one WSO2 Cloud project.</Muted>
            </Stack>
            <Stack style={{ gap: 8 }}>
                <CheckBox label="Select All" checked={all} indeterminate={!all && selected.length > 0}
                    onChange={(on: boolean) => onSelect(on ? candidates.map((item) => item.projectPath) : [])} />
                <Checklist>
                    {candidates.map((item) => (
                        <CheckRow key={item.projectPath}>
                            <Grow>
                                <CheckBox label={item.title} checked={selected.includes(item.projectPath)} onChange={(on: boolean) => toggle(item.projectPath, on)} />
                            </Grow>
                            <Muted style={{ fontSize: 12 }}>{item.typeLabel}</Muted>
                        </CheckRow>
                    ))}
                </Checklist>
                {hidden > 0 && <Detail>{plural(hidden, "other package")} {hidden === 1 ? "is" : "are"} deployed already or {hidden === 1 ? "has" : "have"} nothing to deploy.</Detail>}
            </Stack>
            <Footer>
                <Muted style={{ marginRight: "auto" }}>{selected.length} selected</Muted>
                <Button appearance="primary" disabled={selected.length === 0} onClick={onContinue}>Continue</Button>
            </Footer>
        </>
    );
}

interface BatchInput {
    values: ConfigureValues;
    names: string[];
    types: string[];
}

interface PackageFieldsProps {
    item: BatchPackage;
    form: DeployForm;
    index: number;
    name: string;
    type: string;
    error?: string;
    onName: (name: string) => void;
    onType: (type: string) => void;
}

function PackageFields({ item, form, index, name, type, error, onName, onType }: PackageFieldsProps) {
    const types = form.integrationTypes ?? [];
    const included = (form.included ?? []).map((entry) => entry.value).join(", ");
    const detail = [types.length === 1 && types[0].label, included && `Includes ${included}`].filter(Boolean).join(" · ");
    return (
        <Stack style={{ gap: 4 }}>
            <TextField id={`batch-name-${index}`} label={item.title} value={name} required errorMsg={error} onTextChange={onName} />
            {types.length > 1 && (
                <Dropdown id={`batch-type-${index}`} label="Type" value={type} onValueChange={onType}
                    items={types.map((option) => ({ id: option.value, value: option.value, content: option.label }))} />
            )}
            {detail && <Detail>{detail}</Detail>}
        </Stack>
    );
}

interface BatchConfigureStepProps {
    items: BatchPackage[];
    forms: DeployForm[];
    source: DeploySource;
    noun: string;
    goTo: (step: StepId) => void;
    onDeploy: (input: BatchInput) => void;
}

function BatchConfigureStep({ items, forms, source, noun, goTo, onDeploy }: BatchConfigureStepProps) {
    const [first] = forms;
    const [v, setValues] = useState<ConfigureValues>(() => initialValues(first));
    const [names, setNames] = useState(() => forms.map((form) => form.name));
    const [types, setTypes] = useState(() => forms.map((form) => form.integrationType ?? ""));
    const [checked, setChecked] = useState(false);
    const [editingNames, setEditingNames] = useState(false);
    const [readiness, setReadiness] = useState<SourceReadiness>();
    const set: SetValue = (key, value) => setValues((current) => ({ ...current, [key]: value }));
    const missing = (value: string, label: string) => (checked && !value.trim() ? `Enter the ${label}.` : undefined);
    const update = (list: string[], index: number, value: string) => list.map((item, at) => (at === index ? value : item));
    const projectItems = [
        ...first.projects.map((item) => ({ id: item.name, value: item.name, content: item.displayName })),
        { id: NEW_PROJECT, value: NEW_PROJECT, content: "Create New Project…" },
    ];
    const submit = () => {
        setChecked(true);
        const empty = names.findIndex((name) => !name.trim());
        const focus = empty >= 0 ? `batch-name-${empty}` : v.project === NEW_PROJECT && !v.newProject.trim() ? "deploy-new-project" : undefined;
        if (empty >= 0) {
            setEditingNames(true);
        }
        if (focus) {
            document.getElementById(focus)?.focus();
            return;
        }
        onDeploy({ values: v, names, types });
    };
    return (
        <>
            <Stack style={{ gap: 4 }}>
                <StepTitle>Configure</StepTitle>
                <Muted>Name each {noun.toLowerCase()} and choose what to build.</Muted>
            </Stack>
            <Groups>
                <Fields>
                    <Dropdown id="deploy-project" label="Project" value={v.project} onValueChange={(value) => set("project", value)} items={projectItems} />
                    {v.project === NEW_PROJECT && (
                        <TextField id="deploy-new-project" label="New Project Name" value={v.newProject} required
                            onTextChange={(text) => set("newProject", text)} errorMsg={missing(v.newProject, "project name")} />
                    )}
                </Fields>
                <CloudSourceFields target={TARGET} projectPath={items[0].projectPath} form={first} v={v} set={set} commit={source.commit}
                    changedFiles={source.changedFiles} onReadiness={setReadiness} />
                <Group aria-labelledby="batch-packages">
                    <GroupLabel id="batch-packages">{noun}s</GroupLabel>
                    {editingNames ? (
                        <Fields>
                            {items.map((item, index) => (
                                <PackageFields key={item.projectPath} item={item} form={forms[index]} index={index} name={names[index]} type={types[index]}
                                    error={missing(names[index], "name")} onName={(text) => setNames(update(names, index, text))}
                                    onType={(value) => setTypes(update(types, index, value))} />
                            ))}
                        </Fields>
                    ) : (
                        <Detail>
                            {plural(items.length, noun.toLowerCase())}, each named after its package.{" "}
                            <VSCodeLink onClick={() => setEditingNames(true)}>Edit Names</VSCodeLink>
                        </Detail>
                    )}
                </Group>
            </Groups>
            <Footer>
                <Button appearance="secondary" onClick={() => goTo("push")}>Back</Button>
                <Button appearance="primary" disabled={!readiness || readiness.blocking} onClick={submit}>Deploy {plural(items.length, noun)}</Button>
            </Footer>
        </>
    );
}

interface BatchRun {
    started: string[];
    errors: Record<string, string>;
}

type Report = (update: (run: BatchRun) => BatchRun) => void;

const failWith = (report: Report, path: string, message: string) => report((run) => ({ ...run, errors: { ...run.errors, [path]: message } }));

// The first deploy runs alone because it may create the project; the rest go to that project a few at a time.
async function deployEach(backend: DeployBackend, items: BatchPackage[], input: BatchInput, report: Report) {
    const { values, names, types } = input;
    const deployOne = async (index: number, project?: string): Promise<string | undefined> => {
        const path = items[index].projectPath;
        report((run) => ({ ...run, started: [...run.started, path] }));
        try {
            await backend.deploy(TARGET, path, {
                name: names[index], project: project ?? values.newProject, newProject: project ? undefined : values.newProject,
                remote: values.remote, branch: values.branch, integrationType: types[index] || undefined, values: {},
            });
            return project ?? await backend.getForm(TARGET, path).then((form) => form.linkedProject, (): undefined => undefined);
        } catch (error) {
            failWith(report, path, error instanceof Error ? error.message : String(error));
            return project;
        }
    };
    const project = await deployOne(0, values.project === NEW_PROJECT ? undefined : values.project);
    const queue = items.slice(1).map((_, at) => at + 1);
    if (!project) {
        queue.forEach((index) => failWith(report, items[index].projectPath, "Not deployed: the new project was not created."));
        return;
    }
    const worker = async () => {
        for (let index = queue.shift(); index !== undefined; index = queue.shift()) {
            await deployOne(index, project);
        }
    };
    await Promise.all(Array.from({ length: PARALLEL_DEPLOYS }, worker));
}

function runState(status: DeployStatus | undefined, failed: boolean, waiting: boolean, environment: string): [ReactNode, string] {
    if (failed) {
        return [<MarkBox><Dot color={FAILED} /></MarkBox>, "Failed"];
    }
    if (waiting) {
        return [<MarkBox><PendingMark /></MarkBox>, "Waiting"];
    }
    if (status?.deployed) {
        return [<DeployIcon name="bi-success" color={SUCCESS} />, "Deployed"];
    }
    if (status?.built) {
        return [<MarkBox><Dot color={status.built.state === "built" ? IDLE : FAILED} /></MarkBox>, BUILT_LABELS[status.built.state]];
    }
    const current = status?.run?.steps.find((step) => step.state === "running");
    return [<Spinner />, current ? runStepLabel(TARGET, current.id, environment) : "Starting"];
}

function RunRow({ item, status, error, waiting, environment }: { item: BatchPackage; status?: DeployStatus; error?: string; waiting: boolean; environment: string }) {
    const { rpcClient } = useRpcContext();
    const [mark, text] = runState(status, !!error, waiting, environment);
    return (
        <CheckRow>
            {mark}
            <Grow>
                <span>{item.title}</span>
                {error && <ErrorText role="alert">{error}</ErrorText>}
            </Grow>
            <Muted style={{ fontSize: 12 }}>{text}</Muted>
            {(status?.deployed || status?.built) && (
                <VSCodeLink onClick={() => openDeployLink(rpcClient, TARGET, item.projectPath, "openInConsole")}>View in Console</VSCodeLink>
            )}
        </CheckRow>
    );
}

interface BatchDeployStepProps {
    items: BatchPackage[];
    statuses: BatchStatuses;
    run: BatchRun;
    environment: string;
    onClose: () => void;
}

function BatchDeployStep({ items, statuses, run, environment, onClose }: BatchDeployStepProps) {
    const failed = (item: BatchPackage) => !!run.errors[item.projectPath] || isFailed(statuses.get(item.projectPath));
    const ordered = [...items.filter(failed), ...items.filter((item) => !failed(item))];
    return (
        <>
            <Stack style={{ gap: 4 }}>
                <StepTitle>Deploying</StepTitle>
                <Muted>This window can be closed. The Deploy panel keeps showing the progress.</Muted>
            </Stack>
            <span>{countsLine(items.map((item) => statuses.get(item.projectPath)), Object.keys(run.errors).length)}</span>
            <Checklist>
                {ordered.map((item) => (
                    <RunRow key={item.projectPath} item={item} status={statuses.get(item.projectPath)} error={run.errors[item.projectPath]}
                        waiting={!run.started.includes(item.projectPath)} environment={environment} />
                ))}
            </Checklist>
            <Footer><Button appearance="secondary" onClick={onClose}>Close</Button></Footer>
        </>
    );
}

interface BatchDeployWizardProps {
    packages: BatchPackage[];
    statuses: BatchStatuses;
    subtitle: string;
    /** Packages already deploying: the wizard opens on its Deploy step to follow them. */
    progressOf?: string[];
    onClose: () => void;
}

function BatchDeployWizard({ packages, statuses, subtitle, progressOf, onClose }: BatchDeployWizardProps) {
    const backend = useDeployBackend(TARGET);
    const refreshStatuses = useRefreshDeployStatus(TARGET);
    const candidates = packages.filter((item) => !item.skipReason && !isStarted(statuses.get(item.projectPath)));
    const [selected, setSelected] = useState(() => progressOf ?? candidates.map((item) => item.projectPath));
    const [confirmed, setConfirmed] = useState(!!progressOf);
    const [step, setStep] = useState<BatchStepId>(progressOf ? "deploy" : "select");
    const [run, setRun] = useState<BatchRun>({ started: progressOf ?? [], errors: {} });
    const items = packages.filter((item) => selected.includes(item.projectPath));
    const titles = items.map((item) => item.title);
    const sources = useQueries({
        queries: items.map((item) => ({
            queryKey: ["deploySource", TARGET, item.projectPath],
            queryFn: () => backend.getSource(TARGET, item.projectPath),
            enabled: confirmed && !progressOf,
        })),
    });
    const forms = useQueries({
        queries: items.map((item) => ({
            queryKey: ["deployForm", TARGET, item.projectPath],
            queryFn: () => backend.getForm(TARGET, item.projectPath),
            enabled: confirmed,
            retry: false,
        })),
    });
    const source = mergeSources(titles, sources.map((query) => query.data));
    const noun = nounOf(confirmed ? items : packages.filter((item) => !item.skipReason));

    useEffect(() => {
        if (confirmed && step === "select" && source) {
            setStep(firstOpenStep(source));
        }
    }, [confirmed, step, source]);

    const reload = () => Promise.all([...sources, ...forms].map((query) => query.refetch()));
    const apply = async (skip: string[]) => {
        for (const [index, item] of items.entries()) {
            if (sources[index].data?.prepItems.some((prep) => !prep.done)) {
                await backend.prepare(TARGET, item.projectPath, skip);
            }
        }
    };
    // shortcut: commitAndPush stages only its own package's folder, so each package with changes gets its own commit; one commit needs a multi-folder commit action.
    const push = async (message: string) => {
        const dirty = items.filter((_, index) => (sources[index].data?.changedFiles ?? 0) > 0);
        for (const item of dirty.length > 0 ? dirty : items.slice(0, 1)) {
            await backend.commitAndPush(item.projectPath, message);
        }
    };
    const deploy = (input: BatchInput) => {
        setStep("deploy");
        const report = (update: (current: BatchRun) => BatchRun) => {
            setRun(update);
            void refreshStatuses();
        };
        void deployEach(backend, items, input, report).finally(refreshStatuses);
    };

    const renderStep = (close: () => void): ReactNode => {
        if (step === "select") {
            return confirmed ? <Loader /> : (
                <SelectStep candidates={candidates} hidden={packages.length - candidates.length} selected={selected} noun={noun}
                    onSelect={setSelected} onContinue={() => setConfirmed(true)} />
            );
        }
        if (step === "deploy") {
            return <BatchDeployStep items={items} statuses={statuses} run={run} environment={forms[0]?.data?.environment ?? ""} onClose={close} />;
        }
        if (!source) {
            return <Loader />;
        }
        const props = { target: TARGET, projectPath: items[0].projectPath, noun: "project", source, goTo: setStep, reload };
        const formsReady = forms.every((query) => query.isFetchedAfterMount && query.data);
        const formError = forms.find((query) => query.error)?.error ?? null;
        const views: Record<Exclude<StepId, "deploy">, () => ReactNode> = {
            prepare: () => <PrepareStep {...props} apply={apply} />,
            push: () => <PushStep {...props} push={push} />,
            configure: () => (formsReady
                ? <BatchConfigureStep items={items} forms={forms.map((query) => query.data!)} source={source} noun={noun} goTo={setStep} onDeploy={deploy} />
                : <FormError error={formError} onBack={() => setStep("push")} />),
        };
        return views[step]();
    };

    const allDeployed = items.length > 0 && items.every((item) => statuses.get(item.projectPath)?.deployed);
    return (
        <DeployPopup title="Deploy to WSO2 Cloud" subtitle={subtitle} onClose={onClose} maxWidth={720} height="min(620px, 85vh)">
            {(close) => <WizardLayout steps={batchSteps(noun, step, source, allDeployed)} current={step}>{renderStep(close)}</WizardLayout>}
        </DeployPopup>
    );
}
