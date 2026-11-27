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

import type { Environment } from "@wso2/wso2-cloud-client";
import type { ComponentKind, Environment as DevantEnvironment } from "@wso2/wso2-platform-core";

/** A Devant environment that is also a WSO2 Cloud one: the Devant fields the screens read stay. */
export function toEnvironment(env: DevantEnvironment): DevantEnvironment & Environment {
    return { ...env, scaleToZeroEnabled: false };
}

/** Whether `component` is the one `ref` names: by its id, name or handle. */
export function isComponent(component: ComponentKind | undefined, ref: string | undefined): boolean {
    if (!component || !ref) {
        return false;
    }
    const { id, name, handler } = component.metadata ?? ({} as ComponentKind["metadata"]);
    return ref === id || ref === name || ref === handler;
}
