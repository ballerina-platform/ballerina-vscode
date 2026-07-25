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
import { CodeData, SearchNodesQuery, SearchNodesTypeConstraint } from "@wso2/ballerina-core";
import { Codicon, LinkButton } from "@wso2/ui-toolkit";
import { FormField } from "../../../Form/types";
import { NodeReferenceSelect, NodeReferenceSelectItem } from "../../NodeReferenceSelect";
import { useFormContext } from "../../../../context";

function humanizeKind(kind: string): string {
    return kind
        .split("_")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(" ");
}

export type NodeReferenceFilter = { module?: string; object?: string };

interface NodeReferenceSelectEditorProps {
    value: string;
    field: FormField;
    onChange: (value: string, cursorPosition: number) => void;
    nodeReferenceFilters?: NodeReferenceFilter[];
}

// Cache icon URLs by module name across remounts to avoid icon flicker
const iconUrlCache = new Map<string, string>();
// Cache fetched node items by search query across remounts to avoid redundant API calls.
const nodeItemsCache = new Map<string, NodeReferenceSelectItem[]>();

function enrichWithCachedIcons(items: NodeReferenceSelectItem[]): NodeReferenceSelectItem[] {
    return items.map(item => {
        const module = item.codedata?.module;
        const cachedUrl = module ? iconUrlCache.get(module) : undefined;
        return cachedUrl && !item.iconUrl ? { ...item, iconUrl: cachedUrl } : item;
    });
}

function ensureValueInItems(
    items: NodeReferenceSelectItem[],
    value: string,
    searchNodesKind?: string,
): NodeReferenceSelectItem[] {
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

export const NodeReferenceSelectEditor: React.FC<NodeReferenceSelectEditorProps> = ({
    value, field, onChange, nodeReferenceFilters,
}) => {
    const { rpcClient } = useRpcContext();
    const { targetLineRange, fileName, onCreateNode } = useFormContext();

    const searchNodesKind = field.codedata?.searchNodesKind;
    const targetType = field.codedata?.targetType as SearchNodesTypeConstraint | undefined;
    const query: SearchNodesQuery = { kind: searchNodesKind, ...(targetType && { targetType }) };
    const cacheKey = JSON.stringify(query);
    const initialItems: NodeReferenceSelectItem[] = field.codedata?.initialItems ?? [];
    const staticItems: NodeReferenceSelectItem[] = field.codedata?.staticItems ?? [];
    const itemsPreloaded = field.codedata?.initialItems !== undefined;
    const cachedItems = cacheKey ? nodeItemsCache.get(cacheKey) : undefined;
    const hasFilters = nodeReferenceFilters && nodeReferenceFilters.length > 0;
    // Stable string key for effect deps so we re-fetch only when the filter set actually changes.
    const filterKey = hasFilters
        ? nodeReferenceFilters!.map((f) => `${f.module ?? ""}:${f.object ?? ""}`).join("|")
        : "";
    const applyNodeReferenceFilter = (items: NodeReferenceSelectItem[]): NodeReferenceSelectItem[] => {
        if (!hasFilters) return items;
        return items.filter(item =>
            nodeReferenceFilters!.some((filter) =>
                (!filter.module || item.codedata?.module === filter.module) &&
                (!filter.object || item.codedata?.object === filter.object)
            )
        );
    };
    const resolvedItems = applyNodeReferenceFilter([...staticItems, ...(cachedItems ?? enrichWithCachedIcons(initialItems))]);
    const [selectItems, setSelectItems] = useState<NodeReferenceSelectItem[]>(
        ensureValueInItems(resolvedItems, value, searchNodesKind)
    );
    const [loading, setLoading] = useState<boolean>(!!searchNodesKind && !cachedItems && !itemsPreloaded);

    const fetchItems = () => {
        if (!searchNodesKind) return;
        // Show loading only if we have no cached items to display
        if (!nodeItemsCache.has(cacheKey)) {
            setLoading(true);
        }
        rpcClient.getBIDiagramRpcClient().searchNodes({
            filePath: fileName,
            position: targetLineRange.startLine,
            query,
        }).then((response) => {
            const nodes = response?.output ?? [];
            const items: NodeReferenceSelectItem[] = nodes
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
            nodeItemsCache.set(cacheKey, items);
            setSelectItems(applyNodeReferenceFilter([...staticItems, ...items]));
        }).finally(() => {
            setLoading(false);
        });
    };

    useEffect(() => {
        if (itemsPreloaded) return;
        fetchItems();
    }, [cacheKey, fileName, filterKey]);

    useEffect(() => {
        if (!value && staticItems.length > 0) {
            onChange(staticItems[0].value, staticItems[0].value.length);
        }
    }, []);

    // When a newly created node becomes the value, inject a placeholder and re-fetch.
    useEffect(() => {
        if (!value || selectItems.some(item => item.value === value)) return;
        setSelectItems(prev => ensureValueInItems(prev, value, searchNodesKind));
        if (cacheKey) {
            nodeItemsCache.delete(cacheKey);
        }
        fetchItems();
    }, [value]);

    const showCreateNew = !!onCreateNode && !!searchNodesKind && field.editable && !field.actionCallback;
    const agentCodeData = field.codedata?.data?.agent as CodeData | undefined;
    const creationCodeData = agentCodeData ?? (field.codedata?.data?.connection as CodeData | undefined);
    const createNewLabel = agentCodeData?.object
        ? agentCodeData.object // e.g. "CalendarAssistantAgent" -> "Create New CalendarAssistantAgent"
        : creationCodeData?.module && creationCodeData?.object
        ? `${humanizeKind(creationCodeData.module.split(".").pop() ?? "")} ${creationCodeData.object}`
        : humanizeKind(searchNodesKind);

    return (
        <>
            <NodeReferenceSelect
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
                    onClick={() => onCreateNode(
                        searchNodesKind,
                        (varName) => onChange(varName, varName?.length),
                        creationCodeData
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
