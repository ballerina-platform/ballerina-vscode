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
// tslint:disable: jsx-no-multiline-js

import React, { useState } from 'react';

import { Codicon, Divider, LinkButton, Typography, ThemeColors } from '@wso2/ui-toolkit';
import styled from '@emotion/styled';
import { ParamEditor } from './ParamEditor';
import { ParamItem } from './ParamItem';
import { ConfigProperties, ParameterModel, HttpPayloadContext, PropertyModel, Type, Imports } from '@wso2/ballerina-core';
import { EntryPointTypeCreator } from '../../../../../../components/EntryPointTypeCreator';
import { AssistMark, CheckBoxField, useAssistSource } from '@wso2/ballerina-side-panel';
import { applyParameters, describeParameters, PARAMETER_GROUP } from './parametersAssist';

export interface ParametersProps {
    parameters: ParameterModel[];
    onChange: (parameters: ParameterModel[]) => void,
    schemas: ConfigProperties;
    readonly?: boolean;
    pathName?: string;
    showPayload: boolean;
    isNewResource?: boolean;
    payloadContext?: HttpPayloadContext;
}

const AddButtonWrapper = styled.div`
	margin: 8px 0;
`;

const AdvancedParamTitleWrapper = styled.div`
	display: flex;
	flex-direction: row;
`;

const OptionalConfigRow = styled.div`
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    margin-bottom: 8px;
    margin-top: 12px;
`;

const OptionalConfigButtonContainer = styled.div`
    display: flex;
    flex-direction: row;
    flex-grow: 1;
    justify-content: flex-end;
`;

const OptionalConfigContent = styled.div`
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-bottom: 16px;
`;

