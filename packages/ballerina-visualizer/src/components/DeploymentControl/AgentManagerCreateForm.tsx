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
    AgentManagerConfigField, AgentManagerConfigInput, AgentManagerCreateForm as CreateFormData, AgentManagerRepoDetails, AgentManagerSourceCheck,
} from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { Button, Codicon, Dropdown, ProgressRing, TextField } from "@wso2/ui-toolkit";
import { PopupContent, PopupFooter } from "../../views/BI/Connection/styles";
import {
    ConfigFieldGroups, ErrorText, GroupTitle, initialConfig, Label, Loading, Muted, Pill, Section, Summary, Value,
} from "./AgentManagerConfigFields";

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

// Every value that will be uploaded stays on screen, so local Config.toml values are never sent unseen.
function needsInput(field: AgentManagerConfigField): boolean {
    return !field.saved && !field.unsupported && (field.required || !!field.localValue);
}

// When GitHub couldn't say whether the repository is public, the user can say so.
function accessOptions(repo: AgentManagerRepoDetails | undefined, gitSecrets: string[]) {
    return [
        ...(repo?.isPrivate === undefined ? [{ value: "", content: "None (Public Repository)" }] : []),
        ...gitSecrets.map((name) => ({ value: name, content: name })),
        { value: NEW_TOKEN, content: "Add Personal Token…" },
    ];
}

// Agent Manager names must start with a letter; the rest of the name is converted to fit.
const hasLetter = (name: string) => /[a-z]/i.test(name);

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
    const [config, setConfig] = useState<AgentManagerConfigInput>({ values: {}, secrets: {} });
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | undefined>();

    useEffect(() => {
        rpc.getAgentManagerCreateForm({ projectPath }).then((loaded) => {
            setForm(loaded);
            setAgentName(loaded.agentName);
            setProject(loaded.projects[0]?.name ?? NEW_PROJECT);
            setRemote(loaded.defaultRemote ?? "");
            setAppPath(loaded.appPath);
            setConfig(initialConfig(loaded.fields));
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
            const matching = details.secretPrefix && form.gitSecrets.find((name) => name.startsWith(details.secretPrefix));
            setGitSecret(details.isPrivate === false ? "" : matching || NEW_TOKEN);
        });
    }, [remote, form]);

    useEffect(() => {
        setCheck(undefined);
        if (!remote || !branch) {
            return;
        }
        const timer = setTimeout(() => rpc.checkAgentManagerSource({ projectPath, remote, branch, appPath }).then(setCheck), 400);
        return () => clearTimeout(timer);
    }, [remote, branch, appPath]);

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
            config,
        }).catch((err) => ({ success: false, message: String(err) }));
        setSubmitting(false);
        response.success ? onDone() : setError(response.message);
    };

    if (!form) {
        return <PopupContent><Loading><ProgressRing /></Loading></PopupContent>;
    }
    const needsAccess = !!repo && repo.isPrivate !== false;
    const needsToken = needsAccess && gitSecret === NEW_TOKEN;
    const ready = !!check?.ok && hasLetter(agentName) && (project !== NEW_PROJECT || hasLetter(newProject)) && (!needsToken || !!newToken.trim());

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
                        disabled={!repo}
                        onValueChange={setBranch}
                        items={repo ? repo.branches.map((name) => ({ value: name, content: name })) : [{ value: "", content: "Loading…" }]}
                    />
                    <TextField id="am-app-path" label="Directory" value={appPath} onTextChange={setAppPath} />
                </Row>
                {repo?.error && <ErrorText>{repo.error}</ErrorText>}
                <SourceCheck check={check} />
                {needsAccess && (
                    <Dropdown
                        id="am-git-secret"
                        label="Repository Access"
                        containerSx={{ width: "100%" }}
                        value={gitSecret}
                        onValueChange={setGitSecret}
                        items={accessOptions(repo, form.gitSecrets)}
                    />
                )}
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
                <IncludedSection form={form} />
                <ConfigurablesSection fields={form.fields} config={config} onChange={setConfig} />
                {error && <ErrorText>{error}</ErrorText>}
            </PopupContent>
            <PopupFooter>
                <Button appearance="secondary" disabled={submitting} onClick={onCancel}>Cancel</Button>
                <Button appearance="primary" disabled={submitting || !ready} onClick={submit}>{submitting ? "Creating…" : "Create and Deploy"}</Button>
            </PopupFooter>
        </>
    );
}

function SourceCheck({ check }: { check?: AgentManagerSourceCheck }) {
    return check ? (
        <Check ok={check.ok}>
            <Codicon name={check.ok ? "pass" : "warning"} sx={{ fontSize: 14 }} />
            <span>{check.message}</span>
        </Check>
    ) : null;
}

function IncludedSection({ form }: { form: CreateFormData }) {
    return (
        <Section>
            <GroupTitle>Included Automatically</GroupTitle>
            <Summary>
                <Label>Auto-Instrumentation</Label>
                <Value>{form.tracing ? "On" : "Off"}</Value>
                {([["LLM Service Providers", form.llmProviders], ["MCP Servers", form.mcpServers]] as const).map(([label, names]) => names.length > 0 && (
                    <React.Fragment key={label}>
                        <Label>{label}</Label>
                        <Value>{names.map((name) => <Pill key={name}>{name}</Pill>)}</Value>
                    </React.Fragment>
                ))}
                <Label>Deploys To</Label>
                <Value>{form.environment}</Value>
            </Summary>
        </Section>
    );
}

function ConfigurablesSection({ fields, ...props }: React.ComponentProps<typeof ConfigFieldGroups>) {
    const [showAll, setShowAll] = useState(false);
    if (fields.length === 0) {
        return null;
    }
    const open = fields.filter(needsInput);
    const folded = fields.filter((field) => !needsInput(field));
    return (
        <Section>
            <GroupTitle>Configurables</GroupTitle>
            {open.length > 0 && <Muted>Values left empty can be set later in Agent Manager.</Muted>}
            <ConfigFieldGroups fields={open} {...props} />
            {folded.length > 0 && (showAll ? <ConfigFieldGroups fields={folded} {...props} /> : (
                <ShowMore type="button" onClick={() => setShowAll(true)}>
                    Show {folded.length} More
                </ShowMore>
            ))}
        </Section>
    );
}
