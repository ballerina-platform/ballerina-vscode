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

import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { AgentManagerAction } from "@wso2/ballerina-core";
import { useRpcContext, type BallerinaRpcClient } from "@wso2/ballerina-rpc-client";
import { agentManagerBackend } from "./agentManagerBackend";
import { cloudBackend, openCloudConsole } from "./cloudBackend";

/** Where a deploy goes: Agent Manager on WSO2 Cloud, the Integration Platform on WSO2 Cloud, or a self-hosted Agent Manager. */
export type DeployTarget = "cloudAgent" | "cloudIntegration" | "selfHosted";

export interface PrepItem {
    id: string;
    label: string;
    detail: string;
    done: boolean;
    /** An item the user may switch off, such as tracing. */
    optional?: boolean;
}

export interface DeploySource {
    repository?: string;
    branches: string[];
    branch: string;
    commit?: string;
    prepItems: PrepItem[];
    changedFiles: number;
    unpushedCommits: number;
}

export interface DeployField {
    id: string;
    label: string;
    required: boolean;
    secret: boolean;
    value?: string;
}

export interface DeployRemote {
    name: string;
    repository: string;
    branches: string[];
    defaultBranch: string;
    /** Private repositories need a saved Git secret or a new token for the platform to clone them. */
    isPrivate: boolean;
}

export interface DeployForm {
    name: string;
    projects: { name: string; displayName: string }[];
    environment: string;
    remotes: DeployRemote[];
    /** Agent Manager only: where the agent sits in the repository. The Integration Platform derives it from the git root. */
    appPath?: string;
    /** Agent Manager only: saved Git secrets offered for private repositories. */
    gitSecrets?: string[];
    /** Agent Manager only: configurables become environment variables or a mounted file. */
    fields: DeployField[];
    /** Agent Manager only: what the platform sets up without asking. */
    included?: { label: string; value: string }[];
    /** WSO2 Cloud only: the integration types the package can be deployed as, and the one picked by default. */
    integrationTypes?: { value: string; label: string }[];
    integrationType?: string;
    /** WSO2 Cloud only: shown when an automation is deployed from a package that also has a listener. */
    typeWarning?: string;
    /** WSO2 Cloud only: the project the workspace is linked to, which deploys go to unless another is picked. */
    linkedProject?: string;
}

/** WSO2 Integrator's verdict on the repository, as its deploy form shows it above the Deploy button. */
export interface SourceReadiness {
    message?: string;
    action?: string;
    actionLabel?: string;
    tone: "error" | "warning" | "info" | "neutral";
    blocking: boolean;
}

export interface SourceCheck {
    remotes: DeployRemote[];
    remote: string;
    branch: string;
    readiness: SourceReadiness;
}

export interface DeployInput {
    name: string;
    project: string;
    newProject?: string;
    remote: string;
    branch: string;
    appPath?: string;
    gitSecret?: string;
    newToken?: string;
    integrationType?: string;
    values: Record<string, string>;
}

export interface DeployCandidate {
    project: string;
    agent: string;
    name: string;
    repository: string;
    branch: string;
}

export type RunStepId = "register" | "clone" | "build" | "deploy";
export type RunStepState = "done" | "running" | "pending";

export interface DeployRun {
    steps: { id: RunStepId; state: RunStepState; seconds?: number; percent?: number }[];
    live: boolean;
}

export interface DeployedApp {
    name: string;
    branch: string;
    commit: string;
    environment: string;
    endpointUrl: string;
    deployedAt: number;
}

export interface DeployStatus {
    signedIn: boolean;
    /** The account or instance the card says it is signed in to. */
    account?: string;
    run?: DeployRun;
    deployed?: DeployedApp;
    /** WSO2 Cloud only: the latest build when no environment runs it: built, its deploy failed, or the build failed. */
    built?: { branch: string; commit: string; state: "built" | "deployFailed" | "buildFailed" };
    /** WSO2 Cloud only: an integration builds this folder, so pushing a commit redeploys it. */
    linked?: boolean;
    /** WSO2 Cloud only: changes that are not committed or not pushed, so the platform doesn't build them yet. */
    pendingChanges?: boolean;
    /** Agent Manager only: agents in the org that build this repository, offered before registering a new one. */
    candidates?: DeployCandidate[];
}

