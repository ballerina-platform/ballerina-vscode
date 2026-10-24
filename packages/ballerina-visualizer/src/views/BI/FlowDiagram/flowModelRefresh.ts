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

export interface FlowModelRefresher {
    /** Something the flow model depends on changed (source, view location, breakpoints). */
    markStale(): void;
    /** Fetches now, or joins the fetch in flight; one more fetch follows it if something changed after it began. */
    fetch(): void;
    /** Leading-edge refresh whose trailing call runs only if something changed after the last fetch began. */
    refresh(): void;
    /** Resolves once a fetch that began after the latest change has landed. */
    upToDate(): Promise<void>;
    dispose(): void;
}

// One edit raises several refresh requests, and each used to cost a full flow-model build in the language server.
export function createFlowModelRefresher(
    fetchModel: () => Promise<unknown>,
    request: () => void,
    windowMs: number
): FlowModelRefresher {
    let changeSeq = 0;
    let lastStartedSeq = -1;
    let inFlightSeq: number | undefined;
    let fetchAgain = false;
    let windowTimer: ReturnType<typeof setTimeout> | undefined;
    let trailingRequested = false;
    let disposed = false;
    let waiters: { seq: number; resolve: () => void }[] = [];

    const fetch = () => {
        if (disposed) {
            return;
        }
        if (inFlightSeq !== undefined) {
            fetchAgain = fetchAgain || changeSeq > inFlightSeq;
            return;
        }
        const startedSeq = inFlightSeq = lastStartedSeq = changeSeq;
        const settle = () => {
            inFlightSeq = undefined;
            const landed = waiters.filter((waiter) => waiter.seq <= startedSeq);
            waiters = waiters.filter((waiter) => waiter.seq > startedSeq);
            landed.forEach((waiter) => waiter.resolve());
            if (fetchAgain) {
                fetchAgain = false;
                request();
            }
        };
        fetchModel().then(settle, settle);
    };

    const closeWindow = () => {
        windowTimer = undefined;
        if (trailingRequested) {
            trailingRequested = false;
            if (changeSeq > lastStartedSeq) {
                refresh();
            }
        }
    };

    const refresh = () => {
        if (disposed) {
            return;
        }
        if (windowTimer) {
            trailingRequested = true;
            clearTimeout(windowTimer);
        } else {
            request();
        }
        windowTimer = setTimeout(closeWindow, windowMs);
    };

    return {
        markStale: () => {
            changeSeq++;
        },
        fetch,
        refresh,
        upToDate: () => new Promise<void>((resolve) => waiters.push({ seq: changeSeq, resolve })),
        dispose: () => {
            disposed = true;
            clearTimeout(windowTimer);
        },
    };
}
