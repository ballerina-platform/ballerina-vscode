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

// A trigger only carries its start point, so the jump-to-source range is a zero-width point
// at that line/offset -- the same shape ComponentDiagram's goToView uses for a plain source jump.
export function triggerLocation(trigger: TriggerSelection) {
    return {
        documentUri: trigger.filePath,
        position: {
            startLine: trigger.position.line,
            startColumn: trigger.position.offset,
            endLine: trigger.position.line,
            endColumn: trigger.position.offset,
        },
    };
}
