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

import { TraceAnimationEntry } from "../components/DiagramContext";
import { getAgentTraceState, matchesCallingAgent } from "../components/nodes/AgentWidget/agentTraceAnimation";

const tutorPrompt = "# Role  \nMath Tutor  \n\n# Instructions  \nTeach maths.";
const converterPrompt = "# Role  \nUnit Converter  \n\n# Instructions  \nConvert units.";
const tutor = { role: "Math Tutor", instructions: "Teach maths." } as any;
const converter = { role: "Unit Converter", instructions: "Convert units." } as any;
const tutorTools = [{ name: "multiplyTool" }, { name: "unitConverterTool" }] as any;
const converterTools = [{ name: "multiplyTool" }] as any;

function entry(type: TraceAnimationEntry["type"], systemInstructions: string, toolName?: string): TraceAnimationEntry {
    return { type, toolName, systemInstructions, agentToolNames: ["multiplyTool"], phase: "active" };
}

function state(entries: TraceAnimationEntry[], tools: any, systemPrompt: any) {
    return getAgentTraceState({
        traceAnimation: { entries },
        tools,
        systemPrompt,
        enabled: true,
        requireEntrypointMatch: false,
    });
}

describe("agent trace animation with nested agents", () => {
    const entries = [
        entry("chat", tutorPrompt),
        entry("execute_tool", tutorPrompt, "unitConverterTool"),
        entry("chat", converterPrompt),
        entry("execute_tool", converterPrompt, "multiplyTool"),
    ];

    it("lights only the caller's own tool while a nested agent runs a tool of the same name", () => {
        const caller = state(entries, tutorTools, tutor);
        expect(caller.activeToolNames).toEqual(["unitConverterTool"]);
        expect(caller.isModelActive).toBe(false);
    });

    it("lights the nested agent's own tool on its own node", () => {
        expect(state(entries, converterTools, converter).activeToolNames).toEqual(["multiplyTool"]);
    });

    it("shows the caller thinking once its tool ends, whatever the nested agent does", () => {
        const caller = state([entry("chat", tutorPrompt), entry("chat", converterPrompt)], tutorTools, tutor);
        expect(caller.isModelActive).toBe(true);
        expect(state([entry("chat", converterPrompt)], tutorTools, tutor).isAgentNodeActive).toBe(false);
    });

    it("falls back to tool names for a node without a prompt", () => {
        expect(state([entry("chat", converterPrompt)], converterTools, undefined).isModelActive).toBe(true);
    });
});

describe("agent trace animation with an unmatched tool", () => {
    it("keeps the model dark while a tool that matches no circle runs", () => {
        const result = state([entry("chat", tutorPrompt), entry("execute_tool", tutorPrompt, "get_current_weather")], tutorTools, tutor);
        expect(result.isModelActive).toBe(false);
        expect(result.isAgentNodeActive).toBe(true);
        expect(result.activeToolNames).toEqual([]);
    });
});

describe("calling agent rows", () => {
    const solverPrompt = "# Role  \nWord Problem Solver  \n\n# Instructions  \nSolve problems.";
    const callingTool = (owner: string) => ({ entries: [entry("execute_tool", owner, "unitConverterTool")] });

    it("lights only the caller whose role ran the tool", () => {
        const solverRow = { agentRole: "Word Problem Solver", toolNames: ["unitConverterTool"] };
        const tutorRow = { agentRole: "string `Math Tutor`", toolNames: ["unitConverterTool"] };
        expect(matchesCallingAgent(callingTool(solverPrompt), solverRow)).toBe(true);
        expect(matchesCallingAgent(callingTool(solverPrompt), tutorRow)).toBe(false);
        expect(matchesCallingAgent(callingTool(tutorPrompt), tutorRow)).toBe(true);
    });

    it("ignores tools that do not run this agent and finished calls", () => {
        const row = { agentRole: "Math Tutor", toolNames: ["wordProblemTool"] };
        expect(matchesCallingAgent(callingTool(tutorPrompt), row)).toBe(false);
        const fading = { entries: [{ ...entry("execute_tool", tutorPrompt, "wordProblemTool"), phase: "fading-out" as const }] };
        expect(matchesCallingAgent(fading, row)).toBe(false);
    });
});
