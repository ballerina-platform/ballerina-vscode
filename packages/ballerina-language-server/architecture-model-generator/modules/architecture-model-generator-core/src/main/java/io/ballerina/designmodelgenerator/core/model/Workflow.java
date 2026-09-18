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

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;

/**
 * Represents a workflow function (a function annotated with {@code @workflow:Workflow}) in the design model.
 *
 * @since 1.0.0
 */
public final class Workflow extends DesignGraphNode {

    /** A plain {@code @workflow:Workflow} function. */
    public static final String KIND_WORKFLOW = "WORKFLOW";
    /** A module-level {@code workflow:DurableAgent} declaration. */
    public static final String KIND_DURABLE_AGENT = "DURABLE_AGENT";

    private final String symbol;
    private final Location location;
    private final String kind;
    private final Set<String> attachedServices;
    private final Set<String> attachedFunctions;
    private final List<Event> events;
    private final List<HumanTask> humanTasks;
    private final Set<String> activities;
    // Connections used directly by the entity (e.g. a durable agent's model provider);
    // the overview draws workflow -> connection edges for these plus the activity-derived set.
    private final Set<String> connections;
    private final Set<String> invalidSendDataServices;
    private final Set<String> invalidSendDataFunctions;
    private String role;
    private List<ActivityDecl> activityDecls;
    private List<String> tools;
    private List<String> mcpToolKits;
    private List<PeerDecl> peers;
    private Set<String> delegatesTo;
    private Set<String> toolConnections;
    private Map<String, String> agentTools;

    public Workflow(String symbol, String sortText, Location location) {
        this(symbol, sortText, location, KIND_WORKFLOW);
    }

    public Workflow(String symbol, String sortText, Location location, String kind) {
        super(true, sortText);
        this.symbol = symbol;
        this.location = location;
        this.kind = kind;
        this.attachedServices = new HashSet<>();
        this.attachedFunctions = new HashSet<>();
        this.events = new ArrayList<>();
        this.humanTasks = new ArrayList<>();
        this.activities = new HashSet<>();
        this.connections = new HashSet<>();
        this.invalidSendDataServices = new HashSet<>();
        this.invalidSendDataFunctions = new HashSet<>();
    }

    public String getKind() {
        return kind;
    }

    public Set<String> getConnections() {
        return connections;
    }

    public void addConnection(String connectionUuid) {
        this.connections.add(connectionUuid);
    }

    public Set<String> getInvalidSendDataServices() {
        return invalidSendDataServices;
    }

    public Set<String> getInvalidSendDataFunctions() {
        return invalidSendDataFunctions;
    }

    public void addInvalidSendDataService(String serviceUuid) {
        this.invalidSendDataServices.add(serviceUuid);
    }

    public void addInvalidSendDataFunction(String functionUuid) {
        this.invalidSendDataFunctions.add(functionUuid);
    }

    public String getSymbol() {
        return symbol;
    }

    public Location getLocation() {
        return location;
    }

    public Set<String> getAttachedServices() {
        return attachedServices;
    }

    public Set<String> getAttachedFunctions() {
        return attachedFunctions;
    }

    public void addAttachedService(String serviceUuid) {
        this.attachedServices.add(serviceUuid);
    }

    public void addAttachedFunction(String functionUuid) {
        this.attachedFunctions.add(functionUuid);
    }

    public List<Event> getEvents() {
        return events;
    }

    public Optional<Event> getEvent(String name) {
        return events.stream().filter(event -> event.name.equals(name)).findFirst();
    }

    public void addEvent(Event event) {
        this.events.add(event);
    }

    public List<HumanTask> getHumanTasks() {
        return humanTasks;
    }

    public void addHumanTask(HumanTask humanTask) {
        if (!this.humanTasks.contains(humanTask)) {
            this.humanTasks.add(humanTask);
        }
    }

    public Set<String> getActivities() {
        return activities;
    }

    public void addActivity(String activityUuid) {
        this.activities.add(activityUuid);
    }

    public String getRole() {
        return role;
    }

    public void setRole(String role) {
        this.role = role;
    }

    public List<ActivityDecl> getActivityDecls() {
        return activityDecls;
    }

    public void addActivityDecl(ActivityDecl activityDecl) {
        if (this.activityDecls == null) {
            this.activityDecls = new ArrayList<>();
        }
        this.activityDecls.add(activityDecl);
    }

    public List<String> getTools() {
        return tools;
    }

    public void addTool(String toolFunctionName) {
        if (this.tools == null) {
            this.tools = new ArrayList<>();
        }
        this.tools.add(toolFunctionName);
    }

    public List<String> getMcpToolKits() {
        return mcpToolKits;
    }

