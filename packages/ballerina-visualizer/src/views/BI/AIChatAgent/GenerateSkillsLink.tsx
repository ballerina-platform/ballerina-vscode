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

import React, { useState } from "react";
import styled from "@emotion/styled";
import { Icon, LinkButton, ProgressRing } from "@wso2/ui-toolkit";
import { useFormContext } from "@wso2/ballerina-side-panel";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { unwrapBallerinaString } from "@wso2/ballerina-core";
import { toQueryExpression } from "../AIEvaluationForm/templateUtils";

const SKILLS_KEY = "skills";

// Under the Skills field, on the right, as the evaluation form puts its Generate link.
const Action = styled.div`
    display: flex;
    justify-content: flex-end;
    margin: -8px 0 8px;
`;

export interface GenerateSkillsLinkProps {
    projectPath: string;
    agentName: string;
}

/** Asks the model for skills the agent's card can advertise, and adds them to the Skills field. */
export function GenerateSkillsLink(props: GenerateSkillsLinkProps) {
    const { projectPath, agentName } = props;
    const { rpcClient } = useRpcContext();
    const { form } = useFormContext();
    const [isGenerating, setIsGenerating] = useState(false);

    // The field holds each skill as a Ballerina string template, so what it holds is not what the user reads.
    const readSkills = () => ((form.getValues(SKILLS_KEY) as string[] | undefined) ?? [])
        .filter((skill) => typeof skill === "string" && unwrapBallerinaString(skill).trim());

    const text = (key: string) => {
        const value = form.getValues(key);
        return typeof value === "string" ? value : undefined;
    };

    const generate = async () => {
        const aiPanel = rpcClient.getAiPanelRpcClient();
        if (!await aiPanel.isUserAuthenticated()) {
            aiPanel.promptForLogin();
            return;
        }
        setIsGenerating(true);
        try {
            const res = await rpcClient.getAIAgentRpcClient().generateAgentSkills({
                projectPath,
                agentName,
                card: {
                    name: text("cardName"),
                    description: text("cardDescription"),
                    inputModes: text("inputModes"),
                    outputModes: text("outputModes"),
                },
                existingSkills: readSkills().map(unwrapBallerinaString),
            });
            if (res.skills.length > 0) {
                // Read again, so skills typed while generating are kept.
                form.setValue(SKILLS_KEY, [...readSkills(), ...res.skills.map(toQueryExpression)], { shouldDirty: true });
            }
        } catch (error) {
            // The extension has already told the user why.
            console.error("Failed to generate skills:", error);
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <Action>
            <LinkButton
                onClick={isGenerating ? undefined : generate}
                sx={{ fontSize: 12, gap: 4, padding: "0 8px", ...(isGenerating && { opacity: 0.6, cursor: "default" }) }}
            >
                {isGenerating
                    ? <ProgressRing sx={{ width: 12, height: 12 }} />
                    : <Icon name="wand-magic-sparkles-solid" sx={{ width: 12, height: 12 }} iconSx={{ fontSize: "12px" }} />}
                {isGenerating ? "Generating Skills…" : "Generate Skills"}
            </LinkButton>
        </Action>
    );
}

export default GenerateSkillsLink;
