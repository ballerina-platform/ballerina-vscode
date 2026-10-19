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

import React, { ReactNode, useState } from "react";
import styled from "@emotion/styled";
import { useQuery } from "@tanstack/react-query";
import { AgentManagerMcpPublishStatus, AgentManagerMcpSourceStepId, AgentManagerMcpUpstreamSecurity, SCOPE } from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { Button, Codicon, Dropdown, ProgressRing, TextField } from "@wso2/ui-toolkit";
import { VSCodeLink } from "@vscode/webview-ui-toolkit/react";
import { ErrorText, GroupTitle, Muted as Detail } from "./AgentManagerConfigFields";
import { PopupContent, PopupFooter } from "../../views/BI/Connection/styles";
import { Actions, DeployPopup, Dot, Row, Stack } from "./shared";

const DEFAULT_KEY_HEADER = "api-key";
const ENDPOINT_URL_HINT = "The URL on the WSO2 Cloud overview.";

const StepBody = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-left: 26px;
`;

const StepHeader = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 600;
`;

const StepBadge = styled.span<{ done: boolean }>`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    box-sizing: border-box;
    border-radius: 50%;
    flex-shrink: 0;
    font-size: 11px;
    line-height: 1;
    border: 1px solid ${({ done }: { done: boolean }) => (done ? "var(--vscode-testing-iconPassed)" : "var(--vscode-descriptionForeground)")};
    color: ${({ done }: { done: boolean }) => (done ? "var(--vscode-testing-iconPassed)" : "var(--vscode-descriptionForeground)")};
`;