    public void addMcpToolKit(String label) {
        if (this.mcpToolKits == null) {
            this.mcpToolKits = new ArrayList<>();
        }
        if (!this.mcpToolKits.contains(label)) {
            this.mcpToolKits.add(label);
        }
    }

    public List<PeerDecl> getPeers() {
        return peers;
    }

    public void addPeer(PeerDecl peer) {
        if (this.peers == null) {
            this.peers = new ArrayList<>();
        }
        this.peers.add(peer);
    }

    public Set<String> getDelegatesTo() {
        return delegatesTo;
    }

    public void addDelegatesTo(String agentUuid) {
        if (this.delegatesTo == null) {
            this.delegatesTo = new HashSet<>();
        }
        this.delegatesTo.add(agentUuid);
    }

    public Set<String> getToolConnections() {
        return toolConnections;
    }

    public void addToolConnection(String connectionUuid) {
        if (this.toolConnections == null) {
            this.toolConnections = new HashSet<>();
        }
        this.toolConnections.add(connectionUuid);
    }

    public Map<String, String> getAgentTools() {
        return agentTools;
    }

    public void addAgentTool(String toolFunctionName, String agentUuid) {
        if (this.agentTools == null) {
            this.agentTools = new HashMap<>();
        }
        this.agentTools.put(toolFunctionName, agentUuid);
    }

    /**
     * Represents an external data event a workflow waits on: a {@code future<T>} field of the workflow function's
     * events record parameter. Senders are the automation/service functions calling {@code workflow:sendData} with
     * the matching data name.
     */
    public static final class Event {

        private final String name;
        private final String type;
        private final Set<String> attachedServices;
        private final Set<String> attachedFunctions;

        public Event(String name, String type) {
            this.name = name;
            this.type = type;
            this.attachedServices = new HashSet<>();
            this.attachedFunctions = new HashSet<>();
        }

        public String getName() {
            return name;
        }

        public String getType() {
            return type;
        }

        public Set<String> getAttachedServices() {
            return attachedServices;
        }

        public Set<String> getAttachedFunctions() {
            return attachedFunctions;
        }

        public void addAttachedService(String serviceUuid) {
            this.attachedServices.add(serviceUuid);
        }

        public void addAttachedFunction(String functionUuid) {
            this.attachedFunctions.add(functionUuid);
        }
    }

    /**
     * A human task, either awaited inside a workflow function via {@code ctx->awaitHumanTask(...)} or declared
     * in a {@code workflow:DurableAgent}'s {@code humanTasks} mapping.
     *
     * @param name      the task's name
     * @param location  where the task is declared or awaited
     * @param userRoles the roles that may complete the task, or {@code null} if not gated
     * @param title     the task's display title, or {@code null} when awaited rather than declared
     */
    public record HumanTask(String name, Location location, List<String> userRoles, String title) {

        public HumanTask(String name, Location location) {
            this(name, location, null, null);
        }
    }

    /**
     * A {@code workflow:DurableAgent} activity declared in its {@code activities} mapping.
     *
     * @param name             the activity's name
     * @param requiresApproval whether a human must approve the activity's result
     * @param userRoles        the roles that may approve it, or {@code null} if not gated
     */
    public record ActivityDecl(String name, boolean requiresApproval, List<String> userRoles) {
    }

    /**
     * A {@code workflow:DurableAgent} peer declared in its {@code peers} mapping.
     *
     * @param name             the peer's name
     * @param agentUuid        the uuid of the agent connection the peer hands off to
     * @param requiresApproval whether a human must approve the hand-off
     * @param userRoles        the roles that may approve it, or {@code null} if not gated
     */
    public record PeerDecl(String name, String agentUuid, boolean requiresApproval, List<String> userRoles) {
    }

    @Override
    public int hashCode() {
        return Objects.hash(symbol, location, attachedServices.size(), attachedFunctions.size(),
                events.size(), humanTasks.size(), activities.size(),
                invalidSendDataServices.size(), invalidSendDataFunctions.size());
    }

    @Override
    public boolean equals(Object obj) {
        if (!(obj instanceof Workflow workflow)) {
            return false;
        }
        return Objects.equals(workflow.symbol, this.symbol)
                && Objects.equals(workflow.location, this.location)
                && workflow.attachedServices.size() == this.attachedServices.size()
                && workflow.attachedFunctions.size() == this.attachedFunctions.size()
                && workflow.events.size() == this.events.size()
                && workflow.humanTasks.size() == this.humanTasks.size()
                && workflow.activities.size() == this.activities.size()
                && workflow.invalidSendDataServices.size() == this.invalidSendDataServices.size()
                && workflow.invalidSendDataFunctions.size() == this.invalidSendDataFunctions.size();
    }
}
