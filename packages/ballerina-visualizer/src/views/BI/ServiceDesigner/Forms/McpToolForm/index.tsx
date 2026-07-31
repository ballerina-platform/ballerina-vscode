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

import { useState, useEffect } from "react";
import {
    FunctionModel,
    LineRange,
    ParameterModel,
    ConfigProperties,
    PropertyModel,
    RecordTypeField,
    Property,
    PropertyTypeMemberInfo,
    getPrimaryInputType,
} from "@wso2/ballerina-core";
import { FormField, FormImports, FormValues, Parameter } from "@wso2/ballerina-side-panel";
import { getImportsForProperty } from "../../../../../utils/bi";
import ArtifactForm from "../../../Forms/ArtifactForm";
import {
    McpTransportParams,
    deriveMcpAdvancedParams,
    deriveMcpMetaParam,
    isMcpAdvancedType,
    isMcpHeaderParam,
    isMcpMetaParam,
    isMcpSessionParam,
} from "./McpTransportParams";

interface McpToolFormProps {
    model: FunctionModel;
    filePath: string;
    lineRange: LineRange;
    isServiceClass?: boolean;
    // True when the enclosing service is an mcp:StreamableHttpService, which is the only case where
    // tools may bind transport-specific request info (@http:Header, http:Request, http:Headers).
    isStreamableHttp?: boolean;
    onSave: (model: FunctionModel) => void;
    onClose: () => void;
    isSaving: boolean;
}

