/*
 *  Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com)
 *
 *  WSO2 LLC. licenses this file to you under the Apache License,
 *  Version 2.0 (the "License"); you may not use this file except
 *  in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing,
 *  software distributed under the License is distributed on an
 *  "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 *  KIND, either express or implied.  See the License for the
 *  specific language governing permissions and limitations
 *  under the License.
 */

import React, { useEffect, useState } from "react";
import { Icon, ImageWithFallback } from "@wso2/ui-toolkit";
import { IconDescriptor, resolveKindDefaultIcon, toIconDescriptor } from "@wso2/ballerina-core";

interface ArtifactIconProps {
    icon?: IconDescriptor | string;
    kind?: string;
    size?: number;
}

function isLightTheme(): boolean {
    return typeof document !== "undefined" && (document.body.classList.contains("vscode-light")
        || document.body.classList.contains("vscode-high-contrast-light"));
}

function svgDataUri(svg: string, color?: string): string {
    // L2 icons are expected to be monochrome. Older bundled SVGs use explicit
    // black/white fills instead of `currentColor`, so normalize those values
    // before applying the metadata color as well.
    const value = color ? svg.replace(/((?:fill|stroke)\s*=\s*["'])(currentColor|black|white|#000(?:000)?|#fff(?:fff)?)(["'])/gi,
        `$1${color}$3`) : svg;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(value)}`;
}

/** Renders L2-owned SVG text, then the Central URL, then the generic kind icon. */
export function ArtifactIcon({ icon, kind, size = 38 }: ArtifactIconProps) {
    const descriptor = toIconDescriptor(icon);
    const [light, setLight] = useState(isLightTheme);

    useEffect(() => {
        if (typeof document === "undefined") {
            return;
        }
        const observer = new MutationObserver(() => setLight(isLightTheme()));
        observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
        return () => observer.disconnect();
    }, []);

    const svg = light ? descriptor?.light : descriptor?.dark;
    const fallback = resolveKindDefaultIcon(descriptor?.kind ?? kind);
    if (svg) {
        return <img src={svgDataUri(svg, descriptor?.color)} width={size} height={size} alt="" />;
    }
    return (
        <ImageWithFallback
            imageUrl={descriptor?.url ?? ""}
            fallbackEl={<Icon name={fallback.glyph} />}
            size={size}
        />
    );
}
