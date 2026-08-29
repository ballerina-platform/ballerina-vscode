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
import { CreateProjectChooser } from "./integrator-form/CreateProjectChooser";
import { StandaloneCreateChooser } from "./integrator-form/StandaloneCreateChooser";
import { CreateFlowShell } from "./integrator-form/shared/CreateFlowShell";
import { EmbeddedWsRpc, createCompositeClient, WsCoords } from "./wsRpc";
import { BiWsClient } from "../../wsManager/WsClient";
import { BiWsClientProvider } from "../../wsManager/WsClientContext";
import { CreateIntegrationWizard } from "../../CreateIntegrationWizard";

/**
 * Which BI creation form to render. `create` is the unified entry point (project
 * chooser → integration wizard / library form) and the primary mode going
 * forward. `integration` is the standalone Create Integration wizard (rendered inside the
 * host's CreationView chrome); `project` and `library` are the legacy welcome
 * "More Actions" flows, which carry their own page chrome and a Back button
 * driven by `onBack`.
 */
export type EmbeddedFormMode = "create" | "integration" | "project" | "library";

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

/** How long the capability probe waits before falling back to the legacy form. */
const WIZARD_PROBE_TIMEOUT_MS = 5000;

/** Version-skew handshake state for the integration mode. */
type WizardSupport = "probing" | "supported" | "unsupported";

/**
 * Federation entry point. Connects to the Ballerina extension's WS server for
 * project-creation RPCs, composes it with the host client (which keeps serving
 * cloud reads), and renders the appropriate creation form against that
 * composite. For `mode="integration"` it probes the extension's wizard
 * capabilities and renders the Create Integration wizard, falling back
 * to the legacy single-step form against an older extension.
 */
