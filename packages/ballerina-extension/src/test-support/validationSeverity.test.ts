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

/**
 * @jest-environment node
 *
 * ValidationSeverity is a plain Java enum, so LSP4J puts its ordinal on the wire (ERROR = 0) while
 * the webview type declares the name. Filtering on "ERROR" alone matched nothing, so every
 * save-time refusal was reclassified as a warning and the form closed on a submit that wrote no
 * source. A type check cannot catch this — the wire value is `any` by the time it arrives.
 */

import { isBlockingSeverity } from "../rpc-managers/service-designer/validationSeverity";

describe("isBlockingSeverity", () => {
    it("treats the ERROR ordinal as blocking", () => {
        expect(isBlockingSeverity(0)).toBe(true);
    });

    it("treats the ERROR name as blocking", () => {
        expect(isBlockingSeverity("ERROR")).toBe(true);
    });

    it("does not block on the WARNING ordinal", () => {
        expect(isBlockingSeverity(1)).toBe(false);
    });

    it("does not block on the WARNING name", () => {
        expect(isBlockingSeverity("WARNING")).toBe(false);
    });

    it("blocks on an unrecognised severity rather than letting it through", () => {
        expect(isBlockingSeverity(undefined)).toBe(true);
    });
});
