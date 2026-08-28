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
 * The selection decisions that decide what a library contributes to a prompt — which services survive, and
 * which libraries the selection model is asked about at all.
 *
 * Kept out of `function-registry` for one reason: that module reaches the language server through
 * `activator`, so importing it starts VS Code. Everything here is a pure function of its arguments, which is
 * what lets `library-selection.test.ts` pin behaviour that is otherwise only observable as a difference in
 * the rendered catalog.
 */

import {
    GetFunctionResponse,
    GetFunctionsRequest,
    MinifiedClient,
    MinifiedHandler,
    MinifiedRemoteFunction,
    MinifiedResourceFunction,
    MinifiedService,
} from "./function-types";
import { Client, FixedService, Library, RemoteFunction, ResourceFunction, Service } from "./library-types";

/** The `type` a client's constructor carries; it is re-attached by `selectClients`, never selected. */
const TYPE_CONSTRUCTOR = "Constructor";

/**
 * A library with fewer services than this never has them filtered.
 *
 * The saving is what scales with the count, the risk does not: dropping one of two services halves nothing
 * worth having and can still cost the reader the service they needed. Filtering earns its risk only where a
 * library declares many — `ballerinax/trigger.*` packages are the shape this exists for.
 */
export const MIN_SERVICES_TO_FILTER = 3;

export function getClientFunctionCount(clients: MinifiedClient[]): number {
    return clients.reduce((count, client) => count + client.functions.length, 0);
}

/**
 * Whether a request entry gives the selection model no choice to make.
 *
 * Three things must all be absent, and the third is the one that reads oddly. A library with no client
 * functions and no module-level functions has nothing *functional* to select — every trigger package is
 * that shape — but it may still declare many service types, and choosing among those is a decision.
 *
 * The service half is therefore gated on the **same** {@link MIN_SERVICES_TO_FILTER} threshold
 * {@link selectServices} applies to the answer. That is not symmetry for its own sake: below the threshold
 * the response side keeps every service no matter what the model says, so asking would spend a request on a
 * result that is discarded by construction. Above it the question is real, and the entry now carries enough
 * to answer it — the spec's §3 and §2 `doc` fields make every service type and listener self-describing,
 * where before a services-only entry offered nothing but a type name.
 *
 * Passing straight through is not free of consequence: a library the model never sees cannot be dropped by
 * it, which is the protection {@link withRestoredServiceLibraries} extends to the libraries that DO get
 * asked about.
 */
export function hasNothingToSelect(lib: GetFunctionsRequest): boolean {
    return getClientFunctionCount(lib.clients) === 0
        && (lib.functions?.length ?? 0) === 0
        && (lib.services?.length ?? 0) < MIN_SERVICES_TO_FILTER;
}

/**
 * The responses, with an entry restored for every requested library that declares services and that the
 * model did not name.
 *
 * `toMaximizedLibrariesFromLibJson` iterates the *response*, so a library the model omits is not filtered
 * down — it is absent: no services, no annotations, no types, no README, and nothing distinguishing it from
 * a library that was never fetched. For a library whose clients were the point that is a legitimate
 * selection outcome, and it is left alone: the model was shown those clients and asked to judge them.
 *
 * A library declaring **service types** is the case this exists for, and the asymmetry is the argument. The
 * request states a service type's `doc`, its listener's, and its handlers' — but never its annotation
 * obligations, its constraints, its cardinality, its identifier slot, its platform dependencies or its
 * README. Omitting the library discards all of that on the strength of a judgement made without seeing any
 * of it. Restoring the entry hands the decision back to {@link selectServices}, whose no-selection case
 * keeps the whole set.
 *
 * A restored entry names no clients and no functions, which is exactly right: it is not a claim that the
 * model erred about the clients it *was* shown, only that the service metadata it was not shown should not
 * vanish with them.
 */
export function withRestoredServiceLibraries(
    requested: GetFunctionsRequest[],
    responses: GetFunctionResponse[]
): GetFunctionResponse[] {
    const answered = new Set(responses.map((response) => response.name));
    const restored = requested
        .filter((lib) => (lib.services?.length ?? 0) > 0 && !answered.has(lib.name))
        .map((lib) => ({ name: lib.name }));
    if (restored.length > 0) {
        console.warn(
            `[withRestoredServiceLibraries] the selection model named none of ${restored.length} requested `
            + `service-declaring librar${restored.length === 1 ? "y" : "ies"} `
            + `(${restored.map((lib) => lib.name).join(", ")}). Restoring them with their services intact.`
        );
    }
    return [...responses, ...restored];
}

/**
 * The longest handler `doc` the request carries, in characters.
 *
 * A bound rather than a budget: the selection model needs enough of the sentence to tell one handler from
 * another, and `websocket` — 11 handlers, the corpus maximum — costs about 300 tokens at this cap. Without
 * one, a single verbose document would decide how much of the request every other library gets.
 */
