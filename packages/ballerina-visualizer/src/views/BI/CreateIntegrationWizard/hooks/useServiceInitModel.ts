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

import { useEffect, useRef, useState } from "react";
import { ServiceInitModel } from "@wso2/ballerina-core";
import { BiWsClient } from "../../wsManager/WsClient";

/** Mirrors ServiceCreationView's package-pulling status machine. */
export enum PullingStatus {
    FETCHING = "fetching",
    PULLING = "pulling",
    ERROR = "error",
}

interface UseServiceInitModelOptions {
    wsClient: BiWsClient;
    /** The silently scaffolded package root the model is resolved against. */
    projectRoot: string | undefined;
    orgName: string;
    packageName: string;
    moduleName: string;
    /** A model cached by the wizard root from an earlier visit to the Configure step —
     *  used instead of refetching (and re-pulling the package). */
    cachedModel?: ServiceInitModel | null;
}

/**
 * Fetches the service-init model for the selected artifact over the WS bridge,
 * with ServiceCreationView's 3-second race: a fast response loads the form
 * immediately; a slow one flips to a "pulling the package…" status first.
 */
export function useServiceInitModel({ wsClient, projectRoot, orgName, packageName, moduleName, cachedModel }: UseServiceInitModelOptions) {
    const [model, setModel] = useState<ServiceInitModel | null>(cachedModel ?? null);
    const [pullingStatus, setPullingStatus] = useState<PullingStatus | undefined>(
        cachedModel ? undefined : PullingStatus.FETCHING
    );
    // Re-entering the Configure step with the same selection must reuse the model rather than
    // refetch (and re-pull the package), so key the fetch by module identity.
    //
    // NOTE: the reused model carries only the user's CHOICE selections — `ServiceConfigureForm`
    // writes those back via `updateChoiceInModel`, but every other field's value lives in
    // `ArtifactForm`'s internal state and reaches the model only at submit
    // (`applyFormValuesToModel`). Since stepping back unmounts the form, non-choice values are
    // lost on re-entry and the fields fall back to their defaults.
    const fetchedForRef = useRef<string | null>(
        cachedModel ? `${orgName}/${packageName}/${moduleName}` : null
    );

    useEffect(() => {
        if (!projectRoot) {
            return;
        }
        const fetchKey = `${orgName}/${packageName}/${moduleName}`;
        if (fetchedForRef.current === fetchKey) {
            return;
        }
        fetchedForRef.current = fetchKey;

        let cancelled = false;
        const fetchModel = async () => {
            setModel(null);
            setPullingStatus(PullingStatus.FETCHING);

            const promise = wsClient.getServiceInitModel({
                filePath: "",
                orgName,
                pkgName: packageName,
                moduleName,
                listenerName: "",
                projectPath: projectRoot,
            });

            // Wait up to 3 seconds for a fast response before showing the
            // "pulling the package" status (same UX as ServiceCreationView).
            const timer = setTimeout(() => {
                if (!cancelled) {
                    setPullingStatus(PullingStatus.PULLING);
                }
            }, 3000);

            try {
                const res = await promise;
                clearTimeout(timer);
                if (cancelled) {
                    return;
                }
                if (res?.serviceInitModel) {
                    setModel(res.serviceInitModel);
                    setPullingStatus(undefined);
                } else {
                    setPullingStatus(PullingStatus.ERROR);
                }
            } catch (error) {
                clearTimeout(timer);
                console.error(">>> Error fetching service init model", error);
                if (!cancelled) {
                    setPullingStatus(PullingStatus.ERROR);
                }
            }
        };

        fetchModel();
        return () => {
            cancelled = true;
        };
    }, [wsClient, projectRoot, orgName, packageName, moduleName]);

    return { model, pullingStatus };
}
