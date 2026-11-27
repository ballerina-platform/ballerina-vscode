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

import type { PlatformExtAPI } from "@wso2/ballerina-core";
import { DEVANT_PLATFORM } from "@wso2/ballerina-core/lib/rpc-types/platform-ext/interfaces";
import { getCloudPlatform, getPlatformGate } from "../../utils/cloud-auth";
import { DevantPlatformExtRpcManager } from "./devant/rpc-manager";
import { PlatformExtRpcManager } from "./rpc-manager";

/** What either platform's manager answers: the screens' calls, and the debugger's and the diagram's. */
export type PlatformExtManager = Pick<
    PlatformExtRpcManager,
    keyof PlatformExtAPI | "initStateSubscription" | "deleteBiDevantConnection" | "setupDevantProxyForDebugging"
>;

let choreoCloud: PlatformExtRpcManager | undefined;
let devant: DevantPlatformExtRpcManager | undefined;

/** The manager of the platform WSO2 Integrator works against now; read on every call, since it can switch live. */
export function platformExtManager(): PlatformExtManager {
    if (getCloudPlatform() === DEVANT_PLATFORM) {
        devant ??= new DevantPlatformExtRpcManager();
        return devant;
    }
    choreoCloud ??= new PlatformExtRpcManager();
    return choreoCloud;
}

/**
 * The manager, once WSO2 Integrator has been reached. Until then the platform reads as WSO2 Cloud, so a call that
 * can come before any screen has asked (a debug launch, a delete from the diagram) waits for it.
 */
export async function platformExtManagerReady(): Promise<PlatformExtManager> {
    await getPlatformGate().catch((): undefined => undefined);
    return platformExtManager();
}

/**
 * Both managers, for what each follows on its own: each acts only while its platform is the one in use. The
 * exception is the WSO2 Cloud manager's file watcher, which keeps `hasLocalChanges` for both.
 */
export function allPlatformExtManagers(): PlatformExtManager[] {
    choreoCloud ??= new PlatformExtRpcManager();
    devant ??= new DevantPlatformExtRpcManager();
    return [choreoCloud, devant];
}
