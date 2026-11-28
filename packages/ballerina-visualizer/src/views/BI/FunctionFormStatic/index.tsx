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

import { useEffect, useRef, useState } from "react";
import { FunctionNode, LineRange, NodeKind, NodeProperties as OriginalNodeProperties, NodePropertyKey, DIRECTORY_MAP, EVENT_TYPE, getPrimaryInputType, isTemplateType } from "@wso2/ballerina-core";
import styled from "@emotion/styled";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { FormField, FormImports, FormValues } from "@wso2/ballerina-side-panel";
import { URI, Utils } from "vscode-uri";
import ArtifactForm from "../Forms/ArtifactForm";
import { FormHeader } from "../../../components/FormHeader";
import { convertConfig, getImportsForProperty } from "../../../utils/bi";
import { LoadingContainer } from "../../styles";
import { LoadingRing } from "../../../components/Loader";


type NodeProperties = OriginalNodeProperties & {
    [key: string]: any;
};

const FormContainer = styled.div`
    display: flex;
    flex-direction: column;
    max-width: 600px;
    gap: 20px;
    overflow-y: auto;
    padding-right: 16px;

    /* Add smooth scrolling */
    scroll-behavior: smooth;
    
    /* Style the scrollbar */
    &::-webkit-scrollbar {
        width: 8px;
    }
    
    &::-webkit-scrollbar-track {
        background: transparent;
    }
    
    &::-webkit-scrollbar-thumb {
        background-color: rgba(0, 0, 0, 0.2);
        border-radius: 4px;
    }
`;

interface FunctionFormProps {
    filePath: string;
    projectPath: string;
    functionName: string;
    isDataMapper?: boolean;
    isNpFunction?: boolean;
    isAutomation?: boolean;
    handleSubmit?: (value: string) => void;
    defaultType?: string;
}

