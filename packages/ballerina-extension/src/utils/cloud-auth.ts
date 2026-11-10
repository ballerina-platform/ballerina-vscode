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

/**
 * WSO2 Cloud, as WSO2 Integrator offers it to this extension.
 *
 * WSO2 Integrator hosts the login and exports `cloudAPIs`, a gate: whether it
 * is active and signed in, and the deployment in use, are open to any caller;
 * the rest answers only to the key a `wso2-cloud` session carries. Exports
 * carry no caller identity, so the key is read through `vscode.authentication`,
 * where VS Code checks this extension's access, and handed to `gate.connect`.
 * The key is not the WSO2 Cloud token, which never leaves WSO2 Integrator. It
 * is replaced on sign-in, sign-out, an organization switch and a window start,
 * and VS Code reports each as a change of the provider's sessions; an API
 * connected with an old key refuses every call (`api_key_invalid`).
 */

import * as vscode from "vscode";
import {
    type CloudEnvName,
    type IWso2PlatformExtensionAPI,
    type IWso2PlatformExtensionGate,
    PLATFORM_EXTENSION_API_VERSION,
    isCloudError,
} from "@wso2/wso2-cloud-client";
import type { CloudAccess } from "@wso2/ballerina-core/lib/rpc-types/platform-ext/interfaces";
import { WSO2_CLOUD_AUTH_PROVIDER_ID, readCloudEnvName, scopeForEnv } from "@wso2/wso2-cloud-client/vscode";

/** `publisher.name` of the WSO2 Integrator extension, which hosts the cloud features. */
export const WI_EXTENSION_ID = "wso2.wso2-integrator";

export { WSO2_CLOUD_AUTH_PROVIDER_ID };

let cloudEnvName: CloudEnvName | undefined;

/** The WSO2 Cloud deployment in use, read once: WSO2 Integrator applies a change only after a reload, and so does this. */
export function getCloudEnvName(): CloudEnvName {
    cloudEnvName ??= readCloudEnvName();
    return cloudEnvName;
}

/** The scope a session is requested with: sessions are per environment. */
export function cloudSessionScopes(env: CloudEnvName = getCloudEnvName()): string[] {
    return [scopeForEnv(env)];
}

/** What WSO2 Integrator exports, and whether this extension can speak to it. */
export interface PlatformAPIVerdict {
    installed: boolean;
    /** The `apiVersion` it exports, when it exports one. */
    version?: number;
    /** The gate when it is installed and speaks the contract this extension was written against. */
    gate?: IWso2PlatformExtensionGate;
}

/** Activates WSO2 Integrator when it is installed and reads the gate it exports. */
export async function inspectPlatformAPI(): Promise<PlatformAPIVerdict> {
    const platformExt = vscode.extensions.getExtension(WI_EXTENSION_ID);
    if (!platformExt) {
        return { installed: false };
    }
    if (!platformExt.isActive) {
        await platformExt.activate();
    }
    const gate = platformExt.exports?.cloudAPIs as unknown;
    const version = (gate as { apiVersion?: unknown } | undefined)?.apiVersion;
    return {
        installed: true,
        version: typeof version === "number" ? version : undefined,
        gate: isCompatiblePlatformGate(gate) ? gate : undefined,
    };
}

/** WSO2 Integrator's gate when it is installed and compatible; otherwise undefined. */
export async function getPlatformGate(): Promise<IWso2PlatformExtensionGate | undefined> {
    return (await inspectPlatformAPI()).gate;
}

export function isCompatiblePlatformGate(gate: unknown): gate is IWso2PlatformExtensionGate {
    return (
        !!gate &&
        typeof gate === "object" &&
        (gate as { apiVersion?: unknown }).apiVersion === PLATFORM_EXTENSION_API_VERSION &&
        typeof (gate as { connect?: unknown }).connect === "function"
    );
}

/**
 * How a session is asked for. VS Code hands another extension's session to
 * this one only once the person has allowed it (the WSO2 Integrator product
 * allows it up front; stock VS Code asks). `askAccess` is for something the
 * person just did: it asks for that permission there and then when WSO2
 * Integrator holds a session. Otherwise nothing is shown but a request in the
 * Accounts menu, and `silent` keeps even that away.
 */
export interface CloudSessionOptions {
    askAccess?: boolean;
    silent?: boolean;
}

/** The key the `wso2-cloud` session carries, or undefined when the person is not signed in or this extension may not use the session. */
export async function getCloudApiKey(options: CloudSessionOptions = {}): Promise<string | undefined> {
    const gate = await getPlatformGate().catch((error) => {
        console.error("Failed to activate WSO2 Integrator:", error);
        return undefined;
    });
    return gate ? readApiKey(gate, options) : undefined;
}

/**
 * Whether the person declined this extension's request for the session in
 * this window. VS Code keeps no record of a declined request, so it is kept
 * here, to tell the person why WSO2 Cloud is off rather than show them as
 * signed out.
 */
let accessDeclined = false;

async function readApiKey(gate: IWso2PlatformExtensionGate, options: CloudSessionOptions): Promise<string | undefined> {
    try {
        const scopes = cloudSessionScopes();
        const granted = await vscode.authentication.getSession(WSO2_CLOUD_AUTH_PROVIDER_ID, scopes, {
            silent: options.askAccess || options.silent ? true : undefined,
        });
        if (granted || !options.askAccess || !gate.isLoggedIn()) {
            if (granted) {
                accessDeclined = false;
            }
            return granted?.accessToken;
        }
        // Signed in through WSO2 Integrator, but this extension may not use the session yet.
        const allowed = await vscode.authentication.getSession(WSO2_CLOUD_AUTH_PROVIDER_ID, scopes, { createIfNone: true });
        accessDeclined = false;
        return allowed?.accessToken;
    } catch (error) {
        // Declining access lands here too.
        if (options.askAccess && gate.isLoggedIn()) {
            accessDeclined = true;
        }
        console.error("Failed to read the WSO2 Cloud session:", error);
        return undefined;
    }
}

