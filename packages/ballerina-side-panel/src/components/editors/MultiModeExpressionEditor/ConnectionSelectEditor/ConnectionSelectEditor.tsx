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

import React, { useEffect, useState } from "react";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { CodeData, SearchNodesQueryParams } from "@wso2/ballerina-core";
import { Codicon, LinkButton } from "@wso2/ui-toolkit";
import { FormField } from "../../../Form/types";
import { ConnectionIconSelect, ConnectionSelectItem } from "../../ConnectionIconSelect";
import { useFormContext } from "../../../../context";

function humanizeKind(kind: string): string {
    return kind
        .split("_")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(" ");
}

export type ConnectorFilter = { module?: string; object?: string };

interface ConnectionSelectEditorProps {
    value: string;
    field: FormField;
    onChange: (value: string, cursorPosition: number) => void;
    connectorFilters?: ConnectorFilter[];
}

// Cache icon URLs by module name across remounts to avoid icon flicker
const iconUrlCache = new Map<string, string>();
// Cache fetched items by searchNodesKind across remounts to avoid redundant API calls
const itemsCache = new Map<string, ConnectionSelectItem[]>();

function enrichWithCachedIcons(items: ConnectionSelectItem[]): ConnectionSelectItem[] {
    return items.map(item => {
        const module = item.codedata?.module;
        const cachedUrl = module ? iconUrlCache.get(module) : undefined;
        return cachedUrl && !item.iconUrl ? { ...item, iconUrl: cachedUrl } : item;
    });
}

function ensureValueInItems(
    items: ConnectionSelectItem[],
    value: string,
    searchNodesKind?: string,
): ConnectionSelectItem[] {
    if (!value || items.some(item => item.value === value)) {
        return items;
    }
    return [
        ...items,
        {
            id: value,
            label: value,
            value,
            codedata: searchNodesKind ? { node: searchNodesKind } as CodeData : undefined,
        },
    ];
}

