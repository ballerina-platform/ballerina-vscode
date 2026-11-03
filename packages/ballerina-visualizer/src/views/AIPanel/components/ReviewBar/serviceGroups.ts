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

import { NodeKindEnum, ObjectFunctionMetadata, SemanticDiff } from "@wso2/ballerina-core";

export interface ServiceGroupInfo {
    key: string;
    /** e.g. "http"; absent when the LS couldn't tell or is too old to send it. */
    serviceType?: string;
    displayPath: string;
    /** e.g. "orderListener"; absent for an inline listener or an older LS. */
    listeners?: string;
    /** Set by {@link qualifyServiceGroups} when the header alone is ambiguous. */
    qualifier?: string;
}

/**
 * The service a diff belongs to, or undefined for anything else. Class methods are OBJECT_FUNCTION
 * diffs too, but only service members carry a servicePath.
 */
export function getServiceGroupInfo(diff: SemanticDiff): ServiceGroupInfo | undefined {
    if (diff.nodeKind !== NodeKindEnum.OBJECT_FUNCTION) {
        return undefined;
    }
    const m = diff.metadata as ObjectFunctionMetadata | undefined;
    if (m?.servicePath === undefined) {
        return undefined;
    }
    const serviceType = m.serviceType || undefined;
    const listeners = m.serviceListeners || undefined;
    // Without a type or a listener name, "/" keeps the header from being a bare "service"
    const displayPath = m.servicePath || (serviceType || listeners ? "" : "/");
    // An older LS sends no serviceId
    const key = m.serviceId || `${serviceType ?? ""} ${m.servicePath}`;
    return { key, serviceType, displayPath, listeners };
}

export function getServiceGroupTitle(service: ServiceGroupInfo): string {
    return [service.serviceType ? `${service.serviceType} service` : "service", service.displayPath, service.qualifier]
        .filter(Boolean)
        .join(" ");
}

/**
 * Qualifies headers that are shared, or a bare "service": first with the listeners, then with a number.
 */
export function qualifyServiceGroups(services: ServiceGroupInfo[]): void {
    const shared = titlesSharedBy(services);
    for (const service of services) {
        const ambiguous = shared.has(getServiceGroupTitle(service)) || (!service.serviceType && !service.displayPath);
        if (ambiguous && service.listeners) {
            service.qualifier = `on ${service.listeners}`;
        }
    }
    const stillShared = titlesSharedBy(services);
    const seen = new Map<string, number>();
    for (const service of services) {
        const title = getServiceGroupTitle(service);
        if (stillShared.has(title)) {
            const n = (seen.get(title) ?? 0) + 1;
            seen.set(title, n);
            service.qualifier = [service.qualifier, `(${n})`].filter(Boolean).join(" ");
        }
    }
}

function titlesSharedBy(services: ServiceGroupInfo[]): Set<string> {
    const counts = new Map<string, number>();
    for (const service of services) {
        const title = getServiceGroupTitle(service);
        counts.set(title, (counts.get(title) ?? 0) + 1);
    }
    return new Set([...counts].filter(([, count]) => count > 1).map(([title]) => title));
}
