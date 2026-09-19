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

import { Icon, ImageWithFallback } from "@wso2/ui-toolkit";
import { ServiceModel, resolveBrandIcon, resolveKindDefaultIcon, toIconDescriptor, toThemedSvgDataUri } from "@wso2/ballerina-core";

/** Uses the custom brand icon first, then themed SVG, URL, and kind default glyph. */
export function getIntegrationIcon(item: ServiceModel) {
    const brand = resolveBrandIcon(item.moduleName);
    if (brand) {
        return <Icon name={brand.glyph} sx={brand.color ? { color: brand.color } : undefined} />;
    }
    const descriptor = toIconDescriptor(item.icon);
    const kindDefault = resolveKindDefaultIcon(item.type);
    const urlIcon = (
        <ImageWithFallback
            imageUrl={descriptor?.url ?? ""}
            fallbackEl={<Icon name={kindDefault.glyph} />}
            size={38}
        />
    );
    const svgDataUri = toThemedSvgDataUri(descriptor);
    return svgDataUri
        ? <ImageWithFallback imageUrl={svgDataUri} fallbackEl={urlIcon} size={38} />
        : urlIcon;
}
