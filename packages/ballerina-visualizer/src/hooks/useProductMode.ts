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
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { ProductMode } from "@wso2/ballerina-core";

/** One fetch per webview; the setting needs a reload to change. */
let cached: ProductMode | undefined;
let inFlight: Promise<ProductMode> | undefined;

export function useProductMode(): ProductMode {
    const { rpcClient } = useRpcContext();
    const [mode, setMode] = useState<ProductMode>(cached ?? ProductMode.INTEGRATOR);

    useEffect(() => {
        if (cached !== undefined || !rpcClient) {
            return;
        }
        let active = true;
        inFlight ??= rpcClient
            .getCommonRpcClient()
            .agentBuilderModeEnabled()
            .then((isEnabled) => {
                const result = isEnabled ? ProductMode.AGENT_BUILDER : ProductMode.INTEGRATOR;
                cached = result;
                return result;
            })
            .catch(() => {
                cached = ProductMode.INTEGRATOR;
                return ProductMode.INTEGRATOR;
            });
        inFlight.then((result) => {
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
