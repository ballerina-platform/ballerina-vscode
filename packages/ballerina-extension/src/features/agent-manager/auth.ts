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

import * as vscode from "vscode";
import { amctlEnvelope, amctlJson } from "./amctl";

const DEFAULT_INSTANCE_URL = "http://api.amp.localhost:8080";
const SESSION_CACHE_MS = 30_000;

/** The active amctl instance and org; amctl keeps the tokens, so the IDE and the terminal share one sign-in. */
export interface AgentManagerSession {
    name: string;
    instanceUrl: string;
    org: string;
}

let cached: { at: number; session: Promise<AgentManagerSession | undefined> } | undefined;

export function getSession(): Promise<AgentManagerSession | undefined> {
    if (!cached || Date.now() - cached.at > SESSION_CACHE_MS) {
        cached = { at: Date.now(), session: readSession() };
    }
    return cached.session;
}

export function clearSessionCache(): void {
    cached = undefined;
}

async function readSession(): Promise<AgentManagerSession | undefined> {
    try {
        const { instance, data } = await amctlEnvelope<{ url: string; org?: string }>(["context", "show"]);
        return instance && data?.org ? { name: instance, instanceUrl: data.url.replace(/\/+$/, ""), org: data.org } : undefined;
    } catch {
        return undefined;
    }
}

export async function signIn(): Promise<AgentManagerSession | undefined> {
    const previous = await getSession();
    const instanceUrl = await vscode.window.showInputBox({
        title: "Connect to Agent Manager",
        prompt: "Agent Manager API URL",
        value: previous?.instanceUrl ?? DEFAULT_INSTANCE_URL,
        ignoreFocusOut: true,
    });
    if (!instanceUrl) {
        return undefined;
    }
    await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: "Signing in to Agent Manager in your browser...", cancellable: true },
        (_progress, cancel) => amctlEnvelope(["login", "--url", instanceUrl.replace(/\/+$/, "")], { cancel })
    );
    clearSessionCache();
    if (!(await getSession())) {
        await pickOrg();
        clearSessionCache();
    }
    return getSession();
}

async function pickOrg(): Promise<void> {
    const { organizations = [] } = await amctlJson<{ organizations?: { name: string }[] }>(["context", "org", "list"]);
    if (organizations.length === 0) {
        throw new Error("Your account has no Agent Manager organization. Open the Agent Manager console once to create one.");
    }
    const org = await vscode.window.showQuickPick(organizations.map((item) => item.name),
        { title: "Select an Agent Manager organization", ignoreFocusOut: true });
    if (org) {
        await amctlJson(["context", "org", "use", org]);
    }
}

/** Removes the instance from amctl, which signs the terminal out too. */
export async function signOut(): Promise<void> {
    const session = await getSession();
    if (session) {
        await amctlJson(["context", "instance", "remove", session.name, "--yes"]);
    }
    clearSessionCache();
}