export interface DeployBackend {
    getStatus(target: DeployTarget, projectPath: string): Promise<DeployStatus>;
    signIn(target: DeployTarget): Promise<void>;
    signOut(target: DeployTarget): Promise<void>;
    getSource(target: DeployTarget, projectPath: string): Promise<DeploySource>;
    prepare(target: DeployTarget, projectPath: string, skip: string[]): Promise<void>;
    commitAndPush(projectPath: string, message: string): Promise<void>;
    getForm(target: DeployTarget, projectPath: string): Promise<DeployForm>;
    deploy(target: DeployTarget, projectPath: string, input: DeployInput): Promise<void>;
    link(target: DeployTarget, projectPath: string, candidate: DeployCandidate): Promise<void>;
    /** WSO2 Cloud only: the repository checks for the picked remote and branch. */
    inspectSource?(projectPath: string, remote?: string, branch?: string): Promise<SourceCheck>;
    /** WSO2 Cloud only: the action a repository check offers, such as Source Control or Grant Access. */
    sourceAction?(projectPath: string, action: string): Promise<void>;
    /** WSO2 Cloud only: deploys the latest successful build. */
    deployBuild?(projectPath: string): Promise<void>;
    /** WSO2 Cloud only: reloads WSO2 Integrator's view of which integration this folder is linked to. */
    refresh?(): Promise<void>;
}

export const isPrepared = (source: DeploySource) => source.prepItems.every((item) => item.done || item.optional);
export const isPushed = (source: DeploySource) => !!source.repository && source.changedFiles === 0 && source.unpushedCommits === 0;
/** The platform builds what is on the remote, so local changes that are not committed do not block a deploy. */
export const isOnRemote = (source: DeploySource) => !!source.repository && source.unpushedCommits === 0;
export const isAgentTarget = (target: DeployTarget) => target !== "cloudIntegration";
export const isRunning = (status?: DeployStatus) => !!status?.run && !status.run.live;

export function useDeployBackend(target: DeployTarget): DeployBackend {
    const { rpcClient } = useRpcContext();
    return useMemo(() => (isAgentTarget(target) ? agentManagerBackend(rpcClient, target === "cloudAgent") : cloudBackend(rpcClient, target)), [rpcClient, target]);
}

const statusKey = (target: DeployTarget, projectPath: string) => ["deployStatus", target, projectPath];

export function useDeployStatus(target: DeployTarget, projectPath: string, active = true) {
    const backend = useDeployBackend(target);
    return useQuery({
        queryKey: statusKey(target, projectPath),
        queryFn: () => backend.getStatus(target, projectPath),
        refetchInterval: ({ state: { data } }) => (isRunning(data) ? 1000 : 15000),
        // A deploy started here keeps reporting while VS Code is in the background, so it is current on return.
        refetchIntervalInBackground: true,
        enabled: active && !!projectPath,
    });
}

export function useRefreshDeployStatus(target: DeployTarget, projectPath: string) {
    const client = useQueryClient();
    return () => client.invalidateQueries({ queryKey: statusKey(target, projectPath) });
}

const titleCase = (text: string) => text.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());

export function deployLabels(target: DeployTarget, noun: string) {
    const cloud = target !== "selfHosted";
    return {
        title: cloud ? "Deploy to WSO2 Cloud" : "Deploy to Agent Manager",
        builder: target === "cloudIntegration" ? "WSO2 Cloud" : "Agent Manager",
        deploy: cloud ? "Deploy to WSO2 Cloud" : "Register Agent",
        signIn: cloud ? "Sign In to WSO2 Cloud" : "Connect to Agent Manager",
        signInText: cloud
            ? `Build and run this ${noun} on WSO2 Cloud, a fully managed platform.`
            : "Deploy this agent on an Agent Manager instance you run. Sign in to it to continue.",
        account: (account?: string) => (cloud ? `Signed in to WSO2 Cloud as ${account}` : `Signed in to ${account}`),
        name: `${titleCase(noun)} Name`,
    };
}

export function runStepLabel(target: DeployTarget, step: RunStepId, environment: string): string {
    const labels: Record<RunStepId, string> = {
        register: target === "cloudIntegration" ? "Create Integration" : "Register Agent",
        clone: "Clone Source",
        build: "Build Image",
        deploy: `Deploy to ${environment}`,
    };
    return labels[step];
}

export type DeployLink = Extract<AgentManagerAction, "openTryIt" | "openInConsole" | "openBuildLogs">;

export function openDeployLink(rpcClient: BallerinaRpcClient, target: DeployTarget, projectPath: string, action: DeployLink): void {
    if (isAgentTarget(target)) {
        void rpcClient.getAgentManagerRpcClient().runAgentManagerAction({ projectPath, action });
    } else {
        void openCloudConsole(rpcClient, projectPath);
    }
}
