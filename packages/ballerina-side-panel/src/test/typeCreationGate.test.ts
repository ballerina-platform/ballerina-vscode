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

// The type editor and the action type editor both offer creating a type through the completion
// list's default entry. A host that forbids it passes no handler, and a fix applied to one editor
// and not the other is exactly how the hole stayed open, so both ask this one function.

import { canOfferTypeCreation } from "../components/editors/typeCreationGate";

describe("canOfferTypeCreation", () => {
    const handler = () => undefined;

    it("offers the entry when the host allows creating types", () => {
        expect(canOfferTypeCreation(true, handler)).toBe(true);
    });

    it("withholds the entry when the host passes no handler", () => {
        expect(canOfferTypeCreation(true, undefined)).toBe(false);
    });

    it("withholds the entry when the editor would not show it anyway", () => {
        expect(canOfferTypeCreation(false, handler)).toBe(false);
    });
});
