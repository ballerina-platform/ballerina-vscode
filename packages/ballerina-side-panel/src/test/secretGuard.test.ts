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

import { isSensitiveField, looksLikeCredential, shouldWithhold } from "../components/editors/FieldAssist/secretGuard";

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

    it.each([
        ["sk-ant-api03-abcdefghijklmnopqrstuv", true],
        ["ghp_abcdefghijklmnopqrstuvwxyz0123", true],
        ["AKIAABCDEFGHIJKLMNOP", true],
        ["use 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08 here", true],
        ["set it to 5f4dcc3b5aa765d61d8327deb882cf99", true],
        ["set it to q3Xk9mZ+Lw2pV8rT1yN6bH4sJ0cF7gA5dE2iK9oU3wQ=", true],
        ["set it to wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY", true],
        ["ord.customer.firstName + \" \" + ord.customer.lastName", false],
        ["make it uppercase and trim the spaces", false],
        ["read /Users/me/projects/order-service1/resources/data.json", false],
        ["https://api.example.com/v2/customers/orders/pending/items", false],
        ["check_out_order_items_for_customer_2", false],
    ])("reads %p as a credential: %p", (text, credential) => {
        expect(looksLikeCredential(text)).toBe(credential);
    });

    it("withholds literals in sensitive fields but not references to configurables", () => {
        expect(shouldWithhold("\"hunter2\"", true)).toBe(true);
        expect(shouldWithhold("anthropicApiKey", true)).toBe(false);
        expect(shouldWithhold("\"localhost\"", false)).toBe(false);
        expect(shouldWithhold("\"sk-abcdefghijklmnopqrstuvwx\"", false)).toBe(true);
    });
});
