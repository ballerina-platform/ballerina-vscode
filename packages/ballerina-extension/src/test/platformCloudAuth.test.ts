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

// L1: the WSO2 Cloud session helpers decide, from what WSO2 Integrator exports,
// whether cloud features are on, and connect to its API with the session's key.
// No editor, no network.

import { PLATFORM_EXTENSION_API_VERSION, UnauthenticatedError } from "@wso2/wso2-cloud-client";
import { authentication, extensions } from "./__mocks__/vscode";
import {
    cloudAccessOf,
    cloudSessionScopes,
    connectPlatformAPI,
    describeCloudAccess,
    getCloudApiKey,
    isApiKeyInvalid,
    isCompatiblePlatformGate,
    readCloudAccess,
    requestCloudAccess,
    withPlatformAPI,
    WI_EXTENSION_ID,
    WSO2_CLOUD_AUTH_PROVIDER_ID,
} from "../utils/cloud-auth";

/** A gate whose current key is `currentKey`, as WSO2 Integrator would export it. */
function fakeGate(currentKey: { value: string }, loggedIn = true) {
    const connects: string[] = [];
    const gate = {
        apiVersion: PLATFORM_EXTENSION_API_VERSION,
        isActive: () => true,
        isLoggedIn: () => loggedIn,
        getPlatformConfig: () => ({}),
        connect: (key: string) => {
            if (key !== currentKey.value) {
                throw new UnauthenticatedError("api_key_invalid");
            }
            connects.push(key);
            const api = {
                key,
                ping: async () => {
                    if (key !== currentKey.value) {
                        throw new UnauthenticatedError("api_key_invalid");
                    }
                    return key;
                },
            };
            return api;
        },
    };
    return { gate, connects };
}

const originalGetExtension = extensions.getExtension;
const originalGetSession = authentication.getSession;

function install(gate: unknown) {
    (extensions as { getExtension: unknown }).getExtension = (id: string) =>
        id === WI_EXTENSION_ID ? { id, isActive: true, exports: { cloudAPIs: gate } } : undefined;
}

/** Sessions hand out whatever `key.value` is; `granted` says whether this extension may read them. */
function sessions(key: { value: string }, granted = true) {
    const calls: unknown[] = [];
    authentication.getSession = async (_provider, _scopes, options) => {
        calls.push(options);
        return granted ? { accessToken: key.value } : undefined;
    };
    return calls;
}

