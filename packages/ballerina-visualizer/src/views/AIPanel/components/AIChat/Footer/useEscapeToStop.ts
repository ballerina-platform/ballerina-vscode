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

import { useEffect, useRef } from "react";

// On window so Escape is seen wherever focus is; anything opened on top (the sessions dropdown, a
// popup) gets first refusal via preventDefault, or one Escape would dismiss it AND abort the run.
export function useEscapeToStop(onStop: () => void) {
    // Through a ref, so a caller passing an unmemoized callback does not re-register the
    // window listener on every render.
    const onStopRef = useRef(onStop);
    onStopRef.current = onStop;

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key !== "Escape" || event.defaultPrevented) {
                return;
            }
            event.preventDefault();
            onStopRef.current();
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, []);
}
