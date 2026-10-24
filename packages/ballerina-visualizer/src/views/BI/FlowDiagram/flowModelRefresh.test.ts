/**
 * @jest-environment node
 */
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

import { createFlowModelRefresher, FlowModelRefresher } from "./flowModelRefresh";

const WINDOW = 1000;

describe("flow model refresher", () => {
    let fetches: Array<{ resolve: () => void; reject: (e: unknown) => void }>;
    let refresher: FlowModelRefresher;

    // Stands in for FlowDiagram: request() goes straight to fetch() (no deferred insert in progress).
    beforeEach(() => {
        jest.useFakeTimers();
        fetches = [];
        refresher = createFlowModelRefresher(
            () => new Promise<void>((resolve, reject) => fetches.push({ resolve, reject })),
            () => refresher.fetch(),
            WINDOW
        );
    });

    afterEach(() => {
        refresher.dispose();
        jest.useRealTimers();
    });

    const settle = async (i: number, ok = true) => {
        ok ? fetches[i].resolve() : fetches[i].reject(new Error("ls"));
        await Promise.resolve();
        await Promise.resolve();
    };

    it("is up to date only after a fetch that began after the latest change", async () => {
        let upToDate = false;
        refresher.markStale();
        refresher.fetch();
        refresher.markStale();
        refresher.fetch();
        void refresher.upToDate().then(() => { upToDate = true; });
        await settle(0);
        expect(upToDate).toBe(false);
        expect(fetches).toHaveLength(2);
        await settle(1);
        expect(upToDate).toBe(true);
    });

    it("joins a fetch in flight when nothing changed since it began", async () => {
        refresher.markStale();
        refresher.fetch();
        refresher.fetch();
        refresher.fetch();
        expect(fetches).toHaveLength(1);
        await settle(0);
        expect(fetches).toHaveLength(1);
    });

    it("fetches exactly once more when something changed while a fetch was in flight", async () => {
        refresher.fetch();
        refresher.markStale();
        refresher.fetch();
        refresher.markStale();
        refresher.fetch();
        expect(fetches).toHaveLength(1);
        await settle(0);
        expect(fetches).toHaveLength(2);
        await settle(1);
        expect(fetches).toHaveLength(2);
    });

    // A node save: the content notification refreshes, then the side panel closing asks again within the window.
    it("drops the trailing refresh of a burst when nothing changed after the leading fetch began", async () => {
        refresher.markStale();
        refresher.refresh();
        expect(fetches).toHaveLength(1);
        refresher.refresh();
        await settle(0);
        jest.advanceTimersByTime(WINDOW);
        expect(fetches).toHaveLength(1);
    });

    // Copilot live edits: content keeps changing, so the burst ends with one refresh of the final source.
    it("runs the trailing refresh when content changed after the leading fetch began", async () => {
        refresher.markStale();
        refresher.refresh();
        await settle(0);
        for (let i = 0; i < 5; i++) {
            jest.advanceTimersByTime(200);
            refresher.markStale();
            refresher.refresh();
        }
        expect(fetches).toHaveLength(1);
        jest.advanceTimersByTime(WINDOW);
        expect(fetches).toHaveLength(2);
    });

    it("keeps working after a failed fetch", async () => {
        refresher.fetch();
        await settle(0, false);
        refresher.fetch();
        expect(fetches).toHaveLength(2);
    });

    it("does nothing after dispose", () => {
        refresher.refresh();
        refresher.dispose();
        refresher.markStale();
        refresher.refresh();
        refresher.fetch();
        jest.advanceTimersByTime(WINDOW);
        expect(fetches).toHaveLength(1);
    });
});
