/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
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

import { useEffect, useMemo, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProgressIndicator, Typography } from "@wso2/ui-toolkit";
import { WsClientProvider, WiBridgeClient } from "./integrator-form/context/WsClientContext";
import { CloudContextProvider } from "./integrator-form/providers";
import { BIProjectForm } from "./integrator-form";
import { ProjectCreationView } from "./integrator-form/ProjectCreationView";
import { LibraryCreationView } from "./integrator-form/LibraryCreationView";
import { EmbeddedWsRpc, createCompositeClient, WsCoords } from "./wsRpc";

/**
 * Which BI creation form to render. `integration` is the primary
 * "Create New Integration" form (rendered inside the host's CreationView chrome);
 * `project` and `library` are the welcome "More Actions" flows, which carry their
 * own page chrome and a Back button driven by `onBack`.
 */
export type EmbeddedFormMode = "integration" | "project" | "library";

export interface EmbeddedBIProjectFormProps {
    /** The embedding host's client. Used for the WS bootstrap and cloud reads. */
    wsClient: WiBridgeClient;
    ballerinaUnavailable?: boolean;
    /** The variant to render. Defaults to `integration`. */
    mode?: EmbeddedFormMode;
    /** Back navigation for the self-chromed `project`/`library` variants. */
    onBack?: () => void;
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
 * Federation entry point. Connects to the Ballerina extension's WS server for
 * project-creation RPCs, composes it with the host client (which keeps serving
 * cloud reads), and renders the unchanged integrator form against that
 * composite. The form is owned by the Ballerina repo; project creation runs on
 * the Ballerina side without round-tripping through the host.
 */
export default function EmbeddedBIProjectForm({ wsClient, ballerinaUnavailable, mode = "integration", onBack }: EmbeddedBIProjectFormProps) {
    const queryClient = useMemo(() => new QueryClient(), []);
    const [rpcClient, setRpcClient] = useState<WiBridgeClient | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        let wsRpc: EmbeddedWsRpc | undefined;
        (async () => {
            try {
                const coords: WsCoords = await (wsClient as any).getBiFormWsBootstrap();
                wsRpc = new EmbeddedWsRpc(coords);
                if (cancelled) {
                    // Unmounted while the bootstrap was in flight — dispose the socket we
                    // just opened rather than leaking it.
                    wsRpc.dispose();
                    return;
                }
                setRpcClient(createCompositeClient(wsClient, wsRpc));
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
            wsRpc?.dispose();
        };
    }, [wsClient]);

    if (error) {
        return (
            <div style={stateContainerStyle}>
                <Typography variant="h4">Unable to start the integration service</Typography>
                <Typography variant="body2">{error}</Typography>
            </div>
        );
    }

    if (!rpcClient) {
        return (
            <div style={stateContainerStyle}>
                <ProgressIndicator />
                <Typography variant="body2">Connecting to the integration service…</Typography>
            </div>
        );
    }

    return (
        <WsClientProvider wsClient={rpcClient}>
            <QueryClientProvider client={queryClient}>
                <CloudContextProvider>
                    {mode === "library" ? (
                        <LibraryCreationView onBack={onBack} ballerinaUnavailable={ballerinaUnavailable} />
                    ) : mode === "project" ? (
                        <ProjectCreationView onBack={onBack} ballerinaUnavailable={ballerinaUnavailable} />
                    ) : (
                        <BIProjectForm ballerinaUnavailable={ballerinaUnavailable} />
                    )}
                </CloudContextProvider>
            </QueryClientProvider>
        </WsClientProvider>
    );
}
