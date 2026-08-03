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
import io.ballerina.projects.Package;
import io.ballerina.projects.Project;
import io.ballerina.tools.text.LineRange;

import java.util.List;
import java.util.Locale;
import java.util.Map;

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

    public ActivitySearchCommand(Project project, LineRange position, Map<String, String> queryMap) {
        super(project, position, queryMap);
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
            SemanticModel semanticModel;
            try {
                semanticModel = module.getCompilation().getSemanticModel();
            } catch (RuntimeException e) {
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
                                .node(NodeKind.ACTIVITY_CALL)
                                .org(orgName)
                                .module(moduleName)
                                .symbol(funcName)
                                .version(version)
                                .build();

                        Metadata metadata = new Metadata.Builder<>(null)
                                .label(funcName)
                                .description(description)
                                .build();

                        activityCategory.node(new AvailableNode(metadata, codedata, true));
                    });
        });

        // Add prebuilt activities section
        Category.Builder builtinCategory = rootBuilder.stepIn(Category.Name.BUILTIN_ACTIVITIES);
        addBuiltinNode(builtinCategory, BUILTIN_REST_LABEL, BUILTIN_REST_DESCRIPTION, BUILTIN_REST_FUNCTION);
        addBuiltinNode(builtinCategory, BUILTIN_SOAP_LABEL, BUILTIN_SOAP_DESCRIPTION, BUILTIN_SOAP_FUNCTION);
        addBuiltinNode(builtinCategory, BUILTIN_EMAIL_LABEL, BUILTIN_EMAIL_DESCRIPTION, BUILTIN_EMAIL_FUNCTION);
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
