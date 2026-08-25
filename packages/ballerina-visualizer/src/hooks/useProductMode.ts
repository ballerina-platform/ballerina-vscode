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
import { type BallerinaRpcClient, useRpcContext } from "@wso2/ballerina-rpc-client";
import { ProductMode, assistantName, shortAssistantName } from "@wso2/ballerina-core";

function seededMode(): ProductMode | undefined {
    const seed = (window as unknown as { productMode?: string }).productMode;
    return seed === ProductMode.AGENT_BUILDER || seed === ProductMode.INTEGRATOR ? seed : undefined;
}

/** One fetch per webview; the setting needs a reload to change. */
let cached: ProductMode | undefined = seededMode();
let inFlight: Promise<ProductMode> | undefined;

/** The mode for callers outside a component, sharing the one fetch with the hook. */
export function fetchProductMode(rpcClient: BallerinaRpcClient): Promise<ProductMode> {
    if (cached !== undefined) {
        return Promise.resolve(cached);
    }
    inFlight ??= rpcClient
        .getCommonRpcClient()
        .agentBuilderModeEnabled()
        .then((isEnabled) => {
            const result = isEnabled ? ProductMode.AGENT_BUILDER : ProductMode.INTEGRATOR;
            cached = result;
            return result;
        })
        .catch(() => {
            inFlight = undefined;
            return ProductMode.INTEGRATOR;
        });
    return inFlight;
}

export function useProductMode(): ProductMode {
    const { rpcClient } = useRpcContext();
    const [mode, setMode] = useState<ProductMode>(cached ?? ProductMode.INTEGRATOR);

    useEffect(() => {
        if (cached !== undefined || !rpcClient) {
            return;
        }
        let active = true;
        fetchProductMode(rpcClient).then((result) => {
            if (active) {
                setMode(result);
            }
        });
        return () => {
            active = false;
        };
    }, [rpcClient]);

    return mode;
}

export function useAssistantName(): string {
    return assistantName(useProductMode());
}

export function useShortAssistantName(): string {
    return shortAssistantName(useProductMode());
}

export interface TracingStatus {
    isTracingEnabled: boolean;
    isToggling: boolean;
    toggleTracing: () => Promise<void>;
}

export function useTracingStatus(rpcClient: BallerinaRpcClient, projectPath: string): TracingStatus {
    const [isTracingEnabled, setIsTracingEnabled] = useState(false);
    const [isToggling, setIsToggling] = useState(false);

    const checkTracingStatus = useCallback(async () => {
        try {
            const status = await rpcClient.getAgentChatRpcClient().getTracingStatus({ projectPath });
            setIsTracingEnabled(status.enabled);
        } catch (error) {
            setIsTracingEnabled(false);
        }
    }, [rpcClient, projectPath]);

    useEffect(() => {
        checkTracingStatus();
    }, [checkTracingStatus]);

    useEffect(() => {
        rpcClient.getAgentChatRpcClient().onTracingStatusChanged(() => {
            checkTracingStatus();
        });
    }, [rpcClient, checkTracingStatus]);

    const toggleTracing = useCallback(async () => {
        if (isToggling) {
            return;
        }
        setIsToggling(true);
        try {
            const command = isTracingEnabled ? "ballerina.disableTracing" : "ballerina.enableTracing";
            await rpcClient.getCommonRpcClient().executeCommand({ commands: [command] });
            await checkTracingStatus();
        } catch (error) {
            console.error("Failed to toggle tracing:", error);
            throw error;
        } finally {
            setIsToggling(false);
        }
    }, [isToggling, isTracingEnabled, rpcClient, checkTracingStatus]);

    return { isTracingEnabled, isToggling, toggleTracing };
}
