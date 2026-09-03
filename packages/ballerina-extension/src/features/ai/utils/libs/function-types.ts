// Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com/) All Rights Reserved.

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

import { z } from 'zod';

export interface GetFunctionsRequest {
    name: string;
    description: string;
    clients: MinifiedClient[];
    functions?: MinifiedRemoteFunction[];
    services?: MinifiedService[];
}

export interface MinifiedClient {
    name: string;
    description?: string;
    functions: (MinifiedRemoteFunction | MinifiedResourceFunction)[];
}

export interface MinifiedService {
    listener: string;
    name?: string;
    /**
     * The spec §3 `doc` — what this service type is for, as the document states it.
     *
     * The strongest relevance signal a service entry has, and the reason it is worth sending: spec `$defs
     * .serviceType` gives a service type no description a symbol could carry, so before this the selection
     * model saw a bare type name (`Service`, `CalendarService`) and had to infer from it whether a library
     * answered the query. The 2026-08-19 revision made `doc` required on every service type — `concrete`
     * ones included — precisely so every construct is self-describing, which makes it available here.
     */
    doc?: string;
    /**
     * The spec §2 `doc` of the listener this service attaches to.
     *
     * Carried per service entry rather than once per library because the request has no library-level
     * listener slot, and because an entry that stated nothing about its trigger mechanism would read as
     * less relevant than its siblings — which is the opposite of what deduplication is for. A library's
     * service types usually share one listener, so the repetition is real; it is bounded by the cap in
     * `library-selection`, and the largest corpus case ({@code ballerinax/trigger.github}, ten service
     * types) costs under 2 KB of a request that already carries ten entries.
     *
     * It answers a different question from {@link doc}: what the service *receives* versus how it is
     * *triggered*. "Polls the watched directory", "webhook that dispatches each inbound update" and
     * "consumes from the subscribed topics" are all matches a query can be about, and none of them is
     * recoverable from a listener class named `Listener`.
     */
    listenerDoc?: string;
    methods?: MinifiedHandler[];
}

/**
 * One handler, as the *request* states it for the selection model.
 *
 * Carries `doc` because a handler is the finest grain a query can match on, and nothing else states what
 * one is for: a marker service type declares no method, so no symbol carries a doc comment for its
 * handlers, and the document's authored line (58 of 58 handler options in the corpus carry one) is the
 * only description of it that exists. They were being dropped on the way in while being rendered for the
 * generating model.
 *
 * It is no longer the *whole* semantic signal a service carries — the 2026-08-19 spec made `doc` required
 * on `serviceTypes[]` and `listeners[]` too, and {@link MinifiedService} now sends both — but it remains
 * the only per-handler one, which is what lets a query about one event match a library declaring twelve.
 *
 * First line only, and capped: the judgement needs what the handler is *for*, not the paragraph on how to
 * write it, and an uncapped field would let one verbose document dominate the request.
 */
export interface MinifiedHandler {
    name: string;
    doc?: string;
}

/**
 * One service the selection model kept, as it comes back in the response.
 *
 * Deliberately narrower than {@link MinifiedService}, which is the *request* shape. The request carries
 * `methods` because handler names are what make a service recognisably relevant to a query — that is input
 * the model reasons over. The response does not, because a selected service is re-inflated from the original
 * library whole: its methods, handler templates and constraints have to agree with each other, and
 * `renderConstraintLines` emits notes naming handlers by name, so a per-method selection would produce
 * constraint notes pointing at handlers no longer in the body.
 *
 * `listener` and `name` are therefore the entire response surface — exactly enough to identify which service
 * was kept, and nothing the renderer would have to reconcile.
 */
export interface SelectedService {
    listener: string;
    name?: string;
}

export interface MinifiedRemoteFunction extends MiniFunction {
    name: string;
}

export interface MiniFunction {
    parameters?: string[];
    returnType?: string;
    description?: string;
}

export interface MinifiedResourceFunction extends MiniFunction {
    accessor: string;
    paths: (PathParameter | string)[];
}

export interface GetFunctionsResponse {
    libraries: GetFunctionResponse[];
}

export interface GetFunctionResponse {
    name: string;
    clients?: MinifiedClient[];
    functions?: MinifiedRemoteFunction[];
    services?: SelectedService[];
}

export interface PathParameter {
    name: string;
    type: string;
}

const pathItemSchema = z.union([
    z.string(),
    z.object({
        name: z.string(),
        type: z.string(),
    }),
]);

const remoteFunctionSchema = z.object({
    name: z.string(),
    parameters: z.array(z.string()).optional(),
    returnType: z.string().optional(),
    description: z.string().optional(),
});

const resourceFunctionSchema = z.object({
    accessor: z.string(),
    paths: z.array(pathItemSchema),
    parameters: z.array(z.string()).optional(),
    returnType: z.string().optional(),
    description: z.string().optional(),
});

const clientSchema = z.object({
    name: z.string(),
    description: z.string().optional(),
    functions: z.array(z.union([resourceFunctionSchema, remoteFunctionSchema])),
});

// The response counterpart of `MinifiedService` — see `SelectedService` for why `methods` is absent here
// while the request carries it.
const selectedServiceSchema = z.object({
    listener: z.string(),
    name: z.string().optional(),
});

const libraryResponseSchema = z.object({
    name: z.string(),
    clients: z.array(clientSchema).optional(),
    functions: z.array(remoteFunctionSchema).optional(),
    services: z.array(selectedServiceSchema).optional(),
});

export const getFunctionsResponseSchema = z.object({
    libraries: z.array(libraryResponseSchema),
});



