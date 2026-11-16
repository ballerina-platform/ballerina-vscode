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
    delete(key: string): PromiseLike<void>;
}

/** The secret that lists the kept test keys, by {@link testKeyId}, with when each expires. */
export const TEST_KEY_SECRET = "ballerina.wso2Cloud.localRunTestKeys";

/** The secret one test key is kept in; one secret a key, so windows keeping different keys don't overwrite each other. */
export const testKeySecret = (id: string) => `${TEST_KEY_SECRET}/${id}`;

/** A test key's lifetime, assumed when the platform's expiry can't be used. */
export const TEST_KEY_LIFETIME_MS = 60 * 60_000;

/**
 * A kept key is used while more than this is left of it: a quarter of its lifetime. A run's key is in the
 * program's environment, which can't change once it runs, so the margin is what a run, or a debug session, has
 * before its calls are refused.
 */
export const TEST_KEY_MIN_REMAINING_MS = TEST_KEY_LIFETIME_MS / 4;

/** The test key of a service's endpoint in an environment, for one organization. */
export function testKeyId(orgHandle: string, service: { project: string; component: string; endpoint: string }, environment: string): string {
    return `${orgHandle}/${service.project}/${service.component}/${service.endpoint}/${environment}`;
}

/** Whether a run can still use the key. */
export function isUsableTestKey(key: TestKey, now: number): boolean {
    return key.expiresAt - now > TEST_KEY_MIN_REMAINING_MS;
}

function parseJson(raw: string | undefined): unknown {
    try {
        return raw ? JSON.parse(raw) : undefined;
    } catch {
        return undefined;
    }
}

function asTestKey(value: unknown): TestKey | undefined {
    const key = value as TestKey;
    return !!key && typeof key.apiKey === "string" && typeof key.mintedAt === "number" && typeof key.expiresAt === "number" ? key : undefined;
}

/** The kept keys' ids, with when each expires. */
function asListing(value: unknown): Record<string, number> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return {};
    }
    return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, number] => typeof entry[1] === "number"));
}

/**
 * The test keys local runs use. A key is kept in this window for the session and in the person's secret storage
 * until it is about to expire, so runs in any window or after a restart reuse it rather than mint another, and runs
 * that ask at once share one lookup. Signing out drops them.
 */
export class TestKeys {
    /** The keys this window used; a key the secret storage can't keep still serves the session. */
    private readonly session = new Map<string, TestKey>();
    /** A lookup under way, kept or minted; runs that ask for the same key at once share it. */
    private readonly lookups = new Map<string, Promise<TestKey & { created: boolean }>>();
    /** Changes to the listing go one at a time, as each rewrites it. */
    private listing: Promise<void> = Promise.resolve();
    /** Moved on by {@link clear}, so a key minted before it isn't kept after it. */
    private generation = 0;

    constructor(
        private readonly vault: () => TestKeyVault | undefined,
        private readonly log: (message: string) => void = () => undefined,
        private readonly now: () => number = Date.now,
    ) {}

    /** The key a run uses: the kept one while a run can use it, else a new one, which is then kept. */
    use(id: string, create: () => PromiseLike<MintedTestKey>): Promise<TestKey & { created: boolean }> {
        const current = this.lookups.get(id);
        if (current) {
            return current;
        }
        const lookup = (async () => {
            const kept = await this.stored(id);
            return kept ? { ...kept, created: false } : { ...(await this.mint(id, create)), created: true };
        })();
        this.lookups.set(id, lookup);
        const done = () => {
            if (this.lookups.get(id) === lookup) {
                this.lookups.delete(id);
            }
        };
        void lookup.then(done, done);
        return lookup;
    }

    /** The kept key, when a run can still use it. */
    async stored(id: string): Promise<TestKey | undefined> {
        const now = this.now();
        const own = this.session.get(id);
        if (own && isUsableTestKey(own, now)) {
            return own;
        }
        const vault = this.vault();
        if (!vault) {
            return undefined;
        }
        try {
            const generation = this.generation;
            const key = asTestKey(parseJson(await vault.get(testKeySecret(id))));
            if (!key || generation !== this.generation) {
                return undefined;
            }
            if (!isUsableTestKey(key, now)) {
                if (key.expiresAt <= now) {
                    void this.forget(vault, [id]);
                }
                return undefined;
            }
            this.session.set(id, key);
            return key;
        } catch (error) {
            this.log(`Could not read the WSO2 Cloud test keys kept from earlier runs: ${error}`);
            return undefined;
        }
    }

