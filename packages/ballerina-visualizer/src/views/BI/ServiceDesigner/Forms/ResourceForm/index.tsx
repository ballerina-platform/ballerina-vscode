/* eslint-disable react-hooks/exhaustive-deps */
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

import React, { useEffect, useState } from 'react';
import { ActionButtons, Divider, SidePanelBody, Typography, ProgressIndicator, ThemeColors, Button, Icon, Tooltip, CheckBoxGroup, CheckBox } from '@wso2/ui-toolkit';
import { ResourcePath, verbs } from './ResourcePath/ResourcePath';
import { ResourceResponse } from './ResourceResponse/ResourceResponse';
import styled from '@emotion/styled';
import { getDefaultResponse, HTTP_METHOD } from '../../utils';
import { ConfigProperties, FunctionModel, ParameterModel, HttpPayloadContext, PropertyModel, ReturnTypeModel, ProjectStructureArtifactResponse } from '@wso2/ballerina-core';
import { Parameters } from './Parameters/Parameters';
import { PanelContainer } from '@wso2/ballerina-side-panel';
import { ResourceConfig } from './ResourceConfig/ResourceConfig';

namespace S {
	export const Grid = styled.div<{ columns: number }>`
        display: grid;
        grid-template-columns: repeat(${({ columns }: { columns: number }) => columns}, minmax(0, 1fr));
        gap: 8px;
        width: 100%;
        margin-top: 8px;
        margin-bottom: 12px;
    `;
	export const Component = styled.div<{ enabled?: boolean }>`
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 5px;
        padding: 12px;
        border: 1px solid ${ThemeColors.OUTLINE_VARIANT};
        border-radius: 5px;
        height: 36px;
        cursor: ${({ enabled }: { enabled?: boolean }) => (enabled ? "pointer" : "not-allowed")};
        font-size: 14px;
        min-width: 160px;
        max-width: 100%;
        ${({ enabled }: { enabled?: boolean }) => !enabled && "opacity: 0.5;"}
        &:hover {
            ${({ enabled }: { enabled?: boolean }) =>
			enabled &&
			`
                background-color: ${ThemeColors.PRIMARY_CONTAINER};
                border: 1px solid ${ThemeColors.HIGHLIGHT};
            `}
        }
    `;
	export const ComponentTitle = styled.div`
        white-space: nowrap;
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        display: block;
        word-break: break-word;
    `;
	export const IconContainer = styled.div`
        padding: 0 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        & svg {
            height: 16px;
            width: 16px;
        }
    `;
}

export interface ResourceFormProps {
	model: FunctionModel;
	isSaving: boolean;
	onSave: (functionModel: FunctionModel, openDiagram?: boolean) => void;
	onClose: () => void;
	isNew?: boolean;
	payloadContext?: HttpPayloadContext;
	filePath?: string;
	existingResources?: ProjectStructureArtifactResponse[];
}

