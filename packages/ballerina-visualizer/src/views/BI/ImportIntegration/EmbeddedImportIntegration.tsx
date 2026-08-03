/* eslint-disable @typescript-eslint/no-explicit-any */

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
import { ProgressIndicator, Typography } from "@wso2/ui-toolkit";
import { ImportIntegration } from "./index";
import { BiWsClientProvider } from "../wsManager/WsClientContext";
import { WebviewTransportBootstrap } from "@wso2/ballerina-core";

/** The embedding host client used only to fetch the WS coordinates. */
interface HostBootstrapClient {
    getBiFormWsBootstrap(): Promise<{ host: string; port: number; token: string }>;
}

export interface EmbeddedImportIntegrationProps {
    /** The integrator host's client; used to resolve the Ballerina WS coordinates. */
    wsClient: HostBootstrapClient;
    /** Back navigation supplied by the integrator (returns to its welcome view). */
    onBack: () => void;
}

const stateContainerStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    justifyContent: "center",
    alignItems: "center",
    minHeight: "320px",
    textAlign: "center",
    padding: "24px",
};

/**
 * Federation entry point for the import-integration wizard. Resolves the
 * Ballerina extension's giga-bridge WS coordinates via the host client, then
 * runs the (Ballerina-owned) wizard against the WS-manager `BiWsClient` in
 * websocket mode — so the migration RPCs run on the Ballerina side directly.
 */
export default function EmbeddedImportIntegration({ wsClient, onBack }: EmbeddedImportIntegrationProps) {
    const [bootstrap, setBootstrap] = useState<WebviewTransportBootstrap | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const coords = await wsClient.getBiFormWsBootstrap();
                if (!cancelled) {
                    setBootstrap({ mode: "websocket", wsServer: coords.host, wsPort: coords.port, token: coords.token });
                }
            } catch (connectError) {
                if (!cancelled) {
                    setError(
                        connectError instanceof Error
                            ? connectError.message
                            : "Failed to connect to the Ballerina service.",
                    );
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [wsClient]);

    if (error) {
        return (
            <div style={stateContainerStyle}>
                <Typography variant="h4">Unable to start the migration service</Typography>
                <Typography variant="body2">{error}</Typography>
            </div>
        );
    }

    if (!bootstrap) {
        return (
            <div style={stateContainerStyle}>
                <ProgressIndicator />
                <Typography variant="body2">Connecting to the migration service…</Typography>
            </div>
        );
    }

    return (
        <BiWsClientProvider bootstrap={bootstrap} onBack={onBack}>
            <ImportIntegration />
        </BiWsClientProvider>
    );
}
