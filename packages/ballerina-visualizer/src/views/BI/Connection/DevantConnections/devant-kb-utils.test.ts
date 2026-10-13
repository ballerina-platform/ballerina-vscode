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

// L2 / C09: wiring a hosted knowledge base in as an agent tool. The connection is only usable
// if the service exposes a full set of OAuth2 credentials, because they become the
// `os:getEnv(...)` configurables the generated code reads. A service missing any of them has
// to be refused outright — half-written configurables would produce a node that looks
// configured in the form and fails at run time with no obvious cause.

// Every barrel below is either ESM-only or UI-heavy; this path touches none of them.
jest.mock("@wso2/ballerina-core", () => ({}));
jest.mock("@wso2/ballerina-core/lib/rpc-types/platform-ext/interfaces", () => ({}));
jest.mock("@wso2/ballerina-rpc-client", () => ({}));
jest.mock("@wso2/ballerina-rpc-client/lib/rpc-clients/platform-ext/platform-ext-client", () => ({}));
jest.mock("@wso2/wso2-platform-core", () => ({ getTypeForDisplayType: (): undefined => undefined }));

// Stubbed so a test states which schema is chosen rather than reconstructing the visibility
// rules that pick it; those belong to ./utils and are not what this function decides.
const chosen = { schema: undefined as unknown };
jest.mock("./utils", () => ({
    generateInitialConnectionName: (): string => "kb-connection",
    getInitialVisibility: (): string => "PROJECT",
    getPossibleVisibilities: (): string[] => ["PROJECT"],
    getPossibleSchemas: (): unknown[] => (chosen.schema ? [chosen.schema] : []),
}));

import { prepareDevantKnowledgeBase } from "./devant-kb-utils";

const ALL_ENTRIES = ["ServiceURL", "TokenURL", "ConsumerKey", "ConsumerSecret"];

const schemaWith = (names: string[]) => ({ name: "oauth2", entries: names.map((name) => ({ name })) });

function deps(schema: unknown, fallbackSchemas: unknown[] = []) {
    chosen.schema = schema;
    return {
        rpcClient: {} as never,
        platformRpcClient: { getConnections: jest.fn(async (): Promise<unknown[]> => []) } as never,
        platformExtState: { selectedComponent: {}, selectedContext: { project: {}, org: {} } } as never,
        item: { name: "orders-kb", connectionSchemas: fallbackSchemas } as never,
        node: {} as never,
        projectPath: "/w/orders",
        target: { line: 1, offset: 0 } as never,
        fileName: "config.bal",
    };
}

describe("prepareDevantKnowledgeBase", () => {
    let errors: jest.SpyInstance;

    beforeEach(() => {
        errors = jest.spyOn(console, "error").mockImplementation(() => undefined);
        jest.spyOn(console, "warn").mockImplementation(() => undefined);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it.each([
        ["none at all", []],
        ["only the service URL", ["ServiceURL"]],
        ["everything but the consumer secret", ["ServiceURL", "TokenURL", "ConsumerKey"]],
    ])("refuses a service exposing %s", async (_label, entries) => {
        expect(await prepareDevantKnowledgeBase(deps(schemaWith(entries)) as never)).toBeNull();
        expect(errors).toHaveBeenCalled();
    });

    // A service with no usable schema at all is the same refusal, not a crash.
    it("refuses a service with no connection schema", async () => {
        expect(await prepareDevantKnowledgeBase(deps(undefined) as never)).toBeNull();
    });

    // The check must run against the schema actually chosen for the selected visibility. If it
    // fell back to any schema that happens to look complete, the connection would be registered
    // with one schema while the configurables referenced another's entries.
    it("judges the chosen schema, not another complete one on the same item", async () => {
        const incompleteChoice = schemaWith(["ServiceURL"]);
        const completeElsewhere = schemaWith(ALL_ENTRIES);

        expect(await prepareDevantKnowledgeBase(deps(incompleteChoice, [completeElsewhere]) as never)).toBeNull();
    });

    // Extra entries beyond the four required ones are normal and must not be mistaken for a
    // mismatch — the check is "contains all of", not "is exactly".
    it("accepts a schema carrying more than the required entries", async () => {
        const generous = schemaWith([...ALL_ENTRIES, "Scopes", "Audience"]);

        // Past the guard this calls out to the platform and the LS, which this test does not
        // stand up; reaching that point is itself the assertion that the guard let it through.
        await expect(prepareDevantKnowledgeBase(deps(generous) as never)).rejects.toBeDefined();
        expect(errors).not.toHaveBeenCalledWith(
            expect.stringContaining("does not expose the expected OAuth2 entries"),
            expect.anything()
        );
    });
});
