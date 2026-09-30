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
import { type BallerinaRpcClient, useRpcContext } from "@wso2/ballerina-rpc-client";
import { ProductMode, assistantName, assistantTagline, seededProductMode } from "@wso2/ballerina-core";

/** Answer for a webview that loaded without the seed; the mode can't change without a reload. */
let cached: ProductMode | undefined;
let inFlight: Promise<ProductMode> | undefined;

function askHost(rpcClient: BallerinaRpcClient): Promise<ProductMode> {
    // Called inside the chain so a missing client or method rejects instead of throwing at the
    // call site, where nothing would catch it.
    inFlight ??= Promise.resolve()
        .then(() => rpcClient.getAiPanelRpcClient().isPlatformExtensionAvailable())
        .then((isAvailable) => {
            cached = isAvailable ? ProductMode.INTEGRATOR : ProductMode.BALLERINA;
            return cached;
        })
        .catch(() => {
            inFlight = undefined;
            return ProductMode.BALLERINA;
        });
    return inFlight;
}

export function useProductMode(): ProductMode {
    const { rpcClient } = useRpcContext();
    const resolved = seededProductMode() ?? cached;
    const [mode, setMode] = useState<ProductMode>(resolved ?? ProductMode.BALLERINA);

    useEffect(() => {
        if (resolved !== undefined || !rpcClient) {
            return;
        }
        let active = true;
        askHost(rpcClient).then((result) => {
            if (active) {
                setMode(result);
            }
        });
        return () => {
            active = false;
        };
    }, [resolved, rpcClient]);

    return resolved ?? mode;
}

export function useAssistantName(): string {
    return assistantName(useProductMode());
}

export function useAssistantTagline(): string {
    return assistantTagline(useProductMode());
}
