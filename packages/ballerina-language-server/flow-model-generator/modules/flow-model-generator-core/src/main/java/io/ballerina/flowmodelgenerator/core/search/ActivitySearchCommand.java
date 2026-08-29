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

import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.api.symbols.FunctionSymbol;
import io.ballerina.compiler.api.symbols.SymbolKind;
import io.ballerina.flowmodelgenerator.core.model.AvailableNode;
import io.ballerina.flowmodelgenerator.core.model.Category;
import io.ballerina.flowmodelgenerator.core.model.Codedata;
import io.ballerina.flowmodelgenerator.core.model.Item;
import io.ballerina.flowmodelgenerator.core.model.Metadata;
import io.ballerina.flowmodelgenerator.core.model.NodeKind;
import io.ballerina.flowmodelgenerator.core.utils.WorkflowUtil;
import io.ballerina.modelgenerator.commons.PackageUtil;
import io.ballerina.modelgenerator.commons.SearchResult;
import io.ballerina.projects.Module;
import io.ballerina.projects.Package;
import io.ballerina.projects.Project;
import io.ballerina.tools.text.LineRange;

import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.logging.Level;
import java.util.logging.Logger;

import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.ACTIVITY_MODULE;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.BUILTIN_EMAIL_DESCRIPTION;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.BUILTIN_EMAIL_FUNCTION;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.BUILTIN_EMAIL_LABEL;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.BUILTIN_REST_DESCRIPTION;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.BUILTIN_REST_FUNCTION;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.BUILTIN_REST_LABEL;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.BUILTIN_SOAP_DESCRIPTION;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.BUILTIN_SOAP_FUNCTION;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.BUILTIN_SOAP_LABEL;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.WORKFLOW_ORG;

/**
 * Represents a command to search for workflow activity functions within a project.
 * This class extends SearchCommand and provides functionality to search for functions
 * annotated with @workflow:Activity.
 *
 * <p>The search results include activity functions from the current project that can be
 * called using ctx->callActivity().</p>
 *
 * @see SearchCommand
 * @since 1.8.0
 */
class ActivitySearchCommand extends SearchCommand {

    private static final Logger LOGGER = Logger.getLogger(ActivitySearchCommand.class.getName());

    // Durable agents reuse this search as their single "Add Tool/Activity" list: selected
    // activities become `activities` entries of the agent declaration, and the list additionally
    // offers the project's AI tools (@ai:AgentTool functions, ai toolkit variables) and an MCP
    // server entry. Builtin (prebuilt) activities are workflow-only.
    private static final String EXCLUDE_BUILTINS_KEY = "excludeBuiltins";
    private static final String NODE_KIND_KEY = "nodeKind";

    private static final String MCP_SERVER_LABEL = "Use MCP Server";

    private final boolean excludeBuiltins;
    private final NodeKind itemNodeKind;

    public ActivitySearchCommand(Project project, LineRange position, Map<String, String> queryMap) {
        super(project, position, queryMap);
        this.excludeBuiltins = queryMap != null && "true".equals(queryMap.get(EXCLUDE_BUILTINS_KEY));
        NodeKind kind = NodeKind.ACTIVITY_CALL;
        if (queryMap != null && queryMap.get(NODE_KIND_KEY) != null) {
            try {
                kind = NodeKind.valueOf(queryMap.get(NODE_KIND_KEY));
            } catch (IllegalArgumentException e) {
                // Unknown node kind in the query — keep the default.
            }
        }
        this.itemNodeKind = kind;
    }

    @Override
    protected List<Item> defaultView() {
        buildActivityNodes();
        return rootBuilder.build().items();
    }

    @Override
    protected List<Item> search() {
        buildActivityNodes();
        return rootBuilder.build().items();
    }

    @Override
    protected Map<String, List<SearchResult>> fetchPopularItems() {
        return Map.of();
    }

    /**
     * Builds the list of activity functions from the current project.
     */
    private void buildActivityNodes() {
        Package currentPackage = project.currentPackage();
        PackageUtil.getCompilation(currentPackage);

        // Get the module information
        String orgName = currentPackage.packageOrg().value();
        String moduleName = currentPackage.packageName().value();
        String version = currentPackage.packageVersion().value().toString();

        // Create the category for current integration activities
        Category.Builder activityCategory = rootBuilder.stepIn(Category.Name.CURRENT_ACTIVITIES);

        // Search for functions with @workflow:Activity annotation in all modules. A module whose
        // compilation fails (e.g. an unresolvable dependency pinned in Dependencies.toml) is skipped
        // so the rest of the list — including the prebuilt activities — still renders.
        currentPackage.modules().forEach(module -> {
            SemanticModel semanticModel = semanticModelOf(currentPackage, module);
            if (semanticModel == null) {
                return;
            }
            semanticModel.moduleSymbols().stream()
                    .filter(symbol -> symbol.kind() == SymbolKind.FUNCTION)
                    .map(symbol -> (FunctionSymbol) symbol)
                    .filter(WorkflowUtil::isActivityFunction)
                    .filter(funcSymbol -> matchesQuery(funcSymbol.getName().orElse("")))
                    .forEach(funcSymbol -> {
                        String funcName = funcSymbol.getName().orElse("");
                        String description = funcSymbol.documentation()
                                .flatMap(doc -> doc.description())
                                .orElse("Workflow activity function");

                        Codedata codedata = new Codedata.Builder<>(null)
                                .node(itemNodeKind)
                                .org(orgName)
                                .module(moduleName)
                                .symbol(funcName)
                                .version(version)
                                .build();

                        Metadata metadata = new Metadata.Builder<>(null)
                                .label(funcName)
                                .description(description)
                                .icon(itemNodeKind == NodeKind.DURABLE_AGENT_ADD_ACTIVITY ? "bi-task" : null)
                                .build();

                        activityCategory.node(new AvailableNode(metadata, codedata, true));
                    });
        });

        if (itemNodeKind == NodeKind.DURABLE_AGENT_ADD_ACTIVITY) {
            // Builtin (prebuilt) activities are workflow-only for now. Their client can be bound
            // at registration like any other, but they also take arguments the model cannot
            // supply either — callRestAPI's message accepts an http:Request — so the agent needs
            // a data-only view of them. Tracked separately; a connection-based activity written
            // through the "Create Activity from a Connection" wizard is data-only apart from its
            // client and registers here today.
            buildAgentToolNodes(currentPackage, orgName, moduleName, version);
            return;
        }

        // Add prebuilt activities section
        if (excludeBuiltins) {
            return;
        }
        Category.Builder builtinCategory = rootBuilder.stepIn(Category.Name.BUILTIN_ACTIVITIES);
        addBuiltinNode(builtinCategory, BUILTIN_REST_LABEL, BUILTIN_REST_DESCRIPTION, BUILTIN_REST_FUNCTION);
        addBuiltinNode(builtinCategory, BUILTIN_SOAP_LABEL, BUILTIN_SOAP_DESCRIPTION, BUILTIN_SOAP_FUNCTION);
        addBuiltinNode(builtinCategory, BUILTIN_EMAIL_LABEL, BUILTIN_EMAIL_DESCRIPTION, BUILTIN_EMAIL_FUNCTION);
    }

