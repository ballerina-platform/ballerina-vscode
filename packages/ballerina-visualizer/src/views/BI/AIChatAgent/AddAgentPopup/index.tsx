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

import { ReactNode, useCallback, useEffect, useRef } from "react";
import { AvailableNode, ParentPopupData } from "@wso2/ballerina-core";
import { useModalStack } from "../../../../Context";
import { AgentDefinitionForm } from "../AgentDefinitionForm";
import { AddAgentPopupContent } from "./AddAgentPopupContent";
import { AgentFormView } from "./AgentFormView";
import { CreateDurableAgentView } from "./CreateDurableAgentView";
import { PackageAgentsView } from "./PackageAgentsView";
import { AgentDefinitionFormContainer } from "./styles";

const ROOT_ID = "add-agent";
const GALLERY_WIDTH = 800;
const FORM_WIDTH = 680;
const MODAL_HEIGHT = 780;

export interface AddAgentPopupProps {
    projectPath: string;
    onClose?: (parent?: ParentPopupData) => void;
    onNavigateToOverview: () => void;
    isPopup?: boolean;
    inFlow?: boolean;
    onAgentCreated?: (agentVarName: string) => void;
    dependencyMode?: boolean;
    onAgentSelectedForDependency?: (agent: AvailableNode) => void;
    onGenericAgentSelected?: () => void;
    dependencyToolForm?: ReactNode;
    onDependencyToolFormBack?: () => void;
}

export function AddAgentPopup(props: AddAgentPopupProps): null {
    const { projectPath, isPopup, inFlow, dependencyMode, dependencyToolForm } = props;
    const { addModal, closeModal, popToModal, clearModals } = useModalStack();
    const latest = useRef(props);
    latest.current = props;
    const tearingDown = useRef(false);

    const push = useCallback(
        (id: string, title: string, content: ReactNode) =>
            addModal(content, `${ROOT_ID}-${id}`, title, MODAL_HEIGHT, FORM_WIDTH, undefined, true),
        [addModal]
    );

    const dismiss = useCallback(() => {
        const { isPopup: asPopup, onClose, onNavigateToOverview } = latest.current;
        if (tearingDown.current) {
            return;
        }
        asPopup ? onClose?.() : onNavigateToOverview();
    }, []);

    const openAgentForm = useCallback(
        (agent?: AvailableNode) =>
            push(
                agent ? "configure" : "create",
                agent ? "Configure Agent" : "Create Agent",
                <AgentFormView
                    projectPath={latest.current.projectPath}
                    pendingAgent={agent}
                    inFlow={latest.current.inFlow}
                    onAgentCreated={latest.current.onAgentCreated}
                    onClose={clearModals}
                />
            ),
        [push, clearModals]
    );

    const selectAgent = useCallback(
        (agent: AvailableNode) => {
            const { dependencyMode: asDependency, onAgentSelectedForDependency } = latest.current;
            asDependency ? onAgentSelectedForDependency?.(agent) : openAgentForm(agent);
        },
        [openAgentForm]
    );

    const openPackage = (agent: AvailableNode, agents: AvailableNode[]) =>
        push(
            "package",
            agent.metadata.label ?? "Select Agent",
            <PackageAgentsView packageNode={agent} agents={agents} isLoading={false} onSelect={selectAgent} />
        );

    const openDefinition = () =>
        push(
            "definition",
            "Create Agent Definition",
            <AgentDefinitionFormContainer>
                <AgentDefinitionForm
                    projectPath={projectPath}
                    onCreated={isPopup ? () => latest.current.onClose?.() : undefined}
                />
            </AgentDefinitionFormContainer>
        );

    const openDurable = () =>
        push("durable", "Create Durable Agent", <CreateDurableAgentView projectPath={projectPath} />);

    // Each level is pushed once; its callbacks read the latest props through the ref.
    useEffect(() => {
        tearingDown.current = false;
        const id = `${ROOT_ID}-${dependencyToolForm ? "tool" : "gallery"}`;
        if (dependencyToolForm) {
            addModal(dependencyToolForm, id, "Add Agent Tool", MODAL_HEIGHT, FORM_WIDTH, () => {
                if (!tearingDown.current) {
                    latest.current.onDependencyToolFormBack?.();
                }
            }, true);
        } else {
            addModal(
                <AddAgentPopupContent
                    projectPath={projectPath}
                    onOpenAgentForm={openAgentForm}
                    onOpenPackage={openPackage}
                    onOpenDefinition={openDefinition}
                    onOpenDurable={openDurable}
                    inFlow={inFlow}
                    dependencyMode={dependencyMode}
                    onAgentSelectedForDependency={latest.current.onAgentSelectedForDependency}
                    onGenericAgentSelected={latest.current.onGenericAgentSelected}
                />,
                id,
                dependencyMode ? "Use Agent" : "Add Agent",
                MODAL_HEIGHT,
                GALLERY_WIDTH,
                dismiss
            );
        }
        return () => {
            tearingDown.current = true;
            popToModal(id);
            closeModal(id);
        };
    }, [dependencyToolForm]);

    return null;
}

export default AddAgentPopup;
