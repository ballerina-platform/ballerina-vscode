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

import { toSyntaxString } from "../features/ai/utils/libs/to-syntax-string";
import { Client, Library, Parameter } from "../features/ai/utils/libs/library-types";

// Class, client and resource methods used to render only their description line, so a `# + return -`
// statement such as `time:Zone.utcFromCivil`'s "an error if `civil.timeAbbrev` is missing" never reached
// the Librarian's docs files (alpha tracker #47). Module-level functions always kept theirs.

function param(name: string, description: string, typeName = "string"): Parameter {
    return { name, description, type: { name: typeName, links: [] } };
}

function libraryWithClientMethods(functions: Client["functions"]): Library {
    return {
        name: "demo",
        description: "",
        typeDefs: [],
        functions: [],
        clients: [{ name: "Zone", description: "A zone.", functions }],
    };
}

describe("toSyntaxString method documentation", () => {
    it("renders parameter and return docs for a remote method", () => {
        const out = toSyntaxString([libraryWithClientMethods([{
            type: "Remote Function",
            name: "publish",
            description: "Publishes a message.",
            parameters: [param("target", "Topic ARN, target ARN or phone number"), param("silent", "", "boolean")],
            return: { type: { name: "PublishMessageResponse|Error", links: [] }, description: "The response, or an error" },
        }])]);
        expect(out).toContain("    # Publishes a message.\n    # + target - Topic ARN, target ARN or phone number\n    # + return - The response, or an error\n    remote function publish(");
        // A parameter with no description gets no `+` line.
        expect(out).not.toContain("# + silent");
    });

    it("prefixes every physical line of a multiline parameter and return description", () => {
        const out = toSyntaxString([libraryWithClientMethods([{
            type: "Remote Function",
            name: "publish",
            description: "Publishes a message.",
            parameters: [param("target", "Topic ARN, target ARN\nor phone number")],
            return: { type: { name: "PublishMessageResponse|Error", links: [] }, description: "The response,\nor an error" },
        }])]);
        expect(out).toContain([
            "    # + target - Topic ARN, target ARN",
            "    # or phone number",
            "    # + return - The response,",
            "    # or an error",
        ].join("\n"));
    });

    it("renders the return doc for a plain class method", () => {
        const out = toSyntaxString([libraryWithClientMethods([{
            type: "Normal Function",
            name: "utcFromCivil",
            description: "Converts a civil record to UTC.",
            parameters: [param("civil", "The civil value", "Civil")],
            return: { type: { name: "Utc|Error", links: [] }, description: "The UTC value or an error if `civil.timeAbbrev` is missing" },
        }])]);
        expect(out).toContain("    # + civil - The civil value\n    # + return - The UTC value or an error if `civil.timeAbbrev` is missing\n    function utcFromCivil(Civil civil) returns Utc|Error;");
    });

    it("renders parameter docs for a resource method", () => {
        const out = toSyntaxString([libraryWithClientMethods([{
            type: "Resource Function",
            accessor: "get",
            paths: ["repos", { type: "string", name: "owner" }],
            description: "Lists repos.",
            parameters: [param("owner", "The owner login"), param("perPage", "Results per page (max 100)", "int")],
            return: { type: { name: "Repo[]|error", links: [] }, description: "" },
        }])]);
        expect(out).toContain("# + owner - The owner login");
        expect(out).toContain("# + perPage - Results per page (max 100)\n    resource function get repos/[string owner](int perPage) returns Repo[]|error;");
        expect(out).not.toContain("# + return");
    });

    it("emits no documentation block when nothing is documented", () => {
        const out = toSyntaxString([libraryWithClientMethods([{
            type: "Remote Function", name: "ping", description: "", parameters: [], return: undefined,
        }])]);
        expect(out).toContain("client class Zone {\n\n    remote function ping();");
    });
});