export function Parameters(props: ParametersProps) {
    const { parameters, readonly, onChange, schemas, showPayload, isNewResource = false, pathName, payloadContext } = props;

    const queryModel = schemas["query"] as ParameterModel;
    const headerModel = schemas["header"] as ParameterModel;
    const payloadModel = schemas["payload"] as ParameterModel;

    const normalParameters = parameters.filter(param => param.httpParamType && param.httpParamType !== "PAYLOAD");
    const payloadParameters = parameters.filter(param => param.httpParamType && param.httpParamType === "PAYLOAD");
    const advancedDisabledParameters = parameters.filter(param => !param.httpParamType && !param.enabled);
    const advancedEnabledParameters = parameters.filter(param => !param.httpParamType && param.enabled);
    const advancedAllParameters = parameters.filter(param => !param.httpParamType).sort((a, b) => b.metadata.label.localeCompare(a.metadata.label));

    useAssistSource({
        describe: () => ({ slots: [], groups: readonly ? [] : describeParameters(parameters, schemas, showPayload) }),
        apply: ({ groups = {} }) => onChange(applyParameters(parameters, schemas, groups)),
    });

    const [showOptionalConfigurations, setShowOptionalConfigurations] = useState(advancedEnabledParameters.length > 0);

    const handleShowOptionalConfigurations = () => {
        setShowOptionalConfigurations(true);
    };

    const handleHideOptionalConfigurations = () => {
        setShowOptionalConfigurations(false);
    };


    const [editModel, setEditModel] = useState<ParameterModel>(undefined);
    const [isNew, setIsNew] = useState<boolean>(false);
    const [editingIndex, setEditingIndex] = useState<number>(-1);

    const [showAdvanced, setShowAdvanced] = useState<boolean>(advancedEnabledParameters.length > 0);

    const [isTypeEditorOpen, setIsTypeEditorOpen] = useState<boolean>(false);


    const handleAdvanceParamToggle = () => {
        setShowAdvanced(!showAdvanced);
    };

    const onEdit = (parameter: ParameterModel) => {
        setIsNew(false);
        setEditModel(parameter);
        // Find and store the index of the parameter being edited
        const index = parameters.findIndex(p =>
            p.metadata?.label === parameter.metadata?.label &&
            p.name?.value === parameter.name?.value &&
            p.httpParamType === parameter.httpParamType
        );
        setEditingIndex(index);
    };

    const onAddParamClick = (httpParamType: "QUERY" | "HEADER") => {
        switch (httpParamType) {
            case "QUERY":
                queryModel.name.value = "";
                queryModel.httpParamType = httpParamType;
                setEditModel(queryModel);
                break;
            case "HEADER":
                headerModel.name.value = "";
                headerModel.httpParamType = httpParamType;
                setEditModel(headerModel);
                break;
        }
        setIsNew(true);
        setEditingIndex(-1);
    };

    const onAddPayloadClick = () => {
        // Open FormTypeEditor modal instead of ParamEditor
        setIsTypeEditorOpen(true);
    };

    const handleTypeCreated = (type: Type | string, imports?: Imports) => {
        // When a type is created, set it as the payload type
        const updatedPayloadModel = { ...payloadModel };
        updatedPayloadModel.name.value = "payload";
        updatedPayloadModel.type.value = typeof type === 'string' ? type : (type as Type).name;
        updatedPayloadModel.enabled = true;
        if (imports) {
            updatedPayloadModel.type.imports = imports;
        }

        // Check if we're editing an existing payload or adding a new one
        const existingPayloadIndex = parameters.findIndex(p => p.httpParamType === "PAYLOAD");

        if (existingPayloadIndex >= 0) {
            // Update existing editing model
            setEditModel(updatedPayloadModel);
        } else {
            // Add new payload parameter
            onChange([...parameters, updatedPayloadModel]);
        }
        // Close the modal
        setIsTypeEditorOpen(false);
    };

    const handleTypeEditorClose = () => {
        setIsTypeEditorOpen(false);
    };

    const onDelete = (param: ParameterModel) => {
        const updatedParameters = parameters.filter(p => p.metadata.label !== param.metadata.label || p.name.value !== param.name.value);
        onChange(updatedParameters);
        setEditModel(undefined);
        setEditingIndex(-1);
    };

    const onAdvanceDelete = (param: ParameterModel) => {
        parameters.forEach(p => {
            if (p.metadata.label === param.metadata.label) {
                param.enabled = false;
            }
        })
        onChange([...parameters]);
        setEditModel(undefined);
        setEditingIndex(-1);
    };

    const onAdvanceSaveParam = (param: ParameterModel) => {
        param.enabled = true;
        onChange(parameters.map(p => p.metadata.label === param.metadata.label ? param : p));
        setEditModel(undefined);
        setEditingIndex(-1);
    };

    const onAdvancedChecked = (param: ParameterModel, checked: boolean) => {
        param.enabled = checked;
        param.name.value = param.metadata.label.toLowerCase().replace(/ /g, "_");
        onChange(parameters.map(p => p.metadata.label === param.metadata.label ? param : p));
        setEditModel(undefined);
        setEditingIndex(-1);
    };

    const onChangeParam = (param: ParameterModel) => {
        setEditModel(param);
        // Update the parameters array in real-time for existing parameters
        if (!isNew && editingIndex >= 0) {
            const updatedParameters = [...parameters];
            updatedParameters[editingIndex] = param;
            onChange(updatedParameters);
        }
    };

    const generatePayloadName = () => {
        if (!pathName) {
            return "PayloadType";
        }

        // Extract valid segments
        const validSegments = pathName
            .replace(/^\/|\/$/g, '') // Remove leading/trailing slashes
            .split('/')
            .filter(segment => !segment.includes('[') && !segment.includes(']')) // Filter out parameter segments
            .map(segment => segment.replace(/[^a-zA-Z0-9]/g, '')) // Clean each segment
            .filter(segment => segment.length > 0); // Remove empty segments

        if (validSegments.length === 0) {
            return "PayloadType";
        }

        const camelCasePath = validSegments
            .map((segment, index) => index === 0
                ? segment.toLowerCase()
                : segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase()
            )
            .join('');

        return camelCasePath.charAt(0).toUpperCase() + camelCasePath.slice(1) + 'Payload';
    }

    const onSaveParam = (param: ParameterModel) => {
        param.enabled = true;
        if (isNew) {
            onChange([...parameters, param]);
            setIsNew(false);
        } else {
            // Use the editingIndex for more reliable updates
            if (editingIndex >= 0) {
                const updatedParameters = [...parameters];
                updatedParameters[editingIndex] = param;
                onChange(updatedParameters);
            } else {
                // Fallback to the original logic if index is not available
                onChange(parameters.map(p => p.metadata.label === param.metadata.label && p.name.value === param.name.value ? param : p));
            }
        }
        setEditModel(undefined);
        setEditingIndex(-1);
    };

    const onParamEditCancel = () => {
        setEditModel(undefined);
        setEditingIndex(-1);
    };

    const getParameterDescription = (label: string): string => {
        const descriptions: { [key: string]: string } = {
            "Request": "Access the complete HTTP request object including the request body (payload), all HTTP headers, query parameters, path parameters, and other request metadata. Use this to work with the entire incoming request context.",
            "Headers": "Access all HTTP headers sent by the client in the request. This includes standard headers like Content-Type, Authorization, User-Agent, and any custom headers. Use this to retrieve and process specific header values.",
            "Caller": "Access information about the caller/client making the request. This provides context about the service caller, including authentication details, caller identity, and caller-specific metadata. Use this for authorization and logging purposes."
        };
        return descriptions[label] || "Use this input to configure advanced parameters.";
    };

    // Helper function to collect parameter details for payload context
    const getParameterDetails = () => {
        const queryParams = normalParameters.filter(p => p.httpParamType === "QUERY");
        if (queryParams.length > 0) {
            return queryParams.map(param => ({
                name: param.name?.value || '',
                type: param.type?.value || '',
                defaulValue: (param.defaultValue as PropertyModel)?.value || ''
            }));
        }
        return [];
    };

    return (
        <div>
            {/* <---------------- Query Parameters Start ----------------> */}
            <div>
            {normalParameters.filter((param: ParameterModel) => param.httpParamType === "QUERY").length > 0 && (
                <Typography sx={{ marginBlockEnd: 10 }} variant="h4">Query Parameters</Typography>
            )}
            {normalParameters
                .filter((param: ParameterModel) => param.httpParamType === "QUERY")
                .map((param: ParameterModel, index) => (
                    <ParamItem
                        readonly={readonly}
                        key={`query-${index}`}
                        param={param}
                        onDelete={onDelete}
                        onEditClick={onEdit}
                    />
                ))}
            {editModel && editModel.httpParamType === "QUERY" &&
                <ParamEditor
                    isNew={isNew}
                    param={editModel}
                    onChange={onChangeParam}
                    onSave={onSaveParam}
                    onCancel={onParamEditCancel}
                    type="QUERY"
                />
            }
            {!readonly && (
                <AddButtonWrapper >
                    <LinkButton sx={readonly && { color: "var(--vscode-badge-background)" } || editModel && { opacity: 0.5, pointerEvents: 'none' }} onClick={editModel ? undefined : () => (!readonly && onAddParamClick("QUERY"))}>
                        <Codicon name="add" />
                        <>Query Parameter</>
                    </LinkButton>
                </AddButtonWrapper>
            )}
            <AssistMark fieldKey={PARAMETER_GROUP.QUERY} />
            </div>

            {/* <---------------- Header Parameters Start ----------------> */}
            <div>
                {normalParameters.filter((param: ParameterModel) => param.httpParamType === "HEADER").length > 0 && (
                    <Typography sx={{ marginBlockEnd: 10, marginTop: 20 }} variant="h4">Headers</Typography>
                )}
                {normalParameters
                    .filter((param: ParameterModel) => param.httpParamType === "HEADER")
                    .map((param: ParameterModel, index) => (
                        <ParamItem
                            readonly={readonly}
                            key={`header-${index}`}
                            param={param}
                            onDelete={onDelete}
                            onEditClick={onEdit}
                        />
                    ))}
                {editModel && editModel.httpParamType === "HEADER" &&
                    <ParamEditor
                        isNew={isNew}
                        param={editModel}
                        onChange={onChangeParam}
                        onSave={onSaveParam}
                        onCancel={onParamEditCancel}
                        type="HEADER"
                    />
                }
                {!readonly && (
                    <AddButtonWrapper >
                        <LinkButton sx={readonly && { color: "var(--vscode-badge-background)" } || editModel && { opacity: 0.5, pointerEvents: 'none' }} onClick={editModel ? undefined : () => (!readonly && onAddParamClick("HEADER"))}>
                            <Codicon name="add" />
                            <>Header</>
                        </LinkButton>
                    </AddButtonWrapper>
                )}
                <AssistMark fieldKey={PARAMETER_GROUP.HEADER} />
            </div>

            {/* <---------------- Normal Parameters End Query|HEADER ----------------> */}

            {/* <-------------------- Payload Parameters Start --------------------> */}
            <div>
            {showPayload && (
                <>
                    {payloadParameters.length > 0 && (
                        <Typography sx={{ marginBlockEnd: 10 }} variant="h4">Payload</Typography>
                    )}
                    {payloadParameters.map((param: ParameterModel, index) => (
                        <ParamItem
                            readonly={readonly}
                            key={index}
                            param={param}
                            onDelete={onDelete}
                            onEditClick={onEdit}
                        />
                    ))}
                </>
            )}

            {editModel && editModel.httpParamType === "PAYLOAD" &&
                <ParamEditor
                    isNew={isNew}
                    param={editModel}
                    onChange={onChangeParam}
                    onSave={onSaveParam}
                    onCancel={onParamEditCancel}
                    type="PAYLOAD"
                />
            }

            {showPayload && payloadParameters.length === 0 && !readonly && (
                <AddButtonWrapper >
                    <LinkButton sx={readonly && { color: "var(--vscode-badge-background)" } || editModel && { opacity: 0.5, pointerEvents: 'none' }} onClick={editModel ? undefined : (!readonly && onAddPayloadClick)}>
                        <Codicon name="add" />
                        <>Define Payload</>
                    </LinkButton>
                </AddButtonWrapper>
            )}
            <AssistMark fieldKey={PARAMETER_GROUP.PAYLOAD} />
            </div>
            {/* <-------------------- Payload Parameters End --------------------> */}

            {/* <-------------------- Advanced Parameters Start --------------------> */}

            {/* TODO: REMOVE THE OLD ADVANCED PARAMETERS */}
            {/* <AdvancedParamTitleWrapper>
                <Typography sx={{ marginBlockEnd: 10 }} variant="h4">Advanced Parameters</Typography>
                <LinkButton sx={{ marginTop: 12, marginLeft: 8 }} onClick={handleAdvanceParamToggle}> {showAdvanced ? "Hide" : "Show"} </LinkButton>
            </AdvancedParamTitleWrapper>
            {showAdvanced &&
                advancedDisabledParameters.map((param: ParameterModel, index) => (
                    <AddButtonWrapper >
                        <LinkButton sx={readonly && { color: "var(--vscode-badge-background)" } || editModel && { opacity: 0.5, pointerEvents: 'none' }} onClick={() => onEdit(param)}>
                            <Codicon name="add" />
                            <>{param.metadata.label}</>
                        </LinkButton>
                    </AddButtonWrapper>
                ))
            }
            {showAdvanced &&
                advancedEnabledParameters.map((param: ParameterModel, index) => (
                    <ParamItem
                        key={index}
                        param={param}
                        onDelete={onAdvanceDelete}
                        onEditClick={onEdit}
                    />
                ))
            }
            {editModel && !editModel.httpParamType &&
                <ParamEditor
                    param={editModel}
                    hideType={true}
                    onChange={onChangeParam}
                    onSave={onAdvanceSaveParam}
                    onCancel={onParamEditCancel}
                />
            }
            <Divider /> */}
            {/* <-------------------- Advanced Parameters End --------------------> */}

            {/* <-------------------- Advanced Parameters Checkbox Start --------------------> */}
            {!isNewResource && (
                <>
                    {((readonly && advancedEnabledParameters.length > 0) || !readonly) && (
                        <OptionalConfigRow>
                            Advanced Parameters
                            <OptionalConfigButtonContainer>
                                {!showOptionalConfigurations && (
                                    <LinkButton
                                        onClick={handleShowOptionalConfigurations}
                                        sx={{ fontSize: 12, padding: 8, color: ThemeColors.PRIMARY, gap: 4, userSelect: "none" }}
                                    >
                                        <Codicon name={"chevron-down"} iconSx={{ fontSize: 12 }} sx={{ height: 12 }} />
                                        Expand
                                    </LinkButton>
                                )}
                                {showOptionalConfigurations && (
                                    <LinkButton
                                        onClick={handleHideOptionalConfigurations}
                                        sx={{ fontSize: 12, padding: 8, color: ThemeColors.PRIMARY, gap: 4, userSelect: "none" }}
                                    >
                                        <Codicon name={"chevron-up"} iconSx={{ fontSize: 12 }} sx={{ height: 12 }} />
                                        Collapse
                                    </LinkButton>
                                )}
                            </OptionalConfigButtonContainer>
                        </OptionalConfigRow>
                    )}
                    {showOptionalConfigurations && (
                        <OptionalConfigContent>
                            {!readonly && advancedAllParameters.map((param: ParameterModel, index) => (
                                <CheckBoxField
                                    key={index}
                                    label={param.metadata.label.charAt(0).toUpperCase() + param.metadata.label.slice(1)}
                                    description={getParameterDescription(param.metadata.label)}
                                    checked={param.enabled}
                                    onChange={(checked) => onAdvancedChecked(param, checked)}
                                />
                            ))}
                            {readonly && advancedEnabledParameters.map((param: ParameterModel, index) => (
                                <CheckBoxField
                                    key={index}
                                    disabled={true}
                                    label={param.metadata.label.charAt(0).toUpperCase() + param.metadata.label.slice(1)}
                                    description={getParameterDescription(param.metadata.label)}
                                    checked={param.enabled}
                                    onChange={(checked) => onAdvancedChecked(param, checked)}
                                />
                            ))}
                        </OptionalConfigContent>
                    )}
                    <Divider />
                </>
            )}
            {/* <-------------------- Advanced Parameters Checkbox End --------------------> */}

            {/* FormTypeEditor Modal for Add Payload */}
            <EntryPointTypeCreator
                isOpen={isTypeEditorOpen}
                onClose={handleTypeEditorClose}
                onTypeCreate={handleTypeCreated}
                initialTypeName={generatePayloadName()}
                modalTitle={"Define Payload"}
                payloadContext={{
                    ...payloadContext,
                    paramDetails: getParameterDetails()
                }}
                modalWidth={650}
                modalHeight={600}
            />
        </div >
    );
}