describe("cloud-auth", () => {
    afterEach(() => {
        (extensions as { getExtension: unknown }).getExtension = originalGetExtension;
        authentication.getSession = originalGetSession;
        // Drops the cached connection between cases, as a session change does.
        authentication.fireSessionsChange(WSO2_CLOUD_AUTH_PROVIDER_ID);
    });

    it("accepts only the platform contract version this extension speaks", () => {
        const { gate } = fakeGate({ value: "k" });
        expect(isCompatiblePlatformGate(gate)).toBe(true);
        expect(isCompatiblePlatformGate({ ...gate, apiVersion: 2 })).toBe(false);
        expect(isCompatiblePlatformGate({ apiVersion: PLATFORM_EXTENSION_API_VERSION, isActive: () => true })).toBe(false);
        expect(isCompatiblePlatformGate(undefined)).toBe(false);
        expect(isCompatiblePlatformGate(null)).toBe(false);
    });

    it("requests a session per environment from the wso2-cloud provider", () => {
        expect(WSO2_CLOUD_AUTH_PROVIDER_ID).toBe("wso2-cloud");
        expect(cloudSessionScopes("dev")).toEqual(["env:dev"]);
        expect(cloudSessionScopes("prod")).toEqual(["env:prod"]);
    });

    it("has no key or API without WSO2 Integrator", async () => {
        sessions({ value: "k" });
        expect(await getCloudApiKey()).toBeUndefined();
        expect(await connectPlatformAPI()).toBeUndefined();
    });

    it("asks for access only when asked to and someone is signed in", async () => {
        const key = { value: "k" };
        install(fakeGate(key).gate);
        const calls = sessions(key, false);
        expect(await getCloudApiKey({ askAccess: true })).toBeUndefined();
        expect(calls).toEqual([{ silent: true }, { createIfNone: true }]);

        const quiet = sessions(key, false);
        expect(await getCloudApiKey()).toBeUndefined();
        expect(quiet).toEqual([{ silent: undefined }]);

        install(fakeGate(key, false).gate);
        const signedOut = sessions(key, false);
        expect(await getCloudApiKey({ askAccess: true })).toBeUndefined();
        expect(signedOut).toEqual([{ silent: true }]);
    });

    it("keeps the connected API while the key stays, and connects anew when it changes", async () => {
        const key = { value: "k1" };
        const { gate, connects } = fakeGate(key);
        install(gate);
        sessions(key);

        const first = await connectPlatformAPI();
        expect(await connectPlatformAPI()).toBe(first);
        expect(connects).toEqual(["k1"]);

        key.value = "k2";
        const second = await connectPlatformAPI();
        expect(second).not.toBe(first);
        expect(connects).toEqual(["k1", "k2"]);
    });

    it("drops the connected API when the wso2-cloud sessions change", async () => {
        const key = { value: "k" };
        const { gate, connects } = fakeGate(key);
        install(gate);
        sessions(key);

        await connectPlatformAPI();
        authentication.fireSessionsChange("github");
        await connectPlatformAPI();
        expect(connects).toEqual(["k"]);

        authentication.fireSessionsChange(WSO2_CLOUD_AUTH_PROVIDER_ID);
        await connectPlatformAPI();
        expect(connects).toEqual(["k", "k"]);
    });

    it("has no API when this extension may not use the session", async () => {
        const key = { value: "k" };
        install(fakeGate(key).gate);
        sessions(key, false);
        expect(await connectPlatformAPI()).toBeUndefined();
    });

    it("makes a call once more on a fresh connection when its key was replaced", async () => {
        const key = { value: "old" };
        const { gate } = fakeGate(key);
        install(gate);
        // The session still hands out the old key on the first read, as it can just after a change.
        const reads = ["old", "old", "new"];
        authentication.getSession = async () => ({ accessToken: reads.shift() ?? "new" });
        await connectPlatformAPI();
        key.value = "new";

        const result = await withPlatformAPI(async (api) => (api as unknown as { ping(): Promise<string> }).ping());
        expect(result).toBe("new");
    });

    it("tells a replaced key from other failures", () => {
        expect(isApiKeyInvalid(new UnauthenticatedError("api_key_invalid"))).toBe(true);
        expect(isApiKeyInvalid(new UnauthenticatedError("no_session"))).toBe(false);
        expect(isApiKeyInvalid(new Error("api_key_invalid"))).toBe(false);
    });

    it("tells signed out and not allowed apart from connected", async () => {
        const key = { value: "k" };
        const signedIn = fakeGate(key).gate as never;
        expect(cloudAccessOf(signedIn, true)).toBe("connected");
        expect(cloudAccessOf(signedIn, false)).toBe("no-access");
        expect(cloudAccessOf(fakeGate(key, false).gate as never, false)).toBe("signed-out");

        expect(await readCloudAccess()).toBeUndefined();
        install(signedIn);
        sessions(key, false);
        expect(await readCloudAccess()).toBe("no-access");
        const calls = sessions(key);
        expect(await readCloudAccess()).toBe("connected");
        // Read without asking: no badge, no prompt.
        expect(calls).toEqual([{ silent: true }]);
    });

    it("remembers a declined request until access is allowed", async () => {
        const key = { value: "k" };
        const gate = fakeGate(key).gate;
        install(gate);
        authentication.getSession = async () => {
            throw new Error("User did not consent to login.");
        };
        expect(await requestCloudAccess()).toBe(false);
        expect(cloudAccessOf(gate as never, false)).toBe("declined");
        expect(await readCloudAccess()).toBe("declined");
        expect(describeCloudAccess("declined")).toMatch(/not allowed/);

        const calls = sessions(key);
        expect(await requestCloudAccess()).toBe(true);
        expect(calls).toEqual([{ createIfNone: true }]);
        expect(cloudAccessOf(gate as never, false)).toBe("no-access");
    });

    it("does not take a cancelled sign-in for declined access", async () => {
        const key = { value: "k" };
        const gate = fakeGate(key, false).gate;
        install(gate);
        authentication.getSession = async () => {
            throw new Error("cancelled");
        };
        expect(await requestCloudAccess()).toBe(false);
        expect(cloudAccessOf(gate as never, false)).toBe("signed-out");
        expect(cloudAccessOf(fakeGate(key).gate as never, false)).toBe("no-access");
    });

    it("has nothing to ask for without WSO2 Integrator", async () => {
        const calls = sessions({ value: "k" });
        expect(await requestCloudAccess()).toBe(false);
        expect(calls).toEqual([]);
        expect(describeCloudAccess(undefined)).toMatch(/WSO2 Integrator/);
    });

    it("reads access again when the key is replaced while it connects", async () => {
        const key = { value: "new" };
        install(fakeGate(key).gate);
        const reads = ["old", "new"];
        authentication.getSession = async () => ({ accessToken: reads.shift() ?? "new" });
        expect(await readCloudAccess()).toBe("connected");
        expect(describeCloudAccess("connected")).not.toBe("");
    });
});
