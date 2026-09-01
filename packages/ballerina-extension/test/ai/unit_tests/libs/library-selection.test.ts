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

import * as assert from "assert";
import {
    MAX_HANDLER_DOC_CHARS,
    MAX_SERVICE_DOC_CHARS,
    MIN_SERVICES_TO_FILTER,
    hasNothingToSelect,
    selectServices,
    toServiceRequestEntries,
    withRestoredServiceLibraries,
} from "../../../../src/features/ai/utils/libs/library-selection";
import { Service } from "../../../../src/features/ai/utils/libs/library-types";
import { GetFunctionResponse, GetFunctionsRequest, MinifiedService } from "../../../../src/features/ai/utils/libs/function-types";

function service(listener: string, name?: string): Service {
    return {
        type: "fixed",
        listener: { name: listener, parameters: [] },
        ...(name ? { name } : {}),
    } as Service;
}

/** A library with `count` distinct services, named `S0`…`S{count-1}` on one listener. */
function services(count: number, listener = "trigger:Listener"): Service[] {
    return Array.from({ length: count }, (_, i) => service(listener, `S${i}`));
}

function response(selected?: { listener: string; name?: string }[]): GetFunctionResponse {
    return { name: "ballerinax/trigger.example", ...(selected ? { services: selected } : {}) };
}

function request(partial: Partial<GetFunctionsRequest>): GetFunctionsRequest {
    return { name: "lib", description: "", clients: [], ...partial } as GetFunctionsRequest;
}

suite("library selection — selectServices", () => {
    test("keeps only the services the model named", () => {
        const all = services(5);
        const kept = selectServices(all, response([
            { listener: "trigger:Listener", name: "S1" },
            { listener: "trigger:Listener", name: "S3" },
        ]));
        assert.deepStrictEqual(kept?.map((s) => s.name), ["S1", "S3"]);
    });

    test("a library declaring no services yields null, matching the absent field", () => {
        assert.strictEqual(selectServices(undefined, response([])), null);
        assert.strictEqual(selectServices([], response([])), null);
    });

    // The regression this whole change exists to prevent: before it, the response was ignored and every
    // service was attached. After it, an unanswered response must still attach every service — a filter
    // that silently empties the section is worse than the over-inclusion it replaced.
    test("an absent services field falls back to the whole set", () => {
        const all = services(5);
        assert.strictEqual(selectServices(all, response()), all);
    });

    test("an empty services array is treated as unanswered, not as 'none relevant'", () => {
        const all = services(5);
        assert.strictEqual(selectServices(all, response([])), all);
    });

    test("a selection that resolves to nothing falls back rather than emptying the section", () => {
        const all = services(5);
        const kept = selectServices(all, response([{ listener: "other:Listener", name: "Nope" }]));
        assert.strictEqual(kept, all);
    });

    test("below the threshold, nothing is filtered even when the model answers", () => {
        const all = services(MIN_SERVICES_TO_FILTER - 1);
        const kept = selectServices(all, response([{ listener: "trigger:Listener", name: "S0" }]));
        assert.strictEqual(kept, all, "a small service set is never narrowed");
    });

    test("at the threshold, filtering applies", () => {
        const all = services(MIN_SERVICES_TO_FILTER);
        const kept = selectServices(all, response([{ listener: "trigger:Listener", name: "S0" }]));
        assert.deepStrictEqual(kept?.map((s) => s.name), ["S0"]);
    });

    test("identity is listener + name, so the same name on another listener does not match", () => {
        const all = [
            service("kafka:Listener", "Service"),
            service("rabbitmq:Listener", "Service"),
            service("mqtt:Listener", "Service"),
        ];
        const kept = selectServices(all, response([{ listener: "rabbitmq:Listener", name: "Service" }]));
        assert.deepStrictEqual(kept?.map((s) => s.listener.name), ["rabbitmq:Listener"]);
    });

    test("unnamed services are matched by listener alone", () => {
        const all = [service("a:Listener"), service("b:Listener"), service("c:Listener")];
        const kept = selectServices(all, response([{ listener: "b:Listener" }]));
        assert.deepStrictEqual(kept?.map((s) => s.listener.name), ["b:Listener"]);
    });

    // Two services the model cannot tell apart are kept or dropped together. Over-inclusion is the safe
    // direction: the alternative is dropping one of an indistinguishable pair at random.
    test("services sharing listener and name survive together", () => {
        const all = [service("a:Listener", "S"), service("a:Listener", "S"), service("b:Listener", "T")];
        const kept = selectServices(all, response([{ listener: "a:Listener", name: "S" }]));
        assert.strictEqual(kept?.length, 2);
    });

    test("the original array is never mutated", () => {
        const all = services(5);
        const before = all.slice();
        selectServices(all, response([{ listener: "trigger:Listener", name: "S1" }]));
        assert.deepStrictEqual(all, before);
    });
});

