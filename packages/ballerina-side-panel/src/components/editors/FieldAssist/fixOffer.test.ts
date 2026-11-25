/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { errorLines, offersFix } from "./AssistHost";

describe("form fix offer", () => {
    const field = (label: string) => ({ label, messages: [`${label} is wrong`] });

    it("leaves a single field error to that field's own Fix", () => {
        expect(offersFix({ fields: [field("Name")], outside: [] })).toBe(false);
        expect(offersFix(undefined)).toBe(false);
    });

    it("offers a fix for errors in two fields or one outside the fields", () => {
        expect(offersFix({ fields: [field("Name"), field("Expression")], outside: [] })).toBe(true);
        expect(offersFix({ fields: [], outside: ["unreachable code"] })).toBe(true);
    });

    it("labels field errors and keeps step errors bare", () => {
        expect(errorLines({ fields: [field("Name")], outside: ["unreachable code"] }))
            .toEqual(["Name: Name is wrong", "unreachable code"]);
    });
});
