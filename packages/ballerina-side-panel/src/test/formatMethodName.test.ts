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

import { formatMethodName } from "../utils/formatMethodName";

describe("formatMethodName", () => {
    it("splits camelCase and snake_case into words", () => {
        expect(formatMethodName("basicAck")).toBe("Basic Ack");
        expect(formatMethodName("onMessage")).toBe("On Message");
        expect(formatMethodName("get_user_url")).toBe("Get User URL");
    });

    it("strips every leading special character", () => {
        expect(formatMethodName("'commit")).toBe("Commit");
        expect(formatMethodName("__weird_name")).toBe("Weird Name");
    });

    it("keeps an existing all-caps word as-is", () => {
        expect(formatMethodName("HTTPRequest")).toBe("HTTP Request");
        expect(formatMethodName("parseJSON")).toBe("Parse JSON");
        expect(formatMethodName("toXML")).toBe("To XML");
    });

    it("upper-cases a known acronym that arrives lower-cased", () => {
        expect(formatMethodName("getUserId")).toBe("Get User ID");
        expect(formatMethodName("deleteAcl")).toBe("Delete ACL");
        expect(formatMethodName("sendSms")).toBe("Send SMS");
        expect(formatMethodName("listSqlDatabases")).toBe("List SQL Databases");
    });

    it("breaks a word at a digit-to-uppercase boundary", () => {
        expect(formatMethodName("method2Call")).toBe("Method2 Call");
    });

    it("lower-cases trailing words in sentence casing, acronyms excepted", () => {
        expect(formatMethodName("createPresignedUrl", { casing: "sentence" })).toBe("Create presigned URL");
        expect(formatMethodName("getUserId", { casing: "sentence" })).toBe("Get user ID");
        expect(formatMethodName("HTTPRequest", { casing: "sentence" })).toBe("HTTP request");
    });

    it("returns an empty string for a missing name", () => {
        expect(formatMethodName("")).toBe("");
        expect(formatMethodName(undefined as unknown as string)).toBe("");
        expect(formatMethodName(42 as unknown as string)).toBe("");
    });

    it("falls back to the original when nothing survives cleaning", () => {
        expect(formatMethodName("'''")).toBe("'''");
    });

    it("trims surrounding whitespace", () => {
        expect(formatMethodName("  spaced  ")).toBe("Spaced");
    });
});