suite("library selection — hasNothingToSelect", () => {
    test("a services-only library has nothing to select", () => {
        assert.strictEqual(hasNothingToSelect(request({ clients: [], functions: [] })), true);
    });

    test("a library with no clients and no functions field at all has nothing to select", () => {
        assert.strictEqual(hasNothingToSelect(request({ clients: [] })), true);
    });

    test("a client with zero functions still offers nothing to choose between", () => {
        assert.strictEqual(
            hasNothingToSelect(request({ clients: [{ name: "Client", functions: [] }] })),
            true
        );
    });

    test("one client function is enough to make selection meaningful", () => {
        assert.strictEqual(
            hasNothingToSelect(request({
                clients: [{ name: "Client", functions: [{ name: "get", parameters: [], returnType: "error?" }] }],
            })),
            false
        );
    });

    test("one module-level function is enough on its own", () => {
        assert.strictEqual(
            hasNothingToSelect(request({
                clients: [],
                functions: [{ name: "parse", parameters: [], returnType: "string" }],
            })),
            false
        );
    });

    test("a services-only library at the filter threshold IS a decision, so it is asked about", () => {
        // ballerinax/trigger.github's shape: no clients, no functions, many self-describing service types.
        assert.strictEqual(
            hasNothingToSelect(request({
                clients: [],
                services: requestEntries(MIN_SERVICES_TO_FILTER),
            })),
            false
        );
    });

    test("below the threshold there is still nothing to ask, because the answer would be discarded", () => {
        // `selectServices` keeps every service of such a library whatever the model says, so the request
        // would buy nothing. Gated on the same constant for exactly that reason.
        assert.strictEqual(
            hasNothingToSelect(request({
                clients: [],
                services: requestEntries(MIN_SERVICES_TO_FILTER - 1),
            })),
            true
        );
    });
});

/** `count` minified service entries on one listener, as a request states them. */
function requestEntries(count: number): MinifiedService[] {
    return Array.from({ length: count }, (_, i) => ({ listener: "trigger:Listener", name: `S${i}` }));
}

suite("library selection — withRestoredServiceLibraries", () => {
    const withServices = request({ name: "ballerinax/trigger.example", services: requestEntries(4) });
    const clientsOnly = request({
        name: "ballerinax/clientlib",
        clients: [{ name: "Client", functions: [{ name: "get", parameters: [], returnType: "error?" }] }],
    });

    test("an omitted service-declaring library is restored, so its metadata cannot vanish", () => {
        const restored = withRestoredServiceLibraries([withServices], []);
        assert.deepStrictEqual(restored, [{ name: "ballerinax/trigger.example" }]);
    });

    test("a restored entry names no clients and no functions, only the library", () => {
        const [entry] = withRestoredServiceLibraries([withServices], []);
        assert.strictEqual(entry.clients, undefined);
        assert.strictEqual(entry.functions, undefined);
        assert.strictEqual(entry.services, undefined);
    });

    test("a restored entry keeps every service, because it names no selection", () => {
        const all = services(4);
        const [entry] = withRestoredServiceLibraries([withServices], []);
        assert.deepStrictEqual(selectServices(all, entry)?.length, 4);
    });

    test("an omitted client-only library is left omitted — that judgement was the model's to make", () => {
        assert.deepStrictEqual(withRestoredServiceLibraries([clientsOnly], []), []);
    });

    test("a library the model answered is never duplicated", () => {
        const answered: GetFunctionResponse[] = [
            { name: "ballerinax/trigger.example", services: [{ listener: "trigger:Listener", name: "S1" }] },
        ];
        assert.deepStrictEqual(withRestoredServiceLibraries([withServices], answered), answered);
    });

    test("restoration is per library: one answered, one omitted", () => {
        const other = request({ name: "ballerinax/trigger.other", services: requestEntries(3) });
        const answered: GetFunctionResponse[] = [{ name: "ballerinax/trigger.example" }];
        assert.deepStrictEqual(
            withRestoredServiceLibraries([withServices, other], answered).map((r) => r.name),
            ["ballerinax/trigger.example", "ballerinax/trigger.other"]
        );
    });

    test("the answered responses keep their order and identity", () => {
        const answered: GetFunctionResponse[] = [{ name: "a" }, { name: "b" }];
        const out = withRestoredServiceLibraries([], answered);
        assert.deepStrictEqual(out, answered);
        assert.notStrictEqual(out, answered, "returns a new array rather than mutating the caller's");
    });
});

