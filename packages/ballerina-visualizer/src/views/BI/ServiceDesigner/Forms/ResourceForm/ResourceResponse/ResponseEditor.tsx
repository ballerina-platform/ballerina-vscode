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

import { useEffect, useState, useRef } from 'react';

import { Divider, OptionProps, Typography } from '@wso2/ui-toolkit';
import { EditorContainer, EditorContent } from '../../../styles';
import { getPrimaryInputType, LineRange, PropertyModel, StatusCodeResponse, VisibleTypeItem, VisibleTypesResponse } from '@wso2/ballerina-core';
import { TypeHelperContext } from '../../../../../../constants';
import { getDefaultResponse, getTitleFromStatusCodeAndType, HTTP_ENUM_TYPES, HTTP_METHOD } from '../../../utils';
import { FormField, FormImports, FormValues } from '@wso2/ballerina-side-panel';
import ArtifactForm from '../../../../Forms/ArtifactForm';
import { useRpcContext } from '@wso2/ballerina-rpc-client';
import { getImportsForProperty } from '../../../../../../utils/bi';


export interface ParamProps {
    index: number;
    method: HTTP_METHOD;
    response: StatusCodeResponse;
    isEdit: boolean;
    onSave: (param: StatusCodeResponse, index: number) => void;
    onCancel?: (id?: number) => void;
}

