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

import { tool } from "ai";
import { z } from "zod";
import { AvailableNode, Category, ExpressionProperty, Item } from "@wso2/ballerina-core";
import { StateMachine } from "../../../stateMachine";
import { AssistSite, describeType } from "./context";

const SEARCH_LIMIT = 12;
const SIGNATURE_LIMIT = 3;
// Modules the prompt names, so their imports are added even when the model skips search.
const COMMON_MODULES: [string, string][] = [
    ["time", "ballerina/time"], ["uuid", "ballerina/uuid"], ["crypto", "ballerina/crypto"], ["url", "ballerina/url"],
];
const MAX_SEARCHES = 2;

// What the lookups learn during a run: searches spent, and the module of every prefix a search has shown.
export interface LookupState {
    searches: number;
    modules: Map<string, string>;
    // Type descriptions the model has read, so a claim that a name does not exist can be checked.
    seen: string[];
}

export function newLookupState(): LookupState {
    return { searches: 0, modules: new Map(COMMON_MODULES), seen: [] };
}

// Library lookups the model can make before it commits to a value.
export const LOOKUP_TOOLS = ["search_functions", "type_info", "function_docs"];

export function lookupTools(site: AssistSite, run: LookupState) {
    return {
        search_functions: tool({
            description: "Search library and project functions by one or two keywords, e.g. \"utc string\"; longer queries match nothing. Returns names, modules and signatures.",
            inputSchema: z.object({ query: z.string() }),
            execute: async ({ query }) => {
                // Each search costs a model step and half a second; past the budget, the model must commit to a value.
                if (++run.searches > MAX_SEARCHES) {
                    return "Search budget used up. Submit your best expression now, or call cannot_do.";
                }
                return searchFunctions(site, query, run);
            },
        }),
        type_info: tool({
            description: "Show a record type's fields by name, e.g. time:Civil or http:Created, for types not listed in scope.",
            inputSchema: z.object({ name: z.string().describe("Type name, with its module prefix for library types") }),
            execute: async ({ name }) => {
                const described = await describeType(site, name, usedModules(name, run));
                run.seen.push(described);
                return described || `No type named ${name} found.`;
            },
        }),
        function_docs: tool({
            description: "Read a function's parameters and documentation, e.g. time:utcToString or string:substring.",
            inputSchema: z.object({ name: z.string().describe("Qualified name, module:function") }),
            execute: async ({ name }) => functionDocs(site, name, run),
        }),
    };
}

async function searchFunctions(site: AssistSite, query: string, run: LookupState): Promise<string> {
    const response = await StateMachine.langClient().search({
        filePath: site.filePath,
        position: { startLine: site.context.startLine, endLine: site.context.startLine },
        // The local index, not Central: a slow Central reply would use up the whole run.
        queryMap: { q: query, limit: SEARCH_LIMIT, offset: 0, includeAvailableFunctions: "true", functionSource: "index" },
        searchKind: "FUNCTION",
    }).catch((): undefined => undefined);
    const nodes = flattenNodes((response?.categories ?? []) as Category[]).slice(0, SEARCH_LIMIT);
    if (nodes.length === 0) {
        return "No functions found. Try another keyword.";
    }
    const lines: string[] = [];
    for (const [index, node] of nodes.entries()) {
        const prefix = rememberModule(node, run);
        const qualified = prefix ? `${prefix}:${node.codedata.symbol}` : node.codedata.symbol;
        // Signature help waits on the language server's debounce, so only the top hits get a signature.
        const signature = index < SIGNATURE_LIMIT ? (await signatureOf(site, qualified, run))?.label : undefined;
        const description = node.metadata.description?.split("\n")[0];
        const name = signature ? `${prefix ? `${prefix}:` : ""}${signature}` : qualified;
        lines.push(`- ${name}${description ? ` — ${description}` : ""}`);
    }
    return lines.join("\n");
}

// Returns the node's module prefix, recording its module so a later submit can import it.
function rememberModule(node: AvailableNode, run: LookupState): string | undefined {
    const { org, module } = node.codedata;
    const prefix = module && module !== "." ? module.split(".").pop() : undefined;
    if (prefix && org) {
        run.modules.set(prefix, `${org}/${module}`);
    }
    return prefix;
}

// Prefixes the expression uses that a search has resolved to a module.
export function usedModules(expression: string, run: LookupState): Record<string, string> {
    const used: Record<string, string> = {};
    for (const [, prefix] of expression.matchAll(/\b([a-z][\w.]*):[A-Za-z_]/g)) {
        const module = run.modules.get(prefix);
        if (module) {
            used[prefix] = module;
        }
    }
    return used;
}

// The modules a candidate needs; lang library prefixes (xml:, int:) are predeclared and never imported.
export function candidateImports(expression: string, run: LookupState, asked: Record<string, string>): Record<string, string> {
    return Object.fromEntries(Object.entries({ ...usedModules(expression, run), ...asked })
        .filter(([, module]) => !module.startsWith("ballerina/lang.")));
}

function flattenNodes(items: Item[]): AvailableNode[] {
    return items.flatMap((item) => "codedata" in item ? [item] : flattenNodes((item as Category).items ?? []));
}

async function signatureOf(site: AssistSite, name: string, run: LookupState) {
    const expression = `${name.replace(/\(.*$/, "")}(`;
    const property: ExpressionProperty = {
        ...site.context.property,
        imports: { ...(site.context.property.imports ?? {}), ...usedModules(expression, run) },
        types: [{ fieldType: "EXPRESSION", ballerinaType: "any", selected: true }],
    };
    const help = await StateMachine.langClient().getSignatureHelpNow({
        filePath: site.filePath,
        context: { ...site.context, expression, offset: expression.length, property },
        signatureHelpContext: { isRetrigger: false, triggerKind: 1 },
    }).catch((): undefined => undefined);
    return help?.signatures?.[0];
}

async function functionDocs(site: AssistSite, name: string, run: LookupState): Promise<string> {
    const signature = await signatureOf(site, name, run);
    if (!signature) {
        return `No documentation found for ${name}. Search for it first, so its module is known.`;
    }
    const docs = signature.documentation?.value?.split("```")[0].trim() ?? "";
    return `${signature.label}\n${docs}`.trim();
}
