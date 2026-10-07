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

import { useContext, useState } from "react";
import styled from "@emotion/styled";
import { useQuery } from "@tanstack/react-query";
import { AgentManagerModelProvider, FlowNode } from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { CardList, Category, Item, Node } from "@wso2/ballerina-side-panel";
import { Codicon, Icon, ThemeColors } from "@wso2/ui-toolkit";
import { useModalStack } from "../../Context";
import { useAgentManagerSession } from "../../hooks/useAgentManagerSession";
import { PanelOverlayContext } from "../../views/BI/FlowDiagram/context/PanelOverlayContext";
import { RelativeLoader } from "../RelativeLoader";
import { LoaderContainer } from "../RelativeLoader/styles";

export const AGENT_MANAGER_TITLE = "WSO2 Agent Manager";

type OnSelect = (id: string, metadata?: any) => void | Promise<void>;

/** Opens Agent Manager content over the side panel, or as a modal where there is no panel. */
export function useAgentManagerPage() {
    const panelOverlay = useContext(PanelOverlayContext);
    const { addModal, closeModal } = useModalStack();
    return (modalId: string, render: (close: () => void) => JSX.Element) => {
        let close = () => closeModal(modalId);
        const content = render(() => close());
        if (panelOverlay) {
            const overlayId = panelOverlay.openOverlay({ title: AGENT_MANAGER_TITLE, content, onBack: panelOverlay.closeTopOverlay });
            close = () => panelOverlay.closeOverlay(overlayId);
            return;
        }
        addModal(content, modalId, AGENT_MANAGER_TITLE, 600, 520);
    };
}

function useModelProviders(enabled = true) {
    const { rpcClient } = useRpcContext();
    return useQuery({
        queryKey: ["agentManagerModelProviders"],
        queryFn: () => rpcClient.getAgentManagerRpcClient().getAgentManagerModelProviders(),
        enabled,
    });
}

// A picked provider comes back through `onSelect` with a `prepareTemplate` step.
export function useAgentManagerModelProviders(connectionKind: string, categories: Category[], onSelect?: OnSelect) {
    const session = useAgentManagerSession();
    const openPage = useAgentManagerPage();
    const isModelProvider = connectionKind === "MODEL_PROVIDER";
    const { data } = useModelProviders(isModelProvider && !!session?.signedIn);
    if (!isModelProvider || !session) {
        return null;
    }

    const openPicker = () => openPage("agent-manager-llm-service-providers", (close) => (
        <AgentManagerProviderPicker
            categories={categories}
            onPick={async (id, metadata) => {
                // The picker stays up while the host loads the form, so the list never flashes in between.
                await onSelect?.(id, metadata);
                close();
            }}
        />
    ));
    return (
        <ListSection>
            <AgentManagerEntryCard
                description="Models your organization added to Agent Manager, served through its AI Gateway with platform-issued keys."
                connected={data && `${session.org} · ${count(data.providers.length, "LLM service provider")}`}
                onOpen={openPicker}
            />
        </ListSection>
    );
}

export const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

export const camelId = (id: string) => id.replace(/[^A-Za-z0-9]+(.)?/g, (_, next: string) => next?.toUpperCase() ?? "");

// Signs in first when needed; cancelling the sign-in leaves the picker as it was.
export function AgentManagerEntryCard({ description, connected, onOpen }: { description: string; connected?: string; onOpen: () => void }) {
    const { rpcClient } = useRpcContext();
    const signedIn = !!useAgentManagerSession()?.signedIn;
    const [connecting, setConnecting] = useState(false);
    const signInAndOpen = async () => {
        setConnecting(true);
        const { projectPath } = await rpcClient.getVisualizerLocation();
        const { success } = await rpcClient.getAgentManagerRpcClient().runAgentManagerAction({ projectPath, action: "signIn" });
        setConnecting(false);
        if (success) {
            onOpen();
        }
    };
    return (
        <OptionCard
            icon={<Icon name="bi-wso2" sx={{ width: 24, height: 24 }} iconSx={{ fontSize: "24px" }} />}
            title={AGENT_MANAGER_TITLE}
            description={description}
            meta={connecting ? "Signing In…" : signedIn ? connected : "Not signed in"}
            metaMuted={connecting || !signedIn}
            onClick={() => !connecting && (signedIn ? onOpen() : signInAndOpen())}
        />
    );
}

export function OptionCard({ icon, title, description, meta, metaMuted, onClick }: {
    icon: JSX.Element;
    title: string;
    description: string;
    meta?: string;
    metaMuted?: boolean;
    onClick: () => void;
}) {
    return (
        <EntryCard type="button" onClick={onClick}>
            <EntryIcon>{icon}</EntryIcon>
            <EntryText>
                <EntryTitle>{title}</EntryTitle>
                <Muted>{description}</Muted>
                {meta && (metaMuted ? <Muted>{meta}</Muted> : <Meta>{meta}</Meta>)}
            </EntryText>
            <Codicon name="chevron-right" />
        </EntryCard>
    );
}

