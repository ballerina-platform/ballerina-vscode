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

// The model, the login and the language server are out of reach here; this covers what the model is asked and how
// its answer is turned into entries of the Skills field.
jest.mock("../features/ai/utils/ai-client", () => ({ ANTHROPIC_SONNET: "sonnet", getAnthropicClient: jest.fn() }));
jest.mock("../features/ai/service/prompt-enhancement/promptEnhancement", () => ({ toAIRequestError: jest.fn() }));
jest.mock("../features/ai/service/evaluation-queries/evaluationQueries", () => ({ getAgentInfo: jest.fn() }));
// The real module pulls in a websocket library that jest cannot load; only this helper is used here.
jest.mock("@wso2/ballerina-core", () => ({
    unwrapBallerinaString: (value?: string) => (value ?? "").trim().replace(/^string\s*`|`$/g, ""),
}));

import { SYSTEM_PROMPT, buildUserPrompt, toSkillLines } from "../features/ai/service/agent-skills/agentSkills";

const agent = {
    description: "Plans weekends",
    systemPrompt: { role: "Weekend Planner", instructions: "Plan a relaxed weekend for the city the user names." },
    tools: [
        { name: "getWeather", description: "Current weather for a city" },
        { name: "mcpTools", type: "MCP Server" },
        { name: "foodGuide", targetAgent: { name: "foodGuide", documentUri: "", position: {} as any } },
    ],
};

describe("the prompt for the skills of an agent card", () => {
    it("tells the model the card is public and the skills are for callers", () => {
        expect(SYSTEM_PROMPT).toContain("Never mention tool names");
        expect(SYSTEM_PROMPT).toContain("Claim only what the agent's instructions and tools support");
        expect(SYSTEM_PROMPT).toContain("between 1 and 5 skills");
    });

    it("gives the model the agent, its tools, the card as typed and the skills already written", () => {
        const delegates = new Map([["foodGuide", {
            description: "Finds places to eat", systemPrompt: { role: "Food Guide", instructions: "Recommend restaurants." },
        }]]);
        const prompt = buildUserPrompt({
            projectPath: "/p", agentName: "weekendPlanner",
            card: { name: "Weekend Planner Agent", description: "Plans your weekend", inputModes: "text", outputModes: "text" },
            existingSkills: ["Trip planning: Plans a weekend", "  "],
        }, agent, delegates);
        expect(prompt).toContain('<agent name="weekendPlanner">');
        expect(prompt).toContain("Role: Weekend Planner");
        expect(prompt).toContain("Description: Plans weekends");
        expect(prompt).toContain("Instructions:\nPlan a relaxed weekend for the city the user names.");
        expect(prompt).toContain("- getWeather: Current weather for a city");
        expect(prompt).toContain("- mcpTools (MCP Server)");
        expect(prompt).toContain("- foodGuide (agent)");
        expect(prompt).toContain("This tool is an agent. Role: Food Guide. It is for: Finds places to eat");
        expect(prompt).toContain("<card>\nName: Weekend Planner Agent\nDescription: Plans your weekend");
        expect(prompt).toContain("<existing-skills>\nTrip planning: Plans a weekend\n</existing-skills>");
    });

    it("says so when the agent has no tools, and leaves out a card that has nothing in it", () => {
        const prompt = buildUserPrompt({ projectPath: "/p", agentName: "a", card: {}, existingSkills: [] },
            { systemPrompt: { role: "Helper" } });
        expect(prompt).toContain("Tools: none");
        expect(prompt).not.toContain("<card>");
        expect(prompt).not.toContain("<existing-skills>");
    });
});

describe("the skills the model returns", () => {
    it("become Name: description lines", () => {
        expect(toSkillLines([{ name: " Trip planning ", description: "Plans a  day\nout." }]))
            .toEqual(["Trip planning: Plans a day out."]);
    });

    it("lose a colon in the name, which would start the description", () => {
        expect(toSkillLines([{ name: "Plan: weekend", description: "Plans it" }])).toEqual(["Plan - weekend: Plans it"]);
    });

    it("skip a skill the user already has, whatever its case, and a repeat in the answer", () => {
        expect(toSkillLines([
            { name: "trip PLANNING", description: "again" },
            { name: "Weather", description: "Forecasts" },
            { name: "weather", description: "Forecasts again" },
        ], ["Trip planning: Plans a weekend"])).toEqual(["Weather: Forecasts"]);
    });

    it("skip an entry with no name or no description, and stop at five", () => {
        const many = Array.from({ length: 8 }, (_, i) => ({ name: `Skill ${i}`, description: "Does it" }));
        expect(toSkillLines([{ name: "", description: "x" }, { name: "y", description: " " }, ...many])).toHaveLength(5);
    });
});
