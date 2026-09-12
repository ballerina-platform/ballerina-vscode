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

import React, { Suspense, useEffect, useRef, useState } from "react";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import {
    AIMachineStateValue,
    DIRECTORY_MAP,
    getIntegrationCreationCopy,
    IntegrationComponentLabel,
    isSamePath,
    MachineStateValue,
    PendingIntegrationArtifactKind,
    ProjectDirectoryMap,
    SHARED_COMMANDS,
} from "@wso2/ballerina-core";
import styled from '@emotion/styled';

import { VSCodeProgressRing } from "@vscode/webview-ui-toolkit/react";
import { Global, css } from '@emotion/react';
import { DownloadIcon } from "./components/DownloadIcon";
import { WebviewErrorBoundary } from "./components/WebviewErrorBoundary";
import { ThemeColors } from "@wso2/ui-toolkit";
import { LoadingRing } from "./components/Loader";
import { AgentStatusOrb } from "./components/AgentStatusOrb";
import { subscribeAmbientCopilotPresence } from "./components/AgentStatusOrb/shared";

const MainPanel = React.lazy(() => import("./MainPanel"));
const AIPanel = React.lazy(() => import("./views/AIPanel/AIPanel"));
const AgentChat = React.lazy(() =>
    import("./views/AgentChatPanel/AgentChat").then((module) => ({ default: module.AgentChat }))
);
const EvaluationHistory = React.lazy(() =>
    import("./views/EvaluationHistory/EvaluationHistory").then((module) => ({ default: module.EvaluationHistory }))
);
const EvaluationReport = React.lazy(() =>
    import("./views/EvaluationReport/EvaluationReport").then((module) => ({ default: module.EvaluationReport }))
);
const MigrationPanel = React.lazy(() =>
    import("./views/MigrationPanel/MigrationPanel").then((module) => ({ default: module.MigrationPanel }))
);

const ProgressRing = styled(VSCodeProgressRing)`
    height: 36px;
    width: 36px;
`;

const LoadingContent = styled.div`
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    height: 100vh;
    width: 100%;
    text-align: center;
    animation: fadeIn 1s ease-in-out;
`;

const LoadingTitle = styled.h1`
    color: var(--vscode-foreground);
    font-size: 1.5em;
    font-weight: 400;
    margin: 0;
    margin-top: 1.5rem;
    letter-spacing: -0.02em;
    line-height: normal;
`;

const LoadingSubtitle = styled.p`
    color: var(--vscode-descriptionForeground);
    font-size: 13px;
    margin: 0.5rem 0 0 0;
    opacity: 0.8;
`;

/** A live step, for the one wait that genuinely reports its progress. */
const LoadingText = styled.div`
    color: ${ThemeColors.PRIMARY};
    font-size: 13px;
    font-weight: 500;
    margin-top: 2rem;
`;

const globalStyles = css`
    @keyframes fadeIn {
        0% { opacity: 0; }
        100% { opacity: 1; }
    }
`;

const MODES = {
    VISUALIZER: "visualizer",
    AI: "ai",
    RUNTIME_SERVICES: "runtime-services",
    AGENT_CHAT: "agent-chat",
    MIGRATION: "migration",
    EVALUATION_HISTORY: "evaluation-history",
    EVALUATION_REPORT: "evaluation-report",
};

export function Visualizer({ mode }: { mode: string }) {
    const { rpcClient } = useRpcContext();
    const [state, setState] = React.useState<MachineStateValue>('initialize');
    const [aiState, setAIState] = React.useState<AIMachineStateValue>('Initialize');

    if (mode === MODES.VISUALIZER) {
        rpcClient?.onStateChanged((newState: MachineStateValue) => {
            setState(newState);
        });
    }

    if (mode === MODES.AI) {
        rpcClient?.onAIPanelStateChanged((newState: AIMachineStateValue) => {
            setAIState(newState);
        });
    }

    useEffect(() => {
        if (mode === MODES.VISUALIZER) {
            rpcClient.webviewReady();
        }
    }, []);

    useEffect(() => {
        if (mode !== MODES.VISUALIZER || !rpcClient) {
            return;
        }
        const pushPresence = (present: boolean): void => {
            rpcClient.getCommonRpcClient().executeCommand({
                commands: [SHARED_COMMANDS.SET_COPILOT_AMBIENT_PRESENT, present],
            });
        };
        const unsubscribe = subscribeAmbientCopilotPresence(pushPresence);
        return () => {
            unsubscribe();
            pushPresence(false);
        };
    }, [mode, rpcClient]);

    return (
        <WebviewErrorBoundary
            title="Unable to load the visualizer"
            message="A required webview chunk failed to load. Retry to reload the webview."
            onRetry={() => window.location.reload()}
        >
            {/* Chunk-loading fallback: keep narrating the create (when there is one)
                rather than flipping to a generic message for the last moment of it. */}
            <Suspense fallback={<LanguageServerLoadingView startupIntegration={readStartupIntegration()} />}>
                {(() => {
                    switch (mode) {
                        case MODES.VISUALIZER:
                            return <VisualizerComponent state={state} />
                        case MODES.RUNTIME_SERVICES:
                            return <MainPanel />
                        case MODES.AI:
                            return <Suspense fallback={<LoadingRing />}><AIPanel state={aiState} /></Suspense>
                        case MODES.AGENT_CHAT:
                            return <AgentChat />
                        case MODES.MIGRATION:
                            return <MigrationPanel />
                        case MODES.EVALUATION_HISTORY:
                            return <EvaluationHistory />
                        case MODES.EVALUATION_REPORT:
                            return <EvaluationReport />
                        default:
                            return <MainPanel />
                    }
                })()}
            </Suspense>
        </WebviewErrorBoundary>
    );
};