export function AgentManagerList({ loading, intro, title, description = "", items, onSelect, consoleLabel, consoleUrl }: {
    loading: boolean;
    intro: string;
    title: string;
    description?: string;
    items: Node[];
    onSelect: OnSelect;
    consoleLabel: string;
    consoleUrl?: string;
}) {
    const { rpcClient } = useRpcContext();
    const org = useAgentManagerSession()?.org;
    if (loading) {
        return <LoaderContainer><RelativeLoader /></LoaderContainer>;
    }
    return (
        <>
            <Intro>{intro}</Intro>
            <CardList
                categories={[{ title: org ? `${title} in ${org}` : title, description, items }]}
                onSelect={onSelect}
                extraSection={consoleUrl && (
                    <>
                        <ConsoleLink type="button" onClick={() => rpcClient.getCommonRpcClient().openExternalUrl({ url: consoleUrl })}>
                            <Codicon name="link-external" />{consoleLabel}
                        </ConsoleLink>
                        <Hint>Opens the Agent Manager console in your browser.</Hint>
                    </>
                )}
            />
        </>
    );
}

function AgentManagerProviderPicker({ categories, onPick }: { categories: Category[]; onPick: OnSelect }) {
    const { rpcClient } = useRpcContext();
    const [preparing, setPreparing] = useState(false);
    const { data, isLoading } = useModelProviders();

    const pick = async (_id: string, metadata?: { node: { provider: AgentManagerModelProvider; providerNode: Node } }) => {
        const { provider, providerNode } = metadata.node;
        const variables = configurableNames(provider);
        setPreparing(true);
        const { projectPath } = await rpcClient.getVisualizerLocation();
        const { success } = await rpcClient.getAgentManagerRpcClient()
            .bindAgentManagerModelProvider({ projectPath, providerId: provider.id, ...variables });
        if (!success) {
            setPreparing(false);
            return;
        }
        await onPick(providerNode.id, {
            node: providerNode.metadata,
            prepareTemplate: (flowNode: FlowNode) => applyProvider(flowNode, provider, variables),
        });
    };

    return (
        <AgentManagerList
            loading={isLoading || preparing}
            intro="Pick a model your organization added to Agent Manager. Requests go through its AI Gateway with a platform-issued key."
            title="LLM Service Providers"
            items={toProviderItems(data?.providers ?? [], categories)}
            onSelect={pick}
            consoleLabel="Add LLM Service Provider"
            consoleUrl={data?.consoleUrl}
        />
    );
}

// Each provider borrows its matching model provider card, which is what the host turns into the form.
function toProviderItems(providers: AgentManagerModelProvider[], categories: Category[]): Node[] {
    return providers.map((provider) => {
        const providerNode = provider.module ? findProviderNode(categories, provider.module) : undefined;
        const reason = provider.unsupportedReason ?? (providerNode ? undefined : "This model provider isn't available in this project.");
        return {
            id: provider.id,
            label: provider.name,
            description: reason ?? "Platform-Issued Key",
            icon: providerNode?.icon,
            enabled: !reason,
            metadata: { provider, providerNode },
        };
    });
}

function findProviderNode(items: Item[], module: string): Node | undefined {
    for (const item of items) {
        const found = "items" in item ? findProviderNode(item.items, module) : item.metadata?.codedata?.module === module ? item : undefined;
        if (found) {
            return found;
        }
    }
    return undefined;
}

function configurableNames(provider: AgentManagerModelProvider) {
    const base = camelId(provider.id);
    return { urlVariable: `${base}AgentManagerUrl`, keyVariable: `${base}AgentManagerKey` };
}

export function setExpression(flowNode: FlowNode, key: string, value: string) {
    const prop: any = (flowNode.properties as any)?.[key];
    if (!prop) {
        return;
    }
    prop.value = value;
    prop.types = prop.types?.map((type: any) => ({ ...type, selected: type.fieldType === "EXPRESSION" }));
}

// Agent Manager injects the deployed agent's own URL and key into these configurables.
function applyProvider(flowNode: FlowNode, provider: AgentManagerModelProvider, { urlVariable, keyVariable }: ReturnType<typeof configurableNames>) {
    setExpression(flowNode, "apiKey", keyVariable);
    setExpression(flowNode, "serviceUrl", provider.pathSuffix ? `${urlVariable} + ${JSON.stringify(provider.pathSuffix)}` : urlVariable);
}

const ConsoleLink = styled.button`
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    margin-top: 4px;
    padding: 6px 2px;
    border: 1px dashed ${ThemeColors.PRIMARY};
    border-radius: 5px;
    background: none;
    color: ${ThemeColors.PRIMARY};
    font: inherit;
    cursor: pointer;
    &:hover {
        border-style: solid;
        background-color: ${ThemeColors.PRIMARY_CONTAINER};
    }
`

const EntryCard = styled.button`
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 12px;
    border: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    border-radius: 8px;
    background-color: ${ThemeColors.SURFACE};
    color: ${ThemeColors.ON_SURFACE};
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition: all 0.2s ease;
    &:hover {
        background-color: ${ThemeColors.PRIMARY_CONTAINER};
        border-color: ${ThemeColors.PRIMARY};
        transform: translateY(-1px);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }
`;

const ListSection = styled.div`
    margin-bottom: 8px;
`;

const EntryIcon = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    flex-shrink: 0;
    border-radius: 6px;
    background-color: ${ThemeColors.PRIMARY_CONTAINER};
`;

const EntryText = styled.div`
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
`;

const EntryTitle = styled.span`
    font-size: 14px;
    font-weight: 500;
`;

const Muted = styled.span`
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    font-size: 12px;
`;

const Meta = styled.span`
    color: ${ThemeColors.PRIMARY};
    font-size: 12px;
`;

const Intro = styled.p`
    margin: 0;
    padding: 16px 16px 0;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    font-size: 13px;
    line-height: 1.5;
`;

const Hint = styled.span`
    display: block;
    margin-top: 6px;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    font-size: 12px;
    text-align: center;
`;
