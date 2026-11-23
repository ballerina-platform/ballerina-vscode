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

import { useEffect, useState } from 'react';
import styled from '@emotion/styled';
import { ConfigProperties, getPrimaryInputType, LineRange, RecordTypeField } from '@wso2/ballerina-core';
import { FormField, FormValues } from '@wso2/ballerina-side-panel';
import ArtifactForm, { AssistSubject } from '../../../../Forms/ArtifactForm';
import { useRpcContext } from '@wso2/ballerina-rpc-client';

const ResourceConfigContainer = styled.div`
   margin-bottom: 25px;
   & > .side-panel-body {
		padding: 0px;
   }
`;

export interface ResourceConfigProps {
	properties: ConfigProperties;
	filePath: string;
	onChange: (properties: ConfigProperties, value: any) => void;
	readonly?: boolean;
	assistSubject?: AssistSubject;
}

export function ResourceConfig(props: ResourceConfigProps) {
	const { properties, filePath, onChange, readonly, assistSubject } = props;

	const { rpcClient } = useRpcContext();

	const [targetLineRange, setTargetLineRange] = useState<LineRange>();
	const [configFields, setConfigFields] = useState<FormField[]>([]);
	const [recordTypeFields, setRecordTypeFields] = useState<RecordTypeField[]>([]);

	useEffect(() => {
		setConfigFields(convertConfig(properties, readonly));
		// Extract fields with typeMembers where kind is RECORD_TYPE
		if (recordTypeFields?.length === 0) {
			const recordTypeFields: any[] = Object.entries(properties)
				.filter(([_, property]) =>
					getPrimaryInputType(property.types)?.typeMembers &&
					getPrimaryInputType(property.types)?.typeMembers.some(member => member.kind === "RECORD_TYPE")
				)
				.map(([key, property]) => ({
					key,
					property,
					recordTypeMembers: getPrimaryInputType(property.types)?.typeMembers.filter(member => member.kind === "RECORD_TYPE")
				}));

			setRecordTypeFields(recordTypeFields as RecordTypeField[]);
		}
	}, []);


	useEffect(() => {
		if (filePath) {
			rpcClient
				.getBIDiagramRpcClient()
				.getEndOfFile({ filePath })
				.then((res) => {
					setTargetLineRange({
						startLine: res,
						endLine: res,
					});
				});
		}
	}, [filePath, rpcClient]);


	const handleChange = (fieldKey: string, value: any, allValues: FormValues) => {
		const updatedProperties = updateConfig(fieldKey, value, properties);
		onChange(updatedProperties, value);
	};

	const checkReadOnly = (fields: FormField[]) => {
		return readonly && fields.every(field => field.value === undefined || field.value === null || field.value === "");
	};


	return (
		<ResourceConfigContainer>
			{configFields.length > 0 && filePath && targetLineRange && !checkReadOnly(configFields) &&
				<ArtifactForm
					fileName={filePath}
					fields={configFields}
					targetLineRange={targetLineRange}
					onChange={handleChange}
					recordTypeFields={recordTypeFields}
					nestedForm={true}
					compact={true}
					helperPaneSide='left'
					onSubmit={() => { }}
					hideSaveButton={true}
					assistSubject={assistSubject}
				/>
			}
		</ResourceConfigContainer>
	);
}


function convertConfig(properties: ConfigProperties, readonly: boolean): FormField[] {
	const formFields: FormField[] = [];
	for (const key in properties) {
		const expression = properties[key];
		const formField: FormField = {
			key: key,
			label: expression?.metadata.label || key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, str => str.toUpperCase()),
			type: getPrimaryInputType(expression.types)?.fieldType,
			documentation: expression?.metadata.description || "",
			editable: expression.editable && !readonly,
			enabled: expression.enabled ?? true,
			optional: expression.optional,
			value: expression.value,
			types: expression.types,
			advanced: expression.value ? false : true,
			diagnostics: [],
			items: expression.items,
			placeholder: expression.placeholder,
			lineRange: expression?.codedata?.lineRange
		}
		formFields.push(formField);
	}
	return formFields;
}

function updateConfig(fieldKey: string, value: any, properties: ConfigProperties): ConfigProperties {
	properties[fieldKey].value = value;
	return properties;
}
