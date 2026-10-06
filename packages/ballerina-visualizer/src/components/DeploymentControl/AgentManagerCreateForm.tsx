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

import React, { useEffect, useState } from "react";
import styled from "@emotion/styled";
import {
    AgentManagerConfigField,
    AgentManagerCreateForm as CreateFormData,
    AgentManagerRepoDetails,
    AgentManagerSourceCheck,
} from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { Button, Codicon, Dropdown, ProgressRing, TextField } from "@wso2/ui-toolkit";
import { VSCodeLink } from "@vscode/webview-ui-toolkit/react";
import { PopupContent, PopupFooter } from "../../views/BI/Connection/styles";
import {
    ConfigFieldInput, ErrorText, Group, GroupTitle, groupFields, Label, Loading, Muted, Pill, Section, Summary, Value,
} from "./AgentManagerConfigForm";

const NEW_PROJECT = "$new-project";
const NEW_TOKEN = "$new-token";

const Row = styled.div`
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
`;

const Check = styled.div<{ ok: boolean }>`
    display: flex;
    gap: 6px;
    align-items: flex-start;
    font-size: 12px;
    color: ${({ ok }: { ok: boolean }) => (ok ? "var(--vscode-testing-iconPassed)" : "var(--vscode-editorWarning-foreground)")};
`;

const ShowMore = styled.button`
    align-self: flex-start;
    padding: 0;
    border: none;
    background: none;
    color: var(--vscode-textLink-foreground);
    font: inherit;
    cursor: pointer;
`;

interface AgentManagerCreateFormProps {
    projectPath: string;
    onDone: () => void;
    onCancel: () => void;
}

// Only required values with nothing to prefill need attention; the rest stay folded so long lists don't bury them.
function needsInput(field: AgentManagerConfigField): boolean {
    return field.required && !field.saved && !field.localValue && !field.unsupported;
}

function tokenOptions(repo: AgentManagerRepoDetails | undefined, secrets: string[]) {
    if (repo?.isPrivate === false) {
        return [{ value: "", content: "Not Required (Public Repository)" }];
    }
    return [...secrets.map((name) => ({ value: name, content: name })), { value: NEW_TOKEN, content: "Add Personal Token…" }];
}

