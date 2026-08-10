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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { usePlatformExtContext } from "../../../../providers/platform-ext-ctx-provider";
import { Organization } from "../components/AdvancedConfigurationSection";

export interface DefaultOrgNameState {
    /** Signed-in user's organizations — `undefined` renders the sign-in hint instead of a dropdown. */
    organizations?: Organization[];
    /** True when the org is fixed by the enclosing project (derived from context.yaml). */
    isOrgLocked: boolean;
    /** False until the default org resolves — org validation stays quiet until then. */
    isOrgDataLoaded: boolean;
    /** Call when the user edits the org field, so the resolved default never overwrites it. */
    markOrgTouched: () => void;
}

/**
 * Resolves the default organization for the Add-to-project flow and reports it
 * through `onOrgResolved`.
 *
 * Lives in the flow's owning component rather than in a field component because
 * every route out of the chooser needs the org: a plain "Convert to Project"
 * writes it into the new project's local context file, and the library screen
 * (where the org field itself is rendered, inside Advanced Configurations)
 * mounts only after the chooser is left behind.
 *
 * `onOrgResolved` must be referentially stable — this hook re-runs when the
 * organizations list arrives, and an inline callback would refetch on every
 * render.
 */
export function useDefaultOrgName(
    isInProject: boolean,
    onOrgResolved: (orgName: string) => void
): DefaultOrgNameState {
    const { rpcClient } = useRpcContext();
    const { platformExtState } = usePlatformExtContext();
    const isLoggedIn = !!platformExtState?.isLoggedIn;
    const orgsSource = platformExtState?.userInfo?.organizations;
    const organizations = useMemo(
        () => isLoggedIn ? (orgsSource ?? []) : undefined,
        [isLoggedIn, orgsSource]
    );

    const isOrgTouched = useRef(false);
    const [isOrgLocked, setIsOrgLocked] = useState(false);
    const [isOrgDataLoaded, setIsOrgDataLoaded] = useState(false);

    const markOrgTouched = useCallback(() => {
        isOrgTouched.current = true;
    }, []);

    useEffect(() => {
        if (isOrgTouched.current) return;

        const controller = new AbortController();

        const pickOrg = (rpcOrg: string) => {
            const match = organizations?.find((o: Organization) => o.handle === rpcOrg);
            if (match) return match.handle;
            if (organizations && organizations.length > 0) return organizations[0].handle;
            return rpcOrg;
        };

        (async () => {
            try {
                const { orgName: rpcOrg, isLocked } = await rpcClient.getCommonRpcClient().getDefaultOrgName();
                if (controller.signal.aborted) return;
                if (isOrgTouched.current) {
                    setIsOrgDataLoaded(true);
                    return;
                }

                if (isInProject && isLocked) {
                    setIsOrgLocked(true);
                    setIsOrgDataLoaded(true);
                    onOrgResolved(rpcOrg);
                    return;
                }

                setIsOrgLocked(false);
                setIsOrgDataLoaded(true);
                onOrgResolved(pickOrg(rpcOrg));
            } catch (error) {
                if (controller.signal.aborted) return;
                if (isOrgTouched.current) {
                    setIsOrgDataLoaded(true);
                    return;
                }

                console.error("Failed to fetch default org name:", error);
                setIsOrgLocked(false);
                setIsOrgDataLoaded(true);

                if (organizations && organizations.length > 0) {
                    onOrgResolved(organizations[0].handle);
                }
            }
        })();

        return () => {
            controller.abort();
        };
    }, [isInProject, organizations, onOrgResolved, rpcClient]);

    return { organizations, isOrgLocked, isOrgDataLoaded, markOrgTouched };
}