// The toolkit gives every Codicon a fixed 14x16 box; filling the badge instead centres the glyph in it.
const CHECK_BOX = { display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%", cursor: "inherit" };
const CHECK_GLYPH = { fontSize: 12, lineHeight: 1 };

// Boxed like the Deploy panel's open sections, so each part of the form reads as one group.
const FormSection = styled.section`
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px 14px;
    border: 1px solid var(--vscode-welcomePage-tileBorder);
    border-radius: 6px;
    background: var(--vscode-welcomePage-tileBackground);
`;

// One size whichever security is picked; the content scrolls between the fixed header and footer.
const FORM_HEIGHT = "min(660px, 90vh)";
const FORM_WIDTH = 560;

const SECURITY_OPTIONS = [
    { value: "apiKey", content: "API Key" },
    { value: "none", content: "None" },
];

/** The WSO2 Cloud deployment state the Deploy panel already tracks for this project. */
export interface McpCloudState {
    available: boolean;
    isDeployed: boolean;
    isRefreshing: boolean;
    refresh: () => Promise<void>;
}

interface McpPublishSectionProps {
    projectPath: string;
    active: boolean;
    cloud: McpCloudState;
    goToDevant: () => void;
}

type Pending = "host" | "source" | "signIn";

export function useMcpPublishStatus(projectPath: string, enabled = true) {
    const { rpcClient } = useRpcContext();
    return useQuery({
        queryKey: ["agentManagerMcpPublish", projectPath],
        queryFn: () => rpcClient.getAgentManagerRpcClient().getAgentManagerMcpPublishStatus({ projectPath }),
        // A newly created proxy deploys to the gateway in the background.
        refetchInterval: ({ state: { data } }) => (data?.published && !data.published.deployed ? 5000 : 20000),
        enabled: enabled && !!projectPath,
    });
}

export function mcpPublishTag(status?: AgentManagerMcpPublishStatus): string | undefined {
    if (!status?.published) {
        return undefined;
    }
    return status.published.deployed ? "Published" : "Publishing";
}

export function McpPublishSection({ projectPath, active, cloud, goToDevant }: McpPublishSectionProps) {
    const { rpcClient } = useRpcContext();
    const { data: status, isLoading, isError, error: statusError, isFetching, refetch } = useMcpPublishStatus(projectPath, active);
    const [pending, setPending] = useState<Pending>();
    const [error, setError] = useState<string>();
    const [formOpen, setFormOpen] = useState(false);

    if (isLoading) {
        return <ProgressRing />;
    }
    if (isError || !status) {
        return (
            <Stack>
                <ErrorText>Couldn't check this MCP server's publishing status. {statusError instanceof Error ? statusError.message : ""}</ErrorText>
                <Actions>
                    <Button appearance="secondary" disabled={isFetching} onClick={() => refetch()}>Try Again</Button>
                </Actions>
            </Stack>
        );
    }

    const source = status.source;
    const hosted = cloud.isDeployed && status.endpointReady && !source;
    const published = status.published;

    const host = async () => {
        setPending("host");
        setError(undefined);
        try {
            // WSO2 Cloud must expose the listener root before MCP clients can reach the service at its own path.
            const prepared = await rpcClient.getAgentManagerRpcClient().prepareAgentManagerMcpEndpoint({ projectPath });
            if (!prepared.success) {
                setError(prepared.message);
                return;
            }
            // WSO2 Cloud builds from the remote repository, so anything not pushed yet is a Git step first.
            const { data: next } = await refetch();
            if (next?.source || cloud.isDeployed) {
                return;
            }
            await rpcClient.getBIDiagramRpcClient().deployProject({ integrationTypes: [SCOPE.MCP] });
            await cloud.refresh();
        } finally {
            setPending(undefined);
        }
    };

    const fixSource = async (step: AgentManagerMcpSourceStepId) => {
        setPending("source");
        setError(undefined);
        try {
            await rpcClient.getAgentManagerRpcClient().fixAgentManagerMcpSource({ projectPath, step });
        } finally {
            setPending(undefined);
            refetch();
        }
    };

    const signIn = async () => {
        setPending("signIn");
        try {
            await rpcClient.getAgentManagerRpcClient().runAgentManagerAction({ projectPath, action: "signIn" });
        } finally {
            setPending(undefined);
            refetch();
        }
    };

    const openInAgentManager = () => published && rpcClient.getCommonRpcClient().openExternalUrl({ url: published.consoleUrl });
    const closeForm = () => {
        setFormOpen(false);
        refetch();
    };

    return (
        <Stack>
            <p style={{ margin: 0 }}>
                Host this MCP server on WSO2 Cloud, then publish it to WSO2 Agent Manager so agents in your organization can use its tools.
            </p>

            <Step number={1} title="Host on WSO2 Cloud" done={hosted}>
                {!cloud.available ? (
                    <Detail>Enable WSO2 Cloud features in WSO2 Integrator to host this MCP server.</Detail>
                ) : hosted ? (
                    <Actions>
                        <Detail>Running on WSO2 Cloud.</Detail>
                        <VSCodeLink onClick={goToDevant}>Open in Console</VSCodeLink>
                    </Actions>
                ) : status.endpointReady && source ? (
                    <>
                        <Detail>{source.message}</Detail>
                        <Actions>
                            <Button appearance="primary" disabled={!!pending} onClick={() => fixSource(source.id)}>
                                {pending === "source" ? "Working…" : source.actionLabel}
                            </Button>
                        </Actions>
                    </>
                ) : (
                    <>
                        <Detail>
                            {cloud.isDeployed
                                ? "Update the server on WSO2 Cloud with your latest changes."
                                : "Build and run the MCP server on WSO2 Cloud, a fully managed platform."}
                        </Detail>
                        <Actions>
                            <Button appearance="primary" disabled={!!pending || cloud.isRefreshing} onClick={host}>
                                {pending === "host" ? "Working…" : cloud.isDeployed ? "Redeploy to WSO2 Cloud" : "Deploy to WSO2 Cloud"}
                            </Button>
                        </Actions>
                    </>
                )}
            </Step>

            <Step number={2} title="Publish to Agent Manager" done={!!published?.deployed}>
                {!status.signedIn ? (
                    <Actions>
                        <Button appearance={hosted ? "primary" : "secondary"} disabled={!!pending} onClick={signIn}>
                            {pending === "signIn" ? "Connecting…" : "Connect to Agent Manager"}
                        </Button>
                    </Actions>
                ) : published ? (
                    <>
                        <Row>
                            <Dot color={published.deployed ? "var(--vscode-testing-iconPassed)" : "var(--vscode-editorWarning-foreground)"} />
                            <span>{published.name}</span>
                            <Detail>
                                {published.deployed ? "Deployed" : "Deploying"}
                                {published.toolCount !== undefined && ` · ${published.toolCount} tool${published.toolCount === 1 ? "" : "s"}`}
                            </Detail>
                        </Row>
                        <Detail style={{ overflowWrap: "anywhere" }}>Forwards to {published.url}</Detail>
                        <Actions>
                            <Button appearance="secondary" disabled={!!pending} onClick={openInAgentManager}>Open in Agent Manager</Button>
                            <Button appearance="icon" tooltip="Change URL or API Key" disabled={!!pending} onClick={() => setFormOpen(true)}>
                                <Codicon name="edit" />
                            </Button>
                        </Actions>
                    </>
                ) : (
                    <>
                        <Detail>
                            {hosted
                                ? `Make this MCP server's tools available to agents in ${status.org}.`
                                : "Available once the MCP server is running on WSO2 Cloud."}
                        </Detail>
                        <Actions>
                            {/* Agent Manager probes the server while publishing, so it has to be running first. */}
                            <Button
                                appearance="primary"
                                disabled={!!pending || !hosted}
                                tooltip={hosted ? "" : "Host the MCP server on WSO2 Cloud first."}
                                onClick={() => setFormOpen(true)}
                            >
                                Publish to Agent Manager
                            </Button>
                        </Actions>
                    </>
                )}
                {(error || status.error) && <ErrorText>{error ?? status.error}</ErrorText>}
                {status.signedIn && status.instanceUrl && <Detail>Signed in to {new URL(status.instanceUrl).host}</Detail>}
            </Step>
            {formOpen && status.signedIn && (
                <DeployPopup
                    title={published ? "Update MCP Server in Agent Manager" : "Publish to Agent Manager"}
                    subtitle={status.org}
                    onClose={closeForm}
                    height={FORM_HEIGHT}
                    maxWidth={FORM_WIDTH}
                >
                    {(close) => <McpPublishForm projectPath={projectPath} status={status} goToDevant={goToDevant} onDone={close} onCancel={close} />}
                </DeployPopup>
            )}
        </Stack>
    );
}

interface McpPublishFormProps {
    projectPath: string;
    status: AgentManagerMcpPublishStatus;
    goToDevant: () => void;
    onDone: () => void;
    onCancel: () => void;
}

function McpPublishForm({ projectPath, status, goToDevant, onDone, onCancel }: McpPublishFormProps) {
    const { rpcClient } = useRpcContext();
    const published = status.published;
    const [url, setUrl] = useState(published?.url ?? "");
    const [security, setSecurity] = useState<AgentManagerMcpUpstreamSecurity>(published?.upstreamSecurity ?? "apiKey");
    const [header, setHeader] = useState(published?.upstreamHeader ?? DEFAULT_KEY_HEADER);
    const [apiKey, setApiKey] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string>();
    const keyStored = published?.upstreamSecurity === "apiKey";
    const usesKey = security === "apiKey";
    const ready = url.trim() !== "" && (!usesKey || (header.trim() !== "" && (apiKey.trim() !== "" || keyStored)));

    const submit = async () => {
        setSubmitting(true);
        setError(undefined);
        const result = await rpcClient.getAgentManagerRpcClient()
            .publishAgentManagerMcpProxy({
                projectPath, url, security, header: usesKey ? header : undefined, apiKey: usesKey && apiKey ? apiKey : undefined,
            })
            .catch((err) => ({ success: false, message: String(err) }));
        setSubmitting(false);
        if (result.success) {
            onDone();
        } else {
            setError(result.message);
        }
    };

    return (
        <>
            <PopupContent>
                <Stack>
                    <FormSection>
                        <GroupTitle>Connection</GroupTitle>
                        <TextField
                            id="am-mcp-url"
                            label="Endpoint URL"
                            placeholder="https://…choreoapis.dev/…/v1.0"
                            value={url}
                            onTextChange={setUrl}
                            description={ENDPOINT_URL_HINT}
                            required
                        />
                    </FormSection>
                    <FormSection>
                        <GroupTitle>Security</GroupTitle>
                        <Detail>How Agent Manager authenticates to this MCP server on WSO2 Cloud.</Detail>
                        {/* Agent Manager keeps a stored key through every update, so there's nothing to choose once one exists. */}
                        {!keyStored && (
                            <Dropdown
                                id="am-mcp-security"
                                label="Security Type"
                                containerSx={{ width: "100%" }}
                                value={security}
                                onValueChange={(value: string) => setSecurity(value === "none" ? "none" : "apiKey")}
                                items={SECURITY_OPTIONS}
                            />
                        )}
                        {usesKey ? (
                            <>
                                <Detail>
                                    In WSO2 Cloud, open Configure Security, enable API Key, and generate a key in the Developer Portal.{" "}
                                    <VSCodeLink onClick={goToDevant}>Open in Console</VSCodeLink>
                                </Detail>
                                <TextField id="am-mcp-key-header" label="API Key Header" value={header} onTextChange={setHeader} required />
                                <TextField
                                    id="am-mcp-key"
                                    label="API Key"
                                    type="password"
                                    value={apiKey}
                                    onTextChange={setApiKey}
                                    description={keyStored ? "Leave empty to keep the key Agent Manager already has." : "Stored only in Agent Manager."}
                                    required={!keyStored}
                                />
                            </>
                        ) : (
                            <Detail>Agent Manager calls the server without a credential. Use this only when the WSO2 Cloud endpoint has no security.</Detail>
                        )}
                    </FormSection>
                    {error && <ErrorText>{error}</ErrorText>}
                </Stack>
            </PopupContent>
            <PopupFooter>
                <Button appearance="secondary" disabled={submitting} onClick={onCancel}>Cancel</Button>
                <Button appearance="primary" disabled={submitting || !ready} onClick={submit}>
                    {submitting ? "Publishing…" : published ? "Update" : "Publish"}
                </Button>
            </PopupFooter>
        </>
    );
}

function Step({ number, title, done, children }: { number: number; title: string; done: boolean; children: ReactNode }) {
    return (
        <div>
            <StepHeader>
                <StepBadge done={done}>{done ? <Codicon name="check" sx={CHECK_BOX} iconSx={CHECK_GLYPH} /> : number}</StepBadge>
                <span>{title}</span>
            </StepHeader>
            <StepBody style={{ marginTop: 6 }}>{children}</StepBody>
        </div>
    );
}
