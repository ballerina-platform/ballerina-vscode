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

import React, { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import styled from "@emotion/styled";
import { EVENT_TYPE, MACHINE_VIEW, WorkflowRuntimeStatusResponse } from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { Button, CheckBox, Codicon, Tooltip } from "@wso2/ui-toolkit";

const Section = styled.div`
    display: flex;
    flex-direction: column;
    gap: 10px;
`;

const RuntimeActions = styled.div`
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
`;

// A div: the tooltip renders block elements, which a <p> may not hold.
const RuntimeStatusLine = styled.div`
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
`;

// Short lines on the panel; the explanations live in the tooltips.
export const WORKFLOW_RUNTIME_EXPLAINED =
    "A workflow runtime stores each run's progress, so runs survive restarts and can wait for people and timers. Its URL is set in the Configuration view under ballerina/workflow.";
export const NO_RUNTIME_TITLE = "No workflow runtime";
export const RUNTIME_CHECK_FAILED = "Could not check for a workflow runtime";
export const SWITCH_FAILED = "Could not switch the workflow runtime";
// A TCP connect is all the probe does, so the line claims no more than reachability.
export const RUNTIME_DETECTED = "Workflow runtime reachable";
export const IN_MEMORY_RUNTIME = "Using the in-memory runtime (testing only)";
export const MANAGED_RUNTIME = "Using a managed workflow runtime";
export const USE_IN_MEMORY_LABEL = "Use in-memory runtime";
export const USE_IN_MEMORY_TOOLTIP =
    "Testing only: runs are lost when the integration stops. Sets the workflow mode to IN_MEMORY.";
export const USE_LOCAL_LABEL = "Use local runtime";
export const USE_LOCAL_TOOLTIP =
    "Sets the workflow mode back to LOCAL: a workflow server at the configured url.";
export const CONFIGURE_RUNTIME_LABEL = "Configure runtime";
export const CONFIGURE_RUNTIME_TOOLTIP =
    "Opens the Configuration view. Set mode and url under ballerina/workflow to use a running workflow server; today that is a Temporal server.";

export interface WorkflowRuntime {
    // undefined while the first runtime check is in flight.
    status: WorkflowRuntimeStatusResponse | undefined;
    checkFailed: boolean;
    switching: boolean;
    switchError?: string;
    recheck: () => void;
    switchToInMemory: () => void;
    switchToLocal: () => void;
    configure: () => void;
}

/** Probes the workflow runtime while `active`, again on every source change and whenever the window regains focus. */
export function useWorkflowRuntime(projectPath: string, active: boolean): WorkflowRuntime {
    const { rpcClient } = useRpcContext();
    const [status, setStatus] = useState<WorkflowRuntimeStatusResponse>();
    const [checkFailed, setCheckFailed] = useState(false);
    const [switchError, setSwitchError] = useState<string>();
    const [switching, setSwitching] = useState(false);

    // A late answer from an older check is dropped. The last status stays on screen while a re-check
    // runs: every source edit re-runs the check, and a blank line would move the section under the cursor.
    const checkRef = useRef(0);
    const recheck = useCallback(() => {
        const check = ++checkRef.current;
        setCheckFailed(false);
        setSwitchError(undefined);
        rpcClient.getWorkflowManagementRpcClient().getWorkflowRuntimeStatus({ projectPath })
            .then((res) => {
                if (check === checkRef.current) {
                    setStatus(res);
                }
            })
            .catch((): void => {
                if (check === checkRef.current) {
                    setCheckFailed(true);
                }
            });
    }, [rpcClient, projectPath]);

    // Starting a server changes no file, so coming back to the window is the other moment to look again.
    useEffect(() => {
        if (!active) {
            return;
        }
        recheck();
        window.addEventListener("focus", recheck);
        const stopListening = rpcClient.onProjectContentUpdated((updated: boolean) => {
            if (updated) {
                recheck();
            }
        });
        return () => {
            window.removeEventListener("focus", recheck);
            stopListening();
        };
    }, [active, recheck, rpcClient]);

    const switchRuntime = (request: Promise<WorkflowRuntimeStatusResponse>) => {
        setSwitching(true);
        setSwitchError(undefined);
        const check = ++checkRef.current;
        request
            .then((res) => {
                if (check === checkRef.current) {
                    setStatus(res);
                    // The extension has already shown the full message as a warning.
                    setSwitchError(res.errorMsg ? `${SWITCH_FAILED}.` : undefined);
                }
            })
            .catch((): void => {
                if (check === checkRef.current) {
                    setSwitchError(`${SWITCH_FAILED}.`);
                }
            })
            .finally(() => setSwitching(false));
    };

    return {
        status,
        checkFailed,
        switching,
        switchError,
        recheck,
        switchToInMemory: () =>
            switchRuntime(rpcClient.getWorkflowManagementRpcClient().useInMemoryWorkflowRuntime({ projectPath })),
        switchToLocal: () =>
            switchRuntime(rpcClient.getWorkflowManagementRpcClient().useLocalWorkflowRuntime({ projectPath })),
        configure: () =>
            rpcClient.getVisualizerRpcClient().openView({
                type: EVENT_TYPE.OPEN_VIEW,
                location: { view: MACHINE_VIEW.ViewConfigVariables },
            }),
    };
}

function InfoTip({ content }: { content: string }) {
    return (
        <Tooltip content={content} position="bottom-end" sx={{ whiteSpace: "normal", maxWidth: 260 }}>
            <Codicon name="info" sx={{ color: "var(--vscode-descriptionForeground)", cursor: "help" }} />
        </Tooltip>
    );
}

function RuntimeStatus({ icon, color, text, tooltip, children }: {
    icon: string; color?: string; text: string; tooltip: string; children?: ReactNode;
}) {
    return (
        <RuntimeStatusLine>
            <Codicon name={icon} sx={color ? { color } : undefined} />
            <span>{text}</span>
            <InfoTip content={tooltip} />
            {children}
        </RuntimeStatusLine>
    );
}

function SwitchError({ message }: { message?: string }) {
    return message ? (
        <RuntimeStatusLine>
            <Codicon name="error" sx={{ color: "var(--vscode-errorForeground)" }} />
            <span>{message}</span>
        </RuntimeStatusLine>
    ) : null;
}

function RuntimeStatusView({ runtime }: { runtime: WorkflowRuntime }) {
    const { status, checkFailed, switching, switchError } = runtime;
    const recheck = (
        <Button appearance="icon" onClick={runtime.recheck} tooltip="Check again" data-testid="workflow-runtime-recheck">
            <Codicon name="refresh" />
        </Button>
    );
    const configure = (
        <Button appearance="secondary" onClick={runtime.configure} tooltip={CONFIGURE_RUNTIME_TOOLTIP}>
            {CONFIGURE_RUNTIME_LABEL}
        </Button>
    );

    if (!status && checkFailed) {
        return (
            <RuntimeStatusLine>
                <Codicon name="warning" sx={{ color: "var(--vscode-editorWarning-foreground)" }} />
                <span>{RUNTIME_CHECK_FAILED}.</span>
                {recheck}
            </RuntimeStatusLine>
        );
    }
    if (!status) {
        // Only before the first answer: a re-check keeps the last status on screen.
        return <RuntimeStatusLine>Checking for a workflow runtime...</RuntimeStatusLine>;
    }
    if (status.mode === "IN_MEMORY") {
        return (
            <>
                <RuntimeStatus icon="beaker" text={`${IN_MEMORY_RUNTIME}.`}
                    tooltip="Runs are lost when the integration stops. Switch to a workflow server before deploying." />
                <RuntimeActions data-testid="workflow-runtime-actions">
                    <Button appearance="secondary" onClick={runtime.switchToLocal} disabled={switching}
                        tooltip={USE_LOCAL_TOOLTIP}>
                        {USE_LOCAL_LABEL}
                    </Button>
                    {configure}
                </RuntimeActions>
                <SwitchError message={switchError} />
            </>
        );
    }
    if (status.mode === "CLOUD") {
        return <RuntimeStatus icon="cloud" text={`${MANAGED_RUNTIME} at ${status.url}.`} tooltip={WORKFLOW_RUNTIME_EXPLAINED} />;
    }
    if (status.reachable) {
        return (
            <RuntimeStatus icon="pass" color="var(--vscode-testing-iconPassed)"
                text={`${RUNTIME_DETECTED} at ${status.url}.`} tooltip={WORKFLOW_RUNTIME_EXPLAINED} />
        );
    }
    return (
        <>
            <RuntimeStatus icon="warning" color="var(--vscode-editorWarning-foreground)"
                text={`${NO_RUNTIME_TITLE} at ${status.url}.`}
                tooltip={`${WORKFLOW_RUNTIME_EXPLAINED} Nothing is listening there.`}>
                {recheck}
            </RuntimeStatus>
            <RuntimeActions data-testid="workflow-runtime-actions">
                {/* A self-hosted server that is briefly down is a deliberate choice, not one to overwrite. */}
                {status.mode === "LOCAL" && (
                    <Button appearance="secondary" onClick={runtime.switchToInMemory} disabled={switching}
                        tooltip={USE_IN_MEMORY_TOOLTIP}>
                        {USE_IN_MEMORY_LABEL}
                    </Button>
                )}
                {configure}
            </RuntimeActions>
            <SwitchError message={switchError} />
        </>
    );
}

interface WorkflowSectionProps {
    runtime: WorkflowRuntime;
    noun: string;
    managementEnabled: boolean;
    handleWorkflowManagement: (checked: boolean) => void;
}

export function WorkflowSection({ runtime, noun, managementEnabled, handleWorkflowManagement }: WorkflowSectionProps) {
    return (
        <Section data-testid="workflow-section">
            <RuntimeStatusView runtime={runtime} />
            <p>Manage workflow instances, human tasks and reviews in this {noun} through a REST API.</p>
            <CheckBox checked={managementEnabled} onChange={handleWorkflowManagement} label="Enable Workflow Management REST API" />
        </Section>
    );
}
