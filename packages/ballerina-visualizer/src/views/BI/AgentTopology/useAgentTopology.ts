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
import { DIRECTORY_MAP, ProjectStructureArtifactResponse } from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { TopologyAgentArtifact, TopologyInput } from "@wso2/component-diagram";

const inputCache = new Map<string, TopologyInput>();

export function canonicalTopology(input: unknown): string {
    const entityKeys = new Map<string, string>();
    const collect = (value: unknown): void => {
        if (Array.isArray(value)) {
            value.forEach(collect);
        } else if (value && typeof value === "object") {
            const node = value as Record<string, unknown>;
            if (typeof node.uuid === "string") {
                entityKeys.set(node.uuid, `${node.sortText ?? ""}:${node.symbol ?? node.name ?? ""}`);
            }
            Object.values(node).forEach(collect);
        }
    };
    collect(input);
    const key = (text: string) => entityKeys.get(text) ?? text;
    const normalize = (value: unknown): unknown => {
        if (Array.isArray(value)) {
            return value.every((item) => typeof item === "string")
                ? value.map((item) => key(item as string)).sort()
                : value.map(normalize);
        }
        if (value && typeof value === "object") {
            return Object.entries(value as Record<string, unknown>)
                .map(([name, item]): [string, unknown] => [key(name), normalize(item)])
                .sort(([a], [b]) => a.localeCompare(b));
        }
        return typeof value === "string" ? key(value) : value;
    };
    return JSON.stringify(normalize(input));
}

const NO_AGENT_DEFINITIONS: ProjectStructureArtifactResponse[] = [];

function toArtifact(agent: ProjectStructureArtifactResponse, isDefinition: boolean): TopologyAgentArtifact {
    return {
        name: agent.name,
        path: agent.path,
        startLine: agent.position?.startLine ?? 0,
        moduleName: agent.moduleName,
        isDefinition,
        kind: agent.kind === DIRECTORY_MAP.DURABLE_AGENT ? "durable" : undefined,
    };
}

export function useAgentTopology(
    projectPath: string,
    agents: ProjectStructureArtifactResponse[],
    agentDefinitions: ProjectStructureArtifactResponse[] = NO_AGENT_DEFINITIONS
): TopologyInput | undefined {
    const { rpcClient } = useRpcContext();
    const [input, setInput] = useState<TopologyInput | undefined>(() => inputCache.get(projectPath));
    const requestIdRef = useRef(0);

    const artifacts = useMemo(
        () => [
            ...agents.map((agent) => toArtifact(agent, false)),
            ...agentDefinitions.map((agent) => toArtifact(agent, true)),
        ],
        [agents, agentDefinitions]
    );

    // The overview refetches the project structure on every content change, which hands in new artifacts and refetches this.
    const fetchTopology = useCallback(async () => {
        const requestId = ++requestIdRef.current;
        try {
            const response = await rpcClient.getBIDiagramRpcClient().getDesignModel({ projectPath });
            if (requestId !== requestIdRef.current || !response?.designModel) {
                return;
            }
            const next: TopologyInput = { model: response.designModel, agents: artifacts };
            // A refetch that matches what is on screen must not rebuild the diagram.
            setInput((current) => {
                const kept = current && canonicalTopology(current) === canonicalTopology(next) ? current : next;
                inputCache.set(projectPath, kept);
                return kept;
            });
        } catch (error) {
            console.error(">>> agent topology: failed to load design model", error);
        }
    }, [rpcClient, projectPath, artifacts]);

    useEffect(() => {
        void fetchTopology();
    }, [fetchTopology]);

    return input;
}
