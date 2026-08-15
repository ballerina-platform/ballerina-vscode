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

import { EVENT_TYPE, MACHINE_VIEW } from "@wso2/ballerina-core";
import { openView, StateMachine } from "../../stateMachine";
import { isEmptyPackage } from "../../utils/state-machine-utils";
import { ProductMode } from "../../utils/config";

/**
 * Agent builder mode: when the window holds a single, still-empty package, land on the Add
 * Agent view — the same one the Agents "+" in the project explorer opens
 * (`BI_COMMANDS.ADD_AGENT`) — instead of an overview with nothing on it.
 *
 * Returns whether it navigated, so callers can fall back to their own landing. A no-op once
 * something else has navigated (machine no longer in `extensionReady`), which is what defers
 * to a wizard create that generated a real artifact and opened it.
 */
export function openAgentBuilderLanding(): boolean {
    if (StateMachine.productMode() !== ProductMode.AGENT_BUILDER) {
        return false;
    }
    if (StateMachine.service().getSnapshot().value !== "extensionReady") {
        console.log("[AgentBuilder] Skipping landing: a view was already opened.");
        return false;
    }
    const projects = StateMachine.context().projectStructure?.projects ?? [];
    // Exactly one package: with several open there is no single obvious home for the agent.
    if (projects.length !== 1) {
        console.log(`[AgentBuilder] Skipping landing: expected exactly 1 package, found ${projects.length}.`);
        return false;
    }
    const [project] = projects;
    if (project.isLibrary || !isEmptyPackage(project)) {
        console.log("[AgentBuilder] Skipping landing: the package is a library or already has artifacts.");
        return false;
    }
    console.log(`[AgentBuilder] Empty project — landing on the Add Agent view (${project.projectPath}).`);
    openView(EVENT_TYPE.OPEN_VIEW, {
        view: MACHINE_VIEW.AddAgent,
        projectPath: project.projectPath,
    });
    return true;
}
