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

// The only place that talks to the managed-token-service.
//
// The service is not part of the WSO2 Cloud API (ipaas-service). WSO2 Integrator
// calls it on this extension's behalf with its WSO2 Cloud token, and owns where
// it is (the base URL and the service's path prefix); without WSO2 Integrator
// managed connections are reported as unavailable rather than guessed at.

import { isCloudError } from "@wso2/wso2-cloud-client";
import { getPlatformGate, withPlatformAPI } from "../../utils/cloud-auth";

// The service's openapi.yaml paths, below the prefix WSO2 Integrator adds.
const MANAGED_LIBRARIES_PATH = "/managed-libraries";
const MANAGED_CONNECTIONS_PATH = "/managed-connections";

const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 3_000;

// The catalog lookup gates showing the config form, so it fails fast; the connection calls are
// user-driven and allowed longer.
const CATALOG_TIMEOUT_MS = 15_000;
const CONNECTION_TIMEOUT_MS = 60_000;

class ManagedConnectionError extends Error {
    constructor(message: string, readonly status?: number) {
        super(message);
        this.name = "ManagedConnectionError";
    }
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * One authenticated call. The session is read per attempt, never held by the caller: the OAuth
 * flow spans a browser round-trip that can outlive it.
 *
 * Retries are GET-only — a POST that timed out may already have created a connection upstream.
 */
async function request<T>(
    method: "GET" | "POST",
    path: string,
    timeoutMs: number,
    body?: unknown
): Promise<T> {
    const isIdempotent = method === "GET";
    let lastError: unknown;

    for (let attempt = 1; attempt <= (isIdempotent ? MAX_ATTEMPTS : 1); attempt++) {
        try {
            // Managed connections are set up at the person's request: ask for access to the session when needed.
            return await withPlatformAPI(async (api) => {
                if (!api) {
                    throw await notConnectedError();
                }
                return api.request<T>({
                    service: "managed-tokens",
                    method,
                    path,
                    body: isIdempotent ? undefined : body ?? {},
                    timeoutMs,
                });
            }, { askAccess: true });
        } catch (err) {
            lastError = err;
            const status = isCloudError(err) ? err.details.status : undefined;

            if (isIdempotent && attempt < MAX_ATTEMPTS && status && RETRYABLE_STATUS.has(status)) {
                console.warn(`[managed-connections] ${method} ${path} → ${status}; retrying (${attempt}/${MAX_ATTEMPTS - 1}).`);
                await delay(RETRY_DELAY_MS);
                continue;
            }
            break;
        }
    }

    throw toManagedConnectionError(lastError, method, path);
}

async function notConnectedError(): Promise<ManagedConnectionError> {
    if (!(await getPlatformGate())) {
        console.warn("[managed-connections] WSO2 Integrator's cloud API is unavailable — cannot reach the service.");
        return new ManagedConnectionError("Managed connections are not available on WSO2 Cloud yet.");
    }
    return new ManagedConnectionError("Not signed in to WSO2 Cloud. Please sign in to use managed connections.");
}

// Logs the status and the service's answer, which a bare message drops and which identify the failure.
function toManagedConnectionError(err: unknown, method: string, path: string): ManagedConnectionError {
    if (err instanceof ManagedConnectionError) {
        return err;
    }
    if (isCloudError(err)) {
        const status = err.details.status;
        console.error(
            `[managed-connections] ${method} ${path} FAILED — message='${err.message}', code='${err.code}', ` +
            `httpStatus=${status ?? "none"}, apiError='${err.details.apiError ?? "none"}', apiMessage='${err.details.apiMessage ?? "none"}'`
        );
        return new ManagedConnectionError(
            status ? `Managed connection request failed with status ${status}.` : err.message,
            status
        );
    }
    console.error(`[managed-connections] ${method} ${path} failed with a non-HTTP error: ${err}`);
    return new ManagedConnectionError((err as Error)?.message ?? "Managed connection request failed.");
}

export type ManagedGrant = "oauth2RefreshToken" | "staticToken";

export interface ManagedAuthOption {
    grant: ManagedGrant;
    provider: string;
    beta?: boolean;
}

export interface ManagedLibraryEntry {
    library: string;
    authOptions: ManagedAuthOption[];
}

export interface ManagedLibrariesResponse {
    libraries: ManagedLibraryEntry[];
}

export interface InitiateManagedConnectionResponse {
    // Which URL was returned: "authorize" → vendor consent, "select" → the org already has a
    // connection for this provider and may reuse it.
    next: "authorize" | "select";
    authorizeUrl?: string;
    selectionUrl?: string;
}

export interface ManagedConnectionCredentials {
    kind: string;
    clientId?: string;
    clientSecret?: string;
    refreshToken?: string;
    tokenEndpoint?: string;
    accessToken?: string;
}

export async function getManagedLibraries(): Promise<ManagedLibrariesResponse> {
    return request<ManagedLibrariesResponse>("GET", MANAGED_LIBRARIES_PATH, CATALOG_TIMEOUT_MS);
}

/**
 * `skipSelection` is deliberately not sent — it forces a fresh connect, so an org that already
 * has a connection for this provider would authorize a duplicate instead of reusing it.
 * `critical: false` is required: exchange is non-critical-only by design.
 */
export async function initiateManagedConnection(params: {
    provider: string;
    redirectUri: string;
}): Promise<InitiateManagedConnectionResponse> {
    return request<InitiateManagedConnectionResponse>(
        "POST",
        `${MANAGED_CONNECTIONS_PATH}/initiate`,
        CONNECTION_TIMEOUT_MS,
        { provider: params.provider, critical: false, redirectUri: params.redirectUri }
    );
}

export async function exchangeManagedConnection(
    connectionId: string
): Promise<ManagedConnectionCredentials> {
    return request<ManagedConnectionCredentials>(
        "POST",
        `${MANAGED_CONNECTIONS_PATH}/${encodeURIComponent(connectionId)}/exchange`,
        CONNECTION_TIMEOUT_MS,
        { critical: false }
    );
}
