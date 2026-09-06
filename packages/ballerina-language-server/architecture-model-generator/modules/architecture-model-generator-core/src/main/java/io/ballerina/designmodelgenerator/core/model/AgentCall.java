/*
 *  Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com)
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

import java.util.List;

/**
 * Represents a call to an agent's {@code run} method within a function, in source order.
 *
 * @param connection uuid of the agent connection being called
 * @param line       source line of the call
 * @param groups     the enclosing if/match/fork/while/foreach constructs, outermost first; empty for a plain call
 *
 * @since 1.3.0
 */
public record AgentCall(String connection, int line, List<Group> groups) {

    /**
     * Groups agent calls that branch, run in parallel or repeat within the same enclosing construct.
     *
     * @param kind  "if", "match", "fork", "while" or "foreach"
     * @param id    identity of the enclosing construct, shared by every call in the same if/else-if/else chain,
     *              match statement, fork/named-worker block or loop body
     * @param label the branch condition, match pattern, worker name, while condition or foreach header
     */
    public record Group(String kind, String id, String label) {
    }
}
