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

import { useCallback, useEffect, useState } from "react";
import { type BallerinaRpcClient } from "@wso2/ballerina-rpc-client";
import { BuildMode, SCOPE } from "@wso2/ballerina-core";
import { IOpenInConsoleCmdParams, WICommandIds } from "@wso2/wso2-platform-core";
import { usePlatformExtContext } from "../providers/platform-ext-ctx-provider";

export interface DeploymentControlOptions {
    isICPSupported?: boolean;
    deployableIntegrationTypes: SCOPE[];
    // Threaded in from the caller's own useTracingStatus() call rather than fetched here — the
    // backend's tracingStatusChanged notification only supports one live subscriber per webview,
    // so a page that also has the tracing toggle button must own the single subscription.
    ampTracingEnabled: boolean;
    setAmpTracingEnabled: (enabled: boolean) => Promise<void>;
}

export interface DeploymentControlState {
    icpEnabled: boolean;
    handleICP: (checked: boolean) => void;
    workflowMgmtEnabled: boolean;
    handleWorkflowManagement: (checked: boolean) => void;
    ampTracingEnabled: boolean;
    handleAmpTracing: (checked: boolean) => void;
    handleDeploy: () => Promise<void>;
    handleDockerBuild: () => void;
    handleJarBuild: () => void;
    goToDevant: () => void;
}

/** ICP and workflow-management status, plus the deploy/build actions the Deployment drawer offers. */
export function useDeploymentControl(
    rpcClient: BallerinaRpcClient,
    projectPath: string,
    { isICPSupported, deployableIntegrationTypes, ampTracingEnabled, setAmpTracingEnabled }: DeploymentControlOptions
): DeploymentControlState {
    const { platformExtState } = usePlatformExtContext();
    const [icpEnabled, setIcpEnabled] = useState(false);
    const [workflowMgmtEnabled, setWorkflowMgmtEnabled] = useState(false);

    const fetchStatus = useCallback(() => {
        if (isICPSupported) {
            rpcClient.getICPRpcClient().isIcpEnabled({ projectPath: "" }).then((res) => {
                setIcpEnabled(res.enabled);
            });
        }
        rpcClient.getWorkflowManagementRpcClient().isWorkflowManagementEnabled({ projectPath }).then((res) => {
            setWorkflowMgmtEnabled(res.enabled);
        });
    }, [rpcClient, projectPath, isICPSupported]);

    useEffect(() => {
        fetchStatus();
    }, [fetchStatus]);

    useEffect(() => {
        return rpcClient.onProjectContentUpdated((state: boolean) => {
            if (state) {
                fetchStatus();
            }
        });
    }, [rpcClient, fetchStatus]);

    const handleICP = useCallback((checked: boolean) => {
        // Optimistic update so the checkbox doesn't flicker while the RPC is in flight.
        setIcpEnabled(checked);
        if (checked) {
            rpcClient.getICPRpcClient().addICP({ projectPath: "" })
                .then(() => setIcpEnabled(true))
                .catch(() => setIcpEnabled(false));
        } else {
            rpcClient.getICPRpcClient().disableICP({ projectPath: "" })
                .then(() => setIcpEnabled(false))
                .catch(() => setIcpEnabled(true));
        }
    }, [rpcClient]);

    const handleWorkflowManagement = useCallback((checked: boolean) => {
        setWorkflowMgmtEnabled(checked);
        if (checked) {
            rpcClient.getWorkflowManagementRpcClient().addWorkflowManagement({ projectPath })
                // The RPC reports failures via errorMsg (it resolves rather than rejects), so roll
                // back to the pre-toggle state instead of trusting enabled on a reported failure.
                .then((res) => setWorkflowMgmtEnabled(res.errorMsg ? false : (res.enabled ?? true)))
                .catch(() => setWorkflowMgmtEnabled(false));
        } else {
            rpcClient.getWorkflowManagementRpcClient().disableWorkflowManagement({ projectPath })
                .then((res) => setWorkflowMgmtEnabled(res.errorMsg ? true : (res.enabled ?? false)))
                .catch(() => setWorkflowMgmtEnabled(true));
        }
    }, [rpcClient, projectPath]);

    const handleAmpTracing = useCallback((checked: boolean) => {
        setAmpTracingEnabled(checked);
    }, [setAmpTracingEnabled]);

    const handleDeploy = useCallback(async () => {
        await rpcClient.getBIDiagramRpcClient().deployProject({ integrationTypes: deployableIntegrationTypes });
    }, [rpcClient, deployableIntegrationTypes]);

    const handleDockerBuild = useCallback(() => {
        rpcClient.getBIDiagramRpcClient().buildProject(BuildMode.DOCKER);
    }, [rpcClient]);

    const handleJarBuild = useCallback(() => {
        rpcClient.getBIDiagramRpcClient().buildProject(BuildMode.JAR);
    }, [rpcClient]);

    const goToDevant = useCallback(() => {
        rpcClient.getCommonRpcClient().executeCommand({
            commands: [
                WICommandIds.OpenInConsole,
                {
                    componentFsPath: projectPath,
                    component: platformExtState?.selectedComponent,
                    newComponentParams: { buildPackLang: "ballerina" },
                } as IOpenInConsoleCmdParams,
            ],
        });
    }, [rpcClient, projectPath, platformExtState?.selectedComponent]);

    return {
        icpEnabled,
        handleICP,
        workflowMgmtEnabled,
        handleWorkflowManagement,
        ampTracingEnabled,
        handleAmpTracing,
        handleDeploy,
        handleDockerBuild,
        handleJarBuild,
        goToDevant,
    };
}
