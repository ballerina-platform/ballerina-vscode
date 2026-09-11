// Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com/) All Rights Reserved.

// WSO2 LLC. licenses this file to you under the Apache License,
// Version 2.0 (the "License"); you may not use this file except
// in compliance with the License.
// You may obtain a copy of the License at

// http://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied. See the License for the
// specific language governing permissions and limitations
// under the License.
/**
 * Subagent type registry: which system prompt and tool set each `subagent_type` gets. Adding a type is
 * one entry here plus its folder; the tool, runner, store and background plumbing are shared.
 */

import { ToolSet } from "ai";
import { createLibrarianTools } from "./librarian/tools";
import { librarianSystemPrompt } from "./librarian/system";
import { researcherSystemPrompt } from "./researcher/system";
import { createWebFetchTool, createWebSearchTool } from "../tools/web-tools";
import { SubagentRunContext, SubagentType } from "./types";

export interface SubagentDefinition {
    /** One line for the Subagent tool's description and the `subagent_type` enum text. */
    summary: string;
    system: (ctx: SubagentRunContext) => string;
    buildTools: (ctx: SubagentRunContext) => ToolSet;
    /** Appended to a resume prompt after "Continue from where you left off." */
    followUpHint: string;
}

const DEFINITIONS: Record<SubagentType, SubagentDefinition> = {
    Librarian: {
        summary: "Ballerina library expert. Finds the libraries and connectors for an integration need and returns the exact API surface (clients, functions, types, annotations, defaults, usage instructions) verbatim from the library docs. Also answers 'how does connector X work', 'does X do Y by default' and 'A or B' from the docs. Docs only, no web.",
        system: librarianSystemPrompt,
        buildTools: () => createLibrarianTools(),
        followUpHint: "Re-grep the doc files you already have rather than re-fetching them.",
    },
    LibraryResearcher: {
        summary: "The librarian with web research. Use when the Librarian reported a gap, when a library's docs are thin, or when you need examples or real-world behaviour (auth quirks, rate limits, per-operation service URLs). Reads the docs first, then GitHub module sources, Central and the upstream service's docs; cites sources.",
        system: researcherSystemPrompt,
        buildTools: (ctx) => ({
            ...createLibrarianTools(),
            // `true` skips the per-use approval banner: the subagent's web access is always on (owner decision).
            web_search: createWebSearchTool(ctx.eventHandler, true),
            web_fetch: createWebFetchTool(ctx.eventHandler, true),
        }),
        followUpHint: "Re-grep the doc files you already have, and only go back to the web for what they cannot answer.",
    },
};

export function getSubagentDefinition(type: SubagentType): SubagentDefinition {
    const definition = DEFINITIONS[type];
    if (!definition) {
        throw new Error(`Unknown subagent type: ${type}. Available types: ${Object.keys(DEFINITIONS).join(", ")}`);
    }
    return definition;
}

export function describeSubagentTypes(): string {
    return (Object.keys(DEFINITIONS) as SubagentType[])
        .map(type => `- ${type}: ${DEFINITIONS[type].summary}`)
        .join("\n");
}

