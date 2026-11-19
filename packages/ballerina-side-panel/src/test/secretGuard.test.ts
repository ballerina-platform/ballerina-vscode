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

import { isSecretField, isSensitiveField, looksLikeCredential, shouldWithhold } from "../components/editors/FieldAssist/secretGuard";

describe("secretGuard", () => {
    it("recognises fields named for secrets", () => {
        expect(isSensitiveField("Api Key", "apiKey")).toBe(true);
        expect(isSensitiveField("Client Secret")).toBe(true);
        expect(isSensitiveField("Password")).toBe(true);
        expect(isSensitiveField("Base URL", "serviceUrl")).toBe(false);
        expect(isSensitiveField("Access Token", "accessToken")).toBe(true);
        expect(isSensitiveField("Maximum Tokens", "maxTokens")).toBe(false);
        expect(isSensitiveField("Author", "author")).toBe(false);
    });

    it("treats only text fields of a string as secret fields", () => {
        const text = { fieldType: "TEXT", ballerinaType: "string" };
        expect(isSecretField({ key: "apiKey", label: "Api Key", types: [text, { fieldType: "EXPRESSION", ballerinaType: "string" }] })).toBe(true);
        expect(isSecretField({ key: "token", types: [{ ...text, ballerinaType: "string?" }] })).toBe(true);
        expect(isSecretField({ key: "auth", types: [{ fieldType: "EXPRESSION", ballerinaType: "http:BearerTokenConfig" }] })).toBe(false);
        expect(isSecretField({ key: "serviceUrl", types: [text] })).toBe(false);
    });

    it("recognises common credential formats and generated keys", () => {
        expect(looksLikeCredential("sk-ant-api03-abcdefghijklmnopqrstuv")).toBe(true);
        expect(looksLikeCredential("ghp_abcdefghijklmnopqrstuvwxyz0123")).toBe(true);
        expect(looksLikeCredential("AKIAABCDEFGHIJKLMNOP")).toBe(true);
        expect(looksLikeCredential("use 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08 here")).toBe(true);
        expect(looksLikeCredential("ord.customer.firstName + \" \" + ord.customer.lastName")).toBe(false);
        expect(looksLikeCredential("make it uppercase and trim the spaces")).toBe(false);
    });

    it("withholds literals in sensitive fields but not references to configurables", () => {
        expect(shouldWithhold("\"hunter2\"", true)).toBe(true);
        expect(shouldWithhold("anthropicApiKey", true)).toBe(false);
        expect(shouldWithhold("\"localhost\"", false)).toBe(false);
        expect(shouldWithhold("\"sk-abcdefghijklmnopqrstuvwx\"", false)).toBe(true);
    });
});
