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

// L1: the test keys local runs keep in the person's secret storage, and what a run is told about them.

import {
    TEST_KEY_LIFETIME_MS,
    TEST_KEY_MIN_REMAINING_MS,
    TEST_KEY_SECRET,
    TestKeys,
    testKeyId,
    testKeyRunMessage,
    type TestKeyVault,
} from "../rpc-managers/platform-ext/test-keys";

class MemoryVault implements TestKeyVault {
    readonly values = new Map<string, string>();
    async get(key: string) {
        return this.values.get(key);
    }
    async store(key: string, value: string) {
        this.values.set(key, value);
    }
}

const service = { project: "finance", component: "billing", endpoint: "api" };
const id = testKeyId("acme", service, "development");
const iso = (ms: number) => new Date(ms).toISOString();

describe("TestKeys", () => {
    let now: number;
    let vault: MemoryVault;
    let keys: TestKeys;

    beforeEach(() => {
        now = Date.parse("2026-11-16T10:00:00Z");
        vault = new MemoryVault();
        keys = new TestKeys(() => vault, () => undefined, () => now);
    });

    it("names a key by organization, service and environment", () => {
        expect(id).toBe("acme/finance/billing/api/development");
    });

    it("keeps a minted key for later runs, in another window too", async () => {
        const key = await keys.mint(id, async () => ({ apiKey: "k1", expiresAt: iso(now + TEST_KEY_LIFETIME_MS) }));

        expect(key).toEqual({ apiKey: "k1", mintedAt: now, expiresAt: now + TEST_KEY_LIFETIME_MS });
        const otherWindow = new TestKeys(() => vault, () => undefined, () => now + 30 * 60_000);
        expect(await otherWindow.stored(id)).toEqual(key);
    });

    it("reuses the kept key, and mints only when none can be used", async () => {
        let mints = 0;
        const create = async () => ({ apiKey: `k${++mints}`, expiresAt: iso(now + TEST_KEY_LIFETIME_MS) });

        expect(await keys.use(id, create)).toMatchObject({ apiKey: "k1", created: true });
        now += 30 * 60_000;
        expect(await keys.use(id, create)).toMatchObject({ apiKey: "k1", created: false });
        now += 30 * 60_000;
        expect(await keys.use(id, create)).toMatchObject({ apiKey: "k2", created: true });
        expect(mints).toBe(2);
    });

    it("has no key to reuse when none was minted", async () => {
        expect(await keys.stored(id)).toBeUndefined();
    });

    it("stops reusing a key once a run could not use it", async () => {
        await keys.mint(id, async () => ({ apiKey: "k1", expiresAt: iso(now + TEST_KEY_LIFETIME_MS) }));

        now += TEST_KEY_LIFETIME_MS - TEST_KEY_MIN_REMAINING_MS - 1;
        expect(await keys.stored(id)).toBeDefined();
        now += 1;
        expect(await keys.stored(id)).toBeUndefined();
    });

    it("shares one mint between runs that ask at once", async () => {
        let mints = 0;
        let release!: () => void;
        const create = () => {
            mints++;
            return new Promise<{ apiKey: string; expiresAt: string }>((resolve) => {
                release = () => resolve({ apiKey: "k1", expiresAt: iso(now + TEST_KEY_LIFETIME_MS) });
            });
        };

        const first = keys.mint(id, create);
        const second = keys.mint(id, create);
        release();

        expect(await first).toEqual(await second);
        expect(mints).toBe(1);
    });

    it("mints again after a failed mint", async () => {
        await expect(keys.mint(id, async () => Promise.reject(new Error("refused")))).rejects.toThrow("refused");

        await expect(keys.mint(id, async () => ({ apiKey: "k2", expiresAt: iso(now + TEST_KEY_LIFETIME_MS) }))).resolves.toMatchObject({ apiKey: "k2" });
    });

    it("drops expired keys when it stores a new one", async () => {
        const other = testKeyId("acme", service, "production");
        await keys.mint(other, async () => ({ apiKey: "old", expiresAt: iso(now + TEST_KEY_LIFETIME_MS) }));
        now += TEST_KEY_LIFETIME_MS + 1;

        await keys.mint(id, async () => ({ apiKey: "new", expiresAt: iso(now + TEST_KEY_LIFETIME_MS) }));

        expect(Object.keys(JSON.parse(vault.values.get(TEST_KEY_SECRET)!))).toEqual([id]);
    });

    it("gives a key the test key lifetime when the platform's expiry is already past here", async () => {
        const key = await keys.mint(id, async () => ({ apiKey: "k1", expiresAt: iso(now - 1000) }));

        expect(key.expiresAt).toBe(now + TEST_KEY_LIFETIME_MS);
    });

    it("reads unreadable storage as no keys", async () => {
        vault.values.set(TEST_KEY_SECRET, "not json");

        expect(await keys.stored(id)).toBeUndefined();
    });

    it("still serves the run when the key can't be stored", async () => {
        const failing: TestKeyVault = { get: async () => undefined, store: async () => Promise.reject(new Error("locked")) };
        const logged: string[] = [];
        const unstored = new TestKeys(() => failing, (message) => logged.push(message), () => now);

        await expect(unstored.mint(id, async () => ({ apiKey: "k1", expiresAt: iso(now + TEST_KEY_LIFETIME_MS) }))).resolves.toMatchObject({ apiKey: "k1" });
        expect(logged[0]).toContain("locked");
    });
});

describe("testKeyRunMessage", () => {
    it("says nothing when the run used no key", () => {
        expect(testKeyRunMessage([], [], "10:45")).toBeUndefined();
    });

    it("names created and reused keys, and when the first expires", () => {
        expect(testKeyRunMessage(["billing (api)"], ["orders (api)"], "10:45")).toBe(
            "Created a WSO2 Cloud test key for billing (api); reused the one for orders (api) from an earlier run. " +
                "The first expires at 10:45; run again after that for new ones.",
        );
    });

    it("says when a key was reused from an earlier run", () => {
        expect(testKeyRunMessage([], ["orders (api)"], "10:45")).toBe(
            "Reused the WSO2 Cloud test key for orders (api) from an earlier run. It expires at 10:45; run again after that for a new one.",
        );
    });
});
