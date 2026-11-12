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

import { createFetcher } from "../../../components/graphql-view/fetcher";

const HEADERS = JSON.stringify({ "Content-Type": "application/json" });

/** Replies the way the extension host does, by posting a message to the webview window. */
function reply(data: unknown) {
    window.dispatchEvent(new MessageEvent("message", { data }));
}

/** Resolves to "pending" if the promise has not settled after the queued messages are handled. */
function settledValue<T>(promise: Promise<T>): Promise<T | "pending"> {
    return Promise.race([promise, new Promise<"pending">((resolve) => setTimeout(() => resolve("pending"), 0))]);
}

describe("createFetcher", () => {
    let sent: any[];
    let listeners: Set<EventListenerOrEventListenerObject>;
    let fetcher: ReturnType<typeof createFetcher>;

    beforeEach(() => {
        sent = [];
        listeners = new Set();
        const add = window.addEventListener.bind(window);
        const remove = window.removeEventListener.bind(window);
        jest.spyOn(window, "addEventListener").mockImplementation((type: string, listener: any, options?: any) => {
            if (type === "message") {
                listeners.add(listener);
            }
            add(type, listener, options);
        });
        jest.spyOn(window, "removeEventListener").mockImplementation((type: string, listener: any, options?: any) => {
            if (type === "message") {
                listeners.delete(listener);
            }
            remove(type, listener, options);
        });
        fetcher = createFetcher((message) => sent.push(message));
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it("settles each request with its own reply when replies arrive out of order", async () => {
        const first = fetcher("http://localhost:9090/graphql", { query: "{ a }" }, HEADERS);
        const second = fetcher("http://localhost:9090/graphql", { query: "{ b }" }, HEADERS);
        const [firstId, secondId] = sent.map((message) => message.id);
        expect(firstId).not.toEqual(secondId);

        reply({ command: "graphqlResponse", id: secondId, res: { data: { b: 2 } } });
        reply({ command: "graphqlResponse", id: firstId, res: { data: { a: 1 } } });

        await expect(first).resolves.toEqual({ data: { a: 1 } });
        await expect(second).resolves.toEqual({ data: { b: 2 } });
    });

    it("ignores a reply with another request's id or another command", async () => {
        const pending = fetcher("http://localhost:9090/graphql", { query: "{ a }" }, HEADERS);
        const { id } = sent[0];

        reply({ command: "graphqlResponse", id: id + 1, res: { data: { foreign: true } } });
        reply({ command: "somethingElse", id, res: { data: { foreign: true } } });
        expect(await settledValue(pending)).toEqual("pending");

        reply({ command: "graphqlResponse", id, res: { data: { a: 1 } } });
        await expect(pending).resolves.toEqual({ data: { a: 1 } });
    });

    it("leaves no message listener behind once every request has settled", async () => {
        const requests = [
            fetcher("http://localhost:9090/graphql", { query: "{ a }" }, HEADERS),
            fetcher("http://localhost:9090/graphql", { query: "{ b }" }, HEADERS),
        ];
        expect(listeners.size).toEqual(2);

        for (const { id } of [...sent].reverse()) {
            reply({ command: "graphqlResponse", id, res: { data: {} } });
        }
        await Promise.all(requests);

        expect(listeners.size).toEqual(0);
    });
});
