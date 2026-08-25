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
import { Codicon, Dropdown, LinkButton, TextField, Typography } from '@wso2/ui-toolkit';
import styled from '@emotion/styled';
import { ParameterModel, ProjectStructureArtifactResponse, PropertyModel } from '@wso2/ballerina-core';
import { SegmentParam } from '@wso2/ballerina-side-panel';
import { parseResourcePath } from '../Utils/ResourcePathParser';
import { getColorByMethod } from '../../../../../../utils/utils';
import { ParamEditor } from '../Parameters/ParamEditor';
import { removeForwardSlashes, sanitizedHttpPath } from '../../../utils';


const MethodLabel = styled.label`
    display: flex;
	margin-bottom: 5px;
    font-size: var(--vscode-editor-font-size);
	width: 100px;
`;

const MethodBox = styled.div`
    display: flex;
    justify-content: center;
    height: 25px;
    min-width: 70px;
    width: auto;
    margin-left: 0px;
    text-align: center;
    padding: 3px 5px 3px 5px;
    background-color: ${(p: any) => p.color};
    color: #FFF;
    align-items: center;
    font-weight: bold;
`;

export const verbs = [
	{
		content: 'GET',
		id: 'GET',
		value: 'GET'
	},
	{
		content: 'POST',
		id: 'POST',
		value: 'POST'
	},
	{
		content: 'PUT',
		id: 'PUT',
		value: 'PUT'
	},
	{
		content: 'DELETE',
		id: 'DELETE',
		value: 'DELETE'
	},
	{
		content: 'PATCH',
		id: 'PATCH',
		value: 'PATCH'
	},
	{
		content: 'DEFAULT',
		id: 'DEFAULT',
		value: 'DEFAULT'
	}
];

const PathContainer = styled.div`
    display: flex;
	flex-direction: row;
`;

const AddButtonWrapper = styled.div`
    display: flex;
	justify-content: flex-end;
	margin: 8px 0;
`;

export interface ResourcePathProps {
	path: PropertyModel;
	method: PropertyModel;
	onChange: (method: PropertyModel, path: PropertyModel) => void;
	onError: (hasErros: boolean) => void;
	isNew?: boolean;
	/**
	 * Whether the method renders as a fixed label instead of a dropdown. Defaults to `isNew`, which
	 * is how the resource designer has always drawn its add form. `isNew` separately controls the
	 * collision check, so a caller that adds a resource but lets the user pick the verb sets this.
	 */
	fixedMethod?: boolean;
	readonly?: boolean;
	existingResources?: ProjectStructureArtifactResponse[];
}

const PATH_PARAM_SEGMENT_REGEX = /^\[[^\]]+\]$/;

export function normalizeResourcePathId(resourceId: string): string {
	const parts = resourceId.split('#');
	if (parts.length > 0) {
		parts[0] = parts[0].toLowerCase();
	}
	return parts.join('#');
}

export function getResourcePathId(method: PropertyModel, path: PropertyModel | string): string {
	const pathValue = typeof path === 'string' ? path : path.value as string;
	return normalizeResourcePathId(`${method.value?.toLowerCase()}#${sanitizedHttpPath(pathValue)}`);
}

function hasSameResourcePathPattern(pathA: string, pathB: string): boolean {
	const segmentsA = pathA.split('/');
	const segmentsB = pathB.split('/');

	if (segmentsA.length !== segmentsB.length) {
		return false;
	}

	return segmentsA.every((segment, index) => {
		const existingSegment = segmentsB[index];
		const isPathParam = PATH_PARAM_SEGMENT_REGEX.test(segment);
		const isExistingPathParam = PATH_PARAM_SEGMENT_REGEX.test(existingSegment);
		return segment === existingSegment ||
			isPathParam ||
			isExistingPathParam;
	});
}

function isDuplicateResourcePath(pathID: string, existingPathID: string): boolean {
	if (pathID === existingPathID) {
		return true;
	}

	const [method, path] = pathID.split('#');
	const [existingMethod, existingPath] = existingPathID.split('#');
	return method === existingMethod && hasSameResourcePathPattern(path, existingPath);
}

