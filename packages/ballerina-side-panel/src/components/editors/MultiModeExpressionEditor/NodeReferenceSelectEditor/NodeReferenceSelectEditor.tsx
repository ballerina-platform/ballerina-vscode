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

import React, { useEffect, useRef, useState } from "react";
import styled from "@emotion/styled";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import {
    AllowedConnector,
    AvailableNode,
    Category,
    CodeData,
    Item,
    SearchNodesQuery,
    SearchNodesTypeConstraint,
} from "@wso2/ballerina-core";
import { Codicon, LinkButton, ProgressRing } from "@wso2/ui-toolkit";
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

const AddButtons = styled.div`
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-top: 6px;
`;

// Recursively flatten search categories (which may nest Categories within their
// items) down to AvailableNodes.
const flattenAvailableNodes = (items: Item[] | undefined): AvailableNode[] => {
    const out: AvailableNode[] = [];
    for (const item of items ?? []) {
        if ((item as Category).items) {
            out.push(...flattenAvailableNodes((item as Category).items));
        } else if ((item as AvailableNode).codedata) {
            out.push(item as AvailableNode);
        }
    }
    return out;
};

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
    const { targetLineRange, fileName, onCreateNode, onRequestCreateConnection } = useFormContext();
    const [loadingConnectorKey, setLoadingConnectorKey] = useState<string | null>(null);

    const searchNodesKind = field.codedata?.searchNodesKind;
    const targetType = field.codedata?.targetType as SearchNodesTypeConstraint | undefined;
    const query: SearchNodesQuery = { kind: searchNodesKind, ...(targetType && { targetType }) };
    const queryKey = JSON.stringify(query);
    const initialItems: NodeReferenceSelectItem[] = field.codedata?.initialItems ?? [];
    const staticItems: NodeReferenceSelectItem[] = field.codedata?.staticItems ?? [];
    const itemsPreloaded = field.codedata?.initialItems !== undefined;
    const hasFilters = nodeReferenceFilters && nodeReferenceFilters.length > 0;
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
    const resolvedItems = applyNodeReferenceFilter([...staticItems, ...initialItems]);
    const [selectItems, setSelectItems] = useState<NodeReferenceSelectItem[]>(
        ensureValueInItems(resolvedItems, value, searchNodesKind)
    );
    const [loading, setLoading] = useState<boolean>(!!searchNodesKind && !itemsPreloaded);
    const requestIdRef = useRef(0);

    const fetchItems = () => {
        const requestId = ++requestIdRef.current;
        if (!searchNodesKind || itemsPreloaded) return;
        setLoading(true);
        rpcClient.getBIDiagramRpcClient().searchNodes({
            filePath: fileName,
            position: targetLineRange.startLine,
            query,
        }).then((response) => {
            if (requestId !== requestIdRef.current) return;
            const nodes = response?.output ?? [];
            const items: NodeReferenceSelectItem[] = nodes
                .filter(node => node.properties?.variable?.value)
                .map(node => {
                    const iconUrl = node.metadata?.icon;
                    return {
                        id: String(node.properties.variable.value),
                        label: node.properties.variable.value as string,
                        value: String(node.properties.variable.value),
                        codedata: node.codedata,
                        iconUrl,
                    };
                });
            setSelectItems(ensureValueInItems(
                applyNodeReferenceFilter([...staticItems, ...items]), value, searchNodesKind
            ));
        }).finally(() => {
            if (requestId === requestIdRef.current) setLoading(false);
        });
    };

    useEffect(() => {
        if (itemsPreloaded) {
            requestIdRef.current++;
            setSelectItems(ensureValueInItems(resolvedItems, value, searchNodesKind));
            setLoading(false);
            return;
        }
        fetchItems();
    }, [queryKey, fileName, targetLineRange.startLine, filterKey, itemsPreloaded]);

    useEffect(() => {
        if (!value && staticItems.length > 0) {
            onChange(staticItems[0].value, staticItems[0].value.length);
        }
    }, []);

    useEffect(() => {
        if (!value || selectItems.some(item => item.value === value)) return;
        setSelectItems(prev => ensureValueInItems(prev, value, searchNodesKind));
        fetchItems();
    }, [value]);

    // A field carries at most one way to create the referenced node: explicit connector
    // actions from the LS (`metadata.connectors`, e.g. "Add new HTTP connection") win over
    // the generic "Create New <kind>" link derived from `searchNodesKind`.
    const connectors: AllowedConnector[] = field.metadata?.connectors ?? [];
    const showConnectorActions = connectors.length > 0;
    const showCreateNew = !showConnectorActions && !!onCreateNode && !!searchNodesKind && field.editable && !field.actionCallback;

    const connectorKey = (c: AllowedConnector, i: number) =>
        `${c.codedata?.module}-${c.codedata?.object}-${i}`;

    const resolveAvailableNode = async (codedata: CodeData, label: string): Promise<AvailableNode> => {
        const fallback: AvailableNode = {
            codedata,
            metadata: { label },
            enabled: true,
        } as AvailableNode;
        try {
            const response = await rpcClient.getBIDiagramRpcClient().search({
                position: targetLineRange
                    ? { startLine: targetLineRange.startLine, endLine: targetLineRange.endLine }
                    : undefined,
                filePath: fileName,
                queryMap: { q: codedata.module ?? "", limit: 60 },
                searchKind: "CONNECTOR",
            });
            const all = flattenAvailableNodes(response.categories as Item[]);
            const match = all.find((n) =>
                n.codedata?.org === codedata.org &&
                n.codedata?.module === codedata.module &&
                n.codedata?.object === codedata.object
            );
            return match ?? fallback;
        } catch (err) {
            console.error(">>> Connector lookup failed for inline create", err);
            return fallback;
        }
    };

    const handleAddNewConnectorClick = async (c: AllowedConnector, key: string) => {
        if (!onRequestCreateConnection || !c.codedata) return;
        setLoadingConnectorKey(key);
        try {
            const selectedConnector = await resolveAvailableNode(c.codedata as CodeData, c.addNewConnectionLabel);
            onRequestCreateConnection({
                selectedConnector,
                onSaved: (variableName: string) => onChange(variableName, variableName?.length),
            });
        } finally {
            setLoadingConnectorKey(null);
        }
    };

    const agentCodeData = field.codedata?.data?.agent as CodeData | undefined;
    const creationCodeData = agentCodeData ?? (field.codedata?.data?.connection as CodeData | undefined);
    const createNewLabel = !showCreateNew
        ? ""
        : agentCodeData?.object
        ? agentCodeData.object
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
            {showConnectorActions && (
                <AddButtons>
                    {connectors.map((c, i) => {
                        const key = connectorKey(c, i);
                        const isLoading = loadingConnectorKey === key;
                        return (
                            <LinkButton
                                key={key}
                                onClick={() => !isLoading && handleAddNewConnectorClick(c, key)}
                                sx={{ padding: "4px 6px", margin: 0, fontSize: "13px", opacity: isLoading ? 0.7 : 1 }}
                            >
                                {isLoading ? <ProgressRing sx={{ width: 12, height: 12 }} /> : <Codicon name="add" />}
                                {c.addNewConnectionLabel}
                            </LinkButton>
                        );
                    })}
                </AddButtons>
            )}
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
