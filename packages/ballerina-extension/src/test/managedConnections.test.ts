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

// L1: managed connections go to the managed-token-service through WSO2 Integrator's
// API; only GETs are retried, and failures carry the service's HTTP status.

import { CloudError, ServerError } from "@wso2/wso2-cloud-client";
import { exchangeManagedConnection, getManagedLibraries } from "../rpc-managers/platform-ext/managed-connections";

const request = jest.fn();
let connected = true;

jest.mock("../utils/cloud-auth", () => ({
    getPlatformGate: async () => ({}),
    withPlatformAPI: async (call: (api: unknown) => Promise<unknown>) => call(connected ? { request } : undefined),
}));

describe("managed connections", () => {
    beforeEach(() => {
        jest.useFakeTimers();
        request.mockReset();
        connected = true;
        jest.spyOn(console, "warn").mockImplementation(() => undefined);
        jest.spyOn(console, "error").mockImplementation(() => undefined);
    });
    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    it("asks WSO2 Integrator for the service by name, with the path below its prefix", async () => {
        request.mockResolvedValueOnce({ libraries: [] });
        await expect(getManagedLibraries()).resolves.toEqual({ libraries: [] });
        expect(request).toHaveBeenCalledWith({
            service: "managed-tokens",
            method: "GET",
            path: "/managed-libraries",
            body: undefined,
            timeoutMs: 15_000,
        });
    });

    it("retries a GET on a gateway failure", async () => {
        request.mockRejectedValueOnce(new ServerError("bad gateway", { status: 502 })).mockResolvedValueOnce({ libraries: [] });
        const result = getManagedLibraries();
        await jest.runAllTimersAsync();
        await expect(result).resolves.toEqual({ libraries: [] });
        expect(request).toHaveBeenCalledTimes(2);
    });

    it("does not retry a POST, and reports the status", async () => {
        request.mockRejectedValueOnce(new ServerError("bad gateway", { status: 502 }));
        await expect(exchangeManagedConnection("c/1")).rejects.toMatchObject({
            message: "Managed connection request failed with status 502.",
            status: 502,
        });
        expect(request).toHaveBeenCalledTimes(1);
        expect(request.mock.calls[0][0]).toMatchObject({ method: "POST", path: "/managed-connections/c%2F1/exchange", body: { critical: false } });
    });

    it("keeps the message of a failure with no HTTP status", async () => {
        request.mockRejectedValueOnce(new CloudError("timeout", "The request timed out."));
        await expect(exchangeManagedConnection("c")).rejects.toMatchObject({ message: "The request timed out.", status: undefined });
    });

    it("says to sign in when there is no session", async () => {
        connected = false;
        await expect(getManagedLibraries()).rejects.toThrow("Not signed in to WSO2 Cloud. Please sign in to use managed connections.");
        expect(request).not.toHaveBeenCalled();
    });
});
