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

import { useMemo } from "react";
import { cloneDeep } from "lodash";
import type { FlowNode } from "@wso2/ballerina-core";

/** The connection's node as its form shows it: without the description the connector's card already shows. */
export function formNodeOf(node: FlowNode): FlowNode {
    const formNode = cloneDeep(node);
    if (formNode?.metadata?.description) {
        delete formNode.metadata.description;
    }
    return formNode;
}

/**
 * The form's node, the same object for as long as the connection's node is: a new one on every render would make
 * the form start over each time the popup redraws (while saving, say). It would read the end of the file again,
 * where a connection just saved now sits, and check the connection's name against it, reporting the name taken.
 */
export function useFormNode(node: FlowNode | undefined): FlowNode | undefined {
    return useMemo(() => (node ? formNodeOf(node) : undefined), [node]);
}
