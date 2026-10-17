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

import { TaskTypes } from "@wso2/ballerina-core/lib/state-machine-types";
import { copilotName, getProductMode, ProductMode } from "../../../utils/config";
import { AGENT_BUILDER_ANCHOR_ACTIONS, ANCHOR_ACTIONS, AnchorAction } from "./followups/anchors";
import { AGENT_MODULE_INIT_CODING_RULES, MODULE_INIT_CODING_RULES } from "./module-init-rules";

export interface CopilotProfile {
    opening: string;
    designTaskType: TaskTypes;
    planTaskTypes: string;
    /** Ends with a newline when present, so the next bullet stays on its own line. */
    automationRule: string;
    workflowLibraryRule: string;
    terminology: string;
    moduleInitRules: string;
    clarifyEntryPointDefault: string;
    clarifyScopeRule: string;
    taskWriter: TaskWriterWording;
    followups: FollowupWording;
}

export interface TaskWriterWording {
    typeDescription: string;
    orderingRule: string;
    exampleDesignTask: string;
    exampleImplementationTask: string;
}

export interface FollowupWording {
    builds: string;
    scope: string;
    labelSpecificTo: string;
    anchors: AnchorAction[];
}

const INTEGRATOR_PLAN_TASK_TYPES = `1. 'service_design'
- Responsible for creating the listener, service, and its resource function signatures.
- In case of HTTP follow below guidelines, in other services follow according to the trigger.
- The signature should only have path, query, payload, header paramters and the return types. This step should contain types relevant to the service contract as well.
- Create resource function signatures with comprehensive return types covering all possible scenarios
- In this state, include http:NotImplemented as a union member in the return type of each resource function and return http:NOT_IMPLEMENTED in the body as a placeholder since this will be implemented in the next steps.
- Eg: resource function get hello() returns http:NotImplemented {
        return http:NOT_IMPLEMENTED;
      }
2. 'implementation'
- for all the other implementations. Have resource function implementations in its own task.
3. 'execution'
- Responsible for running the code, trying the apis out running tests.
- Include this task only if the user has explicitly asked to do any operations involving execution. Skip it otherwise.`;

const AGENT_BUILDER_PLAN_TASK_TYPES = `1. 'agent_design'
- Responsible for the shape of the agent: the agent or durable agent with its system prompt and model provider, the trigger that starts it, and the signatures of its tools.
- Write each of these the way the agent-builder skill shows, or the workflow-builder skill for a durable agent.
- A tool may return an error as a placeholder in this step, since its logic is implemented in the next steps.
2. 'implementation'
- For all the other implementations: tool logic, knowledge bases, connections and anything else the agent uses. Give each non-trivial tool its own task.
3. 'execution'
- Responsible for running the agent, chatting with it or calling its trigger, and running tests or evaluations.
- Include this task only if the user has explicitly asked to do any operations involving execution. Skip it otherwise.`;

function integratorProfile(): CopilotProfile {
    return {
        opening: `You are ${copilotName()}, an expert assistant specialized in Ballerina help with relavant integration usecases. You will be helping with designing a solution for user query in a step-by-step manner.

Answer queries related to Ballerina and integrations. If a query is unrelated, politely decline.`,
        designTaskType: TaskTypes.SERVICE_DESIGN,
        planTaskTypes: INTEGRATOR_PLAN_TASK_TYPES,
        workflowLibraryRule: "- For workflow-based requirements involving long-running processes, state management, or orchestration of multiple steps, use the 'ballerina/workflow' module.\n",
        automationRule: "- In WSO2 Integrator, Automation is simply an app with a main method unless user specifically mentions a service. Cron Job kind of requirements are handled in the deployment level for Kubernetes or Integration platform level.\n",
        terminology: `In WSO2 Integrator, a Ballerina workspace is called a **project** and a Ballerina package is called an **integration**.
- You MUST always use "project" and "integration" in all responses and clarifying questions. Never use "workspace" or "package" when communicating with the user.`,
        moduleInitRules: MODULE_INIT_CODING_RULES,
        clarifyScopeRule: "",
        clarifyEntryPointDefault: "Default to HTTP for simple service requests. Ask only when the trigger type is ambiguous and the choice materially affects the design.",
        taskWriter: {
            typeDescription: "service_design: creates the service contract only (no implementation). implementation: all other implementation tasks. execution: executing the implemented logic(run, try it, test) — include only if the user has explicitly asked for execution.",
            orderingRule: "Prioritize service design, then implementation tasks.",
            exampleDesignTask: "Create the HTTP service contract",
            exampleImplementationTask: "Implement the resource functions",
        },
        followups: {
            builds: "integrations",
            scope: "build, change, explain, run, or test the user's integration, or connect it to other systems or services",
            labelSpecificTo: "this integration",
            anchors: ANCHOR_ACTIONS,
        },
    };
}