export const MAX_HANDLER_DOC_CHARS = 120;

/**
 * The longest service-type and listener `doc` the request carries, in characters.
 *
 * Higher than the handler bound, and for the reason that bound is low: a service type states its `doc`
 * once, whereas a handler states one per handler and `websocket` declares twelve. The corpus's longest are
 * `grpc`'s service type at 183 characters and `mcp`'s listener at 165, so at 200 nothing in it is
 * truncated — the cap exists to stop one future verbose document deciding how much of the request every
 * other library gets, not to trim the documents that exist.
 */
export const MAX_SERVICE_DOC_CHARS = 200;

/**
 * One documentation string as the request states it: its first line, capped.
 *
 * The first line only. A `doc` opens with what the construct is for and continues into how to write it —
 * `kafka`'s `onConsumerRecord` runs to 157 characters, `grpc`'s to 230 — and only the opening answers the
 * question this request exists to ask.
 *
 * @param description the document's authored prose; may be absent
 * @param limit       the cap for this construct's tier
 * @returns the trimmed line, or `undefined` when there is nothing to state
 */
function toRequestDoc(description: string | undefined, limit: number): string | undefined {
    const firstLine = description?.split("\n")[0].trim();
    return firstLine ? firstLine.slice(0, limit) : undefined;
}

/**
 * One handler as the request states it: its name, and the first line of its documentation.
 */
function toRequestHandler(name: string, description?: string): MinifiedHandler {
    const doc = toRequestDoc(description, MAX_HANDLER_DOC_CHARS);
    return doc ? { name, doc } : { name };
}

/**
 * The services of one library, as the selection request states them.
 *
 * Five fields per service, and the reason each is there:
 *  - `listener` and `name` are the *identity* the response echoes back — {@link selectServices} re-resolves
 *    a selection by exactly this pair, so they are sent verbatim and never prettified;
 *  - `doc` and `listenerDoc` are the *statement of purpose*, and the strongest evidence an entry carries:
 *    the spec §3/§2 revision of 2026-08-19 made both required on every service type and listener precisely
 *    so each construct says what it is for, and until they were sent a service reached the selection model
 *    identified by a type name alone — `Service`, over and over, across thirty-two libraries;
 *  - `methods` is the *finest-grained* evidence, and nothing more: the response has no counterpart for it
 *    (see `SelectedService`), so a handler cannot be selected individually. It is sent because a query is
 *    often about one event rather than about the library, and only handler names and their `doc` lines can
 *    match at that grain.
 *
 * A `generic` service states no methods: its handlers live in curated prose rather than in a method list,
 * and there is nothing to enumerate. Such an entry reaches the model as a listener and a name, which is why
 * {@link selectServices} refuses to filter a library declaring fewer than {@link MIN_SERVICES_TO_FILTER}
 * services — for those, a name is not enough to decide on and the whole set is kept. The docs improve that
 * entry too, but they do not change the rule: a generic entry still states no per-handler evidence.
 *
 * Every field is omitted when the document states nothing, per the schema's own omission rule, so a
 * pre-revision document produces exactly the request it produced before.
 *
 * Lives here rather than in `function-registry` for the reason this module exists: it is a pure function of
 * its arguments, and it decides what the selection model is allowed to reason over — which is a selection
 * decision, not a transport detail.
 */
export function toServiceRequestEntries(services?: Service[]): MinifiedService[] | undefined {
    if (!services || services.length === 0) {
        return undefined;
    }
    return services.map((svc) => {
        const result: MinifiedService = {
            listener: svc.listener.name,
        };
        if (svc.name) {
            result.name = svc.name;
        }
        // The spec §3 `doc`: what this service type is for. Applies to every service kind, generic
        // included — a curated overlay entry states none today, but the field is the service's own and
        // nothing about the entry's kind decides whether it is worth sending.
        const doc = toRequestDoc(svc.description, MAX_SERVICE_DOC_CHARS);
        if (doc) {
            result.doc = doc;
        }
        // The spec §2 `doc` of the listener this service attaches to — how the service is triggered, which
        // is a different question from what it receives and just as often what a query is about.
        const listenerDoc = toRequestDoc(svc.listener?.description, MAX_SERVICE_DOC_CHARS);
        if (listenerDoc) {
            result.listenerDoc = listenerDoc;
        }
        if (svc.type === "fixed") {
            const handlers = ((svc as FixedService).methods ?? [])
                .filter((method) => method && method.name)
                .map((method) => toRequestHandler(method.name, method.description));
            if (handlers.length > 0) {
                result.methods = handlers;
            }
        }
        return result;
    });
}

/**
 * Identity of one service, as both sides of the selection can state it.
 *
 * `listener` + `name` and nothing else: those are the two fields the request sends and the response echoes.
 * Two services sharing both are indistinguishable to the model, so they are kept or dropped together —
 * over-inclusion, which is the safe direction here.
 */
