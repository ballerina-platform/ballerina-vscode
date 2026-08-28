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
import * as path from "path";
import * as fs from "fs";
import { Library } from "../../../../src/features/ai/utils/libs/library-types";
import { toSyntaxString, deriveModulePrefix } from "../../../../src/features/ai/utils/libs/to-syntax-string";

const RESOURCES_DIR = path.join(__dirname, "resources");

function loadLibraries(filename: string): Library[] {
    const filePath = path.join(RESOURCES_DIR, filename);
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as Library[];
}

/**
 * Helper: render a single library by name from the fixture.
 */
function renderLibrary(allLibs: Library[], name: string): string {
    const lib = allLibs.find((l) => l.name === name);
    assert.ok(lib, `Library ${name} not found in fixture`);
    return toSyntaxString([lib!]);
}

suite("toSyntaxString", () => {
    let allLibraries: Library[];
    let fullResult: string;

    suiteSetup(() => {
        allLibraries = loadLibraries("sample-libraries.json");
        fullResult = toSyntaxString(allLibraries);
    });

    // ----------------------------------------------------------------
    // Design Doc: Implementation Notes — Module prefix derivation
    // ----------------------------------------------------------------
    suite("deriveModulePrefix", () => {
        test("should derive correct module prefixes from the design doc table", () => {
            assert.strictEqual(deriveModulePrefix("ballerina/http"), "http");
            assert.strictEqual(deriveModulePrefix("ballerinax/salesforce"), "salesforce");
            assert.strictEqual(deriveModulePrefix("ballerinax/client.config"), "config");
            assert.strictEqual(deriveModulePrefix("ballerinax/docusign.dsesign"), "dsesign");
            assert.strictEqual(deriveModulePrefix("ballerina/oauth2"), "oauth2");
        });
    });

    // ----------------------------------------------------------------
    // Design Doc §13: Library (top-level structure)
    // ----------------------------------------------------------------
    suite("§13 Library top-level structure", () => {
        test("should render library header with separator, name, description, and import", () => {
            const result = renderLibrary(allLibraries, "ballerina/http");
            assert.ok(result.includes("// ============================================================"));
            assert.ok(result.includes("// Library: ballerina/http"));
            assert.ok(result.includes("// This module provides APIs for connecting and interacting with HTTP and HTTP2 endpoints."));
            assert.ok(result.includes("import ballerina/http;"));
        });

        test("should render section headers only when section is non-empty", () => {
            // ballerina/http has types, functions, services — but no clients
            const httpResult = renderLibrary(allLibraries, "ballerina/http");
            assert.ok(httpResult.includes("// --- Types ---"), "Should have Types section");
            assert.ok(httpResult.includes("// --- Functions ---"), "Should have Functions section");
            assert.ok(httpResult.includes("// --- Service ---"), "Should have Service section");
            assert.ok(!httpResult.includes("// --- Client ---"), "Should NOT have Client section (empty)");

            // ballerina/io has only functions — no types, clients, services
            const ioResult = renderLibrary(allLibraries, "ballerina/io");
            assert.ok(!ioResult.includes("// --- Types ---"), "io should NOT have Types section");
            assert.ok(!ioResult.includes("// --- Client ---"), "io should NOT have Client section");
            assert.ok(ioResult.includes("// --- Functions ---"), "io should have Functions section");
            assert.ok(!ioResult.includes("// --- Service ---"), "io should NOT have Service section");
        });

        test("should prepend library instructions before everything when present", () => {
            const result = renderLibrary(allLibraries, "ballerinax/custom.integration");
            const importIdx = result.indexOf("import ballerinax/custom.integration;");
            const instructionsIdx = result.indexOf("// Use this library for custom integrations.");
            const typesIdx = result.indexOf("// --- Types ---");
            assert.ok(instructionsIdx > importIdx, "Instructions should come after import");
            assert.ok(instructionsIdx < typesIdx, "Instructions should come before Types section");
        });
    });

    // ----------------------------------------------------------------
    // Design Doc §1: RecordTypeDefinition
    // ----------------------------------------------------------------
    suite("§1 RecordTypeDefinition", () => {
        test("should render record with internal links only (CacheConfig from ballerina/http)", () => {
            const result = renderLibrary(allLibraries, "ballerina/http");
            // Record-level description as # comment
            assert.ok(result.includes("# Provides a set of configurations for controlling the caching behaviour of the endpoint."));
            assert.ok(result.includes("type CacheConfig record {"));
            // Field-level descriptions
            assert.ok(result.includes("    # Specifies whether HTTP caching is enabled. Caching is enabled by default."));
            // Optional fields with ?
            assert.ok(result.includes("boolean enabled?;"));
            assert.ok(result.includes("boolean isShared?;"));
            assert.ok(result.includes("int capacity?;"));
            assert.ok(result.includes("float evictionFactor?;"));
            // Internal link — no prefix, no Special Agent Note
            assert.ok(result.includes("CachingPolicy policy?;"));
            assert.ok(!result.includes("CachingPolicy policy?; //"), "Internal link should have no agent note");
            assert.ok(result.includes("};"));
        });

        test("should render record with external links and Special Agent Note (ConnectionConfig from ballerinax/salesforce)", () => {
            const result = renderLibrary(allLibraries, "ballerinax/salesforce");
            // No description → no # comment before record
            assert.ok(result.includes("type ConnectionConfig record {"));
            // No field descriptions → no # comments on fields
            assert.ok(result.includes("    string baseUrl;"));
            // External links: prefix + Special Agent Note
            assert.ok(
                result.includes("http:BearerTokenConfig|http:OAuth2RefreshTokenGrantConfig|OAuth2PasswordGrantConfig|OAuth2ClientCredentialsGrantConfig auth;"),
                "Should prefix external types and leave non-external types unprefixed"
            );
            assert.ok(
                result.includes("// Special Agent Note: BearerTokenConfig, OAuth2RefreshTokenGrantConfig FROM ballerina/http package"),
                "Should add grouped Special Agent Note"
            );
        });

        test("should render per-field external notes (ClientHttp1Settings from ballerinax/docusign.dsesign)", () => {
            const result = renderLibrary(allLibraries, "ballerinax/docusign.dsesign");
            assert.ok(result.includes("type ClientHttp1Settings record {"));
            // Each external field gets its own note
            assert.ok(
                result.includes("http:KeepAlive keepAlive?; // Special Agent Note: KeepAlive FROM ballerina/http package"),
                "keepAlive should have its own agent note"
            );
            assert.ok(
                result.includes("http:Chunking chunking?; // Special Agent Note: Chunking FROM ballerina/http package"),
                "chunking should have its own agent note"
            );
            // Internal link — no prefix, no note
            assert.ok(result.includes("ProxyConfig proxy?;"));
            const proxyLine = result.split("\n").find((l) => l.includes("ProxyConfig proxy?;"));
            assert.ok(proxyLine && !proxyLine.includes("Special Agent Note"), "Internal link should have no agent note");
        });

        test("should render record field with default value (RecordWithDefault from ballerinax/custom.integration)", () => {
            const result = renderLibrary(allLibraries, "ballerinax/custom.integration");
            assert.ok(result.includes("type RecordWithDefault record {"));
            assert.ok(
                result.includes("int timeout? = 60;"),
                "Should render field with optional + default"
            );
            assert.ok(
                result.includes("int retryCount?;"),
                "Should render optional field without default"
            );
        });
    });

    // ----------------------------------------------------------------
    // Design Doc §2: EnumTypeDefinition
    // ----------------------------------------------------------------
    suite("§2 EnumTypeDefinition", () => {
        test("should render enum with members, skip member descriptions (HttpVersion from ballerina/http)", () => {
            const result = renderLibrary(allLibraries, "ballerina/http");
            assert.ok(result.includes("# Defines the supported HTTP protocols."));
            assert.ok(result.includes("enum HttpVersion {"));
            assert.ok(result.includes("HTTP_2_0"));
            assert.ok(result.includes("HTTP_1_1"));
            assert.ok(result.includes("HTTP_1_0"));
            // Member descriptions should be skipped
            assert.ok(!result.includes("Represents HTTP/2.0 protocol"), "Should skip enum member descriptions");
        });
    });

    // ----------------------------------------------------------------
    // Design Doc §3: UnionTypeDefinition
    // ----------------------------------------------------------------
    suite("§3 UnionTypeDefinition", () => {
        test("should render union with members (Compression from ballerina/http)", () => {
            const result = renderLibrary(allLibraries, "ballerina/http");
            // Multi-line description
            assert.ok(result.includes("# Options to compress using gzip or deflate."));
            assert.ok(result.includes("# AUTO: When service behaves as a HTTP gateway..."));
            assert.ok(result.includes("type Compression COMPRESSION_AUTO|COMPRESSION_ALWAYS|COMPRESSION_NEVER;"));
        });

        test("should render union without members as bare type declaration (StatusCode from ballerina/http)", () => {
            const result = renderLibrary(allLibraries, "ballerina/http");
            assert.ok(result.includes("# Represents an HTTP status code type."));
            assert.ok(result.includes("type StatusCode;"));
        });
    });

    // ----------------------------------------------------------------
    // Design Doc §4: ConstantTypeDefinition
    // ----------------------------------------------------------------
    suite("§4 ConstantTypeDefinition", () => {
        test("should render string constant with quoted value (AUTH_HEADER from ballerina/http)", () => {
            const result = renderLibrary(allLibraries, "ballerina/http");
            assert.ok(result.includes("# Represents the Authorization header name."));
            assert.ok(result.includes('const string AUTH_HEADER = "Authorization";'));
        });

        test("should render numeric constant without quotes (DEFAULT_PORT from ballerina/http)", () => {
            const result = renderLibrary(allLibraries, "ballerina/http");
            assert.ok(result.includes("# Default HTTP listener port."));
            assert.ok(result.includes("const int DEFAULT_PORT = 9090;"));
            // Should NOT have quotes around numeric value
            assert.ok(!result.includes('"9090"'), "Numeric constant should not be quoted");
        });
    });

    // ----------------------------------------------------------------
    // Design Doc §5: ClassTypeDefinition
    // ----------------------------------------------------------------
    suite("§5 ClassTypeDefinition", () => {
        test("should render class with description and empty body (PersistentCookieHandler from ballerina/http)", () => {
            const result = renderLibrary(allLibraries, "ballerina/http");
            assert.ok(result.includes("# Provides persistence for cookies."));
            assert.ok(result.includes("class PersistentCookieHandler {"));
            // Should NOT be `client class`
            assert.ok(!result.includes("client class PersistentCookieHandler"), "Regular class should not be client class");
        });
    });

    // ----------------------------------------------------------------
    // Design Doc §6: Client — Constructor
    // ----------------------------------------------------------------
    suite("§6 Client Constructor", () => {
        test("should render constructor with internal links only (salesforce)", () => {
            const result = renderLibrary(allLibraries, "ballerinax/salesforce");
            assert.ok(result.includes("client class Client {"));
            assert.ok(
                result.includes("function init(ConnectionConfig config) returns error?;"),
                "Constructor should use function init(...), no remote keyword, no description"
            );
        });

        test("should render constructor with external links and defaults (postgresql)", () => {
            const result = renderLibrary(allLibraries, "ballerinax/postgresql");
            // Constructor with many params, defaults, and external link
            assert.ok(
                result.includes('function init(string host = "localhost", string|() username = "postgres", string|() password = (), string|() database = (), int port = 5432, Options|() options = (), sql:ConnectionPool|() connectionPool = ()) returns ballerina/sql:1.16.0:Error?;'),
                "Should render constructor with all params, defaults, external prefix"
            );
            assert.ok(
                result.includes("// Special Agent Note: ConnectionPool FROM ballerina/sql package"),
                "Constructor should have Special Agent Note for external param"
            );
        });
    });

    // ----------------------------------------------------------------
    // Design Doc §7: Client — Remote Function
    // ----------------------------------------------------------------
    suite("§7 Client Remote Function", () => {
        test("should render remote function without external links (salesforce query)", () => {
            const result = renderLibrary(allLibraries, "ballerinax/salesforce");
            assert.ok(result.includes("    # Executes the specified SOQL query."));
            assert.ok(
                result.includes("remote function query(string soql, record {|anydata...;|} returnType = record {|anydata...;|}) returns stream<returnType, error?>|error;"),
                "Should render remote function with default param"
            );
        });

        test("should render remote function with external links on param and return (postgresql queryRow)", () => {
            const result = renderLibrary(allLibraries, "ballerinax/postgresql");
            assert.ok(result.includes("    # Executes the query, which is expected to return at most one row of the result."));
            assert.ok(result.includes("    # If the query does not return any results, an `sql:NoRowsError` is returned."));
            assert.ok(
                result.includes("remote function queryRow(sql:ParameterizedQuery sqlQuery, anydata returnType = anydata) returns returnType|sql:Error;"),
                "Should prefix external types in both param and return"
            );
            assert.ok(
                result.includes("// Special Agent Note: ParameterizedQuery, Error FROM ballerina/sql package"),
                "Should collect external links from both params and return in one note"
            );
        });
    });

    // ----------------------------------------------------------------
    // Design Doc §8: Client — Resource Function
    // ----------------------------------------------------------------
    suite("§8 Client Resource Function", () => {
        test("should render resource function with path segments and path-param exclusion (docusign post envelopes)", () => {
            const result = renderLibrary(allLibraries, "ballerinax/docusign.dsesign");
            assert.ok(result.includes("    # Creates an envelope."));
            // Path: accounts/[string accountId]/envelopes
            assert.ok(
                result.includes("resource function post accounts/[string accountId]/envelopes("),
                "Should render path with static segments and path parameter brackets"
            );
            // accountId should NOT appear in parenthesized params (it's in the path)
            const resourceLine = result.split("\n").find((l) => l.includes("resource function post accounts"));
            assert.ok(resourceLine, "Resource function line should exist");
            const paramsSection = resourceLine!.substring(resourceLine!.indexOf("("));
            assert.ok(!paramsSection.includes("string accountId"), "Path param should be excluded from parenthesized params");
            // Non-path params should be present
            assert.ok(paramsSection.includes("EnvelopeDefinition payload"));
            assert.ok(paramsSection.includes("string|() cdse_mode = ()"));
            assert.ok(paramsSection.includes("string|() change_routing_order = ()"));
            // Return type
            assert.ok(paramsSection.includes("returns EnvelopeSummary|error;"));
        });
    });

    // ----------------------------------------------------------------
    // Design Doc §9: Client (full composition)
    // ----------------------------------------------------------------
    suite("§9 Client full composition", () => {
        test("should render client class with constructor + remote functions (salesforce)", () => {
            const result = renderLibrary(allLibraries, "ballerinax/salesforce");
            assert.ok(result.includes("# Ballerina Salesforce connector provides the capability to access Salesforce REST API."));
            assert.ok(result.includes("client class Client {"));
            assert.ok(result.includes("function init(ConnectionConfig config) returns error?;"));
            assert.ok(result.includes("remote function query("));
            assert.ok(result.includes("}"));
        });

        test("should render client class with constructor + resource functions (docusign)", () => {
            const result = renderLibrary(allLibraries, "ballerinax/docusign.dsesign");
            assert.ok(result.includes("client class Client {"));
            assert.ok(result.includes("function init(ConnectionConfig config) returns error?;"));
            assert.ok(result.includes("resource function post accounts/[string accountId]/envelopes("));
        });

        test("should render client class with constructor + remote functions with external links (postgresql)", () => {
            const result = renderLibrary(allLibraries, "ballerinax/postgresql");
            assert.ok(result.includes("# Represents a PostgreSQL database client."));
            assert.ok(result.includes("client class Client {"));
            assert.ok(result.includes("function init("));
            assert.ok(result.includes("remote function queryRow("));
        });
    });

    // ----------------------------------------------------------------
    // Design Doc §10: Standalone Functions (library-level)
    // ----------------------------------------------------------------
    suite("§10 Standalone Functions", () => {
        test("should render standalone function with # + param and # + return docs (io fileWriteBytes)", () => {
            const result = renderLibrary(allLibraries, "ballerina/io");
            assert.ok(result.includes("# Write a set of bytes to a file."));
            assert.ok(result.includes("# + path - The path of the file"));
            assert.ok(result.includes("# + content - Byte content to write"));
            assert.ok(result.includes("# + option - To indicate whether to overwrite or append the given content"));
            assert.ok(result.includes("# + return - An `io:Error` or else `()`"));
            assert.ok(
                result.includes("function fileWriteBytes(string path, byte[] content, FileWriteOption option = OVERWRITE) returns Error|();"),
                "Should render function with params and default"
            );
        });

        test("should render standalone function without param descriptions (http authenticateResource)", () => {
            const result = renderLibrary(allLibraries, "ballerina/http");
            assert.ok(result.includes("# Uses for declarative auth design."));
            assert.ok(
                result.includes("function authenticateResource(Service serviceRef, string methodName, string[] resourcePath) returns ();"),
                "Should render function with no param docs when descriptions are empty"
            );
            // Should NOT have # + param lines for params with empty descriptions
            const funcLines = result.split("\n");
            const authFuncIdx = funcLines.findIndex((l) => l.includes("function authenticateResource("));
            // The line before should be the description, not a # + param line
            assert.ok(
                funcLines[authFuncIdx - 1].includes("# Uses for declarative auth design."),
                "No # + param lines for empty descriptions"
            );
        });

        test("should render standalone function with multi-package external links (custom.integration process)", () => {
            const result = renderLibrary(allLibraries, "ballerinax/custom.integration");
            assert.ok(
                result.includes("function process(http:Request req, kafka:Message msg) returns error?;"),
                "Should prefix types from different packages"
            );
            assert.ok(
                result.includes("// Special Agent Note: Request FROM ballerina/http package, Message FROM ballerinax/kafka package"),
                "Should group by package in Special Agent Note with comma separation"
            );
        });
    });

    // ----------------------------------------------------------------
    // Design Doc §11: Service — GenericService
    // ----------------------------------------------------------------
    suite("§11 GenericService", () => {
        test("should render generic service with listener signature and instructions passthrough (ballerina/http)", () => {
            const result = renderLibrary(allLibraries, "ballerina/http");
            assert.ok(result.includes("// --- Service (generic) ---"));
            assert.ok(result.includes("// Listener: Listener(int port)"));
            assert.ok(result.includes("// Instructions:"));
            // Instructions passed through verbatim
            assert.ok(result.includes("# Service writing instructions"));
            assert.ok(result.includes("- HTTP Service always requires a http listener to be attached to it."));
        });
    });

    // ----------------------------------------------------------------
    // Design Doc §12: Service — FixedService
    // ----------------------------------------------------------------
    suite("§12 FixedService", () => {
        test("should render fixed service with listener and remote methods (salesforce)", () => {
            const result = renderLibrary(allLibraries, "ballerinax/salesforce");
            assert.ok(
                result.includes("service on new salesforce:Listener(salesforce:ListenerConfig listenerConfig"),
                "Should render service on new Listener(...)"
            );
            // Method names from the name field
            assert.ok(result.includes("    # The `onCreate` method is triggered when a new record create event is received from Salesforce."));
            assert.ok(result.includes("remote function onCreate(salesforce:EventData payload) returns error?;"));
            assert.ok(result.includes("remote function onUpdate(salesforce:EventData payload) returns error?;"));
            assert.ok(result.includes("remote function onDelete(salesforce:EventData payload) returns error?;"));
        });

        test("should mark optional methods with // optional comment", () => {
            const result = renderLibrary(allLibraries, "ballerinax/salesforce");
            // onCreate and onUpdate are optional: false
            const onCreateLine = result.split("\n").find((l) => l.includes("remote function onCreate("));
            assert.ok(onCreateLine && !onCreateLine.includes("// optional"), "Required method should not have // optional");
            // onDelete is optional: true
            const onDeleteLine = result.split("\n").find((l) => l.includes("remote function onDelete("));
            assert.ok(onDeleteLine && onDeleteLine.includes("// optional"), "Optional method should have // optional comment");
        });
    });

    // ----------------------------------------------------------------
    // Design Doc: External Type References — Dual Approach
    // ----------------------------------------------------------------
    suite("External Type References — Dual Approach", () => {
        test("Strategy 1: should apply module-qualified prefix to external type names", () => {
            // salesforce ConnectionConfig auth field
            const result = renderLibrary(allLibraries, "ballerinax/salesforce");
            assert.ok(result.includes("http:BearerTokenConfig"), "Should prefix with http:");
            assert.ok(result.includes("http:OAuth2RefreshTokenGrantConfig"), "Should prefix with http:");
            // Non-external types left unprefixed
            assert.ok(result.includes("|OAuth2PasswordGrantConfig|"), "Non-linked types should stay unprefixed");
        });

        test("Strategy 2: should emit Special Agent Note only for external links", () => {
            // CacheConfig has only internal links → no note
            const httpResult = renderLibrary(allLibraries, "ballerina/http");
            const policyLine = httpResult.split("\n").find((l) => l.includes("CachingPolicy policy?;"));
            assert.ok(policyLine && !policyLine.includes("Special Agent Note"), "Internal-only field should have no agent note");

            // ConnectionConfig auth has external links → note
            const sfResult = renderLibrary(allLibraries, "ballerinax/salesforce");
            assert.ok(sfResult.includes("// Special Agent Note: BearerTokenConfig, OAuth2RefreshTokenGrantConfig FROM ballerina/http package"));
        });

        test("should handle multi-package external links on a single function line", () => {
            const result = renderLibrary(allLibraries, "ballerinax/custom.integration");
            assert.ok(
                result.includes("// Special Agent Note: Request FROM ballerina/http package, Message FROM ballerinax/kafka package"),
                "Multi-package note should separate packages with comma"
            );
        });

        test("should collect external links from both params and return type on function", () => {
            const result = renderLibrary(allLibraries, "ballerinax/postgresql");
            // queryRow has ParameterizedQuery in param and Error in return, both from ballerina/sql
            assert.ok(
                result.includes("// Special Agent Note: ParameterizedQuery, Error FROM ballerina/sql package"),
                "Should collect from both param and return in one note"
            );
        });
    });

    // "Error" and "Other" carry no fields or members — the model sends the compiler's own
    // signature in `baseType` instead, and it is emitted as the declaration's right-hand side.
    suite("§13 Member-less type definitions (Error / Other)", () => {
        function render(typeDef: Record<string, unknown>): string {
            const lib = {
                name: "ballerinax/kafka",
                description: "",
                typeDefs: [typeDef],
            } as unknown as Library;
            return toSyntaxString([lib]);
        }

        test("should render an error type from its baseType", () => {
            const result = render({
                name: "Error",
                description: "Defines the common error type for the module.",
                type: "Error",
                baseType: "error",
            });
            assert.ok(result.includes("# Defines the common error type for the module."),
                "Description must survive; it used to be discarded with the type");
            assert.ok(result.includes("type Error error;"), `Expected error declaration, got:\n${result}`);
            assert.ok(!result.includes("// Unknown type"), "Must no longer fall through to the comment");
        });

        test("should render an error type carrying a detail record", () => {
            const result = render({
                name: "PayloadBindingError",
                description: "Represents an error, which occurred due to payload binding.",
                type: "Error",
                baseType: "error<record {|TopicPartition partition; int offset;|}>",
            });
            assert.ok(
                result.includes("type PayloadBindingError error<record {|TopicPartition partition; int offset;|}>;"),
                `Detail record must be preserved verbatim, got:\n${result}`
            );
        });

        test("should render an Other type such as a tuple", () => {
            const result = render({
                name: "TopicPartitionTimestamp",
                description: "Represents a topic partition and a timestamp.",
                type: "Other",
                baseType: "[TopicPartition, int]",
            });
            assert.ok(result.includes("# Represents a topic partition and a timestamp."));
            assert.ok(result.includes("type TopicPartitionTimestamp [TopicPartition, int];"),
                `Expected tuple declaration, got:\n${result}`);
        });

        test("should keep the previous comment when baseType is absent", () => {
            const result = render({
                name: "Mystery",
                description: "No signature available.",
                type: "Other",
            });
            assert.ok(result.includes("// Unknown type: Mystery"),
                `Missing baseType must degrade to the old output, got:\n${result}`);
            assert.ok(!result.includes("type Mystery ;"), "Must never emit an empty right-hand side");
        });

        test("should still render deprecation for a member-less type", () => {
            const result = render({
                name: "OldError",
                description: "Legacy error.",
                type: "Error",
                baseType: "error",
                isDeprecated: true,
            });
            assert.ok(result.includes("@deprecated"), `Expected @deprecated, got:\n${result}`);
            assert.ok(result.includes("type OldError error;"));
        });

        test("should leave genuinely unknown type categories on the comment path", () => {
            const result = render({ name: "Weird", description: "", type: "SomethingElse" });
            assert.ok(result.includes("// Unknown type: Weird"),
                `Unrecognised categories must be unaffected, got:\n${result}`);
        });
    });

    // A class declaration and an object type definition both arrive as type "Class". Their methods
    // must render, and each method with the qualifier it was actually declared with.
    suite("§14 Class / object type members", () => {
        function renderTypeDef(typeDef: Record<string, unknown>): string {
            const lib = { name: "ballerina/sql", description: "", typeDefs: [typeDef] } as unknown as Library;
            return toSyntaxString([lib]);
        }

        function fn(name: string, type: string, extra: Record<string, unknown> = {}) {
            return { name, type, description: "", parameters: [], ...extra };
        }

        test("should render a plain method as `function`, never `remote function`", () => {
            const result = renderTypeDef({
                name: "ResultIterator", description: "The iterator.", type: "Class",
                functions: [fn("next", "Normal Function"), fn("close", "Normal Function")],
            });
            assert.ok(result.includes("class ResultIterator {"), `got:\n${result}`);
            assert.ok(result.includes("    function next();"), `Expected plain function, got:\n${result}`);
            assert.ok(!result.includes("remote function next"),
                `A Normal Function must not be labelled remote, got:\n${result}`);
            assert.ok(!result.includes("// Unknown type"), "Must not fall through to the comment path");
        });

        test("should render a remote method with the remote qualifier", () => {
            const result = renderTypeDef({
                name: "Holder", description: "", type: "Class",
                functions: [fn("query", "Remote Function")],
            });
            assert.ok(result.includes("    remote function query();"), `got:\n${result}`);
        });

        test("should render an object type carrying the client qualifier as `client class`", () => {
            const result = renderTypeDef({
                name: "Client", description: "Represents an SQL client.", type: "Class", isClient: true,
                functions: [fn("query", "Remote Function"), fn("close", "Normal Function")],
            });
            assert.ok(result.includes("client class Client {"),
                `A client-qualified object type must render as client class, got:\n${result}`);
            assert.ok(result.includes("    remote function query();"), `got:\n${result}`);
            assert.ok(result.includes("    function close();"), `got:\n${result}`);
        });

        test("should keep rendering an empty class body unchanged", () => {
            const result = renderTypeDef({ name: "Service", description: "Marker.", type: "Class" });
            assert.ok(result.includes("class Service {\n}"),
                `A member-less class must be unchanged, got:\n${result}`);
        });

        test("should treat an empty functions array the same as none", () => {
            const result = renderTypeDef({ name: "Empty", description: "", type: "Class", functions: [] });
            assert.ok(result.includes("class Empty {\n}"), `got:\n${result}`);
        });

        test("should render a constructor without a leading blank line", () => {
            const result = renderTypeDef({
                name: "Holder", description: "", type: "Class",
                functions: [fn("init", "Constructor"), fn("go", "Remote Function")],
            });
            assert.ok(result.includes("class Holder {\n    function init();"),
                `Constructor must follow the header directly, got:\n${result}`);
        });

        test("should render a resource method via the resource path", () => {
            const result = renderTypeDef({
                name: "Holder", description: "", type: "Class",
                functions: [{
                    name: "get", type: "Resource Function", description: "", parameters: [],
                    accessor: "get", paths: [{ kind: "literal", value: "items" }],
                }],
            });
            assert.ok(result.includes("resource function get"), `got:\n${result}`);
        });

        test("should carry deprecation and description onto a populated class", () => {
            const result = renderTypeDef({
                name: "Old", description: "Legacy holder.", type: "Class", isDeprecated: true,
                functions: [fn("go", "Remote Function")],
            });
            assert.ok(result.includes("# Legacy holder."), `got:\n${result}`);
            assert.ok(result.includes("@deprecated"), `got:\n${result}`);
            assert.ok(result.includes("class Old {"), `got:\n${result}`);
        });
    });

    // ----------------------------------------------------------------
    // Ballerina Trigger Construct Spec v1 — rendering conformance.
    // Each test names the spec section it pins and asserts what that section mandates, so a change
    // that breaks a spec guarantee fails here even if the implementation stays self-consistent.
    // ----------------------------------------------------------------
    suite("Trigger spec §1/§2 — service type module and required imports", () => {
        function renderService(service: Record<string, unknown>): string {
            const lib = {
                name: "ballerinax/mssql",
                description: "",
                typeDefs: [],
                clients: [],
                services: [service],
            } as unknown as Library;
            return toSyntaxString([lib]);
        }

        const listener = { name: "mssql:CdcListener", parameters: [] };

        test("§1: a cross-module service type is written with its own module alias", () => {
            // Spec §1: `packageInfo` appears "only when the type isn't from this file's own home
            // module", and the home module is the listener's. mssql.cdc's service type belongs to
            // ballerinax/cdc, so `mssql:Service` would not compile.
            const result = renderService({
                type: "fixed", name: "Service", serviceTypeModule: "ballerinax/cdc", listener, methods: [],
            });
            assert.ok(result.includes("service cdc:Service on new mssql:CdcListener("),
                `Expected the foreign module alias, got:\n${result}`);
            assert.ok(!result.includes("service mssql:Service"),
                "Must not borrow the listener's alias for a foreign service type");
        });

        test("§1: a home-module service type still borrows the listener's alias", () => {
            // No `serviceTypeModule` means the type is the connector's own, so the existing
            // listener-alias behaviour must be preserved exactly.
            const result = renderService({
                type: "fixed", name: "Service", listener: { name: "kafka:Listener", parameters: [] },
                methods: [],
            });
            assert.ok(result.includes("service kafka:Service on new kafka:Listener("), `got:\n${result}`);
        });

        test("§2: a side-effect-only import is stated on the service that requires it", () => {
            // Spec §2's own example: `import ballerinax/mssql.cdc.driver as _;`
            const result = renderService({
                type: "fixed", name: "Service", listener, methods: [],
                requiredImports: [{ module: "ballerinax/mssql.cdc.driver", alias: "_" }],
            });
            assert.ok(result.includes("# Requires: import ballerinax/mssql.cdc.driver as _;"),
                `Required import must be stated on the service that needs it, got:\n${result}`);
            assert.ok(!result.split("\n").some((l) => l === "import ballerinax/mssql.cdc.driver as _;"),
                "A listener-scoped import must not be hoisted to the library header");
        });

        test("§2: an import required by several services is stated on each, never hoisted", () => {
            // Spec §2 declares `requiredImports` on the *listener*, so the requirement belongs to each
            // service that attaches to it — one `# Requires:` line per service, and never a bare
            // `import ...;` at the library header. Repetition is correct here, not duplication: each
            // service states its own dependency.
            //
            // This test previously asserted the opposite — that a single *hoisted* `import ...;` line
            // appears — which contradicted its own sibling above and had never passed.
            const service = (name: string) => ({
                type: "fixed", name, listener, methods: [],
                requiredImports: [{ module: "ballerinax/mssql.cdc.driver", alias: "_" }],
            });
            const lib = {
                name: "ballerinax/mssql", description: "", typeDefs: [], clients: [],
                services: [service("A"), service("B")],
            } as unknown as Library;
            const lines = toSyntaxString([lib]).split("\n");

            assert.strictEqual(
                lines.filter((l) => l === "# Requires: import ballerinax/mssql.cdc.driver as _;").length,
                2, "each service states the import it requires");
            assert.strictEqual(
                lines.filter((l) => l === "import ballerinax/mssql.cdc.driver as _;").length,
                0, "a listener-scoped import is never hoisted to the library header");
            assert.deepStrictEqual(lines.filter((l) => l.startsWith("import ")),
                ["import ballerinax/mssql;"], "only the library's own import is hoisted");
        });

        test("§2: an entry with no alias renders as a plain import", () => {
            const result = renderService({
                type: "fixed", name: "Service", listener, methods: [],
                requiredImports: [{ module: "ballerinax/somepkg" }],
            });
            assert.ok(result.includes("import ballerinax/somepkg;"), `got:\n${result}`);
            assert.ok(!result.includes("as _;"), "No alias means no `as` clause");
        });

        test("general rule: absent optional keys add nothing", () => {
            // "A field that would be empty, unused, or fully derivable ... is left out" — an absent
            // requiredImports/serviceTypeModule must leave output byte-identical to before.
            const result = renderService({ type: "fixed", name: "Service", listener, methods: [] });
            assert.ok(!result.includes(" as _;"), "No imports must be invented");
            const importLines = result.split("\n").filter((l) => l.startsWith("import "));
            assert.deepStrictEqual(importLines, ["import ballerinax/mssql;"]);
        });
    });

    suite("Trigger spec §8 — service-level annotation requirements", () => {
        function renderService(service: Record<string, unknown>, libName = "ballerina/ftp"): string {
            const lib = {
                name: libName,
                description: "",
                typeDefs: [],
                clients: [],
                services: [service],
            } as unknown as Library;
            return toSyntaxString([lib]);
        }

        const ftpListener = { name: "ftp:Listener", parameters: [] };

        function annotation(over: Record<string, unknown> = {}): Record<string, unknown> {
            return {
                name: "ServiceConfig", presence: "optional", attachPoint: "service", ...over,
            };
        }

        test("§8: a required annotation is attached above the service it is required on", () => {
            // ftp, smb and mssql.cdc declare `presence: "required"`; code generated without the
            // annotation does not work, so the obligation has to be unmissable and adjacent.
            const result = renderService({
                type: "fixed", name: "Service", listener: ftpListener, methods: [],
                annotations: [annotation({ presence: "required" })],
            });
            const lines = result.split("\n");
            const serviceLine = lines.findIndex((l) => l.startsWith("service ftp:Service on new"));
            const attachLine = lines.findIndex((l) => l.startsWith("@ftp:ServiceConfig"));

            assert.ok(attachLine >= 0, `Expected an attachment line, got:\n${result}`);
            assert.strictEqual(attachLine, serviceLine - 1, "The attachment must sit on the service");
            assert.ok(lines[attachLine - 1].startsWith("# Mandatory:"),
                `A required annotation must state the obligation, got: ${lines[attachLine - 1]}`);
        });

        test("§8: presence distinguishes a required annotation from an optional one", () => {
            // Both are attachments of identical shape, so the presence has to be legible on the line
            // that actually gets copied — an optional annotation whose record has mandatory fields
            // turns a harmless omission into a compile error when attached carelessly.
            const required = renderService({
                type: "fixed", name: "Service", listener: ftpListener, methods: [],
                annotations: [annotation({ presence: "required" })],
            });
            const optional = renderService({
                type: "fixed", name: "Service", listener: ftpListener, methods: [],
                annotations: [annotation({ presence: "optional" })],
            });

            assert.ok(required.includes("@ftp:ServiceConfig {...} // required"), `got:\n${required}`);
            assert.ok(optional.includes("@ftp:ServiceConfig {...} // optional"), `got:\n${optional}`);
            assert.ok(required.includes("# Mandatory: this service must carry"));
            assert.ok(optional.includes("# Optional: this service may carry"));
        });

        test("§1/§8: a cross-module annotation takes its own module's prefix and states provenance", () => {
            // mssql.cdc's annotation belongs to ballerinax/cdc, so `@mssql:ServiceConfig` would name
            // something that does not exist. Provenance travels in the same `Special Agent Note`
            // convention every other cross-module reference in this renderer uses.
            const result = renderService({
                type: "fixed", name: "Service", serviceTypeModule: "ballerinax/cdc",
                listener: { name: "mssql:CdcListener", parameters: [] }, methods: [],
                annotations: [annotation({ presence: "required", module: "ballerinax/cdc" })],
            }, "ballerinax/mssql");

            assert.ok(result.includes("@cdc:ServiceConfig {...}"), `got:\n${result}`);
            assert.ok(!result.includes("@mssql:ServiceConfig"),
                "A foreign annotation must not borrow the library's own alias");
            assert.ok(result.includes("Special Agent Note: ServiceConfig FROM ballerinax/cdc package"),
                `Provenance must be stated, got:\n${result}`);
        });

        test("§8: a home-module annotation takes the listener's alias, not the service type's", () => {
            // The service type may live in another module while the annotation is the library's own —
            // prefixing the annotation with `serviceTypeModule`'s alias would misname it.
            const result = renderService({
                type: "fixed", name: "Service", serviceTypeModule: "ballerinax/cdc",
                listener: { name: "mssql:CdcListener", parameters: [] }, methods: [],
                annotations: [annotation()],
            }, "ballerinax/mssql");
            assert.ok(result.includes("@mssql:ServiceConfig {...}"), `got:\n${result}`);
            assert.ok(!result.includes("@cdc:ServiceConfig"), "Home annotation must not go foreign");
        });

        test("§8: the constraining record is named so the placeholder can be filled", () => {
            // The document names the annotation tag, not its constraint: `@ftp:ServiceConfig` is
            // constrained by `ServiceConfiguration`. `{...}` is not valid Ballerina, so the model has
            // to be told both that it must be replaced and what supplies the fields.
            const result = renderService({
                type: "fixed", name: "Service", listener: ftpListener, methods: [],
                annotations: [annotation({
                    presence: "required",
                    typeConstraint: { name: "ServiceConfiguration" },
                })],
            });
            assert.ok(result.includes("Replace {...} with its fields, which are those of "
                + "ServiceConfiguration."), `got:\n${result}`);
        });

        test("§8: an unknown constraint still instructs the placeholder be replaced", () => {
            const result = renderService({
                type: "fixed", name: "Service", listener: ftpListener, methods: [],
                annotations: [annotation({ presence: "required" })],
            });
            assert.ok(result.includes("Replace {...} with its fields."), `got:\n${result}`);
        });

        test("§8: several annotations on one service keep document order", () => {
            // "Array order is meaningful" — mcp is the corpus case with more than one in play.
            const result = renderService({
                type: "fixed", name: "Service", listener: ftpListener, methods: [],
                annotations: [annotation({ name: "FirstConfig" }), annotation({ name: "SecondConfig" })],
            });
            assert.ok(result.indexOf("@ftp:FirstConfig") < result.indexOf("@ftp:SecondConfig"),
                `got:\n${result}`);
        });

        test("§8: documentation precedes every annotation, including @deprecated", () => {
            // Ballerina metadata order: all `#` documentation, then all annotations, then the
            // declaration. A deprecated service carrying an obligation must not sandwich the `#` line
            // between two annotations.
            const lines = renderService({
                type: "fixed", name: "Service", listener: ftpListener, methods: [], isDeprecated: true,
                annotations: [annotation({ presence: "required" })],
            }).split("\n");

            const doc = lines.findIndex((l) => l.startsWith("# Mandatory:"));
            const attach = lines.findIndex((l) => l.startsWith("@ftp:ServiceConfig"));
            const deprecated = lines.findIndex((l) => l === "@deprecated");
            const serviceLine = lines.findIndex((l) => l.startsWith("service ftp:Service on new"));

            assert.ok(doc >= 0 && attach >= 0 && deprecated >= 0 && serviceLine >= 0, lines.join("\n"));
            assert.ok(doc < attach, "documentation precedes the attachment");
            assert.ok(doc < deprecated, "documentation precedes @deprecated");
            assert.ok(attach < serviceLine && deprecated < serviceLine,
                "every annotation precedes the declaration");
        });

        test("general rule: a service with no annotations renders exactly as before", () => {
            // Most service types carry no obligation, and their output must be untouched.
            const withKeyAbsent = renderService({
                type: "fixed", name: "Service", listener: ftpListener, methods: [],
            });
            const withEmptyArray = renderService({
                type: "fixed", name: "Service", listener: ftpListener, methods: [], annotations: [],
            });
            assert.strictEqual(withKeyAbsent, withEmptyArray,
                "An empty array must render identically to an absent key");
            assert.ok(!withKeyAbsent.includes("must carry") && !withKeyAbsent.includes("may carry"),
                `No obligation may be invented, got:\n${withKeyAbsent}`);
        });

        test("§1/§8: a foreign constraint is named with its own module's prefix", () => {
            // `CdcServiceConfig` lives in ballerinax/cdc, so telling the model to use a bare
            // `CdcServiceConfig` would name something not in scope. The prefix comes from the external
            // link, exactly as it does for any other cross-package type reference in this renderer.
            const result = renderService({
                type: "fixed", name: "Service", serviceTypeModule: "ballerinax/cdc",
                listener: { name: "mssql:CdcListener", parameters: [] }, methods: [],
                annotations: [annotation({
                    presence: "required", module: "ballerinax/cdc",
                    typeConstraint: {
                        name: "CdcServiceConfig",
                        links: [{ category: "external", recordName: "CdcServiceConfig",
                                  libraryName: "ballerinax/cdc" }],
                    },
                })],
            }, "ballerinax/mssql");

            assert.ok(result.includes("which are those of cdc:CdcServiceConfig."), `got:\n${result}`);
        });

        test("§8: provenance names both the annotation and its record, in one comment", () => {
            // Both live in the foreign package, and both are what the model has to go and find. Two
            // separate `//` comments on one line would compete; the renderer's grouping convention is
            // `X, Y FROM <lib> package`.
            const result = renderService({
                type: "fixed", name: "Service", listener: { name: "mssql:CdcListener", parameters: [] },
                methods: [],
                annotations: [annotation({
                    presence: "required", module: "ballerinax/cdc",
                    typeConstraint: {
                        name: "CdcServiceConfig",
                        links: [{ category: "external", recordName: "CdcServiceConfig",
                                  libraryName: "ballerinax/cdc" }],
                    },
                })],
            }, "ballerinax/mssql");

            const line = result.split("\n").find((l) => l.startsWith("@cdc:ServiceConfig"))!;
            assert.strictEqual(line,
                "@cdc:ServiceConfig {...} // required; Special Agent Note: ServiceConfig, "
                + "CdcServiceConfig FROM ballerinax/cdc package");
            assert.strictEqual(line.split("//").length - 1, 1, "exactly one trailing comment");
        });

        test("§8: a home-module constraint takes the listener's alias, like any other declared type", () => {
            // This test previously asserted the opposite — that the bare name survived — and described the
            // mechanism rather than the requirement. The mechanism was the defect: the constraint was
            // resolved with `applyPrefixToTypeName`, which only consults EXTERNAL links, so a cross-module
            // record came out qualified while a home-module one came out bare.
            //
            // Bare is not a name the reader can use. This sentence tells them what to put inside `{...}` of
            // an annotation they are writing in THEIR module, where the library's own records are reachable
            // only through its alias.
            const result = renderService({
                type: "fixed", name: "Service", listener: ftpListener, methods: [],
                annotations: [annotation({
                    presence: "required",
                    typeConstraint: {
                        name: "ServiceConfiguration",
                        links: [{ category: "internal", recordName: "ServiceConfiguration" }],
                    },
                })],
            });
            assert.ok(result.includes("which are those of ftp:ServiceConfiguration."), `got:\n${result}`);
        });

        test("§8: a cross-module constraint keeps its OWN module's prefix, not the listener's", () => {
            // The other half of the same rule, pinned separately so a future change cannot fix one by
            // breaking the other: an external link must still win over the listener alias. `mssql`'s
            // listener is `mssql:`, but the constraining record belongs to `ballerinax/cdc`.
            const result = renderService({
                type: "fixed", name: "Service", listener: ftpListener, methods: [],
                annotations: [annotation({
                    presence: "required",
                    module: "ballerinax/cdc",
                    typeConstraint: {
                        name: "CdcServiceConfig",
                        links: [{
                            category: "external",
                            recordName: "CdcServiceConfig",
                            libraryName: "ballerinax/cdc",
                        }],
                    },
                })],
            });
            assert.ok(result.includes("which are those of cdc:CdcServiceConfig."), `got:\n${result}`);
            assert.ok(!result.includes("ftp:CdcServiceConfig"),
                "the listener alias must not override an external link");
        });

        test("§8: a nameless entry is skipped rather than rendered as a bare @", () => {
            const result = renderService({
                type: "fixed", name: "Service", listener: ftpListener, methods: [],
                annotations: [annotation({ name: undefined }), annotation({ name: "Sound" })],
            });
            assert.ok(!result.split("\n").some((l) => l.trim() === "@ftp: {...} // optional"),
                `got:\n${result}`);
            assert.ok(result.includes("@ftp:Sound {...}"), "the sound entry beside it still renders");
        });
    });

    // ----------------------------------------------------------------
    // Trigger spec §2 — listener arguments
    // ----------------------------------------------------------------
    suite("Trigger spec §2 — listener argument defaults", () => {
        function renderListener(parameters: Record<string, unknown>[]): string {
            const lib = {
                name: "ballerinax/kafka", description: "", typeDefs: [], clients: [],
                services: [{
                    type: "fixed", name: "Service",
                    listener: { name: "kafka:Listener", parameters },
                    methods: [],
                }],
            } as unknown as Library;
            return toSyntaxString([lib]);
        }

        test("§2: a required listener parameter never carries a default", () => {
            // Spec §2 models no listener init fields — they come from the init signature, where a parameter
            // is required exactly when it is neither defaultable nor an included record. kafka's
            // `bootstrapServers` is required, and rendering `= ""` told the model a mandatory value was
            // already supplied.
            const result = renderListener([
                { name: "bootstrapServers", description: "", type: { name: "string|string[]" }, default: '""' },
            ]);
            assert.ok(result.includes("on new kafka:Listener(string|string[] bootstrapServers)"),
                `got:\n${result}`);
            assert.ok(!result.includes('bootstrapServers = ""'), "a required parameter has no default");
        });

        test("§2: an optional listener parameter keeps its default", () => {
            // The other half of the rule: an included-record or defaultable parameter genuinely may be left
            // out, and its default is the value the connector will use.
            const result = renderListener([
                { name: "config", description: "", type: { name: "ConsumerConfiguration" },
                  optional: true, default: "{}" },
            ]);
            assert.ok(result.includes("on new kafka:Listener(ConsumerConfiguration config = {})"),
                `got:\n${result}`);
        });

        test("§2: required and optional parameters are distinguished within one signature", () => {
            // kafka's real shape, and the one that proves the flag is consulted per parameter rather than
            // per service.
            const result = renderListener([
                { name: "bootstrapServers", description: "", type: { name: "string|string[]" }, default: '""' },
                { name: "config", description: "", type: { name: "ConsumerConfiguration" },
                  optional: true, default: "{}" },
            ]);
            assert.ok(result.includes(
                "on new kafka:Listener(string|string[] bootstrapServers, ConsumerConfiguration config = {})"),
                `got:\n${result}`);
        });

        test("§2: an optional parameter with no default stays bare", () => {
            const result = renderListener([
                { name: "config", description: "", type: { name: "Config" }, optional: true },
            ]);
            assert.ok(result.includes("on new kafka:Listener(Config config)"), `got:\n${result}`);
        });
    });

    // ----------------------------------------------------------------
    // Trigger spec §3/§5/§6/§7 — handler shape, presence, identifier, constraints
    // ----------------------------------------------------------------
    suite("Trigger spec §3/§5/§6/§7 — handler shape, identifier and constraints", () => {
        function renderService(service: Record<string, unknown>, libName = "ballerina/websocket"): string {
            const lib = {
                name: libName, description: "", typeDefs: [], clients: [], services: [service],
            } as unknown as Library;
            return toSyntaxString([lib]);
        }

        const wsListener = { name: "websocket:Listener", parameters: [] };

        function method(over: Record<string, unknown> = {}): Record<string, unknown> {
            return {
                name: "onMessage", type: "remote", description: "",
                parameters: [], return: { type: { name: "error?" } }, ...over,
            };
        }

        function line(result: string, needle: string): string {
            const found = result.split("\n").find((l) => l.includes(needle));
            assert.ok(found, `no line containing "${needle}" in:\n${result}`);
            return found!;
        }

        // ---- §5 kind ----

        test("§5: a resource handler renders `resource function <accessor> <path>`, not `remote`", () => {
            // Corpus: websocket's upgradeService declares {"name": "get", "kind": "resource"}. It used to
            // render `remote function get(...)`, which does not compile — a resource method needs an
            // accessor and a path.
            const result = renderService({
                type: "fixed", name: "UpgradeService", listener: wsListener,
                methods: [method({
                    name: "get", type: "resource", accessor: "get",
                    accessorValues: ["get"], accessorRequired: true, pathRequired: true,
                    parameters: [{ name: "request", description: "", type: { name: "http:Request" } }],
                    return: { type: { name: "Service|UpgradeError" } },
                })],
            });
            assert.ok(result.includes("resource function get pathSegment(http:Request request)"),
                `got:\n${result}`);
            assert.ok(!result.includes("remote function get"), "the remote keyword must be gone");
        });

        test("§11.2: the resource path is a placeholder, and the grammar is no longer restated", () => {
            // §11.2: which accessor and which path segments is intent-derived, so the renderer may only
            // place a fillable placeholder and quote the document's own vocabulary.
            //
            // What it may NOT do any more is quote a path FORM. Spec §5 dropped `identifierSegments` /
            // `pathParamSegments` because "the language already fixes what a resource path may look like" —
            // the old note handed the reader a token from the grammar they were already writing to. What
            // survives is the one thing the language does not fix: that this handler needs a path at all.
            const result = renderService({
                type: "fixed", name: "UpgradeService", listener: wsListener,
                methods: [method({
                    name: "get", type: "resource", accessor: "get",
                    accessorValues: ["get"], accessorRequired: true, pathRequired: true,
                })],
            });
            const note = line(result, "# Resource:");
            assert.ok(note.includes("the accessor must be one of `get`"), note);
            assert.ok(note.includes("a path is required and is author-chosen"), note);
            assert.ok(note.includes("replace `pathSegment`"), note);
            assert.ok(!/Segment[s]?\)/.test(note), `no grammar token may be restated: ${note}`);
        });

        test("§5: an open accessor is worded as a freedom, never as a literal `*`", () => {
            // §5's `values: ["*"]` — `ballerina/http`'s shape. Carrying the wildcard through as a value
            // produced "the accessor must be one of `*`", which reads as an instruction to write a method
            // called `*`. The two states have to be worded differently or the note is actively wrong.
            const result = renderService({
                type: "fixed", name: "Service", listener: wsListener,
                methods: [method({
                    name: "get", type: "resource", accessorOpen: true, accessorRequired: true,
                    pathRequired: true,
                })],
            });
            const note = line(result, "# Resource:");
            assert.ok(note.includes("the accessor may be any the language accepts"), note);
            assert.ok(!note.includes("`*`"), `the wildcard must never reach the reader: ${note}`);
        });

        test("§5: a resource handler with no accessor degrades to remote rather than emitting broken syntax", () => {
            // Defensive path, no corpus instance: inventing `get` would be inventing API, and
            // `resource function  pathSegment(...)` would not compile.
            const result = renderService({
                type: "fixed", name: "Service", listener: wsListener,
                methods: [method({ name: "onEvent", type: "resource", pathRequired: true })],
            });
            assert.ok(result.includes("remote function onEvent("), `got:\n${result}`);
            assert.ok(result.includes("# Resource:"), "the resource nature is still stated");
        });

        test("§5: a remote handler carrying an accessor constraint is still not labelled a resource", () => {
            // The label follows the handler's KIND, not the spec section its extras are filed under. §5 now
            // states the two slots are resource-only, so this shape is a document defect that
            // `ResourceExtrasCheck` reports — but labelling a handler "Resource:" directly above the
            // `remote function` line describing it states the opposite of the signature the reader copies.
            //
            // `graphqlOperation` used to be tested here. It is gone and deliberately not replaced: a query
            // is `resource` + `get`, a subscription `resource` + `subscribe`, and a mutation `remote`, so the
            // field restated what the other two already say.
            const result = renderService({
                type: "fixed", name: "Service", listener: wsListener,
                methods: [method({ name: "onEvent", accessorValues: ["get"], accessorRequired: false })],
            });
            assert.ok(line(result, "# Handler:").includes("the accessor may be one of `get`"),
                `got:\n${result}`);
            assert.ok(result.includes("remote function onEvent("), "a mutation is a remote method");
            assert.ok(!result.includes("# Resource:"),
                `a remote handler must not be labelled a resource:\n${result}`);
        });

        // ---- §5.3 / §3 / §2 / §7 deprecation prose ----

        test("§5.3: a deprecated handler gets a `# # Deprecated` doc section, not a bare flag", () => {
            // The spec words the obligation directly: "A generator emitting Ballerina puts it in the
            // `# # Deprecated` doc section." `ftp`'s `onFileChange` is the corpus instance, and its
            // sentence names the five typed handlers that replace it -- which is the whole value of the
            // field. A boolean would tell the reader to stop and leave them nowhere to go.
            const result = renderService({
                type: "fixed", name: "Service", listener: wsListener,
                methods: [method({
                    name: "onFileChange",
                    description: "Reports which files changed.",
                    deprecated: "Superseded by onFileText, onFileJson, onFileXml, onFileCsv and onFile.",
                })],
            });
            assert.ok(result.includes("    # # Deprecated"), `got:\n${result}`);
            assert.ok(result.includes("    # Superseded by onFileText, onFileJson, onFileXml, "
                + "onFileCsv and onFile."), `the prose is what a reader acts on:\n${result}`);
            // The section is separated by a `#` line, never a blank one: a blank line TERMINATES a
            // Ballerina doc comment, which would detach everything below it from the handler.
            assert.ok(!/\n\s*\n\s*# # Deprecated/.test(result),
                `the separator must keep the doc comment contiguous:\n${result}`);
            assert.ok(result.includes("    #\n    # # Deprecated"), `got:\n${result}`);
        });

        test("§5.3/§8: every `#` line precedes every annotation, even when both blocks apply", () => {
            // Ballerina metadata is ordered: all documentation, then all annotations, then the construct.
            // §8's obligation block straddles that boundary -- it is a `#` note plus an `@X {...}`
            // attachment -- so the deprecation section has to be interleaved BETWEEN its two halves, not
            // appended after it. `ftp`'s `onFileChange` is the only handler in the corpus that is both
            // annotated and deprecated, and it is the case that caught this.
            const result = renderService({
                type: "fixed", name: "Service", listener: wsListener,
                methods: [method({
                    name: "onFileChange",
                    description: "Reports which files changed.",
                    deprecated: "Use the typed handlers.",
                    annotationRefs: [{ name: "FunctionConfig", presence: "optional" }],
                    parameters: [{ name: "watchEvent", description: "The files that changed.",
                                   type: { name: "string" } }],
                })],
            });
            const body = result.split("\n");
            const lastDoc = body.map((l, i) => [l.trim(), i] as [string, number])
                .filter(([l]) => l.startsWith("#")).map(([, i]) => i).pop();
            const firstAnnotation = body.findIndex((l) => l.trim().startsWith("@"));
            assert.ok(firstAnnotation > -1 && lastDoc !== undefined, `got:\n${result}`);
            assert.ok(lastDoc < firstAnnotation,
                `documentation must not follow an annotation:\n${result}`);
            // And specifically: the obligation's own note stays above the section, its attachment below.
            assert.ok(result.indexOf("may carry the @websocket:FunctionConfig")
                < result.indexOf("# # Deprecated"), `got:\n${result}`);
            assert.ok(result.indexOf("# # Deprecated")
                < result.indexOf("@websocket:FunctionConfig {...}"), `got:\n${result}`);
        });

        test("§5.3: the section is the LAST `#` block, so it cannot swallow the parameter docs", () => {
            // `# # Deprecated` opens a markdown section, so every `#` line below it is read as that
            // section's BODY. With the section emitted first, `bal build` reported `undocumented parameter
            // 'watchEvent'` for ftp's handler -- the parameter doc was present in the output and inert.
            // Everything a reader needs about the signature therefore has to precede it.
            const result = renderService({
                type: "fixed", name: "Service", listener: wsListener,
                methods: [method({
                    name: "onFileChange",
                    description: "Reports which files changed.",
                    deprecated: "Use the typed handlers.",
                    parameters: [{ name: "watchEvent", description: "The files that changed.",
                                   type: { name: "string" } }],
                })],
            });
            assert.ok(result.indexOf("# + watchEvent") < result.indexOf("# # Deprecated"),
                `parameter documentation must precede the section:\n${result}`);
            // And nothing but the annotation and the signature may follow it.
            const after = result.slice(result.indexOf("# # Deprecated")).split("\n").slice(2);
            const strayDoc = after.find((line) => line.trim().startsWith("# +")
                || line.trim().startsWith("# Resource:") || line.trim().startsWith("# Required"));
            assert.ok(strayDoc === undefined,
                `no note may follow the section, found: ${strayDoc}\n${result}`);
        });

        test("§5.3: the section always brings `@deprecated` with it, because the compiler demands it", () => {
            // Verified with `bal 2201.13.4`: `# # Deprecated` on an unannotated construct is rejected --
            // "'Deprecated' documentation is only allowed on constructs annotated as '@deprecated'". So the
            // document's prose is by itself sufficient reason to write the annotation.
            //
            // That is the ONLY shape the corpus has: `ftp`'s `onFileChange` belongs to a marker service
            // type, which declares no method for the compiler to have annotated, so `isDeprecated` is
            // absent and gating on it emitted documentation that does not build.
            const proseOnly = renderService({
                type: "fixed", name: "Service", listener: wsListener,
                methods: [method({ name: "onEvent", deprecated: "Use onTypedEvent." })],
            });
            assert.ok(proseOnly.includes("# # Deprecated"), `got:\n${proseOnly}`);
            assert.ok(proseOnly.includes("@deprecated"),
                `the section is invalid without the annotation:\n${proseOnly}`);

            // The two are still different facts and neither replaces the other: a symbol may carry the
            // annotation with no document prose to explain it.
            const flagOnly = renderService({
                type: "fixed", name: "Service", listener: wsListener,
                methods: [method({ name: "onEvent", isDeprecated: true })],
            });
            assert.ok(flagOnly.includes("@deprecated"), `got:\n${flagOnly}`);
            assert.ok(!flagOnly.includes("# # Deprecated"),
                `no prose means no section to write:\n${flagOnly}`);

            // Ballerina metadata puts every `#` line ahead of every annotation.
            assert.ok(proseOnly.indexOf("# # Deprecated") < proseOnly.indexOf("@deprecated"),
                `documentation precedes annotations:\n${proseOnly}`);
        });

        test("§7: a deprecated parameter is named outside its own `# + name -` doc line", () => {
            // Those lines are Ballerina's parameter documentation, and a reader copying one into their own
            // doc comment would carry the deprecation notice into it as though it described the parameter.
            const result = renderService({
                type: "fixed", name: "Service", listener: wsListener,
                methods: [method({
                    name: "onEvent",
                    parameters: [{ name: "caller", description: "The caller.", type: { name: "string" },
                                   deprecated: "Use the Context parameter instead." }],
                })],
            });
            assert.ok(result.includes("# + caller - The caller."), `got:\n${result}`);
            assert.ok(result.includes("# Deprecated `caller`: Use the Context parameter instead."),
                `got:\n${result}`);
            assert.ok(!result.includes("# + caller - The caller. Use the Context"),
                `the notice must not be folded into the parameter doc:\n${result}`);
        });

        test("§3/§2: a deprecated service type and a deprecated listener each say why", () => {
            // A service is written `on new <listener>(...)`, so a superseded listener is a fact about the
            // declaration the reader is about to write. Stating it anywhere but here states it nowhere
            // they would look.
            const result = renderService({
                type: "fixed", name: "Service",
                listener: { ...wsListener, deprecated: "Use websocket:HttpListener." },
                deprecated: "Use websocket:UpgradeService.",
                methods: [method({ name: "onEvent" })],
            });
            assert.ok(result.includes("# Use websocket:UpgradeService."), `got:\n${result}`);
            assert.ok(result.includes("# Listener `websocket:Listener`: Use websocket:HttpListener."),
                `the listener's own deprecation is attributed to it:\n${result}`);
        });

        // ---- §5 presence ----

        test("§5: a required handler is marked `// required` and an optional one `// optional`", () => {
            // Corpus: kafka's onConsumerRecord is required and onError optional. Before this, both rendered
            // identically and the obligation was invisible.
            const result = renderService({
                type: "fixed", name: "Service", listener: wsListener,
                methods: [method({ name: "onConsumerRecord", optional: false }),
                          method({ name: "onError", optional: true })],
            });
            assert.ok(line(result, "onConsumerRecord").endsWith("// required"), line(result, "onConsumerRecord"));
            assert.ok(line(result, "onError").endsWith("// optional"), line(result, "onError"));
        });

        test("§5: a handler whose presence the document does not state carries no marker", () => {
            // Spec §5: presence is meaningful "Only under `addMode: subset`". grpc's four options are under
            // `many`, so neither marker may appear — saying "required" there would invent an obligation.
            const result = renderService({
                type: "fixed", name: "Service", listener: wsListener,
                methods: [method({ name: "unary" })],
            });
            const unary = line(result, "unary");
            assert.ok(!unary.includes("// required"), unary);
            assert.ok(!unary.includes("// optional"), unary);
            assert.ok(unary.trim().endsWith(";"), unary);
        });

        // ---- §7 param presence ----

        test("§7: an optional parameter is named on a `#` line, not marked inside the signature", () => {
            // A `//` comment inside a parameter list would comment out the closing paren and return type;
            // `Caller caller?` is not a Ballerina parameter form, and `= ()` needs a nilable type and would
            // turn "may be omitted" into "has a default".
            const result = renderService({
                type: "fixed", name: "Service", listener: wsListener,
                methods: [method({
                    name: "onFileCsv",
                    parameters: [
                        { name: "contents", description: "", type: { name: "string[][]" } },
                        { name: "caller", description: "", type: { name: "Caller" }, optional: true },
                    ],
                })],
            });
            assert.ok(result.includes("    # Optional parameters (may be omitted): caller"), `got:\n${result}`);
            const signature = line(result, "remote function onFileCsv");
            assert.strictEqual(signature,
                "    remote function onFileCsv(string[][] contents, Caller caller) returns error?;");
        });

        test("§7: several optional parameters are listed together in document order", () => {
            const result = renderService({
                type: "fixed", name: "Service", listener: wsListener,
                methods: [method({
                    parameters: [
                        { name: "caller", description: "", type: { name: "Caller" }, optional: true },
                        { name: "data", description: "", type: { name: "string" } },
                        { name: "extra", description: "", type: { name: "int" }, optional: true },
                    ],
                })],
            });
            assert.ok(result.includes("# Optional parameters (may be omitted): caller, extra"), `got:\n${result}`);
        });

        test("§7: a handler with only required parameters gets no note", () => {
            const result = renderService({
                type: "fixed", name: "Service", listener: wsListener,
                methods: [method({
                    parameters: [{ name: "data", description: "", type: { name: "string" } }],
                })],
            });
            assert.ok(!result.includes("# Optional parameters"), `got:\n${result}`);
        });

        test("both markers coexist without colliding when a handler and its parameter are optional", () => {
            // The reason param optionality is a `#` line and handler presence a trailing comment: they are
            // two different facts and must stay separately readable.
            const result = renderService({
                type: "fixed", name: "Service", listener: wsListener,
                methods: [method({
                    optional: true,
                    parameters: [{ name: "caller", description: "", type: { name: "Caller" }, optional: true }],
                })],
            });
            assert.ok(result.includes("# Optional parameters (may be omitted): caller"), `got:\n${result}`);
            assert.ok(line(result, "remote function onMessage").endsWith("// optional"));
        });

        // ---- §3 identifier ----

        test("§3: a required base path renders a fillable placeholder and says what to replace", () => {
            // Corpus: websocket's upgradeService, graphql and http declare {presence: required,
            // form: [basePath]}. None of it reached the prompt before.
            const result = renderService({
                type: "fixed", name: "UpgradeService", listener: wsListener, methods: [],
                identifier: { presence: "required", form: ["basePath"] },
            });
            assert.ok(result.includes("service websocket:UpgradeService /basePath on new websocket:Listener()"),
                `got:\n${result}`);
            assert.ok(line(result, "# The service identifier").includes("requires a base path"));
            assert.ok(line(result, "# The service identifier").includes("replace `/basePath`"));
        });

        test("§3: an optional identifier is described but not placeheld", () => {
            // Corpus: rabbitmq, smb, websub, mcp declare `optional`. Writing a placeholder would push the
            // model to fill a slot the connector does not need; the note states the option instead.
            const result = renderService({
                type: "fixed", name: "Service", listener: wsListener, methods: [],
                identifier: { presence: "optional", form: ["stringLiteral"] },
            });
            assert.ok(result.includes("service websocket:Service on new websocket:Listener()"),
                `no placeholder expected, got:\n${result}`);
            const note = line(result, "# The service identifier");
            assert.ok(note.includes("accepts a quoted string literal"), note);
            assert.ok(note.includes("may be omitted"), note);
        });

        test("§3: a required string literal renders a quoted placeholder", () => {
            const result = renderService({
                type: "fixed", name: "Service", listener: wsListener, methods: [],
                identifier: { presence: "required", form: ["stringLiteral"] },
            });
            assert.ok(result.includes(`service websocket:Service "identifier" on new`), `got:\n${result}`);
        });

        test("§3: a form outside spec §10's vocabulary is named, not placeheld", () => {
            // §10 enumerates only basePath and stringLiteral. Inventing syntax for an unknown shape would be
            // worse than describing it, and the raw token is kept so the reader can look it up.
            const result = renderService({
                type: "fixed", name: "Service", listener: wsListener, methods: [],
                identifier: { presence: "required", form: ["regexPattern"] },
            });
            assert.ok(line(result, "# The service identifier").includes("form `regexPattern`"));
            assert.ok(result.includes("service websocket:Service on new"), "no invented placeholder");
        });

        test("§3: a service with no identifier renders exactly as before", () => {
            const result = renderService({
                type: "fixed", name: "Service", listener: wsListener, methods: [],
            });
            assert.ok(!result.includes("# The service identifier"), `got:\n${result}`);
            assert.ok(result.includes("service websocket:Service on new websocket:Listener() {"));
        });

        // ---- §6 constraints ----

        test("§6: `oneOf` states an obligation and `atMostOne` states a limit", () => {
            // Spec §6: oneOf is "Exactly one member — not zero"; atMostOne is "zero or one ... but zero is
            // fine". Corpus: rabbitmq's messageHandlerChoice vs websocket's textMessageVsGeneric. Wording
            // them the same would invent an obligation websocket does not impose.
            const oneOf = renderService({
                type: "fixed", name: "Service", listener: wsListener, methods: [],
                constraints: [{ id: "$messageHandlerChoice", rule: "structure.exactlyOne",
                                subjects: [{ kind: "handler", name: "onMessage" },
                                           { kind: "handler", name: "onRequest" }] }],
            });
            assert.ok(oneOf.includes(
                "# Exactly one of the following is required: `onMessage` | `onRequest`."), `got:\n${oneOf}`);

            const atMostOne = renderService({
                type: "fixed", name: "Service", listener: wsListener, methods: [],
                constraints: [{ id: "$textMessageVsGeneric", rule: "structure.atMostOne",
                                subjects: [{ kind: "handler", name: "onMessage" },
                                           { kind: "handler", name: "onTextMessage" }] }],
            });
            assert.ok(atMostOne.includes(
                "# At most one of the following may be used: `onMessage` | `onTextMessage`."),
                `got:\n${atMostOne}`);
        });

        test("§6: the annotationField and identifier subject kinds both render, and `prefer` is stated", () => {
            // Corpus: rabbitmq's queueNameSource — the queueName field of @rabbitmq:ServiceConfig (preferred)
            // versus the service identifier. In v1.0 the preference moved off the member and onto the rule,
            // where it names a role.
            const result = renderService({
                type: "fixed", name: "Service", listener: { name: "rabbitmq:Listener", parameters: [] },
                methods: [],
                constraints: [{ id: "$queueNameSource", rule: "structure.exactlyOne", prefer: "fromAnnotation",
                    subjects: [
                    // `annotation` is the resolved name; `annotationId` is the registry reference and must
                    // never be what the reader is told to write.
                    { kind: "annotationField", annotation: "ServiceConfig", annotationId: "$serviceConfig",
                      path: ["queueName"], role: "fromAnnotation" },
                    { kind: "identifier", role: "fromIdentifier" },
                ] }],
            }, "ballerinax/rabbitmq");
            const note = line(result, "# Exactly one of the following");
            assert.ok(note.includes("the `queueName` field of @rabbitmq:ServiceConfig"), note);
            assert.ok(!note.includes("$serviceConfig"), `the registry id must not be rendered: ${note}`);
            assert.ok(note.includes("the service identifier"), note);
            const prefer = line(result, "# Prefer ");
            assert.ok(prefer.includes("the `queueName` field of @rabbitmq:ServiceConfig"), prefer);
        });

        test("§6: a nested annotationField path renders as a field access, not just its first segment", () => {
            // Spec §6.1 made `path` an array precisely so a nested field is addressable; rendering only
            // `retryConfig` would name a different field from `retryConfig.maxCount`.
            const result = renderService({
                type: "fixed", name: "Service", listener: wsListener, methods: [],
                constraints: [{ rule: "structure.atMostOne", subjects: [
                    { kind: "annotationField", annotation: "ServiceConfig",
                      path: ["retryConfig", "maxCount"] },
                    { kind: "identifier" }] }],
            });
            assert.ok(line(result, "# At most one of the following")
                .includes("the `retryConfig.maxCount` field of @websocket:ServiceConfig"), result);
        });

        test("§6: the document's own message wins over the synthesized sentence", () => {
            // The authored message says WHY the constraint exists, which nothing reconstructible from the
            // subjects can match.
            const result = renderService({
                type: "fixed", name: "Service", listener: wsListener, methods: [],
                constraints: [{ rule: "structure.exactlyOne",
                    message: "A RabbitMQ consumer needs its queue name from exactly one source.",
                    subjects: [{ kind: "handler", name: "onMessage" },
                               { kind: "handler", name: "onRequest" }] }],
            });
            assert.ok(result.includes(
                "# A RabbitMQ consumer needs its queue name from exactly one source."), result);
            assert.ok(!result.includes("# Exactly one of the following"),
                `the synthesized sentence must not also appear:\n${result}`);
        });

        test("§6: an asymmetric rule states its direction rather than a choice", () => {
            // A " | "-joined list would read as a choice between the two, which is the opposite of an
            // implication.
            const requires = renderService({
                type: "fixed", name: "Service", listener: wsListener, methods: [],
                constraints: [{ rule: "structure.requires", subjects: [
                    { kind: "param", handler: "onMessage", name: "batchSize", role: "when" },
                    { kind: "annotationField", annotation: "ServiceConfig", path: ["mode"], role: "then" }] }],
            });
            assert.ok(requires.includes("If you use `onMessage`'s `batchSize` parameter, you must also use"),
                requires);

            const conflicts = renderService({
                type: "fixed", name: "Service", listener: wsListener, methods: [],
                constraints: [{ rule: "structure.conflictsWith", subjects: [
                    { kind: "handler", name: "onMessage", role: "when" },
                    { kind: "handler", name: "onTextMessage", role: "then" }] }],
            });
            assert.ok(conflicts.includes("If you use `onMessage`, you must NOT use `onTextMessage`."),
                conflicts);
        });

        test("§6: atLeastOne and allOrNone are worded as their own obligations", () => {
            // smb's atLeastOne is a real corpus instance; collapsing it onto exactlyOne would forbid
            // declaring two file handlers, which smb explicitly allows.
            const atLeastOne = renderService({
                type: "fixed", name: "Service", listener: wsListener, methods: [],
                constraints: [{ rule: "structure.atLeastOne", subjects: [
                    { kind: "handler", name: "onFileJson" }, { kind: "handler", name: "onFileCsv" }] }],
            });
            assert.ok(atLeastOne.includes("# At least one of the following is required"), atLeastOne);

            const allOrNone = renderService({
                type: "fixed", name: "Service", listener: wsListener, methods: [],
                constraints: [{ rule: "structure.allOrNone", subjects: [
                    { kind: "handler", name: "onOpen" }, { kind: "handler", name: "onClose" }] }],
            });
            assert.ok(allOrNone.includes("# Use all of the following together, or none of them"), allOrNone);
        });

        test("§6: an unrecognised rule id renders nothing rather than a note that cannot say what it means", () => {
            // Spec §6 requires an unknown id be skipped. A note with no wording would be worse than silence.
            const result = renderService({
                type: "fixed", name: "Service", listener: wsListener, methods: [],
                constraints: [{ rule: "structure.someFutureThing", subjects: [
                    { kind: "handler", name: "onMessage" }, { kind: "handler", name: "onRequest" }] }],
            });
            assert.ok(!result.split("\n").some((l) => l.startsWith("# ") && l.includes("onMessage")),
                `an unimplemented rule must render no note:\n${result}`);
        });

        test("§6: constraint lines precede the service declaration and the identifier note precedes them", () => {
            // A constraint may name the identifier as one of its alternatives, so the slot has to be
            // described first for the constraint line to make sense.
            const result = renderService({
                type: "fixed", name: "Service", listener: wsListener, methods: [],
                identifier: { presence: "optional", form: ["stringLiteral"] },
                constraints: [{ rule: "structure.exactlyOne", subjects: [
                    { kind: "annotationField", annotation: "ServiceConfig", path: ["queueName"] },
                    { kind: "identifier" }] }],
            });
            const lines = result.split("\n");
            const identifierAt = lines.findIndex((l) => l.startsWith("# The service identifier"));
            const constraintAt = lines.findIndex((l) => l.startsWith("# Exactly one of"));
            const serviceAt = lines.findIndex((l) => l.startsWith("service websocket:Service"));
            assert.ok(identifierAt >= 0 && constraintAt > identifierAt && serviceAt > constraintAt,
                `order was ${identifierAt}/${constraintAt}/${serviceAt}:\n${result}`);
        });

        test("§6: a subject naming nothing is skipped, and an empty rule renders nothing", () => {
            const result = renderService({
                type: "fixed", name: "Service", listener: wsListener, methods: [],
                constraints: [{ rule: "structure.exactlyOne",
                                subjects: [{ kind: "handler" }, { kind: "handler", name: "onMessage" }] },
                              { rule: "structure.exactlyOne", subjects: [] }],
            });
            const notes = result.split("\n").filter((l) => l.startsWith("# Exactly one of"));
            assert.strictEqual(notes.length, 1, `got:\n${result}`);
            assert.ok(notes[0].endsWith("required: `onMessage`."), notes[0]);
        });

        test("general rule: a service declaring none of the new constructs renders exactly as before", () => {
            const result = renderService({
                type: "fixed", name: "Service", listener: wsListener,
                methods: [method({ name: "onOpen", parameters: [] })],
            });
            assert.strictEqual(result.split("\n").filter((l) => l.startsWith("#")).length, 0,
                `no notes expected:\n${result}`);
            assert.ok(result.includes("    remote function onOpen() returns error?;"), `got:\n${result}`);
        });
    });

    suite("Trigger spec §7/§8/§9 — alternatives, non-service annotations and data binding", () => {
        function renderService(service: Record<string, unknown>, libName = "ballerinax/kafka"): string {
            const lib = {
                name: libName, description: "", typeDefs: [], clients: [], services: [service],
            } as unknown as Library;
            return toSyntaxString([lib]);
        }

        const kafkaListener = { name: "kafka:Listener", parameters: [] };

        function service(methods: Record<string, unknown>[],
                         over: Record<string, unknown> = {}): Record<string, unknown> {
            return { type: "fixed", name: "Service", listener: kafkaListener, methods, ...over };
        }

        function method(over: Record<string, unknown> = {}): Record<string, unknown> {
            return {
                name: "onConsumerRecord", type: "remote",
                parameters: [], return: { type: { name: "error?" } }, ...over,
            };
        }

        function line(result: string, needle: string): string {
            const found = result.split("\n").find((l) => l.includes(needle));
            assert.ok(found, `no line containing "${needle}" in:\n${result}`);
            return found!;
        }

        function noLine(result: string, needle: string): void {
            assert.ok(!result.includes(needle),
                `unexpected line containing "${needle}" in:\n${result}`);
        }

        // ---- §7 alternatives ----

        test("§7: a union slot renders its other members as a note, never joined with `|`", () => {
            // §1: "Unions are an array of TypeRef, first element = codegen default"; §7: `type` "restates
            // the full static surface for this slot". A `|`-joined type would declare a union-typed
            // parameter, which is a different contract.
            // Corpus: kafka's onConsumerRecord — AnydataConsumerRecord[] then BytesConsumerRecord[].
            const result = renderService(service([method({
                parameters: [{
                    name: "consumerRecords", description: "",
                    type: { name: "AnydataConsumerRecord[]" },
                    alternatives: [{ name: "BytesConsumerRecord[]" }],
                }],
            })]));

            assert.ok(line(result, "may also be").includes(
                "# `consumerRecords` may also be: BytesConsumerRecord[]"), `got:\n${result}`);
            assert.ok(result.includes(
                "remote function onConsumerRecord(AnydataConsumerRecord[] consumerRecords)"),
                "the signature keeps the codegen default alone");
            noLine(result, "AnydataConsumerRecord[]|BytesConsumerRecord[]");
        });

        test("§7: several alternatives are listed in document order, comma-separated", () => {
            const result = renderService(service([method({
                parameters: [{
                    name: "content", description: "", type: { name: "string[][]" },
                    alternatives: [{ name: "record {}[]" }, { name: "stream<string[], error?>" }],
                }],
            })]));
            assert.strictEqual(line(result, "may also be").trim(),
                "# `content` may also be: record {}[], stream<string[], error?>");
        });

        test("§7: a cross-module alternative carries its own prefix", () => {
            const result = renderService(service([method({
                parameters: [{
                    name: "data", description: "", type: { name: "Request" },
                    alternatives: [{
                        name: "Headers",
                        links: [{ category: "external", recordName: "Headers",
                            libraryName: "ballerina/http" }],
                    }],
                }],
            })]));
            assert.ok(line(result, "may also be").includes("http:Headers"), `got:\n${result}`);
        });

        test("§7: a scalar slot states no alternatives", () => {
            const result = renderService(service([method({
                parameters: [{ name: "err", description: "", type: { name: "Error" } }],
            })]));
            noLine(result, "may also be");
        });

        // ---- §9 data binding ----

        test("§9: a bare shape states the legal target and `excludes` states the prohibition", () => {
            // §9: `bare` | "T stands alone. The declared type is the bound type, no wrapping." `excludes`
            // is a negative constraint, derivable from nothing else.
            // Corpus: kafka binds any anydata EXCEPT its own envelope.
            const result = renderService(service([method({
                parameters: [{
                    name: "records", description: "",
                    type: { name: "AnydataConsumerRecord[]" },
                    binding: {
                        typedescs: [{
                            constraint: { name: "anydata" },
                            excludes: [{ name: "AnydataConsumerRecord" }],
                            shapes: [{ form: "bare" }],
                        }],
                    },
                }],
            })]));

            assert.strictEqual(line(result, "may bind directly").trim(),
                "# `records` may bind directly to: anydata — but never AnydataConsumerRecord");
        });

        test("§9: an included shape names the envelope and states which fields may be overridden", () => {
            // §9: `included` | "The user record does `*envelope;` and retypes only `bindableFields`.
            // Everything else stays fixed." The prohibition is the load-bearing half: naming the bindable
            // field does not by itself say the others are pinned.
            const result = renderService(service([method({
                parameters: [{
                    name: "message", description: "",
                    type: { name: "AnydataMessage" },
                    binding: {
                        typedescs: [{
                            constraint: { name: "anydata" },
                            shapes: [{
                                form: "included",
                                envelope: { name: "AnydataMessage" },
                                bindableFields: ["content"],
                                fixedFields: ["routingKey", "exchange"],
                            }],
                        }],
                    },
                }],
            })], { listener: { name: "rabbitmq:Listener", parameters: [] } }), "ballerinax/rabbitmq");

            assert.strictEqual(line(result, "includes").trim(),
                "# `message` may bind to a record that includes "
                + "`*rabbitmq:AnydataMessage;` and overrides only `content`");
        });

        test("§9: the envelope inclusion carries the module alias, because the user writes it", () => {
            // `*AnydataMessage;` in a user's own module does not resolve. The same rule the §8 attachment
            // lines follow: syntax the reader writes is qualified.
            const result = renderService(service([method({
                parameters: [{
                    name: "message", description: "", type: { name: "AnydataMessage" },
                    binding: {
                        typedescs: [{ constraint: { name: "anydata" }, shapes: [{ form: "included",
                            envelope: { name: "AnydataMessage" }, bindableFields: ["content"] }] }],
                    },
                }],
            })], { listener: { name: "rabbitmq:Listener", parameters: [] } }), "ballerinax/rabbitmq");
            assert.ok(result.includes("`*rabbitmq:AnydataMessage;`"), `got:\n${result}`);
        });

        test("§9: a stream shape names its completion type, because stream<T> is a different type", () => {
            // ftp's CSV rows, streamed. `stream<T>` and `stream<T, error?>` are not interchangeable, so a
            // note omitting the completion type describes something the reader cannot write.
            const result = renderService(service([method({
                parameters: [{
                    name: "contents", description: "", type: { name: "string[][]" },
                    binding: {
                        typedescs: [{
                            constraint: { name: "string[]" },
                            shapes: [{ form: "stream", element: "bare",
                                       completionType: { name: "error?" } }],
                        }],
                    },
                }],
            })]));
            assert.strictEqual(line(result, "may bind to a stream").trim(),
                "# `contents` may bind to a stream: stream<string[], error?>");
        });

        test("§9: an array shape says the bound type is the ELEMENT, not the whole parameter", () => {
            // The parameter is already an array. Pluralizing the bound type as well would describe an
            // array of arrays.
            const result = renderService(service([method({
                parameters: [{
                    name: "records", description: "", type: { name: "AnydataConsumerRecord[]" },
                    binding: {
                        typedescs: [{ constraint: { name: "anydata" },
                                      shapes: [{ form: "array", element: "bare" }] }],
                    },
                }],
            })]));
            assert.strictEqual(line(result, "may bind to a batch").trim(),
                "# `records` may bind to a batch: anydata[]");
        });

        test("§9: an array of included elements says an array of records — kafka's real shape", () => {
            // The case the old rule-level `cardinality` flag could not express: batched AND
            // envelope-including per element. Leaving the plurality to the reader costs a compile error.
            const result = renderService(service([method({
                parameters: [{
                    name: "records", description: "", type: { name: "AnydataConsumerRecord[]" },
                    binding: {
                        typedescs: [{
                            constraint: { name: "anydata" },
                            shapes: [{ form: "array", element: "included",
                                       envelope: { name: "AnydataConsumerRecord" },
                                       bindableFields: ["value"] }],
                        }],
                    },
                }],
            })]));
            assert.strictEqual(line(result, "an array of records").trim(),
                "# `records` may bind to an array of records that include "
                + "`*kafka:AnydataConsumerRecord;` and override only `value`");
        });

        test("§9: two variants over the same bound both render — they are alternatives, not duplicates", () => {
            // kafka's real binding. Emitting only one of them would delete half the projection surface.
            const result = renderService(service([method({
                parameters: [{
                    name: "records", description: "", type: { name: "AnydataConsumerRecord[]" },
                    binding: {
                        typedescs: [
                            { constraint: { name: "anydata" },
                              excludes: [{ name: "AnydataConsumerRecord" }],
                              shapes: [{ form: "array", element: "bare" }] },
                            { constraint: { name: "anydata" },
                              shapes: [{ form: "array", element: "included",
                                         envelope: { name: "AnydataConsumerRecord" },
                                         bindableFields: ["value"] }] },
                        ],
                    },
                }],
            })]));
            assert.ok(result.includes("may bind to a batch: anydata[] — but never AnydataConsumerRecord"),
                `got:\n${result}`);
            assert.ok(result.includes("an array of records that include `*kafka:AnydataConsumerRecord;`"),
                `got:\n${result}`);
        });

        test("§9: suppression never hides `excludes`", () => {
            // A prohibition is derivable from nothing else, so it survives even when every positive member
            // is already visible in the signature.
            const result = renderService(service([method({
                parameters: [{
                    name: "content", description: "", type: { name: "anydata" },
                    binding: {
                        typedescs: [{ constraint: { name: "anydata" },
                                      excludes: [{ name: "AnydataMessage" }],
                                      shapes: [{ form: "bare" }] }],
                    },
                }],
            })]));
            assert.ok(result.includes("but never AnydataMessage"), `got:\n${result}`);
        });

        test("§8 function: a required handler annotation states the obligation and the attachment", () => {
            // Corpus: smb's functionConfig is `presence: "required"` — generated smb handlers may not work
            // without it, and it reached the prompt nowhere before.
            const result = renderService(service([method({
                name: "onFileChange",
                annotationRefs: [{
                    name: "FunctionConfig", presence: "required", attachPoint: "function",
                    typeConstraint: { name: "FunctionConfiguration" },
                }],
            })], { listener: { name: "smb:Listener", parameters: [] } }), "ballerina/smb");

            assert.ok(result.includes(
                "    # Mandatory: this handler must carry the @smb:FunctionConfig annotation."
                + " Replace {...} with its fields, which are those of FunctionConfiguration."),
                `got:\n${result}`);
            assert.ok(result.includes("    @smb:FunctionConfig {...} // required"), `got:\n${result}`);
        });

        test("§8 function: an optional handler annotation is marked optional", () => {
            // Corpus: ftp declares the optional counterpart on all eight of its handlers.
            const result = renderService(service([method({
                annotationRefs: [{ name: "FunctionConfig", presence: "optional",
                    attachPoint: "function" }],
            })], { listener: { name: "ftp:Listener", parameters: [] } }), "ballerina/ftp");
            assert.ok(result.includes("    @ftp:FunctionConfig {...} // optional"), `got:\n${result}`);
            assert.ok(result.includes("may carry the @ftp:FunctionConfig"), `got:\n${result}`);
        });

        test("§8: two annotations at one scope emit both notes before either attachment", () => {
            // Ballerina metadata requires every `#` line to precede every annotation. Emitting
            // note-then-attachment per annotation puts a `#` line after an `@` as soon as a construct
            // carries two, which the compiler rejects with "missing close bracket token". No corpus
            // document does this today; the hazard is one document away.
            const result = renderService(service([method({
                annotationRefs: [
                    { name: "First", presence: "required", attachPoint: "function" },
                    { name: "Second", presence: "optional", attachPoint: "function" },
                ],
            })]));
            const lines = result.split("\n").map((l) => l.trim());
            const lastNote = Math.max(lines.findIndex((l) => l.startsWith("# Mandatory: this handler")),
                lines.findIndex((l) => l.startsWith("# Optional: this handler")));
            const firstAttachment = Math.min(lines.findIndex((l) => l.startsWith("@kafka:First")),
                lines.findIndex((l) => l.startsWith("@kafka:Second")));
            assert.ok(lastNote < firstAttachment,
                `every # line must precede every @ line:\n${result}`);
        });

        test("§8 function: the obligation block sits after the notes and before @deprecated", () => {
            // Ballerina metadata puts every `#` line ahead of every annotation.
            const result = renderService(service([method({
                isDeprecated: true,
                parameters: [{ name: "x", description: "", type: { name: "int" },
                    alternatives: [{ name: "string" }] }],
                annotationRefs: [{ name: "FunctionConfig", presence: "optional",
                    attachPoint: "function" }],
            })]));
            const lines = result.split("\n").map((l) => l.trim());
            const note = lines.findIndex((l) => l.startsWith("# `x` may also be"));
            const obligation = lines.findIndex((l) => l.startsWith("# Optional: this handler"));
            const attachment = lines.findIndex((l) => l.startsWith("@kafka:FunctionConfig"));
            const deprecated = lines.findIndex((l) => l === "@deprecated");
            const signature = lines.findIndex((l) => l.startsWith("remote function"));

            assert.ok(note < obligation && obligation < attachment, `got:\n${result}`);
            assert.ok(attachment < deprecated && deprecated < signature, `got:\n${result}`);
        });

        test("§8 parameter: an OPTIONAL annotation is described, never written into the signature", () => {
            // The signature is copied as one unit, and an inline attachment cannot carry a `// optional`
            // marker — a comment inside a parameter list would comment out the closing paren. Writing an
            // optional annotation there would therefore read as mandatory. Same policy renderIdentifierSlot
            // applies to an optional identifier.
            // Corpus: rabbitmq's payload parameter, the only observable instance.
            const result = renderService(service([method({
                name: "onMessage",
                parameters: [{
                    name: "message", description: "", type: { name: "AnydataMessage" },
                    annotationRefs: [{
                        name: "Payload", presence: "optional", attachPoint: "parameter",
                        typeConstraint: { name: "RabbitmqPayload" },
                    }],
                }],
            })], { listener: { name: "rabbitmq:Listener", parameters: [] } }), "ballerinax/rabbitmq");

            assert.ok(result.includes("remote function onMessage(AnydataMessage message)"),
                `the signature stays copyable:\n${result}`);
            assert.ok(result.includes(
                "    # The `message` parameter may carry @rabbitmq:Payload, written"
                + " `@rabbitmq:Payload {}` before its type. Its fields are those of RabbitmqPayload."),
                `got:\n${result}`);
            const signature = line(result, "remote function onMessage");
            assert.ok(!signature.includes("//"),
                `a comment inside a parameter list breaks the line: ${signature}`);
        });

        test("§8 parameter: a REQUIRED annotation is written inline as `{}`, never `{...}`", () => {
            // Verified against the compiler: `@X {}` compiles; `@X {...}` fails with "incompatible types:
            // expected a map or a record, found 'other'" plus "missing expression". `{...}` is a template
            // marker, and a signature is not a place a template marker can survive.
            const result = renderService(service([method({
                name: "onMessage",
                parameters: [{
                    name: "message", description: "", type: { name: "AnydataMessage" },
                    annotationRefs: [{
                        name: "Payload", presence: "required", attachPoint: "parameter",
                        typeConstraint: { name: "RabbitmqPayload" },
                    }],
                }],
            })], { listener: { name: "rabbitmq:Listener", parameters: [] } }), "ballerinax/rabbitmq");

            assert.ok(result.includes(
                "remote function onMessage(@rabbitmq:Payload {} AnydataMessage message)"),
                `got:\n${result}`);
            assert.ok(!result.includes("{...} AnydataMessage"), `never the template marker:\n${result}`);
            assert.ok(line(result, "parameter must carry").includes("fill the `{}`"), `got:\n${result}`);
        });

        test("§8 parameter: a cross-module annotation carries its own prefix and provenance", () => {
            // Corpus: mcp's httpHeader names ballerina/http's Header.
            const result = renderService(service([method({
                parameters: [{
                    name: "header", description: "", type: { name: "string" },
                    annotationRefs: [{ name: "Header", module: "ballerina/http", presence: "optional",
                        attachPoint: "parameter" }],
                }],
            })]));
            assert.ok(line(result, "parameter may carry").includes("@http:Header"), `got:\n${result}`);
            assert.ok(line(result, "parameter may carry").includes("FROM ballerina/http package"),
                `got:\n${result}`);
        });

        test("§8 return: only a required annotation is written into the return slot", () => {
            // `returns @X {} T` compiles; `returns @X {...} T` does not. The corpus's only return-scope
            // annotation (http's `cache`) is optional AND http never reaches this pipeline, so the
            // required branch is exercised here or nowhere.
            const optional = renderService(service([method({
                return: {
                    type: { name: "error?" },
                    annotationRefs: [{ name: "Cache", presence: "optional", attachPoint: "return" }],
                },
            })]));
            assert.ok(optional.includes("returns error?;"), `got:\n${optional}`);
            assert.ok(!optional.includes("returns @kafka:Cache"),
                `an optional one is not applied:\n${optional}`);
            // ...but it must still be stated somewhere, or the attach point is advertised and silent.
            assert.ok(optional.includes(
                "    # The return may carry @kafka:Cache, written `@kafka:Cache {}` in the `returns`"
                + " clause."), `got:\n${optional}`);

            const required = renderService(service([method({
                return: {
                    type: { name: "error?" },
                    annotationRefs: [{ name: "Cache", presence: "required", attachPoint: "return" }],
                },
            })]));
            assert.ok(required.includes("returns @kafka:Cache {} error?;"), `got:\n${required}`);
        });

        test("general rule: a handler declaring none of the new constructs renders exactly as before", () => {
            const result = renderService(service([method({
                name: "onError",
                parameters: [{ name: "kafkaError", description: "", type: { name: "Error" } }],
            })]));
            assert.ok(result.includes("    remote function onError(Error kafkaError) returns error?;"),
                `got:\n${result}`);
            for (const marker of ["may also be", "may bind", "binds a batch", "must carry", "may carry"]) {
                noLine(result, marker);
            }
        });

        // ---- §3 cardinality ----

        test("§3: only a prohibition is stated; a permissive cardinality renders nothing", () => {
            // The permissive value changes no output a generator would otherwise produce — one service on
            // one listener is legal either way — so it must not spend a line saying so.
            const permissive = renderService(service([method()]));
            noLine(permissive, "exactly one listener");
            noLine(permissive, "at most one service");
        });

        test("§3: the two cardinality prohibitions are independent lines", () => {
            // kafka is the only corpus service type where both fire; trigger.google.calendar fires only
            // the second. One merged sentence would state something false for the latter.
            const both = renderService(service([method()],
                { singleListenerOnly: true, singleServicePerListenerOnly: true }));
            assert.ok(both.includes(
                "# This service type attaches to exactly one listener — do not write `on l1, l2`."),
                `got:\n${both}`);
            assert.ok(both.includes("# This listener hosts at most one service of this type;"),
                `got:\n${both}`);

            const onlySecond = renderService(service([method()],
                { singleServicePerListenerOnly: true }));
            noLine(onlySecond, "exactly one listener");
            assert.ok(onlySecond.includes("# This listener hosts at most one service of this type;"),
                `got:\n${onlySecond}`);
        });

        // ---- §3 alternatives ----

        test("§3: the alternatives note is emitted once per library, not once per service", () => {
            // The claim is about the *set* of service types, so repeating it per entry says nothing
            // extra — trigger.github would otherwise carry ten identical copies.
            const lib = {
                name: "ballerinax/trigger.github", description: "", typeDefs: [], clients: [],
                services: [
                    service([method()], { name: "IssuesService", alternatives: true }),
                    service([method()], { name: "PushService", alternatives: true }),
                    service([method()], { name: "LabelService", alternatives: true }),
                ],
            } as unknown as Library;
            const result = toSyntaxString([lib]);
            const occurrences = result.split("Each is individually optional").length - 1;
            assert.strictEqual(occurrences, 1, `expected exactly one note, got:\n${result}`);
            assert.ok(result.includes("// This library declares 3 service types."), `got:\n${result}`);
        });

        test("§3: alternatives never claims mutual exclusivity", () => {
            // §3 says "each individually optional, choice left to whatever supplied the generation
            // intent" — there is no "at least one of N" rule. websocket is the counter-example that
            // makes this load-bearing: its UpgradeService handler *returns* its Service, so both are
            // routinely declared together.
            const lib = {
                name: "ballerina/websocket", description: "", typeDefs: [], clients: [],
                services: [
                    service([method()], { name: "UpgradeService", alternatives: true }),
                    service([method()], { name: "Service", alternatives: true }),
                ],
            } as unknown as Library;
            const result = toSyntaxString([lib]);
            for (const forbidden of ["exactly one", "only one of", "do not declare all"]) {
                noLine(result, forbidden);
            }
            assert.ok(result.includes("declare the ones the requirement needs, not all of them."),
                `got:\n${result}`);
        });

        test("§3: a sole service type states nothing about alternatives", () => {
            const result = renderService(service([method()]));
            noLine(result, "service types");
        });

        // ---- §7 repeatable ----

        test("§7: a repeatable slot is kept out of the signature and stated as a note", () => {
            // "each occurrence independently named/typed" — the document states no name, so writing one
            // would invent a parameter in a signature meant to be copied.
            const result = renderService(service([method({
                parameters: [
                    { name: "meta", description: "", type: { name: "ToolMeta" } },
                    { description: "", type: { name: "string" }, optional: true, repeatable: true },
                ],
            })]));
            assert.ok(result.includes("remote function onConsumerRecord(ToolMeta meta)"),
                `the repeatable slot must not reach the signature:\n${result}`);
            assert.ok(result.includes(
                "# Zero or more further parameters of type string may be added, each independently named."),
                `got:\n${result}`);
        });

        test("§7: a repeatable slot is not listed among the omittable parameters", () => {
            // It is not in the signature at all, so "may be omitted" would point at nothing.
            const result = renderService(service([method({
                parameters: [
                    { description: "", type: { name: "string" }, optional: true, repeatable: true },
                ],
            })]));
            noLine(result, "Optional parameters");
        });

        test("§7: a repeatable slot states its whole type surface in one note", () => {
            // mcp's shape: string|int|boolean|decimal|float. The alternatives note is suppressed for it,
            // because splitting one fact across two notes would imply the slot is in the signature.
            const result = renderService(service([method({
                parameters: [{
                    description: "", type: { name: "string" }, optional: true, repeatable: true,
                    alternatives: [{ name: "int" }, { name: "boolean" }],
                }],
            })]));
            assert.ok(result.includes("of type string (or int, boolean) may be added"), `got:\n${result}`);
            noLine(result, "may also be");
        });

        test("§7: an unnamed repeatable slot never renders `undefined`", () => {
            const result = renderService(service([method({
                parameters: [{
                    description: "", type: { name: "string" }, optional: true, repeatable: true,
                    annotationRefs: [{
                        name: "Header", module: "ballerina/http", presence: "optional",
                        attachPoint: "parameter",
                    }],
                }],
            })]));
            noLine(result, "undefined");
            assert.ok(result.includes("# Each repeated `string` parameter may carry @http:Header"),
                `got:\n${result}`);
        });

        // ---- §4 handler template ----

        test("§4: an open-ended catalog renders a fully commented template", () => {
            // §11.1: such a handler "cannot yield a compilable signature", so nothing here may be live
            // code. A `#` line would not even parse inside an otherwise empty service body — verified:
            // "ERROR documentation not attached to a construct".
            const result = renderService(service([], {
                methods: undefined,
                handlerTemplates: [{
                    name: "*", type: "remote",
                    parameters: [{
                        name: "session", description: "",
                        type: { name: "Session", links: [{ category: "internal", recordName: "Session" }] },
                        optional: true,
                    }],
                    return: { type: { name: "anydata|error" } },
                }],
            }));
            const body = result.split("\n").filter((l) => l.trim().startsWith("//")
                && l.startsWith("    "));
            assert.ok(body.length > 0, `expected a commented template, got:\n${result}`);
            assert.ok(result.includes(
                "    // remote function <handlerName>(kafka:Session session) returns anydata|error;"),
                `the type is qualified for the user's module:\n${result}`);
            noLine(result, "    remote function <handlerName>");
        });

        test("§4: the template's annotation uses `{}`, never `{...}`", () => {
            // The two lines a reader copies must uncomment to compilable Ballerina. `{...}` is not an
            // expression — verified: "incompatible types: expected a map or a record, found 'other'".
            const result = renderService(service([], {
                methods: undefined,
                handlerTemplates: [{
                    name: "*", type: "remote", parameters: [],
                    return: { type: { name: "anydata|error" } },
                    annotationRefs: [{ name: "Tool", presence: "optional", attachPoint: "function" }],
                }],
            }));
            assert.ok(result.includes("    // @kafka:Tool {} // optional"), `got:\n${result}`);
            noLine(result, "{...}");
        });

        test("§8: a repeatable slot's annotation note names which slot it means", () => {
            // mcp's streamable template has TWO repeatable slots and only the string-union one carries
            // @http:Header. "Each repeated parameter" reads as applying to both, and taken at its word on
            // the anydata slot the compiler rejects it: "Invalid type of header param … expected one of
            // the string, int, float, decimal, boolean types".
            const result = renderService(service([method({
                parameters: [
                    { description: "", type: { name: "anydata" }, optional: true, repeatable: true },
                    {
                        description: "", type: { name: "string" }, optional: true, repeatable: true,
                        annotationRefs: [{
                            name: "Header", module: "ballerina/http", presence: "optional",
                            attachPoint: "parameter",
                        }],
                    },
                ],
            })]));
            assert.ok(result.includes("# Each repeated `string` parameter may carry @http:Header"),
                `the note must name the slot it applies to:\n${result}`);
            noLine(result, "# Each repeated parameter may carry");
        });

        test("§4: a resource template's author-chosen slot is the path, not a name placeholder", () => {
            // A resource handler's path is what a remote handler's name is. Emitting both would produce
            // `resource function get pathSegment <handlerName>(...)`, which is not a signature.
            const result = renderService(service([], {
                methods: undefined,
                handlerTemplates: [{
                    name: "*", type: "resource", accessor: "get", parameters: [],
                    return: { type: { name: "anydata|error" } },
                }],
            }));
            assert.ok(result.includes("    // resource function get pathSegment() returns anydata|error;"),
                `got:\n${result}`);
            noLine(result, "pathSegment <handlerName>");
        });

        test("§4: a resource template with no accessor never invents one", () => {
            // The same policy renderMethodSignature applies: inventing `get` would be inventing API.
            const result = renderService(service([], {
                methods: undefined,
                handlerTemplates: [{
                    name: "*", type: "resource", parameters: [],
                    return: { type: { name: "anydata|error" } },
                }],
            }));
            assert.ok(result.includes("    // remote function <handlerName>() returns anydata|error;"),
                `got:\n${result}`);
            noLine(result, "resource function");
        });

        test("§4: a fixed vocabulary renders no template", () => {
            const result = renderService(service([method()]));
            noLine(result, "<handlerName>");
            noLine(result, "you choose each one's name");
        });

        test("§4: every open-ended shape is rendered, not just the first", () => {
            // graphql's real shape: three "*" entries — a query (resource/get), a mutation (remote) and a
            // subscription (resource/subscribe, returning a stream). They differ in kind, accessor and
            // return, so no one of them stands for the others. Rendering only the first deleted two thirds
            // of the connector's handler surface.
            const result = renderService(service([], {
                methods: undefined,
                handlerTemplates: [
                    {
                        name: "*", type: "resource", accessor: "get", parameters: [],
                        accessorValues: ["get"], accessorRequired: true, pathRequired: true,
                        return: { type: { name: "anydata|error" } },
                    },
                    {
                        name: "*", type: "remote", parameters: [],
                        return: { type: { name: "anydata|error" } },
                    },
                    {
                        name: "*", type: "resource", accessor: "subscribe", parameters: [],
                        accessorValues: ["subscribe"], accessorRequired: true, pathRequired: true,
                        return: { type: { name: "stream<anydata, error?>" } },
                    },
                ],
            }));
            assert.ok(result.includes("each following one of these 3 shapes:"),
                `the preamble must state how many shapes there are:\n${result}`);
            assert.ok(result.includes("// Shape 1 of 3:"), `got:\n${result}`);
            assert.ok(result.includes("// Shape 3 of 3:"), `got:\n${result}`);
            assert.ok(result.includes(
                "    // resource function get pathSegment() returns anydata|error;"),
                `the query shape:\n${result}`);
            assert.ok(result.includes(
                "    // remote function <handlerName>() returns anydata|error;"),
                `the mutation shape — remote, so it takes the name placeholder:\n${result}`);
            assert.ok(result.includes(
                "    // resource function subscribe pathSegment() returns stream<anydata, error?>;"),
                `the subscription shape:\n${result}`);
            // What tells the three apart is now the kind/accessor pair itself rather than a separate
            // `graphqlOperation` label — a query is `resource get`, a subscription is `resource
            // subscribe`, a mutation is `remote`. The three signatures asserted above already carry that,
            // and the accessor notes below say which values each slot admits.
            assert.ok(result.includes("// Resource: the accessor must be one of `get`;"),
                `the query shape's accessor note:\n${result}`);
            assert.ok(result.includes("// Resource: the accessor must be one of `subscribe`;"),
                `the subscription shape's accessor note:\n${result}`);
            // The mutation declares neither slot, so it must state neither — and above all must not be
            // labelled a resource directly above the `remote function` line describing it.
            assert.ok(!result.includes("// Handler: the accessor"),
                `a remote shape declares no accessor, so it states none:\n${result}`);
        });

        test("curated guidance is emitted above the synthesized declaration, not instead of it", () => {
            // The hybrid contract. Before this, a curated `service.md` REPLACED the whole metadata-derived
            // entry: ballerina/http and ballerina/graphql both declare `type.name = "Service"` and both have
            // a curated entry of that name, so their entire trigger-metadata documents rendered nothing.
            // Both halves must now appear, and in this order — prose frames, synthesis specifies.
            const result = renderService(service([method()], {
                instructions: "# Service writing instructions\n\n- Declare the listener at module level.",
            }));
            const guidanceAt = result.indexOf("// --- Service writing guidance ---");
            const declarationAt = result.indexOf("service kafka:Service on new");
            assert.ok(guidanceAt >= 0, `the curated block must render:\n${result}`);
            assert.ok(declarationAt >= 0, `the synthesized declaration must render:\n${result}`);
            assert.ok(guidanceAt < declarationAt,
                `guidance must precede the declaration it frames:\n${result}`);
            assert.ok(result.includes("- Declare the listener at module level."),
                `the markdown is emitted verbatim:\n${result}`);
        });

        test("curated guidance is raw markdown, never `#` documentation", () => {
            // `#`-prefixing would attach a multi-kilobyte block with fenced code samples to the service
            // declaration as its doc comment — legal, but unreadable, and it would sit ahead of the service's
            // own `#` notes. This is the same raw form renderGenericService has always used.
            const result = renderService(service([method()], {
                instructions: "- Always declare the listener at module level.",
            }));
            assert.ok(result.includes("\n- Always declare the listener at module level."),
                `got:\n${result}`);
            noLine(result, "# - Always declare the listener");
        });

        test("a service with no curated guidance renders exactly as before", () => {
            // Every library but http and graphql. The overwhelmingly common path must be untouched.
            const result = renderService(service([method()]));
            noLine(result, "--- Service writing guidance ---");
        });

        test("blank curated guidance emits nothing rather than an empty heading", () => {
            const result = renderService(service([method()], { instructions: "   \n  " }));
            noLine(result, "--- Service writing guidance ---");
        });

        test("§7: presence is stated from both sides once anything is optional", () => {
            // Naming only the omittable slots leaves the obligation to be inferred from absence, and that
            // inference is where a generator guesses wrong beside a multi-parameter signature.
            const result = renderService(service([method({
                parameters: [
                    { name: "records", description: "", type: { name: "Record" }, optional: false },
                    { name: "caller", description: "", type: { name: "Caller" }, optional: true },
                ],
            })]));
            assert.ok(result.includes("# Required parameters: records"), `got:\n${result}`);
            assert.ok(result.includes("# Optional parameters (may be omitted): caller"), `got:\n${result}`);
            // Order: what must be there before what need not be.
            assert.ok(result.indexOf("# Required parameters:") < result.indexOf("# Optional parameters"),
                `got:\n${result}`);
        });

        test("§7: a signature with nothing mandatory says so outright", () => {
            // ballerina/http's shape: four parameters, none of them required. "May be omitted: caller,
            // request, headers, payload" reads as a list of caveats when it means the whole parameter list
            // is optional, so the empty category is stated rather than left to be noticed.
            const result = renderService(service([method({
                parameters: [
                    { name: "caller", description: "", type: { name: "Caller" }, optional: true },
                    { name: "request", description: "", type: { name: "Request" }, optional: true },
                ],
            })]));
            assert.ok(result.includes(
                "# Required parameters: none — every parameter in the signature may be omitted."),
                `got:\n${result}`);
            assert.ok(result.includes("# Optional parameters (may be omitted): caller, request"),
                `got:\n${result}`);
        });

        test("§7: an all-required signature still states nothing — `required` is the default", () => {
            const result = renderService(service([method({
                parameters: [
                    { name: "records", description: "", type: { name: "Record" }, optional: false },
                ],
            })]));
            noLine(result, "# Required parameters");
            noLine(result, "# Optional parameters");
        });

        test("§7: a repeatable slot appears in neither presence list", () => {
            // It is not in the signature, so neither "required" nor "may be omitted" applies to it.
            const result = renderService(service([method({
                parameters: [
                    { name: "records", description: "", type: { name: "Record" }, optional: false },
                    { name: "caller", description: "", type: { name: "Caller" }, optional: true },
                    {
                        name: "extra", description: "", type: { name: "string" },
                        optional: true, repeatable: true,
                    },
                ],
            })]));
            assert.ok(!result.includes("may be omitted): caller, extra"),
                `a repeatable slot must not be listed as omittable:\n${result}`);
            assert.ok(result.includes("# Optional parameters (may be omitted): caller"), `got:\n${result}`);
        });

        test("§5: a resource-only open catalog says so, because a remote method there does not compile", () => {
            // Verified: ballerina/http answers a remote method with
            // "ERROR remote methods are not allowed in http:Service". The generic preamble ("any number of
            // handlers") reads as permission to write one, and http's curated file used to carry the
            // prohibition explicitly. It is derivable from `options[].kind`, so the renderer must state it.
            const result = renderService(service([], {
                methods: undefined,
                handlerTemplates: [{
                    name: "*", type: "resource", accessor: "get", parameters: [],
                    return: { type: { name: "anydata|error" } },
                }],
            }));
            assert.ok(result.includes("takes any number of resource handlers"), `got:\n${result}`);
            assert.ok(result.includes("Only resource methods are accepted here"), `got:\n${result}`);
        });

        test("§5: a remote-only open catalog names its kind too, and claims no prohibition", () => {
            const result = renderService(service([], {
                methods: undefined,
                handlerTemplates: [{
                    name: "*", type: "remote", parameters: [],
                    return: { type: { name: "anydata|error" } },
                }],
            }));
            assert.ok(result.includes("takes any number of remote handlers"), `got:\n${result}`);
            noLine(result, "Only resource methods are accepted");
        });

        test("§5: a mixed-kind catalog states no single kind", () => {
            // graphql: two resource shapes and one remote. Claiming either kind would be false.
            const result = renderService(service([], {
                methods: undefined,
                handlerTemplates: [
                    { name: "*", type: "resource", accessor: "get", parameters: [],
                      return: { type: { name: "anydata|error" } } },
                    { name: "*", type: "remote", parameters: [],
                      return: { type: { name: "anydata|error" } } },
                ],
            }));
            assert.ok(result.includes("takes any number of handlers"), `got:\n${result}`);
            noLine(result, "Only resource methods are accepted");
        });

        test("§5: a template's path placeholder is the slot the reader fills", () => {
            // This replaces a test for the `fieldName` slot, which spec §5 removed by folding GraphQL's
            // `accessor`/`fieldName` and HTTP's `method`/`path` into one pair. The defect it pinned was
            // three names for one slot -- the document's form token, the `pathSegment` placeholder, and a
            // remote shape's `<handlerName>` -- with nothing connecting them. One slot per kind now, and
            // the note names the placeholder the signature actually prints.
            const resource = renderService(service([], {
                methods: undefined,
                handlerTemplates: [{
                    name: "*", type: "resource", accessor: "get", parameters: [],
                    accessorValues: ["get"], accessorRequired: true, pathRequired: true,
                    return: { type: { name: "anydata|error" } },
                }],
            }));
            assert.ok(resource.includes("a path is required and is author-chosen — replace `pathSegment`"),
                `got:\n${resource}`);
            assert.ok(resource.includes("// resource function get pathSegment() returns anydata|error;"),
                `the note must name the placeholder the signature prints:\n${resource}`);

            // A remote shape has no path slot at all; its author-chosen slot is the name, and it must not
            // acquire a path note it cannot satisfy.
            const remote = renderService(service([], {
                methods: undefined,
                handlerTemplates: [{
                    name: "*", type: "remote", parameters: [],
                    return: { type: { name: "anydata|error" } },
                }],
            }));
            assert.ok(remote.includes("// remote function <handlerName>() returns anydata|error;"),
                `got:\n${remote}`);
            assert.ok(!remote.includes("a path is required"),
                `a remote shape has no path slot:\n${remote}`);
        });

        test("§7: two unnamed repeatable slots are told apart by their annotations", () => {
            // ballerina/http's real shape: a query slot and a header slot, identical type unions, neither
            // named by the document. Without a discriminator this emitted the same sentence twice — which
            // reads as a rendering bug and says nothing about why there are two.
            const result = renderService(service([method({
                parameters: [
                    {
                        description: "", type: { name: "string" }, optional: true, repeatable: true,
                        annotationRefs: [{
                            name: "Query", presence: "optional", attachPoint: "parameter",
                        }],
                    },
                    {
                        description: "", type: { name: "string" }, optional: true, repeatable: true,
                        annotationRefs: [{
                            name: "Header", presence: "optional", attachPoint: "parameter",
                        }],
                    },
                ],
            })]));
            // Identification, not obligation: both annotations are `optional`, so "annotated `@X`" would
            // assert a requirement the document does not make.
            assert.ok(result.includes("Zero or more further parameters (the `@kafka:Query` slot) of type"),
                `got:\n${result}`);
            assert.ok(result.includes("Zero or more further parameters (the `@kafka:Header` slot) of type"),
                `got:\n${result}`);
            const repeats = result.split("\n").filter((l) => l.includes("Zero or more further parameters"));
            assert.strictEqual(new Set(repeats).size, repeats.length,
                `no two repeat notes may be identical:\n${repeats.join("\n")}`);
        });

        test("§7: a named repeatable slot still prefers its own name", () => {
            const result = renderService(service([method({
                parameters: [{
                    name: "extra", description: "", type: { name: "string" },
                    optional: true, repeatable: true,
                    annotationRefs: [{ name: "Query", presence: "optional", attachPoint: "parameter" }],
                }],
            })]));
            assert.ok(result.includes("Zero or more further parameters (`extra`) of type"), `got:\n${result}`);
        });

        test("§4: a single shape keeps the original singular wording", () => {
            // The multi-shape path must not change what a one-shape catalog (mcp) renders.
            const result = renderService(service([], {
                methods: undefined,
                handlerTemplates: [{
                    name: "*", type: "remote", parameters: [],
                    return: { type: { name: "anydata|error" } },
                }],
            }));
            assert.ok(result.includes("// Declare as many as the requirement needs, following this shape:"),
                `got:\n${result}`);
            noLine(result, "Shape 1 of");
        });

        // ---- §5 path vocabulary (the other half of the shared `valueSpec`) ----

        test("§5: an enumerated path renders its vocabulary and is written into the signature", () => {
            // `path` and `accessor` are the same `valueSpec`, so a path may name the values it accepts. The
            // path half was dropped end to end, so a constrained path reached the prompt as
            // "author-chosen" — the exact opposite of what the document said.
            const result = renderService(service([method({
                name: "get", type: "resource",
                accessor: "get", accessorValues: ["get"], accessorRequired: true,
                path: "orders", pathValues: ["orders", "invoices"], pathRequired: true,
            })]));

            assert.ok(line(result, "Resource:").includes("the path must be one of `orders`, `invoices`"),
                `got:\n${result}`);
            // The codegen default goes into the signature, not the placeholder: telling the reader to
            // replace `pathSegment` would contradict the note one line above.
            assert.ok(result.includes("resource function get orders("), `got:\n${result}`);
            noLine(result, "author-chosen");
        });

        test("§5: an optional enumerated path says `may be` rather than `must be`", () => {
            const result = renderService(service([method({
                name: "get", type: "resource", accessor: "get",
                path: "orders", pathValues: ["orders", "invoices"], pathRequired: false,
            })]));
            assert.ok(line(result, "Resource:").includes("the path may be one of `orders`, `invoices`"),
                `got:\n${result}`);
        });

        test("§5: an open path is worded as open, never as a literal `*`", () => {
            // Rendering the wildcard as a value would tell the reader to write a path called `*`.
            const result = renderService(service([method({
                name: "get", type: "resource", accessor: "get",
                pathRequired: true, pathOpen: true,
            })]));
            assert.ok(line(result, "Resource:").includes(
                "the path may be any the language accepts — replace `pathSegment`"), `got:\n${result}`);
            noLine(result, "one of `*`");
            assert.ok(result.includes("resource function get pathSegment("),
                "an open slot has no value to write, so the placeholder stays");
        });

        test("§5: a path that only states presence renders exactly as it did before", () => {
            // Every corpus document's path is `{presence: required}`. This is the regression guard for the
            // 22-library render: the new branches must not touch it.
            const result = renderService(service([method({
                name: "get", type: "resource", accessor: "get",
                accessorValues: ["get", "post"], accessorRequired: true, pathRequired: true,
            })]));
            assert.ok(line(result, "Resource:").includes(
                "the accessor must be one of `get`, `post`; a path is required and is author-chosen "
                + "— replace `pathSegment`"), `got:\n${result}`);
            assert.ok(result.includes("resource function get pathSegment("), `got:\n${result}`);
        });

        test("§5: a handler template's enumerated path is written into its commented signature", () => {
            // A wildcard catalog renders ONLY as a template, so a path vocabulary that reached the template
            // nowhere would reach the prompt nowhere.
            const result = renderService(service([], {
                methods: undefined,
                handlerTemplates: [{
                    name: "*", type: "resource", parameters: [],
                    accessor: "get", accessorValues: ["get"], accessorRequired: true,
                    path: "orders", pathValues: ["orders", "invoices"], pathRequired: true,
                    return: { type: { name: "error?" } },
                }],
            }));
            assert.ok(result.includes("// resource function get orders() returns error?;"), `got:\n${result}`);
            assert.ok(result.includes("the path must be one of `orders`, `invoices`"), `got:\n${result}`);
        });

    });

    // ----------------------------------------------------------------
    // Compile-correctness of what the reader copies.
    //
    // These pin two classes of defect that every previous suite missed for the same reason: the fixtures
    // above declare types with NO `links`, and both defects only appear once a link is present. 126 tests
    // were green while `mcp`'s rendered handler failed to compile.
    //
    // Every expected string here was verified with `bal build` (Ballerina 2201.13.4) before being asserted.
    // ----------------------------------------------------------------
    // ----------------------------------------------------------------
    // Curated `test.md` guidance — the third wire boundary, and the one that had no guard.
    //
    // The Java side loads it, sets it on every service and serializes it, and the system prompt names it
    // explicitly. It was declared on no TypeScript interface and rendered nowhere, so the prompt instructed
    // the model to obey text it never received.
    // ----------------------------------------------------------------
    // ----------------------------------------------------------------
    // Two latent renderer gaps: an identifier slot that admits more than one form, and a binding variant
    // that admits more than one shape. Both are shapes the schema allows and no corpus document uses yet,
    // and both silently discarded part of what the document said.
    // ----------------------------------------------------------------
    suite("Latent shapes the schema allows", () => {
        function renderOne(service: Record<string, unknown>): string {
            return toSyntaxString([{
                name: "ballerinax/probe", description: "Probe.",
                typeDefs: [], clients: [], functions: [], services: [service],
            } as unknown as Library]);
        }

        function probeService(over: Record<string, unknown> = {}): Record<string, unknown> {
            return {
                type: "fixed", name: "Service",
                listener: { name: "probe:Listener", parameters: [] },
                methods: [], ...over,
            };
        }

        // ---- §3 identifier: `form` is an array with minItems 1 and no upper bound ----

        test("§3: a single-form identifier renders exactly as it did", () => {
            // Every corpus document declares one form. This is the guard that the multi-form branch does not
            // touch them.
            const result = renderOne(probeService({
                identifier: { presence: "required", form: ["basePath"] },
            }));
            const note = result.split("\n").find((l) => l.includes("service identifier"))!;
            assert.strictEqual(note,
                "# The service identifier requires a base path, e.g. `/orders` — replace `/basePath`.");
        });

        test("§3: every legal identifier form is stated, not just the first", () => {
            // `IdentifierResolver` keeps the whole list "so the renderer can say which are legal" — and then
            // only the first was described, so a connector accepting either shape advertised one.
            const result = renderOne(probeService({
                identifier: { presence: "required", form: ["basePath", "stringLiteral"] },
            }));
            const note = result.split("\n").find((l) => l.includes("service identifier"))!;
            assert.ok(note.includes("requires a base path"), note);
            assert.ok(note.includes('It may instead be a quoted string literal, e.g. `"orders"`.'), note);
            // Only ONE placeholder is written: spec §1 makes the first form the codegen default, and writing
            // both would emit two identifier slots into one declaration.
            assert.ok(result.includes("service probe:Service /basePath on new"), `got:\n${result}`);
            assert.ok(!result.includes('"identifier"'), "the alternative is described, never written");
        });

        test("§3: an optional multi-form identifier still writes no placeholder", () => {
            const result = renderOne(probeService({
                identifier: { presence: "optional", form: ["stringLiteral", "basePath"] },
            }));
            const note = result.split("\n").find((l) => l.includes("service identifier"))!;
            assert.ok(note.includes("accepts a quoted string literal"), note);
            assert.ok(note.includes("it may be omitted."), note);
            assert.ok(note.includes("It may instead be a base path"), note);
            assert.ok(result.includes("service probe:Service on new"), `got:\n${result}`);
        });

        test("§3: an unrecognised alternative form is named verbatim rather than dropped", () => {
            const result = renderOne(probeService({
                identifier: { presence: "required", form: ["basePath", "someFutureForm"] },
            }));
            const note = result.split("\n").find((l) => l.includes("service identifier"))!;
            assert.ok(note.includes("It may instead be a value of form `someFutureForm`."), note);
        });

        test("§3: a duplicated form is not restated", () => {
            const result = renderOne(probeService({
                identifier: { presence: "required", form: ["basePath", "basePath"] },
            }));
            const note = result.split("\n").find((l) => l.includes("service identifier"))!;
            assert.ok(!note.includes("It may instead be"), note);
        });

        // ---- §9 excludes belongs to the variant, not to each shape ----

        function bindingMethod(shapes: Record<string, unknown>[]): Record<string, unknown> {
            return {
                name: "onEvent", type: "remote", return: { type: { name: "error?" } },
                parameters: [{
                    name: "payload", description: "", type: { name: "Envelope" },
                    binding: {
                        typedescs: [{
                            constraint: { name: "anydata" },
                            excludes: [{ name: "Envelope" }],
                            shapes,
                        }],
                    },
                }],
            };
        }

        test("§9: a multi-shape variant states its prohibition once, not once per shape", () => {
            // Spec §9 puts `excludes` on the `typedescs[]` entry, so it is one fact about the variant. It was
            // appended to every shape line, which presented one restriction as four.
            const result = renderOne(probeService({
                methods: [bindingMethod([
                    { form: "bare" },
                    { form: "array", element: "bare" },
                    { form: "stream", element: "bare",
                      completionType: { name: "error?" } },
                ])],
            }));
            const prohibitions = result.split("\n").filter((l) => l.includes("Envelope")
                && (l.includes("never") || l.includes("none of those")));
            assert.strictEqual(prohibitions.length, 1,
                `expected exactly one prohibition, got:\n${result}`);
            assert.ok(prohibitions[0].includes(
                "and in none of those forms may `payload` bind to Envelope"), prohibitions[0]);
            // Every embedding is still stated.
            assert.ok(result.includes("may bind directly to: anydata"), `got:\n${result}`);
            assert.ok(result.includes("may bind to a batch: anydata[]"), `got:\n${result}`);
            assert.ok(result.includes("may bind to a stream:"), `got:\n${result}`);
        });

        test("§9: a single-shape variant keeps the inline wording", () => {
            // The corpus shape (kafka, rabbitmq): one embedding, one sentence.
            const result = renderOne(probeService({
                methods: [bindingMethod([{ form: "array", element: "bare" }])],
            }));
            assert.ok(result.includes(
                "# `payload` may bind to a batch: anydata[] — but never Envelope"), `got:\n${result}`);
        });
    });


    suite("compile-correctness — module qualification and attach points", () => {
        /** A type the library declares itself: the prefix is stripped and an `internal` link carries it. */
        function own(name: string, recordName?: string): Record<string, unknown> {
            return { name, links: [{ category: "internal", recordName: recordName ?? name }] };
        }

        function renderService(service: Record<string, unknown>): string {
            const lib = {
                name: "ballerina/mcp", description: "", typeDefs: [], clients: [], services: [service],
            } as unknown as Library;
            return toSyntaxString([lib]);
        }

        const listener = { name: "mcp:StreamableHttpListener", parameters: [] };

        function service1(method: Record<string, unknown>): Record<string, unknown> {
            return { type: "fixed", name: "AdvancedService", listener, methods: [method] };
        }

        // ---- handler signatures ----

        test("a handler parameter naming a library type is written with the module alias", () => {
            // Verified: `remote function onCallTool(CallToolParams params)` inside a service in the
            // reader's module gives `ERROR unknown type 'CallToolParams'`; the `mcp:`-qualified form
            // builds. The name arrives stripped with an `internal` link, so the alias must go back on.
            const result = renderService(service1({
                name: "onCallTool", type: "remote",
                parameters: [{ name: "params", description: "", type: own("CallToolParams") }],
                return: { type: own("CallToolResult") },
            }));
            assert.ok(result.includes("remote function onCallTool(mcp:CallToolParams params)"),
                `Expected a module-qualified parameter, got:\n${result}`);
        });

        test("a handler return naming a library type is written with the module alias", () => {
            const result = renderService(service1({
                name: "onListTools", type: "remote", parameters: [],
                return: { type: own("ListToolsResult") },
            }));
            assert.ok(result.includes("returns mcp:ListToolsResult;"),
                `Expected a module-qualified return, got:\n${result}`);
        });

        test("a union return qualifies every member that names a library type", () => {
            // `returns ListToolsResult|ServerError` named two unresolvable types on one line. Both links
            // are present, so both members are prefixed — member-wise, never as one blob.
            const result = renderService(service1({
                name: "onListTools", type: "remote", parameters: [],
                return: {
                    type: {
                        name: "ListToolsResult|ServerError",
                        links: [
                            { category: "internal", recordName: "ListToolsResult" },
                            { category: "internal", recordName: "ServerError" },
                        ],
                    },
                },
            }));
            assert.ok(result.includes("returns mcp:ListToolsResult|mcp:ServerError;"),
                `Expected every union member qualified, got:\n${result}`);
        });

        test("an array-typed parameter is qualified despite the `[]` suffix", () => {
            // kafka's payload slot arrives as `AnydataConsumerRecord[]` with an internal link whose
            // recordName carries the `[]` too. A `\b` anchor after `]` demands a word character that is
            // not there, so the name silently stayed bare — and bare it does not compile.
            const result = renderService(service1({
                name: "onConsumerRecord", type: "remote",
                parameters: [{
                    name: "consumerRecords", description: "",
                    type: own("AnydataConsumerRecord[]", "AnydataConsumerRecord[]"),
                }],
                return: { type: { name: "error?" } },
            }));
            assert.ok(result.includes("(mcp:AnydataConsumerRecord[] consumerRecords)"),
                `An array type must still take the alias, got:\n${result}`);
        });

        test("an alternative-type note is qualified exactly like the signature beside it", () => {
            // The note offers a type the reader may write IN PLACE OF the declared one, so it has to be
            // written the way the reader must write it. kafka read `may also be: BytesConsumerRecord[]`
            // directly above `kafka:AnydataConsumerRecord[]`; taking the alternative gave `unknown type`.
            const result = renderService(service1({
                name: "onConsumerRecord", type: "remote",
                parameters: [{
                    name: "consumerRecords", description: "",
                    type: own("AnydataConsumerRecord[]", "AnydataConsumerRecord[]"),
                    alternatives: [own("BytesConsumerRecord[]", "BytesConsumerRecord[]")],
                }],
                return: { type: { name: "error?" } },
            }));
            assert.ok(result.includes("may also be: mcp:BytesConsumerRecord[]"),
                `An alternative must be written as the reader must write it, got:\n${result}`);
        });

        test("a binding note is qualified, and suppression still matches", () => {
            // Both sides of the suppression comparison move together: the declared type must still be
            // recognised as already-visible, while a genuinely new target is stated qualified.
            const result = renderService(service1({
                name: "onMessage", type: "remote",
                parameters: [{
                    name: "message", description: "", type: own("AnydataMessage"),
                    binding: {
                        // Two variants, because spec v1.0 gives each bound its own entry: one repeats the
                        // declared type (and must stay suppressed), one names a genuinely new target.
                        typedescs: [
                            { constraint: own("AnydataMessage"), shapes: [{ form: "bare" }] },
                            { constraint: own("BytesMessage"), shapes: [{ form: "bare" }] },
                        ],
                    },
                }],
                return: { type: { name: "error?" } },
            }));
            assert.ok(result.includes("may bind directly to: mcp:BytesMessage"),
                `A new binding target must be qualified, got:\n${result}`);
            assert.ok(!result.includes("mcp:AnydataMessage,") && !result.includes(": mcp:AnydataMessage"),
                `The declared type is already visible and must stay suppressed, got:\n${result}`);
        });

        test("a qualified name is never prefixed twice", () => {
            // The leading lookaround's job: `Session` must not match inside `mcp:Session`.
            const result = renderService(service1({
                name: "onEvent", type: "remote",
                parameters: [{
                    name: "session", description: "",
                    type: {
                        name: "Session|()",
                        links: [
                            { category: "internal", recordName: "Session" },
                            { category: "internal", recordName: "Session" },
                        ],
                    },
                }],
                return: { type: { name: "error?" } },
            }));
            assert.ok(result.includes("(mcp:Session|() session)"), `got:\n${result}`);
            assert.ok(!result.includes("mcp:mcp:"), `A prefix must never be applied twice:\n${result}`);
        });

        test("a builtin or already-prefixed type in the signature is left exactly as it is", () => {
            // The counterweight: qualification keys off the links the pipeline attached, never off the
            // shape of the name. A link-free name is a builtin or already carries a foreign prefix, and
            // prefixing either would break a line that was correct.
            const result = renderService(service1({
                name: "onEvent", type: "remote",
                parameters: [
                    { name: "data", description: "", type: { name: "anydata" } },
                    { name: "headers", description: "", type: { name: "http:Headers" } },
                ],
                return: { type: { name: "error?" } },
            }));
            assert.ok(result.includes("remote function onEvent(anydata data, http:Headers headers) returns error?;"),
                `A link-free type must survive untouched, got:\n${result}`);
            assert.ok(!result.includes("mcp:anydata") && !result.includes("mcp:http:Headers"),
                "A builtin or foreign-prefixed name must never take the listener alias");
        });

        test("a cross-module handler type takes its own package prefix, not the listener's", () => {
            const result = renderService(service1({
                name: "onEvent", type: "remote",
                parameters: [{
                    name: "request", description: "",
                    type: {
                        name: "Request",
                        links: [{ category: "external", recordName: "Request", libraryName: "ballerina/http" }],
                    },
                }],
                return: { type: { name: "error?" } },
            }));
            assert.ok(result.includes("(http:Request request)"),
                `An external link must take its own module's prefix, got:\n${result}`);
            assert.ok(!result.includes("mcp:Request"), "Never the listener's alias for a foreign type");
        });

        // ---- the listener argument list ----

        test("a listener argument naming a library type is written with the module alias", () => {
            // The same defect one line up, and the line the reader copies first:
            // `on new mcp:StreamableHttpListener(ListenerConfiguration config = {})` does not resolve.
            const result = renderService({
                type: "fixed", name: "Service", methods: [],
                listener: {
                    name: "mcp:StreamableHttpListener",
                    parameters: [
                        { name: "listenTo", description: "", type: { name: "int|http:Listener" } },
                        {
                            name: "config", description: "", type: own("ListenerConfiguration"),
                            optional: true, default: "{}",
                        },
                    ],
                },
            });
            assert.ok(result.includes(
                "on new mcp:StreamableHttpListener(int|http:Listener listenTo, "
                + "mcp:ListenerConfiguration config = {})"),
                `Expected a qualified listener argument, got:\n${result}`);
        });

        test("a client or standalone function parameter is NOT re-qualified", () => {
            // The deliberate asymmetry. Client/function parameters come from the symbol-processing
            // pipeline, already carry the form the reader must write, and re-qualifying them would
            // double a correct prefix. Only the metadata-derived handler path was broken.
            const lib = {
                name: "ballerina/mcp", description: "", typeDefs: [], clients: [{
                    name: "Client", description: "",
                    functions: [{
                        type: "Remote Function", name: "call", description: "",
                        parameters: [{ name: "params", description: "", type: own("CallToolParams") }],
                        return: { type: { name: "error?" } },
                    }],
                }],
            } as unknown as Library;
            const result = toSyntaxString([lib]);
            assert.ok(result.includes("remote function call(CallToolParams params)"),
                `A client parameter must be untouched by the handler-path fix, got:\n${result}`);
        });

        // ---- annotation attach points ----

        // Every row was compiled before being asserted. `on service_function` and `on resource function`
        // — the two forms this renderer emitted for years — are `ERROR invalid token`; they are kept in
        // the table as comments so nobody reintroduces them by inspection.
        const COMPILER_VERIFIED_ATTACH_POINTS: Array<[string, string]> = [
            ["SERVICE", "public annotation Cfg X on service;"],
            ["OBJECT_METHOD", "public annotation Cfg X on object function;"],
            ["RESOURCE", "public annotation Cfg X on service remote function;"],
            ["TYPE", "public annotation Cfg X on type;"],
            ["FUNCTION", "public annotation Cfg X on function;"],
            ["PARAMETER", "public annotation Cfg X on parameter;"],
            ["RETURN", "public annotation Cfg X on return;"],
            ["CLASS", "public annotation Cfg X on class;"],
            ["FIELD", "public annotation Cfg X on field;"],
            ["OBJECT_FIELD", "public annotation Cfg X on object field;"],
            ["RECORD_FIELD", "public annotation Cfg X on record field;"],
            ["LISTENER", "public const annotation Cfg X on source listener;"],
            ["ANNOTATION", "public const annotation Cfg X on source annotation;"],
            ["EXTERNAL", "public const annotation Cfg X on source external;"],
            ["VAR", "public const annotation Cfg X on source var;"],
            ["CONST", "public const annotation Cfg X on source const;"],
            ["WORKER", "public const annotation Cfg X on source worker;"],
        ];

        function renderAnnotationAt(attachmentPoint: string): string {
            const lib = {
                name: "ballerina/mcp", description: "", typeDefs: [], clients: [],
                annotations: [{ name: "X", attachmentPoint, typeConstraint: own("Cfg") }],
            } as unknown as Library;
            return toSyntaxString([lib]);
        }

        test("every attach point renders the exact declaration that was compiled", () => {
            for (const [point, expected] of COMPILER_VERIFIED_ATTACH_POINTS) {
                const result = renderAnnotationAt(point);
                assert.ok(result.includes(expected),
                    `${point} must render "${expected}" — the form verified with bal build. Got:\n${result}`);
            }
        });

        test("a source-only attach point is declared const, never as a plain annotation", () => {
            // Verified: `public annotation Cfg X on source listener;` is
            // "annotation declaration with 'source' attach point(s) should be a 'const' declaration".
            // The two halves — `const` and `source` — are obligatory together.
            const result = renderAnnotationAt("LISTENER");
            assert.ok(!result.includes("public annotation Cfg X on"),
                `A source-only point must not render the plain form, got:\n${result}`);
        });

        test("an attach point with no declarable Ballerina syntax is dropped, not guessed at", () => {
            // Verified: `on object` is `ERROR missing function keyword` — Ballerina has no bare `object`
            // attach point. Omitting beats emitting a declaration the model may copy.
            const result = renderAnnotationAt("OBJECT");
            assert.ok(!result.includes("annotation"),
                `An undeclarable attach point must render nothing, got:\n${result}`);
            assert.ok(!result.includes("// --- Annotations ---"),
                "An annotations section with no renderable entry must not be emitted");
        });

        // ---- one declaration per annotation, not per attach point ----

        function renderAnnotationsAt(points: string[], name = "X",
                                     constraint: Record<string, unknown> | undefined = own("Cfg")): string {
            const lib = {
                name: "ballerina/mcp", description: "", typeDefs: [], clients: [],
                annotations: points.map((attachmentPoint) => ({
                    name, attachmentPoint, typeConstraint: constraint,
                })),
            } as unknown as Library;
            return toSyntaxString([lib]);
        }

        test("an annotation declared at several points renders ONE declaration, not one per point", () => {
            // The catalog carries one row per attach point, because the compiler reports one symbol with N
            // points and the wire model's `attachmentPoint` is singular. Rendering the rows verbatim
            // redeclares the symbol: graphql printed `ID` three times, http printed four such pairs.
            // Verified with bal build: `public annotation Cfg X on parameter, return, record field;` builds.
            const result = renderAnnotationsAt(["PARAMETER", "RETURN", "RECORD_FIELD"]);
            assert.ok(result.includes("public annotation Cfg X on parameter, return, record field;"),
                `got:\n${result}`);
            assert.strictEqual(result.split("annotation Cfg X on").length - 1, 1,
                `exactly one declaration of X, got:\n${result}`);
        });

        test("one source-only point makes the whole declaration const, and the list is not split", () => {
            // Verified with bal build, both halves:
            //   `public const annotation Cfg X on source listener, parameter;`  builds — mixing is legal,
            //   so a source-only point does NOT force a second declaration;
            //   `public const annotation Cfg X on source listener, worker;`     is
            //   `ERROR missing source keyword` — every source-only point carries its own `source`, so the
            //   qualifier cannot be hoisted onto the list.
            const result = renderAnnotationsAt(["LISTENER", "PARAMETER"]);
            assert.ok(result.includes("public const annotation Cfg X on source listener, parameter;"),
                `got:\n${result}`);

            const both = renderAnnotationsAt(["LISTENER", "WORKER"]);
            assert.ok(both.includes("public const annotation Cfg X on source listener, source worker;"),
                `each source-only point keeps its own \`source\`, got:\n${both}`);
        });

        test("an undeclarable point among declarable ones drops only itself", () => {
            // The drop is per point, not per annotation: OBJECT has no syntax, but the annotation is still
            // really declared `on parameter` and the model still needs to know that.
            const result = renderAnnotationsAt(["OBJECT", "PARAMETER"]);
            assert.ok(result.includes("public annotation Cfg X on parameter;"), `got:\n${result}`);
            assert.ok(!result.includes("object;"), `the undeclarable point is gone, got:\n${result}`);
        });

        test("same name but different constraints stay separate declarations", () => {
            // Rows are keyed by name AND constraint. Two rows for one symbol always agree on both, so the
            // key merges exactly what one declaration produced; a name collision carrying different
            // constraints must not be merged into a declaration neither library wrote.
            const lib = {
                name: "ballerina/mcp", description: "", typeDefs: [], clients: [],
                annotations: [
                    { name: "X", attachmentPoint: "PARAMETER", typeConstraint: own("Cfg") },
                    { name: "X", attachmentPoint: "RETURN", typeConstraint: own("Other") },
                ],
            } as unknown as Library;
            const result = toSyntaxString([lib]);
            assert.ok(result.includes("public annotation Cfg X on parameter;"), `got:\n${result}`);
            assert.ok(result.includes("public annotation Other X on return;"), `got:\n${result}`);
        });

        // ---- the `isolated` qualifier of a concrete service type's declared method ----

        test("a declared `isolated` handler is rendered with the qualifier", () => {
            // Verified: implementing mcp:AdvancedService's handlers WITHOUT `isolated` fails with
            // "mismatched function signatures", whose expected and found halves print identically because
            // the compiler prints neither qualifier. With it, `bal build` succeeds.
            const result = renderService(service1({
                name: "onListTools", type: "remote", isolated: true, parameters: [],
                return: { type: own("ListToolsResult") },
            }));
            assert.ok(result.includes("isolated remote function onListTools() returns mcp:ListToolsResult;"),
                `got:\n${result}`);
        });

        test("a handler with no declared qualifier is unchanged", () => {
            // The omission rule: a marker type's handlers come from the document, which models no
            // qualifiers, so they must render exactly as before.
            const result = renderService(service1({
                name: "onListTools", type: "remote", parameters: [],
                return: { type: own("ListToolsResult") },
            }));
            assert.ok(result.includes("    remote function onListTools() returns mcp:ListToolsResult;"),
                `got:\n${result}`);
            assert.ok(!result.includes("isolated"), `got:\n${result}`);
        });

        test("`isolated` leads a resource signature too", () => {
            const result = renderService(service1({
                name: "get", type: "resource", accessor: "get", isolated: true, parameters: [],
                return: { type: { name: "error?" } },
            }));
            assert.ok(result.includes("isolated resource function get pathSegment() returns error?;"),
                `got:\n${result}`);
        });

        // ---- §4: a catalog whose named options are shapes, not handler names ----

        test("§5.1: a `many` option renders as a shape, not as a handler name", () => {
            // This replaces a test for the `authorNamedHandlers` note. Under the old block-level `addMode`
            // a document had to choose between "every handler here is fixed-name" and "every handler here
            // is a shape", so `grpc` -- four named options under a `many` block -- came out as four
            // apparently-real method names, and the only remedy was a caveat sentence beside them.
            //
            // §5.1 moved the flag onto each option, so a shape simply IS a template: it renders in the
            // template block, under the preamble that says the reader names each one, with `<handlerName>`
            // where a real method name would be. The caveat is no longer needed because the rendering no
            // longer makes the claim it was correcting.
            const result = renderService({
                type: "fixed", name: "AdvancedService", listener, methods: undefined,
                handlerTemplates: [{
                    name: "*", type: "remote", parameters: [],
                    return: { type: { name: "anydata|error" } },
                }],
            });
            assert.ok(result.includes("you choose each one's name"), `got:\n${result}`);
            // The signature itself must survive -- it states the shape's parameters and return, which is
            // the valuable part -- but with the placeholder in the name position.
            assert.ok(result.includes("// remote function <handlerName>() returns anydata|error;"),
                `got:\n${result}`);
            assert.ok(!result.includes("signature SHAPES, not handler names"),
                `the caveat is obsolete; the template block already says it:\n${result}`);
        });

        test("§5.1: a `subset` option is a real name and is never disclaimed", () => {
            // The counterweight to the test above: `salesforce`'s `onCreate` IS the method name a working
            // program contains, so nothing may suggest the author picks it.
            const result = renderService(service1({
                name: "onCreate", type: "remote", parameters: [],
                return: { type: { name: "error?" } },
            }));
            assert.ok(result.includes("remote function onCreate()"), `got:\n${result}`);
            assert.ok(!result.includes("you choose each one's name"),
                `A real handler name must not be disclaimed:\n${result}`);
        });

        // ---- §2: a service type no listener can host ----

        function wsService(over: Record<string, unknown> = {}): string {
            const lib = {
                name: "ballerina/websocket", description: "", typeDefs: [], clients: [],
                services: [{
                    type: "fixed", name: "Service", notListenerAttachable: true,
                    listener: { name: "websocket:Listener", parameters: [] },
                    methods: [{
                        name: "onOpen", type: "remote",
                        parameters: [{ name: "caller", description: "", type: own("Caller") }],
                        return: { type: { name: "error?" } }, optional: true,
                    }],
                    ...over,
                }],
            } as unknown as Library;
            return toSyntaxString([lib]);
        }

        test("§2: a service type no listener hosts is written as a `service class`, not an attachment", () => {
            // Verified: `service websocket:Service on new websocket:Listener(...)` is
            // "ERROR service type is not supported by the listener"; the service-class form builds.
            const result = wsService();
            assert.ok(result.includes("service class ServiceImpl {"), `got:\n${result}`);
            assert.ok(result.includes("    *websocket:Service;"),
                `The class must include the service type, got:\n${result}`);
            assert.ok(!result.includes("on new websocket:Listener"),
                `Must not render an attachment the compiler rejects, got:\n${result}`);
        });

        test("§2: its handlers are defined with bodies, because a class cannot declare them", () => {
            // Verified: `remote function onOpen(...) returns error?;` inside a service class is
            // "ERROR missing equal token" / "missing external keyword".
            const result = wsService();
            assert.ok(result.includes("remote function onOpen(websocket:Caller caller) returns error? { }"),
                `A class method needs a body, got:\n${result}`);
            assert.ok(!result.includes("returns error?;"),
                `No handler in this shape may end in a bare semicolon, got:\n${result}`);
        });

        test("§2: the §8 service-scope annotation block is suppressed on a class", () => {
            // Verified: `@websocket:ServiceConfig` on a service class is
            // "ERROR annotation ... is not allowed on class" — it is declared `on service`.
            const result = wsService({
                annotations: [{
                    name: "ServiceConfig", presence: "optional", attachPoint: "service",
                    typeConstraint: own("WSServiceConfig"),
                }],
            });
            assert.ok(!result.includes("@websocket:ServiceConfig"),
                `A service-scope annotation must not be attached to a class, got:\n${result}`);
        });

        test("§2: §6 constraints survive, because they still bind the handler set", () => {
            // These are the errors the compiler actually raises on the class form, so they are the notes
            // that make the difference between a build and two errors.
            const result = wsService({
                constraints: [{
                    rule: "structure.atMostOne",
                    subjects: [{ kind: "handler", name: "onMessage" },
                               { kind: "handler", name: "onTextMessage" }],
                }],
            });
            assert.ok(result.includes("At most one of the following may be used: `onMessage` | `onTextMessage`."),
                `got:\n${result}`);
        });

        test("§2: attachment-only notes are dropped, since the type attaches to nothing", () => {
            const result = wsService({
                singleListenerOnly: true,
                identifier: { presence: "required", form: ["basePath"] },
            });
            assert.ok(!result.includes("attaches to exactly one listener"),
                `Cardinality is meaningless without an attachment, got:\n${result}`);
            assert.ok(!result.includes("service identifier"),
                `There is no identifier slot on a class, got:\n${result}`);
        });

        test("§2: an attachable service type is unaffected", () => {
            // The counterweight: the branch must be taken only on the explicit flag.
            const result = wsService({ notListenerAttachable: undefined });
            assert.ok(result.includes("service websocket:Service on new websocket:Listener()"),
                `got:\n${result}`);
            assert.ok(!result.includes("service class"), `got:\n${result}`);
        });

        test("no attach point renders a token the compiler rejects", () => {
            // The regression guard for the three tokens that actually shipped broken.
            for (const point of Object.keys(
                { ...Object.fromEntries(COMPILER_VERIFIED_ATTACH_POINTS), OBJECT: "" })) {
                const result = renderAnnotationAt(point);
                for (const bad of ["on service_function", "on resource function", "on object;"]) {
                    assert.ok(!result.includes(bad),
                        `${point} rendered the uncompilable token "${bad}":\n${result}`);
                }
            }
        });
    });

    // ----------------------------------------------------------------
    // Trigger Construct Spec v1.0, 2026-08-19 revision:
    //   §2/§3 `doc` on listeners and service types,
    //   §5.4 `returns` as an object, §9.1 the return's own data binding,
    //   §1.4 `subtypeFamily`.
    // ----------------------------------------------------------------
    suite("Trigger spec §2/§3/§5.4/§9.1/§1.4 — construct docs, return binding and subtype families", () => {
        function renderService(service: Record<string, unknown>, libName = "ballerina/http"): string {
            const lib = {
                name: libName, description: "", typeDefs: [], clients: [], services: [service],
            } as unknown as Library;
            return toSyntaxString([lib]);
        }

        const httpListener = { name: "http:Listener", parameters: [] };

        function service(over: Record<string, unknown> = {}): Record<string, unknown> {
            return { type: "fixed", name: "Service", listener: httpListener, methods: [], ...over };
        }

        function method(over: Record<string, unknown> = {}): Record<string, unknown> {
            return {
                name: "onMessage", type: "remote",
                parameters: [], return: { type: { name: "anydata|error" } }, ...over,
            };
        }

        function line(result: string, needle: string): string {
            const found = result.split("\n").find((l) => l.includes(needle));
            assert.ok(found, `no line containing "${needle}" in:\n${result}`);
            return found!;
        }

        function noLine(result: string, needle: string): void {
            assert.ok(!result.includes(needle), `unexpected "${needle}" in:\n${result}`);
        }

        // ---- §2/§3 the two required doc fields ----

        test("§3: a service type's doc leads the declaration's documentation", () => {
            // The spec makes `doc` required on every service type — `concrete` ones included — precisely so
            // a top-level construct is self-describing. Nothing else in the catalog carries it: a marker
            // service type's own symbol has no doc comment to read.
            const result = renderService(service({
                description: "An HTTP service. Each resource method is one endpoint.",
            }));
            assert.strictEqual(line(result, "An HTTP service").trim(),
                "# An HTTP service. Each resource method is one endpoint.");
            // A Ballerina doc comment opens with the description of what it documents.
            const lines = result.split("\n").filter((l) => l.startsWith("#"));
            assert.strictEqual(lines[0], "# An HTTP service. Each resource method is one endpoint.");
        });

        test("§2: a listener's doc is attributed, never left to read as the service's", () => {
            const result = renderService(service({
                description: "An HTTP service.",
                listener: { ...httpListener, description: "Dispatches each inbound request." },
            }));
            assert.strictEqual(line(result, "Dispatches each inbound").trim(),
                "# Listener `http:Listener`: Dispatches each inbound request.");
        });

        test("§2/§3: a document stating neither doc renders exactly as it did before", () => {
            const result = renderService(service());
            noLine(result, "# Listener `http:Listener`:");
            assert.ok(result.includes("service http:Service on new http:Listener()"), result);
        });

        test("§2/§3: the docs precede the §8 annotation block, as Ballerina metadata requires", () => {
            const result = renderService(service({
                description: "An HTTP service.",
                listener: { ...httpListener, description: "Dispatches each inbound request." },
                annotations: [{ name: "ServiceConfig", presence: "optional", attachPoint: "service" }],
            }));
            const rendered = result.split("\n");
            const doc = rendered.findIndex((l) => l.includes("An HTTP service."));
            const listenerDoc = rendered.findIndex((l) => l.includes("Listener `http:Listener`:"));
            const attachment = rendered.findIndex((l) => l.startsWith("@http:ServiceConfig"));
            assert.ok(doc >= 0 && listenerDoc > doc && attachment > listenerDoc,
                `expected doc < listener doc < annotation, got ${doc}/${listenerDoc}/${attachment}`);
        });

        test("§2/§3: an unattachable service type carries its docs too", () => {
            // A type reached as the return of another service's resource needs saying what it is for MORE
            // than an attachable one, since no `service … on new …` line names it.
            const result = renderService(service({
                notListenerAttachable: true,
                description: "The WebSocket connection service returned by the upgrade handler.",
                listener: { ...httpListener, description: "Accepts the upgrade request." },
            }));
            assert.ok(result.includes("# The WebSocket connection service returned by the upgrade handler."),
                result);
            assert.ok(result.includes("# Listener `http:Listener`: Accepts the upgrade request."), result);
            assert.ok(result.includes("service class ServiceImpl {"), result);
        });

        // ---- §2 the other listeners a service type may attach to ----

        test("§2: a service type hosted by several listeners says which others it may attach to", () => {
            // mcp is the corpus case: all four of its service types are listed under both
            // StreamableHttpListener and Listener, so a reader asking for the stdio transport would
            // otherwise be shown only the HTTP one with nothing saying the other exists.
            const result = renderService(service({
                listener: { name: "mcp:StreamableHttpListener", parameters: [] },
                alternativeListeners: ["mcp:Listener"],
            }));
            assert.strictEqual(line(result, "may attach to").trim(),
                "# This service type may attach to `mcp:Listener` instead of "
                + "`mcp:StreamableHttpListener`, which the declaration below uses.");
            // One entry, not one per listener: the two would differ by a single token.
            assert.strictEqual(result.split("\n").filter((l) => l.startsWith("service ")).length, 1);
        });

        test("§2: a single-listener document states nothing, which is every other library", () => {
            const result = renderService(service());
            noLine(result, "may attach to");
        });

        // ---- §9.1 the return's own data binding ----

        test("§9.1: a bare return binding says the declared type may replace the bound", () => {
            // The union already names `anydata`; what the document adds is that a reader may write
            // something narrower in its place, which is the whole content of §9.1 and is stated nowhere
            // else. It is deliberately NOT suppressed for being "already visible" the way a parameter's is.
            const result = renderService(service({
                methods: [method({
                    return: {
                        type: { name: "anydata|error" },
                        binding: { typedescs: [{ constraint: { name: "anydata" },
                            shapes: [{ form: "bare" }] }] },
                    },
                })],
            }));
            assert.strictEqual(line(result, "member of the return").trim(),
                "# The `anydata` member of the return may be narrowed: declare the concrete type you"
                + " return in place of `anydata`.");
        });

        test("§9.1: a streamed return binds its element, not the stream", () => {
            // graphql's subscription. Reading the shape as bare would tell a reader to declare a plain
            // return type where the language requires a stream.
            const result = renderService(service({
                methods: [method({
                    return: {
                        type: { name: "stream<anydata, error?>" },
                        binding: { typedescs: [{ constraint: { name: "anydata" },
                            shapes: [{ form: "stream", element: "bare" }] }] },
                    },
                })],
            }));
            assert.strictEqual(line(result, "returned stream").trim(),
                "# The returned stream's `anydata` element may be narrowed: declare the concrete element"
                + " type in place of `anydata`.");
        });

        test("§9.1: a batched return binds its element", () => {
            const result = renderService(service({
                methods: [method({
                    return: {
                        type: { name: "anydata[]|error" },
                        binding: { typedescs: [{ constraint: { name: "anydata" },
                            shapes: [{ form: "array", element: "bare" }] }] },
                    },
                })],
            }));
            assert.strictEqual(line(result, "returned array").trim(),
                "# The returned array's `anydata` element may be narrowed: declare the concrete element"
                + " type in place of `anydata`.");
        });

        test("§9.1/§1.4: an envelope naming a subtype family says so", () => {
            // http's StatusCodeResponse. Without the family clause the note names one record, and a reader
            // told to include `*http:StatusCodeResponse;` writes something no HTTP resource returns.
            const result = renderService(service({
                methods: [method({
                    return: {
                        type: { name: "anydata|error" },
                        binding: { typedescs: [{
                            constraint: { name: "anydata" },
                            shapes: [{
                                form: "included",
                                envelope: { name: "StatusCodeResponse", subtypeFamily: true },
                                bindableFields: ["body"],
                            }],
                        }] },
                    },
                })],
            }));
            assert.strictEqual(line(result, "may instead be").trim(),
                "# The return may instead be a record that includes `*http:StatusCodeResponse;` — or any"
                + " subtype of `http:StatusCodeResponse` — and overrides only `body`.");
        });

        test("§9.1: an envelope that is one exact record states no family", () => {
            const result = renderService(service({
                methods: [method({
                    return: {
                        type: { name: "anydata|error" },
                        binding: { typedescs: [{
                            constraint: { name: "anydata" },
                            shapes: [{ form: "included", envelope: { name: "Envelope" },
                                bindableFields: ["body"] }],
                        }] },
                    },
                })],
            }));
            assert.strictEqual(line(result, "may instead be").trim(),
                "# The return may instead be a record that includes `*http:Envelope;` and overrides only"
                + " `body`.");
            noLine(result, "any subtype of");
        });

        test("§9.1: a return exclusion survives, because nothing else can state a prohibition", () => {
            // Latent: no corpus return declares one, and §9.1 keeps the field legal. A document that
            // starts using it must not lose it silently.
            const result = renderService(service({
                methods: [method({
                    return: {
                        type: { name: "anydata|error" },
                        binding: { typedescs: [{
                            constraint: { name: "anydata" },
                            // Carries the `internal` link the pipeline attaches to a home-module type;
                            // that link is what tells the renderer to write the alias back on.
                            excludes: [{ name: "Response",
                                links: [{ category: "internal", recordName: "Response" }] }],
                            shapes: [{ form: "bare" }],
                        }] },
                    },
                })],
            }));
            assert.strictEqual(line(result, "must never be").trim(),
                "# ...but the return must never be http:Response.");
        });

        test("§9.1: a return with no binding states nothing", () => {
            const result = renderService(service({ methods: [method()] }));
            noLine(result, "may be narrowed");
            noLine(result, "may instead be");
        });

        test("§9.1: a handler template's return binding is stated too", () => {
            // A wildcard catalog is the ONLY shape such a service type renders, and every corpus return
            // binding but four sits on one — graphql's three operations, grpc's four RPC kinds, mcp's
            // tool, http's resource. Omitting it here would lose the construct for most of the corpus.
            const result = renderService(service({
                handlerTemplates: [method({
                    name: "*",
                    return: {
                        type: { name: "anydata|error" },
                        binding: { typedescs: [{ constraint: { name: "anydata" },
                            shapes: [{ form: "bare" }] }] },
                    },
                })],
            }));
            assert.strictEqual(line(result, "member of the return").trim(),
                "// The `anydata` member of the return may be narrowed: declare the concrete type you"
                + " return in place of `anydata`.");
        });

        // ---- §1.4 on a parameter's binding ----

        test("§1.4: a parameter envelope naming a subtype family says so", () => {
            const result = renderService(service({
                methods: [method({
                    parameters: [{
                        name: "payload", description: "", optional: false,
                        type: { name: "anydata" },
                        binding: { typedescs: [{
                            constraint: { name: "anydata" },
                            shapes: [{ form: "included", envelope: { name: "Envelope", subtypeFamily: true },
                                bindableFields: ["body"] }],
                        }] },
                    }],
                })],
            }));
            assert.strictEqual(line(result, "may bind to a record").trim(),
                "# `payload` may bind to a record that includes `*http:Envelope;` — or any subtype of"
                + " `http:Envelope` — and overrides only `body`");
        });

        test("§1.4: an excluded subtype family is prohibited as a family", () => {
            // The prohibition has to cover the family or it does not do its job: a user record that merely
            // IS a StatusCodeResponse would otherwise still satisfy the bare variant.
            const result = renderService(service({
                methods: [method({
                    parameters: [{
                        name: "payload", description: "", optional: false,
                        type: { name: "anydata" },
                        binding: { typedescs: [{
                            constraint: { name: "anydata" },
                            excludes: [{ name: "Envelope", subtypeFamily: true,
                                links: [{ category: "internal", recordName: "Envelope" }] }],
                            shapes: [{ form: "array", element: "bare" }],
                        }] },
                    }],
                })],
            }));
            assert.ok(line(result, "but never").includes(
                "but never http:Envelope (or any subtype of it)"), `got:\n${result}`);
        });
    });
});
