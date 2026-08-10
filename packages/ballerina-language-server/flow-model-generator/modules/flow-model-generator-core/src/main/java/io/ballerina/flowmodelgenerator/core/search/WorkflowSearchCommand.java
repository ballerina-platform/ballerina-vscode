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

package io.ballerina.flowmodelgenerator.core.search;

import io.ballerina.compiler.api.symbols.FunctionSymbol;
import io.ballerina.compiler.api.symbols.SymbolKind;
import io.ballerina.flowmodelgenerator.core.Constants;
import io.ballerina.flowmodelgenerator.core.model.AvailableNode;
import io.ballerina.flowmodelgenerator.core.model.Category;
import io.ballerina.flowmodelgenerator.core.model.Codedata;
import io.ballerina.flowmodelgenerator.core.model.Item;
import io.ballerina.flowmodelgenerator.core.model.Metadata;
import io.ballerina.flowmodelgenerator.core.model.NodeKind;
import io.ballerina.flowmodelgenerator.core.utils.WorkflowUtil;
import io.ballerina.modelgenerator.commons.PackageUtil;
import io.ballerina.modelgenerator.commons.SearchResult;
import io.ballerina.projects.Package;
import io.ballerina.projects.Project;
import io.ballerina.tools.text.LineRange;

import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Represents a command to search for workflow process functions within a project.
 * This class extends SearchCommand and provides functionality to search for functions
 * annotated with @workflow:Workflow.
 *
 * <p>The search results include workflow functions from the current project that can be
 * called using workflow:createInstance().</p>
 *
 * @see SearchCommand
 * @since 1.8.0
 */
class WorkflowSearchCommand extends SearchCommand {

    private static final String NODE_KIND_KEY = "nodeKind";

    // The node kind selected items resolve to. The same workflow list serves Run Workflow
    // (default) and the child-workflow nodes, which pass their kind via queryMap["nodeKind"].
    private final NodeKind itemKind;

    public WorkflowSearchCommand(Project project, LineRange position, Map<String, String> queryMap) {
        super(project, position, queryMap);
        String requestedKind = queryMap == null ? null : queryMap.get(NODE_KIND_KEY);
        if (NodeKind.CHILD_WORKFLOW_RUN.name().equals(requestedKind)) {
            this.itemKind = NodeKind.CHILD_WORKFLOW_RUN;
        } else if (NodeKind.CHILD_WORKFLOW_CALL.name().equals(requestedKind)) {
            this.itemKind = NodeKind.CHILD_WORKFLOW_CALL;
        } else {
            this.itemKind = NodeKind.WORKFLOW_RUN;
        }
    }

    @Override
    protected List<Item> defaultView() {
        buildWorkflowNodes();
        return rootBuilder.build().items();
    }

    @Override
    protected List<Item> search() {
        buildWorkflowNodes();
        return rootBuilder.build().items();
    }

    @Override
    protected Map<String, List<SearchResult>> fetchPopularItems() {
        return Map.of();
    }

    /**
     * Builds the list of workflow process functions from the current project.
     */
    private void buildWorkflowNodes() {
        Package currentPackage = project.currentPackage();
        PackageUtil.getCompilation(currentPackage);

        // Get the module information
        String orgName = currentPackage.packageOrg().value();
        String moduleName = currentPackage.packageName().value();
        String version = currentPackage.packageVersion().value().toString();

        // Create the category for current integration workflows
        Category.Builder workflowCategory = rootBuilder.stepIn(Category.Name.CURRENT_WORKFLOWS);

        // Search for functions with @workflow:Workflow annotation in all modules
        currentPackage.modules().forEach(module -> {
            module.getCompilation().getSemanticModel().moduleSymbols().stream()
                    .filter(symbol -> symbol.kind() == SymbolKind.FUNCTION)
                    .map(symbol -> (FunctionSymbol) symbol)
                    .filter(WorkflowUtil::isWorkflowFunction)
                    .filter(funcSymbol -> matchesQuery(funcSymbol.getName().orElse("")))
                    .forEach(funcSymbol -> {
                        String funcName = funcSymbol.getName().orElse("");
                        String description = funcSymbol.documentation()
                                .flatMap(doc -> doc.description())
                                .orElse("Workflow process function");

                        Codedata codedata = new Codedata.Builder<>(null)
                                .node(itemKind)
                                .org(orgName)
                                .module(moduleName)
                                .symbol(funcName)
                                .version(version)
                                .build();

                        Metadata metadata = new Metadata.Builder<>(null)
                                .label(funcName)
                                .description(description)
                                .build();

                        AvailableNode node = new AvailableNode(metadata, codedata, true);
                        workflowCategory.node(node);
                    });

            // Durable agentic workflows list in the same category as the workflow functions
            // (one startable list, distinguished by icon), for the Run Workflow node only:
            // selecting one generates `agent.run(...)` instead of `workflow:run(...)`.
            if (itemKind != NodeKind.WORKFLOW_RUN) {
                return;
            }
            module.getCompilation().getSemanticModel().moduleSymbols().stream()
                    .filter(symbol -> symbol.kind() == SymbolKind.VARIABLE)
                    .filter(WorkflowUtil::isDurableAgentVariable)
                    .filter(symbol -> matchesQuery(symbol.getName().orElse("")))
                    .forEach(symbol -> {
                        String agentName = symbol.getName().orElse("");

                        Codedata codedata = new Codedata.Builder<>(null)
                                .node(NodeKind.WORKFLOW_RUN)
                                .org(orgName)
                                .module(moduleName)
                                .symbol(agentName)
                                .object(Constants.Workflow.DURABLE_AGENT_OBJECT_CLASS_NAME)
                                .version(version)
                                .build();

                        Metadata metadata = new Metadata.Builder<>(null)
                                .label(agentName)
                                .description("Durable agentic workflow")
                                .icon("bi-ai-agent")
                                .build();

                        workflowCategory.node(new AvailableNode(metadata, codedata, true));
                    });
        });
    }

    /**
     * Checks if the function name matches the search query.
     *
     * @param funcName The function name to check
     * @return true if it matches the query or query is empty, false otherwise
     */
    private boolean matchesQuery(String funcName) {
        if (query == null || query.isEmpty()) {
            return true;
        }
        return funcName.toLowerCase(Locale.ROOT).contains(query.toLowerCase(Locale.ROOT));
    }
}