export function ResponseEditor(props: ParamProps) {
    const { method, index, response, isEdit, onSave, onCancel } = props;

    const { rpcClient } = useRpcContext();

    const [filePath, setFilePath] = useState<string>('');
    const [responseCodes, setResponseCodes] = useState<VisibleTypesResponse>([]);

    const [targetLineRange, setTargetLineRange] = useState<LineRange>();

    const [newFields, setNewFields] = useState<FormField[]>([]);
    const newFieldsRef = useRef<FormField[]>([]);

    useEffect(() => {
        rpcClient.getServiceDesignerRpcClient().getResourceReturnTypes({ filePath: undefined, context: TypeHelperContext.HTTP_STATUS_CODE }).then((res) => {
            setResponseCodes(res);
            rpcClient.getVisualizerRpcClient().joinProjectPath({ segments: ['main.bal'] }).then((response) => {
                setFilePath(response.filePath);
            });
        });
    }, []);

    const handleOnCancel = () => {
        onCancel(index);
    };

    const convertPropertyToFormField = (property: PropertyModel, items?: string[]) => {
        const converted: FormField = {
            key: "",
            label: property.metadata.label,
            type: getPrimaryInputType(property.types)?.fieldType,
            optional: property.optional,
            editable: property.editable,
            enabled: property.enabled,
            advanced: property.advanced,
            documentation: property.metadata.description,
            value: property.value,
            items: property.items || items,
            diagnostics: property.diagnostics,
            types: property.types,
        }
        return converted;
    }

    const updateNewFields = (res: StatusCodeResponse, hasBody: boolean = true) => {
        const NO_BODY_TYPES = ["http:Response", "http:NoContent", "error"];
        const defaultItems = HTTP_ENUM_TYPES;

        // Special Condition to check http:Response to re-direct to Dynamic Status code
        if (NO_BODY_TYPES.includes(res.type.value)) {
            res.statusCode.value = "";
            // Handle the error type to set the default status code to 500
            if (res.type.value === "error") {
                res.statusCode.value = "500";
            }
            hasBody = false;
        }

        const fields: FormField[] = [
            {
                ...convertPropertyToFormField(res.statusCode),
                key: `statusCode`,
                value: getTitleFromStatusCodeAndType(responseCodes, res.statusCode.value, res.type.value),
                itemOptions: getCategorizedOptions(responseCodes),
                onValueChange: (value: string | boolean) => {
                    const responseCodeData = responseCodes.find(code => getTitleFromStatusCodeAndType(responseCodes, code.labelDetails.detail, code.detail) === value);
                    res.statusCode.value = responseCodeData.labelDetails.detail;
                    const description = responseCodeData.labelDetails.description as string;
                    res.type.value = responseCodeData.detail;
                    if (NO_BODY_TYPES.includes(responseCodeData.detail) || description === "User-Defined") {
                        updateNewFields(res, false);
                    } else {
                        updateNewFields(res, true);
                    }
                }
            }
        ];

        if (hasBody) {
            fields.push({
                ...convertPropertyToFormField(res.body),
                key: `body`,
                onValueChange: (value: string | boolean) => {
                    switch (value) {
                        case "json":
                            res.mediaType.value = "application/json";
                            break;
                        case "xml":
                            res.mediaType.value = "application/xml";
                            break;
                        case "string":
                            res.mediaType.value = "text/plain";
                            break;
                    }
                    // Update the mediaType field in the fields array
                    const updatedFields = newFieldsRef.current.map(field => {
                        if (field.key === 'mediaType') {
                            return {
                                ...field,
                                value: res.mediaType.value,
                                defaultValue: res.mediaType.value
                            };
                        }
                        if (field.key === 'body') {
                            return {
                                ...field,
                                value: value as string,
                                defaultValue: value as string
                            };
                        }
                        return field;
                    });
                    newFieldsRef.current = updatedFields;
                    setNewFields([...updatedFields]);
                }
            });
            if (res.mediaType) {
                fields.push({
                    ...convertPropertyToFormField(res.mediaType),
                    type: "AUTOCOMPLETE",
                    items: ["application/json", "application/xml", "application/x-www-form-urlencoded", "multipart/form-data", "text/plain"],
                    key: `mediaType`,
                    types: [{ fieldType: "AUTOCOMPLETE", selected: true }],
                    defaultValue: res.mediaType.value,
                });
            }
            if (response.editable || res.headers.value !== undefined) {
                fields.push({
                    ...convertPropertyToFormField(res.headers, defaultItems),
                    key: `headers`,
                });
            }
            if (response.editable) {
                fields.push({
                    ...convertPropertyToFormField(res.name),
                    key: `check`,
                    type: "FLAG",
                    optional: true,
                    types: [{ fieldType: "FLAG", selected: false }],
                    label: "Make this response reusable",
                    documentation: "Check this option to make this response reusable",
                    onValueChange: (value: string | boolean) => {
                        if (value === true) {

                            // Get a default value for the response name
                            const responseCodeData = responseCodes.find(code => code.labelDetails.detail === res.statusCode.value);
                            const responseCodeName = responseCodeData?.label || "";

                            // Default name for the response: removes spaces from response code name and appends 'Response'. Example: AcceptedResponse.
                            const defaultName = `${responseCodeName.replace(/\s+/g, '')}Response`;

                            // When checked, add the name field after the checkbox
                            const nameField: FormField = {
                                ...convertPropertyToFormField(res.name),
                                key: `name`,
                                value: defaultName,
                                defaultValue: defaultName,
                                // The response type is declared with the name as given, so it must be valid source
                                sourceFormName: true
                            };
                            // Insert name field right after the checkbox
                            const checkboxIndex = newFieldsRef.current.findIndex(f => f.key === 'check');
                            newFieldsRef.current.splice(checkboxIndex + 1, 0, nameField);
                            newFieldsRef.current = [...newFieldsRef.current];
                            setNewFields([...newFieldsRef.current]);
                        } else {
                            // When unchecked, remove the name field and clear its value
                            res.name.value = "";
                            const filteredFields = newFieldsRef.current.filter(f => f.key !== 'name');
                            newFieldsRef.current = [...filteredFields];
                            setNewFields([...newFieldsRef.current]);
                        }
                    }
                });
            }

            // If name already has a value, add the name field by default
            if (res.name.value) {
                fields.push({
                    ...convertPropertyToFormField(res.name),
                    key: `name`,
                    label: "Response Name",
                    documentation: "Enter a unique name for this reusable response",
                    type: "STRING",
                    // The response type is declared with the name as given, so it must be valid source
                    sourceFormName: true
                });
            }
        }

        newFieldsRef.current = [...fields];
        setNewFields([...newFieldsRef.current]);
    };

    useEffect(() => {
        if (responseCodes?.length > 0) {
            updateNewFields(response);
        }
    }, [response, responseCodes]);


    const existingFields: FormField[] = [
        {
            ...convertPropertyToFormField(response.type),
            key: `type`,
        }
    ];


    const isValidResponse = (dataValues: FormValues) => {
        if (dataValues['name']) {
            return true;
        }
        const code = responseCodes.find(code => getTitleFromStatusCodeAndType(responseCodes, code.labelDetails.detail, code.detail) === dataValues['statusCode']).labelDetails.detail;
        const defaultCode = getDefaultResponse(method);

        // Set optional false for the response name
        response.name.optional = false;
        response.name.diagnostics = [{ severity: "ERROR", message: "Response Name Required" }]

        // Set all the other values
        response.statusCode.value = String(code);
        response.body.value = dataValues['body'];
        response.name.value = dataValues['name'];
        response.headers.values = dataValues['headers'];
        response.mediaType.value = dataValues['mediaType'];

        // if (code === defaultCode) { // Case 1: Use select the default response success for the accessor
        //     // If the user add a header type then user should fill the name field as well
        //     if (dataValues['headers'] && dataValues['headers'].length > 0) {
        //         updateNewFields({ ...response });
        //         return false;
        //     }
        // } else { // Case 2: User select a response other than the default success response
        //     // If user add a body or header values then user must add a name.
        //     if (dataValues['body'] || (dataValues['headers'] && dataValues['headers'].length > 0)) {
        //         updateNewFields({ ...response });
        //         return false;
        //     }
        // }
        return true;
    }


    const handleOnNewSubmit = (dataValues: FormValues, formImports: FormImports) => {
        console.log("Add New Response: ", dataValues);
        if (isValidResponse(dataValues)) {
            // Set the values
            const code = responseCodes.find(code => getTitleFromStatusCodeAndType(responseCodes, code.labelDetails.detail, code.detail) === dataValues['statusCode']).labelDetails.detail;
            response.statusCode.value = String(code);
            response.body.value = dataValues['body'];
            response.name.value = dataValues['name'];
            response.headers.values = dataValues['headers'];
            response.mediaType.value = dataValues['mediaType'];
            response.body.imports = getImportsForProperty('body', formImports);
            onSave(response, index);
        }
    }

    useEffect(() => {
        if (rpcClient) {
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

    // Helper to create a header option (non-selectable)
    const createHeaderOption = (label: string, marginBlockEnd: number = 3): OptionProps => ({
        id: `header-${label}`,
        content: (
            <Typography sx={{ marginBlockEnd, marginTop: marginBlockEnd === 0 ? 0 : 16 }} variant="caption">{label}</Typography>
        ),
        value: `header-${label}`,
        disabled: true, // Make header non-selectable
    });

    // Helper to create a regular option
    const createOption = (item: VisibleTypeItem): OptionProps => ({
        id: `${item.labelDetails.detail}-${item.detail}`,
        content: (
            <span style={{ padding: "4px" }}>
                {item.labelDetails.detail !== "Dynamic" ? `${item.labelDetails.detail} ` : "Dynamic"} - {item.label}
            </span>
        ),
        value: `${item.labelDetails.detail} - ${item.label}`,
    });

    // Main function to categorize and flatten the list
    function getCategorizedOptions(responseCodes: VisibleTypesResponse): OptionProps[] {
        const dynamic = responseCodes.filter(i => i.detail === "http:Response");
        const error = responseCodes.filter(i => i.detail === "error");
        const userDefined = responseCodes.filter(i => i.labelDetails.description === "User-Defined");
        const preBuilt = responseCodes.filter(i =>
            ["1XX", "2XX", "3XX", "4XX", "5XX"].includes(i.labelDetails.description)
        );
        let options: OptionProps[] = [];

        if (userDefined.length) {
            options.push(createHeaderOption("User Defined Responses", 0));
            options = options.concat(userDefined.map(createOption));
        }
        if (preBuilt.filter(i => i.labelDetails.description === "2XX").length > 0) {
            options.push(createHeaderOption("2XX - Success", userDefined.length > 0 ? 3 : 0));
            options = options.concat(preBuilt.filter(i => i.labelDetails.description === "2XX").map(createOption));
        }
        if (preBuilt.filter(i => i.labelDetails.description === "1XX").length > 0) {
            options.push(createHeaderOption("1XX - Informational"));
            options = options.concat(preBuilt.filter(i => i.labelDetails.description === "1XX").map(createOption));
        }
        if (preBuilt.filter(i => i.labelDetails.description === "3XX").length > 0) {
            options.push(createHeaderOption("3XX - Redirection"));
            options = options.concat(preBuilt.filter(i => i.labelDetails.description === "3XX").map(createOption));
        }
        if (preBuilt.filter(i => i.labelDetails.description === "4XX").length > 0) {
            options.push(createHeaderOption("4XX - Client Error"));
            options = options.concat(preBuilt.filter(i => i.labelDetails.description === "4XX").map(createOption));
        }
        if (preBuilt.filter(i => i.labelDetails.description === "5XX").length > 0) {
            options.push(createHeaderOption("5XX - Server Error"));
            options = options.concat(preBuilt.filter(i => i.labelDetails.description === "5XX").map(createOption));
        }
        if (error.length) {
            options.push(createHeaderOption("Error Response"));
            options = options.concat(error.map(createOption));
        }
        if (dynamic.length) {
            options.push(createHeaderOption("Infer from Response"));
            options = options.concat(dynamic.map(createOption));
        }
        return options;
    }

    return (
        <EditorContainer>
            <EditorContent>
                <Typography sx={{ marginBlockEnd: 0, marginTop: 5 }} variant="h4">Response Configuration</Typography>
            </EditorContent>
            <Divider />
            {filePath && targetLineRange &&
                <ArtifactForm
                    fileName={filePath}
                    targetLineRange={targetLineRange}
                    fields={newFields}
                    onBack={handleOnCancel}
                    onSubmit={handleOnNewSubmit}
                    submitText={isEdit ? "Save" : "Add"}
                    nestedForm={true}
                    helperPaneSide='left'
                />
            }
        </EditorContainer >
    );
}