/** Create-in-progress injected into the webview HTML by the extension; read synchronously so the first render has it. */
interface StartupIntegration {
    integrationName: string;
    /** e.g. "service" — absent for an empty integration. */
    artifactLabel?: string;
    /** Absent for an empty integration (nothing is generated, nothing to wait for). */
    artifactKind?: PendingIntegrationArtifactKind;
    /** The package the pending artifact is generated into. */
    projectRoot: string;
    /** Project the package was created in; absent for a standalone package. */
    projectName?: string;
    /** Whether the same submit created the project too. */
    isNewProject?: boolean;
    /** Integration vs library. */
    componentLabel?: IntegrationComponentLabel;
}

type StartupIntegrationHost = {
    startupIntegration?: StartupIntegration | null;
    startupTitle?: string | null;
};

function readStartupIntegration(): StartupIntegration | undefined {
    return (window as unknown as StartupIntegrationHost).startupIntegration ?? undefined;
}

function readStartupTitle(): string | undefined {
    return (window as unknown as StartupIntegrationHost).startupTitle ?? undefined;
}

/** Consumed once: see the effect in `VisualizerComponent`. */
function clearStartupIntegration(): void {
    (window as unknown as StartupIntegrationHost).startupIntegration = null;
}

/** Kinds whose generation writes an artifact. `AI_CHAT_AGENT` opens its own wizard, so holding would block it. */
const KINDS_WRITING_AN_ARTIFACT: PendingIntegrationArtifactKind[] = ["SERVICE", "AUTOMATION", "WORKFLOW"];

/** The package was created moments ago with no artifacts, so ANY artifact appearing in it is the one being waited for. */
const ARTIFACT_DIRECTORIES: (keyof ProjectDirectoryMap)[] = [
    DIRECTORY_MAP.SERVICE,
    DIRECTORY_MAP.AUTOMATION,
    DIRECTORY_MAP.WORKFLOW,
    DIRECTORY_MAP.ACTIVITY,
    DIRECTORY_MAP.AGENT,
    DIRECTORY_MAP.FUNCTION,
];

/** Upper bound on the hold, just above the 10s artifact-notification timeout. */
const PENDING_ARTIFACT_HOLD_TIMEOUT_MS = 12_000;

/** Backstop poll interval for the hold below; the refresh notification is the primary signal. */
const PENDING_ARTIFACT_POLL_MS = 3_000;

/**
 * Whether the startup progress screen must stay up even though a view is ready. The
 * pending artifact is generated only after `extensionReady`, and the first view can be
 * pushed before that — without the hold the overview paints an integration card with a
 * missing type chip and fills it in a beat later.
 */