export function AgentManagerCreateForm({ projectPath, onDone, onCancel }: AgentManagerCreateFormProps) {
    const { rpcClient } = useRpcContext();
    const rpc = rpcClient.getAgentManagerRpcClient();
    const [form, setForm] = useState<CreateFormData | undefined>();
    const [agentName, setAgentName] = useState("");
    const [project, setProject] = useState("");
    const [newProject, setNewProject] = useState("");
    const [remote, setRemote] = useState("");
    const [repo, setRepo] = useState<AgentManagerRepoDetails | undefined>();
    const [branch, setBranch] = useState("");
    const [appPath, setAppPath] = useState("/");
    const [check, setCheck] = useState<AgentManagerSourceCheck | undefined>();
    const [gitSecret, setGitSecret] = useState(NEW_TOKEN);
    const [newToken, setNewToken] = useState("");
    const [values, setValues] = useState<Record<string, string>>({});
    const [secrets, setSecrets] = useState<Record<string, boolean>>({});
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | undefined>();
    const [recheck, setRecheck] = useState(0);

    const enableTracing = async () => {
        await rpc.runAgentManagerAction({ projectPath, action: "enableAmpTracing" });
        setForm((current) => current && { ...current, tracing: true });
        setRecheck((count) => count + 1);
    };

    useEffect(() => {
        rpc.getAgentManagerCreateForm({ projectPath }).then((loaded) => {
            setForm(loaded);
            setAgentName(loaded.agentName);
            setProject(loaded.projects[0]?.name ?? NEW_PROJECT);
            setRemote(loaded.defaultRemote ?? "");
            setAppPath(loaded.appPath);
            setValues(Object.fromEntries(loaded.fields.filter((f) => f.localValue && !f.saved).map((f) => [f.id, f.localValue!])));
            setSecrets(Object.fromEntries(loaded.fields.map((f) => [f.id, f.secret])));
        });
    }, [projectPath]);

    useEffect(() => {
        if (!remote || !form) {
            return;
        }
        setRepo(undefined);
        setBranch("");
        rpc.getAgentManagerRepoDetails({ projectPath, remote }).then((details) => {
            setRepo(details);
            setBranch(details.defaultBranch ?? details.branches[0] ?? "");
            const repository = form.remotes.find((candidate) => candidate.name === remote)?.repository ?? "";
            const matching = form.gitSecrets.find((name) => name === `${repository.replace("/", "-")}-git`.toLowerCase());
            setGitSecret(details.isPrivate === false ? "" : matching ?? form.gitSecrets[0] ?? NEW_TOKEN);
        });
    }, [remote, form]);

    useEffect(() => {
        setCheck(undefined);
        if (!remote || !branch) {
            return;
        }
        const timer = setTimeout(() => rpc.checkAgentManagerSource({ projectPath, remote, branch, appPath }).then(setCheck), 400);
        return () => clearTimeout(timer);
    }, [remote, branch, appPath, recheck]);

    const submit = async () => {
        setSubmitting(true);
        setError(undefined);
        const response = await rpc.createAgentManagerAgent({
            projectPath,
            project: project === NEW_PROJECT ? "" : project,
            newProject: project === NEW_PROJECT ? newProject.trim() : undefined,
            agentName: agentName.trim(),
            remote,
            branch,
            appPath,
            gitSecret: gitSecret === NEW_TOKEN || !gitSecret ? undefined : gitSecret,
            newToken: gitSecret === NEW_TOKEN ? newToken.trim() : undefined,
            config: { values, secrets },
        }).catch((err) => ({ success: false, message: String(err) }));
        setSubmitting(false);
        response.success ? onDone() : setError(response.message);
    };

    if (!form) {
        return <PopupContent><Loading><ProgressRing /></Loading></PopupContent>;
    }
    const needsToken = gitSecret === NEW_TOKEN && repo?.isPrivate !== false;
    const ready = !!check?.ok && !!agentName.trim() && (project !== NEW_PROJECT || !!newProject.trim()) && (!needsToken || !!newToken.trim());

    return (
        <>
            <PopupContent>
                {form.error && <ErrorText>{form.error}</ErrorText>}
                <TextField id="am-agent-name" label="Agent Name" value={agentName} onTextChange={setAgentName} required />
                <Dropdown
                    id="am-project"
                    label="Project"
                    containerSx={{ width: "100%" }}
                    value={project}
                    onValueChange={setProject}
                    items={[...form.projects.map((p) => ({ value: p.name, content: p.displayName || p.name })), { value: NEW_PROJECT, content: "Create New Project…" }]}
                />
                {project === NEW_PROJECT && (
                    <TextField id="am-new-project" label="New Project Name" value={newProject} onTextChange={setNewProject} required />
                )}
                <Dropdown
                    id="am-remote"
                    label="Repository"
                    containerSx={{ width: "100%" }}
                    value={remote}
                    onValueChange={setRemote}
                    items={form.remotes.map((r) => ({ value: r.name, content: `${r.repository} (${r.name})` }))}
                />
                <Row>
                    <Dropdown
                        id="am-branch"
                        label="Branch"
                        containerSx={{ width: "100%" }}
                        value={branch}
                        isLoading={!repo}
                        onValueChange={setBranch}
                        items={(repo?.branches ?? []).map((name) => ({ value: name, content: name }))}
                    />
                    <TextField id="am-app-path" label="Directory" value={appPath} onTextChange={setAppPath} />
                </Row>
                {repo?.error && <ErrorText>{repo.error}</ErrorText>}
                {check && (
                    <Check ok={check.ok}>
                        <Codicon name={check.ok ? "pass" : "warning"} sx={{ fontSize: 14 }} />
                        <span>{check.message}</span>
                    </Check>
                )}
                <Dropdown
                    id="am-git-secret"
                    label="Repository Access"
                    containerSx={{ width: "100%" }}
                    value={gitSecret}
                    onValueChange={setGitSecret}
                    disabled={repo?.isPrivate === false}
                    items={tokenOptions(repo, form.gitSecrets)}
                />
                {needsToken && (
                    <TextField
                        id="am-new-token"
                        label="Personal Access Token"
                        type="password"
                        placeholder="github_pat_…"
                        value={newToken}
                        onTextChange={setNewToken}
                        description="Read-only access to repository contents"
                        required
                    />
                )}
                <IncludedSection form={form} onEnableTracing={enableTracing} />
                <ConfigurablesSection
                    fields={form.fields}
                    values={values}
                    secrets={secrets}
                    onValue={(id, value) => setValues({ ...values, [id]: value })}
                    onSecret={(id, secret) => setSecrets({ ...secrets, [id]: secret })}
                />
                {error && <ErrorText>{error}</ErrorText>}
            </PopupContent>
            <PopupFooter>
                <Button appearance="secondary" disabled={submitting} onClick={onCancel}>Cancel</Button>
                <Button appearance="primary" disabled={submitting || !ready} onClick={submit}>{submitting ? "Creating…" : "Create and Deploy"}</Button>
            </PopupFooter>
        </>
    );
}

