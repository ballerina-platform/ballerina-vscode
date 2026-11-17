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

import React from "react";
import { Icon, ImageWithFallback } from "@wso2/ui-toolkit";
import { IconDescriptor, resolveBrandIcon, resolveEntryTypeGlyph, toIconDescriptor, toThemedSvgDataUri } from "@wso2/ballerina-core";
import { A2aIcon, ConnectorIcon } from "@wso2/bi-diagram";

/**
 * The glyph for a topology entry. A themed SVG the connector ships in its own trigger UI metadata
 * wins over the brand registry and the Central package image (e.g. `ai.azure`'s Foundry service,
 * whose package image is the generic Azure logo), as it does in the artifact tree.
 */
export function TriggerGlyph({ glyphType, icon, size = 24 }: { glyphType: string; icon?: IconDescriptor | string; size?: number }) {
    const sx = { width: size, height: size, fontSize: size, display: "flex", alignItems: "center", justifyContent: "center" };
    if (glyphType === "a2a") {
        return <A2aIcon size={size} />;
    }
    const entryGlyph = resolveEntryTypeGlyph(glyphType);
    if (entryGlyph) {
        return <Icon name={entryGlyph.glyph} isCodicon={entryGlyph.isCodicon} sx={sx} iconSx={{ fontSize: size, lineHeight: 1 }} />;
    }
    const descriptor = toIconDescriptor(icon);
    const brandGlyph = resolveBrandIcon(glyphType);
    const globe = <Icon name="bi-globe" sx={sx} iconSx={{ fontSize: size, lineHeight: 1 }} />;
    const fallback = brandGlyph
        ? <Icon name={brandGlyph.glyph} sx={sx} iconSx={{ fontSize: size, lineHeight: 1 }} />
        : descriptor?.url ? <ConnectorIcon url={descriptor.url} style={sx} fallbackIcon={globe} /> : globe;
    const svgDataUri = toThemedSvgDataUri(descriptor);
    // Wrapped, since ImageWithFallback stamps its own size onto the fallback element's style.
    return svgDataUri ? <ImageWithFallback imageUrl={svgDataUri} fallbackEl={<div>{fallback}</div>} size={size} /> : fallback;
}