export function McpToolForm(props: McpToolFormProps) {
    console.log("McpToolForm props: ", props);
    const { model: initialModel, onSave, onClose, filePath, lineRange, isServiceClass, isStreamableHttp, isSaving } = props;
    const [fields, setFields] = useState<FormField[]>([]);
    const [recordTypeFields, setRecordTypeFields] = useState<RecordTypeField[]>([]);
    const [headerParams, setHeaderParams] = useState<ParameterModel[]>([]);
    const [advancedParams, setAdvancedParams] = useState<ParameterModel[]>([]);
    const [metaParam, setMetaParam] = useState<ParameterModel | undefined>(() => deriveMcpMetaParam(initialModel.parameters ?? []));
    const [model] = useState<FunctionModel>(() => {
        const cloned = structuredClone(initialModel);
        const properties = cloned.properties ?? {};
        if (!properties.toolDescription) {
            properties.toolDescription = {
                metadata: {
                    label: "Tool Description",
                    description: "Description of what this MCP tool does",
                },
                placeholder: "Describe what this tool does...",
                types: [{ fieldType: "STRING", ballerinaType: "string", selected: false }],
                value: "",
                enabled: true,
                editable: true,
                optional: true,
                advanced: false,
            };
        }
        cloned.properties = properties;
        return cloned;
    });

    const handleParamChange = (param: Parameter) => {
        const name = `${param.formValues["variable"]}`;
        const type = `${param.formValues["type"]}`;
        const hasDefaultValue =
            Object.keys(param.formValues).includes("defaultable") &&
            param.formValues["defaultable"] !== undefined &&
            param.formValues["defaultable"] !== "";

        const defaultValue = hasDefaultValue ? `${param.formValues["defaultable"]}`.trim() : "";
        let value = `${type} ${name}`;
        if (defaultValue) {
            value += ` = ${defaultValue}`;
        }
        return {
            ...param,
            key: name,
            value: value,
        };
    };

    const getFunctionParametersList = (params: Parameter[]) => {
        const paramList: ParameterModel[] = [];
        const paramFields = convertSchemaToFormFields(model.schema);

        params.forEach((param) => {
            // Find matching field configurations from schema
            const typeField = paramFields.find((field) => getPrimaryInputType(field.types)?.fieldType === "TYPE");
            const nameField = paramFields.find((field) => field.key === "variable");
            const defaultField = paramFields.find((field) => field.key === "defaultable");
            const documentationField = paramFields.find((field) => field.key === "documentation");

            paramList.push({
                kind: "REQUIRED",
                enabled: typeField?.enabled ?? true,
                editable: typeField?.editable ?? true,
                advanced: typeField?.advanced ?? false,
                optional: typeField?.optional ?? false,
                type: {
                    value: param.formValues["type"] as string,
                    types: typeField?.types,
                    isType: true,
                    optional: typeField?.optional,
                    advanced: typeField?.advanced,
                    addNewButton: false,
                    enabled: typeField?.enabled,
                    editable: typeField?.editable,
                    imports: param?.imports || {},
                },
                name: {
                    value: param.formValues["variable"] as string,
                    types: nameField?.types,
                    isType: false,
                    optional: nameField?.optional,
                    advanced: nameField?.advanced,
                    addNewButton: false,
                    enabled: nameField?.enabled,
                    editable: nameField?.editable,
                },
                defaultValue: {
                    value: param.formValues["defaultable"],
                    types: defaultField?.types || [{ fieldType: "STRING", ballerinaType: "string", selected: false }],
                    isType: false,
                    optional: defaultField?.optional,
                    advanced: defaultField?.advanced,
                    addNewButton: false,
                    enabled: defaultField?.enabled,
                    editable: defaultField?.editable,
                },
                documentation: {
                    value: param.formValues["documentation"] as string,
                    types: documentationField?.types,
                    isType: false,
                    optional: documentationField?.optional,
                    advanced: documentationField?.advanced,
                    addNewButton: false,
                    enabled: documentationField?.enabled,
                    editable: documentationField?.editable,
                },
            });
        });
        return paramList;
    };

    // Split out params that render in the Advanced Configurations section (Metadata, and — for
    // Streamable HTTP — headers and raw http:Request/http:Headers) so they don't show in the
    // ordinary parameter manager.
    const isTransportParam = (param: ParameterModel) =>
        isMcpHeaderParam(param) || isMcpAdvancedType(param.type?.value);

    const regularParameters = model.parameters.filter(
        (param) => !isMcpMetaParam(param) && !isTransportParam(param)
    );

    // Initialize advanced param state (meta always; headers + raw objects for Streamable HTTP)
    useEffect(() => {
        setMetaParam(deriveMcpMetaParam(model.parameters));
        if (!isStreamableHttp) {
            return;
        }
        setHeaderParams(model.parameters.filter((param) => isMcpHeaderParam(param)));
        setAdvancedParams(deriveMcpAdvancedParams(model.parameters));
    }, [model, isStreamableHttp]);

    // Initialize form fields
    useEffect(() => {
        const initialFields: FormField[] = [
            {
                key: "name",
                label: model.name.metadata?.label || "Operation Name",
                type: "IDENTIFIER",
                optional: model.name.optional,
                editable: model.name.editable,
                advanced: model.name.advanced,
                enabled: model.name.enabled,
                documentation: model.name.metadata?.description || "",
                value: model.name.value,
                types: model.name.types,
                lineRange: model?.name?.codedata?.lineRange,
            },
            {
                key: "parameters",
                label: "Parameters",
                type: "PARAM_MANAGER",
                optional: true,
                editable: true,
                enabled: true,
                documentation: "",
                value: regularParameters.map((param, index) => convertParameterToParamValue(param, index)),
                paramManagerProps: {
                    paramValues: regularParameters.map((param, index) => convertParameterToParamValue(param, index)),
                    formFields: convertSchemaToFormFields(model.schema),
                    handleParameter: handleParamChange,
                },
                types: [{ fieldType: "PARAM_MANAGER", selected: false }],
            },
            {
                key: "returnType",
                label: model.returnType.metadata?.label || "Return Type",
                type: "TYPE",
                optional: model.returnType.optional,
                enabled: model.returnType.enabled,
                editable: model.returnType.editable,
                advanced: model.returnType.advanced,
                documentation: model.returnType.metadata?.description || "",
                value: model.returnType.value,
                types: model.returnType.types,
            },
        ];

        const properties = convertConfigToFormFields(model);

        // Find toolDescription property and insert it after name field
        const toolDescriptionIndex = properties.findIndex((prop) => prop.key === "toolDescription");
        if (toolDescriptionIndex !== -1) {
            const toolDescriptionField = properties.splice(toolDescriptionIndex, 1)[0];
            initialFields.splice(1, 0, toolDescriptionField); // Insert after name field (index 1)
        }

        // Add remaining properties at the end
        initialFields.push(...properties);
        if (model?.properties) {
            const recordTypeFields: RecordTypeField[] = Object.entries(model?.properties)
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
                        types: property?.types || [{ fieldType: "STRING", ballerinaType: "string" }],
                        diagnostics: {
                            hasDiagnostics: property.diagnostics && property.diagnostics.length > 0,
                            diagnostics: property.diagnostics,
                        },
                    } as Property,
                    recordTypeMembers: getPrimaryInputType(property.types)?.typeMembers.filter(
                        (member: PropertyTypeMemberInfo) => member.kind === "RECORD_TYPE"
                    ) || [],
                }));
            console.log(">>> recordTypeFields of model.advanceProperties", recordTypeFields);

            setRecordTypeFields(recordTypeFields);
        }

        setFields(initialFields);
    }, [model]);

    const handleFunctionCreate = (data: FormValues, formImports: FormImports) => {
        console.log("Function create with data:", data);
        const { name, returnType, parameters: params } = data;
        const regularParams = params ? getFunctionParametersList(params) : [];
        // Assemble parameters in the order the mcp compiler plugin requires: mcp:Session first,
        // mcp:Meta? last, with the tool inputs and any transport params in between.
        const sessionParams = regularParams.filter(isMcpSessionParam);
        const toolArgs = regularParams.filter((param) => !isMcpSessionParam(param));
        const paramList: ParameterModel[] = [...sessionParams, ...toolArgs];
        if (isStreamableHttp) {
            paramList.push(...headerParams);
            paramList.push(...advancedParams.filter((param) => param.enabled));
        }
        if (metaParam?.enabled) {
            paramList.push(metaParam);
        }
        const newFunctionModel = { ...model };
        newFunctionModel.name.value = name;
        newFunctionModel.returnType.value = returnType;
        newFunctionModel.parameters = paramList;
        newFunctionModel.returnType.imports = getImportsForProperty("returnType", formImports);
        Object.entries(data).forEach(([key, value]) => {
            if (newFunctionModel?.properties?.[key]) {
                newFunctionModel.properties[key].value = value as string;
            }
        });
        onSave(newFunctionModel);
    };

    // Rendered for every MCP tool: Metadata is available to all, the Transport Parameters subsection
    // only to Streamable HTTP services.
    const injectedComponents = [
        {
            index: Number.MAX_SAFE_INTEGER,
            component: (
                <McpTransportParams
                    showTransport={!!isStreamableHttp}
                    metaParam={metaParam}
                    onMetaChange={setMetaParam}
                    headerSchema={model.schema?.header as ParameterModel}
                    headerParams={headerParams}
                    advancedParams={advancedParams}
                    onHeaderParamsChange={setHeaderParams}
                    onAdvancedParamsChange={setAdvancedParams}
                />
            ),
        },
    ];

    return (
        <>
            {fields.length > 0 && (
                <ArtifactForm
                    fileName={filePath}
                    targetLineRange={lineRange}
                    fields={fields}
                    onSubmit={handleFunctionCreate}
                    onBack={onClose}
                    submitText={isSaving ? "Saving..." : "Save"}
                    helperPaneSide="left"
                    isSaving={isSaving}
                    preserveFieldOrder={true}
                    recordTypeFields={recordTypeFields}
                    injectedComponents={injectedComponents}
                />
            )}
        </>
    );
}

