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

package io.ballerina.flowmodelgenerator.core.model;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Represents a category of the available nodes.
 *
 * @param metadata metadata of the category
 * @param items    items in the category
 * @since 1.0.0
 */
public record Category(Metadata metadata, List<Item> items) implements Item {

    /**
     * Represents the name of a category which contains the metadata of the category.
     *
     * @since 1.0.0
     */
    public enum Name {
        ROOT("Root", "The topmost category of the palette", null),
        FLOW("Flow", "Flow control nodes", List.of("Core", "Control", "Flow")),
        STATEMENT("Statement", "Fundamental executable units in a program", null),
        CONNECTIONS("Connections", "The connections used in the flow", null),
        BRANCH("Branch", "Branching nodes", null),
        FLOWS("Flows", "Flows that invoke local or utility functions",
                List.of("Function", "Call", "Utility", "Local")),
        TERMINATION("Termination", "Termination nodes", null),
        ITERATION("Iteration", "Iteration nodes", null),
        CONTROL("Control", "Control nodes", null),
        CONCURRENCY("Concurrency", "Concurrency nodes", null),
        ERROR_HANDLING("Error Handling", "Handle errors that occur during execution", null),
        DATA("Data", "Data nodes are used to create, read, update, delete, and transform data", null),
        CURRENT_INTEGRATION("Current Integration", "Components defined within the current integration",
                List.of("Project", "Local", "Function", "Types", "Data Mapper")),
        CURRENT_WORKSPACE("Within Project", "Components available in the current workspace project",
                List.of("Workspace Project", "Local", "Function", "Types", "Data Mapper")),
        CURRENT_WORKFLOWS("Workflows", "Workflows defined within the current integration",
                List.of("Project", "Local", "Workflow")),
        CURRENT_ACTIVITIES("Activities", "Activities defined within the current integration",
                List.of("Project", "Local", "Activity")),
        AGENT_TOOLS("Agent Tools", "Functions used as agent tools", List.of("Project", "Local", "Function")),
        AGENT_TOOLBOX("Tools", "AI tools usable by the durable agent",
                List.of("Tool", "Agent")),
        AGENT_MCP_TOOLS("MCP Tools", "MCP servers exposing tools to the durable agent",
                List.of("MCP", "Tool", "Agent")),
        CURRENT_ORGANIZATION("Current Organization", "Components in the current organization",
                List.of("Organization", "Function", "Library")),
        STANDARD_LIBRARY("Standard Library", "Components supported officially by Ballerina",
                List.of("Ballerina", "Library")),
        IMPORTED_FUNCTIONS("Imported Functions", "Functions imported from other integrations",
                List.of("Imported", "Function", "Library")),
        IMPORTED_TYPES("Imported Types", "Types imported from other integrations",
                List.of("Imported", "Type", "Library")),
        KNOWLEDGE_BASE("Knowledge Bases",
                "Knowledge bases available in the integration", null),
        MODEL_PROVIDER("Model Providers",
                "Model providers used in the integration to connect to LLMs", null),
        EMBEDDING_PROVIDER("Embedding Providers",
                "Embedding providers used in the integration to connect to embedding models", null),
        VECTOR_STORE("Vector Stores", "Vector stores used in the integration", null),
        DATA_LOADER("Data Loaders", "Data loaders available in the integration", null),
        CHUNKER("Chunkers", "Document chunkers available in the integration", null),
        SHORT_TERM_MEMORY_STORE("Memory Stores", "Short-term memory stores available in the integration", null),
        AI("AI", "AI components available in the flow", null),
        WORKFLOW("Workflow", "Workflow orchestration components", null),
        WORKFLOW_STEPS("Steps", "Durable steps executed by this workflow",
                List.of("Activity", "Human Task", "Sleep", "Data", "Workflow")),
        CHILD_WORKFLOWS("Child Workflows", "Compose child workflows from this workflow",
                List.of("Child", "Workflow", "Composition")),
        WORKFLOW_FUNCTIONS("Workflow Functions", "Utility functions of the workflow context",
                List.of("Utility", "Workflow", "Time", "Replay")),
        BUILTIN_ACTIVITIES("Prebuilt Activities", "Prebuilt activities for common integrations",
                List.of("REST", "SOAP", "Email", "Workflow", "Activity")),
        MORE("More", "Expandable section to view more content", null),
        DIRECT_LLM("Direct LLM", "AI components that connect directly with a large language model", null),
        RAG("RAG", "AI components specific to Retrieval-Augmented Generation workflows", null),
        AGENT("Agent", "Represents an AI Agent within a workflow", null),
        DURABLE_AGENT("Configure Agent",
                "Configure the durable agent's model, tools, and human tasks, then run it",
                List.of("Durable", "Agent", "Workflow"));

