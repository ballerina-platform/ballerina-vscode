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

import { useState, useRef, useEffect } from "react";
import { WICommandIds } from "../shims/platform-core";
import { useVisualizerContext } from "../context/WsClientContext";
import { useCloudContext } from "../providers";

/** Auto-cancel timeout: 5 minutes to complete browser login. */
const SIGN_IN_TIMEOUT_MS = 300_000;

/**
 * Manages the sign-in / cancel-sign-in flow.
 *
 * Returns `isSigningIn` state and stable `handleSignIn` / `handleCancelSignIn`
 * callbacks. Cleans up the internal timeout on unmount.
 */
export function useSignIn() {
    const { wsClient } = useVisualizerContext();
    const { authState } = useCloudContext();
    const [isSigningIn, setIsSigningIn] = useState(false);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clearSignInTimeout = () => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
    };

    // Reset once the user is authenticated.
    useEffect(() => {
        if (!authState?.userInfo) return;
        setIsSigningIn(false);
        clearSignInTimeout();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [authState?.userInfo]);

    // Clean up on unmount.
    useEffect(() => () => clearSignInTimeout(), []);

    const handleSignIn = () => {
        setIsSigningIn(true);
        clearSignInTimeout();
        timeoutRef.current = setTimeout(() => {
            setIsSigningIn(false);
            timeoutRef.current = null;
        }, SIGN_IN_TIMEOUT_MS);
        wsClient
            .runCommand({ command: WICommandIds.SignIn, args: [] })
            .catch((error) => console.error("Sign-in command failed:", error));
    };

    const handleCancelSignIn = () => {
        setIsSigningIn(false);
        clearSignInTimeout();
        wsClient
            .runCommand({ command: WICommandIds.CancelSignIn, args: [] })
            .catch((error) => console.error("Cancel sign-in command failed:", error));
    };

    return { isSigningIn, handleSignIn, handleCancelSignIn };
}
