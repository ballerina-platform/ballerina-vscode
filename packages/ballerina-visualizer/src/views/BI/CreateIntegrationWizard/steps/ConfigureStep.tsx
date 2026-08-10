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

import styled from "@emotion/styled";
import { PendingIntegrationArtifactPayload, ServiceInitModel } from "@wso2/ballerina-core";
import { RelativeLoader } from "../../../../components/RelativeLoader";
import { BiWsClient } from "../../wsManager/WsClient";
import { WizardRpcAdapterProvider } from "../components/WizardRpcAdapterProvider";
import { ArtifactCard } from "../artifactCatalog";
import { ScaffoldState } from "../types";
import { ServiceConfigureForm } from "./configure/ServiceConfigureForm";
import { FunctionConfigureForm } from "./configure/FunctionConfigureForm";
import { AIAgentConfigureForm } from "./configure/AIAgentConfigureForm";

/** Fills the height handed down by the wizard's scroll area so the configure
 *  forms below can pin their submit button to the bottom via `footerActionButton`. */
const ConfigureStepContainer = styled.div`
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
`;

const CenteredContainer = styled.div`
    flex: 1;
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 48px 0;
`;

interface ConfigureStepProps {
    wsClient: BiWsClient;
    selection: ArtifactCard;
    scaffold: ScaffoldState;
    isSubmitting: boolean;
    /** Service model cached by the wizard root from an earlier Configure-step visit. */
    cachedServiceModel?: ServiceInitModel | null;
    /** Reports the fetched service model for cross-step caching. */
    onServiceModelLoaded?: (model: ServiceInitModel) => void;
    /** Hands the configured artifact payload up to the wizard root for final submit. */
    onSubmit: (artifact: PendingIntegrationArtifactPayload) => void;
}

/** The Configure step — dispatches to the artifact-kind-specific configuration form. */
export function ConfigureStep({ wsClient, selection, scaffold, isSubmitting, cachedServiceModel, onServiceModelLoaded, onSubmit }: ConfigureStepProps) {
    if (scaffold.status === "creating" || scaffold.status === "idle") {
        return (
            <ConfigureStepContainer>
                <CenteredContainer>
                    <RelativeLoader message="Setting up your integration..." />
                </CenteredContainer>
            </ConfigureStepContainer>
        );
    }

    if (scaffold.status === "error") {
        return (
            <ConfigureStepContainer>
                <CenteredContainer>
                    {scaffold.error || "Failed to set up the integration. Please go back and try again."}
                </CenteredContainer>
            </ConfigureStepContainer>
        );
    }

    const { projectRoot } = scaffold;

    return (
        <ConfigureStepContainer>
            {(() => {
                switch (selection.kind) {
                    case "service":
                        return (
                            <WizardRpcAdapterProvider wsClient={wsClient}>
                                <ServiceConfigureForm
                                    wsClient={wsClient}
                                    projectRoot={projectRoot}
                                    selection={selection}
                                    isSubmitting={isSubmitting}
                                    cachedModel={cachedServiceModel}
                                    onModelLoaded={onServiceModelLoaded}
                                    onSubmit={(serviceInitModel) =>
                                        onSubmit({ version: 1, kind: "SERVICE", serviceInitModel })
                                    }
                                />
                            </WizardRpcAdapterProvider>
                        );
                    case "automation":
                    case "workflow":
                    case "durable_agent":
                        return (
                            <WizardRpcAdapterProvider wsClient={wsClient}>
                                <FunctionConfigureForm
                                    wsClient={wsClient}
                                    projectRoot={projectRoot}
                                    kind={selection.kind}
                                    isSubmitting={isSubmitting}
                                    onSubmit={(flowNode) =>
                                        onSubmit({
                                            version: 1,
                                            // A durable agentic workflow generates through the same
                                            // function-source path as a workflow; the DURABLE_AGENT
                                            // node kind on `flowNode.codedata` picks the LS builder.
                                            kind: selection.kind === "automation" ? "AUTOMATION" : "WORKFLOW",
                                            flowNode,
                                        })
                                    }
                                />
                            </WizardRpcAdapterProvider>
                        );
                    case "ai-agent":
                        return (
                            <AIAgentConfigureForm
                                isSubmitting={isSubmitting}
                                onSubmit={(name) => onSubmit({ version: 1, kind: "AI_CHAT_AGENT", aiAgent: { name } })}
                            />
                        );
                    default:
                        return null;
                }
            })()}
        </ConfigureStepContainer>
    );
}
