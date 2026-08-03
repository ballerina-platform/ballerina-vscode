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

import java.util.HashSet;
import java.util.Objects;
import java.util.Set;

/**
 * Represents a workflow activity (a function annotated with {@code @workflow:Activity}) in the design model.
 *
 * @since 1.0.0
 */
public final class Activity extends DesignGraphNode {

    private final String symbol;
    private final Location location;
    private final Set<String> connections;
    private final Set<String> attachedWorkflows;

    public Activity(String symbol, String sortText, Location location) {
        super(true, sortText);
        this.symbol = symbol;
        this.location = location;
        this.connections = new HashSet<>();
        this.attachedWorkflows = new HashSet<>();
    }

    public String getSymbol() {
        return symbol;
    }

    public Location getLocation() {
        return location;
    }

    public Set<String> getConnections() {
        return connections;
    }

    public Set<String> getAttachedWorkflows() {
        return attachedWorkflows;
    }

    public void addConnection(String connectionUuid) {
        this.connections.add(connectionUuid);
    }

    public void addAttachedWorkflow(String workflowUuid) {
        this.attachedWorkflows.add(workflowUuid);
    }

    @Override
    public int hashCode() {
        return Objects.hash(symbol, location, connections.size(), attachedWorkflows.size());
    }

    @Override
    public boolean equals(Object obj) {
        if (!(obj instanceof Activity activity)) {
            return false;
        }
        return Objects.equals(activity.symbol, this.symbol)
                && Objects.equals(activity.location, this.location)
                && activity.connections.size() == this.connections.size()
                && activity.attachedWorkflows.size() == this.attachedWorkflows.size();
    }
}
