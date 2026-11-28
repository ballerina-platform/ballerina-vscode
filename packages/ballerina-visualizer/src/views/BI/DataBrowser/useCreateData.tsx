/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
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


import React from "react";
import { EditorConfig, EditorDisplayMode, FlowNode, LineRange } from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { ExpressionEditorDevantProps } from "@wso2/ballerina-side-panel";
import { newVariableNode } from "../HelperPaneNew/Views/Variables";
import FlowNodeForm from "../Forms/FlowNodeForm";
import { FunctionFormStatic } from "../FunctionFormStatic";
import { DevantNewConfigurableForm } from "../HelperPaneNew/Views/DevantConfigurables";
import { FormSubmitOptions } from "../FlowDiagram";
import { POPUP_IDS, useModalStack } from "../../../Context";
import { URI, Utils } from "vscode-uri";
import { DataBrowserScope } from "./DataBrowserScope";
import { configurableTemplate, saveConfigurable, seedConfigurable } from "../Forms/form-utils";
import { ConfigurableSeed } from "@wso2/ballerina-side-panel";

const MODAL_WIDTH = 480;

export type SubmitForm = (updatedNode?: FlowNode, editorConfig?: EditorConfig, options?: FormSubmitOptions) => void;

export function useCreateData(fileName: string, targetLineRange: LineRange, onSubmitForm: SubmitForm | undefined, onCreated: (name: string) => void) {
    const { rpcClient } = useRpcContext();
    const { addModal, closeModal } = useModalStack();

    const openForm = async (node: FlowNode, id: string, title: string, onSubmit: (node: FlowNode, editorConfig?: EditorConfig) => void) => {
        const projectPath = URI.file((await rpcClient.getVisualizerLocation()).projectPath).fsPath;
        const form = (
            <FlowNodeForm
                fileName={fileName}
                node={node}
                connections={[]}
                targetLineRange={targetLineRange}
                projectPath={projectPath}
                editForm={false}
                onSubmit={onSubmit}
                showProgressIndicator={false}
                resetUpdatedExpressionField={() => { }}
                isInModal={true}
                footerActionButton={true}
            />
        );
        addModal(
            <DataBrowserScope isolated fileName={fileName} targetLineRange={targetLineRange} onSubmitForm={onSubmitForm}>
                {form}
            </DataBrowserScope>,
            id, title, undefined, MODAL_WIDTH);
        return projectPath;
    };

    const newVariable = (type?: string) =>
        openForm(newVariableNode(type), POPUP_IDS.VARIABLE, "New Variable", (node, editorConfig) =>
            onSubmitForm?.(
                node,
                {
                    view: editorConfig?.view,
                    displayMode: editorConfig?.displayMode === EditorDisplayMode.VIEW ? EditorDisplayMode.POPUP : EditorDisplayMode.NONE,
                },
                {
                    closeSidePanel: false,
                    isChangeFromHelperPane: true,
                    postUpdateCallBack: () => {
                        closeModal(POPUP_IDS.VARIABLE);
                        onCreated(String(node.properties?.variable?.value ?? ""));
                    },
                },
            ));

    // A seed comes from a field that needs a configurable, which also takes the new name.
    const newConfigurable = async (seed?: ConfigurableSeed, onSaved = onCreated) => {
        const template = await configurableTemplate(rpcClient, fileName);
        if (seed) {
            seedConfigurable(template, seed);
        }
        const projectPath = await openForm(template, POPUP_IDS.CONFIGURABLES, "New Configurable", async (node) => {
            closeModal(POPUP_IDS.CONFIGURABLES);
            try {
                await saveConfigurable(rpcClient, projectPath, node);
            } catch (error) {
                rpcClient.getCommonRpcClient().showErrorMessage({ message: `Couldn't save the configurable. ${error instanceof Error ? error.message : ""}`.trim() });
                return;
            }
            onSaved(node.properties.variable.value as string);
        });
    };

    const newFunction = async (type?: string) => {
        const projectPath = (await rpcClient.getVisualizerLocation()).projectPath;
        addModal(
            <FunctionFormStatic
                projectPath={projectPath}
                filePath={Utils.joinPath(URI.file(projectPath), "functions.bal").fsPath}
                functionName={undefined}
                isDataMapper={false}
                defaultType={type}
                handleSubmit={(call) => {
                    closeModal(POPUP_IDS.FUNCTION);
                    onCreated(call);
                }}
            />,
            POPUP_IDS.FUNCTION, "New Function");
    };

    const newCloudConfigurable = (cloud: ExpressionEditorDevantProps, existingNames: string[]) =>
        addModal(
            <DevantNewConfigurableForm
                onAddDevantConfig={cloud.onAddDevantConfig}
                existingNames={existingNames}
                onSuccess={(name) => {
                    closeModal(POPUP_IDS.CONFIGURABLES);
                    onCreated(name);
                }}
            />,
            POPUP_IDS.CONFIGURABLES, "New WSO2 Cloud Configurable", undefined, 400);

    return { variable: newVariable, configurable: newConfigurable, function: newFunction, cloudConfigurable: newCloudConfigurable };
}

export type CreateData = ReturnType<typeof useCreateData>;