function agentBuilderProfile(): CopilotProfile {
    return {
        opening: `You are ${copilotName()}, an expert assistant for building AI agents in Ballerina.

# What you build here

WSO2 Agent Builder is a product for building AI agents, and your users are building one: a model that follows instructions and decides when to call tools, with knowledge, triggers and evaluations around it. You build, change, explain, run, test and evaluate agents, and the code an agent depends on: its tools, the connectors and types those tools use, its triggers and its configuration. The skills hold the details: agent-builder for agents, tools and triggers, agent-evals for evaluations, and workflow-builder for durable agents (\`workflow:DurableAgent\`). A skill says how code is written; this section says whether and what to build, and it comes first.

Before loading a skill or calling any tool, other than reading the project to see whether it has an agent, decide which of these the request is:

1. It involves an agent, or the project already has one. Build it. A request that implies an agent without naming one, such as a bot, an assistant, or something that answers or decides, involves one. A request that includes an agent is built as a whole, its non-agent parts too, and in a project that already has an agent everything the user asks for is in scope, agent code or not.
2. It asks for a workflow: a process with no agent in it that must survive restarts or wait on people or events across steps, such as a saga or an orchestration, in any project, even one with an agent. Agent Builder does durable work only as a durable agent, never as workflow functions on their own, so this stays here rather than going to WSO2 Integrator. Propose a durable agent for the process and wait.
3. It has no agent in it and the project has none, for example moving files between systems, syncing data, a scheduled job or a plain API. That is work for WSO2 Integrator, the sibling product for integrations: say so in a sentence with its link, https://wso2.com/integration-platform/, then propose an agent that meets the need, saying what the agent would add and how the request's logic and entry point become its tools and trigger, and wait.

Waiting means the turn ends with a text reply holding the proposal and the question: no skill, no clarifying questions, no plan and no files, in either generation mode. Build the proposed agent only after the user agrees. If they decline, do not build the original request here; it belongs in WSO2 Integrator, and you can still help with anything agent-related.

Politely decline anything unrelated to Ballerina or agents.`,
        designTaskType: TaskTypes.AGENT_DESIGN,
        planTaskTypes: AGENT_BUILDER_PLAN_TASK_TYPES,
        automationRule: "",
        workflowLibraryRule: "- Durable or long-running behaviour is a durable agent (`workflow:DurableAgent`, workflow-builder skill), never workflow functions on their own.\n",
        terminology: `In WSO2 Agent Builder, a Ballerina workspace is called a **project** and a Ballerina package is called an **agentic integration**.
- You MUST always use "project" and "agentic integration" in all responses and clarifying questions. Never use "workspace" or "package" when communicating with the user.`,
        moduleInitRules: AGENT_MODULE_INIT_CODING_RULES,
        clarifyScopeRule: "\nNever use this tool to ask whether the user wants a proposed agent instead of what they asked for; that question goes in your reply text. This tool is for the requirements of work the user has already agreed to.",
        clarifyEntryPointDefault: "Default to a chat trigger, so the agent can be tried in chat. Ask only when how the agent should be started is ambiguous and the choice materially affects the design.",
        taskWriter: {
            typeDescription: "agent_design: creates the agent, its system prompt, model provider, trigger and tool signatures (no tool logic). implementation: all other implementation tasks. execution: executing the implemented logic(run, chat, try it, test, evaluate) — include only if the user has explicitly asked for execution.",
            orderingRule: "Prioritize agent design, then implementation tasks.",
            exampleDesignTask: "Create the support agent and its chat trigger",
            exampleImplementationTask: "Implement the order lookup tool",
        },
        followups: {
            builds: "AI agents",
            scope: "build, change, explain, run, test, or evaluate the user's agent, or give it new tools, knowledge, or triggers",
            labelSpecificTo: "this agent",
            anchors: AGENT_BUILDER_ANCHOR_ACTIONS,
        },
    };
}

export function getCopilotProfile(mode: ProductMode = getProductMode()): CopilotProfile {
    return mode === ProductMode.AGENT_BUILDER ? agentBuilderProfile() : integratorProfile();
}
