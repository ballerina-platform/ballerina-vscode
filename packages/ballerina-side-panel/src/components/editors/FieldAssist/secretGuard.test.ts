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

import { looksLikeCredential } from "./secretGuard";

describe("looksLikeCredential", () => {
    it("ignores paths, URLs and snake_case names", () => {
        expect(looksLikeCredential("read /Users/me/projects/order-service1/resources/data.json")).toBe(false);
        expect(looksLikeCredential("https://api.example.com/v2/customers/orders/pending/items")).toBe(false);
        expect(looksLikeCredential("check_out_order_items_for_customer_2")).toBe(false);
    });

    it("catches generated keys", () => {
        [
            "5f4dcc3b5aa765d61d8327deb882cf99",
            "q3Xk9mZ+Lw2pV8rT1yN6bH4sJ0cF7gA5dE2iK9oU3wQ=",
            "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
        ].forEach((key) => expect(looksLikeCredential(`set it to ${key}`)).toBe(true));
    });
});
