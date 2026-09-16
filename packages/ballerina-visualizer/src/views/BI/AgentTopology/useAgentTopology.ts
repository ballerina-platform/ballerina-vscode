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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ProjectStructureArtifactResponse } from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { TopologyAgentArtifact, TopologyInput } from "@wso2/component-diagram";
import { useProjectContentRefresh } from "../PackageOverview/utils";

const DEFER_MS = 600;

// Keyed by projectPath so returning from a drill-in paints immediately with the last input,
// same idea as agentUsages.ts's usage cache.
const inputCache = new Map<string, TopologyInput>();

function toArtifact(agent: ProjectStructureArtifactResponse, isDefinition: boolean): TopologyAgentArtifact {
    return {
        name: agent.name,
        path: agent.path,
        startLine: agent.position?.startLine ?? 0,
        moduleName: agent.moduleName,
        isDefinition,
    };
}

export function useAgentTopology(
    projectPath: string,
    agents: ProjectStructureArtifactResponse[],
    agentDefinitions: ProjectStructureArtifactResponse[] = []
): TopologyInput | undefined {
    const { rpcClient } = useRpcContext();
    const [input, setInput] = useState<TopologyInput | undefined>(() => inputCache.get(projectPath));
    const requestIdRef = useRef(0);
    const contentRef = useRef(0);
    const fetchTimerRef = useRef<ReturnType<typeof setTimeout>>();

    const artifacts = useMemo(
        () => [
            ...agents.map((agent) => toArtifact(agent, false)),
            ...agentDefinitions.map((agent) => toArtifact(agent, true)),
        ],
        [agents, agentDefinitions]
    );

    const scheduleFetch = useCallback(() => {
        clearTimeout(fetchTimerRef.current);
        const requestId = ++requestIdRef.current;
        fetchTimerRef.current = setTimeout(async () => {
            const contentAtStart = contentRef.current;
            try {
                const response = await rpcClient.getBIDiagramRpcClient().getDesignModel({ projectPath });
                if (requestId !== requestIdRef.current || contentRef.current !== contentAtStart || !response?.designModel) {
                    return;
                }
                const next: TopologyInput = { model: response.designModel, agents: artifacts };
                inputCache.set(projectPath, next);
                setInput(next);
            } catch (error) {
                console.error(">>> agent topology: failed to load design model", error);
            }
        }, DEFER_MS);
    }, [rpcClient, projectPath, artifacts]);

    useEffect(() => {
        scheduleFetch();
    }, [scheduleFetch]);

    useProjectContentRefresh(rpcClient, () => {
        contentRef.current++;
        scheduleFetch();
    });

    useEffect(() => () => clearTimeout(fetchTimerRef.current), []);

    return input;
}