export default function EmbeddedBIProjectForm({ wsClient, ballerinaUnavailable, mode = "integration", onBack }: EmbeddedBIProjectFormProps) {
    const queryClient = useMemo(() => new QueryClient(), []);
    const [rpcClient, setRpcClient] = useState<WiBridgeClient | null>(null);
    const [biWsClient, setBiWsClient] = useState<BiWsClient | null>(null);
    const [wizardSupport, setWizardSupport] = useState<WizardSupport>("probing");
    const [error, setError] = useState<string | null>(null);
    // `undefined` = the extension has not determined it yet (it answers the capability
    // probe before the distribution version is known, so the form can render immediately).
    // Only `create` mode reads this; the other modes never probe it.
    const [workspaceSupported, setWorkspaceSupported] = useState<boolean | undefined>(undefined);

    useEffect(() => {
        let cancelled = false;
        let wsRpc: EmbeddedWsRpc | undefined;
        let wizardClient: BiWsClient | undefined;
        (async () => {
            try {
                const coords: WsCoords = await (wsClient as any).getBiFormWsBootstrap();
                if (cancelled) {
                    return;
                }

                // Both the standalone wizard (`integration`) and the unified entry
                // (`create`, which can route to the wizard) need the Create Integration wizard
                // client. Probe the handshake first; an older extension without the
                // handler rejects (or times out) → legacy form / no wizard route.
                if (mode === "integration" || mode === "create") {
                    wizardClient = new BiWsClient({
                        mode: "websocket",
                        wsServer: coords.host,
                        wsPort: coords.port,
                        token: coords.token,
                    });
                    let wizardOk = false;
                    try {
                        const capabilities = await Promise.race([
                            wizardClient.getWizardCapabilities(),
                            new Promise<never>((_, reject) =>
                                setTimeout(() => reject(new Error("capability probe timed out")), WIZARD_PROBE_TIMEOUT_MS)
                            ),
                        ]);
                        if (!cancelled && capabilities?.threeStepWizard) {
                            setBiWsClient(wizardClient);
                            setWizardSupport("supported");
                            wizardOk = true;
                            if (capabilities.isWorkspaceSupported !== undefined) {
                                setWorkspaceSupported(capabilities.isWorkspaceSupported);
                            } else if (mode === "create") {
                                // Still being determined. Resolve it in the background rather
                                // than holding the whole form back — the chooser's first screen
                                // needs no distribution, only its "Next" button does.
                                // Aliased so the closure keeps the non-null narrowing.
                                const probeClient = wizardClient;
                                probeClient
                                    .getWorkspaceSupport()
                                    .then(({ isWorkspaceSupported }) => {
                                        if (!cancelled) {
                                            setWorkspaceSupported(isWorkspaceSupported);
                                        }
                                    })
                                    .catch((supportError) =>
                                        console.warn(">>> Failed to resolve workspace support.", supportError)
                                    );
                            }
                        }
                    } catch (probeError) {
                        console.warn(">>> Create Integration wizard unavailable, using the legacy form.", probeError);
                    }
                    if (!wizardOk) {
                        wizardClient.dispose();
                        wizardClient = undefined;
                        if (cancelled) {
                            return;
                        }
                        setWizardSupport("unsupported");
                    }
                    // The standalone wizard needs no composite client — done once the
                    // probe succeeds. `create` mode also needs the composite (for the
                    // chooser screen + library form), so it always falls through.
                    if (mode === "integration" && wizardOk) {
                        return;
                    }
                }

                // Legacy/composite stack (project/library modes, the integration
                // fallback, and the `create` chooser + its library route).
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
            wizardClient?.dispose();
        };
    }, [wsClient, mode]);

    // The unified Create flow renders every transient state (error, update-required,
    // connecting) inside the shared Create shell so they appear within the bordered
    // panel rather than floating alone.
    if (mode === "create") {
        if (error) {
            return (
                <CreateFlowShell title="Create" onBack={onBack}>
                    <div style={stateContainerStyle}>
                        <Typography variant="h4">Unable to start the integration service</Typography>
                        <Typography variant="body2">{error}</Typography>
                    </div>
                </CreateFlowShell>
            );
        }
        if (wizardSupport === "unsupported") {
            // The bundle and extension ship together, so this only happens on a
            // host/extension version skew — the welcome should have gated it out.
            return (
                <CreateFlowShell title="Create" onBack={onBack}>
                    <div style={stateContainerStyle}>
                        <Typography variant="h4">Update required</Typography>
                        <Typography variant="body2">
                            Creating a project requires a newer version of the Ballerina extension.
                        </Typography>
                    </div>
                </CreateFlowShell>
            );
        }
        if (wizardSupport === "probing" || !rpcClient || !biWsClient) {
            return (
                <CreateFlowShell title="Create" onBack={onBack}>
                    <div style={stateContainerStyle}>
                        <ProgressIndicator />
                        <Typography variant="body2">Connecting to the integration service…</Typography>
                    </div>
                </CreateFlowShell>
            );
        }
        return (
            <WsClientProvider wsClient={rpcClient}>
                <QueryClientProvider client={queryClient}>
                    <CloudContextProvider>
                        {/* Only a settled `false` routes to the standalone flow. While support is
                            still unknown the project chooser renders (the overwhelmingly common
                            outcome) with its Next button gated, so the user can start filling the
                            form during the last of the extension's start-up. */}
                        {workspaceSupported === false ? (
                            <StandaloneCreateChooser
                                biWsClient={biWsClient}
                                ballerinaUnavailable={ballerinaUnavailable}
                                onBack={onBack}
                            />
                        ) : (
                            <CreateProjectChooser
                                biWsClient={biWsClient}
                                ballerinaUnavailable={ballerinaUnavailable}
                                workspaceSupportPending={workspaceSupported === undefined}
                                onBack={onBack}
                            />
                        )}
                    </CloudContextProvider>
                </QueryClientProvider>
            </WsClientProvider>
        );
    }

    if (error) {
        return (
            <div style={stateContainerStyle}>
                <Typography variant="h4">Unable to start the integration service</Typography>
                <Typography variant="body2">{error}</Typography>
            </div>
        );
    }

    if (mode === "integration" && wizardSupport === "supported" && biWsClient) {
        return (
            <BiWsClientProvider wsClient={biWsClient} onBack={onBack}>
                <CreateIntegrationWizard showHeader={false} />
            </BiWsClientProvider>
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
