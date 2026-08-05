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

import { useEffect, useState } from "react";
import { BiWsClient } from "../../wsManager/WsClient";

/**
 * The host's agent builder mode flag (`AGENT_BUILDER_MODE`), resolved once by the
 * extension's state machine and read over the bridge.
 *
 * The bridge — not `rpcClient.getVisualizerLocation()` — because the wizard also runs
 * embedded in the integrator webview, where there is no visualizer state machine.
 *
 * Cached per client for the session: the flag is a process-level constant, and the
 * wizard is mounted and unmounted repeatedly as the Create flow moves between
 * screens. Caching keeps every mount after the first synchronous, so only the very
 * first one can render the "unresolved" state.
 */
const cache = new WeakMap<BiWsClient, Promise<boolean>>();

function resolveAgentBuilderMode(wsClient: BiWsClient): Promise<boolean> {
    let pending = cache.get(wsClient);
    if (!pending) {
        pending = wsClient
            .getAgentBuilderMode()
            .then((res) => !!res?.isAgentBuilderMode)
            // A host that predates the handler rejects — it cannot be in agent builder mode.
            .catch(() => false);
        cache.set(wsClient, pending);
    }
    return pending;
}

/**
 * @returns `true`/`false` once known, `undefined` while the flag is still resolving —
 *  callers should hold off on rendering anything the flag would take away.
 */
export function useAgentBuilderMode(wsClient: BiWsClient): boolean | undefined {
    const [agentBuilderMode, setAgentBuilderMode] = useState<boolean | undefined>(undefined);

    useEffect(() => {
        let cancelled = false;
        void resolveAgentBuilderMode(wsClient).then((enabled) => {
            if (!cancelled) {
                setAgentBuilderMode(enabled);
            }
        });
        return () => {
            cancelled = true;
        };
    }, [wsClient]);

    return agentBuilderMode;
}
