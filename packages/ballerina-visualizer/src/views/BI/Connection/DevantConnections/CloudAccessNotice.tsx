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

import React, { useEffect, useRef } from "react";
import { VSCodeLink } from "@vscode/webview-ui-toolkit/react";
import type { CloudAccess } from "@wso2/ballerina-core/lib/rpc-types/platform-ext/interfaces";
import { usePlatformExtContext } from "../../../../providers/platform-ext-ctx-provider";
import { IntroText } from "../AddConnectionPopup/styles";

/** Whether WSO2 Integrator is signed in to WSO2 Cloud but this extension may not use the sign-in. */
export function isCloudAccessMissing(access?: CloudAccess): access is "no-access" | "declined" {
    return access === "no-access" || access === "declined";
}

/**
 * Reads the WSO2 Cloud sign-in again once, when a view opens and the state
 * says it cannot be used. VS Code announces nothing when the person allows
 * access from the Accounts menu, so a view would otherwise stay stale. The
 * state may arrive after the view mounts; the read waits for it, and runs
 * only once per view.
 */
export function useCloudAccessRefresh(): void {
    const { platformExtState, platformRpcClient } = usePlatformExtContext();
    const refreshed = useRef(false);
    const isExtInstalled = !!platformExtState?.isExtInstalled;
    const isLoggedIn = !!platformExtState?.isLoggedIn;
    useEffect(() => {
        if (refreshed.current || !isExtInstalled || isLoggedIn) {
            return;
        }
        refreshed.current = true;
        platformRpcClient?.refreshCloudAccess().catch((error: unknown) => {
            console.error("Failed to read the WSO2 Cloud sign-in again:", error);
        });
    }, [isExtInstalled, isLoggedIn]);
}

interface CloudAccessNoticeProps {
    /** What the person gets once access is allowed, ending the sentence. */
    purpose: string;
}

/**
 * Says why WSO2 Cloud is off when the person is signed in to WSO2 Cloud in
 * WSO2 Integrator but VS Code has not let this extension use that sign-in:
 * the views would otherwise look signed out. Renders nothing otherwise.
 */
export function CloudAccessNotice(props: CloudAccessNoticeProps) {
    const { purpose } = props;
    const { platformExtState, loginToDevant } = usePlatformExtContext();
    const access = platformExtState?.cloudAccess;
    if (!platformExtState?.isExtInstalled || !isCloudAccessMissing(access)) {
        return null;
    }
    return (
        <IntroText>
            {access === "declined"
                ? "Ballerina was not allowed to use your WSO2 Cloud sign-in. "
                : "You are signed in to WSO2 Cloud, but Ballerina is not allowed to use that sign-in yet. "}
            <VSCodeLink onClick={loginToDevant}>Allow access</VSCodeLink> {purpose}
        </IntroText>
    );
}
