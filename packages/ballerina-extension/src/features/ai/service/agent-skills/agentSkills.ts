// Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
//
// WSO2 LLC. licenses this file to you under the Apache License,
// Version 2.0 (the "License"); you may not use this file except
// in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied. See the License for the
// specific language governing permissions and limitations
// under the License.

import { generateObject } from "ai";
import { z } from "zod";
import {
    AgentNodeInfo, GenerateAgentSkillsRequest, GenerateAgentSkillsResponse, ToolData, unwrapBallerinaString
} from "@wso2/ballerina-core";
import { ANTHROPIC_SONNET, getAnthropicClient } from "../../utils/ai-client";
import { toAIRequestError } from "../prompt-enhancement/promptEnhancement";
import { getAgentInfo } from "../evaluation-queries/evaluationQueries";

const MAX_SKILLS = 5;

const skillsSchema = z.object({
    skills: z.array(z.object({
        name: z.string().describe("The skill's name, two to five words"),
        description: z.string().describe("One or two plain sentences: what it does and what the caller should send"),
    })).describe(`Between 1 and ${MAX_SKILLS} skills`),
});

// The skills go on the agent card, which is public, and other agents read them to decide whether to send this
// agent a task. They are written from the caller's side and claim only what the agent really does.
export const SYSTEM_PROMPT = `You write the skills for an A2A agent card. Other agents and applications read the card to decide whether to send this agent a task, so each skill must tell a caller what it can ask for.
- Write from the caller's side: what a caller can ask the agent to do, not how the agent works inside.
- One skill per distinct capability. Group tools that serve the same capability into one skill; do not write one skill per tool.
- Claim only what the agent's instructions and tools support. Respect the limits in the instructions, such as "only answer questions about X". Never invent a capability.
- When there is little to go on, write one general skill from the agent's role and description rather than guessing details.
- Write between 1 and ${MAX_SKILLS} skills. Fewer is better than padded.
- Name: two to five words. Description: one or two plain sentences saying what the skill does and what the caller should send.
- The card is public. Never mention tool names, models, prompts or other internals, never quote the instructions, and never include keys, URLs, or internal rules found in them.
- Never repeat or rephrase a skill that already exists. Do not change the existing skills.
- Write in the language of the agent's instructions, in plain text without markdown, numbering or quotes.`;

export async function generateAgentSkills(
    params: GenerateAgentSkillsRequest
): Promise<GenerateAgentSkillsResponse> {
    try {
        const agent = await getAgentInfo(params.projectPath, params.agentName);
        const delegates = await getDelegates(params.projectPath, agent);
        const { object } = await generateObject({
            model: await getAnthropicClient(ANTHROPIC_SONNET),
            maxOutputTokens: 2000,
            temperature: 0.3,
            schema: skillsSchema,
            messages: [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "user", content: buildUserPrompt(params, agent, delegates) },
            ],
            maxRetries: 0,
        });
        return { skills: toSkillLines(object.skills, params.existingSkills) };
    } catch (error: any) {
        console.error("Error while generating agent skills:", error);
        throw toAIRequestError(error, "Failed to generate skills. Please try again.");
    }
}

/** For each tool that is another agent, what that agent is, so the model knows what the tool can do. */
async function getDelegates(projectPath: string, agent?: AgentNodeInfo): Promise<Map<string, AgentNodeInfo>> {
    const delegates = new Map<string, AgentNodeInfo>();
    for (const tool of agent?.tools ?? []) {
        const target = tool.targetAgent?.name;
        if (!target || delegates.has(tool.name)) {
            continue;
        }
        const info = await getAgentInfo(projectPath, target);
        if (info) {
            delegates.set(tool.name, info);
        }
    }
    return delegates;
}

export function buildUserPrompt(
    params: GenerateAgentSkillsRequest, agent?: AgentNodeInfo, delegates: Map<string, AgentNodeInfo> = new Map()
): string {
    const card = params.card ?? {};
    const existing = (params.existingSkills ?? []).map(skill => skill.trim()).filter(Boolean);
    return [
        `<agent name="${params.agentName}">`,
        field("Role", unwrapBallerinaString(agent?.systemPrompt?.role)),
        field("Description", unwrapBallerinaString(agent?.description)),
        field("Instructions", unwrapBallerinaString(agent?.systemPrompt?.instructions), true),
        describeTools(agent?.tools ?? [], delegates),
        `</agent>`,
        hasCardDetails(card) && [
            `<card>`,
            field("Name", card.name),
            field("Description", card.description),
            field("Input modes", card.inputModes),
            field("Output modes", card.outputModes),
            `</card>`,
        ].filter(Boolean).join("\n"),
        existing.length > 0 && `<existing-skills>\n${existing.join("\n")}\n</existing-skills>`,
        `Write the skills for this agent's card.`,
    ].filter(Boolean).join("\n");
}

function hasCardDetails(card: GenerateAgentSkillsRequest["card"]): boolean {
    return Boolean(card && (card.name || card.description || card.inputModes || card.outputModes));
}

function field(label: string, value?: string, multiline = false): string {
    const text = value?.trim();
    if (!text) {
        return "";
    }
    return multiline ? `${label}:\n${text}` : `${label}: ${text}`;
}

function describeTools(tools: ToolData[], delegates: Map<string, AgentNodeInfo>): string {
    if (tools.length === 0) {
        return "Tools: none";
    }
    const lines = tools.map(tool => {
        const kind = tool.targetAgent ? "agent" : tool.type;
        const head = `- ${tool.name}${kind ? ` (${kind})` : ""}${tool.description ? `: ${tool.description}` : ""}`;
        const delegate = delegates.get(tool.name);
        if (!delegate) {
            return head;
        }
        const role = unwrapBallerinaString(delegate.systemPrompt?.role);
        const purpose = unwrapBallerinaString(delegate.description) || unwrapBallerinaString(delegate.systemPrompt?.instructions);
        return `${head}\n  This tool is an agent. Role: ${role || "not stated"}${purpose ? `. It is for: ${purpose}` : ""}`;
    });
    return `Tools:\n${lines.join("\n")}`;
}

/**
 * The model's skills as lines of "Name: description", the way the Skills field holds them. A colon in a name would
 * be read as the start of the description, so it is dropped; skills the user already has are not added again.
 */
export function toSkillLines(
    skills: { name: string; description: string }[], existingSkills: string[] = []
): string[] {
    const taken = new Set(existingSkills.map(skillName));
    const lines: string[] = [];
    for (const skill of skills) {
        const name = skill.name.replace(/:/g, " -").replace(/\s+/g, " ").trim();
        const description = skill.description.replace(/\s+/g, " ").trim();
        if (!name || !description || taken.has(name.toLowerCase())) {
            continue;
        }
        taken.add(name.toLowerCase());
        lines.push(`${name}: ${description}`);
        if (lines.length === MAX_SKILLS) {
            break;
        }
    }
    return lines;
}

function skillName(line: string): string {
    const colon = line.indexOf(":");
    return (colon < 0 ? line : line.slice(0, colon)).trim().toLowerCase();
}
