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

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { FormField, FormValues, FormImports } from "@wso2/ballerina-side-panel";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { PanelOverlayContext } from "../../views/BI/FlowDiagram/context/PanelOverlayContext";
import { convertConfig } from "../../utils/bi";
import { ArtifactForm } from "../../views/BI/Forms/ArtifactForm";
import { RelativeLoader } from "../RelativeLoader";
import { InfoBox } from "../InfoBox";
import { ConnectionCreatorProps } from "./types";
import { getConnectionSpecialConfig } from "./config";
import { updateFormFieldsWithData, updateNodeTemplateProperties, updateNodeWithConnectionVariable, updateNodeLineRange } from "./utils";
import { cloneDeep } from "lodash";
import { LineRange, RecordTypeField, getPrimaryInputType, PropertyTypeMemberInfo } from "@wso2/ballerina-core";
import { LoaderContainer } from "../RelativeLoader/styles";
import { URI, Utils } from "vscode-uri";
import { CONNECTIONS_FILE, GET_DEFAULT_EMBEDDING_PROVIDER, GET_DEFAULT_MODEL_PROVIDER } from "../../constants";

export function ConnectionCreator(props: ConnectionCreatorProps): JSX.Element {
    const { connectionKind, selectedNode, nodeFormTemplate, onSave } = props;

    const connectionSymbol = useMemo(() => nodeFormTemplate?.codedata?.symbol || '', [nodeFormTemplate?.codedata?.symbol]);
    const specialConfig = useMemo(() => getConnectionSpecialConfig(connectionSymbol) || {}, [connectionSymbol]);
    const shouldShowInfo = useMemo(() => specialConfig.shouldShowInfo?.(connectionSymbol) ?? false, [specialConfig, connectionSymbol]);

    const { rpcClient } = useRpcContext();
    // Use the full-width footer save button only in popups. Overlays (side panels) render inside a
    // PanelOverlayProvider, so a present context means we're NOT in a popup and keep the compact button.
    const isInPopup = !useContext(PanelOverlayContext);
    const [connectionFields, setConnectionFields] = useState<FormField[]>([]);
    const [recordTypeFields, setRecordTypeFields] = useState<RecordTypeField[]>([]);
    const [loading, setLoading] = useState<boolean>(false);
    const [savingForm, setSavingForm] = useState<boolean>(false);

    const projectPath = useRef<string>("");
    const connectionsFilePath = useRef<string>("");
    const targetLineRangeRef = useRef<LineRange | undefined>(undefined);

    useEffect(() => {
        initPanel();
    }, [nodeFormTemplate]);

    const initPanel = async () => {
        setLoading(true);
        projectPath.current = await rpcClient.getVisualizerLocation().then((location) => location.projectPath);
        connectionsFilePath.current = Utils.joinPath(URI.file(projectPath.current), CONNECTIONS_FILE).fsPath;
        const endPosition = await rpcClient.getBIDiagramRpcClient().getEndOfFile({
            filePath: connectionsFilePath.current
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
        }

        if (nodeFormTemplate && nodeFormTemplate.properties) {
            const fields = convertConfig(nodeFormTemplate.properties);
            setConnectionFields(fields);

            const rtFields: RecordTypeField[] = Object.entries(nodeFormTemplate.properties)
                .filter(
                    ([_, property]) =>
                        getPrimaryInputType(property?.types)?.typeMembers &&
                        getPrimaryInputType(property?.types)?.typeMembers.some((member: PropertyTypeMemberInfo) => member.kind === "RECORD_TYPE")
                )
                .map(([key, property]) => ({
                    key,
                    property: {
                        ...property,
                        metadata: {
                            label: property.metadata?.label || key,
                            description: property.metadata?.description || "",
                        },
                    },
                    recordTypeMembers: getPrimaryInputType(property.types)?.typeMembers.filter(
                        (member: PropertyTypeMemberInfo) => member.kind === "RECORD_TYPE"
                    ) || [],
                }));
            setRecordTypeFields(rtFields);
        }
        setLoading(false);
    };

    const handleOnSave = useCallback(async (data: FormValues, formImports?: FormImports) => {
        setSavingForm(true);
        const nodeTemplate = cloneDeep(nodeFormTemplate);
        updateFormFieldsWithData(connectionFields, data, formImports);
        updateNodeTemplateProperties(nodeTemplate, connectionFields);
        Object.values(nodeTemplate.properties).forEach((prop: any) => {
            if (prop) {
                prop.imports = {};
            }
        });
        try {
            const response = await rpcClient
                .getBIDiagramRpcClient()
                .getSourceCode({
                    filePath: projectPath.current,
                    flowNode: nodeTemplate,
                    isConnector: nodeTemplate?.codedata?.node === "NEW_CONNECTION",
                });
            // Update the selected node with the new connection variable
            updateNodeWithConnectionVariable(connectionKind, selectedNode, nodeTemplate?.properties?.variable?.value as string);
            // Update the line range for the selected node if it was updated
            updateNodeLineRange(selectedNode, response.artifacts);
            if (connectionSymbol === GET_DEFAULT_MODEL_PROVIDER || connectionSymbol === GET_DEFAULT_EMBEDDING_PROVIDER) {
                const providerKind = connectionSymbol === GET_DEFAULT_EMBEDDING_PROVIDER ? "embedding" : "model";
                await rpcClient.getAIAgentRpcClient().configureDefaultModelProvider(providerKind);
            }
            onSave?.(selectedNode, response.artifacts);
        } catch (error) {
            console.error(`>>> Error creating ${connectionKind}`, error);
        }
    }, [onSave, rpcClient, connectionKind, connectionFields, connectionSymbol]);

    return (
        <>
            {loading && (
                <LoaderContainer>
                    <RelativeLoader />
                </LoaderContainer>
            )}
            {!loading && connectionFields?.length > 0 && (
                <>
                    <ArtifactForm
                        fileName={connectionsFilePath.current || projectPath.current}
                        fields={connectionFields}
                        description={nodeFormTemplate?.metadata?.description}
                        onSubmit={handleOnSave}
                        submitText={savingForm ? "Saving..." : "Save"}
                        disableSaveButton={savingForm}
                        footerActionButton={isInPopup}
                        targetLineRange={targetLineRangeRef.current}
                        helperPaneSide="left"
                        isSaving={savingForm}
                        recordTypeFields={recordTypeFields}
                        injectedComponents={shouldShowInfo && specialConfig.infoMessage ? [
                            {
                                component: <InfoBox
                                    text={specialConfig.infoMessage.text}
                                    description={specialConfig.infoMessage.description}
                                    codeCommand={specialConfig.infoMessage.codeCommand}
                                />,
                                index: 0
                            }
                        ] : []}
                    />
                </>
            )}
        </>
    );
}
