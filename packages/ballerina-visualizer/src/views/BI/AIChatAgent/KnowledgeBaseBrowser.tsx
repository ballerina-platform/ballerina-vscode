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

import { useEffect, useState } from "react";
import styled from "@emotion/styled";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { Category as PanelCategory, Node as PanelNode } from "@wso2/ballerina-side-panel";
import { AvailableNode, Category, CodeData, LinePosition } from "@wso2/ballerina-core";
import { convertBICategoriesToSidePanelCategories, convertKnowledgeBaseCategoriesToSidePanelCategories } from "../../../utils/bi";
import { RelativeLoader } from "../../../components/RelativeLoader";
import { ActionSelection, ConnectorActionList, ConnectorList, WizardStep } from "../Connection/ConnectorBrowser";

const LoaderWrapper = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    height: calc(100vh - 140px);
`;

interface KnowledgeBaseBrowserProps {
    filePath: string;
    target: LinePosition;
    onSelect: (selection: ActionSelection) => void;
    onStepChange?: (step: WizardStep, goBack?: () => void) => void;
}

export function KnowledgeBaseBrowser(props: KnowledgeBaseBrowserProps) {
    const { filePath, target, onSelect, onStepChange } = props;
    const { rpcClient } = useRpcContext();

    const [step, setStep] = useState<WizardStep>(WizardStep.CONNECTOR_LIST);
    const [instanceCategories, setInstanceCategories] = useState<PanelCategory[]>([]);
    const [typeCategories, setTypeCategories] = useState<PanelCategory[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [searchText, setSearchText] = useState<string>("");

    const [selectedKnowledgeBase, setSelectedKnowledgeBase] = useState<AvailableNode>();
    const [selectedInstanceName, setSelectedInstanceName] = useState<string>();
    const [actions, setActions] = useState<AvailableNode[]>([]);
    const [loadingActions, setLoadingActions] = useState<boolean>(false);

    useEffect(() => {
        void loadKnowledgeBases();
    }, []);

    const goToList = () => {
        setStep(WizardStep.CONNECTOR_LIST);
        setSelectedKnowledgeBase(undefined);
        setSelectedInstanceName(undefined);
        setActions([]);
    };

    useEffect(() => {
        if (step === WizardStep.ACTION_LIST) {
            onStepChange?.(step, goToList);
        } else {
            onStepChange?.(step);
        }
    }, [step]);

    const loadKnowledgeBases = async () => {
        try {
            const [instancesResponse, typesResponse] = await Promise.all([
                rpcClient.getBIDiagramRpcClient().getAvailableVectorKnowledgeBases({
                    position: target,
                    filePath,
                }),
                rpcClient.getBIDiagramRpcClient().search({
                    position: { startLine: target, endLine: target },
                    filePath,
                    queryMap: undefined,
                    searchKind: "KNOWLEDGE_BASE",
                }),
            ]);
            setInstanceCategories(
                convertBICategoriesToSidePanelCategories(instancesResponse.categories as Category[])
            );
            setTypeCategories(
                convertKnowledgeBaseCategoriesToSidePanelCategories(typesResponse.categories as Category[])
            );
        } catch (error) {
            console.error(">>> Error loading knowledge bases", error);
        } finally {
            setLoading(false);
        }
    };

    const handleSelectInstance = (instanceName: string, instanceActions: PanelNode[]) => {
        const actionNodes = instanceActions.map((item) => item.metadata as AvailableNode).filter(Boolean);
        const first = actionNodes.at(0);
        setSelectedKnowledgeBase({
            metadata: {
                label: instanceName,
                description: first?.metadata?.description ?? "",
                icon: first?.metadata?.icon,
            },
            // "+Create New" needs the class's own codedata (symbol: init), not the action's.
            codedata: first?.codedata ? {
                node: "KNOWLEDGE_BASE",
                org: first.codedata.org,
                module: first.codedata.module,
                packageName: first.codedata.packageName,
                object: first.codedata.object,
                version: first.codedata.version,
                symbol: "init",
            } as CodeData : undefined,
            enabled: true,
        } as AvailableNode);
        setSelectedInstanceName(instanceName);
        setActions(actionNodes);
        setStep(WizardStep.ACTION_LIST);
    };

    const handleSelectType = async (_nodeId: string, metadata?: any) => {
        const node = (metadata as { node: AvailableNode })?.node;
        if (!node?.codedata) {
            return;
        }
        setSelectedKnowledgeBase(node);
        setSelectedInstanceName(undefined);
        setActions([]);
        setStep(WizardStep.ACTION_LIST);
        setLoadingActions(true);
        try {
            const response = await rpcClient.getBIDiagramRpcClient().getLibraryActions({
                filePath,
                codedata: node.codedata,
            });
            setActions(response.actions ?? []);
        } catch (error) {
            console.error(">>> Error loading knowledge base actions", error);
        } finally {
            setLoadingActions(false);
        }
    };

    if (loading) {
        return (
            <LoaderWrapper>
                <RelativeLoader />
            </LoaderWrapper>
        );
    }

    if (step === WizardStep.ACTION_LIST) {
        if (loadingActions) {
            return (
                <LoaderWrapper>
                    <RelativeLoader />
                </LoaderWrapper>
            );
        }
        return (
            <ConnectorActionList
                connector={selectedKnowledgeBase}
                actions={actions}
                category={selectedInstanceName ? "Knowledge Base" : "New Knowledge Base"}
                onSelect={(action) => onSelect({
                    action,
                    connector: selectedKnowledgeBase,
                    connectionName: selectedInstanceName,
                })}
            />
        );
    }

    return (
        <ConnectorList
            connectionCategories={instanceCategories}
            connectorCategories={typeCategories}
            searchText={searchText}
            onSearchTextChange={setSearchText}
            onSelect={handleSelectType}
            onSelectConnection={handleSelectInstance}
            description="Pick an existing knowledge base or a knowledge base type to browse its actions."
            searchPlaceholder="Search knowledge bases"
        />
    );
}
