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
 * WSO2 Cloud sign-in state, as VS Code's authentication API exposes it.
 *
 * WSO2 Integrator hosts the login and registers the `wso2-cloud` provider; this
 * extension never holds tokens of its own. The access token is read through
 * `vscode.authentication`, not through the extension's exported API, so the
 * token reaches this extension the same way it reaches any other.
 */

import * as vscode from "vscode";
import { type CloudEnvName, PLATFORM_EXTENSION_API_VERSION, type IWso2PlatformExtensionAPI } from "@wso2/wso2-cloud-client";
import { WSO2_CLOUD_AUTH_PROVIDER_ID, readCloudEnvName, scopeForEnv } from "@wso2/wso2-cloud-client/vscode";

/** `publisher.name` of the WSO2 Integrator extension, which hosts the cloud features. */
export const WI_EXTENSION_ID = "wso2.wso2-integrator";

export { WSO2_CLOUD_AUTH_PROVIDER_ID };

export function getCloudEnvName(): CloudEnvName {
    return readCloudEnvName();
}

/** The scope a session is requested with: tokens are per environment. */
export function cloudSessionScopes(env: CloudEnvName = getCloudEnvName()): string[] {
    return [scopeForEnv(env)];
}

/** What WSO2 Integrator exports, and whether this extension can speak to it. */
export interface PlatformAPIVerdict {
    installed: boolean;
    /** The `apiVersion` it exports, when it exports one. */
    version?: number;
    /** The API when it is installed and speaks the contract this extension was written against. */
    api?: IWso2PlatformExtensionAPI;
}

/** Activates WSO2 Integrator when it is installed and reads its exported cloud API. */
export async function inspectPlatformAPI(): Promise<PlatformAPIVerdict> {
    const platformExt = vscode.extensions.getExtension(WI_EXTENSION_ID);
    if (!platformExt) {
        return { installed: false };
    }
    if (!platformExt.isActive) {
        await platformExt.activate();
    }
    const api = platformExt.exports?.cloudAPIs as unknown;
    const version = (api as { apiVersion?: unknown } | undefined)?.apiVersion;
    return {
        installed: true,
        version: typeof version === "number" ? version : undefined,
        api: isCompatiblePlatformAPI(api) ? api : undefined,
    };
}

/**
 * The WSO2 Integrator cloud API when it is installed and speaks the contract
 * this extension was written against; otherwise undefined.
 */
export async function getCompatiblePlatformAPI(): Promise<IWso2PlatformExtensionAPI | undefined> {
    return (await inspectPlatformAPI()).api;
}

export function isCompatiblePlatformAPI(api: unknown): api is IWso2PlatformExtensionAPI {
    return !!api && typeof api === "object" && (api as { apiVersion?: unknown }).apiVersion === PLATFORM_EXTENSION_API_VERSION;
}

/**
 * A usable WSO2 Cloud access token, or undefined when the person is not signed
 * in. With `createIfNone` VS Code prompts to sign in through WSO2 Integrator.
 * WSO2 Integrator is activated first, since it registers the provider.
 */
export async function getCloudAccessToken(options: { createIfNone?: boolean; silent?: boolean } = {}): Promise<string | undefined> {
    try {
        if (!(await getCompatiblePlatformAPI())) {
            return undefined;
        }
        const session = await vscode.authentication.getSession(WSO2_CLOUD_AUTH_PROVIDER_ID, cloudSessionScopes(), {
            createIfNone: options.createIfNone ?? false,
            silent: options.createIfNone ? undefined : (options.silent ?? true),
        });
        return session?.accessToken;
    } catch (error) {
        console.error("Failed to read the WSO2 Cloud session:", error);
        return undefined;
    }
}
