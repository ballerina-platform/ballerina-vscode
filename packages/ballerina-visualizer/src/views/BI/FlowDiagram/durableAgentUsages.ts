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

import { useEffect, useRef, useState } from "react";
import { AgentUsage, Flow, FlowNode, LineRange } from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { AgentRef, findDurableAgentUsages, getCachedUsages, setCachedUsages, usageCacheKey } from "../FocusFlowDiagram/agentUsages";

const DEFER_MS = 600;

type DurableBoxData = { agentBox?: boolean; agentName?: string; declaration?: LineRange; usages?: AgentUsage[]; animateUsages?: boolean };
type Shown = { key: string; usages: AgentUsage[] };

function boxData(node: FlowNode): DurableBoxData {
    return (node.metadata?.data ?? {}) as DurableBoxData;
}

export function findDurableAgentBox(flow: Flow | undefined): FlowNode | undefined {
    return flow?.nodes?.find((node) => node.codedata?.node === "DURABLE_AGENT_RUN" && boxData(node).agentBox === true);
}

export function durableAgentRefOf(flow: Flow, box: FlowNode): AgentRef {
    const { declaration, agentName } = boxData(box);
    return {
        filePath: declaration?.fileName ?? flow.fileName,
        startLine: declaration?.startLine?.line ?? box.codedata?.lineRange?.startLine?.line ?? 0,
        symbol: agentName,
    };
}

export function sameUsages(a: AgentUsage[] | undefined, b: AgentUsage[]): boolean {
    return JSON.stringify(a ?? []) === JSON.stringify(b);
}

export function withDurableUsages(flow: Flow, usages: AgentUsage[], animate = true): Flow {
    const box = findDurableAgentBox(flow);
    return {
        ...flow,
        nodes: flow.nodes.map((node): FlowNode =>
            node === box
                ? { ...node, metadata: { ...node.metadata, data: { ...boxData(node), usages, animateUsages: animate } as FlowNode["metadata"]["data"] } }
                : node
        ),
    };
}

function usageKeyOf(projectPath: string, flow: Flow, box: FlowNode): string {
    const agentRef = durableAgentRefOf(flow, box);
    return usageCacheKey(projectPath, agentRef.filePath, agentRef.symbol ?? "");
}

export function durableUsagesReady(box: FlowNode | undefined, key: string | undefined, shown: Shown | undefined): boolean {
    return !box || boxData(box).usages !== undefined || shown?.key === key;
}

export function useDurableAgentUsages(enabled: boolean, flow: Flow | undefined, projectPath: string, setFlow: (flow: Flow) => void): boolean {
    const { rpcClient } = useRpcContext();
    const requestIdRef = useRef(0);
    const timerRef = useRef<ReturnType<typeof setTimeout>>();
    const shownRef = useRef<Shown>();
    const dirtyRef = useRef(true);
    const contentRef = useRef(0);
    const [contentVersion, setContentVersion] = useState(0);
    const box = enabled ? findDurableAgentBox(flow) : undefined;
    const key = box ? usageKeyOf(projectPath, flow, box) : undefined;

    useEffect(
        () =>
            rpcClient.onProjectContentUpdated(() => {
                dirtyRef.current = true;
                contentRef.current++;
                setContentVersion((version) => version + 1);
            }),
        [rpcClient]
    );

    useEffect(() => {
        if (!box) {
            return;
        }
        const shown = boxData(box).usages;
        const show = (usages: AgentUsage[]) => {
            const previous = shownRef.current?.key === key ? shownRef.current.usages : undefined;
            shownRef.current = { key, usages };
            setFlow(withDurableUsages(flow, usages, !previous || !sameUsages(previous, usages)));
        };
        const cached = getCachedUsages(key);
        if (cached && (shown === undefined || !sameUsages(shown, cached))) {
            show(cached);
            return;
        }
        if (cached && !dirtyRef.current) {
            return;
        }
        clearTimeout(timerRef.current);
        const requestId = ++requestIdRef.current;
        const contentAtStart = contentRef.current;
        const delay = shownRef.current?.key === key ? DEFER_MS : 0;
        timerRef.current = setTimeout(async () => {
            try {
                const response = await rpcClient.getBIDiagramRpcClient().getDesignModel({ projectPath });
                if (requestId !== requestIdRef.current) {
                    return;
                }
                if (!response?.designModel) {
                    if (shown === undefined) {
                        show([]);
                    }
                    return;
                }
                const usages = findDurableAgentUsages(response.designModel, durableAgentRefOf(flow, box));
                setCachedUsages(key, usages);
                if (contentRef.current === contentAtStart) {
                    dirtyRef.current = false;
                }
                if (shown === undefined || !sameUsages(shown, usages)) {
                    show(usages);
                }
            } catch (error) {
                console.error(">>> durable agent: failed to load usages", error);
                if (shown === undefined) {
                    show([]);
                }
            }
        }, delay);
        return () => clearTimeout(timerRef.current);
    }, [box, key, flow, projectPath, rpcClient, setFlow, contentVersion]);

    return durableUsagesReady(box, key, shownRef.current);
}