export function convertSchemaToFormFields(schema: ConfigProperties): FormField[] {
    const formFields: FormField[] = [];

    // Get the parameter configuration if it exists
    const parameterConfig = schema["parameter"] as ConfigProperties;
    if (parameterConfig) {
        // Check if documentation field exists, if not add it
        if (!parameterConfig["documentation"]) {
            parameterConfig["documentation"] = {
                metadata: {
                    label: "Description",
                    description: "The description of the parameter",
                },
                types: [{ fieldType: "STRING", ballerinaType: "string", selected: false }],
                enabled: true,
                editable: true,
                optional: true,
                advanced: false,
            };
        }

        // Check if defaultValue field exists and set optional to true
        if (parameterConfig["defaultValue"]) {
            parameterConfig["defaultValue"].optional = true;
        }

        // Iterate over each parameter field in the parameter config
        for (const key in parameterConfig) {
            if (parameterConfig.hasOwnProperty(key)) {
                const parameter = parameterConfig[key];
                if (parameter.metadata && parameter.metadata.label) {
                    const formField = convertParameterToFormField(key, parameter as ParameterModel);
                    console.log("Form Field: ", formField);
                    formFields.push(formField);
                }
            }
        }
    }

    return formFields;
}

export function convertParameterToFormField(key: string, param: ParameterModel): FormField {
    return {
        key: key === "defaultValue" ? "defaultable" : key === "name" ? "variable" : key,
        label: param.metadata?.label,
        type: getPrimaryInputType(param.types)?.fieldType || "string",
        optional: param.optional || false,
        editable: param.editable || false,
        advanced: key === "defaultValue" ? true : param.advanced,
        documentation: param.metadata?.description || "",
        value: param.value || "",
        types: param.types,
        enabled: param.enabled ?? true,
        lineRange: param?.codedata?.lineRange,
    };
}

function convertConfigToFormFields(model: FunctionModel): FormField[] {
    const formFields: FormField[] = [];
    for (const key in model?.properties) {
        const property = model?.properties[key];
        // Skip properties with no `types` (e.g. annotation attachments) — they can't be form fields.
        // They're still preserved on the saved model.
        if (!property?.types || property.types.length === 0) {
            continue;
        }
        const formField: FormField = {
            key: key,
            label: property?.metadata.label || key,
            type: getPrimaryInputType(property?.types)?.fieldType,
            documentation: property?.metadata.description || "",
            types: property.types,
            editable: property.editable,
            enabled: property.enabled ?? true,
            optional: property.optional,
            value: property.value,
            advanced: property.advanced,
            diagnostics: [],
            items: property.items,
            choices: property.choices,
            placeholder: property.placeholder,
            addNewButton: property.addNewButton,
            lineRange: property?.codedata?.lineRange,
        };

        formFields.push(formField);
    }
    return formFields;
}

function convertParameterToParamValue(param: ParameterModel, index: number) {
    return {
        id: index,
        key: param.name.value,
        value: `${param.type.value} ${param.name.value}${(param.defaultValue as PropertyModel)?.value ? ` = ${(param.defaultValue as PropertyModel)?.value}` : ""
            }`,
        formValues: {
            variable: param.name.value,
            type: param.type.value,
            defaultable: (param.defaultValue as PropertyModel)?.value || "",
            documentation: param.documentation?.value || "",
        },
        icon: "symbol-variable",
        identifierEditable: param.name?.editable,
        identifierRange: param.name.codedata?.lineRange,
        hidden: param.hidden ?? false,
        imports: param.type?.imports || {},
    };
}
