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

/**
 * A brand glyph override for an entry-point module: the `@wso2/ui-toolkit` `Icon` name to render,
 * plus the brand's tint color (omitted for glyphs that already read fine in the theme's default
 * icon color).
 */
export interface BrandIcon {
    glyph: string;
    color?: string;
}

/**
 * Compatibility glyphs for legacy trigger/service responses that predate L2 artifact metadata.
 * L2-defined modules carry their own theme-aware SVGs and must not be added here. Keyed by whatever
 * module/type identifier the legacy caller has on hand.
 *
 * This registry is intentionally limited to modules without bundled L2 SVG metadata.
 */
export const BRAND_ICON_REGISTRY: Record<string, BrandIcon> = {
    tcp: { glyph: "bi-tcp" },
    grpc: { glyph: "bi-grpc" },
    graphql: { glyph: "bi-graphql" },
    nats: { glyph: "bi-nats" },
    "java.jms": { glyph: "bi-java" },
};

/** Looks up the brand glyph override for a module/type identifier; `undefined` when there is none. */
export function resolveBrandIcon(type: string | undefined | null): BrandIcon | undefined {
    if (!type) {
        return undefined;
    }
    return BRAND_ICON_REGISTRY[type];
}

/**
 * The last-resort icon for an entry-point kind (the `ServiceModel.type` bucket — `event` / `file` /
 * `http` / `graphql` / `ai`), shown when a module has neither a {@link BRAND_ICON_REGISTRY} entry nor
 * a loadable Ballerina Central icon. Guarantees every card/node renders *something* instead of a
 * broken image.
 */
export const KIND_DEFAULT_ICON: Record<string, BrandIcon> = {
    event: { glyph: "event-round" },
    file: { glyph: "bi-file" },
    http: { glyph: "bi-globe" },
    graphql: { glyph: "bi-globe" },
    ai: { glyph: "bi-ai-agent" },
};

/** Looks up the kind-default icon; falls back to the generic API glyph for an unknown kind. */
export function resolveKindDefaultIcon(kind: string | undefined | null): BrandIcon {
    return (kind && KIND_DEFAULT_ICON[kind]) || KIND_DEFAULT_ICON.http;
}