export const ConnectionSelectEditor: React.FC<ConnectionSelectEditorProps> = ({ value, field, onChange, connectorFilters }) => {
    const { rpcClient } = useRpcContext();
    const { targetLineRange, fileName, onCreateConnection } = useFormContext();

    const searchNodesKind = field.codedata?.searchNodesKind;
    const typeQuery: SearchNodesQueryParams = {
        ...(field.codedata?.typeMatch && { typeMatch: field.codedata.typeMatch }),
        ...(field.codedata?.typeOrg && { typeOrg: field.codedata.typeOrg }),
        ...(field.codedata?.typePackage && { typePackage: field.codedata.typePackage }),
        ...(field.codedata?.typeModule && { typeModule: field.codedata.typeModule }),
        ...(field.codedata?.typeName && { typeName: field.codedata.typeName }),
        ...(field.codedata?.typeVersion && { typeVersion: field.codedata.typeVersion }),
    };
    const typeCacheKey = [
        typeQuery.typeMatch,
        typeQuery.typeOrg,
        typeQuery.typePackage,
        typeQuery.typeModule,
        typeQuery.typeName,
        typeQuery.typeVersion,
    ].filter(Boolean).join(":");
    const cacheKey = typeCacheKey ? `${searchNodesKind}:${typeCacheKey}` : searchNodesKind;
    const initialItems: ConnectionSelectItem[] = field.codedata?.initialItems ?? [];
    const staticItems: ConnectionSelectItem[] = field.codedata?.staticItems ?? [];
    const itemsPreloaded = field.codedata?.initialItems !== undefined;
    const cachedItems = cacheKey ? itemsCache.get(cacheKey) : undefined;
    const hasFilters = connectorFilters && connectorFilters.length > 0;
    // Stable string key for effect deps so we re-fetch only when the filter set actually changes.
    const filterKey = hasFilters
        ? connectorFilters!.map((f) => `${f.module ?? ""}:${f.object ?? ""}`).join("|")
        : "";
    const applyConnectorFilter = (items: ConnectionSelectItem[]): ConnectionSelectItem[] => {
        if (!hasFilters) return items;
        return items.filter(item =>
            connectorFilters!.some((filter) =>
                (!filter.module || item.codedata?.module === filter.module) &&
                (!filter.object || item.codedata?.object === filter.object)
            )
        );
    };
    const resolvedItems = applyConnectorFilter([...staticItems, ...(cachedItems ?? enrichWithCachedIcons(initialItems))]);
    const [selectItems, setSelectItems] = useState<ConnectionSelectItem[]>(
        ensureValueInItems(resolvedItems, value, searchNodesKind)
    );
    const [loading, setLoading] = useState<boolean>(!!searchNodesKind && !cachedItems && !itemsPreloaded);

    const fetchItems = () => {
        if (!searchNodesKind) return;
        // Show loading only if we have no cached items to display
        if (!itemsCache.has(cacheKey)) {
            setLoading(true);
        }
        rpcClient.getBIDiagramRpcClient().searchNodes({
            filePath: fileName,
            position: targetLineRange.startLine,
            queryMap: { kind: searchNodesKind, ...typeQuery }
        }).then((response) => {
            const nodes = response?.output ?? [];
            const items: ConnectionSelectItem[] = nodes
                .filter(node => node.properties?.variable?.value)
                .map(node => {
                    const iconUrl = node.metadata?.icon;
                    const module = node.codedata?.module;
                    if (iconUrl && module) {
                        iconUrlCache.set(module, iconUrl);
                    }
                    return {
                        id: String(node.properties.variable.value),
                        label: node.properties.variable.value as string,
                        value: String(node.properties.variable.value),
                        codedata: node.codedata,
                        iconUrl,
                    };
                });
            itemsCache.set(cacheKey, items);
            setSelectItems(applyConnectorFilter([...staticItems, ...items]));
        }).finally(() => {
            setLoading(false);
        });
    };

    useEffect(() => {
        if (itemsPreloaded) return;
        fetchItems();
    }, [searchNodesKind, typeCacheKey, fileName, filterKey]);

    useEffect(() => {
        if (!value && staticItems.length > 0) {
            onChange(staticItems[0].value, staticItems[0].value.length);
        }
    }, []);

    // When value changes to something not in the current items (e.g. after creating
    // a new connection via an overlay), inject a placeholder and re-fetch
    useEffect(() => {
        if (!value || selectItems.some(item => item.value === value)) return;
        setSelectItems(prev => ensureValueInItems(prev, value, searchNodesKind));
        if (cacheKey) {
            itemsCache.delete(cacheKey);
        }
        fetchItems();
    }, [value]);

    const showCreateNew = !!onCreateConnection && !!searchNodesKind && field.editable && !field.actionCallback;
    const agentCodeData = field.codedata?.data?.agent as CodeData | undefined;
    const connectorCodeData = agentCodeData ?? (field.codedata?.data?.connection as CodeData | undefined);
    const createNewLabel = agentCodeData?.object
        ? agentCodeData.object // e.g. "CalendarAssistantAgent" -> "Create New CalendarAssistantAgent"
        : connectorCodeData?.module && connectorCodeData?.object
        ? `${humanizeKind(connectorCodeData.module.split(".").pop() ?? "")} ${connectorCodeData.object}`
        : humanizeKind(searchNodesKind);

    return (
        <>
            <ConnectionIconSelect
                id={field.key}
                items={selectItems}
                value={value}
                required={!field.optional}
                disabled={!field.editable}
                loading={loading}
                onChange={(val) => onChange(val, val?.length)}
            />
            {showCreateNew && (
                <LinkButton
                    onClick={() => onCreateConnection(
                        searchNodesKind,
                        (varName) => onChange(varName, varName?.length),
                        connectorCodeData
                    )}
                    sx={{ padding: "4px 6px", margin: 0, marginTop: "6px", fontSize: "13px" }}
                >
                    <Codicon name="add" />
                    {`Create New ${createNewLabel}`}
                </LinkButton>
            )}
        </>
    );
};