/** Where this extension stands with the session WSO2 Integrator holds, given whether it has a connected API. */
export function cloudAccessOf(gate: IWso2PlatformExtensionGate, hasConnectedAPI: boolean): CloudAccess {
    if (hasConnectedAPI) {
        return "connected";
    }
    if (!gate.isLoggedIn()) {
        return "signed-out";
    }
    return accessDeclined ? "declined" : "no-access";
}

/**
 * Where this extension stands now, read without asking the person: undefined
 * when WSO2 Integrator offers no cloud API this extension can speak to.
 */
export async function readCloudAccess(): Promise<CloudAccess | undefined> {
    const gate = await getPlatformGate().catch(() => undefined);
    if (!gate) {
        return undefined;
    }
    // A key replaced between reading and connecting says nothing about access: read it once more.
    const connect = () => connectPlatformAPI({ silent: true });
    const api = await connect().catch((error) => {
        if (!isApiKeyInvalid(error)) {
            console.error("Failed to connect to WSO2 Integrator's cloud API:", error);
            return undefined;
        }
        return connect().catch(() => undefined);
    });
    return cloudAccessOf(gate, !!api);
}

/**
 * For the person choosing to use WSO2 Cloud here. When nobody is signed in,
 * this signs in through WSO2 Integrator, and VS Code lets this extension use
 * the new session; when someone is, VS Code asks the person to let this
 * extension use it. Answers whether this extension can use the session now.
 */
export async function requestCloudAccess(): Promise<boolean> {
    const gate = await getPlatformGate().catch(() => undefined);
    if (!gate) {
        return false;
    }
    try {
        const session = await vscode.authentication.getSession(WSO2_CLOUD_AUTH_PROVIDER_ID, cloudSessionScopes(), { createIfNone: true });
        accessDeclined = false;
        return !!session;
    } catch (error) {
        // A sign-in the person cancelled leaves them signed out; a request refused while signed in is a decline.
        if (gate.isLoggedIn()) {
            accessDeclined = true;
        }
        console.error("Failed to get access to the WSO2 Cloud session:", error);
        return false;
    }
}

/** What to tell the person when something needs WSO2 Cloud and this extension cannot use it. */
export function describeCloudAccess(access: CloudAccess | undefined): string {
    switch (access) {
        case "no-access":
            return "You are signed in to WSO2 Cloud in WSO2 Integrator, but Ballerina is not allowed to use that sign-in yet.";
        case "declined":
            return "Ballerina was not allowed to use your WSO2 Cloud sign-in. Try again and choose Allow when VS Code asks.";
        case "signed-out":
            return "Not signed in to WSO2 Cloud. Sign in to continue.";
        case "connected":
            // Access was there when this was read: the call failed for another reason.
            return "Could not reach WSO2 Cloud through WSO2 Integrator. Try again.";
        default:
            return "WSO2 Integrator's cloud features are not available. Install or update the WSO2 Integrator extension.";
    }
}

/** Calls `listener` when the `wso2-cloud` sessions change, which is when the key does. */
export function onDidChangeCloudSessions(listener: () => void): vscode.Disposable {
    return vscode.authentication.onDidChangeSessions((event) => {
        if (event.provider.id === WSO2_CLOUD_AUTH_PROVIDER_ID) {
            listener();
        }
    });
}

let connected: { key: string; api: IWso2PlatformExtensionAPI } | undefined;
let sessionWatch: vscode.Disposable | undefined;

/**
 * WSO2 Integrator's API for the current session, or undefined when it is not
 * installed or compatible, nobody is signed in, or this extension may not use
 * the session. The key is read on every call, so a replaced key connects
 * anew; the connected API is kept while the key stays.
 */
export async function connectPlatformAPI(options: CloudSessionOptions = {}): Promise<IWso2PlatformExtensionAPI | undefined> {
    const gate = await getPlatformGate();
    if (!gate) {
        return undefined;
    }
    // An API for a key that is gone refuses everything, so it is not kept past a session change.
    sessionWatch ??= onDidChangeCloudSessions(() => {
        connected = undefined;
    });
    const key = await readApiKey(gate, options);
    if (!key) {
        return undefined;
    }
    if (connected?.key !== key) {
        connected = { key, api: gate.connect(key) };
    }
    return connected.api;
}

/** Whether `error` is WSO2 Integrator refusing a key it has since replaced. */
export function isApiKeyInvalid(error: unknown): boolean {
    return isCloudError(error) && error.details?.reason === "api_key_invalid";
}

/**
 * Runs `call` with the connected API (undefined when there is none). A key
 * replaced between reading it and using it fails the call before it reaches
 * WSO2 Cloud, so the call is made once more on a fresh connection.
 */
export async function withPlatformAPI<T>(
    call: (api: IWso2PlatformExtensionAPI | undefined) => Promise<T>,
    options: CloudSessionOptions = {}
): Promise<T> {
    try {
        return await call(await connectPlatformAPI(options));
    } catch (error) {
        if (!isApiKeyInvalid(error)) {
            throw error;
        }
        connected = undefined;
        return call(await connectPlatformAPI(options));
    }
}
