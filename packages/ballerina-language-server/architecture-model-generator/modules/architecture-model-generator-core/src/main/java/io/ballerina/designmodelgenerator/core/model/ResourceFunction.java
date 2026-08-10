/*
 *  Copyright (c) 2024, WSO2 LLC. (http://www.wso2.com)
 *
 *  WSO2 LLC. licenses this file to you under the Apache License,
 *  Version 2.0 (the "License"); you may not use this file except
 *  in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing,
 *  software distributed under the License is distributed on an
 *  "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 *  KIND, either express or implied.  See the License for the
 *  specific language governing permissions and limitations
 *  under the License.
 */

package io.ballerina.designmodelgenerator.core.model;

import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * Represents a resource function definition node.
 *
 * @param accessor function accessor name
 * @param path path of the resource function
 * @param location location of the resource function
 * @param connections dependent connections of the resource function
 * @param workflows dependent workflows of the resource function (referenced via workflow:run())
 * @param workflowSendData workflow data events sent by the function via workflow:sendData(), keyed by workflow uuid
 * @param invalidWorkflowSendData uuids of workflows targeted by workflow:sendData() calls whose data event name is
 *                                unknown or does not match any event declared by the workflow function
 *
 * @since 1.0.0
 */
public record ResourceFunction(String accessor, String path, Location location, Set<String> connections,
                               Set<String> workflows, Map<String, Set<String>> workflowSendData,
                               Set<String> invalidWorkflowSendData) {

    @Override
    public int hashCode() {
        int connections = connections() != null ? connections().size() : 0;
        int workflows = workflows() != null ? workflows().size() : 0;
        int workflowSendData = workflowSendData() != null ? workflowSendData().size() : 0;
        int invalidWorkflowSendData = invalidWorkflowSendData() != null ? invalidWorkflowSendData().size() : 0;
        return Objects.hash(accessor().hashCode(), path().hashCode(), location().hashCode(), connections, workflows,
                workflowSendData, invalidWorkflowSendData);
    }
}