/** A fixed service whose handlers are given as `[name, doc]` pairs. */
function fixedService(
    listener: string,
    name: string,
    methods: [string, string?][]
): Service {
    return {
        type: "fixed",
        listener: { name: listener, parameters: [] },
        name,
        methods: methods.map(([methodName, description]) => ({
            name: methodName,
            type: "remote",
            parameters: [],
            return: { type: { name: "error?" } },
            ...(description !== undefined ? { description } : {}),
        })),
    } as Service;
}

/**
 * The same service, with the spec §3 and §2 `doc` fields the 2026-08-19 revision made required.
 *
 * Applied on top of an existing fixture rather than woven into `fixedService`, so that every assertion
 * written before the revision keeps testing a document that states neither — which is exactly the
 * back-compatibility the omission rule promises.
 */
function withDocs(svc: Service, doc?: string, listenerDoc?: string): Service {
    return {
        ...svc,
        ...(doc !== undefined ? { description: doc } : {}),
        listener: { ...svc.listener, ...(listenerDoc !== undefined ? { description: listenerDoc } : {}) },
    } as Service;
}

suite("library selection — toServiceRequestEntries", () => {
    test("sends the identity pair the response echoes back, verbatim", () => {
        const entries = toServiceRequestEntries([
            fixedService("kafka:Listener", "Service", [["onConsumerRecord"]]),
        ]);
        assert.strictEqual(entries?.length, 1);
        assert.strictEqual(entries?.[0].listener, "kafka:Listener");
        assert.strictEqual(entries?.[0].name, "Service");
    });

    test("carries each handler's first doc line — the only prose a service type has", () => {
        const entries = toServiceRequestEntries([
            fixedService("kafka:Listener", "Service", [
                ["onConsumerRecord", "Invoked with each batch of records polled from the subscribed topics.\nThe listener polls on its configured interval."],
                ["onError", "Invoked when polling fails."],
            ]),
        ]);
        assert.deepStrictEqual(entries?.[0].methods, [
            { name: "onConsumerRecord", doc: "Invoked with each batch of records polled from the subscribed topics." },
            { name: "onError", doc: "Invoked when polling fails." },
        ]);
    });

    test("caps a doc so one verbose document cannot dominate the request", () => {
        const long = "x".repeat(MAX_HANDLER_DOC_CHARS + 50);
        const entries = toServiceRequestEntries([
            fixedService("ftp:Listener", "Service", [["onFileChange", long]]),
        ]);
        assert.strictEqual(entries?.[0].methods?.[0].doc?.length, MAX_HANDLER_DOC_CHARS);
    });

    test("omits `doc` entirely for an undocumented handler rather than sending an empty one", () => {
        // trigger.github's shape: handlers introspected from a concrete type that carries no doc comments.
        const entries = toServiceRequestEntries([
            fixedService("github:Listener", "IssuesService", [["onOpened"], ["onClosed", "   "]]),
        ]);
        assert.deepStrictEqual(entries?.[0].methods, [{ name: "onOpened" }, { name: "onClosed" }]);
    });

    test("a generic service states no methods, so only its identity is sent", () => {
        const generic = {
            type: "generic",
            listener: { name: "http:Listener", parameters: [] },
            name: "Service",
            instructions: "…",
        } as Service;
        assert.deepStrictEqual(toServiceRequestEntries([generic]), [
            { listener: "http:Listener", name: "Service" },
        ]);
    });

    test("omits the `methods` key when a fixed service declares none", () => {
        // mcp's wildcard (addMode: many) service types reach the request with no methods at all.
        const entries = toServiceRequestEntries([
            fixedService("mcp:StreamableHttpListener", "Service", []),
        ]);
        assert.deepStrictEqual(entries, [
            { listener: "mcp:StreamableHttpListener", name: "Service" },
        ]);
    });

    test("a nameless service omits `name`, matching the key selectServices builds", () => {
        const entries = toServiceRequestEntries([
            { type: "fixed", listener: { name: "x:Listener", parameters: [] } } as Service,
        ]);
        assert.deepStrictEqual(entries, [{ listener: "x:Listener" }]);
    });

    test("a library declaring no services sends the field absent, not empty", () => {
        assert.strictEqual(toServiceRequestEntries(undefined), undefined);
        assert.strictEqual(toServiceRequestEntries([]), undefined);
    });

    // ---- the spec's 2026-08-19 §2/§3 `doc`, as evidence for the selection model ----

    test("sends the service type's own doc, which is what a query actually matches on", () => {
        // Before this the model saw a bare type name. Thirty-two libraries name their service type
        // `Service`, so the name told it nothing and the handler list carried the whole judgement.
        const entries = toServiceRequestEntries([
            withDocs(fixedService("kafka:Listener", "Service", [["onConsumerRecord"]]),
                "Consumes records from the subscribed topics and dispatches each poll's batch.",
                undefined),
        ]);
        assert.strictEqual(entries?.[0].doc,
            "Consumes records from the subscribed topics and dispatches each poll's batch.");
        assert.strictEqual(entries?.[0].listenerDoc, undefined);
    });

    test("sends the listener's doc too, because how a service is triggered is a separate question", () => {
        const entries = toServiceRequestEntries([
            withDocs(fixedService("file:Listener", "Service", []),
                "Receives file system change events for the watched directory.",
                "Polls the watched directory on its configured interval."),
        ]);
        assert.strictEqual(entries?.[0].doc,
            "Receives file system change events for the watched directory.");
        assert.strictEqual(entries?.[0].listenerDoc,
            "Polls the watched directory on its configured interval.");
    });

    test("takes the first line only, as it does for a handler", () => {
        const entries = toServiceRequestEntries([
            withDocs(fixedService("x:Listener", "Service", []),
                "What it is for.\nHow to write it, which the judgement does not need.",
                "What it listens to.\nEverything else."),
        ]);
        assert.strictEqual(entries?.[0].doc, "What it is for.");
        assert.strictEqual(entries?.[0].listenerDoc, "What it listens to.");
    });

    test("caps both, so one verbose document cannot dominate the request", () => {
        const long = "x".repeat(MAX_SERVICE_DOC_CHARS + 50);
        const entries = toServiceRequestEntries([
            withDocs(fixedService("x:Listener", "Service", []), long, long),
        ]);
        assert.strictEqual(entries?.[0].doc?.length, MAX_SERVICE_DOC_CHARS);
        assert.strictEqual(entries?.[0].listenerDoc?.length, MAX_SERVICE_DOC_CHARS);
    });

    test("the service cap is looser than the handler cap, because a service states one doc", () => {
        // A handler doc is stated once per handler and `websocket` declares twelve; a service type's is
        // stated once. The corpus's longest are 183 and 165 characters, so nothing in it is truncated.
        assert.ok(MAX_SERVICE_DOC_CHARS > MAX_HANDLER_DOC_CHARS);
    });

    test("omits both keys when the document states neither, so a pre-revision document is unchanged", () => {
        const entries = toServiceRequestEntries([
            fixedService("kafka:Listener", "Service", [["onConsumerRecord"]]),
        ]);
        assert.deepStrictEqual(entries, [{
            listener: "kafka:Listener", name: "Service", methods: [{ name: "onConsumerRecord" }],
        }]);
    });

    test("a blank doc is treated as absent rather than sent empty", () => {
        const entries = toServiceRequestEntries([
            withDocs(fixedService("x:Listener", "Service", []), "   ", "\n"),
        ]);
        assert.deepStrictEqual(entries, [{ listener: "x:Listener", name: "Service" }]);
    });

    test("a generic service carries its docs too, since the fields are the service's own", () => {
        const generic = {
            type: "generic",
            listener: { name: "http:Listener", parameters: [], description: "Serves HTTP requests." },
            name: "Service",
            description: "An HTTP service.",
            instructions: "…",
        } as Service;
        assert.deepStrictEqual(toServiceRequestEntries([generic]), [{
            listener: "http:Listener", name: "Service",
            doc: "An HTTP service.", listenerDoc: "Serves HTTP requests.",
        }]);
    });

    test("the entries a request states are re-resolvable by selectServices", () => {
        const all = [
            fixedService("trigger:Listener", "S0", [["onA", "First."]]),
            fixedService("trigger:Listener", "S1", [["onB", "Second."]]),
            fixedService("trigger:Listener", "S2", [["onC", "Third."]]),
        ];
        const entries = toServiceRequestEntries(all)!;
        // The model echoes one entry back exactly as it was sent.
        const kept = selectServices(all, response([
            { listener: entries[1].listener, name: entries[1].name },
        ]));
        assert.deepStrictEqual(kept?.map((s) => s.name), ["S1"]);
    });
});
