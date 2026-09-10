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

import type { ProjectStructureArtifactResponse } from "@wso2/ballerina-core";
import type { TriggerSelection } from "@wso2/component-diagram";

// The handler's whole range when the trigger carries its end, as the focus rail's usage tiles send; a bare start
// point inside an ai:Service resolves to the service instead of the resource.
export function triggerLocation(trigger: TriggerSelection) {
    const end = trigger.endPosition ?? trigger.position;
    return {
        documentUri: trigger.filePath,
        position: {
            startLine: trigger.position.line,
            startColumn: trigger.position.offset,
            endLine: end.line,
            endColumn: end.offset,
        },
    };
}

// The artifact resolver matches on the declaration's exact start, so the whole range is sent.
export function agentLocation(agent: ProjectStructureArtifactResponse) {
    return { documentUri: agent.path, position: agent.position };
}
