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
    leftSignIn,
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

/** A promise the test settles. */
function deferred<T = void>() {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)));
    return { promise, resolve, reject };
}

/** A vault whose next call of an operation waits until the test lets it go on. */
class HeldVault implements TestKeyVault {
    private readonly held = new Map<string, Promise<void>>();
    constructor(readonly inner: MemoryVault) {}
    hold(op: "get" | "store" | "delete", key: string): () => void {
        const gate = deferred();
        this.held.set(`${op} ${key}`, gate.promise);
        return () => gate.resolve();
    }
    private async pass(op: string, key: string) {
        const gate = this.held.get(`${op} ${key}`);
        this.held.delete(`${op} ${key}`);
        await gate;
    }
    async get(key: string) {
        await this.pass("get", key);
        return this.inner.get(key);
    }
    async store(key: string, value: string) {
        await this.pass("store", key);
        return this.inner.store(key, value);
    }
    async delete(key: string) {
        await this.pass("delete", key);
        return this.inner.delete(key);
    }
}

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

    it("reuses a key only while more than a quarter of its lifetime is left", () => {
        expect(TEST_KEY_MIN_REMAINING_MS).toBe(15 * 60_000);
    });

    it.each([
        { left: "more than the margin", remaining: TEST_KEY_MIN_REMAINING_MS + 1, reused: true },
        { left: "the margin exactly", remaining: TEST_KEY_MIN_REMAINING_MS, reused: false },
        { left: "less than the margin", remaining: TEST_KEY_MIN_REMAINING_MS - 1, reused: false },
    ])("with $left left, this window and another reuse it: $reused", async ({ remaining, reused }) => {
        const minted = now;
        await keys.use(id, create);
        await settle();

        now = minted + TEST_KEY_LIFETIME_MS - remaining;
        expect(!!(await keys.stored(id))).toBe(reused);
        expect(!!(await new TestKeys(() => vault, () => undefined, () => now).stored(id))).toBe(reused);
    });

    it("judges a kept key by the time its slow read finished", async () => {
        await keys.use(id, create);
        await settle();
        const held = new HeldVault(vault);
        const release = held.hold("get", testKeySecret(id));
        const otherWindow = new TestKeys(() => held, () => undefined, () => now);

        const read = otherWindow.stored(id);
        now += TEST_KEY_LIFETIME_MS;
        release();

        expect(await read).toBeUndefined();
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

    it("doesn't drop a listed key another window has renewed since", async () => {
        const other = testKeyId("acme", service, "production");
        await keys.use(other, create);
        await settle();
        now += TEST_KEY_LIFETIME_MS + 1;
        // Another window renewed it, and hasn't listed the new expiry yet.
        vault.values.set(testKeySecret(other), JSON.stringify({ apiKey: "renewed", mintedAt: now, expiresAt: now + TEST_KEY_LIFETIME_MS }));

        await keys.use(id, create);
        await settle();

        expect(await new TestKeys(() => vault, () => undefined, () => now).stored(other)).toMatchObject({ apiKey: "renewed" });
        expect(JSON.parse(vault.values.get(TEST_KEY_SECRET)!)[other]).toBe(now + TEST_KEY_LIFETIME_MS);
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

    it("keeps the key that replaces an expired one while the expired one is still being dropped", async () => {
        await keys.use(id, create);
        await settle();
        now += TEST_KEY_LIFETIME_MS + 1;
        const held = new HeldVault(vault);
        const release = held.hold("delete", testKeySecret(id));
        const otherWindow = new TestKeys(() => held, () => undefined, () => now);

        expect(await otherWindow.use(id, create)).toMatchObject({ apiKey: "k2", created: true });
        release();
        await settle();

        expect(await new TestKeys(() => vault, () => undefined, () => now).stored(id)).toMatchObject({ apiKey: "k2" });
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

    it("drops a key whose storing was still under way when the person signed out", async () => {
        const held = new HeldVault(vault);
        const release = held.hold("store", testKeySecret(id));
        const pending = new TestKeys(() => held, () => undefined, () => now);

        await pending.use(id, create);
        const cleared = pending.clear();
        release();
        await cleared;

        expect(vault.values.size).toBe(0);
    });

    it("drops the keys this window used on sign-out, though another window's change lost them from the listing", async () => {
        await keys.use(id, create);
        await settle();
        vault.values.delete(TEST_KEY_SECRET);

        await keys.clear();

        expect(vault.values.size).toBe(0);
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
        const write = deferred();
        const failing: TestKeyVault = { get: async () => undefined, store: () => write.promise, delete: async () => undefined };
        const logged = deferred<string>();
        const unstored = new TestKeys(() => failing, (message) => logged.resolve(message), () => now);
        const mint = async () => ({ apiKey: `k${++mintsHere}`, expiresAt: iso(now + TEST_KEY_LIFETIME_MS) });

        await expect(unstored.use(id, mint)).resolves.toMatchObject({ apiKey: "k1", created: true });
        write.reject(new Error("locked"));
        expect(await logged.promise).toContain("locked");

        await expect(unstored.use(id, mint)).resolves.toMatchObject({ apiKey: "k1", created: false });
        expect(mintsHere).toBe(1);
    });
});

describe("leftSignIn", () => {
    const as = (userId: string, handle: string) => ({ user: { userId }, org: { handle } });

    it.each([
        { change: "signing in", before: null, after: as("u1", "acme"), left: false },
        { change: "staying signed in", before: as("u1", "acme"), after: as("u1", "acme"), left: false },
        { change: "signing out", before: as("u1", "acme"), after: null, left: true },
        { change: "switching organization", before: as("u1", "acme"), after: as("u1", "globex"), left: true },
        { change: "signing in as someone else", before: as("u1", "acme"), after: as("u2", "acme"), left: true },
        { change: "staying signed out", before: null, after: null, left: false },
    ])("$change drops the kept keys: $left", ({ before, after, left }) => {
        expect(leftSignIn(before, after)).toBe(left);
    });
});

describe("testKeyRunMessage", () => {
    const at = (ms: number) => `t${ms}`;

    it("says nothing when the run used no key", () => {
        expect(testKeyRunMessage([], [], [], at)).toBeUndefined();
    });

    it("names created and reused keys, and when the first expires", () => {
        expect(testKeyRunMessage(["billing (api)"], ["orders (api)"], [2, 1], at)).toBe(
            "Created a Choreo Cloud test key for billing (api); reused the one for orders (api) from an earlier run. " +
                "The first expires at t1; run again after that for new ones.",
        );
    });

    it("says when a key was reused from an earlier run", () => {
        expect(testKeyRunMessage([], ["orders (api)"], [1], at)).toBe(
            "Reused the Choreo Cloud test key for orders (api) from an earlier run. It expires at t1; run again after that for a new one.",
        );
    });
});