    /**
     * Resolves a module's semantic model, retrying once through a fresh package compilation.
     *
     * <p>Right after a write the designer issues two searches at once, and a module compiled
     * concurrently with the reload that write triggers can fail. Skipping on that first failure
     * makes the search answer "this project defines no activities", which blanks the list the
     * user is looking at — indistinguishable from a project that genuinely has none. A module
     * that is actually broken fails the retry too and is still skipped, so the rest of the list
     * (including the prebuilt activities) renders.
     */
    private static SemanticModel semanticModelOf(Package currentPackage, Module module) {
        try {
            return module.getCompilation().getSemanticModel();
        } catch (RuntimeException firstAttempt) {
            try {
                PackageUtil.getCompilation(currentPackage);
                return module.getCompilation().getSemanticModel();
            } catch (RuntimeException secondAttempt) {
                LOGGER.log(Level.WARNING, "Skipping module '" + module.moduleName().toString()
                        + "' from the activity search: compilation failed on retry", secondAttempt);
                return null;
            }
        }
    }

    // The tool sections of the durable agent's Add Tool/Activity list. MCP Tools leads with
    // the creation wizard and lists the project's toolkit variables; Tools lists the
    // project's @ai:AgentTool functions. Both resolve selections to the register-tool form.
    private void buildAgentToolNodes(Package currentPackage, String orgName, String moduleName, String version) {
        Category.Builder mcpCategory = rootBuilder.stepIn(Category.Name.AGENT_MCP_TOOLS);
        if (matchesQuery(MCP_SERVER_LABEL)) {
            Codedata mcpCodedata = new Codedata.Builder<>(null)
                    .node(NodeKind.MCP_TOOL_KIT)
                    .build();
            Metadata mcpMetadata = new Metadata.Builder<>(null)
                    .label(MCP_SERVER_LABEL)
                    .description("Connect to an MCP server and expose its tools to the agent")
                    .icon("bi-plus")
                    .build();
            mcpCategory.node(new AvailableNode(mcpMetadata, mcpCodedata, true));
        }
        Category.Builder toolsCategory = rootBuilder.stepIn(Category.Name.AGENT_TOOLBOX);
        currentPackage.modules().forEach(module -> {
            // Same retry as the activity list above: a module compiled concurrently with the
            // reload a write triggers can fail once, and skipping on that first failure blanks
            // the tool list the user is looking at.
            SemanticModel semanticModel = semanticModelOf(currentPackage, module);
            if (semanticModel == null) {
                return;
            }
            semanticModel.moduleSymbols().stream()
                    .filter(symbol -> WorkflowUtil.isAiAgentToolFunction(symbol)
                            || WorkflowUtil.isAiToolKitVariable(symbol))
                    .filter(symbol -> matchesQuery(symbol.getName().orElse("")))
                    .forEach(symbol -> {
                        String name = symbol.getName().orElse("");
                        boolean isToolKit = WorkflowUtil.isAiToolKitVariable(symbol);
                        Codedata codedata = new Codedata.Builder<>(null)
                                .node(NodeKind.DURABLE_AGENT_REGISTER_TOOL)
                                .org(orgName)
                                .module(moduleName)
                                .symbol(name)
                                .version(version)
                                .build();
                        Metadata metadata = new Metadata.Builder<>(null)
                                .label(name)
                                .description(isToolKit
                                        ? "MCP toolkit available in the integration"
                                        : "Agent tool function in the integration")
                                .icon(isToolKit ? "bi-mcp" : "bi-function")
                                .build();
                        (isToolKit ? mcpCategory : toolsCategory)
                                .node(new AvailableNode(metadata, codedata, true));
                    });
        });
    }

    private void addBuiltinNode(Category.Builder category, String label, String description, String symbol) {
        if (!matchesQuery(label)) {
            return;
        }
        Codedata codedata = new Codedata.Builder<>(null)
                .node(NodeKind.BUILTIN_ACTIVITY)
                .org(WORKFLOW_ORG)
                .module(ACTIVITY_MODULE)
                .symbol(symbol)
                .build();
        Metadata metadata = new Metadata.Builder<>(null)
                .label(label)
                .description(description)
                .build();
        category.node(new AvailableNode(metadata, codedata, true));
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