export function ResourceForm(props: ResourceFormProps) {
	const { model, isSaving, onSave, onClose, isNew, payloadContext, filePath, existingResources } = props;

	const [functionModel, setFunctionModel] = useState<FunctionModel>(model);
	const [isPathValid, setIsPathValid] = useState<boolean>(false);

	const [createMore, setCreateMore] = useState<boolean>(false);
	const [method, setMethod] = useState<string>("");

	useEffect(() => {
		console.log("Function Model", model);
	}, []);

	const closeMethod = () => {
		setMethod("");
	}

	const setResourceMethod = (method: string) => {
		setMethod(method);
		const defaultStatusCode = getDefaultResponse(method as HTTP_METHOD);

		const updatedResponse = {
			...model.returnType.responses[0],
			statusCode: { ...model.returnType.responses[0].statusCode, value: defaultStatusCode }
		}

		const updatedResponses = [updatedResponse, ...model.returnType.responses.slice(1)];

		const updatedFunctionModel = {
			...model,
			accessor: { ...model.accessor, value: method },
			returnType: { ...model.returnType, responses: updatedResponses },
		};
		setFunctionModel(updatedFunctionModel as FunctionModel);
	}

	const onPathChange = (method: PropertyModel, path: PropertyModel) => {
		const updatedFunctionModel = {
			...functionModel,
			accessor: method,
			name: path,
		};
		setFunctionModel(updatedFunctionModel);
		console.log("Path,Method Change: ", updatedFunctionModel);
	}

	const onResourcePathError = (hasErros: boolean) => {
		setIsPathValid(!hasErros);
	}

	const handleParamChange = (params: ParameterModel[]) => {
		const updatedFunctionModel = {
			...functionModel,
			parameters: params
		};
		setFunctionModel(updatedFunctionModel);
		console.log("Parameter Change: ", updatedFunctionModel);
	};

	const handleResponseChange = (response: ReturnTypeModel) => {
		response.value = "";
		const updatedFunctionModel = {
			...functionModel,
			returnType: response
		};
		setFunctionModel(updatedFunctionModel);
		console.log("Response Change: ", updatedFunctionModel);
	};

	const handleConfigChange = (properties: ConfigProperties, value: any) => {
		const updatedFunctionModel = {
			...functionModel,
			properties: { ...functionModel.properties, ...properties }
		};
		setFunctionModel(updatedFunctionModel);
		console.log("Config Change: ", updatedFunctionModel);
	};

	const handleSave = () => {
		console.log("Saved Resource", functionModel);
		if (createMore) {
			closeMethod();
		}
		onSave(functionModel, !createMore);
	}

	const editForm = () => {
		return (
			<>
				{isSaving && <ProgressIndicator id="resource-loading-bar" />}
				<SidePanelBody>
					<ResourcePath method={functionModel.accessor} path={functionModel.name} onChange={onPathChange}
						onError={onResourcePathError} readonly={!functionModel.editable} existingResources={existingResources} />
					<Divider />
					<Parameters
						readonly={!functionModel.editable}
						showPayload={(functionModel.accessor.value && functionModel.accessor.value.toUpperCase() !== "GET")}
						parameters={functionModel.parameters}
						onChange={handleParamChange}
						schemas={functionModel.schema}
						pathName={functionModel?.name?.value}
						payloadContext={{
							...payloadContext,
							resourceBasePath: functionModel?.name?.value || '',
							resourceMethod: functionModel?.accessor?.value || '',
							resourceDocumentation: functionModel?.documentation?.value || ''
						}}
					/>
					<Typography sx={{ marginBlockEnd: 10 }} variant="h4">Responses</Typography>
					<ResourceResponse method={functionModel.accessor.value.toUpperCase() as HTTP_METHOD} response={functionModel.returnType} onChange={handleResponseChange} readonly={!functionModel.editable} />
					<ResourceConfig properties={functionModel.properties} filePath={filePath} onChange={handleConfigChange} readonly={!functionModel.editable} />
					<ActionButtons
						primaryButton={{ text: isSaving ? "Saving..." : "Save", onClick: handleSave, tooltip: isSaving ? "Saving..." : "Save", disabled: !isPathValid || isSaving || !functionModel.editable, loading: isSaving }}
						secondaryButton={{ text: "Cancel", onClick: onClose, tooltip: "Cancel", disabled: isSaving }}
						sx={{ justifyContent: "flex-end" }}
					/>
				</SidePanelBody>
			</>
		)
	}

	const newForm = () => {
		return (
			<>
				{isSaving && <ProgressIndicator id="resource-loading-bar" />}
				<SidePanelBody>
					{/* Render HTTP Methods as components using S.Component and S.Grid */}
					<div style={{ marginBottom: "16px" }}>
						<S.Grid columns={1}>
							{verbs.map((method: PropertyModel, idx: number) => (
								<S.Component
									key={method.value || idx}
									enabled={true}
									onClick={() => setResourceMethod(method.value)}
								>
									<S.ComponentTitle>
										{method.value}
									</S.ComponentTitle>
								</S.Component>
							))}
						</S.Grid>
					</div>
				</SidePanelBody>
				{/* This is for adding a http resource */}
				<PanelContainer
					title={`New Resource Configuration`}
					show={!!method}
					onClose={closeMethod}
					width={400}
				>
					<>
						{isSaving && <ProgressIndicator id="resource-loading-bar" />}
						<SidePanelBody>
							<ResourcePath method={functionModel.accessor} path={functionModel.name} onChange={onPathChange} isNew={true} onError={onResourcePathError} existingResources={existingResources} />
							<Divider />
							<Parameters
								isNewResource={true}
								showPayload={(functionModel.accessor.value && functionModel.accessor.value.toUpperCase() !== "GET")}
								parameters={functionModel.parameters}
								onChange={handleParamChange}
								schemas={functionModel.schema}
								pathName={functionModel?.name?.value}
								payloadContext={{
									...payloadContext,
									resourceBasePath: functionModel?.name?.value || '',
									resourceMethod: functionModel?.accessor?.value || '',
									resourceDocumentation: functionModel?.documentation?.value || ''
								}}
							/>
							<Typography sx={{ marginBlockEnd: 10 }} variant="h4">Responses</Typography>
							<ResourceResponse method={functionModel.accessor.value.toUpperCase() as HTTP_METHOD} response={functionModel.returnType} onChange={handleResponseChange} />
							<Divider sx={{ marginBottom: 30 }} />
							<Tooltip content='Keep adding more resources' containerSx={{ position: "fixed", width: "180px", marginLeft: 1 }}>
								<CheckBoxGroup columns={2}>
									<CheckBox label='Add more resources' checked={createMore} onChange={() => setCreateMore(!createMore)} />
								</CheckBoxGroup>
							</Tooltip>
							<ActionButtons
								primaryButton={{ text: isSaving ? "Saving..." : "Save", onClick: handleSave, tooltip: isSaving ? "Saving..." : "Save", disabled: !isPathValid || isSaving, loading: isSaving }}
								secondaryButton={{ text: "Cancel", onClick: closeMethod, tooltip: "Cancel", disabled: isSaving }}
								sx={{ justifyContent: "flex-end" }}
							/>
						</SidePanelBody>
					</>
				</PanelContainer >
			</>
		)
	}

	return isNew ? newForm() : editForm();
}