export function FunctionFormStatic(props: FunctionFormProps) {
    const { rpcClient } = useRpcContext();
    const { projectPath, functionName, filePath, isDataMapper, isNpFunction, isAutomation, defaultType, handleSubmit } = props;

    const [functionFields, setFunctionFields] = useState<FormField[]>([]);
    const [functionNode, setFunctionNode] = useState<FunctionNode>(undefined);
    const [targetLineRange, setTargetLineRange] = useState<LineRange>();
    const [saving, setSaving] = useState<boolean>(false);
    const [isLoading, setIsLoading] = useState<boolean>(false);

    const fileName = filePath.split(/[\\/]/).pop();
    const formType = useRef("Function");

    const hideTypeDescriptionField = (flowNode: FunctionNode): FunctionNode => {
        if (flowNode?.properties?.typeDescription) {
            flowNode.properties.typeDescription.hidden = true;
        }
        return flowNode;
    };

    useEffect(() => {
        let nodeKind: NodeKind;
        if (isAutomation || functionName === "main") {
            nodeKind = 'AUTOMATION';
            formType.current = "Automation";
        } else if (isDataMapper) {
            nodeKind = 'DATA_MAPPER_DEFINITION';
            formType.current = 'Data Mapper';
        } else if (isNpFunction) {
            nodeKind = 'NP_FUNCTION_DEFINITION';
            formType.current = 'Natural Function';
        } else {
            nodeKind = 'FUNCTION_DEFINITION';
            formType.current = 'Function';
        }

        if (functionName) {
            getExistingFunctionNode();
        } else {
            getFunctionNode(nodeKind);
        }
    }, [isDataMapper, isNpFunction, isAutomation, functionName]);

    useEffect(() => {
        let fields = functionNode ? convertConfig(functionNode.properties) : [];

        // TODO: Remove this once the hidden flag is implemented 
        if (isAutomation || functionName === "main") {
            formType.current = "Automation";
            const automationFields = fields.filter(field => field.key !== "functionName" && field.key !== "type");
            fields = automationFields;
        }

        // update description fields as "TEXTAREA"
        fields.forEach((field) => {
            const primaryInputType = getPrimaryInputType(field.types)
            if (field.key === "functionNameDescription" || field.key === "typeDescription") {
                field.type = "TEXTAREA";
            }
            if (field.key === "parameters" && primaryInputType && isTemplateType(primaryInputType)) {
                if ((primaryInputType.template as any).value.parameterDescription) {
                    (primaryInputType.template as any).value.parameterDescription.type = "TEXTAREA";
                }
            }
        });

        setFunctionFields(fields);
    }, [functionNode]);

    const getFunctionNode = async (kind: NodeKind) => {
        setIsLoading(true);

        const res = await rpcClient.getBIDiagramRpcClient().getNodeTemplate({
            position: { line: 0, offset: 0 },
            filePath: Utils.joinPath(URI.file(projectPath), fileName).fsPath,
            id: { node: kind },
        });
        let flowNode = hideTypeDescriptionField(res.flowNode);

        let properties = flowNode.properties as NodeProperties;

        console.log("FLOWNODE", flowNode)

        // Remove the description fields from properties
        properties = Object.keys(properties).reduce((acc, key) => {
            if (!key.toLowerCase().includes('functionnamedescription') && !key.toLowerCase().includes('typedescription')) {
                acc[key] = properties[key];
            }
            return acc;
        }, {} as NodeProperties);
        flowNode.properties = properties;

        if (defaultType && flowNode.properties && flowNode.properties.type) {
            flowNode.properties.type.value = defaultType;
        }
        if (isNpFunction) {
            /* 
            * TODO: Remove this once the LS is updated
            * HACK: Add the advanced fields under parameters.advanceProperties
            */
            // Get all the advanced fields
            const advancedProperties = Object.fromEntries(
                Object.entries(properties).filter(([_, property]) => property.advanced)
            );
            // Remove the advanced fields from properties
            properties = Object.fromEntries(
                Object.entries(properties).filter(([_, property]) => !property.advanced)
            );
            flowNode.properties = properties;

            // Add the all the advanced fields to advanceProperties
            flowNode.properties.parameters = {
                ...flowNode.properties.parameters,
                advanceProperties: advancedProperties
            }
        }

        setFunctionNode(flowNode);
        setIsLoading(false);
        console.log("Function Node: ", flowNode);
    }

    const getExistingFunctionNode = async () => {
        setIsLoading(true);
        const res = await rpcClient
            .getBIDiagramRpcClient()
            .getFunctionNode({
                functionName,
                fileName,
                projectPath
            });
        let flowNode = hideTypeDescriptionField(res.functionDefinition);
        if (isNpFunction) {
            /* 
            * TODO: Remove this once the LS is updated
            * HACK: Add the advanced fields under parameters.advanceProperties
            */
            // Get all the advanced fields
            let properties = flowNode.properties as NodeProperties;
            const advancedProperties = Object.fromEntries(
                Object.entries(properties).filter(([_, property]) => property.advanced)
            );
            // Remove the advanced fields from properties
            properties = Object.fromEntries(
                Object.entries(properties).filter(([_, property]) => !property.advanced)
            );
            flowNode.properties = properties;

            // Add the all the advanced fields to advanceProperties
            flowNode.properties.parameters = {
                ...flowNode.properties.parameters,
                advanceProperties: advancedProperties
            }
        }

        setFunctionNode(flowNode);
        setIsLoading(false);
        console.log("Existing Function Node: ", flowNode);
    }

    const onSubmit = async (data: FormValues, formImports?: FormImports) => {
        console.log("Function Form Data: ", data);
        const functionNodeCopy = { ...functionNode };

        /**
         * TODO: Remove this once the LS is updated
         * HACK: Add the advanced fields under parameters.advanceProperties back to properties
         */
        if (isNpFunction) {
            // Add values back to properties
            const properties = functionNodeCopy.properties;
            functionNodeCopy.properties = {
                ...properties,
                ...properties.parameters.advanceProperties,
            }

            // Remove the advanceProperties from parameters
            delete properties.parameters.advanceProperties;
        }

        if (isNpFunction) {
            // Handle advance properties
            const enrichFlowNodeForAdvanceProperties = (data: FormValues) => {
                for (const value of Object.values(data)) {
                    const nestedData = value.advanceProperties;
                    if (nestedData) {
                        for (const [advanceKey, advanceValue] of Object.entries(nestedData)) {
                            functionNodeCopy.properties[advanceKey as NodePropertyKey].value = advanceValue;
                        }

                        delete value.advanceProperties;
                    }
                }
            }

            enrichFlowNodeForAdvanceProperties(data);
        }

        for (const [dataKey, dataValue] of Object.entries(data)) {
            const properties = functionNodeCopy.properties as NodeProperties;
            for (const [key, property] of Object.entries(properties)) {
                if (dataKey === key) {
                    const primaryType = getPrimaryInputType(property.types);
                    if (primaryType?.fieldType === "REPEATABLE_PROPERTY" && isTemplateType(primaryType)) {
                        const template = primaryType?.template;
                        property.value = {};
                        // Go through the parameters array
                        for (const [repeatKey, repeatValue] of Object.entries(dataValue)) {
                            // Create a deep copy for each iteration
                            const valueConstraint = JSON.parse(JSON.stringify(template));
                            // Fill the values of the parameter constraint
                            for (const [paramKey, param] of Object.entries((valueConstraint as any).value as NodeProperties)) {
                                param.value = (repeatValue as any).formValues[paramKey] || "";
                            }
                            (property.value as any)[(repeatValue as any).key] = valueConstraint;
                        }
                    } else {
                        property.value = dataValue;
                    }
                    const imports = getImportsForProperty(key, formImports);
                    property.imports = imports;
                }
            }
        }
        console.log("Updated function node: ", functionNodeCopy);
        const sourceCode = await rpcClient
            .getBIDiagramRpcClient()
            .getSourceCode({ filePath, flowNode: functionNodeCopy, isFunctionNodeUpdate: true });

        if (sourceCode.artifacts.length === 0) {
            showErrorNotification();
        }
        else {
            handleSubmit(`${sourceCode.artifacts[0].name}()`);
        }
        setSaving(false)
    };

    const handleFormSubmit = async (data: FormValues, formImports?: FormImports) => {
        setSaving(true);
        // HACK: Remove new lines from function description fields
        const descriptionFields = ["functionNameDescription", "typeDescription"];
        for (const field of descriptionFields) {
            if (data[field]) {
                data[field] = data[field]?.replace(/\n/g, " ");
            }
        }
        // HACK: Remove new lines from parameter description
        if (data.parameters) {
            for (const parameter of data.parameters) {
                if (parameter && parameter.formValues?.parameterDescription) {
                    parameter.formValues.parameterDescription = parameter.formValues.parameterDescription.replace(/\n/g, " ");
                }
            }
        }

        try {
            await onSubmit(data, formImports);
        } catch (error) {
            console.error("Error submitting form: ", error);
            showErrorNotification();
        }
    };

    const showErrorNotification = async () => {
        const functionType = getFunctionType();
        await rpcClient
            .getCommonRpcClient()
            .showErrorMessage({
                message: `${functionName ? `Failed to update the ${functionType}` : `Failed to create the ${functionType}`}. `
            });
    }

    const getFunctionType = () => {
        if (isDataMapper) {
            return "Data Mapper";
        } else if (isNpFunction) {
            return "Natural Function";
        } else if (isAutomation || functionName === "main") {
            return "Automation";
        }
        return "Function";
    };

    useEffect(() => {
        if (filePath && rpcClient) {
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

    //HACK: Hide is isolated field form function form
    functionFields.forEach((field) => {
        if (field.key === "isIsolated") {
            field.hidden = true;
        }
    });

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>

            {isLoading && (
                <LoadingContainer>
                    <LoadingRing />
                </LoadingContainer>
            )}
            <FormContainer>
                {filePath && targetLineRange && functionFields.length > 0 &&
                    <ArtifactForm
                        fileName={filePath}
                        targetLineRange={targetLineRange}
                        fields={functionFields}
                        isSaving={saving}
                        onSubmit={handleFormSubmit}
                        submitText={saving ? (functionName ? "Saving..." : "Creating...") : (functionName ? "Save" : "Create")}
                        selectedNode={functionNode?.codedata?.node}
                        footerActionButton={true}
                    />
                }
            </FormContainer>
        </div>
    );
}