    /** Drops every kept key, in this window and in secret storage, as when the person signs out. */
    async clear(): Promise<void> {
        this.generation++;
        this.session.clear();
        this.lookups.clear();
        const vault = this.vault();
        if (!vault) {
            return;
        }
        await this.relist(vault, async (listed) => {
            await Promise.all(Object.keys(listed).map((id) => vault.delete(testKeySecret(id))));
            return {};
        }).catch((error) => this.log(`Could not drop the WSO2 Cloud test keys kept from earlier runs: ${error}`));
    }

    private async mint(id: string, create: () => PromiseLike<MintedTestKey>): Promise<TestKey> {
        const generation = this.generation;
        const minted = await create();
        const mintedAt = this.now();
        const expiresAt = Date.parse(minted.expiresAt ?? "");
        // The key was just issued, so an expiry already past means this machine's clock is ahead of the
        // platform's, not that the key is spent; it is given the test key lifetime from now instead.
        const key: TestKey = { apiKey: minted.apiKey, mintedAt, expiresAt: Number.isFinite(expiresAt) && expiresAt > mintedAt ? expiresAt : mintedAt + TEST_KEY_LIFETIME_MS };
        if (generation === this.generation) {
            this.session.set(id, key);
            // Kept in the background: a locked or prompting keychain doesn't hold up the run.
            void this.keep(id, key);
        }
        return key;
    }

    /** Keeps the key in secret storage and lists it, dropping the listed keys that have expired. */
    private async keep(id: string, key: TestKey): Promise<void> {
        const vault = this.vault();
        if (!vault) {
            return;
        }
        try {
            await vault.store(testKeySecret(id), JSON.stringify(key));
            const now = this.now();
            await this.relist(vault, async (listed) => {
                const expired = Object.keys(listed).filter((other) => other !== id && listed[other] <= now);
                await Promise.all(expired.map((other) => vault.delete(testKeySecret(other))));
                const kept = Object.fromEntries(Object.entries(listed).filter(([other]) => !expired.includes(other)));
                return { ...kept, [id]: key.expiresAt };
            });
        } catch (error) {
            this.log(`Could not keep a WSO2 Cloud test key for later runs: ${error}`);
        }
    }

    /** Deletes the keys and takes them off the listing. */
    private async forget(vault: TestKeyVault, ids: string[]): Promise<void> {
        try {
            await Promise.all(ids.map((id) => vault.delete(testKeySecret(id))));
            await this.relist(vault, async (listed) => Object.fromEntries(Object.entries(listed).filter(([id]) => !ids.includes(id))));
        } catch (error) {
            this.log(`Could not drop an expired WSO2 Cloud test key: ${error}`);
        }
    }

    /** Rewrites the listing; a listing that can't be read counts as empty. */
    private relist(vault: TestKeyVault, change: (listed: Record<string, number>) => Promise<Record<string, number>>): Promise<void> {
        const next = this.listing.then(async () => {
            const listing = await change(asListing(parseJson(await vault.get(TEST_KEY_SECRET))));
            await (Object.keys(listing).length > 0 ? vault.store(TEST_KEY_SECRET, JSON.stringify(listing)) : vault.delete(TEST_KEY_SECRET));
        });
        this.listing = next.catch(() => undefined);
        return next;
    }
}

/**
 * What a run is told about its test keys: which were created for it and which kept from an earlier run, and when
 * the first expires; nothing when it used none.
 */
export function testKeyRunMessage(
    created: string[],
    reused: string[],
    expiries: number[],
    timeOf: (ms: number) => string = (ms) => new Date(ms).toLocaleTimeString(),
): string | undefined {
    const total = created.length + reused.length;
    if (total === 0 || expiries.length === 0) {
        return undefined;
    }
    const expiresAt = timeOf(Math.min(...expiries));
    const createdPart = created.length > 0 ? `Created ${created.length === 1 ? "a WSO2 Cloud test key" : "WSO2 Cloud test keys"} for ${created.join(", ")}` : undefined;
    const reusedWhat = createdPart ? (reused.length === 1 ? "the one" : "the ones") : reused.length === 1 ? "the WSO2 Cloud test key" : "the WSO2 Cloud test keys";
    const reusedPart = reused.length > 0 ? `${createdPart ? "reused" : "Reused"} ${reusedWhat} for ${reused.join(", ")} from an earlier run` : undefined;
    return [
        `${[createdPart, reusedPart].filter(Boolean).join("; ")}.`,
        total === 1 ? `It expires at ${expiresAt}; run again after that for a new one.` : `The first expires at ${expiresAt}; run again after that for new ones.`,
    ].join(" ");
}