function IncludedSection({ form, onEnableTracing }: { form: CreateFormData; onEnableTracing: () => void }) {
    return (
        <Section>
            <GroupTitle>Included Automatically</GroupTitle>
            <Summary>
                <Label>Auto-Instrumentation</Label>
                <Value>{form.tracing ? "On" : <>Off · <VSCodeLink onClick={onEnableTracing}>Enable</VSCodeLink></>}</Value>
                {form.llmProviders.length > 0 && <>
                    <Label>LLM Service Providers</Label>
                    <Value>{form.llmProviders.map((name) => <Pill key={name}>{name}</Pill>)}</Value>
                </>}
                {form.mcpServers.length > 0 && <>
                    <Label>MCP Servers</Label>
                    <Value>{form.mcpServers.map((name) => <Pill key={name}>{name}</Pill>)}</Value>
                </>}
                <Label>Deploys To</Label>
                <Value>{form.environment}</Value>
            </Summary>
        </Section>
    );
}

interface ConfigurablesSectionProps {
    fields: AgentManagerConfigField[];
    values: Record<string, string>;
    secrets: Record<string, boolean>;
    onValue: (id: string, value: string) => void;
    onSecret: (id: string, secret: boolean) => void;
}

function ConfigurablesSection({ fields, values, secrets, onValue, onSecret }: ConfigurablesSectionProps) {
    const [showAll, setShowAll] = useState(false);
    if (fields.length === 0) {
        return null;
    }
    const open = fields.filter(needsInput);
    const folded = fields.filter((field) => !needsInput(field));
    const prefilled = folded.filter((field) => field.localValue && !field.saved).length;
    const render = (list: AgentManagerConfigField[]) => groupFields(list).map(([group, groupList]) => (
        <Group key={group}>
            {group && <GroupTitle>{group}</GroupTitle>}
            {groupList.map((field) => (
                <ConfigFieldInput
                    key={field.id}
                    field={field}
                    value={values[field.id] ?? ""}
                    secret={secrets[field.id] ?? field.secret}
                    onValue={(value) => onValue(field.id, value)}
                    onSecret={(secret) => onSecret(field.id, secret)}
                />
            ))}
        </Group>
    ));
    return (
        <Section>
            <GroupTitle>Configurables</GroupTitle>
            {open.length > 0 && <Muted>Values left empty can be set later in Agent Manager.</Muted>}
            {render(open)}
            {folded.length > 0 && (showAll ? render(folded) : (
                <ShowMore type="button" onClick={() => setShowAll(true)}>
                    Show {folded.length} More{prefilled > 0 ? ` · ${prefilled} Filled From Config.toml` : ""}
                </ShowMore>
            ))}
        </Section>
    );
}

