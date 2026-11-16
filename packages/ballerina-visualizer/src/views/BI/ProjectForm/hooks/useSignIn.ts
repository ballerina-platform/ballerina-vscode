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

import { useState, useRef, useEffect, useCallback } from "react";
import { WICommandIds } from "@wso2/wso2-platform-core";
import { usePlatformExtContext } from "../../../../providers/platform-ext-ctx-provider";
import { useRpcContext } from "@wso2/ballerina-rpc-client";

/** Auto-cancel timeout: 5 minutes to complete browser login. */
const SIGN_IN_TIMEOUT_MS = 300_000;

/**
 * Manages the sign-in / cancel-sign-in flow.
 *
 * Returns `isSigningIn` state and stable `handleSignIn` / `handleCancelSignIn`
 * callbacks. Cleans up the internal timeout on unmount.
 */
export function useSignIn() {
    const { rpcClient } = useRpcContext();
    const { platformExtState } = usePlatformExtContext();
    const [isSigningIn, setIsSigningIn] = useState(false);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clearSignInTimeout = useCallback(() => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
    }, []);

    useEffect(() => {
        if (!platformExtState?.session) return;
        setIsSigningIn(false);
        clearSignInTimeout();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [platformExtState?.session]);

    // Clean up on unmount.
    useEffect(() => () => clearSignInTimeout(), []);

    const handleSignIn = useCallback(() => {
        clearSignInTimeout();
        setIsSigningIn(true);
        timeoutRef.current = setTimeout(() => {
            setIsSigningIn(false);
            timeoutRef.current = null;
        }, SIGN_IN_TIMEOUT_MS);
        rpcClient.getCommonRpcClient().executeCommand({ commands: [WICommandIds.SignIn] });
    }, [setIsSigningIn, clearSignInTimeout, rpcClient]);

    const handleCancelSignIn = useCallback(() => {
        setIsSigningIn(false);
        clearSignInTimeout();
        rpcClient.getCommonRpcClient().executeCommand({ commands: [WICommandIds.CancelSignIn] });
    }, [setIsSigningIn, clearSignInTimeout, rpcClient]);

    return { isSigningIn, handleSignIn, handleCancelSignIn };
}