function usePendingArtifactHold(pending: StartupIntegration | undefined): boolean {
    const { rpcClient } = useRpcContext();
    const projectRoot = pending?.projectRoot;
    const waitsForArtifact =
        !!projectRoot && !!pending?.artifactKind && KINDS_WRITING_AN_ARTIFACT.includes(pending.artifactKind);
    const [holding, setHolding] = useState<boolean>(waitsForArtifact);

    useEffect(() => {
        if (!holding || !waitsForArtifact) {
            return;
        }
        let released = false;
        let inFlight = false;
        const release = () => {
            released = true;
            setHolding(false);
        };
        const check = async (): Promise<void> => {
            if (inFlight || released) {
                return;
            }
            inFlight = true;
            try {
                const res = await rpcClient.getBIDiagramRpcClient().getProjectStructure();
                const project = res?.projects?.find((p) => isSamePath(p.projectPath, projectRoot));
                const hasArtifact = ARTIFACT_DIRECTORIES.some(
                    (directory) => (project?.directoryMap?.[directory]?.length ?? 0) > 0
                );
                if (!released && hasArtifact) {
                    release();
                }
            } catch (error) {
                // Never hold on a broken read — fall through to the normal view.
                console.error(">>> Error while waiting for the pending artifact", error);
                release();
            } finally {
                inFlight = false;
            }
        };
        void check();
        // The refresh notification the generation fires is the primary signal; the
        // slower poll is only a backstop for one that is suppressed or missed.
        const unsubscribe = rpcClient.onProjectContentUpdated(() => void check());
        const interval = setInterval((): void => {
            void check();
        }, PENDING_ARTIFACT_POLL_MS);
        const timeout = setTimeout(release, PENDING_ARTIFACT_HOLD_TIMEOUT_MS);
        return () => {
            clearInterval(interval);
            clearTimeout(timeout);
            unsubscribe?.();
        };
    }, [holding, waitsForArtifact, projectRoot, rpcClient]);

    return holding;
}

const VisualizerComponent = React.memo(({ state }: { state: MachineStateValue }) => {
    const isViewReady = typeof state === 'object' && 'viewActive' in state && state.viewActive === "viewReady";
    // Captured on mount, before the value is consumed below, so both the hold and
    // this screen's copy outlive the clear that happens once the view is shown.
    const pendingRef = useRef(readStartupIntegration());
    const pending = pendingRef.current;
    const isHoldingForPendingArtifact = usePendingArtifactHold(pending);
    const showMainPanel = isViewReady && !isHoldingForPendingArtifact;

    // The startup narrative belongs to startup only. Once a view has been shown the
    // create is over, so drop it — any later loading state is an ordinary one and
    // must not claim the integration is still being created.
    useEffect(() => {
        if (showMainPanel) {
            clearStartupIntegration();
        }
    }, [showMainPanel]);

    switch (true) {
        case showMainPanel:
            return <><MainPanel /><AgentStatusOrb /></>;
        case typeof state === 'object' && 'viewActive' in state && state.viewActive === "resolveMissingDependencies":
            return <PullingDependenciesView />;
        default:
            return <LanguageServerLoadingView startupIntegration={pending} />;
    }
});

/** Pre-view loading screen; continues the wizard's "Creating <name>" copy when this window is finishing a submit. */
const LanguageServerLoadingView = ({ startupIntegration }: { startupIntegration?: StartupIntegration }) => {
    const copy = startupIntegration
        ? getIntegrationCreationCopy(startupIntegration)
        : {
            title: readStartupTitle() ?? "Preparing your project",
            subtitle: "Your project is being prepared. This may take a few moments.",
        };
    return (
        <div style={{
            backgroundColor: 'var(--vscode-editor-background)',
            height: '100vh',
            width: '100%',
            display: 'flex',
            fontFamily: 'var(--vscode-font-family)'
        }}>
            <Global styles={globalStyles} />
            <LoadingContent>
                <ProgressRing />
                <LoadingTitle>{copy.title}</LoadingTitle>
                <LoadingSubtitle>{copy.subtitle}</LoadingSubtitle>
            </LoadingContent>
        </div>
    );
};

const PullingDependenciesView = () => {
    const { rpcClient } = useRpcContext();
    const [currentModule, setCurrentModule] = React.useState<string>('Compiling project...');

    React.useEffect(() => {
        rpcClient?.onDependencyPullProgress((message: string) => {
            setCurrentModule(message);
        });
    }, [rpcClient]);

    return (
        <div style={{
            backgroundColor: 'var(--vscode-editor-background)',
            height: '100vh',
            width: '100%',
            display: 'flex',
            fontFamily: 'var(--vscode-font-family)'
        }}>
            <Global styles={globalStyles} />
            <LoadingContent>
                <DownloadIcon color="var(--vscode-progressBar-background)" sx={{ width: '36px', height: '36px' }} />
                <LoadingTitle>
                    Pulling Dependencies
                </LoadingTitle>
                <LoadingSubtitle>
                    Please wait while your project dependencies are being pulled.
                </LoadingSubtitle>
                <LoadingText>
                    {currentModule}
                </LoadingText>
            </LoadingContent>
        </div>
    );
};
