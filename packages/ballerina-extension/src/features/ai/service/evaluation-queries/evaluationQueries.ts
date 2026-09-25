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

import { generateObject } from "ai";
import { z } from "zod";
import {
    AgentNodeInfo, GenerateEvaluationQueriesRequest, GenerateEvaluationQueriesResponse, NodeMetadata,
    unwrapBallerinaString
} from "@wso2/ballerina-core";
import { ANTHROPIC_HAIKU, getAnthropicClient } from "../../utils/ai-client";
import { toAIRequestError } from "../prompt-enhancement/promptEnhancement";
import { StateMachine } from "../../../../stateMachine";

const QUERY_COUNT = 5;

const queriesSchema = z.object({
    queries: z.array(z.string()).describe(`${QUERY_COUNT} messages a user would send to the agent`),
});

const SYSTEM_PROMPT = `You write test queries for evaluating an AI agent. Each query is one message that a real user of the agent would send.
- Base every query on the agent's instructions and tools.
- Make the queries differ: use different tools, mix simple and multi-step requests, and include one request the agent should decline or cannot fully answer.
- When an evaluation criterion is given, write queries whose answers show whether the agent meets it.
- Never repeat or rephrase a query the user already has.
- Write only the message text, without numbering, quotes or explanations.`;

export async function generateEvaluationQueries(
    params: GenerateEvaluationQueriesRequest
): Promise<GenerateEvaluationQueriesResponse> {
    try {
        const agent = await getAgentInfo(params.projectPath, params.agentName);
        const { object } = await generateObject({
            model: await getAnthropicClient(ANTHROPIC_HAIKU),
            maxOutputTokens: 2000,
            temperature: 0.7,
            schema: queriesSchema,
            messages: [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "user", content: buildUserPrompt(params, agent) },
            ],
            maxRetries: 0,
        });
        return { queries: object.queries.map(query => query.trim()).filter(Boolean) };
    } catch (error: any) {
        console.error("Error while generating evaluation queries:", error);
        throw toAIRequestError(error, "Failed to generate queries. Please try again.");
    }
}

async function getAgentInfo(projectPath: string, agentName: string): Promise<AgentNodeInfo | undefined> {
    const res = await StateMachine.langClient().searchNodes({
        filePath: projectPath,
        query: { kind: "AGENT", exactMatch: agentName },
    });
    return (res?.output?.[0]?.metadata?.data as NodeMetadata | undefined)?.agentInfo;
}

const JUDGE_GUIDANCE = "An LLM judge grades each answer against the criterion. Prefer requests whose answers need "
    + "an explanation, several steps or a judgment call, so the judge has something to grade, and avoid requests "
    + "with one-word answers.";
const RULE_GUIDANCE = "A rule checks each answer against the options below. Write requests whose answers exercise "
    + "those options, including some the agent could get wrong.";

function buildUserPrompt(params: GenerateEvaluationQueriesRequest, agent?: AgentNodeInfo): string {
    const tools = (agent?.tools ?? [])
        .map(tool => `- ${tool.name}${tool.description ? `: ${tool.description}` : ""}`)
        .join("\n");
    const existing = params.existingQueries ?? [];
    return [
        `<agent name="${params.agentName}">`,
        `Role: ${unwrapBallerinaString(agent?.systemPrompt?.role)}`,
        `Instructions:\n${unwrapBallerinaString(agent?.systemPrompt?.instructions)}`,
        tools && `Tools:\n${tools}`,
        `</agent>`,
        params.template && buildCriterion(params.template),
        existing.length > 0 && `<existing-queries>\n${existing.join("\n")}\n</existing-queries>`,
        `Write ${QUERY_COUNT} queries.`,
    ].filter(Boolean).join("\n");
}

function buildCriterion(template: GenerateEvaluationQueriesRequest["template"]): string {
    const guidance = template.kind && (template.kind.toUpperCase().includes("LLM") ? JUDGE_GUIDANCE : RULE_GUIDANCE);
    const options = (template.options ?? [])
        .filter(option => option.value)
        .map(option => `- ${option.name} = ${option.value}${option.description ? ` (${option.description})` : ""}`)
        .join("\n");
    return [
        `<criterion name="${template.label}"${template.kind ? ` kind="${template.kind}"` : ""}>`,
        template.description,
        guidance,
        options && `Options:\n${options}`,
        `</criterion>`,
    ].filter(Boolean).join("\n");
}
