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

/** While signed in, puts a WSO2 Agent Manager card above the model providers; a picked provider comes back through `onSelect` with a `prepareTemplate` step. */
export function useAgentManagerModelProviders(connectionKind: string, categories: Category[], onSelect?: OnSelect) {
    const session = useAgentManagerSession();
    const { rpcClient } = useRpcContext();
    const openPage = useAgentManagerPage();
    const enabled = connectionKind === "MODEL_PROVIDER" && !!session?.signedIn;
    const { data } = useQuery({
        queryKey: ["agentManagerModelProviders"],
        queryFn: () => rpcClient.getAgentManagerRpcClient().getAgentManagerModelProviders(),
        enabled,
    });

    const openPicker = () => openPage("agent-manager-llm-service-providers", (close) => (
        <AgentManagerProviderPicker
            categories={categories}
            org={session?.org}
            onPick={async (id, metadata) => {
                // The picker stays up while the host loads the form, so the list never flashes in between.
                await onSelect?.(id, metadata);
                close();
            }}
        />
    ));

    return {
        categories,
        onSelect,
        leadingSection: enabled && (
            <ListSection>
                <AgentManagerEntryCard
                    description="Models your organization added to Agent Manager, served through its AI Gateway with platform-issued keys."
                    meta={data && `${session.org} · ${count(data.providers.length, "LLM service provider")}`}
                    onClick={openPicker}
                />
            </ListSection>
        ),
    };
}

export const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

export function AgentManagerEntryCard({ description, meta, onClick }: { description: string; meta?: string; onClick: () => void }) {
    return (
        <OptionCard
            accent
            icon={<Icon name="bi-wso2" sx={{ width: 24, height: 24 }} iconSx={{ fontSize: "24px" }} />}
            title={AGENT_MANAGER_TITLE}
            description={description}
            meta={meta}
            onClick={onClick}
        />
    );
}

export function OptionCard({ icon, title, description, meta, accent, onClick }: {
    icon: JSX.Element;
    title: string;
    description: string;
    meta?: string;
    accent?: boolean;
    onClick: () => void;
}) {
    return (
        <EntryCard type="button" accent={accent} onClick={onClick}>
            <EntryIcon>{icon}</EntryIcon>
            <EntryText>
                <EntryTitle>{title}</EntryTitle>
                <Muted>{description}</Muted>
                {meta && <Meta>{meta}</Meta>}
            </EntryText>
            <Codicon name="chevron-right" />
        </EntryCard>
    );
}

export function ConsoleAction({ label, url }: { label: string; url: string }) {
    const { rpcClient } = useRpcContext();
    return (
        <>
            <ConsoleLink type="button" onClick={() => rpcClient.getCommonRpcClient().openExternalUrl({ url })}>
                <Codicon name="link-external" />{label}
            </ConsoleLink>
            <Hint>Opens the Agent Manager console in your browser.</Hint>
        </>
    );
}

function AgentManagerProviderPicker({ categories, org, onPick }: { categories: Category[]; org?: string; onPick: OnSelect }) {
    const { rpcClient } = useRpcContext();
    const [preparing, setPreparing] = useState(false);
    const { data, isLoading } = useQuery({
        queryKey: ["agentManagerModelProviders"],
        queryFn: () => rpcClient.getAgentManagerRpcClient().getAgentManagerModelProviders(),
    });

    const pick = async (_id: string, metadata?: { node: { provider: AgentManagerModelProvider; providerNode: Node } }) => {
        const { provider, providerNode } = metadata.node;
        const variables = configurableNames(provider);
        setPreparing(true);
        const { projectPath } = await rpcClient.getVisualizerLocation();
        const { success } = await rpcClient.getAgentManagerRpcClient()
            .createAgentManagerModelKey({ projectPath, providerId: provider.id, ...variables });
        if (!success) {
            setPreparing(false);
            return;
        }
        await onPick(providerNode.id, {
            node: providerNode.metadata,
            prepareTemplate: (flowNode: FlowNode) => applyProvider(flowNode, provider, variables),
        });
    };

    if (isLoading || preparing) {
        return <LoaderContainer><RelativeLoader /></LoaderContainer>;
    }
    return (
        <>
            <Intro>Pick a model your organization added to Agent Manager. Requests go through its AI Gateway with a platform-issued key.</Intro>
            <CardList
                categories={[toProviderCategory(data?.providers ?? [], categories, org)]}
                onSelect={pick}
                extraSection={data?.consoleUrl && <ConsoleAction label="Add LLM Service Provider" url={data.consoleUrl} />}
            />
        </>
    );
}

// Each provider borrows its matching model provider card, which is what the host turns into the form.
function toProviderCategory(providers: AgentManagerModelProvider[], categories: Category[], org?: string): Category {
    const items = providers.map((provider): Node => {
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
    return { title: org ? `LLM Service Providers in ${org}` : "LLM Service Providers", description: "", items };
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
    const base = provider.id.replace(/[^A-Za-z0-9]+(.)?/g, (_, next: string) => next?.toUpperCase() ?? "");
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

export const ConsoleLink = styled.button`
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

const EntryCard = styled.button<{ accent?: boolean }>`
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 12px;
    border: 1px solid ${({ accent }: { accent?: boolean }) => (accent ? ThemeColors.PRIMARY : ThemeColors.OUTLINE_VARIANT)};
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

export const Muted = styled.span`
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    font-size: 12px;
`;

const Meta = styled.span`
    color: ${ThemeColors.PRIMARY};
    font-size: 12px;
`;

export const Intro = styled.p`
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
