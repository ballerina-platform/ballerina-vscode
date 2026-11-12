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

import { useEffect, useState } from "react";
import styled from "@emotion/styled";
import { ProgressRing, Typography, View, ViewContent } from "@wso2/ui-toolkit";
import { FormField, FormValues } from "@wso2/ballerina-side-panel";
import {
    EVENT_TYPE, getPrimaryInputType, MACHINE_VIEW,
    ModelFromCodeRequest,
    NodePosition,
    PropertyModel,
    ServiceClassModel,
    ServiceClassSourceRequest,
    Type,
    UpdatedArtifactsResponse
} from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { ArtifactForm } from "../Forms/ArtifactForm";
import { FormHeader } from "../../../components/FormHeader";
import { TopNavigationBar } from "../../../components/TopNavigationBar";
import { TitleBar } from "../../../components/TitleBar";

const Container = styled.div`
    max-width: 600px;
    height: 100%;
    > div:last-child {
        > div:last-child {
            justify-content: flex-start;
        }
    }
`;

const FormContainer = styled.div`
    padding-bottom: 15px;
`;

const LoadingContainer = styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
    height: 80vh;
    flex-direction: column;
`;

interface ServiceClassConfigProps {
    projectPath: string;
    fileName: string;
    position: NodePosition;
    type: Type;
}

// TODO: Need to support inclusion type configurable option
export function ServiceClassConfig(props: ServiceClassConfigProps) {
    const { projectPath, fileName, position, type } = props;
    const { rpcClient } = useRpcContext();
    const [serviceClassModel, setServiceClassModel] = useState<ServiceClassModel | null>(null);
    const [serviceClassFields, setServiceClassFields] = useState<FormField[]>([]);
    const [filePath, setFilePath] = useState<string>("");
    const [isSaving, setIsSaving] = useState<boolean>(false);

    const editTitle = `Update the configuration details for the Service Class as needed.`

    useEffect(() => {
        getServiceClassModel();
        rpcClient.getVisualizerRpcClient().joinProjectPath({ segments: [fileName] }).then((response) => {
            setFilePath(response.filePath);
        });
    }, [fileName, position]);


    const getServiceClassModel = async () => {
        if (!fileName || !position) return;

        const currentFilePath = (await rpcClient.getVisualizerRpcClient().joinProjectPath({ segments: [fileName] })).filePath;
        const serviceClassModelRequest: ModelFromCodeRequest = {
            filePath: currentFilePath,
            codedata: {
                lineRange: {
                    startLine: { line: position.startLine, offset: position.startColumn },
                    endLine: { line: position.endLine, offset: position.endColumn }
                }
            },
            context: "TYPE_DIAGRAM"
        }
        const serviceClassModelResponse = await rpcClient.getBIDiagramRpcClient().getServiceClassModel(serviceClassModelRequest);
        if (serviceClassModelResponse.model) {
            const serviceClassFields = convertToFormField(serviceClassModelResponse.model);
            setServiceClassFields(serviceClassFields);
            setServiceClassModel(serviceClassModelResponse.model);
        }
    }

    const convertToFormField = (model: ServiceClassModel): FormField[] => {
        const fields: FormField[] = [];

        // Add name field
        const nameProperty = model.properties?.["name"] as PropertyModel;
        if (nameProperty) {
            fields.push({
                key: 'name',
                label: nameProperty.metadata?.label || 'Service Class Name',
                type: 'IDENTIFIER',
                optional: nameProperty.optional,
                editable: nameProperty.editable,
                advanced: nameProperty.advanced,
                enabled: nameProperty.enabled,
                documentation: nameProperty.metadata?.description,
                value: nameProperty.value || '',
                types: nameProperty?.types,
                lineRange: nameProperty.codedata?.lineRange
            });
        }

        // Add documentation field
        if (model.documentation) {
            const docProperty = model.documentation as PropertyModel;
            fields.push({
                key: 'documentation',
                label: docProperty.metadata?.label || 'Description',
                type: getPrimaryInputType(docProperty?.types)?.fieldType || 'string',
                optional: docProperty.optional,
                editable: docProperty.editable,
                advanced: docProperty.advanced,
                enabled: docProperty.enabled,
                documentation: docProperty.metadata?.description || '',
                value: docProperty.value || '',
                types: docProperty?.types,
                lineRange: docProperty.codedata?.lineRange
            });
        }

        return fields;
    }

    const handleOnSubmit = async (data: FormValues) => {
        setIsSaving(true);
        const updatedModel = { ...serviceClassModel };
        let hasChanges = false;

        // Check and update name if changed
        if (data.name && updatedModel.properties?.["name"]) {
            const currentName = (updatedModel.properties["name"] as PropertyModel).value;
            if (currentName !== data.name) {
                (updatedModel.properties["name"] as PropertyModel).value = data.name;
                hasChanges = true;
            }
        }

        // Check and update documentation if changed
        if (updatedModel.documentation) {
            const currentDocumentation = updatedModel.documentation.value;
            const newDocumentation = data.documentation;
            if (currentDocumentation !== newDocumentation) {
                updatedModel.documentation.value = newDocumentation;
                hasChanges = true;
            }
        }

        // Only proceed with update if there are actual changes
        if (hasChanges) {
            const currentFilePath = (await rpcClient.getVisualizerRpcClient().joinProjectPath({ segments: [fileName] })).filePath;

            const updateModelRequest: ServiceClassSourceRequest = {
                filePath: currentFilePath,
                serviceClass: updatedModel
            };

            const artifactsRes: UpdatedArtifactsResponse = await rpcClient.getBIDiagramRpcClient().updateServiceClass(updateModelRequest);
            // get matching artifact to the updated model
            const serviceArtifact = artifactsRes.artifacts.find(res => res.name === updatedModel.properties["name"].value);

            if (serviceArtifact) {
                await rpcClient
                    .getVisualizerRpcClient()
                    .openView({
                        type: EVENT_TYPE.OPEN_VIEW,
                        location: {
                            view: MACHINE_VIEW.BIServiceClassDesigner,
                            position: serviceArtifact.position,
                            isGraphql: false,
                            documentUri: fileName,
                            type: type,
                        }
                    });
            } else {
                rpcClient.getVisualizerRpcClient()?.goBack();
            }
        } else {
            // No changes detected, just go back
            rpcClient.getVisualizerRpcClient()?.goBack();
        }
        setIsSaving(false);
    }

    return (
        <View>
            <TopNavigationBar projectPath={projectPath} />
            <TitleBar title="Service Class" subtitle="Edit Service Class" />
            <ViewContent padding>
                {!serviceClassModel &&
                    <LoadingContainer>
                        <ProgressRing />
                        <Typography variant="h3" sx={{ marginTop: '16px' }}>Loading...</Typography>
                    </LoadingContainer>
                }
                {serviceClassModel &&
                    <Container>
                        {serviceClassModel && (
                            <>
                                {serviceClassFields?.length > 0 && (
                                    <FormContainer>
                                        <FormHeader title={`Service Class Configuration`} />
                                        {filePath &&
                                            <ArtifactForm
                                                fileName={filePath}
                                                targetLineRange={{
                                                    startLine: { line: position.startLine, offset: position.startColumn },
                                                    endLine: { line: position.endLine, offset: position.endColumn }
                                                }}
                                                fields={serviceClassFields}
                                                onSubmit={handleOnSubmit}
                                                isSaving={isSaving}
                                            />
                                        }
                                    </FormContainer>
                                )}
                            </>
                        )}
                    </Container>
                }
            </ViewContent>
        </View >
    );
}
