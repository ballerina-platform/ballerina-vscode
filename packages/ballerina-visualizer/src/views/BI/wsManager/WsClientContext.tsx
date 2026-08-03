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

import React, { createContext, useContext, useEffect, useMemo } from "react";
import { BiWsClient } from "./WsClient";
import { WebviewTransportBootstrap } from "@wso2/ballerina-core";

interface BiWsContextValue {
    /** The migrated-forms WS manager client (giga-bridge, proxy or websocket). */
    wsClient: BiWsClient;
    /** Back navigation. In the integrator embed this closes the form and returns
     *  to the integrator welcome; in the visualizer it routes to BIWelcome. */
    onBack: () => void;
}

const BiWsContext = createContext<BiWsContextValue | undefined>(undefined);

interface BiWsClientProviderProps {
    /** Inject a pre-built client (e.g. one wired to a host-provided bootstrap).
     *  When omitted, a client is created from the resolved bridge bootstrap. */
    wsClient?: BiWsClient;
    /** Force a specific transport bootstrap (the integrator embed passes websocket coords). */
    bootstrap?: WebviewTransportBootstrap;
    /** Optional back-navigation override (the integrator embed supplies its own). */
    onBack?: () => void;
    children: React.ReactNode;
}

/**
 * Provides the migrated-forms `wsClient` to the BI project/import forms. Mirrors
 * the integrator's `useVisualizerContext().wsClient` seam so the same form code
 * runs in the Ballerina visualizer and embedded in the integrator.
 */
export function BiWsClientProvider({ wsClient, bootstrap, onBack, children }: BiWsClientProviderProps) {
    // Create the client from (injected client | bootstrap) only — NOT from `onBack`.
    // Including `onBack` here would spin up a fresh BiWsClient (and WS connection)
    // every time the parent passed a new inline `onBack` reference.
    const client = useMemo(() => wsClient ?? new BiWsClient(bootstrap), [wsClient, bootstrap]);

    // Dispose only a client we created here; an injected client is owned by the caller.
    useEffect(() => {
        if (wsClient) {
            return;
        }
        return () => client.dispose();
    }, [client, wsClient]);

    const value = useMemo<BiWsContextValue>(
        () => ({
            wsClient: client,
            onBack: onBack ?? (() => client.goBack()),
        }),
        [client, onBack],
    );

    return <BiWsContext.Provider value={value}>{children}</BiWsContext.Provider>;
}

export function useBiWsContext(): BiWsContextValue {
    const ctx = useContext(BiWsContext);
    if (!ctx) {
        throw new Error("useBiWsContext must be used within a BiWsClientProvider");
    }
    return ctx;
}
