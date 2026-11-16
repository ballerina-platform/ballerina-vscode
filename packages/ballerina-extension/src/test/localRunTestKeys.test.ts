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
    testKeySecret,
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
    async delete(key: string) {
        this.values.delete(key);
    }
}

/** Lets pending promise callbacks run, including the background keeping of a key. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const service = { project: "finance", component: "billing", endpoint: "api" };
const id = testKeyId("acme", service, "development");
const iso = (ms: number) => new Date(ms).toISOString();

describe("TestKeys", () => {
    let now: number;
    let vault: MemoryVault;
    let keys: TestKeys;
    let mints: number;
    const create = async () => ({ apiKey: `k${++mints}`, expiresAt: iso(now + TEST_KEY_LIFETIME_MS) });

    beforeEach(() => {
        now = Date.parse("2026-11-16T10:00:00Z");
        mints = 0;
        vault = new MemoryVault();
        keys = new TestKeys(() => vault, () => undefined, () => now);
    });

    it("names a key by organization, service and environment", () => {
        expect(id).toBe("acme/finance/billing/api/development");
    });

    it("keeps a minted key for later runs, in another window too", async () => {
        const key = await keys.use(id, create);
        await settle();

        expect(key).toEqual({ apiKey: "k1", mintedAt: now, expiresAt: now + TEST_KEY_LIFETIME_MS, created: true });
        const otherWindow = new TestKeys(() => vault, () => undefined, () => now + 30 * 60_000);
        expect(await otherWindow.use(id, create)).toMatchObject({ apiKey: "k1", created: false });
        expect(mints).toBe(1);
    });

    it("reuses the kept key, and mints only when none can be used", async () => {
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

    it("stops reusing a key once less than a quarter of its lifetime is left", async () => {
        await keys.use(id, create);
        await settle();
        const otherWindow = new TestKeys(() => vault, () => undefined, () => now);

        expect(TEST_KEY_MIN_REMAINING_MS).toBe(15 * 60_000);
        now += TEST_KEY_LIFETIME_MS - TEST_KEY_MIN_REMAINING_MS - 1;
        expect(await keys.stored(id)).toBeDefined();
        expect(await otherWindow.stored(id)).toBeDefined();
        now += 1;
        expect(await keys.stored(id)).toBeUndefined();
        expect(await new TestKeys(() => vault, () => undefined, () => now).stored(id)).toBeUndefined();
    });

    it("shares one lookup between runs that ask at once, while the kept key is still being read", async () => {
        let releaseRead!: () => void;
        const slowVault: TestKeyVault = {
            get: (key) => new Promise((resolve) => (releaseRead = () => resolve(vault.values.get(key)))),
            store: (key, value) => vault.store(key, value),
            delete: (key) => vault.delete(key),
        };
        const slow = new TestKeys(() => slowVault, () => undefined, () => now);

        const first = slow.use(id, create);
        const second = slow.use(id, create);
        releaseRead();

        expect(await first).toEqual(await second);
        expect(mints).toBe(1);
    });

    it("looks again after a failed mint", async () => {
        await expect(keys.use(id, async () => Promise.reject(new Error("refused")))).rejects.toThrow("refused");

        await expect(keys.use(id, create)).resolves.toMatchObject({ apiKey: "k1", created: true });
    });

    it("keeps each key in its own secret, so windows keeping different keys don't overwrite each other", async () => {
        const other = testKeyId("acme", service, "production");
        const otherWindow = new TestKeys(() => vault, () => undefined, () => now);

        await Promise.all([keys.use(id, create), otherWindow.use(other, create)]);
        await settle();

        expect(await new TestKeys(() => vault, () => undefined, () => now).stored(id)).toBeDefined();
        expect(await new TestKeys(() => vault, () => undefined, () => now).stored(other)).toBeDefined();
    });

    it("drops expired keys when it keeps a new one", async () => {
        const other = testKeyId("acme", service, "production");
        await keys.use(other, create);
        await settle();
        now += TEST_KEY_LIFETIME_MS + 1;

        await keys.use(id, create);
        await settle();

        expect(vault.values.has(testKeySecret(other))).toBe(false);
        expect(Object.keys(JSON.parse(vault.values.get(TEST_KEY_SECRET)!))).toEqual([id]);
    });

    it("drops an expired key when it reads it", async () => {
        await keys.use(id, create);
        await settle();
        now += TEST_KEY_LIFETIME_MS + 1;

        expect(await new TestKeys(() => vault, () => undefined, () => now).stored(id)).toBeUndefined();
        await settle();

        expect(vault.values.has(testKeySecret(id))).toBe(false);
        expect(vault.values.has(TEST_KEY_SECRET)).toBe(false);
    });

    it("drops every kept key when the person signs out", async () => {
        const other = testKeyId("acme", service, "production");
        await Promise.all([keys.use(id, create), keys.use(other, create)]);
        await settle();

        await keys.clear();

        expect(vault.values.size).toBe(0);
        expect(await keys.use(id, create)).toMatchObject({ apiKey: "k3", created: true });
    });

    it("doesn't keep a key minted before the person signed out", async () => {
        let release!: () => void;
        const run = keys.use(id, () => new Promise((resolve) => (release = () => resolve({ apiKey: "early", expiresAt: iso(now + TEST_KEY_LIFETIME_MS) }))));
        await settle();
        await keys.clear();
        release();

        expect(await run).toMatchObject({ apiKey: "early" });
        await settle();
        expect(vault.values.size).toBe(0);
        expect(await keys.stored(id)).toBeUndefined();
    });

    it("gives a key the test key lifetime when the platform's expiry is already past here", async () => {
        const key = await keys.use(id, async () => ({ apiKey: "k1", expiresAt: iso(now - 1000) }));

        expect(key.expiresAt).toBe(now + TEST_KEY_LIFETIME_MS);
    });

    it("reads an unreadable secret as no key", async () => {
        vault.values.set(testKeySecret(id), "not json");

        expect(await keys.stored(id)).toBeUndefined();
    });

    it("keeps a key it can't store for the session, without holding up the run", async () => {
        let mintsHere = 0;
        const failing: TestKeyVault = { get: async () => undefined, store: () => new Promise((_, reject) => setTimeout(() => reject(new Error("locked")), 10)), delete: async () => undefined };
        const logged: string[] = [];
        const unstored = new TestKeys(() => failing, (message) => logged.push(message), () => now);
        const mint = async () => ({ apiKey: `k${++mintsHere}`, expiresAt: iso(now + TEST_KEY_LIFETIME_MS) });

        await expect(unstored.use(id, mint)).resolves.toMatchObject({ apiKey: "k1", created: true });
        expect(logged).toEqual([]);
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(logged[0]).toContain("locked");

        await expect(unstored.use(id, mint)).resolves.toMatchObject({ apiKey: "k1", created: false });
        expect(mintsHere).toBe(1);
    });
});

describe("testKeyRunMessage", () => {
    const at = (ms: number) => `t${ms}`;

    it("says nothing when the run used no key", () => {
        expect(testKeyRunMessage([], [], [], at)).toBeUndefined();
    });

    it("names created and reused keys, and when the first expires", () => {
        expect(testKeyRunMessage(["billing (api)"], ["orders (api)"], [2, 1], at)).toBe(
            "Created a WSO2 Cloud test key for billing (api); reused the one for orders (api) from an earlier run. " +
                "The first expires at t1; run again after that for new ones.",
        );
    });

    it("says when a key was reused from an earlier run", () => {
        expect(testKeyRunMessage([], ["orders (api)"], [1], at)).toBe(
            "Reused the WSO2 Cloud test key for orders (api) from an earlier run. It expires at t1; run again after that for a new one.",
        );
    });
});