function serviceKey(listener: string, name?: string): string {
    return `${listener}\u0000${name ?? ""}`;
}

/**
 * The services the selection model kept, re-resolved against the library's own definitions.
 *
 * This is the half of the response that used to be requested and then discarded: the prompt asked for
 * matching services, the model spent output tokens listing them, and `toMaximizedLibrariesFromLibJson`
 * attached the library's whole set regardless. A ten-service trigger package answered a question about one
 * event with all ten, plus — through the type closure that walks them — every type all ten name.
 *
 * **Three cases fall back to the whole set, and each is a deliberate refusal to trust a filter over a
 * catalog:**
 *  - the library declares fewer than {@link MIN_SERVICES_TO_FILTER}, so there is nothing worth saving;
 *  - the response names no services at all, which is the shape every response had before this field was
 *    consumed — degrading to the previous behaviour rather than emptying the section;
 *  - the response names services but none of them resolve, which means the model answered in a shape this
 *    code cannot read. A filter that matched nothing is indistinguishable from a filter that meant nothing,
 *    and silently rendering zero services is the worse of the two readings.
 *
 * Returns `null` only for a library that declares no services, matching the field's absent form.
 */
export function selectServices(
    originalServices: Service[] | undefined,
    funcResponse: GetFunctionResponse
): Service[] | null {
    if (!originalServices || originalServices.length === 0) {
        return null;
    }
    const selected = funcResponse.services ?? [];
    if (selected.length === 0 || originalServices.length < MIN_SERVICES_TO_FILTER) {
        return originalServices;
    }

    const keep = new Set(selected.map((svc) => serviceKey(svc.listener, svc.name)));
    const filtered = originalServices.filter((svc) => keep.has(serviceKey(svc.listener?.name, svc.name)));
    if (filtered.length === 0) {
        console.warn(
            `[selectServices] ${funcResponse.name}: none of the ${selected.length} selected services matched `
            + `the library's ${originalServices.length}. Keeping all of them.`
        );
        return originalServices;
    }
    return filtered;
}

/**
 * One library as the selection request states it — the whole of what the selection model is shown.
 *
 * Lives here rather than in `function-registry` for the reason this module exists: it is a pure function of
 * its arguments, and what the model is allowed to reason over is a selection decision. Keeping it importable
 * without starting VS Code is also what lets the request be captured from a real
 * `getFilteredLibraries` payload rather than reproduced from a hand-written one.
 *
 * @param lib                         the library as the language server returned it
 * @param includeFunctionDescriptions whether a module-level function carries its `description`, which is
 *                                    the healthcare generation's one deviation. A boolean rather than the
 *                                    `GenerationType` enum on purpose: that enum lives in `libraries.ts`,
 *                                    which reaches the language server through `activator`, and importing it
 *                                    here would give this module the VS Code dependency it exists without
 */
export function toSelectionRequest(lib: Library, includeFunctionDescriptions: boolean): GetFunctionsRequest {
    return {
        name: lib.name,
        description: lib.description,
        clients: toRequestClients(lib.clients),
        functions: toRequestFunctions(lib.functions, includeFunctionDescriptions),
        services: toServiceRequestEntries(lib.services),
    };
}

/** Each client as the request states it: its name, its doc, and its functions minified. */
function toRequestClients(clients: Client[]): MinifiedClient[] {
    return clients.map((cli) => ({
        name: cli.name,
        description: cli.description,
        functions: toRequestClientFunctions(cli.functions),
    }));
}

/**
 * A client's functions, reduced to what a selection decision needs: the identity, the parameter *names*,
 * and the return type's name. The constructor is omitted — it is not a choice the model makes, and
 * `selectClients` re-attaches it to any client whose functions survived.
 */
function toRequestClientFunctions(
    functions: (RemoteFunction | ResourceFunction)[]
): (MinifiedRemoteFunction | MinifiedResourceFunction)[] {
    const output: (MinifiedRemoteFunction | MinifiedResourceFunction)[] = [];

    for (const item of functions) {
        if ("accessor" in item) {
            output.push({
                accessor: item.accessor,
                paths: item.paths,
                parameters: item.parameters.map((param) => param.name),
                returnType: item.return.type.name,
            });
        } else if (item.type !== TYPE_CONSTRUCTOR) {
            output.push({
                name: item.name,
                parameters: item.parameters.map((param) => param.name),
                returnType: item.return.type.name,
            });
        }
    }

    return output;
}

/** The module-level functions as the request states them; absent when the library declares none. */
function toRequestFunctions(
    functions: RemoteFunction[] | undefined,
    includeDescriptions: boolean
): MinifiedRemoteFunction[] | undefined {
    if (!functions) {
        return undefined;
    }
    return functions.map((item) => ({
        name: item.name,
        parameters: item.parameters.map((param) => param.name),
        returnType: item.return.type.name,
        ...(includeDescriptions && { description: item?.description }),
    }));
}
