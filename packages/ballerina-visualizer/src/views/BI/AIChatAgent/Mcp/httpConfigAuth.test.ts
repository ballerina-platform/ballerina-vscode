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
 *
 * @jest-environment node
 */

import { readHttpConfigAuth, writeHttpConfigAuth } from "./httpConfigAuth";

describe("readHttpConfigAuth", () => {
    it("reads no auth from an empty value", () => {
        expect(readHttpConfigAuth(undefined)).toEqual({ kind: "record", auth: "" });
        expect(readHttpConfigAuth("  ")).toEqual({ kind: "record", auth: "" });
        expect(readHttpConfigAuth("{}")).toEqual({ kind: "record", auth: "" });
    });

    it("reads the auth entry among other entries", () => {
        const httpConfig = `{timeout: 10, auth: {token: "a,b}"}, retryConfig: {count: 3}}`;
        expect(readHttpConfigAuth(httpConfig)).toEqual({ kind: "record", auth: `{token: "a,b}"}` });
    });

    it("ignores auth inside a nested record", () => {
        expect(readHttpConfigAuth(`{proxy: {auth: {}}}`)).toEqual({ kind: "record", auth: "" });
    });

    it("reads a field name given alone as the variable of that name", () => {
        expect(readHttpConfigAuth(`{timeout: 10, auth}`)).toEqual({ kind: "record", auth: "auth" });
    });

    it("reads past comments and string keys with colons", () => {
        const httpConfig = `{
    timeout: 10, // seconds, not millis: {see docs}
    // the token below
    auth: {token: "a//b"},
    "x:y": 1
}`;
        expect(readHttpConfigAuth(httpConfig)).toEqual({ kind: "record", auth: `{token: "a//b"}` });
    });

    it("treats a variable or call as an expression", () => {
        expect(readHttpConfigAuth("myHttpConfig")).toEqual({ kind: "expression" });
        expect(readHttpConfigAuth("getConfig({a: 1})")).toEqual({ kind: "expression" });
        expect(readHttpConfigAuth("{a: 1} ?: {}")).toEqual({ kind: "expression" });
    });
});

describe("writeHttpConfigAuth", () => {
    it("adds auth to an empty value", () => {
        expect(writeHttpConfigAuth(undefined, `{token: "t"}`)).toBe(`{auth: {token: "t"}}`);
        expect(writeHttpConfigAuth("{}", `{token: "t"}`)).toBe(`{auth: {token: "t"}}`);
    });

    it("replaces auth and keeps the other entries", () => {
        expect(writeHttpConfigAuth(`{timeout: 10, auth: {token: "old"}}`, `{token: "new"}`))
            .toBe(`{timeout: 10, auth: {token: "new"}}`);
    });

    it("removes auth when it is empty", () => {
        expect(writeHttpConfigAuth(`{timeout: 10, auth: {token: "t"}}`, "")).toBe(`{timeout: 10}`);
        expect(writeHttpConfigAuth(`{auth: {token: "t"}}`, "")).toBe("{}");
        expect(writeHttpConfigAuth("", "")).toBe("");
    });

    it("replaces a field name given alone instead of adding a second auth", () => {
        expect(writeHttpConfigAuth(`{timeout: 10, auth}`, `{token: "t"}`)).toBe(`{timeout: 10, auth: {token: "t"}}`);
    });

    it("keeps a value written over several lines, with its comments, on several lines", () => {
        const httpConfig = `{
    timeout: 10, // seconds
    retryConfig: {count: 3} // retries
}`;
        expect(writeHttpConfigAuth(httpConfig, `{token: "t"}`)).toBe(`{
    timeout: 10, // seconds
    retryConfig: {count: 3}, // retries
    auth: {token: "t"}
}`);
    });

    it("keeps a comment on its own last line after the entries", () => {
        const httpConfig = `{
    timeout: 10,
    auth: {token: "old"}
    // more settings later
}`;
        expect(writeHttpConfigAuth(httpConfig, `{token: "new"}`)).toBe(`{
    timeout: 10,
    auth: {token: "new"}
    // more settings later
}`);
        expect(writeHttpConfigAuth(httpConfig, "")).toBe(`{
    timeout: 10
    // more settings later
}`);
        expect(readHttpConfigAuth(httpConfig)).toEqual({ kind: "record", auth: `{token: "old"}` });
    });

    it("cannot change a variable", () => {
        expect(writeHttpConfigAuth("myHttpConfig", `{token: "t"}`)).toBeUndefined();
    });

    it("round-trips with readHttpConfigAuth", () => {
        const updated = writeHttpConfigAuth(`{timeout: 10}`, `{username: "u", password: "p"}`);
        expect(readHttpConfigAuth(updated)).toEqual({ kind: "record", auth: `{username: "u", password: "p"}` });
    });
});
