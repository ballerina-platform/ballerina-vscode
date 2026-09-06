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

export type OverviewLevel = "overview" | "agent";

// 0 agents: moot, EmptyState wins regardless of level.
// 1 agent: forced to the single-agent page, no back link.
// ≥2 agents: the level the user was last drilled to this session, or the overview on a fresh open.
export function landingLevel(agentCount: number, remembered: OverviewLevel | undefined): OverviewLevel {
    if (agentCount <= 1) {
        return "agent";
    }
    return remembered ?? "overview";
}
