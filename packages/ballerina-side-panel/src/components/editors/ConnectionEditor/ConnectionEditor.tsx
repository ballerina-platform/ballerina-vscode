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
import styled from "@emotion/styled";
import { Codicon, LinkButton, ProgressRing } from "@wso2/ui-toolkit";
import { AllowedConnector, AvailableNode, Category, CodeData, Item } from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";

import { FormField } from "../../Form/types";
import { useFormContext } from "../../../context";
import { capitalize } from "../utils";
import { NodeReferenceFilter, NodeReferenceSelectEditor } from "../MultiModeExpressionEditor/NodeReferenceSelectEditor/NodeReferenceSelectEditor";

interface ConnectionEditorProps {
    field: FormField;
}

const Container = styled.div`
    display: flex;
    flex-direction: column;
    gap: 4px;
    width: 100%;
`;

const Label = styled.label`
    font-size: 13px;
    color: var(--vscode-editor-foreground);
`;

const Required = styled.span`
    color: var(--vscode-errorForeground);
    margin-left: 2px;
`;

const Description = styled.div`
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
`;

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

export const ConnectionEditor: React.FC<ConnectionEditorProps> = ({ field }) => {
    const { form, fileName, targetLineRange, onRequestCreateConnection } = useFormContext();
    const { rpcClient } = useRpcContext();
    const { register, setValue, watch } = form;
    const [loadingKey, setLoadingKey] = useState<string | null>(null);

    const connectorKey = (c: AllowedConnector, i: number) =>
        `${c.codedata?.module}-${c.codedata?.object}-${i}`;

    useEffect(() => {
        register(field.key, {
            required: !field.optional,
            value: field.value ?? "",
        });
    }, [field.key]);

    const value = (watch(field.key) ?? field.value ?? "") as string;
    const connectors: AllowedConnector[] = field.metadata?.connectors ?? [];
    const nodeReferenceFilters: NodeReferenceFilter[] | undefined = connectors.length > 0
        ? connectors.map(c => ({ module: c.codedata?.module, object: c.codedata?.object }))
        : undefined;

    const handleChange = (val: string) => {
        setValue(field.key, val, { shouldDirty: true, shouldValidate: true });
        field.onValueChange?.(val);
    };

    const handleSaved = (variableName: string) => {
        setValue(field.key, variableName, { shouldDirty: true, shouldValidate: true });
        field.onValueChange?.(variableName);
    };

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

    const handleAddNewClick = async (c: AllowedConnector, key: string) => {
        if (!onRequestCreateConnection || !c.codedata) return;
        setLoadingKey(key);
        try {
            const selectedConnector = await resolveAvailableNode(c.codedata as CodeData, c.addNewConnectionLabel);
            onRequestCreateConnection({ selectedConnector, onSaved: handleSaved });
        } finally {
            setLoadingKey(null);
        }
    };

    return (
        <Container>
            <Label htmlFor={field.key}>
                {capitalize(field.label)}
                {!field.optional && <Required>*</Required>}
            </Label>
            {field.documentation && <Description>{field.documentation}</Description>}
            <NodeReferenceSelectEditor
                value={value}
                field={field}
                onChange={(val) => handleChange(val)}
                nodeReferenceFilters={nodeReferenceFilters}
            />
            {connectors.length > 0 && (
                <AddButtons>
                    {connectors.map((c, i) => {
                        const key = connectorKey(c, i);
                        const isLoading = loadingKey === key;
                        return (
                            <LinkButton
                                key={key}
                                onClick={() => !isLoading && handleAddNewClick(c, key)}
                                sx={{ padding: "4px 6px", margin: 0, fontSize: "13px", opacity: isLoading ? 0.7 : 1 }}
                            >
                                {isLoading ? <ProgressRing sx={{ width: 12, height: 12 }} /> : <Codicon name="add" />}
                                {c.addNewConnectionLabel}
                            </LinkButton>
                        );
                    })}
                </AddButtons>
            )}
        </Container>
    );
};
