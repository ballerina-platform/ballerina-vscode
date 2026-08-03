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
// Every other Choreo control-plane call goes through the choreo-cli binary
// (IWso2PlatformExtensionAPI → choreo-rpc → CLI → HTTPS), which owns endpoint tables, the token
// store and retry. This service is too new to be wrapped there, so we call it directly with the
// token the CLI hands out (`auth/getStsToken` — the same one it puts in its own Authorization
// header). Once the service is wrapped, these three functions become platformExt delegations and
// the host resolution below goes away with them.

import axios, { AxiosRequestConfig } from "axios";
import { getPlatformExtensionAPI } from "../../utils/ai/auth";

// Production endpoints only. Each region is a separate hostname — no gateway routes by identity —
// so the host is resolved per request.
const CHOREO_PROD_API_HOST: Record<"US" | "EU", string> = {
    US: "https://apis.choreo.dev",
    EU: "https://apis.eu.choreo.dev",
};

// Non-production hosts are not listed here; set this to target one.
const API_HOST_OVERRIDE_VAR = "VSCODE_CHOREO_API_HOST";

// Paths from the service's openapi.yaml. If it ends up fronted by the Choreo gateway under a
// `/<service>/<version>` prefix like its neighbours, prepend that here.
const MANAGED_SERVICE_BASE_PATH = "/api/v1";
const MANAGED_LIBRARIES_PATH = "/managed-libraries";
const MANAGED_CONNECTIONS_PATH = "/managed-connections";

async function resolveHost(): Promise<string | undefined> {
    const override = process.env[API_HOST_OVERRIDE_VAR]?.trim();
    if (override) {
        console.log(`[managed-connections] using ${API_HOST_OVERRIDE_VAR}='${override}'.`);
        return override;
    }

    const api = await getPlatformExtensionAPI();
    if (!api) {
        console.warn("[managed-connections] WSO2 platform extension unavailable — cannot resolve a service host.");
        return undefined;
    }

    const region = api.getAuthState()?.region === "EU" ? "EU" : "US";
    const env = api.getWebviewStateStore()?.choreoEnv ?? "prod";
    if (env !== "prod") {
        console.warn(`[managed-connections] no host is listed for env='${env}' — set ${API_HOST_OVERRIDE_VAR} ` +
            `to target it. Falling back to ${region} production.`);
    }
    return CHOREO_PROD_API_HOST[region];
}

const BASE_HEADERS = {
    "Content-Type": "application/json",
    Accept: "application/json, text/plain, */*",
    "User-Agent": "WSO2 Integrator VSCode",
};

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
 * One authenticated call. The token is read per attempt, never held by the caller: the OAuth
 * flow spans a browser round-trip that can outlive a token, and getStsToken() refreshes on read.
 *
 * Retries are GET-only — a POST that timed out may already have created a connection upstream.
 */
async function request<T>(
    method: "GET" | "POST",
    path: string,
    timeoutMs: number,
    body?: unknown
): Promise<T> {
    const host = await resolveHost();
    if (!host) {
        throw new ManagedConnectionError("Managed connections are not available in this environment.");
    }

    const url = `${host}${MANAGED_SERVICE_BASE_PATH}${path}`;
    const isIdempotent = method === "GET";
    let lastError: unknown;

    for (let attempt = 1; attempt <= (isIdempotent ? MAX_ATTEMPTS : 1); attempt++) {
        const token = await getStsTokenOrThrow();
        const config: AxiosRequestConfig = {
            headers: { ...BASE_HEADERS, Authorization: `Bearer ${token}` },
            timeout: timeoutMs,
        };

        try {
            const response = method === "GET"
                ? await axios.get<T>(url, config)
                : await axios.post<T>(url, body ?? {}, config);
            return response.data;
        } catch (err) {
            lastError = err;
            const status = (err as any)?.response?.status as number | undefined;

            if (isIdempotent && attempt < MAX_ATTEMPTS && status && RETRYABLE_STATUS.has(status)) {
                console.warn(`[managed-connections] ${method} ${url} → ${status}; retrying (${attempt}/${MAX_ATTEMPTS - 1}).`);
                await delay(RETRY_DELAY_MS);
                continue;
            }
            break;
        }
    }

    throw toManagedConnectionError(lastError, method, url);
}

async function getStsTokenOrThrow(): Promise<string> {
    const api = await getPlatformExtensionAPI();
    if (!api) {
        throw new ManagedConnectionError("WSO2 platform extension is not installed.");
    }
    const token = await api.getStsToken();
    if (!token) {
        throw new ManagedConnectionError("Not signed in to Devant. Please sign in to use managed connections.");
    }
    return token;
}

// Logs the status and body, which the bare axios message drops and which identify the failure.
function toManagedConnectionError(err: unknown, method: string, url: string): ManagedConnectionError {
    if (err instanceof ManagedConnectionError) {
        return err;
    }
    const ax = err as any;
    if (ax?.isAxiosError) {
        const status = ax.response?.status as number | undefined;
        const bodyText = ax.response?.data ? safeStringify(ax.response.data) : "none";
        console.error(
            `[managed-connections] ${method} ${url} FAILED — message='${ax.message}', code='${ax.code}', ` +
            `httpStatus=${status ?? "none"}, responseBody=${bodyText}`
        );
        return new ManagedConnectionError(
            status ? `Managed connection request failed with status ${status}.` : ax.message,
            status
        );
    }
    console.error(`[managed-connections] ${method} ${url} failed with a non-HTTP error: ${err}`);
    return new ManagedConnectionError((err as Error)?.message ?? "Managed connection request failed.");
}

function safeStringify(value: unknown): string {
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
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
