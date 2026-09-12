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

// Icon-selection rules extracted from `bi.tsx` for unit testability; re-exported there.

import * as React from "react";
import { Category as PanelCategory, Node as PanelNode } from "@wso2/ballerina-side-panel";
import { NodeIcon, ConnectorIcon, AIModelIcon } from "@wso2/bi-diagram";
import { getAIModuleIcon } from "@wso2/ui-toolkit";

export type IconFactory = (codedata: any, iconUrl?: string) => React.ReactElement;

// Central icon URLs are `…/{org}_{package}_{version}.png`; the middle segment is the package key.
export function getPackageKeyFromIconUrl(iconUrl?: string): string | undefined {
    const fileName = iconUrl?.split("/").pop();
    const parts = fileName?.split("_");
    return parts && parts.length >= 3 ? parts[1] : undefined;
}

// Prefer the embedded provider SVG so monochrome logos stay visible in dark mode.
export function resolveChildBadgeIcon(codedata: any, iconUrl?: string): React.ReactElement {
    const embedded =
        getAIModuleIcon(getPackageKeyFromIconUrl(iconUrl), 14) ?? getAIModuleIcon(codedata?.object, 14);
    if (embedded) {
        return embedded;
    }
    // Fall back to the node glyph: the URL is synthesised from package coordinates and 404s for unpublished packages.
    return (
        <ConnectorIcon
            url={iconUrl}
            style={{ width: "14px", height: "14px", fontSize: "14px" }}
            codedata={codedata}
            fallbackIcon={<NodeIcon type={codedata?.node} size={14} />}
        />
    );
}

// Class/provider badges are Model/Embedding Provider-only; other grouped lists use the plain node icon.
export function shouldUseClassIcon(
    hasGroupIconFactory: boolean,
    childIconUrl: string | undefined,
    packageIconUrl: string | undefined
): boolean {
    return !hasGroupIconFactory && Boolean(childIconUrl) && childIconUrl !== packageIconUrl;
}

export function dataLoaderIconFactory(codedata: any, iconUrl?: string): React.ReactElement {
    if (iconUrl && codedata?.module !== "ai" && codedata?.module !== "ai.devant") {
        return <img src={iconUrl} style={{ width: 24, height: 24 }} />;
    }
    return <NodeIcon type="DATA_LOADER" size={24} />;
}

export function chunkerIconFactory(codedata: any, iconUrl?: string): React.ReactElement {
    if (iconUrl && codedata?.module !== "ai" && codedata?.module !== "ai.devant") {
        return <img src={iconUrl} style={{ width: 24, height: 24 }} />;
    }
    return <NodeIcon type="CHUNKER" size={24} />;
}

export function vectorStoreIconFactory(codedata: any, iconUrl?: string): React.ReactElement {
    if (codedata?.module === "ai") {
        return <NodeIcon type="VECTOR_STORE" size={24} />;
    }
    return <AIModelIcon type={codedata?.module} codedata={codedata} iconUrl={iconUrl} />;
}

// Keeps the package icon on the group header and gives each child its own @display icon.
export function applyGroupedChildIcons(group: PanelCategory, rawItems: any[], groupIconFactory?: IconFactory): void {
    const rawGroup = rawItems?.find(
        (r) => r && !("codedata" in r) && r.metadata?.label === group.title
    );
    const packageIconUrl: string | undefined = rawGroup?.metadata?.icon;
    const firstChild = group.items?.at(0) as PanelNode | undefined;

    if (packageIconUrl) {
        group.icon = (
            <ConnectorIcon url={packageIconUrl} style={{ width: "20px", height: "20px", fontSize: "20px" }} />
        );
    } else if (groupIconFactory) {
        // No package icon, so the group falls back to its first child's — which needs the caller's fallback too.
        group.icon = groupIconFactory(firstChild?.metadata?.codedata, firstChild?.metadata?.metadata?.icon);
    }

    group.items?.forEach((child) => {
        const childNode = child as PanelNode;
        const codedata = childNode.metadata?.codedata;
        const childIconUrl: string | undefined = childNode.metadata?.metadata?.icon;
        const hasClassIcon = shouldUseClassIcon(Boolean(groupIconFactory), childIconUrl, packageIconUrl);
        child.icon = hasClassIcon ? (
            resolveChildBadgeIcon(codedata, childIconUrl)
        ) : (
            <NodeIcon type={codedata?.node} size={14} />
        );
    });
}
