/**
 * Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
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

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlowNode, LineRange, NodeKind, NodeProperties, PropertyTypeMemberInfo, RecordTypeField, getPrimaryInputType } from "@wso2/ballerina-core";
import { FormField, FormImports, FormValues } from "@wso2/ballerina-side-panel";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { ArtifactForm } from "../../views/BI/Forms/ArtifactForm";
import { RelativeLoader } from "../RelativeLoader";
import { InfoBox } from "../InfoBox";
import { ConnectionConfigProps } from "./types";
import { getConnectionKindConfig, getConnectionSpecialConfig } from "./config";
import { createConnectionSelectField, fetchConnectionValueForNode, updateFormFieldsWithData, updateNodeLineRange, updateNodeTemplateProperties, updateNodeWithConnectionVariable } from "./utils";
import { LoaderContainer } from "../RelativeLoader/styles";
import { convertNodePropertiesToFormFields } from "../../utils/bi";
import { cloneDeep } from "lodash";
import { URI, Utils } from "vscode-uri";

export function ConnectionConfig(props: ConnectionConfigProps): JSX.Element {
    const { fileName, connectionKind, selectedNode, onSave, onNavigateToSelectionList } = props;
    const config = useMemo(() => getConnectionKindConfig(connectionKind), [connectionKind]);
    const { rpcClient } = useRpcContext();

    const [selectedConnectionValue, setSelectedConnectionValue] = useState<string>();
    const [selectedConnectionFields, setSelectedConnectionFields] = useState<FormField[]>([]);
    const [recordTypeFields, setRecordTypeFields] = useState<RecordTypeField[]>([]);
    const [loading, setLoading] = useState<boolean>(false);
    const [savingForm, setSavingForm] = useState<boolean>(false);
    const [, forceRender] = useState(0);

    const projectPath = useRef<string>("");
    const currentFilePath = useRef<string>("");
    const targetLineRangeRef = useRef<LineRange | undefined>(undefined);
    const connectionNodesMap = useRef<Map<string, FlowNode>>(new Map());
    const connectionConfigFields = useRef<FormField[]>([]);

    useEffect(() => {
        initPanel();
    }, []);

    const initPanel = async () => {
        setLoading(true);
        projectPath.current = await rpcClient.getVisualizerLocation().then((location) => location.projectPath);
        currentFilePath.current = fileName;

        const endPosition = await rpcClient.getBIDiagramRpcClient().getEndOfFile({
            filePath: currentFilePath.current
        });
        targetLineRangeRef.current = {
            startLine: {
                line: endPosition.line,
                offset: endPosition.offset
            },
            endLine: {
                line: endPosition.line,
                offset: endPosition.offset
            }
        };

        await fetchConnectionNodes();
        const connectionValue = await fetchConnectionValueForNode(connectionKind, selectedNode);
        updateFieldsForConnection(connectionValue);
        setLoading(false);
    };

    const fetchConnectionNodes = async () => {
        const response = await rpcClient.getBIDiagramRpcClient().searchNodes({
            filePath: currentFilePath.current,
            position: targetLineRangeRef.current?.startLine,
            queryMap: { kind: connectionKind as NodeKind }
        });
        const nodes = response?.output ?? [];
        const nodesMap = new Map<string, FlowNode>();
        nodes.forEach(node => {
            const varName = String(node.properties?.variable?.value ?? "");
            if (varName) {
                nodesMap.set(varName, node);
            }
        });
        connectionNodesMap.current = nodesMap;
    };

    const getConnectionConfigFields = (connectionValue: string): FormField[] => {
        const connectionNode = connectionNodesMap.current.get(connectionValue);
        if (!connectionNode) return [];

        const { variable, ...restProperties } = connectionNode.properties;
        const fields = convertNodePropertiesToFormFields(restProperties as NodeProperties);
        fields.forEach(field => {
            if (getPrimaryInputType(field.types)?.fieldType === "TYPE") {
                field.hidden = true;
            }
        });
        return fields;
    };

    const getConnectionRecordTypeFields = (connectionValue: string): RecordTypeField[] => {
        const connectionNode = connectionNodesMap.current.get(connectionValue);
        if (!connectionNode) return [];

        const { variable, ...restProperties } = connectionNode.properties;
        return Object.entries(restProperties)
            .filter(([_, property]) => {
                const primaryInputType = getPrimaryInputType(property?.types);
                return primaryInputType?.typeMembers?.some((member: PropertyTypeMemberInfo) => member.kind === "RECORD_TYPE");
            })
            .map(([key, property]) => {
                const primaryInputType = getPrimaryInputType(property?.types);
                return {
                    key,
                    property: {
                        ...property,
                        metadata: {
                            ...property.metadata,
                            label: property.metadata?.label || key,
                            description: property.metadata?.description || "",
                        },
                    },
                    recordTypeMembers:
                        primaryInputType?.typeMembers?.filter((member: PropertyTypeMemberInfo) => member.kind === "RECORD_TYPE") ?? [],
                };
            });
    };

    const updateFieldsForConnection = (connectionValue: string) => {
        const connectionSelectField = createConnectionSelectField(connectionValue, config, onCreateNewConnection, connectionKind, connectionNodesMap.current);
        const isExpression = connectionValue && !connectionNodesMap.current.has(connectionValue);
        if (isExpression) {
            connectionSelectField.types = connectionSelectField.types?.map(t => ({
                ...t,
                selected: t.fieldType === "EXPRESSION"
            }));
        }
        const configFields = isExpression ? [] : (connectionValue ? getConnectionConfigFields(connectionValue) : []);
        connectionConfigFields.current = configFields;
        setRecordTypeFields(isExpression || !connectionValue ? [] : getConnectionRecordTypeFields(connectionValue));
        setSelectedConnectionValue(connectionValue);
        setSelectedConnectionFields([connectionSelectField, ...configFields]);
    };

    const handleOnSave = useCallback(async (data: FormValues, formImports?: FormImports) => {
        setSavingForm(true);

        try {
            // 1. Update the parent node's connection reference
            updateNodeWithConnectionVariable(connectionKind, selectedNode, data["connection"]);

            // 2. Save the connection node config if there are config fields with changes
            const connectionNode = connectionNodesMap.current.get(data["connection"]);
            const hasConfigChanges = connectionConfigFields.current.some(
                field => data[field.key] !== undefined && data[field.key] !== field.value
            );
            if (connectionNode && connectionConfigFields.current.length > 0 && hasConfigChanges) {
                const nodeToSave = cloneDeep(connectionNode);
                updateFormFieldsWithData(connectionConfigFields.current, data, formImports);
                updateNodeTemplateProperties(nodeToSave, connectionConfigFields.current);
                Object.values(nodeToSave.properties).forEach((prop: any) => {
                    if (prop) {
                        prop.imports = {};
                    }
                });
                const relativeFileName = nodeToSave.codedata?.lineRange?.fileName;
                const filePath = relativeFileName
                    ? Utils.joinPath(URI.file(projectPath.current), relativeFileName).fsPath
                    : currentFilePath.current;
                const response = await rpcClient.getBIDiagramRpcClient().getSourceCode({
                    filePath,
                    flowNode: nodeToSave,
                    isConnector: true,
                });
                updateNodeLineRange(selectedNode, response.artifacts);
            }

            await onSave?.(selectedNode);
        } catch (error) {
            console.error(`>>> Error saving ${connectionKind} config`, error);
        } finally {
            setSavingForm(false);
        }
    }, [onSave, rpcClient, connectionKind, selectedNode]);

    const handleOnChange = useCallback((fieldKey: string, value: any) => {
        if (fieldKey !== "connection" || value === selectedConnectionValue) return;

        const isKnownConnection = value && connectionNodesMap.current.has(value);

        if (!isKnownConnection) {
            if (connectionConfigFields.current.length > 0) {
                connectionConfigFields.current.forEach(f => { f.hidden = true; });
                connectionConfigFields.current = [];
                forceRender(c => c + 1);
            }
            return;
        }
        updateFieldsForConnection(value);
    }, [selectedConnectionValue]);

    const onCreateNewConnection = useCallback(() => {
        onNavigateToSelectionList?.();
    }, [onNavigateToSelectionList]);

    const injectedComponents = useMemo(() => {
        const connectionNode = selectedConnectionValue
            ? connectionNodesMap.current.get(selectedConnectionValue)
            : undefined;
        const symbol = connectionNode?.codedata?.symbol || "";
        const specialConfig = getConnectionSpecialConfig(symbol);
        if (!specialConfig?.shouldShowInfo?.(symbol)) {
            return undefined;
        }
        const isMac = typeof navigator !== "undefined" && /Mac/i.test(navigator.userAgent);
        const shortcut = isMac ? "Cmd+Shift+P" : "Ctrl+Shift+P";
        return [{
            component: (
                <InfoBox
                    text="Configure this model provider using the command palette command:"
                    description={`Open the command palette with ${shortcut}, then run:`}
                    codeCommand="> Ballerina: Configure default WSO2 model provider"
                />
            ),
            index: Infinity,
        }];
    }, [selectedConnectionValue, selectedConnectionFields]);

    return (
        <>
            {loading && (
                <LoaderContainer>
                    <RelativeLoader />
                </LoaderContainer>
            )}
            {!loading && selectedConnectionFields?.length > 0 && (
                <>
                    <ArtifactForm
                        key={selectedConnectionValue}
                        fileName={currentFilePath.current || projectPath.current}
                        targetLineRange={targetLineRangeRef.current}
                        fields={selectedConnectionFields}
                        onSubmit={handleOnSave}
                        onChange={handleOnChange}
                        disableSaveButton={savingForm}
                        isSaving={savingForm}
                        helperPaneSide="left"
                        recordTypeFields={recordTypeFields}
                        injectedComponents={injectedComponents}
                    />
                </>
            )}
        </>
    );
}
