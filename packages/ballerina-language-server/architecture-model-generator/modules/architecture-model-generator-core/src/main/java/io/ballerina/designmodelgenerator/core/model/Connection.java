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

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * Represents a module client declaration node.
 *
 * @since 1.0.0
 */
public class Connection extends DesignGraphNode {

    private final String symbol;
    private Location location;
    private final Scope scope;
    private final String icon;
    private final Set<String> dependentFunctions;
    private final Set<String> dependentConnection;
    private String kind = ConnectionKind.CONNECTION.toString();
    private Map<String, Object> metadata;
    private String role;
    private Set<String> delegatesTo;
    private Set<String> toolConnections;
    // Tool functions that hand the request to another agent: tool name to that agent's uuid.
    private Map<String, String> agentTools;
    private ModelProvider modelProvider;
    private MemoryStore memory;
    private String typeName;
    // MCP toolkits an agent lists as tools: the variable's name, or the server URL for an inline toolkit.
    private List<String> mcpToolKits;

    public Connection(String symbol, String sortText, Location location, Scope scope, String icon) {
        super(sortText);
        this.symbol = symbol;
        this.location = location;
        this.scope = scope;
        this.icon = icon;
        this.dependentFunctions = new HashSet<>();
        this.dependentConnection = new HashSet<>();
        this.metadata = null;
    }

    public Connection(String symbol, String sortText, Location location, Scope scope, String icon,
                      boolean enableFlow) {
        super(enableFlow, sortText);
        this.symbol = symbol;
        this.location = location;
        this.scope = scope;
        this.icon = icon;
        this.dependentFunctions = new HashSet<>();
        this.dependentConnection = new HashSet<>();
        this.metadata = null;
    }

    public Connection(String symbol, String sortText, Location location, Scope scope, String icon,
                      boolean enableFlow, ConnectionKind kind) {
        super(enableFlow, sortText);
        this.symbol = symbol;
        this.location = location;
        this.scope = scope;
        this.icon = icon;
        this.kind = kind.toString();
        this.dependentFunctions = new HashSet<>();
        this.dependentConnection = new HashSet<>();
        this.metadata = null;
    }

    public enum Scope {
        LOCAL,
        GLOBAL
    }

    public String getIcon() {
        return icon;
    }

    public void setLocation(Location location) {
        this.location = location;
    }

    public String getSymbol() {
        return symbol;
    }

    public Location getLocation() {
        return location;
    }

    public Scope getScope() {
        return scope;
    }

    public Set<String> getDependentFunctions() {
        return dependentFunctions;
    }

    public void addDependentFunction(String dependentFunction) {
        dependentFunctions.add(dependentFunction);
    }

    public Set<String> getDependentConnection() {
        return dependentConnection;
    }

    public void addDependentConnection(String dependentConnection) {
        this.dependentConnection.add(dependentConnection);
    }

    public String getKind() {
        return kind;
    }

    public Set<String> getAllTransitiveDependentConnections(Map<String, Connection> uuidToConnectionMap) {
        Set<String> result = new HashSet<>();
        Set<String> visited = new HashSet<>();
        collectTransitiveDependencies(uuidToConnectionMap, visited, result);
        result.remove(this.getUuid());
        return result;
    }

    public void addMetadata(String key, Object value) {
        if (this.metadata == null) {
            this.metadata = new HashMap<>();
        }
        this.metadata.put(key, value);
    }

    public String getRole() {
        return role;
    }

    public void setRole(String role) {
        this.role = role;
    }

    public Set<String> getDelegatesTo() {
        return delegatesTo;
    }

    public ModelProvider getModelProvider() {
        return modelProvider;
    }

    public void setModelProvider(ModelProvider modelProvider) {
        this.modelProvider = modelProvider;
    }

    public MemoryStore getMemory() {
        return memory;
    }

    public void setMemory(MemoryStore memory) {
        this.memory = memory;
    }

    public String getTypeName() {
        return typeName;
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

    public void setTypeName(String typeName) {
        this.typeName = typeName;
    }

    /**
     * The memory store an agent is constructed with.
     *
     * @param symbol the memory variable's name, absent for an inline expression
     * @param type   the memory class name, e.g. MessageWindowChatMemory
     */
    public record MemoryStore(String symbol, String type) {
    }

    /**
     * The model provider an agent is constructed with.
     *
     * @param symbol the provider variable's name, absent for an inline expression
     * @param type   the provider class name, e.g. Wso2ModelProvider or OpenAiProvider
     * @param icon   the provider module's icon URL, absent for an inline default provider
     */
    public record ModelProvider(String symbol, String type, String icon) {
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

    public Map<String, String> getAgentTools() {
        return agentTools;
    }

    public void addAgentTool(String toolFunctionName, String agentUuid) {
        if (this.agentTools == null) {
            this.agentTools = new HashMap<>();
        }
        this.agentTools.put(toolFunctionName, agentUuid);
    }

    public void addToolConnection(String connectionUuid) {
        if (this.toolConnections == null) {
            this.toolConnections = new HashSet<>();
        }
        this.toolConnections.add(connectionUuid);
    }

    private void collectTransitiveDependencies(Map<String, Connection> uuidToConnectionMap,
                                               Set<String> visited, Set<String> result) {
        // Avoid processing the same connection multiple times (cycle detection)
        if (visited.contains(this.getUuid())) {
            return;
        }

        visited.add(this.getUuid());

        // Add all direct dependent connections
        result.addAll(this.dependentConnection);

        // Recursively process each dependent connection to get their transitive dependencies
        for (String dependentConnectionUuid : this.dependentConnection) {
            Connection dependentConnection = uuidToConnectionMap.get(dependentConnectionUuid);
            if (dependentConnection != null) {
                dependentConnection.collectTransitiveDependencies(uuidToConnectionMap, visited, result);
            }
        }
    }

    @Override
    public int hashCode() {
        return Objects.hash(symbol.hashCode(), location.hashCode(), scope.hashCode());
    }

    @Override
    public boolean equals(Object obj) {
        if (!(obj instanceof Connection connection)) {
            return false;
        }
        return Objects.equals(connection.getUuid(), this.getUuid());
    }
}
