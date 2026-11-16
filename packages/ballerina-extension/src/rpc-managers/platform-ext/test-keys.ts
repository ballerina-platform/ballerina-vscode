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

/** A test key minted for local runs; times are epoch milliseconds. */
export interface TestKey {
    apiKey: string;
    mintedAt: number;
    expiresAt: number;
}

/** What a mint answers: the key, and when the platform says it expires. */
export interface MintedTestKey {
    apiKey: string;
    expiresAt?: string;
}

/** Where test keys are kept: the person's own secret storage, so they last across windows and restarts. */
export interface TestKeyVault {
    get(key: string): PromiseLike<string | undefined>;
    store(key: string, value: string): PromiseLike<void>;
}

/** The secret all of a person's test keys are kept in, by {@link testKeyId}. */
export const TEST_KEY_SECRET = "ballerina.wso2Cloud.localRunTestKeys";

/** A test key's lifetime, assumed when the platform's expiry can't be used. */
export const TEST_KEY_LIFETIME_MS = 60 * 60_000;

/**
 * A stored key is used while more than this is left of it. A run's key is in the program's environment, which
 * can't change once it runs, so a run started on a key about to expire would have its calls refused at once.
 */
export const TEST_KEY_MIN_REMAINING_MS = 5 * 60_000;

/** The test key of a service's endpoint in an environment, for one organization. */
export function testKeyId(orgHandle: string, service: { project: string; component: string; endpoint: string }, environment: string): string {
    return `${orgHandle}/${service.project}/${service.component}/${service.endpoint}/${environment}`;
}

/** Whether a run can still use the key. */
export function isUsableTestKey(key: TestKey, now: number): boolean {
    return key.expiresAt - now > TEST_KEY_MIN_REMAINING_MS;
}

function isTestKey(value: unknown): value is TestKey {
    const key = value as TestKey;
    return !!key && typeof key.apiKey === "string" && typeof key.mintedAt === "number" && typeof key.expiresAt === "number";
}

/**
 * The test keys local runs use. A key is kept in the person's secret storage until it is about to expire, so runs
 * in any window or after a restart reuse it rather than mint another, and runs that ask at once share one mint.
 */
export class TestKeys {
    private readonly minting = new Map<string, Promise<TestKey>>();
    /** Writes go one at a time, as each rewrites the whole secret. */
    private writes: Promise<void> = Promise.resolve();

    constructor(
        private readonly vault: () => TestKeyVault | undefined,
        private readonly log: (message: string) => void = () => undefined,
        private readonly now: () => number = Date.now,
    ) {}

    /** The key a run uses: one being minted, else the stored one while a run can use it, else a new one. */
    async use(id: string, create: () => PromiseLike<MintedTestKey>): Promise<TestKey & { created: boolean }> {
        const minting = this.minting.get(id);
        if (minting) {
            return { ...(await minting), created: true };
        }
        const kept = await this.stored(id);
        if (kept) {
            return { ...kept, created: false };
        }
        return { ...(await this.mint(id, create)), created: true };
    }

    /** The stored key, when a run can still use it. */
    async stored(id: string): Promise<TestKey | undefined> {
        try {
            const key = (await this.read())[id];
            return key && isUsableTestKey(key, this.now()) ? key : undefined;
        } catch (error) {
            this.log(`Could not read the WSO2 Cloud test keys kept from earlier runs: ${error}`);
            return undefined;
        }
    }

    /** Mints a key and stores it; a mint already under way for the same key is shared rather than repeated. */
    mint(id: string, create: () => PromiseLike<MintedTestKey>): Promise<TestKey> {
        const current = this.minting.get(id);
        if (current) {
            return current;
        }
        const minting = (async (): Promise<TestKey> => {
            const minted = await create();
            const mintedAt = this.now();
            const expiresAt = Date.parse(minted.expiresAt ?? "");
            // The key was just issued, so an expiry already past means this machine's clock is ahead of the
            // platform's, not that the key is spent; it is given the test key lifetime from now instead.
            const key: TestKey = { apiKey: minted.apiKey, mintedAt, expiresAt: Number.isFinite(expiresAt) && expiresAt > mintedAt ? expiresAt : mintedAt + TEST_KEY_LIFETIME_MS };
            await this.save(id, key);
            return key;
        })();
        this.minting.set(id, minting);
        void minting.then(
            () => this.minting.delete(id),
            () => this.minting.delete(id),
        );
        return minting;
    }

    private async read(): Promise<Record<string, TestKey>> {
        const vault = this.vault();
        const raw = vault ? await vault.get(TEST_KEY_SECRET) : undefined;
        if (!raw) {
            return {};
        }
        try {
            const parsed = JSON.parse(raw) as Record<string, unknown>;
            return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, TestKey] => isTestKey(entry[1])));
        } catch {
            return {};
        }
    }

    /** Stores the key, dropping the keys that have expired. A key that can't be stored still serves this run. */
    private save(id: string, key: TestKey): Promise<void> {
        const write = this.writes.then(async () => {
            const vault = this.vault();
            if (!vault) {
                return;
            }
            const now = this.now();
            const keys = Object.fromEntries(Object.entries(await this.read()).filter(([, stored]) => stored.expiresAt > now));
            keys[id] = key;
            await vault.store(TEST_KEY_SECRET, JSON.stringify(keys));
        });
        const settled = write.catch((error) => this.log(`Could not keep a WSO2 Cloud test key for later runs: ${error}`));
        this.writes = settled;
        return settled;
    }
}

/**
 * What a run is told about its test keys: which were created for it and which kept from an earlier run, and when
 * the first expires. `expiresAt` is that time as the person reads it.
 */
export function testKeyRunMessage(created: string[], reused: string[], expiresAt: string): string | undefined {
    const total = created.length + reused.length;
    if (total === 0) {
        return undefined;
    }
    const createdPart = created.length > 0 ? `Created ${created.length === 1 ? "a WSO2 Cloud test key" : "WSO2 Cloud test keys"} for ${created.join(", ")}` : undefined;
    const reusedWhat = createdPart ? (reused.length === 1 ? "the one" : "the ones") : reused.length === 1 ? "the WSO2 Cloud test key" : "the WSO2 Cloud test keys";
    const reusedPart = reused.length > 0 ? `${createdPart ? "reused" : "Reused"} ${reusedWhat} for ${reused.join(", ")} from an earlier run` : undefined;
    return [
        `${[createdPart, reusedPart].filter(Boolean).join("; ")}.`,
        total === 1 ? `It expires at ${expiresAt}; run again after that for a new one.` : `The first expires at ${expiresAt}; run again after that for new ones.`,
    ].join(" ");
}
