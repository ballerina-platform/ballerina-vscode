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

import { NodeKindEnum, SemanticDiff } from "@wso2/ballerina-core";

export interface ServiceGroupInfo {
    key: string;
    /** e.g. "http"; absent when the LS couldn't tell or is too old to send it. */
    serviceType?: string;
    displayPath: string;
}

/**
 * The service a diff belongs to, or undefined for anything else. Class methods are OBJECT_FUNCTION
 * diffs too, but only service members carry a servicePath.
 */
export function getServiceGroupInfo(diff: SemanticDiff): ServiceGroupInfo | undefined {
    if (diff.nodeKind !== NodeKindEnum.OBJECT_FUNCTION) {
        return undefined;
    }
    const m = diff.metadata as { servicePath?: string; serviceType?: string } | undefined;
    if (m?.servicePath === undefined) {
        return undefined;
    }
    const serviceType = m.serviceType || undefined;
    // Untyped, "/" keeps the header from being just "service"; typed, a path-less one reads "solace service".
    const displayPath = m.servicePath || (serviceType ? "" : "/");
    return { key: `${serviceType ?? ""} ${m.servicePath}`, serviceType, displayPath };
}