        final String name;
        final String description;
        final List<String> keywords;

        Name(String name, String description, List<String> keywords) {
            this.name = name;
            this.description = description;
            this.keywords = keywords;
        }

        /**
         * Returns the display label for this category.
         *
         * @return the category display label
         */
        public String label() {
            return name;
        }
    }

    /**
     * Represents a builder for the category. The builder can build the categories in a nested manner.
     *
     * @since 1.0.0
     */
    public static class Builder {

        private final Builder parentBuilder;
        private final Map<String, Builder> childBuilders;
        private final List<AvailableNode> availableNodes;
        private List<Item> prebuiltItems;
        private Metadata.Builder<Category.Builder> metadataBuilder;

        public Builder(Builder parentBuilder) {
            this.parentBuilder = parentBuilder;
            this.childBuilders = new LinkedHashMap<>();
            this.availableNodes = new ArrayList<>();
        }

        public Builder stepIn(Name childName) {
            Builder builder = this.childBuilders.get(childName.name);
            if (builder == null) {
                builder = new Builder(this).metadata()
                        .label(childName.name)
                        .description(childName.description)
                        .keywords(childName.keywords)
                        .stepOut();
                this.childBuilders.put(childName.name, builder);
            }
            return builder;
        }

        public Builder stepIn(String name, String description, List<String> keywords) {
            Builder builder = this.childBuilders.get(name);
            if (builder == null) {
                builder = new Builder(this).metadata()
                        .label(name)
                        .description(description)
                        .keywords(keywords)
                        .stepOut();
                this.childBuilders.put(name, builder);
            }
            return builder;
        }

        public Builder stepIn(String childName) {
            Builder builder = this.childBuilders.get(childName);
            if (builder == null) {
                builder = new Builder(this).metadata().label(childName).stepOut();
                this.childBuilders.put(childName, builder);
            }
            return builder;
        }

        public Builder stepOut() {
            if (parentBuilder == null) {
                throw new IllegalStateException("Cannot step out of the root category");
            }
            return parentBuilder;
        }

        public Builder node(NodeKind kind) {
            AvailableNode node = NodeBuilder.getNodeFromKind(kind).buildAvailableNode();
            this.availableNodes.add(node);
            return this;
        }

        public Builder node(AvailableNode node) {
            this.availableNodes.add(node);
            return this;
        }

        public Builder items(List<Item> items) {
            this.prebuiltItems = items;
            return this;
        }

        public Metadata.Builder<Category.Builder> metadata() {
            if (this.metadataBuilder == null) {
                this.metadataBuilder = new Metadata.Builder<>(this);
            }
            return this.metadataBuilder;
        }

        public Builder name(Name name) {
            this.metadataBuilder = new Metadata.Builder<>(this)
                    .label(name.name)
                    .description(name.description)
                    .keywords(name.keywords);
            return this;
        }

        public Category build() {
            Metadata newMetadata = this.metadataBuilder != null ? this.metadataBuilder.build() : null;

            // Check if there exist prebuilt items
            if (this.prebuiltItems != null) {
                return new Category(newMetadata, this.prebuiltItems);
            }

            // Check for illegal state where both nodes and categories are present
            if (!this.availableNodes.isEmpty() && !this.childBuilders.isEmpty()) {
                throw new IllegalStateException("A category cannot have both categories and nodes as items");
            }

            List<Item> items = new ArrayList<>();

            // If nodes are present, build them into items
            if (!this.availableNodes.isEmpty()) {
                items.addAll(this.availableNodes);
            } else {
                // If categories are present, build each category and add as items
                this.childBuilders.forEach((key, value) -> items.add(value.build()));
            }

            // Create and return the new category with the built items
            return new Category(newMetadata, items);
        }
    }
}
