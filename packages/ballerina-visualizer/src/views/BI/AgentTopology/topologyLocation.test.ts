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

import type { TriggerSelection } from "@wso2/component-diagram";
import { triggerLocation } from "./topologyLocation";

describe("triggerLocation", () => {
    it("spans the handler's whole range when the trigger carries its end", () => {
        const trigger: TriggerSelection = { filePath: "/proj/services.bal", position: { line: 12, offset: 4 }, endPosition: { line: 20, offset: 5 } };

        expect(triggerLocation(trigger)).toEqual({
            documentUri: "/proj/services.bal",
            position: { startLine: 12, startColumn: 4, endLine: 20, endColumn: 5 },
        });
    });

    it("falls back to a zero-width point at the start when no end is known", () => {
        const trigger: TriggerSelection = { filePath: "/proj/services.bal", position: { line: 12, offset: 4 } };

        expect(triggerLocation(trigger).position).toEqual({ startLine: 12, startColumn: 4, endLine: 12, endColumn: 4 });
    });
});