export function ResourcePath(props: ResourcePathProps) {
	const { method, path, onChange, onError, isNew, readonly, existingResources } = props;
	const methodIsFixed = props.fixedMethod ?? isNew;

	const [inputValue, setInputValue] = useState('');
	const [initialPathID] = useState(() => getResourcePathId(method, path));
	const [resourcePathErrors, setResourcePathErrors] = useState<string>("");
	const [editModel, setEditModel] = useState<ParameterModel | undefined>(undefined);
	const [showParamEditor, setShowParamEditor] = useState<boolean>(false);

	useEffect(() => {
		const resourePathStr = path.value ? path.value : "";
		onError(!resourePathStr);
		setInputValue(resourePathStr);
	}, []);

	useEffect(() => {
		if (inputValue) {
			handleBlur();
		}
	}, [inputValue]);

	const handleMethodChange = (value: string) => {
		const updatedMethod = { ...method, value: value.toLowerCase() };
		onChange(updatedMethod, path);
		handleBlur(updatedMethod);
	};

	const handlePathChange = (value: string) => {
		setInputValue(value);
		onChange(method, { ...path, value });
	};

	const handleBlur = (selectedMethod: PropertyModel = method) => {
		const { errors, valid, segments } = parseResourcePath(inputValue);
		if (errors.length > 0) {
			onError(true);
			setResourcePathErrors(errors[0].message);
			return;
		}

		// Path ID ex: get#foo/bar
		const pathID = getResourcePathId(selectedMethod, inputValue);
		// Get the paths and split by # to lowercase the method and concat again to get the path ID
		const existingResourcePaths = existingResources?.map((resource) => normalizeResourcePathId(resource.id));
		if (existingResourcePaths?.some((existingPathID) => {
			if (!isNew && existingPathID === initialPathID) {
				return false;
			}
			return isDuplicateResourcePath(pathID, existingPathID);
		})) {
			onError(true);
			setResourcePathErrors("Resource path already exists for the selected HTTP method");
			return;
		}

		let allPathParams: string[] = [];
		for (let i = 0; i < segments.length; i++) {
			const segment = segments[i];
			if (segment.type === 'param') {
				const param = segment as SegmentParam;
				const paramName = param.paramName;
				if (paramName && allPathParams.includes(paramName)) {
					onError(true);
					setResourcePathErrors(`Duplicate path parameter: ${paramName}`);
					return;
				}
				allPathParams.push(paramName);
			}
		}
		setResourcePathErrors("");
		onError(false);
	}

	const handlePathAdd = () => {
		// Create a new parameter model for path parameter
		const newPathParam: ParameterModel = {
			name: {
				value: 'param',
				types: [{ fieldType: 'IDENTIFIER', selected: false }],
				placeholder: 'param',
				enabled: true
			},
			type: {
				value: 'string',
				types: [{ fieldType: 'EXPRESSION', selected: false }],
				placeholder: 'string',
				enabled: true
			},
			kind: 'REQUIRED',
			enabled: true,
			metadata: {
				label: 'Path Parameter',
				description: 'Path parameter configuration'
			}
		};
		setEditModel(newPathParam);
		setShowParamEditor(true);
	};

	const onChangeParam = (param: ParameterModel) => {
		setEditModel(param);
	};

	const onSaveParam = (param: ParameterModel) => {
		// Extract the parameter name and type from the saved param
		const paramName = param.name.value || 'param';
		const paramType = param.type.value || 'string';

		// Build the path parameter string: [type paramName]
		const pathParamStr = `[${paramType} ${paramName}]`;

		// Append to existing path
		const value = !path.value || path.value === '' ? pathParamStr : `${path.value}/${pathParamStr}`;
		setInputValue(value);
		onChange(method, { ...path, value });

		// Close the editor
		setShowParamEditor(false);
		setEditModel(undefined);
	};

	const onParamEditCancel = () => {
		setShowParamEditor(false);
		setEditModel(undefined);
	};


	return (
		<>
			<PathContainer>
				<div
					style={{
						width: 100,
						marginRight: methodIsFixed ? 10 : 0
					}}
				>
					{!methodIsFixed && !readonly && (
						<Dropdown
							sx={{ width: 100, background: getColorByMethod(method.value?.toUpperCase()), color: "#fff" }}
							isRequired
							errorMsg=""
							id="drop-down"
							items={verbs}
							label="HTTP Method"
							onValueChange={handleMethodChange}
							value={method.value.toUpperCase() || method.placeholder.toUpperCase()}
						/>
					)}
					{(methodIsFixed || readonly) && (
						<>
							<MethodLabel>HTTP Method</MethodLabel>
							<MethodBox color={getColorByMethod(method.value?.toUpperCase())}>
								{method.value.toUpperCase()}
							</MethodBox>
						</>
					)}
				</div>
				<TextField
					sx={{ marginLeft: methodIsFixed ? 0 : 15, flexGrow: 1 }}
					autoFocus
					required
					errorMsg={resourcePathErrors}
					label="Resource Path"
					size={70}
					onTextChange={(input) => {
						handlePathChange(input);
					}}
					disabled={readonly}
					onKeyUp={() => handleBlur()}
					onBlur={() => handleBlur()}
					placeholder="path/foo"
					value={removeForwardSlashes(path.value as string)}
					onFocus={(e) => e.target.select()}
				/>
			</PathContainer>
			<>
				{showParamEditor && editModel ? (
					<ParamEditor
						param={editModel}
						onChange={onChangeParam}
						onSave={onSaveParam}
						onCancel={onParamEditCancel}
						type="PATH"
						isNew={true}
					/>
				) : (
					!readonly && (
						<AddButtonWrapper>
							<LinkButton onClick={handlePathAdd} >
								<Codicon name="add" />
								<>Path Param</>
							</LinkButton>
						</AddButtonWrapper>
					)
				)}
			</>
		</>
	);
}
