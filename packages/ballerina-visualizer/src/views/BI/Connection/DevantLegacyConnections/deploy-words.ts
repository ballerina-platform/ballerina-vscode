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

/** What the deploy cards say on Devant, where an integration is deployed when it is created. */
export const DEVANT_DEPLOY_WORDS = {
    refreshTooltip: "Refresh deployment status",
    refreshingTooltip: "Refreshing deployment status…",
    notDeployedTitle: "Deploy to WSO2 Cloud",
    deployButton: "Deploy",
    deployedTitle: "Deployed in WSO2 Cloud",
    packageDeployed: "This integration is already deployed in WSO2 Cloud.",
    packageNotDeployed: "Deploy your integration to WSO2 Cloud.",
    workspaceNotDeployed: "Deploy your integrations to WSO2 Cloud.",
    workspaceDeployed: "All integrations are deployed in WSO2 Cloud.",
    redeploy: "To redeploy in WSO2 Cloud, please commit and push your changes.",
    partlyDeployedTitle: "Partially Deployed in WSO2 Cloud",
    deployRemaining: "Deploy Remaining",
};

/** The lines of a workspace with some integrations deployed and some not. */
export function devantPartlyDeployedWords(params: {
    deployableCount: number;
    deployableNames: string;
    nonDeployableCount: number;
    nonDeployableNames: string;
    canDeployRemaining: boolean;
    changed: { projectName?: string }[];
}): { description: string; changedDescription?: string } {
    const description = params.canDeployRemaining
        ? `${params.deployableCount === 1 ? "You have an undeployed integration" : "You have undeployed integrations"}: ${params.deployableNames || params.deployableCount + " integration(s)"}`
        : `Some integration(s) (${params.nonDeployableNames || params.nonDeployableCount + " integration(s)"}) cannot be deployed. No entry point found within these integration(s).`;
    if (params.changed.length === 0) {
        return { description };
    }
    const changedMessage =
        params.changed.length === 1
            ? `A deployed integration has uncommitted changes (${params.changed[0].projectName})`
            : `Some deployed integrations have uncommitted changes (${params.changed.map((p) => p.projectName).filter(Boolean).join(", ")})`;
    return { description, changedDescription: `${changedMessage}. Commit and push to redeploy.` };
}
