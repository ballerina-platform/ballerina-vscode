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

// L2 / C05: how the overview and the explorer learn that the project changed. The host pushes
// an update, this subscription turns it into a re-read. Three things go wrong if it is not
// right: a stale view after an edit, a listener that keeps firing into an unmounted view, and
// a re-subscribe on every render that leaks one listener per keystroke.

// The core barrel re-exports an ESM-only LS transport; utils.ts reads these from it.
jest.mock("@wso2/ballerina-core", () => ({
    DIRECTORY_MAP: {},
    SCOPE: {},
    findScope: (): undefined => undefined,
    findScopeByModule: (): undefined => undefined,
    hasWorkflowArtifacts: (): boolean => false,
}));

import * as React from "react";
import { act } from "react-dom/test-utils";
import { createRoot, Root } from "react-dom/client";
import { useProjectContentRefresh } from "./utils";

declare global {
    // eslint-disable-next-line no-var
    var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/** Stands in for the host: records subscriptions and lets a test push an update. */
function makeRpcClient() {
    const unsubscribe = jest.fn();
    let push: ((state: boolean) => void) | undefined;
    const onProjectContentUpdated = jest.fn((listener: (state: boolean) => void) => {
        push = listener;
        return unsubscribe;
    });
    return {
        client: { onProjectContentUpdated } as never,
        onProjectContentUpdated,
        unsubscribe,
        push: (state: boolean): void => push?.(state),
    };
}

describe("useProjectContentRefresh", () => {
    let container: HTMLDivElement;
    let root: Root;

    function Probe({ rpcClient, onUpdate }: { rpcClient: never; onUpdate: () => void }): null {
        useProjectContentRefresh(rpcClient, onUpdate);
        return null;
    }

    const render = async (rpcClient: never, onUpdate: () => void): Promise<void> => {
        await act(async () => {
            root.render(<Probe rpcClient={rpcClient} onUpdate={onUpdate} />);
        });
    };

    beforeEach(() => {
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        container.remove();
    });

    it("re-reads the project when the host reports a change", async () => {
        const { client, push } = makeRpcClient();
        const onUpdate = jest.fn();
        await render(client, onUpdate);

        await act(async () => {
            push(true);
        });

        expect(onUpdate).toHaveBeenCalledTimes(1);
        act(() => root.unmount());
    });

    // The host also reports the start of an update. Re-reading then would fetch the project
    // mid-write and show it half-changed.
    it("ignores a report that is not a completed change", async () => {
        const { client, push } = makeRpcClient();
        const onUpdate = jest.fn();
        await render(client, onUpdate);

        await act(async () => {
            push(false);
        });

        expect(onUpdate).not.toHaveBeenCalled();
        act(() => root.unmount());
    });

    it("stops listening when the view closes", async () => {
        const { client, unsubscribe } = makeRpcClient();
        await render(client, jest.fn());

        act(() => root.unmount());

        expect(unsubscribe).toHaveBeenCalledTimes(1);
    });

    // The callback is held in a ref precisely so a new one each render does not tear down and
    // rebuild the subscription. Without that, a parent re-rendering on every keystroke would
    // churn listeners, and an update arriving mid-churn would be missed.
    it("keeps one subscription across re-renders with a fresh callback", async () => {
        const { client, onProjectContentUpdated, push } = makeRpcClient();
        const first = jest.fn();
        const second = jest.fn();

        await render(client, first);
        await render(client, second);

        expect(onProjectContentUpdated).toHaveBeenCalledTimes(1);

        await act(async () => {
            push(true);
        });

        // The latest callback wins, so the re-read uses current state rather than the one
        // captured when the subscription was created.
        expect(second).toHaveBeenCalledTimes(1);
        expect(first).not.toHaveBeenCalled();
        act(() => root.unmount());
    });

    it("subscribes to nothing before the host is available", async () => {
        const onUpdate = jest.fn();

        await render(undefined as never, onUpdate);

        expect(onUpdate).not.toHaveBeenCalled();
        act(() => root.unmount());
    });
});
