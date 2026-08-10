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

/**
 * Tracks the rendered width of an element via ResizeObserver.
 *
 * Returns a ref to attach to the element and a boolean that is true while the
 * element is narrower than `threshold`. Used by the Integration Type step to
 * swap its category rail for a horizontal chip row in narrow panels.
 *
 * @param threshold Width (px) below which `isNarrow` is true.
 */
export function useContainerWidth<T extends HTMLElement = HTMLDivElement>(threshold: number) {
    const ref = useRef<T>(null);
    const [isNarrow, setIsNarrow] = useState(false);

    useEffect(() => {
        const element = ref.current;
        if (!element || typeof ResizeObserver === "undefined") {
            return;
        }

        const observer = new ResizeObserver((entries) => {
            const width = entries[0]?.contentRect.width ?? element.clientWidth;
            setIsNarrow(width < threshold);
        });

        observer.observe(element);
        return () => observer.disconnect();
    }, [threshold]);

    return { ref, isNarrow };
}
