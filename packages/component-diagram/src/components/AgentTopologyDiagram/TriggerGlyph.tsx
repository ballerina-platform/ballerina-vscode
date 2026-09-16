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
import { Icon } from "@wso2/ui-toolkit";
import { resolveBrandIcon, resolveEntryTypeGlyph } from "@wso2/ballerina-core";
import { ConnectorIcon } from "@wso2/bi-diagram";

// Same order as the focus diagram's usage tile: entry kind, brand glyph, the module's Central icon, then the globe.
export function TriggerGlyph({ glyphType, icon, size = 24 }: { glyphType: string; icon?: string; size?: number }) {
    const sx = { width: size, height: size, fontSize: size, display: "flex", alignItems: "center", justifyContent: "center" };
    const entryGlyph = resolveEntryTypeGlyph(glyphType);
    if (entryGlyph) {
        return <Icon name={entryGlyph.glyph} isCodicon={entryGlyph.isCodicon} sx={sx} iconSx={{ fontSize: size, lineHeight: 1 }} />;
    }
    const brandGlyph = resolveBrandIcon(glyphType);
    if (brandGlyph) {
        return <Icon name={brandGlyph.glyph} sx={sx} iconSx={{ fontSize: size, lineHeight: 1 }} />;
    }
    const globe = <Icon name="bi-globe" sx={sx} iconSx={{ fontSize: size, lineHeight: 1 }} />;
    return icon ? <ConnectorIcon url={icon} style={sx} fallbackIcon={globe} /> : globe;
}
